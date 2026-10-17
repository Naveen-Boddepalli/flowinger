import type { FlowingerProps } from './types.ts';

/** React Flow's modifier for adding to a selection and for zooming: ⌘ on a Mac, Control elsewhere. */
function platformModifier(): 'Meta' | 'Control' {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac') ? 'Meta' : 'Control';
}

// Read once, as the module loads — what React Flow reads on each render, and the same answer in a browser. A
// server says Control; the key is not drawn, so the markup does not differ.
const modifier = /* @__PURE__ */ platformModifier();

/**
 * React Flow's defaults, for every canvas prop where flowinger's differ — read from React Flow 13's source.
 * `<ReactFlow>` applies them itself, under the props it is given. `<FlowingerCanvas>` keeps flowinger's
 * (interaction off until asked for, a deeper zoom-out, a 3 px drag threshold, a fit that leaves 40 px); spread
 * this under your own props to have React Flow's there:
 *
 * ```tsx
 * <FlowingerCanvas {...reactFlowDefaults} nodes={nodes} edges={edges} />
 * ```
 *
 * Spread like that, a `fitViewOptions` of your own replaces the one here, so give it a `padding` if you want React
 * Flow's margin.
 *
 * What is not a canvas prop is not here, and `<ReactFlow>` sets it another way: the margin of the instance's
 * `fitView()` and of `Controls`' fit button (elsewhere pass `padding: '5%'`), the path of an animated move
 * (`interpolate: 'smooth'`), and `Controls`' lock (`showInteractive`). Neither are colours (`colorMode`,
 * `defaultMarkerColor`), which follow the `--flowinger-*` theme. See docs/upgrading.md.
 *
 * On a `FlowingerCore`, each of these needs its feature (`dragFeature` for `nodesDraggable`…), and a core
 * without one says so in development.
 */
/** React Flow 13's fit margin: 5% of the pane a side (`defaultFitViewPadding` in its source). */
export const REACT_FLOW_MARGIN = '5%';

/**
 * React Flow 12's fit margin, 0.1 of the view, written with a unit: `(1 - 1 / 1.1) / 2` of the pane a side, which is
 * what React Flow 12 leaves for `padding: 0.1`, to the pixel. (A bare `0.1` is pixels now.)
 */
export const REACT_FLOW_12_MARGIN = '4.545454545454546%';

export const reactFlowDefaults = {
  nodesDraggable: true,
  nodesConnectable: true,
  elementsSelectable: true,
  nodesFocusable: true,
  minZoom: 0.5,
  nodeDragThreshold: 1,
  paneClickDistance: 1,
  nodeClickDistance: 0,
  multiSelectionKeyCode: modifier,
  zoomActivationKeyCode: modifier,
  panActivationKeyCode: 'Space',
  fitViewOptions: { padding: REACT_FLOW_MARGIN },
} as const satisfies Partial<FlowingerProps>;

/**
 * React Flow 12's defaults, which `<ReactFlow>` had in 1.x: React Flow 13's but for the fit margin, which is 12's 0.1
 * of the view, written with a unit (`'4.545454545454546%'` a side, since a bare number is pixels now). Spread this to
 * keep 1.x's margin:
 *
 * ```tsx
 * <ReactFlow {...reactFlow12Defaults} nodes={nodes} edges={edges} fitView />
 * ```
 *
 * The instance's `fitView()` and `Controls`' fit button take their own margin: pass the same `padding` there.
 */
export const reactFlow12Defaults = {
  ...reactFlowDefaults,
  fitViewOptions: { padding: REACT_FLOW_12_MARGIN },
} as const satisfies Partial<FlowingerProps>;
