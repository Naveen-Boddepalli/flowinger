import {
  useContext,
  useEffect,
  useRef,
  type CSSProperties,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { FlowingerContext, useFlowingerStore } from './context.ts';
import { FlowingerEdges } from './FlowingerEdges.tsx';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect.ts';
import { FlowingerProvider } from './FlowingerProvider.tsx';
import { NodeWrapper } from './NodeWrapper.tsx';
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
import type { FlowingerProps, NodeProps, Viewport, XYPosition } from './types.ts';

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

function InnerCanvas({
  nodes,
  edges = [],
  nodeTypes = {},
  edgeTypes,
  minZoom = 0.05,
  maxZoom = 2,
  nodesDraggable = false,
  panOnDrag = true,
  zoomOnScroll = true,
  zoomOnPinch = true,
  elementsSelectable = false,
  translateExtent,
  keyboardNavigation = false,
  ariaLabel = 'Diagram',
  className = '',
  style = {},
  children,
  onNodeDrag,
  onNodeDragStop,
  onNodeClick,
  onPaneClick,
  onSelectionChange,
  onInit,
}: FlowingerProps) {
  const store = useFlowingerStore();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pan = useRef<PanState | null>(null);
  /** Every pointer currently down, so a second finger can be told from a click. */
  const pointers = useRef(new Map<number, XYPosition>());
  const pinch = useRef<PinchStart | null>(null);
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

  useIsomorphicLayoutEffect(() => {
    store.setNodes(nodes);
  }, [store, nodes]);

  useIsomorphicLayoutEffect(() => {
    store.setCallbacks({ onNodeDrag, onNodeDragStop, onNodeClick, onSelectionChange });
  }, [store, onNodeDrag, onNodeDragStop, onNodeClick, onSelectionChange]);

  const onInitRef = useRef(onInit);
  useEffect(() => {
    onInitRef.current = onInit;
  });
  useEffect(() => {
    onInitRef.current?.(store.instance);
  }, [store]);

  // Wheel zoom. A native listener: React registers `wheel` as passive, and a
  // passive listener cannot stop the page scrolling underneath.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !zoomOnScroll) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const pixels = e.deltaY * WHEEL_PIXELS_PER_UNIT[e.deltaMode as 0 | 1 | 2];
      // A trackpad pinch arrives as ctrl+wheel with small deltas.
      const factor = 2 ** (-pixels * (e.ctrlKey ? 0.01 : 0.002));
      store.zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, [store, zoomOnScroll]);

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

  // Only when the canvas itself has focus: a key pressed inside a node (a text
  // field, a button) is that node's, not ours.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
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

  const containerStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    userSelect: 'none',
    touchAction: 'none',
    ...(panOnDrag ? { cursor: 'grab' } : {}),
    ...style,
  };

  return (
    <div
      ref={containerRef}
      className={`flowinger react-flow ${className}`}
      style={containerStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClick={onClick}
      {...(keyboardNavigation
        ? { tabIndex: 0, role: 'group', 'aria-label': ariaLabel, onKeyDown }
        : {})}
    >
      {/* Fixed layers — a <Background> — that follow the viewport themselves. */}
      {children}

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
        <FlowingerEdges edges={edges} nodes={nodes} edgeTypes={edgeTypes} />

        <div className="flowinger-nodes react-flow__nodes" style={{ pointerEvents: 'none' }}>
          {nodes.map((node) => (
            <NodeWrapper
              key={node.id}
              node={node}
              // A component is chosen by string at runtime, so its `data` type
              // cannot be checked here; `NodeTypes` accepts any.
              View={((node.type && nodeTypes[node.type]) ?? DefaultNodeView) as ComponentType<NodeProps>}
              draggable={node.draggable ?? nodesDraggable}
              selectable={elementsSelectable && node.selectable !== false}
            />
          ))}
        </div>
      </div>
    </div>
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
