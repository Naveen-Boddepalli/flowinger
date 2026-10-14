import type { Feature } from '../features.ts';
import { isRectIntersecting } from '../geometry.ts';
import type { Edge, Node, Rect } from '../types.ts';

/** More than this many changed nodes (with what is inside them) and it is cheaper to look at all of them. */
const INCREMENTAL_LIMIT = 256;

/** The region round the view, as a share of the view on each side: a node is drawn a little before it slides in. */
const MARGIN = 0.25;

/**
 * How much bigger than the view (on each side) the region worked out last time may be and still be kept: past
 * this, after a zoom in, it would keep drawing many nodes now far out of view.
 */
const KEEP_LIMIT = 3;

/**
 * What was worked out last time, and what it was worked out from.
 */
interface Memo {
  edges: readonly Edge[];
  nodeCount: number;
  /** The view and the pane it was judged against. */
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
  /** Who was being dragged: a node being dragged is drawn wherever it is. */
  dragging: string;
  region: Rect;
  /** The nodes in view, and the indices of the edges to draw. Not written to once published. */
  nodeIds: ReadonlySet<string>;
  edgeIndices: Set<number>;
  /** The edges that touch each node, by index — made when an incremental pass first wants it. */
  edgesOf: Map<string, number[]> | null;
}

/**
 * `onlyRenderVisibleElements`: draws only the nodes and edges in (or near) view, and tells the canvas
 * only when that set changes — a pan that reveals nothing new costs no render. Off, or before the pane
 * has a size, everything counts (a null set).
 *
 * The set is worked out for every node when the lists change, or when the view leaves the region (the view
 * and a margin round it) it was last worked out for. A pan or zoom that stays inside that region costs nothing:
 * every node in view is already drawn. When only some nodes changed — a drag, a measurement, a selection —
 * only those, what is inside them, and the edges that touch them are looked at again: ten thousand nodes are
 * not asked about for one that moved.
 */
