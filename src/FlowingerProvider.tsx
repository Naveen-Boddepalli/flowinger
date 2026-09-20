import { useState, type ReactNode } from 'react';
import { FlowingerContext } from './context.ts';
import { createFlowingerStore } from './store.ts';
import type { Viewport } from './types.ts';

export interface FlowingerProviderProps {
  children: ReactNode;
  initialViewport?: Viewport | undefined;
  /** Zoom limits until a canvas is mounted; the canvas's own props take over then. */
  minZoom?: number | undefined;
  maxZoom?: number | undefined;
}

/**
 * Owns the engine's state, so that things outside the canvas — a toolbar
 * rendered into a panel header, say — can drive the viewport through
 * `useFlowinger()`. `<FlowingerCanvas>` makes its own when there is none.
 */
export function FlowingerProvider({
  children,
  initialViewport,
  minZoom = 0.05,
  maxZoom = 2,
}: FlowingerProviderProps) {
  const [store] = useState(() => createFlowingerStore(initialViewport, { minZoom, maxZoom }));
  return <FlowingerContext.Provider value={store}>{children}</FlowingerContext.Provider>;
}
