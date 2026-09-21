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
import { layoutSize } from './measure.ts';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect.ts';
import { NodeContext, type NodeContextValue } from './nodeContext.ts';
import { DRAG_THRESHOLD, capturePointer, isInteractive, releasePointer } from './pointer.ts';
import type { DragSession } from './store.ts';
import type { Node, NodeProps } from './types.ts';

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  /** Null until the pointer has travelled `DRAG_THRESHOLD`; then the drag proper. */
  session: DragSession | null;
}

export interface NodeWrapperProps {
  node: Node;
  View: ComponentType<NodeProps>;
  draggable: boolean;
  /** Whether a click, or Enter/Space, selects it. */
  selectable: boolean;
  /** Whether its handles can start and end connections. */
  connectable: boolean;
  /** Whether `node.selected` is what says so (a controlled flow), as opposed to the store's own set. */
  controlledSelection: boolean;
  /** Where this node's parent sits on the canvas (the origin for a root), and how many parents deep it is. */
  parentX: number;
  parentY: number;
  depth: number;
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
  controlledSelection,
  parentX,
  parentY,
  depth,
}: NodeWrapperProps) {
  const store = useFlowingerStore();
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState | null>(null);
  /** A drag just ended: the click that follows it is not a click on the node. */
  const justDragged = useRef(false);
  /** Stops watching for a press to become a drag; null when nothing is being watched. */
  const stopClaiming = useRef<(() => void) | null>(null);
  const [dragging, setDragging] = useState(false);

  const subscribe = useCallback(
    (listener: () => void) => store.subscribeNode(node.id, listener),
    [store, node.id],
  );
  const readPosition = () => store.absolutePosition(node);
  // No drag has happened on the server, and nothing is registered there: the
  // layout's own position, placed inside its parent, is it.
  const asLaidOut = useMemo(
    () => ({ x: parentX + node.position.x, y: parentY + node.position.y }),
    [parentX, parentY, node.position.x, node.position.y],
  );
  const position = useSyncExternalStore(subscribe, readPosition, () => asLaidOut);

  // Selection is per node: selecting one re-renders it (and whichever it replaces), not the rest.
  const selected = useSyncExternalStore(
    subscribe,
    () => store.isSelected(node.id),
    () => controlledSelection && node.selected === true,
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
  // Layout size, so the viewport's scale does not leak into it — and fractional.
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const unregister = store.registerNodeElement(node.id, el);
    const measure = () => {
      const { width, height } = layoutSize(el);
      store.setSize(node.id, width, height);
      store.measureHandles(node.id);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
      unregister();
    };
    // A declared size is applied as the node's style, so a change to it is a change
    // of layout to read now — not whenever the observer next gets round to it.
  }, [store, node.id, node.width, node.height]);

  useIsomorphicLayoutEffect(
    () => () => {
      stopClaiming.current?.();
    },
    [],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    justDragged.current = false;
    if (!draggable || e.button !== 0 || isInteractive(e.target)) return;
    // With a drag handle, only a press on it drags; elsewhere the canvas pans.
    if (node.dragHandle && !(e.target instanceof Element && e.target.closest(node.dragHandle))) return;
    // Claimed from the first press, so the canvas underneath does not start a
    // pan — even though the drag proper only begins past the threshold.
    e.stopPropagation();
    const pressed = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, session: null };
    drag.current = pressed;

    // The pointer is only captured once the press has become a drag (capturing at
    // once would send the click of anything inside the node to the node). Until
    // then a quick move can leave the node — landing on the pane, or on the node
    // beneath — and its events would go there, never reaching this one. So watch
    // the window for the move that crosses the threshold and capture then, wherever
    // the pointer is; every move after that comes here.
    const element = e.currentTarget;
    stopClaiming.current?.();
    const stop = () => {
      window.removeEventListener('pointermove', claim, true);
      window.removeEventListener('pointerup', stop, true);
      window.removeEventListener('pointercancel', stop, true);
      if (stopClaiming.current === stop) stopClaiming.current = null;
    };
    const claim = (ev: PointerEvent) => {
      if (ev.pointerId !== pressed.pointerId) return;
      if (drag.current !== pressed || pressed.session) {
        stop();
        return;
      }
      if (Math.hypot(ev.clientX - pressed.startX, ev.clientY - pressed.startY) < DRAG_THRESHOLD) return;
      capturePointer(element, pressed.pointerId);
      stop();
    };
    window.addEventListener('pointermove', claim, true);
    window.addEventListener('pointerup', stop, true);
    window.addEventListener('pointercancel', stop, true);
    stopClaiming.current = stop;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d?.pointerId !== e.pointerId) return;
    if (!d.session) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.session = store.beginNodeDrag(node, e, e.shiftKey || e.metaKey || e.ctrlKey);
      justDragged.current = true;
      setDragging(true);
      capturePointer(e.currentTarget, e.pointerId);
    }
    e.stopPropagation();
    const zoom = store.getViewport().zoom;
    d.session.move(e, (e.clientX - d.startX) / zoom, (e.clientY - d.startY) / zoom);
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d?.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!d.session) return;
    e.stopPropagation();
    releasePointer(e.currentTarget, e.pointerId);
    setDragging(false);
    d.session.end(e);
  };

  // A click on a control inside the node is that control's, not a selection.
  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    // Pointer capture retargets the click that ends a drag onto this node, and
    // it would otherwise collapse a group selection to the one node.
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    store.getCallbacks().onNodeClick?.(e, node);
    if (selectable && !isInteractive(e.target)) {
      store.selectNode(node.id, e.shiftKey || e.metaKey || e.ctrlKey);
    }
  };

  const ARROWS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };

  // Only when the node itself has focus: Enter or Space inside a field is the field's.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    const arrow = ARROWS[e.key];
    if (arrow) {
      // A selected node moves with the arrow keys, as with a drag. An unselected
      // one leaves them to the page.
      if (!selected) return;
      e.preventDefault();
      store.nudgeSelection(arrow[0], arrow[1], e.shiftKey);
      return;
    }
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
        // A declared size is the node's size (as in React Flow): what a resize writes back.
        ...(node.width === undefined ? {} : { width: node.width }),
        ...(node.height === undefined ? {} : { height: node.height }),
        ...node.style,
        position: 'absolute',
        transform: `translate(${String(position.x)}px, ${String(position.y)}px)`,
        pointerEvents: 'all',
        // Above its parent by depth, unless it says otherwise; above all while dragged.
        zIndex: dragging ? 1000 : (node.zIndex ?? 1 + depth),
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
