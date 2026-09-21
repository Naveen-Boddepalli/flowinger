import { connectionsAt } from '../connections.ts';
import type { Feature } from '../features.ts';
import { isRectIntersecting } from '../geometry.ts';
import type { Edge, EdgeChange, FlowingerInstance, Node, NodeChange, Rect } from '../types.ts';

/** The instance methods that read and edit the graph from outside — `useReactFlow()`'s `setNodes`, and so on. */
export type EditingApi = Pick<
  FlowingerInstance,
  | 'setNodes'
  | 'setEdges'
  | 'addNodes'
  | 'addEdges'
  | 'updateNode'
  | 'updateNodeData'
  | 'updateEdge'
  | 'updateEdgeData'
  | 'getNodeConnections'
  | 'getHandleConnections'
  | 'getIntersectingNodes'
  | 'isNodeIntersecting'
>;

const toList = <T>(one: T | T[]): T[] => (Array.isArray(one) ? one : [one]);

export const editingFeature: Feature<EditingApi> = {
  name: 'editing',
  install(ctx) {
    /**
     * Replaces the list — as the changes that would produce it, so a controlled
     * flow's owner applies them like any other. Ones it names that it has, it
     * replaces; ones it lacks, it removes; ones it has not seen, it adds. Without
     * `onNodesChange` there is nobody to apply them, and nothing happens.
     */
    const setNodes: EditingApi['setNodes'] = (next) => {
      const current = ctx.snapshotNodes();
      const wanted = typeof next === 'function' ? next(current) : next;
      const changes: NodeChange[] = [];
      const wantedById = new Map(wanted.map((w) => [w.id, w]));
      ctx.nodes.forEach((n, i) => {
        const w = wantedById.get(n.id);
        if (!w) changes.push({ type: 'remove', id: n.id });
        else if (current[i] !== w) changes.push({ type: 'replace', id: n.id, item: w });
      });
      for (const w of wanted) if (!ctx.nodeById.has(w.id)) changes.push({ type: 'add', item: w });
      ctx.emitNodeChanges(changes);
    };

    const setEdges: EditingApi['setEdges'] = (next) => {
      const current = ctx.snapshotEdges();
      const wanted = typeof next === 'function' ? next(current) : next;
      const changes: EdgeChange[] = [];
      const wantedById = new Map(wanted.map((w) => [w.id, w]));
      ctx.edges.forEach((e, i) => {
        const w = wantedById.get(e.id);
        if (!w) changes.push({ type: 'remove', id: e.id });
        else if (current[i] !== w) changes.push({ type: 'replace', id: e.id, item: w });
      });
      for (const w of wanted) if (!ctx.edgeById.has(w.id)) changes.push({ type: 'add', item: w });
      ctx.emitEdgeChanges(changes);
    };

    const isNodeIntersecting: EditingApi['isNodeIntersecting'] = (target, area: Rect, partially = true) => {
      const rect = ctx.rectOf(target);
      return rect ? isRectIntersecting(rect, area, partially) : false;
    };

    const getIntersectingNodes: EditingApi['getIntersectingNodes'] = (target, partially = true, among?: Node[]) => {
      const rect = ctx.rectOf(target);
      if (!rect) return [];
      const self = 'id' in target ? target.id : null;
      return (among ?? ctx.snapshotNodes()).filter((n) => {
        if (n.id === self) return false;
        const other = ctx.rectOf(n);
        return other !== null && isRectIntersecting(other, rect, partially);
      });
    };

    const updateNode: EditingApi['updateNode'] = (id, patch, opts) => {
      const node = ctx.nodeById.get(id);
      if (!node) return;
      const current = ctx.snapshotNode(node);
      const change = typeof patch === 'function' ? patch(current) : patch;
      ctx.emitNodeChanges([
        { type: 'replace', id, item: opts?.replace === true ? ({ ...change, id } as Node) : { ...current, ...change } },
      ]);
    };

    const updateNodeData: EditingApi['updateNodeData'] = (id, data, opts) => {
      updateNode(id, (node) => {
        const next = typeof data === 'function' ? data(node) : data;
        return { data: opts?.replace === true ? next : { ...node.data, ...next } };
      });
    };

    const updateEdge: EditingApi['updateEdge'] = (id, patch, opts) => {
      const edge = ctx.edgeById.get(id);
      if (!edge) return;
      const current = ctx.snapshotEdge(edge);
      const change = typeof patch === 'function' ? patch(current) : patch;
      ctx.emitEdgeChanges([
        { type: 'replace', id, item: opts?.replace === true ? ({ ...change, id } as Edge) : { ...current, ...change } },
      ]);
    };

    const updateEdgeData: EditingApi['updateEdgeData'] = (id, data, opts) => {
      updateEdge(id, (edge) => {
        const next = typeof data === 'function' ? data(edge) : data;
        return { data: opts?.replace === true ? next : { ...edge.data, ...next } };
      });
    };

    return {
      setNodes,
      setEdges,
      addNodes: (added) => {
        ctx.emitNodeChanges(toList(added).map((item) => ({ type: 'add', item })));
      },
      addEdges: (added) => {
        ctx.emitEdgeChanges(toList(added).map((item) => ({ type: 'add', item })));
      },
      updateNode,
      updateNodeData,
      updateEdge,
      updateEdgeData,
      getNodeConnections: ({ type, nodeId, handleId }) =>
        connectionsAt(ctx.edges, nodeId, { handleType: type, handleId }),
      getHandleConnections: ({ type, nodeId, id }) => connectionsAt(ctx.edges, nodeId, { handleType: type, handleId: id }),
      getIntersectingNodes,
      isNodeIntersecting,
    };
  },
};
