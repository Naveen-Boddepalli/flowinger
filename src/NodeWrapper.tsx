import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useFlowingerStore } from './context.ts';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect.ts';
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
  /** Whether a click, or Enter/Space, selects it. */
  selectable: boolean;
  /** Whether its handles can start and end connections. */
  connectable: boolean;
}

/**
 * One node: positions it, measures it, and drags it.
 *
 * Memoised, and subscribed to its own position only — so dragging one node
 * re-renders that node and the edge layer, not the other N-1.
 */
export const NodeWrapper = memo(function NodeWrapper({
  node,
  View,
  draggable,
  selectable,
  connectable,
}: NodeWrapperProps) {
  const store = useFlowingerStore();
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  const subscribe = useCallback(
    (listener: () => void) => store.subscribeNode(node.id, listener),
    [store, node.id],
  );
  const readPosition = () => store.resolvePosition(node.id, node.position);
  // No drag has happened on the server; the layout's own position is it.
  const position = useSyncExternalStore(subscribe, readPosition, readPosition);

  // Selection is per node: selecting one re-renders it (and whichever it replaces), not the rest.
  const selected = useSyncExternalStore(
    subscribe,
    () => store.isSelected(node.id),
    () => false,
  );

  // What a `<Handle>` inside this node registers itself with.
  const nodeContext = useMemo<NodeContextValue>(
    () => ({
      nodeId: node.id,
      connectable,
      registerHandle: (registration) => store.registerHandle(node.id, registration),
      startConnection: (handle, at) => { store.startConnection(node.id, handle, at); },
    }),
    [store, node.id, connectable],
  );

  // The edge layer needs the node's real size, and where its handles sit. The
  // handles have registered by now — children's layout effects run first.
  // offset* is layout size, so the viewport's scale does not leak into it.
  useIsomorphicLayoutEffect(() => {
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

  // A click on a control inside the node is that control's, not a selection.
  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    store.getCallbacks().onNodeClick?.(e, node);
    if (selectable && !isInteractive(e.target)) {
      store.selectNode(node.id, e.shiftKey || e.metaKey || e.ctrlKey);
    }
  };

  // Only when the node itself has focus: Enter or Space inside a field is the field's.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); // Space would otherwise scroll the page
    store.selectNode(node.id, e.shiftKey);
  };

  return (
    <div
      ref={ref}
      data-id={node.id}
      className={`flowinger-node react-flow__node react-flow__node-${node.type ?? 'default'} ${
        node.className ?? ''
      } ${dragging ? 'dragging' : ''} ${selected ? 'selected' : ''}`}
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
      onClick={onClick}
      // Selectable means reachable from the keyboard too. `aria-current` is a
      // global attribute, valid on a plain div; `aria-selected` is not.
      {...(selectable
        ? { tabIndex: 0, onKeyDown, 'aria-current': selected ? ('true' as const) : undefined }
        : {})}
    >
      <NodeContext.Provider value={nodeContext}>
        <View
          id={node.id}
          data={node.data}
          type={node.type}
          selected={selected}
          isConnectable={connectable}
          positionAbsoluteX={position.x}
          positionAbsoluteY={position.y}
        />
      </NodeContext.Provider>
    </div>
  );
});