export const cullingFeature: Feature = {
  name: 'culling',
  install(ctx) {
    let memo: Memo | null = null;

    const publish = (nodeIds: ReadonlySet<string>, edgeIndices: Set<number>, edges: readonly Edge[]) => {
      // The edge layer draws them in this order, and a later edge is above an earlier one.
      const ordered = [...edgeIndices].sort((a, b) => a - b);
      const edgeIds = new Set<string>();
      for (const i of ordered) edgeIds.add((edges[i] as Edge).id);
      ctx.setVisible({ nodes: nodeIds, edges: edgeIds });
    };

    const recompute = () => {
      // Asked every time, so what it holds does not grow: it is the changes since this last ran.
      const dirty = ctx.takeDirtyNodes();
      const pane = ctx.options.onlyRenderVisibleElements ? ctx.paneSize() : null;
      if (!pane) {
        memo = null;
        if (ctx.visible !== null) ctx.setVisible(null);
        return;
      }
      const { viewport } = ctx;
      const zoom = viewport.zoom;
      const nodes = ctx.nodes;
      const edges = ctx.edges;
      // A selection that changes names the nodes (a controlled flow replaces them) or says so outright (the
      // engine's own) — so what is selected is not part of what is remembered.
      const dragging = ctx.draggingIds.size === 0 ? '' : [...ctx.draggingIds].sort().join('|');

      // What is in view now, in graph units.
      const view: Rect = { x: -viewport.x / zoom, y: -viewport.y / zoom, width: pane.width / zoom, height: pane.height / zoom };

      const known = memo;
      if (
        known &&
        dirty !== null &&
        dirty.size <= INCREMENTAL_LIMIT &&
        known.edges === edges &&
        known.nodeCount === nodes.length &&
        known.width === pane.width &&
        known.height === pane.height &&
        known.dragging === dragging &&
        keeps(known.region, view)
      ) {
        // The region still holds the view: what was drawn for it still covers everything in view.
        const moved = { ...known, x: viewport.x, y: viewport.y, zoom };
        if (dirty.size === 0) {
          memo = moved;
          return;
        }
        if (incremental(moved, dirty, nodes, edges)) return;
      }

      const region: Rect = {
        x: view.x - view.width * MARGIN,
        y: view.y - view.height * MARGIN,
        width: view.width * (1 + 2 * MARGIN),
        height: view.height * (1 + 2 * MARGIN),
      };
      // Each node's box once, for the nodes and again for the edges between nodes out of view.
      const rects = new Map<string, Rect>();
      const nodeIds = new Set<string>();
      for (const n of nodes) if (drawsNode(n, region, rects)) nodeIds.add(n.id);
      const edgeIndices = new Set<number>();
      edges.forEach((e, i) => {
        if (drawsEdge(e, nodeIds, region, rects)) edgeIndices.add(i);
      });

      memo = {
        edges,
        nodeCount: nodes.length,
        x: viewport.x,
        y: viewport.y,
        zoom,
        width: pane.width,
        height: pane.height,
        dragging,
        region,
        nodeIds,
        edgeIndices,
        edgesOf: null,
      };
      const published = ctx.visible;
      if (published && sameSet(published.nodes, nodeIds) && sameEdges(published.edges, edges, edgeIndices)) return;
      publish(nodeIds, edgeIndices, edges);
    };

    /**
     * Looks again at `dirty` and what is inside them, and at the edges that touch any of those. False when it
     * cannot — a node is not there — and then everything is looked at.
     */
    const incremental = (known: Memo, dirty: ReadonlySet<string>, nodes: readonly Node[], edges: readonly Edge[]) => {
      // Inside a node that moved, everything moved.
      const again = new Set<string>();
      const add = (id: string) => {
        if (again.has(id)) return;
        again.add(id);
        for (const child of ctx.childrenOf.get(id) ?? []) add(child);
      };
      for (const id of dirty) add(id);
      if (again.size > INCREMENTAL_LIMIT) return false;

      let nodeIds: Set<string> | null = null;
      for (const id of again) {
        const n = ctx.nodeById.get(id);
        if (!n) return false;
        const inView = drawsNode(n, known.region);
        if ((nodeIds ?? known.nodeIds).has(id) === inView) continue;
        nodeIds ??= new Set(known.nodeIds);
        if (inView) nodeIds.add(id);
        else nodeIds.delete(id);
      }
      const current = nodeIds ?? known.nodeIds;

      // The edges these nodes have, now that they are where they are.
      known.edgesOf ??= edgesByNode(edges);
      let edgeIndices: Set<number> | null = null;
      for (const id of again) {
        for (const i of known.edgesOf.get(id) ?? []) {
          const draw = drawsEdge(edges[i] as Edge, current, known.region);
          if ((edgeIndices ?? known.edgeIndices).has(i) === draw) continue;
          edgeIndices ??= new Set(known.edgeIndices);
          if (draw) edgeIndices.add(i);
          else edgeIndices.delete(i);
        }
      }

      memo = { ...known, nodeCount: nodes.length, nodeIds: current, edgeIndices: edgeIndices ?? known.edgeIndices };
      // Nothing came or went from view: nothing to say, and nothing to draw again.
      if (nodeIds === null && edgeIndices === null) return true;
      publish(current, memo.edgeIndices, edges);
      return true;
    };

    /** A node's box on the canvas — from `cache` when this pass has worked it out already. */
    const rectOf = (n: Node, cache?: Map<string, Rect>): Rect => {
      let rect = cache?.get(n.id);
      if (!rect) {
        const at = ctx.absolutePosition(n);
        const size = ctx.getNodeSize(n);
        rect = { x: at.x, y: at.y, width: size.width, height: size.height };
        cache?.set(n.id, rect);
      }
      return rect;
    };

    /** A node is drawn if it is in the region — or selected or being dragged, wherever it is. */
    const drawsNode = (n: Node, region: Rect, cache?: Map<string, Rect>): boolean =>
      n.hidden !== true &&
      (ctx.isSelected(n.id) || ctx.draggingIds.has(n.id) || isRectIntersecting(rectOf(n, cache), region, true));

    /** An edge, if either end is drawn — or it crosses the region between two that are not. */
    const drawsEdge = (e: Edge, nodeIds: ReadonlySet<string>, region: Rect, cache?: Map<string, Rect>): boolean => {
      if (e.hidden === true) return false;
      if (nodeIds.has(e.source) || nodeIds.has(e.target)) return true;
      const a = ctx.nodeById.get(e.source);
      const b = ctx.nodeById.get(e.target);
      return a !== undefined && b !== undefined && crosses(rectOf(a, cache), rectOf(b, cache), region);
    };

    ctx.on('change', recompute);
    recompute();
    return {};
  },
};

/**
 * Whether a region worked out earlier still serves `view`: it holds all of it, and is not so much bigger (after
 * a zoom in) that it would keep many nodes drawn that are far from view.
 */
function keeps(region: Rect, view: Rect): boolean {
  return (
    view.x >= region.x &&
    view.y >= region.y &&
    view.x + view.width <= region.x + region.width &&
    view.y + view.height <= region.y + region.height &&
    region.width <= view.width * KEEP_LIMIT &&
    region.height <= view.height * KEEP_LIMIT
  );
}

/** Whether the box that holds both of two nodes reaches the region: the line between them may cross it. */
function crosses(a: Rect, b: Rect, region: Rect): boolean {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const span = {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
  return isRectIntersecting(span, region, true);
}

function edgesByNode(edges: readonly Edge[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const put = (id: string, i: number) => {
    const list = out.get(id);
    if (list) list.push(i);
    else out.set(id, [i]);
  };
  edges.forEach((e, i) => {
    put(e.source, i);
    if (e.target !== e.source) put(e.target, i);
  });
  return out;
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/** Whether the ids already published are the edges at `indices`, in the list's order. */
function sameEdges(published: ReadonlySet<string>, edges: readonly Edge[], indices: ReadonlySet<number>): boolean {
  if (published.size !== indices.size) return false;
  const ordered = [...indices].sort((a, b) => a - b);
  const mine = published.values();
  for (const i of ordered) if ((edges[i] as Edge).id !== mine.next().value) return false;
  return true;
}
