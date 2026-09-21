import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { FlowingerContext, useFlowingerStore, useNodesInitialized } from './context.ts';
import { EdgeLabelHost } from './EdgeLabelRenderer.tsx';
import { warnAboutIgnoredProps } from './devWarnings.ts';
import { resolveFeatures, type Feature } from './features.ts';
import { ViewportPortalHost } from './ViewportPortal.tsx';
import { FlowingerEdges } from './FlowingerEdges.tsx';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect.ts';
import { FlowingerProvider } from './FlowingerProvider.tsx';
import { NodeWrapper } from './NodeWrapper.tsx';
import { treeInfo } from './parents.ts';
import { viewportTransform } from './store.ts';
import {
  DRAG_THRESHOLD,
  capturePointer,
  distance,
  isInteractive,
  midpoint,
  pinchViewport,
  releasePointer,
  type PinchStart,
} from './pointer.ts';
import type {
  Edge,
  FlowingerProps,
  Node,
  NodeProps,
  Viewport,
  XYPosition,
} from './types.ts';

const NO_FEATURES: readonly Feature[] = [];
const NO_NODES: Node[] = [];
const NO_EDGES: Edge[] = [];

// Inline styles reading `--flowinger-*` custom properties (with fallbacks), so
// the default node needs no stylesheet and themes from any ancestor. Give a node
// its own component via `nodeTypes` for anything more than a placeholder.
const defaultNodeStyle: CSSProperties = {
  padding: 12,
  borderRadius: 'var(--flowinger-radius, 6px)',
  border: '1px solid var(--flowinger-border, #334155)',
  background: 'var(--flowinger-surface, #1e293b)',
  color: 'var(--flowinger-text, #e2e8f0)',
};

function DefaultNodeView({ id, data, selected }: NodeProps) {
  return (
    <div
      style={
        selected
          ? { ...defaultNodeStyle, borderColor: 'var(--flowinger-selected, #38bdf8)' }
          : defaultNodeStyle
      }
    >
      <div style={{ fontWeight: 600 }}>{id}</div>
      {'label' in data && (
        <div style={{ fontSize: '0.875em', color: 'var(--flowinger-text-dim, #94a3b8)' }}>
          {String(data.label)}
        </div>
      )}
    </div>
  );
}

/** How long a double-click zoom takes. */
const DOUBLE_CLICK_ZOOM_MS = 200;

/** Above the edge labels too. */
const VIEWPORT_PORTAL_Z = 10001;

/** Above every node — even one being dragged (1000) or given a large `zIndex` of its own. */
const EDGE_LABEL_LAYER_Z = 10000;

/** How long the wheel is still before a move by it is over. */
const WHEEL_QUIET_MS = 150;

/** Wheel deltas arrive in pixels, lines or pages depending on device and browser. */
const WHEEL_PIXELS_PER_UNIT = [1, 20, 400] as const;

/** How far an arrow key pans, in screen pixels; Shift takes larger steps. */
const KEY_PAN_STEP = 50;
const KEY_PAN_STEP_LARGE = 200;

interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  viewport: Viewport;
  active: boolean;
}

