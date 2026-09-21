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
import { applyEdgeChanges, applyNodeChanges } from './changes.ts';
import { FlowingerContext, useFlowingerStore, useNodesInitialized } from './context.ts';
import { EdgeLabelHost } from './EdgeLabelRenderer.tsx';
import { ViewportPortalHost } from './ViewportPortal.tsx';
import { FlowingerEdges } from './FlowingerEdges.tsx';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect.ts';
import { FlowingerProvider } from './FlowingerProvider.tsx';
import { NodeWrapper } from './NodeWrapper.tsx';
import { treeInfo } from './parents.ts';
import { SelectionBox } from './SelectionBox.tsx';
import { viewportTransform } from './store.ts';
import {
  DRAG_THRESHOLD,
  capturePointer,
  distance,
  isEditable,
  isInteractive,
  midpoint,
  pinchViewport,
  releasePointer,
  type PinchStart,
} from './pointer.ts';
import type {
  Edge,
  EdgeChange,
  FlowingerProps,
  Node,
  NodeChange,
  NodeProps,
  Viewport,
  XYPosition,
} from './types.ts';

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

/** Wheel deltas arrive in pixels, lines or pages depending on device and browser. */
const WHEEL_PIXELS_PER_UNIT = [1, 20, 400] as const;

/** How far an arrow key pans, in screen pixels; Shift takes larger steps. */
const KEY_PAN_STEP = 50;
const KEY_PAN_STEP_LARGE = 200;

interface BoxState {
  pointerId: number;
  startX: number;
  startY: number;
  /** The pane's place on the page, so the box can be worked in pane pixels. */
  left: number;
  top: number;
  active: boolean;
  /** What stays selected under it, when Ctrl or ⌘ held the selection at the start. */
  base: { nodes: ReadonlySet<string>; edges: ReadonlySet<string> } | null;
}

interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  viewport: Viewport;
  active: boolean;
}

