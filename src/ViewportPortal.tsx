import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** The layer `ViewportPortal` draws into: inside the viewport, above the nodes and the edge labels. */
export const ViewportPortalHost = createContext<HTMLElement | null>(null);

/**
 * Draws your own elements in the graph's coordinate space: they pan and zoom
 * with the diagram, and sit above its nodes. Position them with a
 * `transform: translate(x px, y px)` in graph units — a tooltip pinned to a
 * node, a grid of guide lines, a selection ring.
 *
 * The layer takes no pointer events itself; give an element `pointerEvents:
 * 'all'` to make it clickable. Renders nothing outside a canvas, or on the
 * server, where the layer does not exist yet.
 */
export function ViewportPortal({ children }: { children?: ReactNode }) {
  const host = useContext(ViewportPortalHost);
  return host ? createPortal(children, host) : null;
}
