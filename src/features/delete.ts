import type { Feature } from '../features.ts';
import { descendantsOf } from '../parents.ts';
import { isEditable } from '../pointer.ts';
import type { Edge, FlowingerInstance, Node } from '../types.ts';

export type DeleteApi = Pick<FlowingerInstance, 'deleteElements'>;

/**
 * Deleting nodes and edges: `deleteElements`, and the delete key (`deleteKeyCode`) acting on the
 * selection. Deleting is reported as `remove` changes, and to `onNodesDelete`, `onEdgesDelete` and
 * `onDelete` — see `onBeforeDelete` to veto or narrow it.
 */
export const deleteFeature: Feature<DeleteApi> = {
  name: 'delete',
  install(ctx) {
    /**
     * Deletes nodes and edges by id, as the changes that would remove them. A node
     * takes its edges with it; `deletable: false` is honoured; `onBeforeDelete` may
     * veto or narrow it, asynchronously. Where nobody applies changes (nodes you
     * only pass in) the callbacks still fire, and removing them is up to you.
     */
    const deleteElements: DeleteApi['deleteElements'] = async (params) => {
      const none = { deletedNodes: [], deletedEdges: [] };
      const wantedNodes = new Set((params.nodes ?? []).map((n) => n.id));
      const wantedEdges = new Set((params.edges ?? []).map((e) => e.id));
      const direct = ctx.nodes.filter((n) => wantedNodes.has(n.id) && n.deletable !== false);
      // What is nested inside a node goes with it, whatever it says about itself.
      const inside = descendantsOf(
        direct.map((n) => n.id),
        ctx.nodes,
      );
      const goneNodes = ctx.nodes.filter((n) => direct.includes(n) || inside.has(n.id));
      const goneIds = new Set(goneNodes.map((n) => n.id));
      const goneEdges = ctx.edges.filter(
        (e) =>
          goneIds.has(e.source) ||
          goneIds.has(e.target) ||
          (wantedEdges.has(e.id) && e.deletable !== false),
      );
      let doomed: { nodes: Node[]; edges: Edge[] } = {
        nodes: goneNodes.map(ctx.snapshotNode),
        edges: goneEdges.map(ctx.snapshotEdge),
      };
      if (doomed.nodes.length === 0 && doomed.edges.length === 0) return none;

      const verdict = await ctx.callbacks.onBeforeDelete?.(doomed);
      if (verdict === false) return none;
      if (typeof verdict === 'object') doomed = verdict;

      ctx.emitNodeChanges(doomed.nodes.map((n) => ({ type: 'remove', id: n.id })));
      ctx.emitEdgeChanges(doomed.edges.map((e) => ({ type: 'remove', id: e.id })));
      // Read again, not kept from above: the caller may have changed them while a veto was pending.
      if (doomed.edges.length > 0) ctx.callbacks.onEdgesDelete?.(doomed.edges);
      if (doomed.nodes.length > 0) ctx.callbacks.onNodesDelete?.(doomed.nodes);
      ctx.callbacks.onDelete?.(doomed);
      return { deletedNodes: doomed.nodes, deletedEdges: doomed.edges };
    };
    return { deleteElements };
  },

  useCanvas({ store, props }) {
    const { elementsSelectable = false, deleteKeyCode = 'Backspace' } = props;
    const keys = deleteKeyCode === null ? [] : Array.isArray(deleteKeyCode) ? deleteKeyCode : [deleteKeyCode];
    return {
      // Focusable, but not a tab stop, so a click on empty canvas (or a box selection)
      // leaves focus somewhere the delete key reaches.
      focusable: elementsSelectable && keys.length > 0,
      onKeyDown: (e) => {
        // Deleting works from anywhere inside — a focused node or edge as well as the
        // canvas — but never from a field, where the key edits text.
        if (!keys.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return false;
        const selection = store.getSelection();
        if (selection.nodes.length > 0 || selection.edges.length > 0) {
          e.preventDefault();
          void store.api(deleteFeature).deleteElements(selection);
        }
        return true;
      },
    };
  },
};
