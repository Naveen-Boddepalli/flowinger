import type { Node, XYPosition } from './types.ts';

export type NodeLookup = (id: string) => Node | undefined;

/**
 * Where a node is on the canvas: its own position (as `resolve` gives it — a drag
 * included) plus its parent's, and its parent's parent's, up the chain. A child's
 * `position` is relative to its parent, so everything that draws or hit-tests
 * needs this rather than `node.position`. A parent that is not there, or a
 * loop of parents, ends the chain instead of hanging it.
 */
export function absolutePositionOf(
  node: Node,
  lookup: NodeLookup,
  resolve: (id: string, fallback: XYPosition) => XYPosition,
  /**
   * How far a node's top-left sits from its `position` — its origin times its size. Given, the result is
   * the node's top-left corner: each node on the chain contributes `position − offset`, which is what a
   * child's `position` being relative to its parent's *top-left* means (as in React Flow).
   */
  offsetOf?: (node: Node) => XYPosition,
): XYPosition {
  const own = resolve(node.id, node.position);
  const ownOffset = offsetOf?.(node);
  if (node.parentId === undefined) {
    // No offset: the position itself, so an unmoved node keeps a stable object for useSyncExternalStore.
    return ownOffset && (ownOffset.x !== 0 || ownOffset.y !== 0) ? { x: own.x - ownOffset.x, y: own.y - ownOffset.y } : own;
  }
  let x = own.x - (ownOffset?.x ?? 0);
  let y = own.y - (ownOffset?.y ?? 0);
  const seen = new Set([node.id]);
  let parent = lookup(node.parentId);
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    const at = resolve(parent.id, parent.position);
    const offset = offsetOf?.(parent);
    x += at.x - (offset?.x ?? 0);
    y += at.y - (offset?.y ?? 0);
    parent = parent.parentId === undefined ? undefined : lookup(parent.parentId);
  }
  return { x, y };
}

/** Every node that has any of `ids` among its ancestors — not the ids themselves. */
export function descendantsOf(ids: Iterable<string>, nodes: readonly Node[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parentId === undefined) continue;
    const list = children.get(n.parentId);
    if (list) list.push(n.id);
    else children.set(n.parentId, [n.id]);
  }
  const found = new Set<string>();
  const queue = [...ids];
  while (queue.length > 0) {
    const id = queue.pop();
    if (id === undefined) continue;
    for (const child of children.get(id) ?? []) {
      if (found.has(child)) continue;
      found.add(child);
      queue.push(child);
    }
  }
  return found;
}

export interface TreeInfo {
  /** Where each node's parent sits on the canvas — for a root, the origin. */
  origin: Map<string, XYPosition>;
  /** How many parents up each node's chain goes: 0 for a root. */
  depth: Map<string, number>;
  /** Hidden nodes, and everything inside them. */
  hidden: Set<string>;
}

/** What the canvas needs to know about its nodes' nesting, read from the nodes as given. */
export function treeInfo(nodes: readonly Node[]): TreeInfo {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const origin = new Map<string, XYPosition>();
  const depth = new Map<string, number>();
  const asGiven = (_id: string, fallback: XYPosition) => fallback;
  const root: XYPosition = { x: 0, y: 0 };
  for (const n of nodes) {
    let d = 0;
    const seen = new Set([n.id]);
    let parent = n.parentId === undefined ? undefined : byId.get(n.parentId);
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      d += 1;
      parent = parent.parentId === undefined ? undefined : byId.get(parent.parentId);
    }
    depth.set(n.id, d);
    const parentNode = n.parentId === undefined ? undefined : byId.get(n.parentId);
    origin.set(n.id, parentNode ? absolutePositionOf(parentNode, (id) => byId.get(id), asGiven) : root);
  }
  const hidden = new Set(nodes.filter((n) => n.hidden === true).map((n) => n.id));
  for (const id of descendantsOf([...hidden], nodes)) hidden.add(id);
  return { origin, depth, hidden };
}

/** What there is to say of a list with nothing nested and nothing hidden: nothing. Shared, and not to be written to. */
const FLAT: TreeInfo = { origin: new Map(), depth: new Map(), hidden: new Set() };
const NO_IDS: ReadonlySet<string> = new Set();

/** The ids that some node names as its parent. */
export function parentIds(nodes: readonly Node[]): Set<string> {
  const out = new Set<string>();
  for (const n of nodes) if (n.parentId !== undefined) out.add(n.parentId);
  return out;
}

/**
 * Whether `next` is `last` with nodes replaced by copies that are nested, hidden and — where they are
 * parents — placed as they were: what a drag, a selection or an edit of `data` does to a list. Then what was
 * worked out from the shape of `last` — who is whose child, how deep, what is hidden — holds for `next`.
 * A pointer comparison of the list, not a rebuild of it.
 *
 * `moved` is told of each node that is not the one it was, so a map of them can be kept in step.
 */
export function sameStructure(
  last: readonly Node[],
  next: readonly Node[],
  parents: ReadonlySet<string>,
  moved?: (node: Node) => void,
): boolean {
  if (last.length !== next.length) return false;
  for (let i = 0; i < next.length; i++) {
    const a = last[i] as Node;
    const b = next[i] as Node;
    if (a === b) continue;
    if (a.id !== b.id || a.parentId !== b.parentId || a.hidden !== b.hidden) return false;
    if (
      a.position !== b.position &&
      (a.position.x !== b.position.x || a.position.y !== b.position.y) &&
      parents.has(a.id)
    ) {
      return false;
    }
    moved?.(b);
  }
  return true;
}

/**
 * `treeInfo`, for a canvas that is given a new list at every drag move: a list with nothing nested or hidden
 * has nothing to work out, and one that only moved or changed its `data` has the answer it had. The rest is
 * `treeInfo`, again.
 */
export function createTreeInfo(): (nodes: readonly Node[]) => TreeInfo {
  let last: readonly Node[] | null = null;
  let info: TreeInfo = FLAT;
  let parents: ReadonlySet<string> = NO_IDS;
  return (nodes) => {
    if (nodes === last) return info;
    const same = last !== null && sameStructure(last, nodes, parents);
    last = nodes;
    if (same) return info;
    let flat = true;
    for (const n of nodes) {
      if (n.parentId !== undefined || n.hidden === true) {
        flat = false;
        break;
      }
    }
    if (flat) {
      info = FLAT;
      parents = NO_IDS;
    } else {
      info = treeInfo(nodes);
      parents = parentIds(nodes);
    }
    return info;
  };
}

/**
 * A map of nodes by id that is kept between lists: given the last list with some nodes replaced, it updates
 * those entries instead of making the map again. For whoever is handed a new list at every drag move and
 * wants only to look a few of them up.
 */
export function createNodeIndex(): (nodes: readonly Node[]) => ReadonlyMap<string, Node> {
  let last: readonly Node[] = [];
  let index = new Map<string, Node>();
  return (nodes) => {
    if (nodes === last) return index;
    let same = nodes.length === last.length;
    if (same) {
      for (let i = 0; i < nodes.length; i++) {
        const a = last[i] as Node;
        const b = nodes[i] as Node;
        if (a === b) continue;
        if (a.id !== b.id) {
          same = false;
          break;
        }
        index.set(b.id, b);
      }
    }
    // Nodes came, went or changed places: a map of the new list. (A partly updated one is not used.)
    if (!same) index = new Map(nodes.map((n) => [n.id, n]));
    last = nodes;
    return index;
  };
}
