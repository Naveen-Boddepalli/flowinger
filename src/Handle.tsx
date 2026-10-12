import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  memo,
  useContext,
  useRef,
} from 'react';
import { NodeContext } from './nodeContext.ts';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect.ts';
import type { HandleOptions } from './store.ts';
import { type HandleProps, Position } from './types.ts';

const POSITION_STYLES: Record<Position, CSSProperties> = {
  [Position.Top]: {
    top: 0,
    left: '50%',
    transform: 'translate(-50%, -50%)',
  },
  [Position.Bottom]: {
    bottom: 0,
    left: '50%',
    transform: 'translate(-50%, 50%)',
  },
  [Position.Left]: {
    left: 0,
    top: '50%',
    transform: 'translate(-50%, -50%)',
  },
  [Position.Right]: {
    right: 0,
    top: '50%',
    transform: 'translate(50%, -50%)',
  },
};

/**
 * A connection point on a node.
 *
 * It draws a small dot on the given side and, more importantly, tells the
 * engine it exists: edges name a handle by `id` (and `type`) and attach to
 * wherever it is actually drawn — including a handle moved with `style`, e.g.
 * `left: '30%'`. Give a handle an `id` unless the node has only one of its type.
 *
 * With `nodesConnectable` on the canvas it is also where a connection is
 * dragged from and dropped onto: it then takes pointer events (and a larger
 * dot), which a plain handle deliberately does not.
 */
export const Handle = /*#__PURE__*/ memo(function Handle({
  id,
  type,
  position,
  isConnectable,
  isConnectableStart,
  isConnectableEnd,
  isValidConnection,
  onConnect,
  className = '',
  style = {},
  ...rest
}: HandleProps) {
  const node = useContext(NodeContext);
  const ref = useRef<HTMLDivElement | null>(null);
  // Read when a connection is dragged, so a handler that changes between renders is heard as it now is.
  const options = useRef<HandleOptions>({});
  options.current = { isConnectableStart, isConnectableEnd, isValidConnection, onConnect };

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!node || !el) return;
    return node.registerHandle({ id: id ?? null, type, position, el, options });
  }, [node, id, type, position]);

  const connectable = Boolean(node?.connectable) && isConnectable !== false;
  // A drop target while it can end a connection or start one; it starts one only if it may.
  const canStart = connectable && isConnectableStart !== false;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!node || e.button !== 0) return;
    // Neither the node (a drag) nor the canvas (a pan) may start from a handle.
    e.stopPropagation();
    e.preventDefault();
    node.startConnection(e.currentTarget, e.nativeEvent);
  };

  // A click is also how a connection is made without dragging (`connectOnClick`): both ends, so a handle that
  // cannot start one can still be clicked to end one.
  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    node?.clickConnect(e.currentTarget, e.nativeEvent);
  };

  const combinedStyle: CSSProperties = {
    position: 'absolute',
    // Bigger when it has to be hit; the anchor is measured from the centre, so
    // the size does not move where an edge attaches.
    width: connectable ? 10 : 6,
    height: connectable ? 10 : 6,
    borderRadius: '50%',
    backgroundColor: 'currentColor',
    pointerEvents: connectable ? 'all' : 'none',
    ...(canStart ? { cursor: 'crosshair' } : {}),
    ...POSITION_STYLES[position],
    ...style,
  };

  return (
    <div
      aria-label={node?.labels['handle.ariaLabel']}
      {...rest}
      ref={ref}
      data-handleid={id}
      data-nodeid={node?.nodeId}
      data-connectable={connectable ? 'true' : undefined}
      data-handletype={type}
      data-handlepos={position}
      className={`flowinger-handle react-flow__handle react-flow__handle-${position} ${className}`}
      style={combinedStyle}
      {...(canStart ? { onPointerDown } : {})}
      {...(connectable ? { onClick } : {})}
    />
  );
});
