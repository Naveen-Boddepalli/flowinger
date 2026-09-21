import { useSyncExternalStore } from 'react';
import { useFlowingerStore } from './context.ts';

/** The rectangle dragged out to select with: in pane pixels, over the diagram. */
export function SelectionBox() {
  const store = useFlowingerStore();
  const rect = useSyncExternalStore(store.subscribeSelectionRect, store.getSelectionRect, () => null);
  if (!rect) return null;
  return (
    <div
      className="flowinger-selection react-flow__selection"
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        boxSizing: 'border-box',
        border: '1px dashed var(--flowinger-selected, #38bdf8)',
        background: 'color-mix(in srgb, var(--flowinger-selected, #38bdf8) 12%, transparent)',
        pointerEvents: 'none',
        zIndex: 4,
      }}
    />
  );
}