function InnerCanvas(props: FlowingerProps) {
  const {
    features = NO_FEATURES,
    nodes: nodesProp,
    edges: edgesProp,
    onNodesChange,
    onEdgesChange,
    nodeTypes = {},
    edgeTypes,
    minZoom = 0.05,
    maxZoom = 2,
    nodesDraggable = false,
    panOnDrag = true,
    selectionOnDrag = false,
    panOnScroll = false,
    panOnScrollSpeed = 0.5,
    zoomOnScroll = true,
    zoomOnDoubleClick = true,
    autoPanOnNodeDrag = true,
    autoPanOnConnect = true,
    autoPanSpeed = 15,
    connectionLineType,
    connectionLineStyle,
    connectionLineComponent,
    zoomOnPinch = true,
    elementsSelectable = false,
    nodesConnectable = false,
    translateExtent,
    connectionMode = 'strict',
    edgesFocusable = true,
    onlyRenderVisibleElements = false,
    fitView = false,
    fitViewOptions,
    defaultEdgeOptions,
    nodeExtent,
    snapToGrid = false,
    snapGrid,
    keyboardNavigation = false,
    ariaLabel = 'Diagram',
    className = '',
    style = {},
    children,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    onNodeClick,
    onPaneClick,
    onSelectionChange,
    onConnect,
    onConnectStart,
    onConnectEnd,
    onReconnect,
    onReconnectStart,
    onReconnectEnd,
    edgesReconnectable = true,
    onEdgeClick,
    onBeforeDelete,
    onNodesDelete,
    onEdgesDelete,
    onDelete,
    isValidConnection,
    onInit,
    defaultViewport,
    onMove,
    onMoveStart,
    onMoveEnd,
  } = props;
  const store = useFlowingerStore();
  // Installed while rendering, so they are there for every effect below and for whoever holds the
  // instance; installing is idempotent, so a render that is discarded or repeated does no harm.
  // Read once: a feature is not something a canvas gains or loses.
  const [feats] = useState(() => {
    store.use(features);
    return resolveFeatures(features);
  });
  // What a canvas is given when it mounts is what it is judged by. The condition is a constant to a
  // production bundle, which then drops the check and the table behind it.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') warnAboutIgnoredProps(props, feats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `defaultEdgeOptions` is compared by value, so `{ animated: true }` written
  // inline does not remake every edge on every render.
  const edgeDefaultsKey = defaultEdgeOptions === undefined ? undefined : JSON.stringify(defaultEdgeOptions);
  const edgeDefaults = useMemo(
    () => (edgeDefaultsKey === undefined ? undefined : (JSON.parse(edgeDefaultsKey) as Partial<Edge>)),
    [edgeDefaultsKey],
  );
  const nodes = nodesProp ?? NO_NODES;
  const givenEdges = edgesProp ?? NO_EDGES;
  const edges = useMemo(
    () => (edgeDefaults ? givenEdges.map((e) => ({ ...edgeDefaults, ...e })) : givenEdges),
    [givenEdges, edgeDefaults],
  );
  // The flow is controlled — changes are reported, not done — when someone is listening.
  const nodesChange = onNodesChange;
  const edgesChange = onEdgesChange;

  const containerRef = useRef<HTMLDivElement | null>(null);
  // The layer an edge's HTML labels portal into; state, so they render once it exists.
  const [labelHost, setLabelHost] = useState<HTMLElement | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pan = useRef<PanState | null>(null);
  /** Every pointer currently down, so a second finger can be told from a click. */
  const pointers = useRef(new Map<number, XYPosition>());
  const pinch = useRef<PinchStart | null>(null);
  /** A pan just ended: the click that follows it is not a click on the canvas. */
  const justPanned = useRef(false);
  // What each feature adds to the canvas's own handlers, in the order they were given.
  const suppressPaneClick = useCallback(() => {
    justPanned.current = true;
  }, []);
  const bits = feats.flatMap((f) => f.useCanvas?.({ store, props, suppressPaneClick }) ?? []);
  // Selecting needs a feature that acts on it. Given that, a node or edge is selectable where it says so itself,
  // else where the canvas allows it (`elementsSelectable`).
  const canSelect = bits.some((b) => b.selectable === true);
  const selectable = elementsSelectable && canSelect;

  // Layout effects, not passive ones: a parent's passive effect (one that
  // frames the diagram, say) runs after these, and must find the canvas
  // attached, the zoom limits set and the nodes registered.
  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    const viewport = viewportRef.current;
    if (!container || !viewport) return;
    store.attach(viewport, container);
    return () => {
      store.detach();
    };
  }, [store]);

  useIsomorphicLayoutEffect(() => {
    store.setBounds(minZoom, maxZoom, translateExtent ?? null);
  }, [store, minZoom, maxZoom, translateExtent]);

  // A canvas that made its own store started there already; one inside a caller's provider is moved to it.
  useIsomorphicLayoutEffect(() => {
    const at = store.getViewport();
    if (defaultViewport && (at.x !== defaultViewport.x || at.y !== defaultViewport.y || at.zoom !== defaultViewport.zoom)) {
      void store.instance.setViewport(defaultViewport);
    }
    // Once: it is where the canvas starts, not where it is kept.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // Callbacks and options first: whether the flow is controlled is decided by
  // them, and the nodes below are read in that light.
  const [gridX, gridY] = snapGrid ?? [15, 15];
  useIsomorphicLayoutEffect(() => {
    store.setOptions({
      nodesDraggable,
      elementsSelectable,
      snapGrid: snapToGrid ? [gridX, gridY] : null,
      nodeExtent: nodeExtent ?? null,
      connectionMode,
      onlyRenderVisibleElements,
      autoPanOnNodeDrag,
      autoPanOnConnect,
      autoPanSpeed,
    });
  }, [
    store,
    nodesDraggable,
    elementsSelectable,
    snapToGrid,
    gridX,
    gridY,
    nodeExtent,
    connectionMode,
    onlyRenderVisibleElements,
    autoPanOnNodeDrag,
    autoPanOnConnect,
    autoPanSpeed,
  ]);

  // Nesting, read from the nodes as given: where each one's parent sits, how deep
  // it is, and what is hidden along with a hidden parent.
  const tree = useMemo(() => treeInfo(nodes), [nodes]);
  // With `onlyRenderVisibleElements`: what is in view. Null (everything) otherwise, and on the server.
  const visible = useSyncExternalStore(store.subscribeVisible, store.getVisible, () => null);


  useIsomorphicLayoutEffect(() => {
    store.setCallbacks({
      onNodesChange: nodesChange,
      onEdgesChange: edgesChange,
      onNodeDragStart,
      onNodeDrag,
      onNodeDragStop,
      onNodeClick,
      onSelectionChange,
      onConnect,
      onConnectStart,
      onConnectEnd,
      onReconnect,
      onReconnectStart,
      onReconnectEnd,
      onEdgeClick,
      onBeforeDelete,
      onNodesDelete,
      onEdgesDelete,
      onDelete,
      isValidConnection,
      onMove,
      onMoveStart,
      onMoveEnd,
    });
  }, [
    store,
    nodesChange,
    edgesChange,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    onNodeClick,
    onSelectionChange,
    onConnect,
    onConnectStart,
    onConnectEnd,
    onReconnect,
    onReconnectStart,
    onReconnectEnd,
    onEdgeClick,
    onBeforeDelete,
    onNodesDelete,
    onEdgesDelete,
    onDelete,
    isValidConnection,
    onMove,
    onMoveStart,
    onMoveEnd,
  ]);

  useIsomorphicLayoutEffect(() => {
    store.setNodes(nodes);
  }, [store, nodes]);

  useIsomorphicLayoutEffect(() => {
    store.setEdges(edges);
  }, [store, edges]);

  // Once, when every node has a size: before that there is nothing to frame. After
  // `setNodes` above, so it frames the nodes it is given, not the ones before them.
  const nodesInitialized = useNodesInitialized();
  const fitted = useRef(false);
  useIsomorphicLayoutEffect(() => {
    if (!fitView || !nodesInitialized || fitted.current) return;
    fitted.current = true;
    void store.fitView(fitViewOptions);
  }, [store, fitView, fitViewOptions, nodesInitialized]);

  const onInitRef = useRef(onInit);
  useEffect(() => {
    onInitRef.current = onInit;
  });
  useEffect(() => {
    onInitRef.current?.(store.instance);
  }, [store]);

  // Wheel: zoom, or — with `panOnScroll` — pan. A native listener: React
  // registers `wheel` as passive, and a passive listener cannot stop the page
  // scrolling underneath.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || (!zoomOnScroll && !panOnScroll)) return;
    const onWheel = (e: WheelEvent) => {
      // Something inside that scrolls, or zooms, for itself: `nowheel` lets the wheel through to it.
      if (e.target instanceof Element && e.target.closest('.nowheel')) return;
      const unit = WHEEL_PIXELS_PER_UNIT[e.deltaMode as 0 | 1 | 2];
      // A trackpad pinch arrives as ctrl+wheel with small deltas.
      const zooming = panOnScroll ? e.ctrlKey || e.metaKey : true;
      if (zooming && !zoomOnScroll) return;
      e.preventDefault();
      // A run of ticks is one move; it ends when the wheel goes quiet.
      store.beginGesture(e, WHEEL_QUIET_MS);
      if (zooming) {
        const rect = container.getBoundingClientRect();
        const factor = 2 ** (-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.002));
        store.zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
        return;
      }
      const vp = store.getViewport();
      void store.instance.setViewport({
        x: vp.x - e.deltaX * unit * panOnScrollSpeed,
        y: vp.y - e.deltaY * unit * panOnScrollSpeed,
        zoom: vp.zoom,
      });
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, [store, zoomOnScroll, panOnScroll, panOnScrollSpeed]);

  const canPan = (button: number): boolean =>
    Array.isArray(panOnDrag) ? panOnDrag.includes(button) : panOnDrag && (button === 0 || button === 1);

  /** The pointers' midpoint and spread, in container pixels — the pinch's two numbers. */
  const fingers = (container: HTMLElement): { mid: XYPosition; dist: number } | null => {
    if (pointers.current.size !== 2) return null;
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return null;
    const rect = container.getBoundingClientRect();
    const local = (p: XYPosition): XYPosition => ({ x: p.x - rect.left, y: p.y - rect.top });
    return { mid: midpoint(local(a), local(b)), dist: distance(a, b) };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    justPanned.current = false;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (zoomOnPinch && pointers.current.size === 2) {
      // A second finger turns whatever the first was doing into a pinch.
      const now = fingers(e.currentTarget);
      if (now) {
        pan.current = null;
        pinch.current = { viewport: store.getViewport(), ...now };
        store.beginGesture(e.nativeEvent);
        capturePointer(e.currentTarget, e.pointerId);
        return;
      }
    }
    // A feature may take the press — a selection box — before it becomes a pan.
    if (bits.some((b) => b.onPointerDown?.(e))) return;
    if (!canPan(e.button) || isInteractive(e.target)) return;
    pan.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      viewport: store.getViewport(),
      active: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const start = pinch.current;
    if (start) {
      const now = fingers(e.currentTarget);
      if (now) {
        store.beginGesture(e.nativeEvent);
        store.instance.setViewport(pinchViewport(start, now.mid, now.dist, minZoom, maxZoom));
      }
      return;
    }

    if (bits.some((b) => b.onPointerMove?.(e))) return;

    const p = pan.current;
    if (p?.pointerId !== e.pointerId) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (!p.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      p.active = true;
      justPanned.current = true;
      capturePointer(e.currentTarget, e.pointerId);
      e.currentTarget.style.cursor = 'grabbing';
    }
    // The move carries the event that last moved it.
    store.beginGesture(e.nativeEvent);
    store.instance.setViewport({
      x: p.viewport.x + dx,
      y: p.viewport.y + dy,
      zoom: p.viewport.zoom,
    });
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    // One finger left is not a pinch — and does not carry on as a pan either;
    // it would jump. A fresh touch starts one.
    if (pointers.current.size < 2 && pinch.current) {
      pinch.current = null;
      store.endGesture(e.nativeEvent);
    }

    if (bits.some((b) => b.onPointerEnd?.(e))) return;

    const p = pan.current;
    if (p?.pointerId !== e.pointerId) return;
    pan.current = null;
    if (!p.active) return;
    releasePointer(e.currentTarget, e.pointerId);
    e.currentTarget.style.cursor = panOnDrag ? 'grab' : '';
    store.endGesture(e.nativeEvent);
  };

  // Pointer capture retargets the click that ends a pan onto the canvas, so a
  // pan would otherwise deselect everything. Only a click on the bare canvas —
  // not on a node, an overlay, or a control — counts.
  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (justPanned.current) {
      justPanned.current = false;
      return;
    }
    if (e.target !== e.currentTarget) return;
    onPaneClick?.(e);
    for (const b of bits) b.onPaneClick?.(e);
  };

  // A double click on the bare canvas zooms in about the pointer; with Shift, out.
  const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!zoomOnDoubleClick || e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    void store.zoomAt(e.shiftKey ? 0.5 : 2, e.clientX - rect.left, e.clientY - rect.top, {
      duration: DOUBLE_CLICK_ZOOM_MS,
    });
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // A feature may take the key from anywhere inside — a focused node or edge as well as the canvas.
    if (bits.some((b) => b.onKeyDown?.(e))) return;
    // The rest is for the canvas itself: a key pressed inside a node (a text
    // field, a button) is that node's, not ours.
    if (!keyboardNavigation) return;
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    const step = e.shiftKey ? KEY_PAN_STEP_LARGE : KEY_PAN_STEP;
    const vp = store.getViewport();
    // Arrow keys move the view the way they scroll a page: Right looks further
    // right, so the content slides left.
    switch (e.key) {
      case 'ArrowLeft':
        store.instance.setViewport({ ...vp, x: vp.x + step });
        break;
      case 'ArrowRight':
        store.instance.setViewport({ ...vp, x: vp.x - step });
        break;
      case 'ArrowUp':
        store.instance.setViewport({ ...vp, y: vp.y + step });
        break;
      case 'ArrowDown':
        store.instance.setViewport({ ...vp, y: vp.y - step });
        break;
      case '+':
      case '=':
        store.instance.zoomIn();
        break;
      case '-':
      case '_':
        store.instance.zoomOut();
        break;
      case '0':
        store.instance.fitView();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  // Focusable, but not a tab stop, so a click on empty canvas leaves focus somewhere a key reaches.
  const focusableForKeys = !keyboardNavigation && bits.some((b) => b.focusable);

  const containerStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    userSelect: 'none',
    touchAction: 'none',
    ...(focusableForKeys ? { outline: 'none' } : {}),
    ...(panOnDrag && !selectionOnDrag ? { cursor: 'grab' } : {}),
    ...Object.assign({}, ...bits.map((b) => b.style)),
    ...style,
  };

  return (
    <ViewportPortalHost.Provider value={portalHost}>
      <div
        {...Object.assign({}, ...bits.map((b) => b.props))}
        ref={containerRef}
        className={`flowinger react-flow ${className}`}
        style={containerStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        {...(keyboardNavigation
          ? { tabIndex: 0, role: 'group', 'aria-label': ariaLabel }
          : focusableForKeys
            ? { tabIndex: -1 }
            : {})}
      >
        {/* Fixed layers — a <Background> — that follow the viewport themselves. */}
        {children}
        {feats.map((f) => (f.Layer ? <f.Layer key={f.name} /> : null))}

        {/* The layer the viewport transform is written to. */}
        <div
          ref={viewportRef}
          className="flowinger-viewport react-flow__viewport"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            transformOrigin: '0 0',
            pointerEvents: 'none',
            // In the markup from the first paint, so server-rendered output is
            // already framed. After that the store writes it straight to the
            // DOM; this re-reads the same value, so a re-render agrees with it.
            transform: viewportTransform(store.getViewport()),
          }}
        >
          <EdgeLabelHost.Provider value={labelHost}>
            <FlowingerEdges
              edges={edges}
              nodes={nodes}
              edgeTypes={edgeTypes}
              elementsSelectable={selectable}
              selectionActs={canSelect}
              edgesFocusable={edgesFocusable}
              interactive={onEdgeClick !== undefined || bits.some((b) => b.edgesInteractive === true)}
              controlledSelection={edgesChange !== undefined}
              hiddenNodeIds={tree.hidden}
              visibleEdgeIds={visible?.edges}
              connectionLineType={connectionLineType}
              connectionLineStyle={connectionLineStyle}
              connectionLineComponent={connectionLineComponent}
              reconnectable={edgesReconnectable && onReconnect !== undefined}
              depths={tree.depth}
              features={feats}
            />
          </EdgeLabelHost.Provider>
          {/* Your own elements, in graph space: `ViewportPortal` draws into this. */}
          <div
            ref={setPortalHost}
            className="flowinger-viewport-portal react-flow__viewport-portal"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: VIEWPORT_PORTAL_Z,
            }}
          />
          {/* Above the edges and the nodes — a label is there to be read and clicked, and a
              node under it would take the click. Takes no events of its own. */}
          <div
            ref={setLabelHost}
            className="flowinger-edge-labels react-flow__edgelabel-renderer"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              userSelect: 'none',
              zIndex: EDGE_LABEL_LAYER_Z,
            }}
          />

          <div className="flowinger-nodes react-flow__nodes" style={{ pointerEvents: 'none' }}>
            {nodes
              .filter((node) => !tree.hidden.has(node.id) && (!visible || visible.nodes.has(node.id)))
              .map((node) => (
              <NodeWrapper
                key={node.id}
                node={node}
                // A component is chosen by string at runtime, so its `data` type
                // cannot be checked here; `NodeTypes` accepts any.
                View={((node.type && nodeTypes[node.type]) ?? DefaultNodeView) as ComponentType<NodeProps>}
                draggable={node.draggable ?? nodesDraggable}
                selectable={canSelect && (node.selectable ?? elementsSelectable)}
                connectable={node.connectable ?? nodesConnectable}
                controlledSelection={nodesChange !== undefined}
                parentX={tree.origin.get(node.id)?.x ?? 0}
                parentY={tree.origin.get(node.id)?.y ?? 0}
                depth={tree.depth.get(node.id) ?? 0}
                features={feats}
              />
            ))}
          </div>
        </div>
      </div>
    </ViewportPortalHost.Provider>
  );
}

/**
 * The canvas with only the features it is given (`features`): panning and zooming, nodes, edges and
 * handles, selection and the viewport calls are always there.
 */
export function FlowingerCore(props: FlowingerProps) {
  // Inside a <FlowingerProvider> the caller owns the state (a toolbar elsewhere
  // in the tree can then drive the viewport); otherwise make one.
  if (useContext(FlowingerContext)) return <InnerCanvas {...props} />;
  return (
    <FlowingerProvider initialViewport={props.defaultViewport} minZoom={props.minZoom} maxZoom={props.maxZoom}>
      <InnerCanvas {...props} />
    </FlowingerProvider>
  );
}
