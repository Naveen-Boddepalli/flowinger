// Three ways to turn nodes and edges into positions. Each takes the same input and returns the same
// shape — `{ [id]: { x, y } }`, a node's top-left corner — which is all Flowinger asks of a layout.
//
// A layout library needs each node's size *before* anything is drawn, so this example gives every node
// the same fixed size. For nodes whose content decides their size, lay out once with a guess, wait for
// `useNodesInitialized()`, read `node.measured` from `useReactFlow().getNodes()`, and lay out again.
import { graphlib, layout as dagreLayout } from '@dagrejs/dagre';
import { stratify, tree } from 'd3-hierarchy';
import ELK from 'elkjs/lib/elk.bundled.js';

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 56;

export type Direction = 'TB' | 'LR';
export type Algorithm = 'd3-hierarchy' | 'dagre' | 'elk';
export type Positions = Record<string, { x: number; y: number }>;

interface Item {
  id: string;
}
interface Link {
  source: string;
  target: string;
}

/**
 * d3-hierarchy's tidy tree. The simplest and the tightest, and it only does *trees*: exactly one root, and
 * every other node with exactly one parent. A node with two parents makes `stratify` throw.
 */
export function layoutWithD3(items: Item[], links: Link[], direction: Direction): Positions {
  const parentOf = new Map(links.map((l) => [l.target, l.source]));
  const root = stratify<Item>()
    .id((item) => item.id)
    .parentId((item) => parentOf.get(item.id) ?? null)(items);

  // nodeSize is the room one node takes, centre to centre: [across its siblings, along the depth].
  const across = direction === 'TB' ? NODE_WIDTH + 40 : NODE_HEIGHT + 24;
  const along = direction === 'TB' ? NODE_HEIGHT + 60 : NODE_WIDTH + 80;
  const laid = tree<Item>().nodeSize([across, along])(root);

  const positions: Positions = {};
  laid.each((n) => {
    // d3 gives the node's centre, `x` across the tree and `y` down it. Left-to-right swaps them.
    const cx = direction === 'TB' ? n.x : n.y;
    const cy = direction === 'TB' ? n.y : n.x;
    positions[n.data.id] = { x: cx - NODE_WIDTH / 2, y: cy - NODE_HEIGHT / 2 };
  });
  return positions;
}

/** dagre: a layered layout for directed graphs, sharing and merges included. */
export function layoutWithDagre(items: Item[], links: Link[], direction: Direction): Positions {
  const g = new graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 60 });
  for (const item of items) g.setNode(item.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const link of links) g.setEdge(link.source, link.target);
  dagreLayout(g);

  const positions: Positions = {};
  for (const item of items) {
    const centre = g.node(item.id); // dagre also reports a centre
    positions[item.id] = { x: centre.x - NODE_WIDTH / 2, y: centre.y - NODE_HEIGHT / 2 };
  }
  return positions;
}

const elk = new ELK();

/** ELK's layered algorithm: the most options, the biggest download, and it is asynchronous. */
export async function layoutWithElk(items: Item[], links: Link[], direction: Direction): Promise<Positions> {
  const graph = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction === 'TB' ? 'DOWN' : 'RIGHT',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
    },
    children: items.map((item) => ({ id: item.id, width: NODE_WIDTH, height: NODE_HEIGHT })),
    edges: links.map((l) => ({ id: `${l.source}->${l.target}`, sources: [l.source], targets: [l.target] })),
  });

  const positions: Positions = {};
  for (const child of graph.children ?? []) positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 }; // top-left
  return positions;
}

export function runLayout(
  algorithm: Algorithm,
  items: Item[],
  links: Link[],
  direction: Direction,
): Promise<Positions> {
  switch (algorithm) {
    case 'd3-hierarchy':
      return Promise.resolve(layoutWithD3(items, links, direction));
    case 'dagre':
      return Promise.resolve(layoutWithDagre(items, links, direction));
    case 'elk':
      return layoutWithElk(items, links, direction);
  }
}
