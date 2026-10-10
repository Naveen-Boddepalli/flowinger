# Changelog

All notable changes to Flowinger. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org) — with the usual caveat that while the version
is `0.x`, a minor release may change the API; anything that does is listed under **Changed**.

The design notes behind each release — what was measured, what was tried and dropped — are in
[`plan.md`](plan.md).

## [Unreleased]

`package.json` already says `0.4.0`: rename this heading to `## [0.4.0] - <date>` when it is released.

### Added

- **`sourcePosition` and `targetPosition` on a node, and React Flow's built-in node types behind them.** A
  node with no component of its own — no `type`, or one `nodeTypes` does not name — now has handles, as
  React Flow's `default`, `input` and `output` do: a target on `targetPosition` (default top), a source on
  `sourcePosition` (default bottom); `input` has only the source, `output` only the target, `group` none. A
  component of your own is handed both fields. Before, such a node had no handles at all and edges
  attached to it by direction. The handle sets are compared with React Flow's own rendering.
- **React Flow's type names**, for the types flowinger already has: `OnNodesChange`, `OnEdgesChange`,
  `OnConnect`, `OnConnectStart`, `OnConnectEnd`, `OnInit`, `OnMove*`, `OnNodeDrag`, `OnDelete`,
  `OnBeforeDelete`, `OnSelectionChangeFunc`, `NodeMouseHandler`, `EdgeMouseHandler`, `IsValidConnection`,
  `ReactFlowProps`, `ReactFlowInstance`, `ReactFlowJsonObject`, `DefaultEdgeOptions`, `CoordinateExtent`,
  `SnapGrid`, `ControlProps`, `ConnectionLineComponent`, `BezierEdgeProps` and the other built-in edges'
  props, `GetBezierPathParams` and its two siblings, and a few more — 47 in all. Types only, so nothing
  reaches a bundle. `ReactFlowProps` and `ReactFlowInstance` are not generic, on purpose. Of React Flow's
  211 exports flowinger now has 146 (it had 99).
- `useConnection(selector?)` — the connection being dragged right now: `fromNode` / `toNode`,
  `fromHandle` / `toHandle`, `isValid`, `from` / `to`. The target is reported whether or not it would be
  accepted, so a node can mark an incompatible one. `NoConnection` when none is in progress.
- `useHandleConnections({ type, id, nodeId })` — `useNodeConnections` narrowed to one handle, under React
  Flow's older name for it.
- `id` and `domAttributes` on the canvas, for attributes flowinger has no prop for (never an event handler,
  or `id` / `style` / `className` / `children` / `role` / `tabIndex`, which the engine owns).

### Fixed

- **A flick did not drag.** A press that was released after one far move, with no move in between, left the
  node where it was: the move that crosses the drag threshold is delivered to whatever is under the pointer,
  and the node only ever saw the pointer once it was captured. The release now applies it.
- **`fitView` did nothing for a canvas mounted hidden.** The prop framed the nodes once they were
  measured, and counted that as done even when the pane had no size yet — a canvas inside a closed tab,
  modal or accordion is 0 × 0, where framing is a no-op — so it never framed when shown. It now waits for
  a pane with a size, and frames then.
- **Types for `require`.** The package is `"type": "module"`, so the one declaration file was typed as ESM
  even for a `require` consumer; TypeScript's `node16` / `nodenext` resolution from CommonJS rejected it
  (publint and Are the Types Wrong: "masquerading as ESM"). `exports` now gives `require` its own
  declarations (`dist/cjs/`), and the build checks the packed tarball in CI. `import` and bundler
  resolution are unchanged. Affects every earlier release.

### Changed

- **Test ids are React Flow's.** An edge's `data-testid` is `rf__edge-<id>` (it was `edge-<id>`), and the
  canvas, each node, `Controls`, `MiniMap` and `Background` now carry `rf__wrapper`, `rf__node-<id>`,
  `rf__controls`, `rf__minimap` and `rf__background` — checked against the real library's output — so
  tests that select on them carry over, as ones on `react-flow__*` class names already did. If you
  selected an edge on `edge-<id>`, add the prefix.
- `package.json` `exports` nests `types` under each of `import` and `require`, and exports
  `./package.json`. Resolution by tools that read `exports` is unchanged; the tarball is about 12 kB
  larger for the second set of declarations.

## [0.3.0] - 2026-09-22

### Added

- `getInternalNode(id)` and `useInternalNode(id)` — a node plus `internals.positionAbsolute` and
  `internals.z`.
- `useStoreApi()` — `getState()` without subscribing, and `subscribe()`.
- `ariaLabel`, `ariaRole` and `domAttributes` on `Node` and `Edge`.

## [0.2.0] - 2026-09-22

### Added

- **Mouse events** as `eventsFeature`: double click, context menu, enter / move / leave on nodes, edges
  and the pane, and `onPaneScroll`.
- **The view moving:** `defaultViewport`, `onMoveStart` / `onMove` / `onMoveEnd`, `useOnViewportChange`, and
  the `nowheel` class.
- **Edges:** `interactionWidth`, `pathOptions` (`curvature`, `borderRadius`), `labelStyle`, a box behind a
  label (`labelShowBg` and friends, as `edgeLabelsFeature`), the `BezierEdge` / `StraightEdge` /
  `SmoothStepEdge` / `StepEdge` components, `getEdgeCenter`, `getBezierEdgeCenter`, `updateEdgeData`,
  `getNodeConnections`, `getHandleConnections`, `isNode`, `isEdge`.
- **Nodes:** more fields on `NodeProps` (`selectable`, `draggable`, `deletable`, `dragging`, `dragHandle`,
  `parentId`, `zIndex`, `width`, `height`), `initialWidth` / `initialHeight`, `useUpdateNodeInternals`.
- **Handles:** `isConnectableStart`, `isConnectableEnd`, and a handle's own `isValidConnection` and
  `onConnect`.
- **Components:** `Controls` `position`, `fitViewOptions`, `ControlButton`; `MiniMap` styling props and
  `position`; `Background` `bgColor` and `patternClassName`; `getViewportForBounds`, exact to React Flow's.
- `NOTICE.md`, crediting the few lines adapted from React Flow.

### Changed

- A node's or edge's own `selectable` now wins over the canvas's `elementsSelectable`, either way, as in
  React Flow.
- A bezier edge's label sits on the curve, not on the straight line between its ends.

## [0.1.0] - 2026-09-21

First release.

- Pan and zoom (drag, wheel, trackpad pinch, touch pinch, double click, keyboard), `fitView`,
  `translateExtent`, and an instance API (`setViewport`, `zoomTo`, `setCenter`, `fitBounds`,
  `screenToFlowPosition`, node and edge getters and mutators).
- Nodes as your own React components, with `Handle`s measured where they are really drawn; edges
  (bezier, straight, step, smoothstep, custom) with arrowheads, labels and animation; sub-flows
  (`parentId`, `extent: 'parent'`, `expandParent`).
- Controlled flows (`onNodesChange`, `applyNodeChanges`, `useNodesState`, `addEdge`), selection and box
  selection, dragging with snapping and auto-pan, connecting and reconnecting, delete.
- `Background`, `Controls`, `MiniMap`, `Panel`, `NodeToolbar`, `NodeResizer`, `EdgeLabelRenderer`,
  `ViewportPortal`.
- A small core and opt-in features (`FlowingerCore`, `FlowingerCanvas`); about 15 kB gzipped with no
  features, about 23 kB with all of them.
- Server rendering and hydration on React 18 and 19.

[Unreleased]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Naveen-Boddepalli/flowinger/releases/tag/v0.1.0
