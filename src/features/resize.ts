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
      // The boxes are top-left corners; a position is where the node's origin is. With an origin, a size
      // change alone moves it (a node centred on its position grows about that centre).
      const node = ctx.nodeById.get(id);
      const [ox, oy] = node?.origin ?? ctx.options.nodeOrigin;
      const was = { x: from.x + ox * from.width, y: from.y + oy * from.height };
      const now = { x: next.x + ox * next.width, y: next.y + oy * next.height };
      if (now.x !== was.x || now.y !== was.y) {
        changes.push({ type: 'position', id, position: now });
      }
      ctx.emitNodeChanges(changes);
    };

    const endResize = (id: string) => {
      ctx.emitNodeChanges([{ type: 'dimensions', id, resizing: false }]);
    };

    return { resizeNode, endResize };
  },
};
