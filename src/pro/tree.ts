import { useCallback, useState } from 'react';
import type { Edge } from '../types.ts';
import { useReactFlow } from '../context.ts';

export interface UseCollapsibleTreeOptions {
  /** Initial set of node IDs that start collapsed. */
  defaultCollapsed?: string[];
}

export interface UseCollapsibleTreeResult {
  collapsedNodeIds: ReadonlySet<string>;
  isCollapsed: (nodeId: string) => boolean;
  toggleNode: (nodeId: string) => void;
  collapseNode: (nodeId: string) => void;
  expandNode: (nodeId: string) => void;
  getDescendantIds: (nodeId: string, edges?: readonly Edge[]) => string[];
}

/**
 * Headless collapsible tree and hierarchy manager for Flowinger and React Flow graphs.
 * Recursively collapses and expands child subtrees and their edges.
 */
export function useCollapsibleTree(options: UseCollapsibleTreeOptions = {}): UseCollapsibleTreeResult {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set(options.defaultCollapsed ?? []));

  let reactFlow: ReturnType<typeof useReactFlow> | null = null;
  try {
    reactFlow = useReactFlow();
  } catch {
    reactFlow = null;
  }

  const getDescendantIds = useCallback(
    (rootId: string, explicitEdges?: readonly Edge[]): string[] => {
      const edges = explicitEdges ?? (reactFlow ? reactFlow.getEdges() : []);
      const childrenOf = new Map<string, string[]>();

      for (const e of edges) {
        const list = childrenOf.get(e.source);
        if (list) list.push(e.target);
        else childrenOf.set(e.source, [e.target]);
      }

      const descendants: string[] = [];
      const queue = [...(childrenOf.get(rootId) ?? [])];
      const visited = new Set<string>();

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current || visited.has(current)) continue;
        visited.add(current);
        descendants.push(current);
        const next = childrenOf.get(current);
        if (next) queue.push(...next);
      }

      return descendants;
    },
    [reactFlow],
  );

  const setCollapsedState = useCallback(
    (nodeId: string, shouldCollapse: boolean) => {
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        if (shouldCollapse) next.add(nodeId);
        else next.delete(nodeId);
        return next;
      });

      if (!reactFlow) return;

      const currentEdges = reactFlow.getEdges();
      const currentNodes = reactFlow.getNodes();

      const descendants = new Set(getDescendantIds(nodeId, currentEdges));
      if (descendants.size === 0) return;

      // Update node hidden flags
      const updatedNodes = currentNodes.map((n) => {
        if (descendants.has(n.id)) {
          return { ...n, hidden: shouldCollapse };
        }
        return n;
      });

      // Update edge hidden flags
      const updatedEdges = currentEdges.map((e) => {
        if (descendants.has(e.source) || descendants.has(e.target)) {
          return { ...e, hidden: shouldCollapse };
        }
        return e;
      });

      reactFlow.setNodes(updatedNodes);
      reactFlow.setEdges(updatedEdges);
    },
    [getDescendantIds, reactFlow],
  );

  const toggleNode = useCallback(
    (nodeId: string) => {
      const isCurrentlyCollapsed = collapsedIds.has(nodeId);
      setCollapsedState(nodeId, !isCurrentlyCollapsed);
    },
    [collapsedIds, setCollapsedState],
  );

  const collapseNode = useCallback(
    (nodeId: string) => {
      setCollapsedState(nodeId, true);
    },
    [setCollapsedState],
  );

  const expandNode = useCallback(
    (nodeId: string) => {
      setCollapsedState(nodeId, false);
    },
    [setCollapsedState],
  );

  const isCollapsed = useCallback((nodeId: string) => collapsedIds.has(nodeId), [collapsedIds]);

  return {
    collapsedNodeIds: collapsedIds,
    isCollapsed,
    toggleNode,
    collapseNode,
    expandNode,
    getDescendantIds,
  };
}
