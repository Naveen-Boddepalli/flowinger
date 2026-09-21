import { useEffect, useRef } from 'react';
import { useNodeId, useStore } from './context.ts';
import { connectionsAt, type NodeConnection } from './connections.ts';
import type { Edge, HandleType, Node } from './types.ts';

/** The nodes as given to the canvas — a drag in an uncontrolled flow is not in their `position`s. */
export function useNodes(): readonly Node[] {
  return useStore((s) => s.nodes);
}

/** The edges as given to the canvas. */
export function useEdges(): readonly Edge[] {
  return useStore((s) => s.edges);
}

export interface NodeData {
  id: string;
  type: string | undefined;
  data: Node['data'];
}

const sameData = (a: readonly NodeData[], b: readonly NodeData[]): boolean =>
  a.length === b.length && a.every((n, i) => n.id === b[i]?.id && n.type === b[i]?.type && n.data === b[i]?.data);

/**
 * The `data` of one node, or of several — re-rendering only when *that* changes,
 * not when a node moves or anything else does. A node that is not there is
 * `null` (one id) or left out (a list).
 */
export function useNodesData(id: string): NodeData | null;
export function useNodesData(ids: readonly string[]): NodeData[];
export function useNodesData(target: string | readonly string[]): NodeData | NodeData[] | null {
  const ids = typeof target === 'string' ? [target] : target;
  const found = useStore(
    (s) =>
      ids.flatMap((id) => {
        const n = s.nodes.find((x) => x.id === id);
        return n ? [{ id: n.id, type: n.type, data: n.data }] : [];
      }),
    sameData,
  );
  return typeof target === 'string' ? (found[0] ?? null) : found;
}

export type { NodeConnection } from './connections.ts';

export interface UseNodeConnectionsOptions {
  /** The node to look at. Default: the node this component is rendered inside. */
  id?: string;
  /** Only edges leaving (`'source'`) or arriving at (`'target'`) it. Default: both. */
  handleType?: HandleType;
  /** Only edges at this handle. */
  handleId?: string;
  /** Called with the connections that appeared, after the first render. */
  onConnect?: (connections: NodeConnection[]) => void;
  /** Called with the connections that went. */
  onDisconnect?: (connections: NodeConnection[]) => void;
}

const sameConnections = (a: readonly NodeConnection[], b: readonly NodeConnection[]): boolean =>
  a.length === b.length &&
  a.every(
    (c, i) =>
      c.edgeId === b[i]?.edgeId &&
      c.source === b[i]?.source &&
      c.target === b[i]?.target &&
      c.sourceHandle === b[i]?.sourceHandle &&
      c.targetHandle === b[i]?.targetHandle,
  );

/**
 * The edges at a node — to react to what is wired to it (a node that shows how
 * many inputs it has), without watching every edge in the diagram.
 */
export function useNodeConnections({
  id,
  handleType,
  handleId,
  onConnect,
  onDisconnect,
}: UseNodeConnectionsOptions = {}): NodeConnection[] {
  const own = useNodeId();
  const nodeId = id ?? own;
  const connections = useStore(
    (s) => (nodeId === null ? [] : connectionsAt(s.edges, nodeId, { handleType, handleId })),
    sameConnections,
  );

  const callbacks = useRef({ onConnect, onDisconnect });
  useEffect(() => {
    callbacks.current = { onConnect, onDisconnect };
  });
  // Children render before the canvas has handed the store its edges, so what a
  // first render sees is "none". Not a baseline: wait until the store is ready.
  const ready = useStore((s) => s.isReady);
  const previous = useRef<NodeConnection[] | null>(null);
  useEffect(() => {
    if (!ready) return;
    const before = previous.current;
    previous.current = connections;
    if (before === null) return; // the first render is not a change
    const ids = new Set(connections.map((c) => c.edgeId));
    const was = new Set(before.map((c) => c.edgeId));
    const added = connections.filter((c) => !was.has(c.edgeId));
    const removed = before.filter((c) => !ids.has(c.edgeId));
    if (added.length > 0) callbacks.current.onConnect?.(added);
    if (removed.length > 0) callbacks.current.onDisconnect?.(removed);
  }, [connections, ready]);

  return connections;
}
