import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { FlowingerContext, useFlowingerStore } from './context.ts';
import { FlowingerEdges } from './FlowingerEdges.tsx';
import { FlowingerProvider } from './FlowingerProvider.tsx';
import { NodeWrapper } from './NodeWrapper.tsx';
import { DRAG_THRESHOLD, capturePointer, isInteractive, releasePointer } from './pointer.ts';
import type { FlowingerProps, NodeProps, Viewport } from './types.ts';

function DefaultNodeView({ id, data }: NodeProps) {
  return (
    <div className="rounded border border-slate-700 bg-slate-800 p-3 text-slate-100 shadow">
      <div className="font-semibold">{id}</div>
      {'label' in data && <div className="text-sm text-slate-400">{String(data.label)}</div>}
    </div>
  );
}

/** Wheel deltas arrive in pixels, lines or pages depending on device and browser. */
const WHEEL_PIXELS_PER_UNIT = [1, 20, 400] as const;

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
  minZoom = 0.05,
  maxZoom = 2,
  nodesDraggable = false,
  panOnDrag = true,
  zoomOnScroll = true,
  className = '',
  style = {},
  children,
  onNodeDrag,
  onNodeDragStop,
  onInit,
}: FlowingerProps) {
  const store = useFlowingerStore();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pan = useRef<PanState | null>(null);

  // Layout effects, not passive ones: a parent's passive effect (one that
  // frames the diagram, say) runs after these, and must find the canvas
  // attached, the zoom limits set and the nodes registered.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const viewport = viewportRef.current;
    if (!container || !viewport) return;
    store.attach(viewport, container);
    return () => {
      store.detach();
    };
  }, [store]);

  useLayoutEffect(() => {
    store.setBounds(minZoom, maxZoom);
  }, [store, minZoom, maxZoom]);

  useLayoutEffect(() => {
    store.setNodes(nodes);
  }, [store, nodes]);

  useLayoutEffect(() => {
    store.setCallbacks({ onNodeDrag, onNodeDragStop });
  }, [store, onNodeDrag, onNodeDragStop]);

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

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
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
    const p = pan.current;
    if (p?.pointerId !== e.pointerId) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (!p.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      p.active = true;
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
    const p = pan.current;
    if (p?.pointerId !== e.pointerId) return;
    pan.current = null;
    if (!p.active) return;
    releasePointer(e.currentTarget, e.pointerId);
    e.currentTarget.style.cursor = panOnDrag ? 'grab' : '';
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
        }}
      >
        <FlowingerEdges edges={edges} nodes={nodes} />

        <div className="flowinger-nodes react-flow__nodes" style={{ pointerEvents: 'none' }}>
          {nodes.map((node) => (
            <NodeWrapper
              key={node.id}
              node={node}
              // A component is chosen by string at runtime, so its `data` type
              // cannot be checked here; `NodeTypes` accepts any.
              View={((node.type && nodeTypes[node.type]) ?? DefaultNodeView) as ComponentType<NodeProps>}
              draggable={node.draggable ?? nodesDraggable}
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
