import type { Feature } from '../features.ts';
import { isKeyHeld, useKeyTracking, type Modifiers } from '../keys.ts';
import { isInteractive } from '../pointer.ts';
import type { EdgeChange, KeyCode, Node, NodeChange } from '../types.ts';

export interface SelectionApi {
  /** Whether a click, or Enter and Space, may select it: what the node says itself, else the canvas's `elementsSelectable`. */
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
  /** Takes one node — or, with `edge`, one edge — out of the selection; false if it was not in it. */
  unselect: (id: string, edge?: boolean) => boolean;
  /**
   * Whether a press adds to the selection rather than replacing it: `multiSelectionKeyCode` where it is given,
   * else Shift, Control or ⌘. A box (`box`) keeps what is selected only with Control or ⌘ by default, because
   * Shift is what draws it.
   */
  isMulti: (e: Modifiers, box?: boolean) => boolean;
  /** What the canvas was last given for `multiSelectionKeyCode`; written by `useCanvas`. */
  readonly keys: { multi: KeyCode | null | undefined };
}

/**
 * Selecting by interaction: a click (Shift, Ctrl or ⌘ adds or removes), Enter and Space on a focused node
 * or edge and Escape letting go of it, a click on the empty canvas clearing it, and Escape on the canvas
 * itself (with `keyboardNavigation`) — all of it
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
    const isSelectable: SelectionApi['isSelectable'] = (n) => n.selectable ?? ctx.options.elementsSelectable;

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
      // A selected node is drawn wherever it is — what culls must hear that it is, or no longer is, one.
      if (flipped.length > 0) ctx.changed();
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

    const unselect: SelectionApi['unselect'] = (id, edge = false) => {
      const nodeIds = new Set(ctx.selectedNodeIds());
      const edgeIds = new Set(ctx.selectedEdgeIds());
      if (!(edge ? edgeIds : nodeIds).delete(id)) return false;
      setSelection(nodeIds, edgeIds);
      return true;
    };

    const keys: SelectionApi['keys'] = { multi: undefined };
    const isMulti: SelectionApi['isMulti'] = (e, box = false) =>
      keys.multi === undefined ? e.ctrlKey || e.metaKey || (!box && e.shiftKey) : isKeyHeld(keys.multi, e);

    return { isSelectable, setSelection, selectNode, selectEdge, clearSelection, unselect, isMulti, keys };
  },

  useCanvas({ store, props }) {
    const { elementsSelectable = false, keyboardNavigation = false, multiSelectionKeyCode } = props;
    const { clearSelection, keys } = store.api(selectionFeature);
    keys.multi = multiSelectionKeyCode;
    useKeyTracking(multiSelectionKeyCode);
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
    const { selectNode, unselect, isMulti } = store.api(selectionFeature);
    return {
      // Selectable means reachable from the keyboard too. (Not selectable is not a refusal: `false` is
      // for a feature that says so outright.)
      ...(selectable ? { focusable: true } : {}),
      // A click on a control inside the node is that control's, not a selection.
      onClick: (e) => {
        if (selectable && !isInteractive(e.target, store.getOptions().ignored)) selectNode(node.id, isMulti(e));
      },
      onKeyDown: (e) => {
        // Escape lets go of it, as React Flow's does; when it was not selected, Escape is someone else's.
        if (e.key === 'Escape') {
          if (selectable && unselect(node.id)) e.preventDefault();
          return;
        }
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); // Space would otherwise scroll the page
        selectNode(node.id, e.shiftKey);
      },
    };
  },

  useEdge({ store, edge, selectable }) {
    const { selectEdge, unselect, isMulti } = store.api(selectionFeature);
    return {
      onClick: (e) => {
        if (selectable) selectEdge(edge.id, isMulti(e));
      },
      onKeyDown: (e) => {
        if (e.key === 'Escape') {
          if (selectable && unselect(edge.id, true)) e.preventDefault();
          return;
        }
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        selectEdge(edge.id, e.shiftKey);
      },
    };
  },
};
