import type { Edge, HandleType } from './types.ts';

/** One edge as seen from a node. */
export interface NodeConnection {
  edgeId: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}

export interface ConnectionFilter {
  /** Only edges leaving (`'source'`) or arriving at (`'target'`) the node. Default: both. */
  handleType?: HandleType | undefined;
  /**
   * Only edges at this handle — of that `handleType`: as in React Flow, a handle is asked for by type and id
   * together, and an id alone, or a missing one (`null`, `''`), asks for none in particular.
   */
  handleId?: string | null | undefined;
}

/** The edges at a node, in the order the edges are in — narrowed by which end of them it is, and which handle. */
export function connectionsAt(edges: readonly Edge[], nodeId: string, { handleType, handleId }: ConnectionFilter = {}): NodeConnection[] {
  const handle = handleType && handleId ? handleId : undefined;
  return edges.flatMap((e): NodeConnection[] => {
    const asSource = e.source === nodeId && (handle === undefined || (e.sourceHandle ?? null) === handle);
    const asTarget = e.target === nodeId && (handle === undefined || (e.targetHandle ?? null) === handle);
    const wanted = handleType === 'source' ? asSource : handleType === 'target' ? asTarget : asSource || asTarget;
    return wanted
      ? [
          {
            edgeId: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle ?? null,
            targetHandle: e.targetHandle ?? null,
          },
        ]
      : [];
  });
}
