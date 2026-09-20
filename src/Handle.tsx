import { type CSSProperties, memo } from 'react';
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

export const Handle = memo(function Handle({
  id,
  type,
  position,
  className = '',
  style = {},
}: HandleProps) {
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
      data-handleid={id}
      data-handletype={type}
      data-handlepos={position}
      className={`flowinger-handle react-flow__handle react-flow__handle-${position} ${className}`}
      style={combinedStyle}
    />
  );
});