function InnerCanvas({
  nodes: nodesProp,
  edges: edgesProp,
  defaultNodes,
  defaultEdges,
  onNodesChange,
  onEdgesChange,
  nodeTypes = {},
  edgeTypes,
  minZoom = 0.05,
  maxZoom = 2,
  nodesDraggable = false,
  panOnDrag = true,
  selectionOnDrag = false,
  selectionMode = 'full',
  onSelectionStart,
  onSelectionEnd,
  panOnScroll = false,
  panOnScrollSpeed = 0.5,
  zoomOnScroll = true,
  zoomOnDoubleClick = true,
  connectionLineType,
  connectionLineStyle,
  connectionLineComponent,
  zoomOnPinch = true,
  elementsSelectable = false,
  nodesConnectable = false,
  translateExtent,
  connectionMode = 'strict',
  edgesFocusable = true,
  deleteKeyCode = 'Backspace',
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
  onEdgeClick,
  onBeforeDelete,
  onNodesDelete,
  onEdgesDelete,
  onDelete,
  isValidConnection,
  onInit,
}: FlowingerProps) {
  const store = useFlowingerStore();

  // With no `nodes` (or `edges`) prop the canvas owns the list, starting from
  // `defaultNodes`, and applies its own changes to it — the same path a
  // controlled flow's caller takes, so there is one way things happen.
  const ownsNodes = nodesProp === undefined;
  const ownsEdges = edgesProp === undefined;
  // `defaultEdgeOptions` is compared by value, so `{ animated: true }` written
  // inline does not remake every edge on every render.
  const edgeDefaultsKey = defaultEdgeOptions === undefined ? undefined : JSON.stringify(defaultEdgeOptions);
  const edgeDefaults = useMemo(
    () => (edgeDefaultsKey === undefined ? undefined : (JSON.parse(edgeDefaultsKey) as Partial<Edge>)),
    [edgeDefaultsKey],
  );
  const [ownNodes, setOwnNodes] = useState<Node[]>(() => defaultNodes ?? NO_NODES);
  const [ownEdges, setOwnEdges] = useState<Edge[]>(() => defaultEdges ?? NO_EDGES);
  const nodes = nodesProp ?? ownNodes;
  const givenEdges = edgesProp ?? ownEdges;
  const edges = useMemo(
    () => (edgeDefaults ? givenEdges.map((e) => ({ ...edgeDefaults, ...e })) : givenEdges),
    [givenEdges, edgeDefaults],
  );
  const changeNodes = useCallback(
    (changes: NodeChange[]) => {
      if (ownsNodes) setOwnNodes((current) => applyNodeChanges(changes, current));
      onNodesChange?.(changes);
    },
    [ownsNodes, onNodesChange],
  );
  const changeEdges = useCallback(
    (changes: EdgeChange[]) => {
      if (ownsEdges) setOwnEdges((current) => applyEdgeChanges(changes, current));
      onEdgesChange?.(changes);
    },
    [ownsEdges, onEdgesChange],
  );
  // The flow is controlled — changes are reported, not done — when someone is listening.
  const nodesChange = ownsNodes || onNodesChange ? changeNodes : undefined;
  const edgesChange = ownsEdges || onEdgesChange ? changeEdges : undefined;

  const containerRef = useRef<HTMLDivElement | null>(null);
  // The layer an edge's HTML labels portal into; state, so they render once it exists.
  const [labelHost, setLabelHost] = useState<HTMLElement | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pan = useRef<PanState | null>(null);
  /** Every pointer currently down, so a second finger can be told from a click. */
  const pointers = useRef(new Map<number, XYPosition>());
  const pinch = useRef<PinchStart | null>(null);
  const box = useRef<BoxState | null>(null);
  /** A pan just ended: the click that follows it is not a click on the canvas. */
  const justPanned = useRef(false);

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
      onEdgeClick,
      onBeforeDelete,
      onNodesDelete,
      onEdgesDelete,
      onDelete,
      isValidConnection,
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
    onEdgeClick,
    onBeforeDelete,
    onNodesDelete,
    onEdgesDelete,
    onDelete,
    isValidConnection,
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
      const unit = WHEEL_PIXELS_PER_UNIT[e.deltaMode as 0 | 1 | 2];
      // A trackpad pinch arrives as ctrl+wheel with small deltas.
      const zooming = panOnScroll ? e.ctrlKey || e.metaKey : true;
      if (zooming && !zoomOnScroll) return;
      e.preventDefault();
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
        capturePointer(e.currentTarget, e.pointerId);
        return;
      }
    }
    // A bare press on the pane draws a selection box when that is asked for
    // (always with Shift); everything else falls through to panning.
    if (
      elementsSelectable &&
      e.button === 0 &&
      e.target === e.currentTarget &&
      (selectionOnDrag || e.shiftKey)
    ) {
      const rect = e.currentTarget.getBoundingClientRect();
      const keep = e.ctrlKey || e.metaKey ? store.getSelection() : null;
      box.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        left: rect.left,
        top: rect.top,
        active: false,
        base: keep && {
          nodes: new Set(keep.nodes.map((n) => n.id)),
          edges: new Set(keep.edges.map((n) => n.id)),
        },
      };
      return;
    }
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
        store.instance.setViewport(pinchViewport(start, now.mid, now.dist, minZoom, maxZoom));
      }
      return;
    }

    const b = box.current;
    if (b?.pointerId === e.pointerId) {
      if (!b.active) {
        if (Math.hypot(e.clientX - b.startX, e.clientY - b.startY) < DRAG_THRESHOLD) return;
        b.active = true;
        justPanned.current = true; // the click that ends it is not a click on the pane
        capturePointer(e.currentTarget, e.pointerId);
        onSelectionStart?.(e);
      }
      store.boxSelect(
        {
          x: Math.min(b.startX, e.clientX) - b.left,
          y: Math.min(b.startY, e.clientY) - b.top,
          width: Math.abs(e.clientX - b.startX),
          height: Math.abs(e.clientY - b.startY),
        },
        selectionMode,
        b.base,
      );
      return;
    }

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
    if (pointers.current.size < 2) pinch.current = null;

    const b = box.current;
    if (b?.pointerId === e.pointerId) {
      box.current = null;
      if (b.active) {
        releasePointer(e.currentTarget, e.pointerId);
        store.endBoxSelect();
        onSelectionEnd?.(e);
        // Leave focus where the delete key will find it.
        e.currentTarget.focus({ preventScroll: true });
      }
      return;
    }

    const p = pan.current;
    if (p?.pointerId !== e.pointerId) return;
    pan.current = null;
    if (!p.active) return;
    releasePointer(e.currentTarget, e.pointerId);
    e.currentTarget.style.cursor = panOnDrag ? 'grab' : '';
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
    if (elementsSelectable) store.clearSelection();
  };

  // A double click on the bare canvas zooms in about the pointer; with Shift, out.
  const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!zoomOnDoubleClick || e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    void store.zoomAt(e.shiftKey ? 0.5 : 2, e.clientX - rect.left, e.clientY - rect.top, {
      duration: DOUBLE_CLICK_ZOOM_MS,
    });
  };

  const deleteKeys = deleteKeyCode === null ? [] : Array.isArray(deleteKeyCode) ? deleteKeyCode : [deleteKeyCode];

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Deleting works from anywhere inside — a focused node or edge as well as the
    // canvas — but never from a field, where the key edits text.
    if (deleteKeys.includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(e.target)) {
      const selection = store.getSelection();
      if (selection.nodes.length > 0 || selection.edges.length > 0) {
        e.preventDefault();
        void store.deleteElements(selection);
      }
      return;
    }
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
      case 'Escape':
        // Only ours if there is a selection to drop; otherwise Escape belongs to
        // whatever else wants it (a dialog this canvas sits in, say).
        if (!store.hasSelection()) return;
        store.clearSelection();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  // Focusable, but not a tab stop, so a click on empty canvas (or a box selection)
  // leaves focus somewhere the delete key reaches.
  const focusableForDelete = elementsSelectable && deleteKeys.length > 0 && !keyboardNavigation;

  const containerStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    userSelect: 'none',
    touchAction: 'none',
    ...(focusableForDelete ? { outline: 'none' } : {}),
    ...(panOnDrag && !selectionOnDrag ? { cursor: 'grab' } : {}),
    ...(selectionOnDrag && elementsSelectable ? { cursor: 'crosshair' } : {}),
    ...style,
  };

  return (
    <ViewportPortalHost.Provider value={portalHost}>
      <div
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
          : focusableForDelete
            ? { tabIndex: -1 }
            : {})}
      >
        {/* Fixed layers — a <Background> — that follow the viewport themselves. */}
        {children}
        <SelectionBox />

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
              elementsSelectable={elementsSelectable}
              edgesFocusable={edgesFocusable}
              controlledSelection={edgesChange !== undefined}
              hiddenNodeIds={tree.hidden}
              visibleEdgeIds={visible?.edges}
              connectionLineType={connectionLineType}
              connectionLineStyle={connectionLineStyle}
              connectionLineComponent={connectionLineComponent}
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
                selectable={elementsSelectable && node.selectable !== false}
                connectable={node.connectable ?? nodesConnectable}
                controlledSelection={nodesChange !== undefined}
                parentX={tree.origin.get(node.id)?.x ?? 0}
                parentY={tree.origin.get(node.id)?.y ?? 0}
                depth={tree.depth.get(node.id) ?? 0}
              />
            ))}
          </div>
        </div>
      </div>
    </ViewportPortalHost.Provider>
  );
}

export function FlowingerCanvas(props: FlowingerProps) {
  // Inside a <FlowingerProvider> the caller owns the state (a toolbar elsewhere
  // in the tree can then drive the viewport); otherwise make one.
  if (useContext(FlowingerContext)) return <InnerCanvas {...props} />;
  return (
    <FlowingerProvider minZoom={props.minZoom} maxZoom={props.maxZoom}>
      <InnerCanvas {...props} />
    </FlowingerProvider>
  );
}
