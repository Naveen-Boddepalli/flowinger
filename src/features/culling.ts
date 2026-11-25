import type { Feature } from '../features.ts';
import { isRectIntersecting, sizeOfNode } from '../geometry.ts';
import type { VisibleSet } from '../store.ts';
import type { Edge, Node, NodeOrigin, Rect, Viewport, XYPosition } from '../types.ts';

/** More than this many changed nodes (with what is inside them) and it is cheaper to look at all of them. */
const INCREMENTAL_LIMIT = 256;

/** The region round the view, as a share of the view on each side: a node is drawn a little before it slides in. */
const MARGIN = 0.25;

/**
 * The pane assumed for {@link firstVisible}, before there is one to measure: a common screen. The same on a
 * server and in the browser, so the two first renders agree and hydration matches.
 */
const ASSUMED_PANE = { width: 1920, height: 1080 };

/**
 * How much bigger than the view (on each side) the region worked out last time may be and still be kept: past
 * this, after a zoom in, it would keep drawing many nodes now far out of view.
 */
const KEEP_LIMIT = 3;

/** A cell of the grid, in graph units: a few nodes across. */
const CELL = 400;

/** A box over more cells of the grid than this is kept apart and asked every time: a big group, a long edge. */
const WIDE = 64;

/**
 * What is where, by the cells of a grid: a pass asks about what is in the cells the region covers, not about
 * everything. `at` is the cells each one is in, so that it can be taken out when it moves; a wide one is in a
 * cell of its own (-1), asked every time.
 */
interface Cells<K> {
  cells: Map<number, K[]>;
  at: Map<K, number[]>;
}

/** The nodes' boxes, and the box round each edge's two nodes, in cells; with the edges they were made from. */
interface Grid {
  boxes: Map<string, Rect>;
  nodes: Cells<string>;
  spans: Cells<number>;
  edges: readonly Edge[];
  /** The edges that touch each node, by index. */
  of: Map<string, number[]>;
}

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
 * The set is worked out again when the lists change, or when the view leaves the region (the view and a margin
 * round it) it was last worked out for. A pan or zoom that stays inside that region costs nothing: every node in
 * view is already drawn. When only some nodes changed — a drag, a measurement, a selection — only those, what is
 * inside them, and the edges that touch them are looked at again: ten thousand nodes are not asked about for one
 * that moved. And a pass that does run asks only about what is near the region, from a grid of where every node
 * and edge is: made when the lists change, and kept in step with the nodes that move.
 */
