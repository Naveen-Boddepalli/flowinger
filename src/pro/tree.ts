import { useCallback, useRef, useState } from 'react';
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

/** Everything reachable from `rootId` along edges, source to target, not counting `rootId` itself. */
function descendantsOf(rootId: string, edges: readonly Edge[]): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    const list = childrenOf.get(e.source);
    if (list) list.push(e.target);
    else childrenOf.set(e.source, [e.target]);
  }
  const found: string[] = [];
  // The root counts as seen, so a cycle back to it does not make it its own descendant.
  const seen = new Set<string>([rootId]);
  const queue = [...(childrenOf.get(rootId) ?? [])];
  for (let at = 0; at < queue.length; at++) {
    const current = queue[at] as string;
    if (seen.has(current)) continue;
    seen.add(current);
    found.push(current);
    for (const next of childrenOf.get(current) ?? []) queue.push(next);
  }
  return found;
}

/**
 * Headless collapsible tree and hierarchy manager for Flowinger and React Flow graphs.
 * Recursively collapses and expands child subtrees and their edges.
 */
export function useCollapsibleTree(options: UseCollapsibleTreeOptions = {}): UseCollapsibleTreeResult {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set(options.defaultCollapsed ?? []));
  // What is collapsed right now, for calls made twice before a render.
  const collapsedRef = useRef(collapsedIds);

  let reactFlow: ReturnType<typeof useReactFlow> | null = null;
  try {
    reactFlow = useReactFlow();
  } catch {
    reactFlow = null;
  }

  const getDescendantIds = useCallback(
    (rootId: string, explicitEdges?: readonly Edge[]): string[] => {
      const edges = explicitEdges ?? (reactFlow ? reactFlow.getEdges() : []);
      return descendantsOf(rootId, edges);
    },
    [reactFlow],
  );

  const setCollapsedState = useCallback(
    (nodeId: string, shouldCollapse: boolean) => {
      const next = new Set(collapsedRef.current);
      if (shouldCollapse) next.add(nodeId);
      else next.delete(nodeId);
      const before = collapsedRef.current;
      collapsedRef.current = next;
      setCollapsedIds(next);

      if (!reactFlow) return;

      const currentEdges = reactFlow.getEdges();
      // Hidden is a property of *every* collapsed ancestor, so it is worked out again from the whole set:
      // opening a branch must not show what sits under a branch that is still closed.
      const hiddenBy = (collapsed: ReadonlySet<string>) => {
        const out = new Set<string>();
        for (const id of collapsed) for (const d of descendantsOf(id, currentEdges)) out.add(d);
        return out;
      };
      const was = hiddenBy(before);
      const now = hiddenBy(next);
      if (was.size === 0 && now.size === 0) return;

      // Only what collapsing touched is written: a node hidden for another reason stays so.
      const nodes = reactFlow.getNodes().map((n) => {
        if (now.has(n.id)) return n.hidden === true ? n : { ...n, hidden: true };
        if (was.has(n.id)) return { ...n, hidden: false };
        return n;
      });
      const edges = currentEdges.map((e) => {
        if (now.has(e.source) || now.has(e.target)) return e.hidden === true ? e : { ...e, hidden: true };
        if (was.has(e.source) || was.has(e.target)) return { ...e, hidden: false };
        return e;
      });
      reactFlow.setNodes(nodes);
      reactFlow.setEdges(edges);
    },
    [reactFlow],
  );

  const toggleNode = useCallback(
    (nodeId: string) => {
      setCollapsedState(nodeId, !collapsedRef.current.has(nodeId));
    },
    [setCollapsedState],
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
