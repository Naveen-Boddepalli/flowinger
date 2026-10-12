import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { beginGroup, growGroup, type ExpandGroup } from '../expand.ts';
import type { Feature, NodeBits } from '../features.ts';
import { clampMove, snapTo } from '../geometry.ts';
import { descendantsOf } from '../parents.ts';
import { DRAG_THRESHOLD, capturePointer, isInteractive, releasePointer } from '../pointer.ts';
import type { FlowingerProps, Node, NodeChange, NodePositionChange, TranslateExtent, XYPosition } from '../types.ts';
import { useIsomorphicLayoutEffect } from '../useIsomorphicLayoutEffect.ts';
import { autoPanFeature } from './autoPan.ts';
import { selectionFeature } from './selection.ts';

/** A node drag in progress — one node, or the whole selection moving with it. */
export interface DragSession {
  /** Moves every dragged node to its start position plus this offset, in graph units. */
  move: (event: ReactPointerEvent, dx: number, dy: number) => void;
  end: (event: ReactPointerEvent) => void;
}

export interface DragApi {
  /** What the canvas was last given for `selectNodesOnDrag` and `nodeClickDistance`; written by `useCanvas`. */
  readonly config: {
    selectOnDrag: boolean;
    clickDistance: number | undefined;
    /** `onSelectionDrag*`: heard, as well as `onNodeDrag*`, when the drag is of the selection's rectangle. */
    onSelectionDragStart: FlowingerProps['onSelectionDragStart'];
    onSelectionDrag: FlowingerProps['onSelectionDrag'];
    onSelectionDragStop: FlowingerProps['onSelectionDragStop'];
  };
  /**
   * Starts dragging `lead`. If it is part of the selection the whole selection
   * goes with it; otherwise it is selected (where selecting is on) and goes
   * alone — which is what a press on an unselected node means.
   */
  beginNodeDrag: (lead: Node, event: ReactPointerEvent, additive: boolean, selection?: boolean) => DragSession;
  /**
   * Moves the selection one step in a direction — what the arrow keys do to a
   * focused node. A step is 5 units, or one cell of the snap grid; `large` is
   * four of them. Bounded by the extents, like a drag, and reported the same way.
   */
  nudgeSelection: (dirX: number, dirY: number, large: boolean) => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  /** Null until the pointer has travelled `DRAG_THRESHOLD`; then the drag proper. */
  session: DragSession | null;
  /** Where the press was, in graph space — so a drag is measured in the graph, which auto-pan moves under it. */
  startGraph: XYPosition;
  /** The pointer's latest event, for a drag that goes on with the pointer standing still at the pane's edge. */
  latest: ReactPointerEvent<HTMLDivElement> | null;
  stopAutoPan: (() => void) | null;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Dragging nodes: `nodesDraggable` and a node's own `draggable`, snapping to a grid, `nodeExtent` and
 * `extent`, dragging a selection together, sub-flows that grow to hold a child (`expandParent`), the
 * arrow keys, and the `onNodeDrag*` callbacks.
 */
export const dragFeature: Feature<DragApi> = {
  name: 'drag',
  needs: [autoPanFeature, selectionFeature],
  install(ctx) {
    const { isSelectable, selectNode, clearSelection } = ctx.api(selectionFeature);
    const config: DragApi['config'] = {
      selectOnDrag: true,
      clickDistance: undefined,
      onSelectionDragStart: undefined,
      onSelectionDrag: undefined,
      onSelectionDragStop: undefined,
    };
    const isDraggable = (n: Node): boolean => n.draggable ?? ctx.options.nodesDraggable;

    /** Where a node may go, in canvas coordinates: its own extent, its parent's box, or the canvas'. */
    const extentFor = (n: Node): TranslateExtent | null => {
      // A node that grows its parent is not held inside it.
      if (n.extent === 'parent' && n.expandParent === true) return ctx.options.nodeExtent;
      if (n.extent !== 'parent') return n.extent ?? ctx.options.nodeExtent;
      const parent = n.parentId === undefined ? undefined : ctx.nodeById.get(n.parentId);
      if (!parent) return ctx.options.nodeExtent;
      const at = ctx.absolutePosition(parent);
      const size = ctx.getNodeSize(parent);
      return [
        [at.x, at.y],
        [at.x + size.width, at.y + size.height],
      ];
    };

    const beginNodeDrag: DragApi['beginNodeDrag'] = (lead, event, additive, selection = false) => {
      const before = ctx.selectedNodeIds();
      let group = [lead.id];
      if (before.includes(lead.id)) {
        group = before;
      } else if (config.selectOnDrag && isSelectable(lead)) {
        selectNode(lead.id, additive);
        group = additive ? [...before, lead.id] : [lead.id];
      } else if (!additive) {
        // Not selected by the drag (`selectNodesOnDrag` off, or it cannot be selected): the drag is of it
        // alone, and what was selected is not any more — as in React Flow.
        clearSelection();
      }
      const movable = group.flatMap((id) => {
        const n = ctx.nodeById.get(id) ?? (id === lead.id ? lead : undefined);
        return n && isDraggable(n) ? [n] : [];
      });
      // A node inside another that is also being dragged moves with it already.
      const riding = descendantsOf(
        movable.map((n) => n.id),
        ctx.nodes,
      );
      const items = movable.filter((n) => !riding.has(n.id));
      for (const n of items) ctx.draggingIds.add(n.id);
      const origins = new Map(items.map((n) => [n.id, ctx.resolvePosition(n.id, n.position)]));
      const absOrigins = new Map(items.map((n) => [n.id, ctx.absolutePosition(n)]));
      const leadOf = (moved: Node[]): Node => moved.find((n) => n.id === lead.id) ?? lead;

      // Parents that grow to hold the children dragged past their edge. Only where the
      // caller applies changes: a parent's size is theirs to keep.
      const groups: ExpandGroup[] = [];
      if (ctx.nodesControlled()) {
        const byParent = new Map<string, Node[]>();
        for (const n of items) {
          if (n.expandParent !== true || n.parentId === undefined) continue;
          const list = byParent.get(n.parentId);
          if (list) list.push(n);
          else byParent.set(n.parentId, [n]);
        }
        for (const [parentId, kids] of byParent) {
          const parent = ctx.nodeById.get(parentId);
          if (!parent) continue;
          const at = ctx.absolutePosition(parent);
          const dragged = new Set(items.map((n) => n.id));
          groups.push(
            beginGroup(
              parentId,
              ctx.resolvePosition(parentId, parent.position),
              { x: at.x, y: at.y, ...ctx.getNodeSize(parent) },
              kids.map((k) => k.id),
              (ctx.childrenOf.get(parentId) ?? []).flatMap((id) => {
                const sibling = ctx.nodeById.get(id);
                return sibling && !dragged.has(id)
                  ? [{ id, rel: ctx.resolvePosition(id, sibling.position) }]
                  : [];
              }),
            ),
          );
        }
      }
      /** Where a grown parent's children sit relative to it, as of the latest step. */
      let relativeNow = new Map<string, XYPosition>();
      const at = (n: Node, dx: number, dy: number, dragging: boolean): Node => {
        const from = origins.get(n.id) ?? n.position;
        return { ...n, position: relativeNow.get(n.id) ?? { x: from.x + dx, y: from.y + dy }, dragging };
      };

      const starting = items.map((n) => at(n, 0, 0, false));
      ctx.callbacks.onNodeDragStart?.(event, lead, starting);
      if (selection) config.onSelectionDragStart?.(event, starting);

      // Where the drag may take these nodes: onto the grid (by the lead, so the
      // others keep their offsets from it), and inside every node's own extent.
      const boxes = items.map((n) => {
        const from = absOrigins.get(n.id) ?? n.position;
        return { x: from.x, y: from.y, ...ctx.getNodeSize(n) };
      });
      const extents = items.map(extentFor);
      const constrainMove = (dx: number, dy: number): XYPosition => {
        let move = { x: dx, y: dy };
        const grid = ctx.options.snapGrid;
        // On the canvas' grid, which is the canvas' own coordinates, not the parent's.
        const origin = absOrigins.get(lead.id);
        if (grid && origin) {
          move = {
            x: snapTo(origin.x + dx, grid[0]) - origin.x,
            y: snapTo(origin.y + dy, grid[1]) - origin.y,
          };
        }
        return clampMove(boxes, extents, move);
      };

      let last = { dx: 0, dy: 0 };
      return {
        move: (e, rawDx, rawDy) => {
          const { x: dx, y: dy } = constrainMove(rawDx, rawDy);
          last = { dx, dy };
          const changes: NodeChange[] = [];
          relativeNow = new Map();
          for (const g of groups) {
            const grown = growGroup(
              g,
              g.kids.flatMap((id) => {
                const n = ctx.nodeById.get(id);
                const from = absOrigins.get(id);
                return n && from ? [{ id, x: from.x + dx, y: from.y + dy, ...ctx.getNodeSize(n) }] : [];
              }),
            );
            changes.push(...grown.changes);
            for (const [id, position] of grown.relative) relativeNow.set(id, position);
          }
          for (const n of items) {
            const position = at(n, dx, dy, true).position;
            if (ctx.nodesControlled()) changes.push({ type: 'position', id: n.id, position, dragging: true });
            else ctx.setNodePosition(n, position);
          }
          ctx.emitNodeChanges(changes);
          // What the callback sees is where the drag put the nodes — even when the
          // caller, controlling them, has not applied the change yet.
          const moved = items.map((n) => at(n, dx, dy, true));
          ctx.callbacks.onNodeDrag?.(e, leadOf(moved), moved);
          if (selection) config.onSelectionDrag?.(e, moved);
        },
        end: (e) => {
          for (const n of items) ctx.draggingIds.delete(n.id);
          ctx.changed();
          if (ctx.nodesControlled()) {
            ctx.emitNodeChanges(items.map((n) => ({ type: 'position', id: n.id, dragging: false })));
          }
          const settled = items.map((n) => at(n, last.dx, last.dy, false));
          ctx.callbacks.onNodeDragStop?.(e, leadOf(settled), settled);
          if (selection) config.onSelectionDragStop?.(e, settled);
        },
      };
    };

    const nudgeSelection: DragApi['nudgeSelection'] = (dirX, dirY, large) => {
      const movable = ctx.selectedNodeIds().flatMap((id) => {
        const n = ctx.nodeById.get(id);
        return n && isDraggable(n) ? [n] : [];
      });
      const riding = descendantsOf(
        movable.map((n) => n.id),
        ctx.nodes,
      );
      const items = movable.filter((n) => !riding.has(n.id));
      if (items.length === 0) return;
      const unit = ctx.options.snapGrid ?? [5, 5];
      const factor = large ? 4 : 1;
      const boxes = items.map((n) => ({ ...ctx.absolutePosition(n), ...ctx.getNodeSize(n) }));
      const move = clampMove(boxes, items.map(extentFor), {
        x: dirX * unit[0] * factor,
        y: dirY * unit[1] * factor,
      });
      if (move.x === 0 && move.y === 0) return;
      const changes: NodePositionChange[] = [];
      items.forEach((n) => {
        const own = ctx.resolvePosition(n.id, n.position);
        const position = { x: own.x + move.x, y: own.y + move.y };
        if (ctx.nodesControlled()) changes.push({ type: 'position', id: n.id, position, dragging: false });
        else ctx.setNodePosition(n, position);
      });
      ctx.emitNodeChanges(changes);
    };

    return { beginNodeDrag, nudgeSelection, config };
  },

  useCanvas({ store, props }) {
    const { config } = store.api(dragFeature);
    config.selectOnDrag = props.selectNodesOnDrag ?? true;
    config.clickDistance = props.nodeClickDistance;
    config.onSelectionDragStart = props.onSelectionDragStart;
    config.onSelectionDrag = props.onSelectionDrag;
    config.onSelectionDragStop = props.onSelectionDragStop;
    return undefined;
  },

  useNode({ store, node, draggable, selected, justDragged }): NodeBits {
    const { beginNodeDrag, nudgeSelection, config } = store.api(dragFeature);
    const { beginAutoPan } = store.api(autoPanFeature);
    const { isMulti } = store.api(selectionFeature);
    const drag = useRef<DragState | null>(null);
    /** Stops watching for a press to become a drag; null when nothing is being watched. */
    const stopClaiming = useRef<(() => void) | null>(null);
    const [dragging, setDragging] = useState(false);
    /** How far a press travels to become a drag: the canvas's `nodeDragThreshold`, else the engine's own. */
    const threshold = () => store.getOptions().nodeDragThreshold ?? DRAG_THRESHOLD;

    useIsomorphicLayoutEffect(
      () => () => {
        stopClaiming.current?.();
        drag.current?.stopAutoPan?.();
      },
      [],
    );

    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggable || e.button !== 0 || isInteractive(e.target, store.getOptions().ignored)) return;
      // With a drag handle, only a press on it drags; elsewhere the canvas pans.
      if (node.dragHandle && !(e.target instanceof Element && e.target.closest(node.dragHandle))) return;
      // Claimed from the first press, so the canvas underneath does not start a
      // pan — even though the drag proper only begins past the threshold.
      e.stopPropagation();
      const pressed: DragState = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        session: null,
        startGraph: store.instance.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
        latest: null,
        stopAutoPan: null,
      };
      drag.current = pressed;

