import type { Feature } from '../features.ts';
import type { XYPosition } from '../types.ts';

/** How near the pane's edge, in pixels, auto-pan starts. */
const AUTO_PAN_EDGE = 40;
const FRAME_MS = 1000 / 60;

export interface AutoPanApi {
  /**
   * Keeps panning the view while `getPointer` reports the pointer near the edge of the
   * pane — the nearer, the faster, and at full speed once it is outside — and calls
   * `onPan` after each step so whatever is being dragged can catch up with the graph
   * that moved under it. Stops when the returned function is called. Does nothing for a
   * gesture the options have switched off.
   */
  beginAutoPan: (
    kind: 'node' | 'connect' | 'select',
    getPointer: () => XYPosition | null,
    onPan: () => void,
  ) => () => void;
  /** What the canvas was last given for `autoPanOnSelection`; written by `boxSelectFeature`. */
  readonly config: { select: boolean };
}

/** Panning the view by itself when a drag is held at its edge. Dragging and connecting need it. */
export const autoPanFeature: Feature<AutoPanApi> = {
  name: 'autoPan',
  install(ctx) {
    const config: AutoPanApi['config'] = { select: true };
    const beginAutoPan: AutoPanApi['beginAutoPan'] = (kind, getPointer, onPan) => {
      const on =
        kind === 'node'
          ? ctx.options.autoPanOnNodeDrag
          : kind === 'connect'
            ? ctx.options.autoPanOnConnect
            : config.select;
      if (!on) return () => {};
      let frame = 0;
      let last = 0;
      let stopped = false;
      const towards = (pos: number, size: number): number =>
        pos < AUTO_PAN_EDGE
          ? 1 - Math.max(pos, 0) / AUTO_PAN_EDGE
          : pos > size - AUTO_PAN_EDGE
            ? -(1 - Math.max(size - pos, 0) / AUTO_PAN_EDGE)
            : 0;
      const tick = (now: number) => {
        if (stopped) return;
        frame = requestAnimationFrame(tick);
        const pointer = getPointer();
        const pane = ctx.paneSize();
        const rect = ctx.container?.getBoundingClientRect();
        const elapsed = last === 0 ? 1 : Math.min(3, (now - last) / FRAME_MS);
        last = now;
        if (!pointer || !pane || !rect) return;
        const step = ctx.options.autoPanSpeed * elapsed;
        const dx = towards(pointer.x - rect.left, pane.width) * step;
        const dy = towards(pointer.y - rect.top, pane.height) * step;
        if (dx === 0 && dy === 0) return;
        const { viewport } = ctx;
        void ctx.setViewport({ x: viewport.x + dx, y: viewport.y + dy, zoom: viewport.zoom });
        onPan();
      };
      frame = requestAnimationFrame(tick);
      return () => {
        stopped = true;
        cancelAnimationFrame(frame);
      };
    };
    return { beginAutoPan, config };
  },
};