export const cullingFeature: Feature = {
  name: 'culling',
  firstVisible,
  install(ctx) {
    let memo: Memo | null = null;
    /** Made at a pass after one that asked every node with nothing changed between: not for a list that keeps changing. */
    let grid: Grid | null = null;
    let settled = false;

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
        grid = null;
        settled = false;
        if (ctx.visible !== null) ctx.setVisible(null);
        return;
      }
      const { viewport } = ctx;
      const zoom = viewport.zoom;
      const nodes = ctx.nodes;
      const edges = ctx.edges;
      // The grid follows what moved, or is made again at the next pass that needs it.
      const again = dirty && withChildren(dirty);
      // Nodes that came or went say so: every node changed.
      if (!again) settled = false;
      if (grid && (!settled || !again?.every((id) => place(grid as Grid, id)))) grid = null;
      if (grid && grid.edges !== edges) spanAll(grid, edges);
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
        if (again && incremental(moved, again, nodes, edges)) return;
      }

      const region: Rect = {
        x: view.x - view.width * MARGIN,
        y: view.y - view.height * MARGIN,
        width: view.width * (1 + 2 * MARGIN),
        height: view.height * (1 + 2 * MARGIN),
      };
      if (settled) grid ??= build(nodes, edges);
      const g = grid;
      // Each node's box once, for the nodes and again for the edges between nodes out of view.
      const rects = g ? g.boxes : new Map<string, Rect>();
      const nodeIds = new Set<string>();
      const edgeIndices = new Set<number>();
      const ask = (n: Node | undefined) => {
        if (n && !nodeIds.has(n.id) && drawsNode(n, region, rects)) nodeIds.add(n.id);
      };
      const draw = (i: number) => {
        if (!edgeIndices.has(i) && drawsEdge(edges[i] as Edge, nodeIds, region, rects)) edgeIndices.add(i);
      };
      // Far out, the region covers more cells than there are nodes: then everything is asked.
      const keys = g && cellsOf(region, nodes.length);
      if (g && keys) {
        // What is near the region — an edge of a node in it reaches it — and the nodes drawn wherever they are.
        keys.push(-1);
        for (const key of keys) g.nodes.cells.get(key)?.forEach((id) => ask(ctx.nodeById.get(id)));
        const anywhere = [...ctx.selectedNodeIds(), ...ctx.draggingIds];
        for (const id of anywhere) ask(ctx.nodeById.get(id));
        for (const key of keys) g.spans.cells.get(key)?.forEach(draw);
        for (const id of anywhere) g.of.get(id)?.forEach(draw);
      } else {
        nodes.forEach(ask);
        edges.forEach((_, i) => draw(i));
        settled = true;
      }

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

    /** The nodes that moved and what is inside them, for inside a node that moved everything moved; null past the limit. */
    const withChildren = (dirty: ReadonlySet<string>): string[] | null => {
      const again = new Set<string>();
      const add = (id: string) => {
        if (again.has(id)) return;
        again.add(id);
        for (const child of ctx.childrenOf.get(id) ?? []) add(child);
      };
      for (const id of dirty) add(id);
      return again.size > INCREMENTAL_LIMIT ? null : [...again];
    };

    /**
     * Looks again at the nodes that moved (`again`, with what is inside them), and at the edges that touch any of
     * those. False when it cannot — a node is not there — and then a whole pass runs.
     */
    const incremental = (known: Memo, again: readonly string[], nodes: readonly Node[], edges: readonly Edge[]) => {
      const boxes = grid?.boxes;
      let nodeIds: Set<string> | null = null;
      for (const id of again) {
        const n = ctx.nodeById.get(id);
        if (!n) return false;
        const inView = drawsNode(n, known.region, boxes);
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
          const draw = drawsEdge(edges[i] as Edge, current, known.region, boxes);
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

    /** The grid, made from every node and edge. */
    const build = (nodes: readonly Node[], edges: readonly Edge[]): Grid => {
      const g: Grid = { boxes: new Map(), nodes: cells(), spans: cells(), edges, of: new Map() };
      for (const n of nodes) put(g.nodes, n.id, rectOf(n, g.boxes));
      spanAll(g, edges);
      return g;
    };

    /** A node that moved, and its edges, put where they now are. False if it is not there. */
    const place = (g: Grid, id: string): boolean => {
      const n = ctx.nodeById.get(id);
      if (!n) return false;
      g.boxes.delete(id);
      put(g.nodes, id, rectOf(n, g.boxes));
      g.of.get(id)?.forEach((i) => span(g, i));
      return true;
    };

    /** The edges, all put again: the list changed. */
    const spanAll = (g: Grid, edges: readonly Edge[]) => {
      g.edges = edges;
      g.of = edgesByNode(edges);
      g.spans = cells();
      edges.forEach((_, i) => span(g, i));
    };

    /** An edge in the cells the box round its two nodes covers; nowhere while either is missing. */
    const span = (g: Grid, i: number) => {
      const e = g.edges[i] as Edge;
      const a = g.boxes.get(e.source);
      const b = g.boxes.get(e.target);
      put(g.spans, i, a && b ? around(a, b) : null);
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
 * The set for a render before the store has one. The nodes and options reach the store in layout effects, after
 * the first render — which would otherwise draw every node, measure it, and drop all but the few in view. This
 * judges the props instead: the nodes as declared (positions, and sizes where given), against the view and an
 * assumed pane. Selected nodes are drawn wherever they are, hidden ones never, and an edge with either end
 * drawn. It need only be close: in the browser the store's own set replaces it before the first paint; a
 * server's HTML is drawn from it, which covers what is in view on a screen up to the assumed size.
 */
function firstVisible(nodes: readonly Node[], edges: readonly Edge[], viewport: Viewport, origin: NodeOrigin): VisibleSet {
  const zoom = viewport.zoom;
  const width = ASSUMED_PANE.width / zoom;
  const height = ASSUMED_PANE.height / zoom;
  const region: Rect = {
    x: -viewport.x / zoom - width * MARGIN,
    y: -viewport.y / zoom - height * MARGIN,
    width: width * (1 + 2 * MARGIN),
    height: height * (1 + 2 * MARGIN),
  };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const placed = new Map<string, XYPosition>();
  /** Where a node's top-left is on the canvas: its position, less its origin, plus its parents' (a few deep). */
  const at = (n: Node, depth = 0): XYPosition => {
    const known = placed.get(n.id);
    if (known) return known;
    const size = sizeOfNode(n);
    const [ox, oy] = n.origin ?? origin;
    let x = n.position.x - ox * size.width;
    let y = n.position.y - oy * size.height;
    const parent = n.parentId === undefined ? undefined : byId.get(n.parentId);
    if (parent && depth < 32) {
      const p = at(parent, depth + 1);
      x += p.x;
      y += p.y;
    }
    const point = { x, y };
    placed.set(n.id, point);
    return point;
  };

  const nodeIds = new Set<string>();
  for (const n of nodes) {
    if (n.hidden === true) continue;
    if (n.selected === true) {
      nodeIds.add(n.id);
      continue;
    }
    const p = at(n);
    if (isRectIntersecting({ ...p, ...sizeOfNode(n) }, region, true)) nodeIds.add(n.id);
  }
  // In the list's order, which is the order they are drawn in.
  const edgeIds = new Set<string>();
  for (const e of edges) {
    if (e.hidden !== true && (nodeIds.has(e.source) || nodeIds.has(e.target))) edgeIds.add(e.id);
  }
  return { nodes: nodeIds, edges: edgeIds };
}

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
  return isRectIntersecting(around(a, b), region, true);
}

/** The box that holds both of two. */
function around(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

function cells<K>(): Cells<K> {
  return { cells: new Map(), at: new Map() };
}


/**
 * The keys of the cells a box covers; null past `most`. Two cells a long way apart can share a key: that only
 * adds nodes to ask about, and each is asked exactly.
 */
function cellsOf(r: Rect, most: number): number[] | null {
  const x0 = Math.floor(r.x / CELL);
  const y0 = Math.floor(r.y / CELL);
  const x1 = Math.floor((r.x + r.width) / CELL);
  const y1 = Math.floor((r.y + r.height) / CELL);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > most) return null;
  const keys: number[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) keys.push(x * 4194304 + y);
  return keys;
}

/** Puts `k` in the cells a box covers (none: null), out of wherever it was. */
function put<K>(c: Cells<K>, k: K, r: Rect | null) {
  for (const key of c.at.get(k) ?? []) {
    const list = c.cells.get(key) as K[];
    list.splice(list.indexOf(k), 1);
  }
  const keys = r ? (cellsOf(r, WIDE) ?? [-1]) : [];
  for (const key of keys) {
    const list = c.cells.get(key);
    if (list) list.push(k);
    else c.cells.set(key, [k]);
  }
  c.at.set(k, keys);
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
