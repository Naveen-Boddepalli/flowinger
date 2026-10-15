import type { Feature } from './features.ts';
import { reactFlowDefaults } from './reactFlowDefaults.ts';
import type { FlowingerProps, Position } from './types.ts';

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
  zoomKey: ['zoomActivationKeyCode'],
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
 *
 * There are none: every prop in React Flow's `ReactFlow` does something here. This is where a name goes that
 * is added before it works — a name that compiles and does nothing is worse than a missing one.
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

/** What a canvas does today with each of `reactFlowDefaults`' props left out, as the warning below says it. */
const FLOWINGER_DEFAULT: Record<keyof typeof reactFlowDefaults, string> = {
  nodesDraggable: 'false',
  nodesConnectable: 'false',
  elementsSelectable: 'false',
  nodesFocusable: 'as elementsSelectable',
  minZoom: '0.05',
  nodeDragThreshold: '3',
  paneClickDistance: 'any distance',
  nodeClickDistance: 'any distance',
  multiSelectionKeyCode: 'Shift, Control or Meta',
  zoomActivationKeyCode: 'none',
  panActivationKeyCode: 'none',
  fitViewOptions: '40 px',
};

let toldAboutReactFlowDefaults = false;

/**
 * Says, once a page, which props a `<ReactFlow>` leaves out whose default changes in 1.0, when `<ReactFlow>`
 * takes React Flow's (`reactFlowDefaults`) and `<FlowingerCanvas>` keeps flowinger's. Development only — see
 * the caller. A canvas that sets them all, or spreads `reactFlowDefaults`, hears nothing.
 */
export function warnAboutReactFlowDefaults(props: FlowingerProps): void {
  if (toldAboutReactFlowDefaults) return;
  const left = (Object.keys(reactFlowDefaults) as (keyof typeof reactFlowDefaults)[]).filter((name) =>
    // The fit's margin is only a prop's business when the canvas fits itself.
    name === 'fitViewOptions'
      ? props.fitView === true && props.fitViewOptions?.padding === undefined
      : props[name] === undefined,
  );
  if (left.length === 0) return;
  toldAboutReactFlowDefaults = true;
  const changes = left.map((name) =>
    name === 'fitViewOptions'
      ? `fitViewOptions.padding (${FLOWINGER_DEFAULT[name]} → 0.1)`
      : `${name} (${FLOWINGER_DEFAULT[name]} → ${String(reactFlowDefaults[name])})`,
  );
  console.warn(
    `flowinger: in 1.0, <ReactFlow> takes React Flow's defaults, and this canvas leaves out ${changes.join(', ')}. ` +
      'To keep what it does now, render <FlowingerCanvas>: the same canvas, with flowinger\'s defaults. To have ' +
      "React Flow's now, spread `reactFlowDefaults` under your props, or set each. See docs/upgrading.md.",
  );
}

/** For tests: forget that the warning above was given. */
export function resetReactFlowDefaultsWarning(): void {
  toldAboutReactFlowDefaults = false;
}

let toldAboutLegacyHandle = false;

/**
 * Says, once a page, that an edge is drawn at a side guessed from its handle's name (`in` / `top`, `out` /
 * `bottom`, `prev` / `left`, `next` / `right`) because the node has no `<Handle>` of that id — a rule from before
 * handles were measured, which React Flow does not have and 1.0 removes. Development only — see the caller.
 */
export function warnAboutLegacyHandle(nodeId: string, handleId: string, side: Position, fallback: Position): void {
  if (toldAboutLegacyHandle) return;
  toldAboutLegacyHandle = true;
  const name = (p: Position) => `Position.${p.charAt(0).toUpperCase()}${p.slice(1)}`;
  console.warn(
    `flowinger: an edge names handle "${handleId}" on node "${nodeId}", which has no <Handle> of that id, so it ` +
      `meets the node's ${side} side by an old rule that guesses a side from the name. 1.0 drops the rule, and ` +
      `the edge will meet the ${fallback} side instead — add <Handle id="${handleId}" position={${name(side)}} />, ` +
      'or list it in the node\'s `handles`. See docs/upgrading.md.',
  );
}

/** For tests: forget that the warning above was given. */
export function resetLegacyHandleWarning(): void {
  toldAboutLegacyHandle = false;
}
