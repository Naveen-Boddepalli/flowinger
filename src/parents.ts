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
