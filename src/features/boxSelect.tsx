import { useRef, useSyncExternalStore } from 'react';
import { useFlowingerStore } from '../context.ts';
import type { Feature } from '../features.ts';
import { isRectIntersecting } from '../geometry.ts';
import { DRAG_THRESHOLD, capturePointer, releasePointer } from '../pointer.ts';
import { selectionFeature } from './selection.ts';
import type { Rect, SelectionMode } from '../types.ts';

export interface BoxSelectApi {
  /**
   * Makes the selection whatever a box (in pane pixels) covers — `base`, if
   * given, kept as well — and remembers the box so it can be drawn. Edges join
   * when both their ends are in: a box that also grabbed every line leading out
   * of it would select things it does not visibly contain.
   */
  boxSelect: (
    rect: Rect,
    mode: SelectionMode,
    base: { nodes: ReadonlySet<string>; edges: ReadonlySet<string> } | null,
  ) => void;
  endBoxSelect: () => void;
  getSelectionRect: () => Rect | null;
  subscribeSelectionRect: (listener: () => void) => () => void;
}

interface BoxState {
  pointerId: number;
  startX: number;
  startY: number;
  /** The pane's place on the page, so the box can be worked in pane pixels. */
  left: number;
  top: number;
  active: boolean;
  /** What stays selected under it, when Ctrl or ⌘ held the selection at the start. */
  base: { nodes: ReadonlySet<string>; edges: ReadonlySet<string> } | null;
}

/** The rectangle dragged out to select with: in pane pixels, over the diagram. */
function SelectionBox() {
  const store = useFlowingerStore();
  const { getSelectionRect, subscribeSelectionRect } = store.api(boxSelectFeature);
  const rect = useSyncExternalStore(subscribeSelectionRect, getSelectionRect, () => null);
  if (!rect) return null;
  return (
    <div
      className="flowinger-selection react-flow__selection"
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        boxSizing: 'border-box',
        border: '1px dashed var(--flowinger-selected, #38bdf8)',
        background: 'color-mix(in srgb, var(--flowinger-selected, #38bdf8) 12%, transparent)',
        pointerEvents: 'none',
        zIndex: 4,
      }}
    />
  );
}

/**
 * Selecting by dragging a box over the pane: with `selectionOnDrag`, or with Shift held (both need
 * `elementsSelectable`). `selectionMode`, `onSelectionStart` and `onSelectionEnd` belong to it.
 */
export const boxSelectFeature: Feature<BoxSelectApi> = {
  name: 'boxSelect',
  needs: [selectionFeature],
  install(ctx) {
    const { isSelectable, setSelection } = ctx.api(selectionFeature);
    /** The box being dragged, in pane pixels — null when there is none. */
    let selectionRect: Rect | null = null;
    const listeners = new Set<() => void>();
    const emit = () => {
      for (const listener of listeners) listener();
    };

    const boxSelect: BoxSelectApi['boxSelect'] = (rect, mode, base) => {
      const { viewport } = ctx;
      const area: Rect = {
        x: (rect.x - viewport.x) / viewport.zoom,
        y: (rect.y - viewport.y) / viewport.zoom,
        width: rect.width / viewport.zoom,
        height: rect.height / viewport.zoom,
      };
      const nodeIds = new Set(base?.nodes);
      for (const n of ctx.nodes) {
        if (n.hidden === true || !isSelectable(n)) continue;
        const box = ctx.rectOf(n);
        if (box && isRectIntersecting(box, area, mode === 'partial')) nodeIds.add(n.id);
      }
      const edgeIds = new Set(base?.edges);
      for (const e of ctx.edges) {
        if (e.hidden !== true && e.selectable !== false && nodeIds.has(e.source) && nodeIds.has(e.target)) {
          edgeIds.add(e.id);
        }
      }
      setSelection(nodeIds, edgeIds);
      selectionRect = rect;
      emit();
    };

    const endBoxSelect = () => {
      if (selectionRect === null) return;
      selectionRect = null;
      emit();
    };

    return {
      boxSelect,
      endBoxSelect,
      getSelectionRect: () => selectionRect,
      subscribeSelectionRect: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  },

  useCanvas({ store, props, suppressPaneClick }) {
    const { elementsSelectable = false, selectionOnDrag = false, selectionMode = 'full' } = props;
    const { onSelectionStart, onSelectionEnd } = props;
    const { boxSelect, endBoxSelect } = store.api(boxSelectFeature);
    const box = useRef<BoxState | null>(null);
    return {
      // A bare press on the pane draws a selection box when that is asked for (always with Shift);
      // everything else falls through to panning.
      onPointerDown: (e) => {
        if (!(elementsSelectable && e.button === 0 && e.target === e.currentTarget && (selectionOnDrag || e.shiftKey))) {
          return false;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const keep = e.ctrlKey || e.metaKey ? store.getSelection() : null;
        box.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          left: rect.left,
          top: rect.top,
          active: false,
          base: keep && {
            nodes: new Set(keep.nodes.map((n) => n.id)),
            edges: new Set(keep.edges.map((n) => n.id)),
          },
        };
        return true;
      },
      onPointerMove: (e) => {
        const b = box.current;
        if (b?.pointerId !== e.pointerId) return false;
        if (!b.active) {
          if (Math.hypot(e.clientX - b.startX, e.clientY - b.startY) < DRAG_THRESHOLD) return true;
          b.active = true;
          suppressPaneClick(); // the click that ends it is not a click on the pane
          capturePointer(e.currentTarget, e.pointerId);
          onSelectionStart?.(e);
        }
        boxSelect(
          {
            x: Math.min(b.startX, e.clientX) - b.left,
            y: Math.min(b.startY, e.clientY) - b.top,
            width: Math.abs(e.clientX - b.startX),
            height: Math.abs(e.clientY - b.startY),
          },
          selectionMode,
          b.base,
        );
        return true;
      },
      onPointerEnd: (e) => {
        const b = box.current;
        if (b?.pointerId !== e.pointerId) return false;
        box.current = null;
        if (b.active) {
          releasePointer(e.currentTarget, e.pointerId);
          endBoxSelect();
          onSelectionEnd?.(e);
          // Leave focus where the delete key will find it.
          e.currentTarget.focus({ preventScroll: true });
        }
        return true;
      },
      ...(selectionOnDrag && elementsSelectable ? { style: { cursor: 'crosshair' } } : {}),
    };
  },

  Layer: SelectionBox,
};
