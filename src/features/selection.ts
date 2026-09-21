import type { Feature } from '../features.ts';
import { isInteractive } from '../pointer.ts';
import type { EdgeChange, Node, NodeChange } from '../types.ts';

export interface SelectionApi {
  /** Whether a click, or Enter and Space, may select it: the canvas's `elementsSelectable`, unless it opts out. */
  isSelectable: (node: Node) => boolean;
  /**
   * Makes exactly these nodes and edges the selection. Controlled, that is a
   * list of `select` changes for whoever owns the state; otherwise it is done
   * here and the affected nodes are told.
   */
  setSelection: (nodeIds: ReadonlySet<string>, edgeIds: ReadonlySet<string>) => void;
  /**
   * Selects a node — replacing the selection, or with `additive` toggling it in
   * or out. Selecting what is already the whole selection changes nothing, and
   * says nothing.
   */
  selectNode: (id: string, additive?: boolean) => void;
  /** Selects an edge, replacing the selection or — `additive` — toggling it in or out. */
  selectEdge: (id: string, additive?: boolean) => void;
  clearSelection: () => void;
}

/**
 * Selecting by interaction: a click (Shift, Ctrl or ⌘ adds or removes), Enter and Space on a focused node
 * or edge, a click on the empty canvas clearing it, and Escape (with `keyboardNavigation`) — all of it
 * behind `elementsSelectable`, and a node's or edge's own `selectable: false` opts it out.
 *
 * What is *selected* is not this feature's: a controlled node's `selected` is drawn, `onSelectionChange`
 * and `useOnSelectionChange` report, and `useNodes` and the instance read it, on any canvas. This is only
 * what changes it from the pointer and keyboard. Dragging a selection and drawing a selection box build on
 * it.
 */
export const selectionFeature: Feature<SelectionApi> = {
  name: 'selection',
  install(ctx) {
    const isSelectable: SelectionApi['isSelectable'] = (n) => ctx.options.elementsSelectable && n.selectable !== false;

    const setSelection: SelectionApi['setSelection'] = (nodeIds, edgeIds) => {
      const nodeChanges: NodeChange[] = [];
      const flipped: string[] = [];
      for (const n of ctx.nodes) {
        const now = ctx.isSelected(n.id);
        const next = nodeIds.has(n.id);
        if (now === next) continue;
        if (ctx.nodesControlled()) nodeChanges.push({ type: 'select', id: n.id, selected: next });
        else {
          if (next) ctx.ownSelection.nodes.add(n.id);
          else ctx.ownSelection.nodes.delete(n.id);
          flipped.push(n.id);
        }
      }
      const edgeChanges: EdgeChange[] = [];
      let edgesFlipped = false;
      for (const e of ctx.edges) {
        const now = ctx.isEdgeSelected(e.id);
        const next = edgeIds.has(e.id);
        if (now === next) continue;
        if (ctx.edgesControlled()) edgeChanges.push({ type: 'select', id: e.id, selected: next });
        else {
          if (next) ctx.ownSelection.edges.add(e.id);
          else ctx.ownSelection.edges.delete(e.id);
          edgesFlipped = true;
        }
      }
      for (const id of flipped) ctx.notifyNode(id);
      if (edgesFlipped) ctx.geometryChanged();
      ctx.emitNodeChanges(nodeChanges);
      ctx.emitEdgeChanges(edgeChanges);
      ctx.announceSelection();
    };

    const selectNode: SelectionApi['selectNode'] = (id, additive = false) => {
      const nodeIds = new Set(additive ? ctx.selectedNodeIds() : []);
      if (!additive || !nodeIds.delete(id)) nodeIds.add(id);
      setSelection(nodeIds, new Set(additive ? ctx.selectedEdgeIds() : []));
    };

    const selectEdge: SelectionApi['selectEdge'] = (id, additive = false) => {
      const edgeIds = new Set(additive ? ctx.selectedEdgeIds() : []);
      if (!additive || !edgeIds.delete(id)) edgeIds.add(id);
      setSelection(new Set(additive ? ctx.selectedNodeIds() : []), edgeIds);
    };

    const clearSelection = () => {
      setSelection(new Set(), new Set());
    };

    return { isSelectable, setSelection, selectNode, selectEdge, clearSelection };
  },

  useCanvas({ store, props }) {
    const { elementsSelectable = false, keyboardNavigation = false } = props;
    const { clearSelection } = store.api(selectionFeature);
    return {
      // Nodes and edges are selectable; whether the canvas allows it (`elementsSelectable`) is the canvas's to say.
      selectable: true,
      // A click on the bare canvas drops the selection.
      onPaneClick: () => {
        if (elementsSelectable) clearSelection();
      },
      // Escape drops it too, when the canvas is a tab stop — but only if there is something to drop;
      // otherwise Escape belongs to whatever else wants it (a dialog this canvas sits in, say).
      onKeyDown: (e) => {
        if (!keyboardNavigation || e.key !== 'Escape') return false;
        if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey || !store.hasSelection()) return false;
        clearSelection();
        e.preventDefault();
        return true;
      },
    };
  },

  useNode({ store, node, selectable }) {
    const { selectNode } = store.api(selectionFeature);
    return {
      // Selectable means reachable from the keyboard too.
      focusable: selectable,
      // A click on a control inside the node is that control's, not a selection.
      onClick: (e) => {
        if (selectable && !isInteractive(e.target)) selectNode(node.id, e.shiftKey || e.metaKey || e.ctrlKey);
      },
      onKeyDown: (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); // Space would otherwise scroll the page
        selectNode(node.id, e.shiftKey);
      },
    };
  },

  useEdge({ store, edge, selectable }) {
    const { selectEdge } = store.api(selectionFeature);
    return {
      onClick: (e) => {
        if (selectable) selectEdge(edge.id, e.shiftKey || e.metaKey || e.ctrlKey);
      },
      onKeyDown: (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        selectEdge(edge.id, e.shiftKey);
      },
    };
  },
};
