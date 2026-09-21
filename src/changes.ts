import type {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
} from './types.ts';

/**
 * `node` with `patch` applied — or `node` itself when the patch changes nothing,
 * so an unaffected node keeps its identity and a memoised view skips it.
 */
function assign<T extends object>(node: T, patch: Partial<T>): T {
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (patch[key] !== node[key]) return { ...node, ...patch };
  }
  return node;
}

/** Inserts each added item at its index (clamped), else at the end. */
function insertAdded<T>(list: T[], added: readonly { item: T; index?: number | undefined }[]): T[] {
  const out = list.slice();
  for (const { item, index } of added) {
    if (index === undefined) out.push(item);
    else out.splice(Math.max(0, Math.min(index, out.length)), 0, item);
  }
  return out;
}

/** Groups changes by the element they name; `add` names none, so it is returned apart. */
function group<C extends { type: string }>(changes: readonly C[]) {
  const byId = new Map<string, C[]>();
  const added: Extract<C, { type: 'add' }>[] = [];
  for (const change of changes) {
    if (change.type === 'add') {
      added.push(change as Extract<C, { type: 'add' }>);
      continue;
    }
    const id = (change as unknown as { id: string }).id;
    const list = byId.get(id);
    if (list) list.push(change);
    else byId.set(id, [change]);
  }
  return { byId, added };
}

function applyToNode<N extends Node>(node: N, change: NodeChange<N>): N | null {
  switch (change.type) {
    case 'remove':
      return null;
    case 'replace':
      return change.item;
    case 'add':
      return node;
    case 'select':
      return assign(node, { selected: change.selected } as Partial<N>);
    case 'position': {
      const patch: Partial<Node> = {};
      if (change.position) patch.position = samePosition(node.position, change.position) ? node.position : change.position;
      if (change.dragging !== undefined) patch.dragging = change.dragging;
      return assign(node, patch as Partial<N>);
    }
    case 'dimensions': {
      const patch: Partial<Node> = {};
      const d = change.dimensions;
      if (d) {
        const m = node.measured;
        patch.measured = m?.width === d.width && m.height === d.height ? m : { width: d.width, height: d.height };
        if (change.setAttributes === true || change.setAttributes === 'width') patch.width = d.width;
        if (change.setAttributes === true || change.setAttributes === 'height') patch.height = d.height;
      }
      if (change.resizing !== undefined) patch.resizing = change.resizing;
      return assign(node, patch as Partial<N>);
    }
  }
}

const samePosition = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
  a.x === b.x && a.y === b.y;

/**
 * Applies a controlled flow's `onNodesChange` changes to a node list, returning
 * a new list. Nodes the changes do not touch keep their identity.
 */
export function applyNodeChanges<N extends Node = Node>(changes: readonly NodeChange<N>[], nodes: N[]): N[] {
  if (changes.length === 0) return nodes;
  const { byId, added } = group(changes);
  const out: N[] = [];
  for (const node of nodes) {
    const list = byId.get(node.id);
    if (!list) {
      out.push(node);
      continue;
    }
    let next: N | null = node;
    for (const change of list) {
      next = applyToNode(next, change);
      if (next === null) break;
    }
    if (next) out.push(next);
  }
  return added.length > 0 ? insertAdded(out, added) : out;
}

function applyToEdge<E extends Edge>(edge: E, change: EdgeChange<E>): E | null {
  switch (change.type) {
    case 'remove':
      return null;
    case 'replace':
      return change.item;
    case 'add':
      return edge;
    case 'select':
      return assign(edge, { selected: change.selected } as Partial<E>);
  }
}

/** The edge counterpart of `applyNodeChanges`. */
export function applyEdgeChanges<E extends Edge = Edge>(changes: readonly EdgeChange<E>[], edges: E[]): E[] {
  if (changes.length === 0) return edges;
  const { byId, added } = group(changes);
  const out: E[] = [];
  for (const edge of edges) {
    const list = byId.get(edge.id);
    if (!list) {
      out.push(edge);
      continue;
    }
    let next: E | null = edge;
    for (const change of list) {
      next = applyToEdge(next, change);
      if (next === null) break;
    }
    if (next) out.push(next);
  }
  return added.length > 0 ? insertAdded(out, added) : out;
}

const same = (a: string | null | undefined, b: string | null | undefined): boolean => (a ?? null) === (b ?? null);

/**
 * Adds an edge — or a `Connection`, which `onConnect` hands over — to a list.
 * A connection that already exists (same ends, same handles) is not added twice.
 */
export function addEdge<E extends Edge = Edge>(edge: E | Connection, edges: E[]): E[] {
  const duplicate = edges.some(
    (e) =>
      e.source === edge.source &&
      e.target === edge.target &&
      same(e.sourceHandle, edge.sourceHandle) &&
      same(e.targetHandle, edge.targetHandle),
  );
  if (duplicate) return edges;
  const id =
    'id' in edge
      ? edge.id
      : `flowinger-edge__${edge.source}${edge.sourceHandle ?? ''}-${edge.target}${edge.targetHandle ?? ''}`;
  return [...edges, { ...edge, id } as E];
}

/**
 * Moves an edge to a new connection — what `onReconnect` asks for. It stays where
 * it is in the list, and keeps everything else about it (label, style, data); its
 * `id` follows the new connection unless `shouldReplaceId` is false. If another edge
 * already joins those two handles, the list comes back unchanged rather than with a
 * twin. An `oldEdge` that is not in the list changes nothing.
 */
export function reconnectEdge<E extends Edge = Edge>(
  oldEdge: E,
  newConnection: Connection,
  edges: E[],
  { shouldReplaceId = true }: { shouldReplaceId?: boolean } = {},
): E[] {
  const at = edges.findIndex((e) => e.id === oldEdge.id);
  if (at === -1) return edges;
  const twin = edges.some(
    (e) =>
      e.id !== oldEdge.id &&
      e.source === newConnection.source &&
      e.target === newConnection.target &&
      same(e.sourceHandle, newConnection.sourceHandle) &&
      same(e.targetHandle, newConnection.targetHandle),
  );
  if (twin) return edges;
  const moved = {
    ...oldEdge,
    source: newConnection.source,
    target: newConnection.target,
    sourceHandle: newConnection.sourceHandle,
    targetHandle: newConnection.targetHandle,
    id: shouldReplaceId
      ? `flowinger-edge__${newConnection.source}${newConnection.sourceHandle ?? ''}-${newConnection.target}${newConnection.targetHandle ?? ''}`
      : oldEdge.id,
  } as E;
  return edges.map((e, i) => (i === at ? moved : e));
}

/** The edges that touch any of `nodes`. */
export function getConnectedEdges<E extends Edge = Edge>(nodes: readonly Node[], edges: readonly E[]): E[] {
  const ids = new Set(nodes.map((n) => n.id));
  return edges.filter((e) => ids.has(e.source) || ids.has(e.target));
}

/** The nodes with an edge running *into* `node`. */
export function getIncomers<N extends Node = Node>(node: Node, nodes: readonly N[], edges: readonly Edge[]): N[] {
  const from = new Set(edges.filter((e) => e.target === node.id).map((e) => e.source));
  return nodes.filter((n) => from.has(n.id));
}

/** The nodes `node` has an edge running out to. */
export function getOutgoers<N extends Node = Node>(node: Node, nodes: readonly N[], edges: readonly Edge[]): N[] {
  const to = new Set(edges.filter((e) => e.source === node.id).map((e) => e.target));
  return nodes.filter((n) => to.has(n.id));
}
