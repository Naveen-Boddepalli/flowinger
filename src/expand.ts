import type { NodeChange, Rect, XYPosition } from './types.ts';

/**
 * A parent that grows to hold the children dragged past its edge (`expandParent`).
 *
 * The parent only ever grows during a drag — moving a child back in does not
 * shrink it. Growing past the top or left edge moves the parent's own origin, so
 * everything else inside it has to be given a new relative position to stay put on
 * the canvas; the children being dragged are placed relative to the new origin.
 */
export interface ExpandGroup {
  parentId: string;
  /** The parent's own (relative) position at the start of the drag. */
  parentRel: XYPosition;
  /** The box it filled then, in canvas coordinates. */
  start: { left: number; top: number; right: number; bottom: number };
  /** The box it fills now: `start`, grown. */
  box: { left: number; top: number; right: number; bottom: number };
  /** The children being dragged. */
  kids: string[];
  /** Its other children, and where each was (relative) at the start. */
  others: { id: string; rel: XYPosition }[];
  /** What was last reported, so a step that changes nothing says nothing. */
  reported: string;
}

const signature = (width: number, height: number, shiftX: number, shiftY: number): string =>
  `${String(width)}|${String(height)}|${String(shiftX)}|${String(shiftY)}`;

export function beginGroup(
  parentId: string,
  parentRel: XYPosition,
  parentBox: Rect,
  kids: string[],
  others: { id: string; rel: XYPosition }[],
): ExpandGroup {
  const box = {
    left: parentBox.x,
    top: parentBox.y,
    right: parentBox.x + parentBox.width,
    bottom: parentBox.y + parentBox.height,
  };
  // What is "reported" at the start is the parent as it is: unchanged says nothing.
  const reported = signature(box.right - box.left, box.bottom - box.top, 0, 0);
  return { parentId, parentRel, start: { ...box }, box, kids, others, reported };
}

/**
 * Grows the group to hold `kids` (their boxes in canvas coordinates) and returns
 * the changes that make it so, and where each kid now sits relative to the parent.
 */
export function growGroup(
  g: ExpandGroup,
  kids: readonly (Rect & { id: string })[],
): { changes: NodeChange[]; relative: Map<string, XYPosition> } {
  for (const k of kids) {
    g.box.left = Math.min(g.box.left, k.x);
    g.box.top = Math.min(g.box.top, k.y);
    g.box.right = Math.max(g.box.right, k.x + k.width);
    g.box.bottom = Math.max(g.box.bottom, k.y + k.height);
  }
  const shiftX = g.box.left - g.start.left;
  const shiftY = g.box.top - g.start.top;
  const width = g.box.right - g.box.left;
  const height = g.box.bottom - g.box.top;

  const relative = new Map(kids.map((k) => [k.id, { x: k.x - g.box.left, y: k.y - g.box.top }]));
  const now = signature(width, height, shiftX, shiftY);
  if (now === g.reported) return { changes: [], relative };
  g.reported = now;

  const changes: NodeChange[] = [
    { type: 'dimensions', id: g.parentId, dimensions: { width, height }, setAttributes: true },
  ];
  if (shiftX !== 0 || shiftY !== 0) {
    changes.push({
      type: 'position',
      id: g.parentId,
      position: { x: g.parentRel.x + shiftX, y: g.parentRel.y + shiftY },
    });
    for (const o of g.others) {
      changes.push({ type: 'position', id: o.id, position: { x: o.rel.x - shiftX, y: o.rel.y - shiftY } });
    }
  }
  return { changes, relative };
}
