import type { Feature } from './features.ts';
import type { FlowingerProps } from './types.ts';

/** The props only a feature acts on — given without it, they would be ignored without a word. */
const ONLY_WITH: Record<string, readonly (keyof FlowingerProps)[]> = {
  drag: [
    'nodesDraggable',
    'selectNodesOnDrag',
    'nodeClickDistance',
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
  a11y: ['nodesFocusable', 'disableKeyboardA11y', 'ariaLabelConfig', 'autoPanOnNodeFocus'],
  debug: ['debug'],
  stacking: ['elevateNodesOnSelect', 'elevateEdgesOnSelect', 'zIndexMode'],
  colorMode: ['colorMode'],
  selectionRect: ['onSelectionDragStart', 'onSelectionDrag', 'onSelectionDragStop', 'onSelectionContextMenu'],
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
    'connectOnClick',
    'connectionDragThreshold',
    'connectionRadius',
    'onClickConnectStart',
    'onClickConnectEnd',
    'connectionLineContainerStyle',
  ],
  reconnect: ['onReconnect', 'onReconnectStart', 'onReconnectEnd', 'edgesReconnectable', 'reconnectRadius'],
  boxSelect: ['selectionOnDrag', 'selectionMode', 'onSelectionStart', 'onSelectionEnd', 'selectionKeyCode', 'autoPanOnSelection'],
  delete: ['deleteKeyCode', 'onBeforeDelete', 'onNodesDelete', 'onEdgesDelete', 'onDelete'],
  culling: ['onlyRenderVisibleElements'],
  selection: ['elementsSelectable', 'edgesFocusable', 'multiSelectionKeyCode'],
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
 * Props that are in React Flow's API, so code written for it compiles, but that nothing here reads. Each
 * is `@unimplemented` in `types.ts` (a test keeps the two lists the same). The values are the ones that ask
 * for what the canvas does anyway — React Flow's own default, mostly — and are not worth a warning.
 */
export const NOT_IMPLEMENTED: { readonly [K in keyof FlowingerProps]?: readonly unknown[] } = {
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
  const accepted = (Object.keys(NOT_IMPLEMENTED) as (keyof FlowingerProps)[]).filter((name) => {
    const value = props[name];
    return value !== undefined && !NOT_IMPLEMENTED[name]?.includes(value);
  });
  if ((props.nodes ?? props.defaultNodes)?.some((node) => node.handles !== undefined)) {
    accepted.push('nodes[].handles' as keyof FlowingerProps);
  }
  if (accepted.length > 0) {
    accepted.sort();
    console.warn(
      `flowinger: ${accepted.join(', ')} ${accepted.length === 1 ? 'is' : 'are'} accepted so React Flow code ` +
        `compiles, but ${accepted.length === 1 ? 'does' : 'do'} nothing here — see "Accepted, not implemented" ` +
        'in docs/react-flow-coverage.md.',
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

const said = new Set<string>();

/**
 * Says, once a page, that a component was given props it accepts for React Flow's sake and does nothing
 * with. `props` maps each such prop to what was passed; `undefined` and `false` ask for nothing. Called
 * from a render behind `process.env.NODE_ENV !== 'production'`, which a production bundle drops.
 */
export function warnAcceptedProps(component: string, props: Record<string, unknown>): void {
  const given = Object.keys(props)
    .filter((name) => props[name] !== undefined && props[name] !== false && !said.has(`${component}.${name}`))
    .sort();
  if (given.length === 0) return;
  for (const name of given) said.add(`${component}.${name}`);
  console.warn(
    `flowinger: <${component}> ${given.join(', ')} ${given.length === 1 ? 'is' : 'are'} accepted so React Flow ` +
      `code compiles, but ${given.length === 1 ? 'does' : 'do'} nothing here — see "Accepted, not implemented" ` +
      'in docs/react-flow-coverage.md.',
  );
}

/** For tests: the next component to be given such a prop says so again. */
export function forgetAcceptedProps(): void {
  said.clear();
}
