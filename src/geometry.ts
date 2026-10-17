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


/** The smallest rectangle holding every rectangle given — a missing one is skipped; null when none is there. */
export function boxAround(rects: Iterable<Rect | null>): Rect | null {
  let box: Rect | null = null;
  for (const r of rects) {
    if (!r) continue;
    if (!box) {
      box = { ...r };
      continue;
    }
    const right = Math.max(box.x + box.width, r.x + r.width);
    const bottom = Math.max(box.y + box.height, r.y + r.height);
    box.x = Math.min(box.x, r.x);
    box.y = Math.min(box.y, r.y);
    box.width = right - box.x;
    box.height = bottom - box.y;
  }
  return box;
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

/** Flowinger's margin round a fit that names none. */
const FIT_PADDING = '40px';

/** One side of a fit's margin: a number, `'20px'`, or `'5%'` of the pane. */
export type PaddingWithUnit = `${number}${'px' | '%'}` | number;
/** A fit's margin, as React Flow writes it: one for every side, or each side (or each axis) apart. */
export type Padding =
  | PaddingWithUnit
  | {
      top?: PaddingWithUnit;
      right?: PaddingWithUnit;
      bottom?: PaddingWithUnit;
      left?: PaddingWithUnit;
      x?: PaddingWithUnit;
      y?: PaddingWithUnit;
    };

interface Sides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * One side's margin in whole pixels, across a pane `size` pixels long. `'20px'` and `'5%'` are as in React Flow.
 * A number is a ratio, as in React Flow 12 — `0.1` leaves a tenth of the bounds' size, split between the two
 * sides; React Flow 13, and flowinger 2.0, read it as pixels.
 */
function sidePadding(padding: PaddingWithUnit, size: number): number {
  if (typeof padding === 'number') return Math.floor((size - size / (1 + padding)) * 0.5);
  const value = parseFloat(padding);
  if (Number.isNaN(value)) return 0;
  if (padding.endsWith('%')) return Math.floor(size * value * 0.01);
  return padding.endsWith('px') ? Math.floor(value) : 0;
}

function sidesOf(padding: Padding, width: number, height: number): Sides {
  if (typeof padding !== 'object') {
    const x = sidePadding(padding, width);
    const y = sidePadding(padding, height);
    return { top: y, right: x, bottom: y, left: x };
  }
  return {
    top: sidePadding(padding.top ?? padding.y ?? 0, height),
    right: sidePadding(padding.right ?? padding.x ?? 0, width),
    bottom: sidePadding(padding.bottom ?? padding.y ?? 0, height),
    left: sidePadding(padding.left ?? padding.x ?? 0, width),
  };
}

/**
 * The viewport that shows `bounds` in a `width` × `height` pane, centred: `getViewportForBounds`, with flowinger's
 * margin — a fixed 40 px on every side — where none is given, and never dividing by a zero-sized box.
 *
 * A number is a ratio, as in React Flow 12: `0.1` leaves a tenth of the bounds' size around them. `'20px'`, `'5%'`
 * and per-side margins are React Flow's, and mean the same in 2.0.
 */
export function viewportForBounds(
  bounds: Rect,
  width: number,
  height: number,
  minZoom: number,
  maxZoom: number,
  padding: Padding = FIT_PADDING,
): Viewport {
  const sized = { ...bounds, width: Math.max(bounds.width, 1), height: Math.max(bounds.height, 1) };
  return getViewportForBounds(sized, width, height, minZoom, maxZoom, padding);
}

/**
 * React Flow's `getViewportForBounds`, to the pixel: the margin in whole pixels on each side, and the view
 * nudged where the fit leaves less than that. A number is a ratio here, as in React Flow 12 (`0.1` leaves a tenth
 * around the bounds); `'20px'`, `'5%'` and per-side margins are as in React Flow. With none there is no margin at
 * all (`viewportForBounds` leaves 40 px).
 */
export function getViewportForBounds(
  bounds: Rect,
  width: number,
  height: number,
  minZoom: number,
  maxZoom: number,
  padding: Padding = 0,
): Viewport {
  const p = sidesOf(padding, width, height);
  const raw = Math.min((width - p.left - p.right) / bounds.width, (height - p.top - p.bottom) / bounds.height);
  const zoom = Math.max(minZoom, Math.min(maxZoom, raw));
  const x = width / 2 - (bounds.x + bounds.width / 2) * zoom;
  const y = height / 2 - (bounds.y + bounds.height / 2) * zoom;
  // What the fit leaves on each side, in whole pixels; short of what was asked, the view moves by the shortfall.
  const left = Math.floor(bounds.x * zoom + x);
  const top = Math.floor(bounds.y * zoom + y);
  const right = Math.floor(width - ((bounds.x + bounds.width) * zoom + x));
  const bottom = Math.floor(height - ((bounds.y + bounds.height) * zoom + y));
  return {
    x: x - Math.min(left - p.left, 0) + Math.min(right - p.right, 0),
    y: y - Math.min(top - p.top, 0) + Math.min(bottom - p.bottom, 0),
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
