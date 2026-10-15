import type { FlowingerProps } from './types.ts';

/** React Flow's modifier for adding to a selection and for zooming: ⌘ on a Mac, Control elsewhere. */
function platformModifier(): 'Meta' | 'Control' {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac') ? 'Meta' : 'Control';
}

// Read once, as the module loads — what React Flow reads on each render, and the same answer in a browser. A
// server says Control; the key is not drawn, so the markup does not differ.
const modifier = /* @__PURE__ */ platformModifier();

/**
 * React Flow's defaults, for every canvas prop where flowinger's differ — read from React Flow 12.11.6's source.
 * Spread it under your own props to have them on a `<FlowingerCanvas>`:
 *
 * ```tsx
 * <FlowingerCanvas {...reactFlowDefaults} nodes={nodes} edges={edges} />
 * ```
 *
 * From 1.0, `<ReactFlow>` applies these itself, and `<FlowingerCanvas>` keeps flowinger's (interaction off until
 * asked for, a deeper zoom-out, a 3 px drag threshold, a fit that leaves 40 px). A `fitViewOptions` of your own
 * replaces the one here, so give it a `padding` if you want React Flow's margin.
 *
 * What is not a canvas prop is not here: the margin of the instance's `fitView()` and of `Controls`' fit button
 * (pass `padding: 0.1`), the path of an animated move (pass `interpolate: 'smooth'`), and `Controls`' lock
 * (`showInteractive`). Neither are colours (`colorMode`, `defaultMarkerColor`), which follow the
 * `--flowinger-*` theme. See docs/upgrading-to-1.0.md.
 *
 * On a `FlowingerCore`, each of these needs its feature (`dragFeature` for `nodesDraggable`…), and a core
 * without one says so in development.
 */
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
  fitViewOptions: { padding: 0.1 },
} as const satisfies Partial<FlowingerProps>;
