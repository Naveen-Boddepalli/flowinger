import type { Feature } from '../features.ts';
import type { NodeChange, Rect } from '../types.ts';

export interface ResizeApi {
  /** Reports a node's new box — its size, and its position if the top-left moved. */
  resizeNode: (id: string, next: Rect, resizing: boolean) => void;
  endResize: (id: string) => void;
}

/**
 * What `<NodeResizer>` reports through. It installs this itself, so a canvas needs no `features` entry
 * for it — and one that never draws a resizer never carries it.
 */
export const resizeFeature: Feature<ResizeApi> = {
  name: 'resize',
  install(ctx) {
    /**
     * Resizes a node: its new box, as a `dimensions` change (which writes `width` / `height`) and, if its
     * top-left moved, a `position` change. Reported only — a resize needs somebody applying changes,
     * since the size lives on the node.
     */
    const resizeNode = (id: string, next: Rect, resizing: boolean) => {
      const from = ctx.getNodeRect(id);
      if (!from) return;
      // This *is* the caller hearing the size, so the measurement that follows the
      // re-render need not tell them again — unless the DOM came out different.
      ctx.reported.set(id, { width: next.width, height: next.height });
      const changes: NodeChange[] = [
        {
          type: 'dimensions',
          id,
          dimensions: { width: next.width, height: next.height },
          resizing,
          setAttributes: true,
        },
      ];
      if (next.x !== from.x || next.y !== from.y) {
        changes.push({ type: 'position', id, position: { x: next.x, y: next.y } });
      }
      ctx.emitNodeChanges(changes);
    };

    const endResize = (id: string) => {
      ctx.emitNodeChanges([{ type: 'dimensions', id, resizing: false }]);
    };

    return { resizeNode, endResize };
  },
};
