import type { Feature } from './features.ts';
import type { FlowingerProps } from './types.ts';

/** The props only a feature acts on — given without it, they would be ignored without a word. */
const ONLY_WITH: Record<string, readonly (keyof FlowingerProps)[]> = {
  drag: [
    'nodesDraggable',
    'onNodeDragStart',
    'onNodeDrag',
    'onNodeDragStop',
    'autoPanOnNodeDrag',
    'nodeExtent',
    'snapToGrid',
    'snapGrid',
    'nodeDragThreshold',
  ],
  autoPan: ['autoPanSpeed'],
  panKey: ['panActivationKeyCode'],
  connect: [
    'nodesConnectable',
    'onConnect',
    'onConnectStart',
    'onConnectEnd',
    'isValidConnection',
    'connectionMode',
    'connectionLineType',
    'connectionLineStyle',
    'connectionLineComponent',
    'autoPanOnConnect',
  ],
  reconnect: ['onReconnect', 'onReconnectStart', 'onReconnectEnd', 'edgesReconnectable'],
  boxSelect: ['selectionOnDrag', 'selectionMode', 'onSelectionStart', 'onSelectionEnd'],
  delete: ['deleteKeyCode', 'onBeforeDelete', 'onNodesDelete', 'onEdgesDelete', 'onDelete'],
  culling: ['onlyRenderVisibleElements'],
  selection: ['elementsSelectable', 'edgesFocusable'],
  events: [
    'onNodeDoubleClick',
    'onNodeContextMenu',
    'onNodeMouseEnter',
    'onNodeMouseMove',
    'onNodeMouseLeave',
    'onEdgeDoubleClick',
    'onEdgeContextMenu',
    'onEdgeMouseEnter',
    'onEdgeMouseMove',
    'onEdgeMouseLeave',
    'onPaneContextMenu',
    'onPaneMouseEnter',
    'onPaneMouseMove',
    'onPaneMouseLeave',
    'onPaneScroll',
  ],
};

/**
 * Says so, once, when a canvas is given a prop that belongs to a feature it does not have. Development
 * only — see the caller. `features` is the resolved list: what a feature needs counts as given.
 */
export function warnAboutIgnoredProps(props: FlowingerProps, features: readonly Feature[]): void {
  const have = new Set(features.map((f) => f.name));
  for (const feature of Object.keys(ONLY_WITH)) {
    if (have.has(feature)) continue;
    const given = (ONLY_WITH[feature] ?? []).filter((name) => {
      const value = props[name];
      return value !== undefined && value !== null && value !== false;
    });
    if (given.length === 0) continue;
    console.warn(
      `flowinger: ${given.join(', ')} ${given.length === 1 ? 'does' : 'do'} nothing without the "${feature}" ` +
        `feature — pass ${feature}Feature in \`features\`, or use <FlowingerCanvas>, which has them all.`,
    );
  }
  if (props.viewport !== undefined && props.onViewportChange === undefined) {
    console.warn(
      'flowinger: `viewport` is given without `onViewportChange`, so the view is yours to move and nothing ' +
        'will pan or zoom it — set `viewport` from what `onViewportChange` reports, or use `defaultViewport`.',
    );
  }
  if (
    (props.nodes === undefined && props.defaultNodes !== undefined) ||
    (props.edges === undefined && props.defaultEdges !== undefined)
  ) {
    console.warn(
      'flowinger: defaultNodes and defaultEdges need <FlowingerCanvas>, which can own the graph — ' +
        '<FlowingerCore> shows the `nodes` it is given.',
    );
  }
}
