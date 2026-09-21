import type { Viewport, XYPosition } from './types.ts';

/**
 * How far a pointer must travel, in screen pixels, before a press becomes a
 * drag. Below it the press is still a click — and pointer capture, which would
 * retarget the eventual `click` to the capturing element, has not been taken.
 */
export const DRAG_THRESHOLD = 3;

/** Elements a press on which is theirs, not the canvas's. `nodrag`/`nopan` are React Flow's opt-outs. */
const INTERACTIVE = 'input, select, textarea, button, a, .nodrag, .nopan';

export const isInteractive = (target: EventTarget): boolean =>
  target instanceof Element && target.closest(INTERACTIVE) !== null;

/** Whether a key pressed on `target` is text being edited, and so not the canvas's to act on. */
export const isEditable = (target: EventTarget): boolean =>
  target instanceof Element &&
  target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !== null;

// jsdom implements neither call, and a real browser throws if the pointer is
// no longer active — so both are best-effort.
export function capturePointer(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // Not supported, or the pointer is already gone.
  }
}

export function releasePointer(el: Element, pointerId: number): void {
  try {
    el.releasePointerCapture(pointerId);
  } catch {
    // Not held.
  }
}

export interface PinchStart {
  /** The viewport when the second finger landed. */
  viewport: Viewport;
  /** The midpoint of the two fingers then, in container pixels. */
  mid: XYPosition;
  /** The distance between them then. */
  dist: number;
}

export const midpoint = (a: XYPosition, b: XYPosition): XYPosition => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

export const distance = (a: XYPosition, b: XYPosition): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The viewport for a pinch that has moved to midpoint `mid` and finger
 * distance `dist`: the zoom scales with the distance, and the graph point that
 * started under the fingers' midpoint stays under it — so the same gesture
 * pans and zooms together, with no drift between the two.
 */
export function pinchViewport(
  start: PinchStart,
  mid: XYPosition,
  dist: number,
  minZoom: number,
  maxZoom: number,
): Viewport {
  if (start.dist === 0) return start.viewport;
  const { viewport, mid: from } = start;
  const zoom = Math.max(minZoom, Math.min(maxZoom, viewport.zoom * (dist / start.dist)));
  const graphX = (from.x - viewport.x) / viewport.zoom;
  const graphY = (from.y - viewport.y) / viewport.zoom;
  return { x: mid.x - graphX * zoom, y: mid.y - graphY * zoom, zoom };
}
