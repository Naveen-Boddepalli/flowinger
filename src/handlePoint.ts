import { Position, type XYPosition } from './types.ts';
import type { Size } from './store.ts';

/** The midpoint of a node's side — where an unmeasured handle is assumed to sit. */
export function handleCoordinates(at: XYPosition, pos: Position, size: Size): XYPosition {
  switch (pos) {
    case Position.Top:
      return { x: at.x + size.width / 2, y: at.y };
    case Position.Bottom:
      return { x: at.x + size.width / 2, y: at.y + size.height };
    case Position.Left:
      return { x: at.x, y: at.y + size.height / 2 };
    case Position.Right:
      return { x: at.x + size.width, y: at.y + size.height / 2 };
  }
}
