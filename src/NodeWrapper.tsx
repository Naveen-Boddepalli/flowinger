import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useFlowingerStore } from './context.ts';
import type { Feature } from './features.ts';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect.ts';
import { NodeContext, type NodeContextValue } from './nodeContext.ts';
import type { Node, NodeOrigin, NodeProps } from './types.ts';

const NO_FEATURES: readonly Feature[] = [];
const NO_START = () => {};

export interface NodeWrapperProps {
  node: Node;
  View: ComponentType<NodeProps>;
  draggable: boolean;
  /** Whether a click, or Enter/Space, may select it — what the selection feature acts on. */
  selectable: boolean;
  /** Whether its handles can start and end connections. */
  connectable: boolean;
  /** Whether `node.selected` is what says so (a controlled flow), as opposed to the store's own set. */
  controlledSelection: boolean;
  /** Where this node's parent sits on the canvas (the origin for a root), and how many parents deep it is. */
  parentX: number;
  parentY: number;
  depth: number;
  nodeOrigin?: NodeOrigin;
  /** What the canvas can do with it — dragging, connecting — see `Feature`. Must not change. */
  features?: readonly Feature[];
}

/**
 * One node: positions it, measures it, and hands its pointer and key events to the features that act
 * on nodes.
 *
 * Memoised, and subscribed to its own position only — so dragging one node
 * re-renders that node and the edge layer, not the other N-1.
 */
export const NodeWrapper = /*#__PURE__*/ memo(function NodeWrapper({
  node,
  View,
  draggable,
  selectable,
  connectable,
  controlledSelection,
  parentX,
  parentY,
  depth,
  nodeOrigin,
  features = NO_FEATURES,
}: NodeWrapperProps) {
  const store = useFlowingerStore();
  const ref = useRef<HTMLDivElement | null>(null);
  /** A drag just ended: the click that follows it is not a click on the node. */
  const justDragged = useRef(false);

  const subscribe = useCallback(
    (listener: () => void) => store.subscribeNode(node.id, listener),
    [store, node.id],
  );
  const readPosition = () => store.absolutePosition(node);
  // No drag has happened on the server, and nothing is registered there: the
  // layout's own position, placed inside its parent, is it.
  const origin = node.origin ?? nodeOrigin;
  const laidOutWidth = node.width ?? node.initialWidth;
  const laidOutHeight = node.height ?? node.initialHeight;
  const asLaidOut = useMemo(
    () => ({
      // The server has measured nothing: a declared size is all an origin can be taken from.
      x: parentX + node.position.x - (origin && laidOutWidth !== undefined ? origin[0] * laidOutWidth : 0),
      y: parentY + node.position.y - (origin && laidOutHeight !== undefined ? origin[1] * laidOutHeight : 0),
    }),
    [parentX, parentY, node.position.x, node.position.y, origin, laidOutWidth, laidOutHeight],
  );
  // The node's top-left corner. It is re-read when the node moves — and, for a node with an origin, when it is
  // measured: the store tells it then, so the position is never one made from a size that has since changed.
  const position = useSyncExternalStore(subscribe, readPosition, () => asLaidOut);

  // Selection is per node: selecting one re-renders it (and whichever it replaces), not the rest.
  const selected = useSyncExternalStore(
    subscribe,
    () => store.isSelected(node.id),
    () => controlledSelection && node.selected === true,
  );

  // What each feature adds, in the order they were given.
  const bits = features.flatMap(
    (f) => f.useNode?.({ store, node, draggable, selectable, selected, justDragged }) ?? [],
  );
  // A feature may make a node a tab stop, and another may say it is not: a refusal wins.
  const focusable = bits.some((b) => b.focusable === true) && !bits.some((b) => b.focusable === false);
  const dragging = bits.some((b) => b.dragging === true);
  const startConnection = bits.find((b) => b.startConnection)?.startConnection;
  const clickConnect = bits.find((b) => b.clickConnect)?.clickConnect;
  const handleProps = bits.find((b) => b.handleProps)?.handleProps;
  // Above its parent by depth, unless it says otherwise — and as a feature (stacking) lifts or flattens it;
  // above all while dragged.
  const baseZ = node.zIndex ?? 1 + depth;
  const stacked = useSyncExternalStore(
    subscribe,
    () => features.reduce((z, f) => f.stackNode?.(store, node, z, store.isSelected(node.id), false) ?? z, baseZ),
    () => baseZ,
  );
  const zIndex = dragging ? Math.max(1000, stacked) : stacked;

  // What a `<Handle>` inside this node registers itself with. Without something to start a
  // connection with, its handles only draw.
  const nodeContext = useMemo<NodeContextValue>(
    () => ({
      nodeId: node.id,
      connectable: connectable && startConnection !== undefined,
      registerHandle: (registration) => store.registerHandle(node.id, registration),
      startConnection: startConnection ?? NO_START,
      clickConnect: clickConnect ?? NO_START,
      labels: store.labels,
      handleProps,
    }),
    [store, node.id, connectable, startConnection, clickConnect, handleProps],
  );

  // The edge layer needs the node's real size, and where its handles sit. The
  // handles have registered by now — children's layout effects run first.
  // Layout size, so the viewport's scale does not leak into it — and fractional.
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const unregister = store.registerNodeElement(node.id, el);
    const measure = () => {
      store.remeasure(node.id);
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

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    justDragged.current = false;
    for (const b of bits) b.onPointerDown?.(e);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    for (const b of bits) b.onPointerMove?.(e);
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    for (const b of bits) b.onPointerEnd?.(e);
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
    for (const b of bits) b.onClick?.(e);
  };

  // Only when the node itself has focus: Enter or Space inside a field is the field's.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    for (const b of bits) b.onKeyDown?.(e);
  };

  return (
    <div
      {...Object.assign({}, ...bits.map((b) => b.props))}
      ref={ref}
      data-id={node.id}
      data-testid={`rf__node-${node.id}`}
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
        zIndex,
        ...Object.assign({}, ...bits.map((b) => b.style)),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClick={onClick}
      // Focusable — what selecting is — means reachable from the keyboard too. `aria-current` is a
      // global attribute, valid on a plain div; `aria-selected` is not.
      {...(focusable
        ? { tabIndex: 0, onKeyDown, 'aria-current': selected ? ('true' as const) : undefined }
        : {})}
      role={node.ariaRole ?? (focusable ? 'group' : undefined)}
      aria-label={node.ariaLabel}
      // An escape hatch, last: it may set an attribute this element already has (an `aria-*`), never a
      // handler or the ones the engine itself owns (`id`, `style`, `className`, `role`).
      {...node.domAttributes}
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
          selectable={selectable}
          draggable={draggable}
          deletable={node.deletable ?? true}
          dragging={dragging}
          dragHandle={node.dragHandle}
          parentId={node.parentId}
          zIndex={zIndex}
          width={node.width}
          height={node.height}
          sourcePosition={node.sourcePosition}
          targetPosition={node.targetPosition}
        />
      </NodeContext.Provider>
    </div>
  );
});
