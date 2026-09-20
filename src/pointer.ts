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
