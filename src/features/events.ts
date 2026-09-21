import type { Feature } from '../features.ts';
import { useIsomorphicLayoutEffect } from '../useIsomorphicLayoutEffect.ts';
import type { FlowingerProps } from '../types.ts';

export interface EventsApi {
  /** The props the canvas was last rendered with: what a node or an edge asks when it is clicked. */
  latest: { current: FlowingerProps };
}

/**
 * The mouse events React Flow has and a canvas that only *shows* a graph does not need: a double click
 * and a right click on a node, an edge and the pane, the pointer coming onto, moving over and leaving
 * them, and the wheel turning over the pane.
 *
 * `onNodeClick`, `onEdgeClick` and `onPaneClick` are not this feature's: they work on any canvas. Giving
 * any edge event (or `onEdgeClick`) makes every edge take the pointer, selectable or not.
 */
export const eventsFeature: Feature<EventsApi> = {
  name: 'events',
  install() {
    return { latest: { current: {} } };
  },

  useCanvas({ store, props }) {
    const { latest } = store.api(eventsFeature);
    // Read when an event happens, so a handler that changes between renders is heard as it now is.
    useIsomorphicLayoutEffect(() => {
      latest.current = props;
    });
    const { onPaneMouseEnter, onPaneMouseMove, onPaneMouseLeave, onPaneContextMenu, onPaneScroll, panOnDrag } = props;
    return {
      edgesInteractive:
        props.onEdgeDoubleClick !== undefined ||
        props.onEdgeContextMenu !== undefined ||
        props.onEdgeMouseEnter !== undefined ||
        props.onEdgeMouseMove !== undefined ||
        props.onEdgeMouseLeave !== undefined,
      props: {
        onPointerEnter: onPaneMouseEnter,
        onPointerLeave: onPaneMouseLeave,
        // Captured, so it is heard whatever the canvas's own move handling — a pan, a box — does with it.
        onPointerMoveCapture: onPaneMouseMove,
        // The menu is the pane's own only on the bare canvas, and not while the right button pans.
        onContextMenu: (e) => {
          if (e.target !== e.currentTarget) return;
          if (Array.isArray(panOnDrag) && panOnDrag.includes(2)) {
            e.preventDefault();
            return;
          }
          onPaneContextMenu?.(e);
        },
        onWheel:
          onPaneScroll &&
          ((e) => {
            if (e.target === e.currentTarget) onPaneScroll(e);
          }),
      },
    };
  },

  useNode({ store, node }) {
    const { latest } = store.api(eventsFeature);
    return {
      props: {
        onDoubleClick: (e) => {
          latest.current.onNodeDoubleClick?.(e, node);
        },
        onContextMenu: (e) => {
          latest.current.onNodeContextMenu?.(e, node);
        },
        onMouseEnter: (e) => {
          latest.current.onNodeMouseEnter?.(e, node);
        },
        onMouseMove: (e) => {
          latest.current.onNodeMouseMove?.(e, node);
        },
        onMouseLeave: (e) => {
          latest.current.onNodeMouseLeave?.(e, node);
        },
      },
    };
  },

  useEdge({ store, edge }) {
    const { latest } = store.api(eventsFeature);
    return {
      props: {
        onDoubleClick: (e) => {
          latest.current.onEdgeDoubleClick?.(e, edge);
        },
        onContextMenu: (e) => {
          latest.current.onEdgeContextMenu?.(e, edge);
        },
        onMouseEnter: (e) => {
          latest.current.onEdgeMouseEnter?.(e, edge);
        },
        onMouseMove: (e) => {
          latest.current.onEdgeMouseMove?.(e, edge);
        },
        onMouseLeave: (e) => {
          latest.current.onEdgeMouseLeave?.(e, edge);
        },
      },
    };
  },
};
