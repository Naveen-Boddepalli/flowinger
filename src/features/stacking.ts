import { useEffect } from 'react';
import type { Feature } from '../features.ts';
import { parentIds, sameStructure } from '../parents.ts';
import type { FlowingerStore } from '../store.ts';
import type { Edge, Node, ZIndexMode } from '../types.ts';

/** How far a selected node (or edge) is raised, as in React Flow. */
const ELEVATION = 1000;
/** How far apart `'auto'` keeps the subtrees of one group and the next. */
const ROOT_STEP = 10;

export interface StackingApi {
  readonly config: {
    elevateNodes: boolean;
    elevateEdges: boolean;
    mode: ZIndexMode;
    /** The nodes as the canvas was last given them: known at the first render, before the engine is. */
    nodes: readonly Node[];
    /** Whether `node.selected` says who is selected (a controlled flow), rather than the engine. */
    controlled: boolean;
  };
  /** Where a node is stacked now; `forEdge` is for an edge that joins it, which a selection lifts only when edges are. */
  stackOf: (node: Node, forEdge: boolean) => number;
  /** A selection changed: edges are stacked again, and what is inside a node that was (de)selected moves with it. */
  onSelectionChange: () => void;
}

/**
 * Where nodes and edges are stacked: `elevateNodesOnSelect` (a selected node, and what is inside it, is
 * raised by 1000; on by default), `elevateEdgesOnSelect` (the same for a selected edge, and for the edges of
 * a selected node; off by default) and `zIndexMode` — `'basic'` as it always was, `'auto'` which also keeps
 * one group's subtree from interleaving with the next's, and `'manual'`, which leaves it to `zIndex` alone.
 */
export const stackingFeature: Feature<StackingApi> = {
  name: 'stacking',
  install(ctx) {
    const config: StackingApi['config'] = {
      elevateNodes: true,
      elevateEdges: false,
      mode: 'basic',
      nodes: [],
      controlled: false,
    };

    /** The structure of the nodes, worked out from `config.nodes` — again only when its shape changes. */
    let tree: {
      nodes: readonly Node[];
      byId: Map<string, Node>;
      depth: Map<string, number>;
      /** In `'auto'`: each group that has children lifts its whole subtree, in order of appearance. */
      root: Map<string, number>;
      /** The ids that have children: a list in which only others moved has the same shape. */
      parents: ReadonlySet<string>;
    } | null = null;
    const treeOf = () => {
      if (tree?.nodes === config.nodes) return tree;
      // A drag, a selection, an edit of `data`: the list is new and what it says of nesting is not. The map of
      // nodes is kept in step, since it is what a node's own `selected` is read from.
      if (tree) {
        const known = tree;
        if (sameStructure(known.nodes, config.nodes, known.parents, (n) => known.byId.set(n.id, n))) {
          known.nodes = config.nodes;
          return known;
        }
      }
      const parents = parentIds(config.nodes);
      // Nothing nested: every node is a root at depth 0, and there is nothing to walk.
      if (parents.size === 0) {
        tree = { nodes: config.nodes, byId: new Map(), depth: new Map(), root: new Map(), parents };
        return tree;
      }
      const byId = new Map(config.nodes.map((n) => [n.id, n] as const));
      const kids = new Map<string, string[]>();
      for (const n of config.nodes) {
        if (n.parentId === undefined) continue;
        const list = kids.get(n.parentId);
        if (list) list.push(n.id);
        else kids.set(n.parentId, [n.id]);
      }
      const depth = new Map<string, number>();
      const root = new Map<string, number>();
      let index = 0;
      const visit = (id: string, d: number, bump: number, seen: Set<string>) => {
        if (seen.has(id)) return;
        seen.add(id);
        depth.set(id, d);
        root.set(id, bump);
        for (const child of kids.get(id) ?? []) visit(child, d + 1, bump, seen);
      };
      const seen = new Set<string>();
      for (const n of config.nodes) {
        // A root: no parent, or one that is not there.
        if (n.parentId !== undefined && byId.has(n.parentId)) continue;
        visit(n.id, 0, kids.has(n.id) ? ++index * ROOT_STEP : 0, seen);
      }
      tree = { nodes: config.nodes, byId, depth, root, parents };
      return tree;
    };

    const selectedOf = (id: string, node: Node | undefined): boolean =>
      config.controlled ? node?.selected === true : ctx.isSelected(id);

    /**
     * A node's stacking: its own `zIndex` (or one more than its parent's, by depth) plus the lift of being
     * selected — and the lift of every selected ancestor, which carries what is inside a node up with it.
     */
    const stackOf = (node: Node, forEdge: boolean): number => {
      if (config.mode === 'manual') return node.zIndex ?? 0;
      const t = treeOf();
      const lifts = config.elevateNodes && (!forEdge || config.elevateEdges);
      let z = node.zIndex ?? 1 + (t.depth.get(node.id) ?? 0);
      if (config.mode === 'auto') z += t.root.get(node.id) ?? 0;
      if (lifts) {
        for (let at: Node | undefined = node, hops = 0; at && hops < 64; hops++) {
          if (selectedOf(at.id, t.byId.get(at.id) ?? at)) z += ELEVATION;
          at = at.parentId === undefined ? undefined : t.byId.get(at.parentId);
        }
      }
      return z;
    };

    let before = new Set<string>();
    const onSelectionChange = () => {
      const now = new Set(ctx.selectedNodeIds());
      const flipped = [...now].filter((id) => !before.has(id)).concat([...before].filter((id) => !now.has(id)));
      before = now;
      if (config.elevateEdges) ctx.geometryChanged();
      if (!config.elevateNodes || config.mode === 'manual') return;
      // What is inside a node that was selected or let go changes its stacking with it.
      const down = (id: string) => {
        for (const child of ctx.childrenOf.get(id) ?? []) {
          ctx.notifyNode(child);
          down(child);
        }
      };
      for (const id of flipped) down(id);
    };

    return { config, stackOf, onSelectionChange };
  },

  useCanvas({ store, props }) {
    const { config, onSelectionChange } = store.api(stackingFeature);
    config.elevateNodes = props.elevateNodesOnSelect ?? true;
    config.elevateEdges = props.elevateEdgesOnSelect ?? false;
    config.mode = props.zIndexMode ?? 'basic';
    config.nodes = props.nodes ?? config.nodes;
    config.controlled = props.onNodesChange !== undefined;
    useEffect(() => store.subscribeSelection(onSelectionChange), [store, onSelectionChange]);
    return undefined;
  },

  stackNode(store: FlowingerStore, node: Node, _z: number, _selected: boolean, forEdge: boolean) {
    return store.api(stackingFeature).stackOf(node, forEdge);
  },

  stackEdge(store: FlowingerStore, edge: Edge, level: number, selected: boolean) {
    const { config } = store.api(stackingFeature);
    if (config.mode === 'manual') return edge.zIndex ?? 0;
    return selected && config.elevateEdges ? level + ELEVATION : level;
  },
};
