import type { Node, Rect, TranslateExtent, Viewport, XYPosition } from './types.ts';

export interface Size {
  width: number;
  height: number;
}

/**
 * The size a node is assumed to be until it has been measured, and the size
 * `fitView` uses for a node that never reports one (jsdom, `display: none`).
 */
export const FALLBACK_SIZE: Size = { width: 150, height: 40 };

/** What a node measured, else what it declared, else the fallback. */
export const sizeOfNode = (node: Node): Size => ({
  width: node.measured?.width ?? node.width ?? FALLBACK_SIZE.width,
  height: node.measured?.height ?? node.height ?? FALLBACK_SIZE.height,
});

/** The smallest rectangle holding every node. Empty in, an empty rectangle out. */
export function getNodesBounds(nodes: readonly Node[]): Rect {
  if (nodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const { width, height } = sizeOfNode(node);
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + width);
    maxY = Math.max(maxY, node.position.y + height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function overlappingArea(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

/**
 * Whether `rect` meets `area`: with `partially`, any overlap counts; without,
 * it must lie wholly inside.
 */
export function isRectIntersecting(rect: Rect, area: Rect, partially = true): boolean {
  const overlap = overlappingArea(rect, area);
  return (partially && overlap > 0) || overlap >= rect.width * rect.height;
}

const FIT_PADDING_PX = 40;

/**
 * The viewport that shows `bounds` in a `width` × `height` pane, centred.
 *
 * `padding` is a ratio, as in React Flow: `0.1` leaves a tenth of the bounds'
 * size around them. Left out, the margin is a fixed 40 px on every side.
 */
export function viewportForBounds(
  bounds: Rect,
  width: number,
  height: number,
  minZoom: number,
  maxZoom: number,
  padding?: number,
): Viewport {
  const bw = Math.max(bounds.width, 1);
  const bh = Math.max(bounds.height, 1);
  const raw =
    padding === undefined
      ? Math.min((width - FIT_PADDING_PX * 2) / bw, (height - FIT_PADDING_PX * 2) / bh)
      : Math.min(width / (bw * (1 + padding)), height / (bh * (1 + padding)));
  const zoom = Math.max(minZoom, Math.min(maxZoom, raw));
  return {
    x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: height / 2 - (bounds.y + bounds.height / 2) * zoom,
    zoom,
  };
}

/** `value` moved to the nearest multiple of `grid`. A grid of 0 or less leaves it alone. */
export const snapTo = (value: number, grid: number): number =>
  grid > 0 ? Math.round(value / grid) * grid : value;

/**
 * How far a group of boxes may move by `dx` without any leaving `extent`: the
 * intersection of each box's own allowance. If the extent is too small for
 * some box, that box's bound wins for the first and the move is pinned.
 */
export function clampMove(
  boxes: readonly Rect[],
  extents: readonly (TranslateExtent | null)[],
  delta: XYPosition,
): XYPosition {
  let { x, y } = delta;
  boxes.forEach((box, i) => {
    const extent = extents[i];
    if (!extent) return;
    const [[minX, minY], [maxX, maxY]] = extent;
    x = Math.max(minX - box.x, Math.min(maxX - box.width - box.x, x));
    y = Math.max(minY - box.y, Math.min(maxY - box.height - box.y, y));
  });
  return { x, y };
}
