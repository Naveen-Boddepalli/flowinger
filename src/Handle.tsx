import { type CSSProperties, memo, useContext, useLayoutEffect, useRef } from 'react';
import { NodeContext } from './nodeContext.ts';
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
 */
export const Handle = memo(function Handle({
  id,
  type,
  position,
  className = '',
  style = {},
}: HandleProps) {
  const node = useContext(NodeContext);
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!node || !el) return;
    return node.registerHandle({ id: id ?? null, type, position, el });
  }, [node, id, type, position]);

  const combinedStyle: CSSProperties = {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: 'currentColor',
    pointerEvents: 'none',
    ...POSITION_STYLES[position],
    ...style,
  };

  return (
    <div
      ref={ref}
      data-handleid={id}
      data-handletype={type}
      data-handlepos={position}
      className={`flowinger-handle react-flow__handle react-flow__handle-${position} ${className}`}
      style={combinedStyle}
    />
  );
});
