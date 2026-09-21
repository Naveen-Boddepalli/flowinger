import { useCallback } from 'react';
import { useFlowingerStore } from './context.ts';

/**
 * Returns a function that has the canvas read a node's size, and where its handles are, again — for when a
 * node's own component changes what it is made of without the canvas being told: handles added, removed or
 * moved (`style`, `position`). Give it a node id, or a list of them. It waits a frame, so the change has been
 * drawn — call it in the same breath as the state change.
 */
export function useUpdateNodeInternals(): (id: string | readonly string[]) => void {
  const store = useFlowingerStore();
  return useCallback(
    (id) => {
      const ids = typeof id === 'string' ? [id] : id;
      requestAnimationFrame(() => {
        for (const one of ids) store.remeasure(one);
      });
    },
    [store],
  );
}
