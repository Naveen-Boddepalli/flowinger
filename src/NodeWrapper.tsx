import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useFlowingerStore } from './context.ts';
import { NodeContext, type NodeContextValue } from './nodeContext.ts';
import { DRAG_THRESHOLD, capturePointer, isInteractive, releasePointer } from './pointer.ts';
import type { Node, NodeProps, XYPosition } from './types.ts';

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  /** Where the node was when the press began, in graph units. */
  origin: XYPosition;
  /** False until the pointer has travelled `DRAG_THRESHOLD`. */
  active: boolean;
}

export interface NodeWrapperProps {
  node: Node;
  View: ComponentType<NodeProps>;
  draggable: boolean;
}

/**
 * One node: positions it, measures it, and drags it.
 *
 * Memoised, and subscribed to its own position only — so dragging one node
 * re-renders that node and the edge layer, not the other N-1.
 */
export const NodeWrapper = memo(function NodeWrapper({ node, View, draggable }: NodeWrapperProps) {
  const store = useFlowingerStore();
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  const subscribe = useCallback(
    (listener: () => void) => store.subscribeNode(node.id, listener),
    [store, node.id],
  );
  const position = useSyncExternalStore(subscribe, () =>
    store.resolvePosition(node.id, node.position),
  );

  // What a `<Handle>` inside this node registers itself with.
  const nodeContext = useMemo<NodeContextValue>(
    () => ({ registerHandle: (registration) => store.registerHandle(node.id, registration) }),
    [store, node.id],
  );

  // The edge layer needs the node's real size, and where its handles sit. The
  // handles have registered by now — children's layout effects run first.
  // offset* is layout size, so the viewport's scale does not leak into it.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const unregister = store.registerNodeElement(node.id, el);
    const measure = () => {
      store.setSize(node.id, el.offsetWidth, el.offsetHeight);
      store.measureHandles(node.id);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
      unregister();
    };
  }, [store, node.id]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggable || e.button !== 0 || isInteractive(e.target)) return;
    // Claimed from the first press, so the canvas underneath does not start a
    // pan — even though the drag proper only begins past the threshold.
    e.stopPropagation();
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origin: position,
      active: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d?.pointerId !== e.pointerId) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.active = true;
      setDragging(true);
      capturePointer(e.currentTarget, e.pointerId);
    }
    e.stopPropagation();

    const zoom = store.getViewport().zoom;
    const next = {
      x: d.origin.x + (e.clientX - d.startX) / zoom,
      y: d.origin.y + (e.clientY - d.startY) / zoom,
    };
    store.setNodePosition(node, next);
    store.getCallbacks().onNodeDrag?.(e, { ...node, position: next });
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d?.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!d.active) return;
    e.stopPropagation();
    releasePointer(e.currentTarget, e.pointerId);
    setDragging(false);
    store
      .getCallbacks()
      .onNodeDragStop?.(e, { ...node, position: store.resolvePosition(node.id, node.position) });
  };

  return (
    <div
      ref={ref}
      data-id={node.id}
      className={`flowinger-node react-flow__node react-flow__node-${node.type ?? 'default'} ${
        node.className ?? ''
      } ${dragging ? 'dragging' : ''}`}
      style={{
        ...node.style,
        position: 'absolute',
        transform: `translate(${String(position.x)}px, ${String(position.y)}px)`,
        pointerEvents: 'all',
        zIndex: dragging ? 1000 : 1,
        ...(draggable ? { cursor: dragging ? 'grabbing' : 'grab' } : {}),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <NodeContext.Provider value={nodeContext}>
        <View
          id={node.id}
          data={node.data}
          type={node.type}
          selected={false}
          isConnectable={false}
          positionAbsoluteX={position.x}
          positionAbsoluteY={position.y}
        />
      </NodeContext.Provider>
    </div>
  );
});
