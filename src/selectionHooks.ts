import { useContext, useEffect, useRef } from 'react';
import { FlowingerContext } from './context.ts';
import type { Edge, Node } from './types.ts';

/**
 * Calls `onChange` whenever the selection changes, from anywhere inside a
 * canvas — a toolbar or inspector that is not the canvas's own parent. It gets
 * the same `{ nodes, edges }` as the canvas's `onSelectionChange`, and is not
 * called for the selection it finds on mounting.
 */
export function useOnSelectionChange({
  onChange,
}: {
  onChange: (selection: { nodes: Node[]; edges: Edge[] }) => void;
}): void {
  const store = useContext(FlowingerContext);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  useEffect(() => {
    if (!store) return;
    return store.subscribeSelection(() => {
      latest.current(store.getSelection());
    });
  }, [store]);
}
