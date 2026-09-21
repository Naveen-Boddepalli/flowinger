import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** The layer edge labels are drawn into: inside the viewport, so they pan and zoom with the graph. */
export const EdgeLabelHost = createContext<HTMLElement | null>(null);

/**
 * Draws HTML — a button, an input, styled text — at a point of an edge, from
 * inside a custom edge component. The children go to a layer above the edges,
 * in graph space, so position them with a transform from the edge's own numbers:
 *
 * ```tsx
 * <EdgeLabelRenderer>
 *   <div className="nopan" style={{
 *     position: 'absolute', pointerEvents: 'all',
 *     transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
 *   }}>…</div>
 * </EdgeLabelRenderer>
 * ```
 *
 * The layer takes no pointer events itself; give a label `pointerEvents: 'all'`
 * to make it clickable, and `nopan` so a press on it does not pan the canvas.
 * Renders nothing outside a canvas — and on the server, where the layer does not
 * exist yet.
 */
export function EdgeLabelRenderer({ children }: { children?: ReactNode }) {
  const host = useContext(EdgeLabelHost);
  return host ? createPortal(children, host) : null;
}
