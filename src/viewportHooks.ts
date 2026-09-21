import { useContext, useEffect, useRef } from 'react';
import { FlowingerContext } from './context.ts';
import type { Viewport } from './types.ts';

export interface UseOnViewportChangeOptions {
  /** The view began to move: `viewport` is where it was. */
  onStart?: (viewport: Viewport) => void;
  /** The view moved: `viewport` is where it is now. */
  onChange?: (viewport: Viewport) => void;
  /** It stopped: a pan or pinch let go, the wheel went quiet, a move by `fitView` landed. */
  onEnd?: (viewport: Viewport) => void;
}

/**
 * Hears the view move, from anywhere inside a canvas — a toolbar that shows the zoom, say. The same moves
 * the canvas's `onMoveStart`, `onMove` and `onMoveEnd` report, without their event.
 */
export function useOnViewportChange({ onStart, onChange, onEnd }: UseOnViewportChangeOptions): void {
  const store = useContext(FlowingerContext);
  const latest = useRef({ onStart, onChange, onEnd });
  useEffect(() => {
    latest.current = { onStart, onChange, onEnd };
  });
  useEffect(() => {
    if (!store) return;
    return store.onMove({
      onMoveStart: (_event, viewport) => {
        latest.current.onStart?.(viewport);
      },
      onMove: (_event, viewport) => {
        latest.current.onChange?.(viewport);
      },
      onMoveEnd: (_event, viewport) => {
        latest.current.onEnd?.(viewport);
      },
    });
  }, [store]);
}
