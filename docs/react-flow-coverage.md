# How much of React Flow this covers

[← Documentation](README.md) · Measured, not recalled: [`scripts/audit-react-flow.mjs`](../scripts/audit-react-flow.mjs) reads React Flow's own type declarations. For what to *do* about the gaps, see [Migrating from React Flow](migrating-from-react-flow.md).


It keeps React Flow's shape and names for the core — `ReactFlow`, `ReactFlowProvider`, `useReactFlow`, `useStore`,
`Handle`, `Position`, `Background`, `BackgroundVariant`, `MarkerType`, `useNodesState`, `useEdgesState`,
`applyNodeChanges`, `applyEdgeChanges`, `addEdge`, `useNodesInitialized`, and the `Node` / `Edge` / `NodeProps`
types — and the `react-flow__*` class names on the elements it draws. **It is not a drop-in for arbitrary React
Flow code**: it covers the part of the API an app like [QueryLens](https://github.com/Naveen-Boddepalli/QueryLens)
uses (which it replaced, with identical geometry and its whole end-to-end suite passing), not all of it.

Measured against `@xyflow/react` 12.11.6's own type declarations
(`node scripts/audit-react-flow.mjs <path to its dist/esm/index.d.ts>`, after `pnpm build`): **158 of its 211
exports**, **83 of 119** `ReactFlow` props, 31 of 32 instance methods, 21 of 22 `Node` fields, **13 of 13**
`NodeProps` fields, and **20 of 20** on both `Edge` and `EdgeProps`. What is missing:

- **Type names:** the ones an app imports by name — `OnNodesChange`, `OnConnect`, `ReactFlowProps`,
  `ReactFlowInstance`, `NodeMouseHandler`, `DefaultEdgeOptions`… — are exported under React Flow's names, types
  only. Two things differ on purpose: `ReactFlowProps` and `ReactFlowInstance` are **not generic** (the canvas
  and the instance are not, so `ReactFlowInstance<MyNode>` is an error here rather than a type argument quietly
  ignored), and `OnConnectEnd`'s second argument is flowinger's `ConnectEndState`, not React Flow's
  `FinalConnectionState`. Of the 53 exports still missing, 44 are types — nearly all for components and props
  flowinger does not have (`NodeOrigin`, `ColorMode`, `PanOnScrollMode`, the resize-control, edge-toolbar and
  MiniMap-node types), plus `SmoothStepPathOptions` and `BezierPathOptions`, whose shapes differ.

- **Canvas events:** `onSelectionContextMenu`, `onSelectionDrag*`; `onClickConnectStart` / `End` (connecting
  by click, as opposed to dragging). Mouse events on nodes, edges and the pane (double click, context menu, enter, move,
  leave) and the pane's scroll are covered, as `eventsFeature`.
- **Viewport and gestures:** (a controlled `viewport` and `onViewportChange` are there now);
  `selectionKeyCode`, `multiSelectionKeyCode`, `panActivationKeyCode`,
  `zoomActivationKeyCode`, `panOnScrollMode`, `selectNodesOnDrag`, `nodesFocusable`, `disableKeyboardA11y`,
  `connectOnClick`, `connectionRadius`, `reconnectRadius`, the drag and click distance thresholds,
  `preventScrolling`, `noDragClassName` / `noPanClassName` (`nodrag`, `nopan` and now `nowheel` are honoured).
- **Layout and look:** `nodeOrigin`, `elevateNodesOnSelect` / `elevateEdgesOnSelect`, `zIndexMode`, `colorMode`,
  `debug`, `ariaLabelConfig`, `defaultMarkerColor`, `connectionLineContainerStyle` (`proOptions` and
  `attributionPosition` are accepted and do nothing — there is no attribution to hide). The canvas now takes
  `id` and a `domAttributes` escape hatch (never an event handler, or what it already owns). `Panel`,
  `NodeToolbar`, `MiniMap`, `Handle` and `BaseEdge` take the attributes of their own element — `id`, `title`,
  `role`, `aria-*`, `tabIndex`, `data-*` — but not its event handlers (`onClick`, `onPointerDown`…), which the
  canvas's own pointer and keyboard handling would lose to; a handle's `id` stays its handle id, and on
  `BaseEdge` they land on the path. The engine's own classes, positioning and handlers win over yours.
- **Hooks and instance:** `useUpdateNodeInternals`, `useOnViewportChange`, `useConnection`,
  `useHandleConnections`, `useStoreApi` (`getState()` and `subscribe()`, no generic `setState`),
  `getNodeConnections` and `getHandleConnections` are all there now. `viewportInitialized`: on purpose —
  React Flow's own instance is rebuilt when it flips, and flowinger's is created once and never replaced
  (deliberately, see `plan.md`), so a boolean *field* here would either go stale or be a silently wrong
  shape; there is no honest way to add it without one of those.
- **Components:** `SimpleBezierEdge`, `EdgeText`, `EdgeToolbar`, `NodeResizeControl`, `MiniMapNode` (there are
  now `BezierEdge`, `StraightEdge`, `SmoothStepEdge`, `StepEdge`, `isNode`, `isEdge`, `getEdgeCenter`,
  `getBezierEdgeCenter`, `getViewportForBounds` and `ControlButton`). `MiniMap`'s `zoomable`, `nodeComponent`,
  `offsetScale`, `onNodeClick`, `inversePan`; `Controls`' `showInteractive`, `onInteractiveChange`;
  `NodeResizer`'s `autoScale`.
- **Fields:** a node's `handles` (there is now `sourcePosition`, `targetPosition`, `initialWidth` /
  `initialHeight`, `ariaLabel`, `ariaRole` and `domAttributes` — an escape hatch, never an event handler or
  `id` / `style` / `className` / `role`, on both a node and an edge). A custom node is given
  `sourcePosition` and `targetPosition`, `selectable`, `draggable`, `deletable`, `dragging`, `dragHandle`,
  `parentId`, `zIndex`, `width` and `height`, alongside `id`, `data`, `type`, `selected`, `isConnectable` and
  its absolute position. `fitView` has no `ease` / `interpolate`.

Counts are not weights — most of the list is niche — but it is a list to check your own code against before
swapping. **Defaults differ, and that is the part a compiler will not find:** nodes are not draggable, connectable
or selectable until you say so (`nodesDraggable`, `nodesConnectable`, `elementsSelectable` — React Flow's are on),
`minZoom` is `0.05` (React Flow's `0.5`), and `fitView` keeps a 40 px margin unless you pass a `padding` ratio
(React Flow's is `0.1`). Nodes and edges do not get React Flow's `role`, `aria-roledescription` or live region.
[**docs/migrating-from-react-flow.md**](migrating-from-react-flow.md) is the checklist, with each default
read from React Flow's source.
