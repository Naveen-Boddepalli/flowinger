import type { Node, NodeOrigin, Rect, TranslateExtent, Viewport, XYPosition } from './types.ts';

export interface Size {
  width: number;
  height: number;
}

/**
 * The size a node is assumed to be until it has been measured, and the size
 * `fitView` uses for a node that never reports one (jsdom, `display: none`).
 */
export const FALLBACK_SIZE: Size = { width: 150, height: 40 };

/** What a node measured, else what it declared, else what it says it will be, else the fallback. */
export const sizeOfNode = (node: Node): Size => ({
  width: node.measured?.width ?? node.width ?? node.initialWidth ?? FALLBACK_SIZE.width,
  height: node.measured?.height ?? node.height ?? node.initialHeight ?? FALLBACK_SIZE.height,
});

/** The smallest rectangle holding every node. Empty in, an empty rectangle out. */
export function getNodesBounds(nodes: readonly Node[], options?: { nodeOrigin?: NodeOrigin }): Rect {
  if (nodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const { width, height } = sizeOfNode(node);
    const origin = node.origin ?? options?.nodeOrigin ?? [0, 0];
    const x = node.position.x - origin[0] * width;
    const y = node.position.y - origin[1] * height;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
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

/**
 * React Flow's `getViewportForBounds`, for the numeric `padding` it shares with this library — a ratio, so
 * `0.1` leaves a tenth around the bounds — and the same view to the pixel: it too works in whole pixels of
 * padding, and nudges the view where the fit leaves less than that. With none there is no margin at all
 * (`viewportForBounds` leaves 40 px). React Flow's `'10px'`, `'5%'` and per-side paddings are not taken.
 */
export function getViewportForBounds(
  bounds: Rect,
  width: number,
  height: number,
  minZoom: number,
  maxZoom: number,
  padding = 0,
): Viewport {
  const padX = Math.floor((width - width / (1 + padding)) * 0.5);
  const padY = Math.floor((height - height / (1 + padding)) * 0.5);
  const raw = Math.min((width - padX * 2) / bounds.width, (height - padY * 2) / bounds.height);
  const zoom = Math.max(minZoom, Math.min(maxZoom, raw));
  const x = width / 2 - (bounds.x + bounds.width / 2) * zoom;
  const y = height / 2 - (bounds.y + bounds.height / 2) * zoom;
  // What the fit leaves on each side, in whole pixels; short of what was asked, the view moves by the shortfall.
  const left = Math.floor(bounds.x * zoom + x);
  const top = Math.floor(bounds.y * zoom + y);
  const right = Math.floor(width - ((bounds.x + bounds.width) * zoom + x));
  const bottom = Math.floor(height - ((bounds.y + bounds.height) * zoom + y));
  return {
    x: x - Math.min(left - padX, 0) + Math.min(right - padX, 0),
    y: y - Math.min(top - padY, 0) + Math.min(bottom - padY, 0),
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