      // The pointer is only captured once the press has become a drag (capturing at
      // once would send the click of anything inside the node to the node). Until
      // then a quick move can leave the node — landing on the pane, or on the node
      // beneath — and its events would go there, never reaching this one. So watch
      // the window for the move that crosses the threshold and capture then, wherever
      // the pointer is; every move after that comes here.
      const element = e.currentTarget;
      stopClaiming.current?.();
      const stop = () => {
        window.removeEventListener('pointermove', claim, true);
        window.removeEventListener('pointerup', stop, true);
        window.removeEventListener('pointercancel', stop, true);
        if (stopClaiming.current === stop) stopClaiming.current = null;
      };
      const claim = (ev: PointerEvent) => {
        if (ev.pointerId !== pressed.pointerId) return;
        if (drag.current !== pressed || pressed.session) {
          stop();
          return;
        }
        if (Math.hypot(ev.clientX - pressed.startX, ev.clientY - pressed.startY) < threshold()) return;
        capturePointer(element, pressed.pointerId);
        stop();
      };
      window.addEventListener('pointermove', claim, true);
      window.addEventListener('pointerup', stop, true);
      window.addEventListener('pointercancel', stop, true);
      stopClaiming.current = stop;
    };

    /** Moves the dragged nodes to where the pointer is *in the graph*, from where it was when pressed. */
    const moveTo = (d: DragState, e: ReactPointerEvent<HTMLDivElement>) => {
      d.latest = e;
      const at = store.instance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      d.session?.move(e, at.x - d.startGraph.x, at.y - d.startGraph.y);
    };

    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (d?.pointerId !== e.pointerId) return;
      if (!d.session) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < threshold()) return;
        d.session = beginNodeDrag(node, e, isMulti(e));
        justDragged.current = true;
        setDragging(true);
        capturePointer(e.currentTarget, e.pointerId);
        // Held near the pane's edge the view pans, and the nodes must follow the pointer across it.
        const started = d;
        d.stopAutoPan = beginAutoPan(
          'node',
          () => (started.latest ? { x: started.latest.clientX, y: started.latest.clientY } : null),
          () => {
            if (started.latest) moveTo(started, started.latest);
          },
        );
      }
      e.stopPropagation();
      moveTo(d, e);
    };

    const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (d?.pointerId !== e.pointerId) return;
      drag.current = null;
      d.stopAutoPan?.();
      if (!d.session) {
        // A flick: one move far past the threshold, then the release. The move that crosses the threshold
        // is delivered to whatever is under the pointer — the capture it triggers only takes effect from
        // the next event — so the node never saw the pointer travel, and with no move after it the drag
        // would be lost. The release is the capture's first event: begin the drag, and end it, there.
        if (e.type === 'pointerup' && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) >= threshold()) {
          const session = beginNodeDrag(node, e, isMulti(e));
          justDragged.current = true;
          const at = store.instance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
          session.move(e, at.x - d.startGraph.x, at.y - d.startGraph.y);
          e.stopPropagation();
          releasePointer(e.currentTarget, e.pointerId);
          session.end(e);
        } else if (
          e.type === 'pointerup' &&
          config.clickDistance !== undefined &&
          Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > config.clickDistance
        ) {
          // Moved too far to be a click, and not far enough to be a drag: the click that follows is not one.
          justDragged.current = true;
        }
        return;
      }
      e.stopPropagation();
      releasePointer(e.currentTarget, e.pointerId);
      setDragging(false);
      d.session.end(e);
    };

    const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const arrow = ARROWS[e.key];
      if (!arrow) return;
      // A selected node moves with the arrow keys, as with a drag. An unselected
      // one leaves them to the page.
      if (!selected) return;
      e.preventDefault();
      nudgeSelection(arrow[0], arrow[1], e.shiftKey);
    };

    return {
      onPointerDown,
      onPointerMove,
      onPointerEnd,
      onKeyDown,
      dragging,
      ...(draggable ? { style: { cursor: dragging ? 'grabbing' : 'grab' } } : {}),
    };
  },
};
