import type { Feature } from '../features.ts';
import { isRectIntersecting } from '../geometry.ts';
import type { Rect } from '../types.ts';

/**
 * `onlyRenderVisibleElements`: draws only the nodes and edges in (or near) view, and tells the canvas
 * only when that set changes — a pan that reveals nothing new costs no render. Off, or before the pane
 * has a size, everything counts (a null set).
 */
export const cullingFeature: Feature = {
  name: 'culling',
  install(ctx) {
    const recompute = () => {
      const pane = ctx.options.onlyRenderVisibleElements ? ctx.paneSize() : null;
      if (!pane) {
        if (ctx.visible !== null) ctx.setVisible(null);
        return;
      }
      const { viewport } = ctx;
      const zoom = viewport.zoom;
      const left = -viewport.x / zoom;
      const top = -viewport.y / zoom;
      const width = pane.width / zoom;
      const height = pane.height / zoom;
      // A margin, so a node is drawn a little before it slides into view.
      const region: Rect = {
        x: left - width * 0.25,
        y: top - height * 0.25,
        width: width * 1.5,
        height: height * 1.5,
      };
      const rects = new Map<string, Rect>();
      const nodeIds = new Set<string>();
      for (const n of ctx.nodes) {
        const at = ctx.absolutePosition(n);
        const rect = { x: at.x, y: at.y, ...ctx.getNodeSize(n) };
        rects.set(n.id, rect);
        if (n.hidden === true) continue;
        if (ctx.isSelected(n.id) || ctx.draggingIds.has(n.id) || isRectIntersecting(rect, region, true)) {
          nodeIds.add(n.id);
        }
      }
      const edgeIds = new Set<string>();
      for (const e of ctx.edges) {
        if (e.hidden === true) continue;
        if (nodeIds.has(e.source) || nodeIds.has(e.target)) {
          edgeIds.add(e.id);
          continue;
        }
        // Both ends out of view: still worth drawing if the line between them crosses it.
        const a = rects.get(e.source);
        const b = rects.get(e.target);
        if (!a || !b) continue;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const span = {
          x,
          y,
          width: Math.max(a.x + a.width, b.x + b.width) - x,
          height: Math.max(a.y + a.height, b.y + b.height) - y,
        };
        if (isRectIntersecting(span, region, true)) edgeIds.add(e.id);
      }
      const same = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
        a.size === b.size && [...a].every((id) => b.has(id));
      const known = ctx.visible;
      if (known && same(known.nodes, nodeIds) && same(known.edges, edgeIds)) return;
      ctx.setVisible({ nodes: nodeIds, edges: edgeIds });
    };
    ctx.on('change', recompute);
    recompute();
    return {};
  },
};
