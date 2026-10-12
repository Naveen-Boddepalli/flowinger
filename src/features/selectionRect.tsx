import { useRef, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useFlowingerStore } from '../context.ts';
import type { Feature } from '../features.ts';
import { DRAG_THRESHOLD, capturePointer, releasePointer } from '../pointer.ts';
import type { FlowingerProps, Rect, XYPosition } from '../types.ts';
import { useIsomorphicLayoutEffect } from '../useIsomorphicLayoutEffect.ts';
import { ViewportPortal } from '../ViewportPortal.tsx';
import { autoPanFeature } from './autoPan.ts';
import { boxSelectFeature } from './boxSelect.tsx';
import { dragFeature, type DragSession } from './drag.ts';

export interface SelectionRectApi {
  /** Whether the rectangle may be showing: a box selection has ended since the selection last changed. */
  isArmed: () => boolean;
  arm: () => void;
  disarm: () => void;
  subscribe: (listener: () => void) => () => void;
  /** The canvas's `onSelectionContextMenu`, as last given; written by `useCanvas`. */
  readonly config: { onContextMenu: FlowingerProps['onSelectionContextMenu'] };
}

interface Press {
  pointerId: number;
  startX: number;
  startY: number;
  /** Where the press was in the graph, so the drag is measured there and the view panning under it is followed. */
  startGraph: XYPosition;
  session: DragSession | null;
  latest: ReactPointerEvent<HTMLDivElement> | null;
  stopAutoPan: (() => void) | null;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** The rectangle round the selected nodes, drawn in graph space, which is dragged to move them all. */
function SelectionRect() {
  const store = useFlowingerStore();
  const rectApi = store.api(selectionRectFeature);
  const { beginNodeDrag, nudgeSelection } = store.api(dragFeature);
  const { beginAutoPan } = store.api(autoPanFeature);
  // The armed state, the selection (by id) and the layout: three things that move it, and nothing else does.
  const armed = useSyncExternalStore(rectApi.subscribe, rectApi.isArmed, () => false);
  const picked = useSyncExternalStore(
    store.subscribeSelection,
    () =>
      store
        .getSelection()
        .nodes.map((n) => n.id)
        .join('|'),
    () => '',
  );
  useSyncExternalStore(store.subscribeGeometry, store.getGeometryVersion, store.getGeometryVersion);
  const press = useRef<Press | null>(null);
  /** What was selected when the box ended: the rectangle is that selection's, and ends with a change of it. */
  const settled = useRef<string | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!armed) {
      settled.current = null;
    } else if (settled.current === null) {
      if (picked !== '') settled.current = picked;
    } else if (settled.current !== picked) {
      rectApi.disarm();
    }
  }, [armed, picked, rectApi]);

  if (!armed || picked === '' || (settled.current !== null && settled.current !== picked)) return null;

  let box: Rect | null = null;
  for (const id of picked.split('|')) {
    const r = store.getNodeRect(id);
    if (!r) continue;
    if (!box) {
      box = { ...r };
      continue;
    }
    const right = Math.max(box.x + box.width, r.x + r.width);
    const bottom = Math.max(box.y + box.height, r.y + r.height);
    box.x = Math.min(box.x, r.x);
    box.y = Math.min(box.y, r.y);
    box.width = right - box.x;
    box.height = bottom - box.y;
  }
  if (!box) return null;

  const moveTo = (p: Press, e: ReactPointerEvent<HTMLDivElement>) => {
    p.latest = e;
    const at = store.instance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    p.session?.move(e, at.x - p.startGraph.x, at.y - p.startGraph.y);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Neither the canvas (a pan, a new box) nor the nodes under it may take this press.
    e.stopPropagation();
    capturePointer(e.currentTarget, e.pointerId);
    press.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startGraph: store.instance.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
      session: null,
      latest: null,
      stopAutoPan: null,
    };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (p?.pointerId !== e.pointerId) return;
    e.stopPropagation();
    if (!p.session) {
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < DRAG_THRESHOLD) return;
      const lead = store.getSelection().nodes[0];
      if (!lead) return;
      // The selection moves together, as a node in it dragged would — and this drag says it is the selection's.
      p.session = beginNodeDrag(lead, e, false, true);
      p.stopAutoPan = beginAutoPan(
        'node',
        () => (p.latest ? { x: p.latest.clientX, y: p.latest.clientY } : null),
        () => {
          if (p.latest) moveTo(p, p.latest);
        },
      );
    }
    moveTo(p, e);
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (p?.pointerId !== e.pointerId) return;
    press.current = null;
    e.stopPropagation();
    releasePointer(e.currentTarget, e.pointerId);
    p.stopAutoPan?.();
    p.session?.end(e);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const arrow = ARROWS[e.key];
    if (!arrow) return;
    e.preventDefault();
    nudgeSelection(arrow[0], arrow[1], e.shiftKey);
  };

  const { onContextMenu } = rectApi.config;
  return (
    <ViewportPortal>
      <div
        className="flowinger-nodesselection-rect react-flow__nodesselection-rect nopan"
        tabIndex={-1}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: box.width,
          height: box.height,
          transform: `translate(${String(box.x)}px, ${String(box.y)}px)`,
          boxSizing: 'border-box',
          border: '1px dotted var(--flowinger-selected, #38bdf8)',
          background: 'color-mix(in srgb, var(--flowinger-selected, #38bdf8) 8%, transparent)',
          cursor: 'grab',
          pointerEvents: 'all',
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        onClick={(e) => {
          e.stopPropagation(); // not a click on the pane, which would drop the selection
        }}
        {...(onContextMenu
          ? {
              onContextMenu: (e) => {
                onContextMenu(e, store.getSelection().nodes);
              },
            }
          : {})}
      />
    </ViewportPortal>
  );
}

/**
 * The rectangle that stays round what a selection box took — React Flow's `NodesSelection` — and is dragged to
 * move all of it (`onSelectionDragStart`, `onSelectionDrag`, `onSelectionDragStop`, as well as `onNodeDrag*`),
 * or right-clicked (`onSelectionContextMenu`). It goes with a click on the pane or on a node, or a change of
 * the selection.
 */
export const selectionRectFeature: Feature<SelectionRectApi> = {
  name: 'selectionRect',
  needs: [boxSelectFeature, dragFeature],
  install(ctx) {
    const listeners = new Set<() => void>();
    let armed = false;
    const set = (next: boolean) => {
      if (armed === next) return;
      armed = next;
      for (const fn of listeners) fn();
    };
    ctx.api(boxSelectFeature).onBoxEnd(() => {
      set(true);
    });
    return {
      isArmed: () => armed,
      arm: () => {
        set(true);
      },
      disarm: () => {
        set(false);
      },
      subscribe: (fn) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
      config: { onContextMenu: undefined },
    };
  },

  useCanvas({ store, props }) {
    store.api(selectionRectFeature).config.onContextMenu = props.onSelectionContextMenu;
    return undefined;
  },

  Layer: SelectionRect,
};
