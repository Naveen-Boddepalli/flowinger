# Changelog

All notable changes to Flowinger. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org) — with the usual caveat that while the version
is `0.x`, a minor release may change the API; anything that does is listed under **Changed**.

The design notes behind each release — what was measured, what was tried and dropped — are in
[`plan.md`](plan.md).

## [Unreleased]

### Added

- **Every one of React Flow's 211 exports and 119 canvas props is named, and does something.** The audit
  (`scripts/audit-react-flow.mjs`) counts a name that compiles and does nothing apart from one that works —
  `@unimplemented` in its doc comment, and a development warning when a canvas is given it — and there are
  none: **302 of the 302** members of the props, the instance and the components do what they say. See
  [React Flow coverage](docs/react-flow-coverage.md) and, for what differs from React Flow, the
  [migration guide](docs/migrating-from-react-flow.md#4-what-is-not-there).
- **Gestures and keys:** `selectionKeyCode`, `multiSelectionKeyCode` and `zoomActivationKeyCode` (a key, a
  combination, a list, or `null`); `panOnScrollMode` and `preventScrolling`; `noWheelClassName`,
  `noPanClassName` and `noDragClassName` (yours, beside `nowheel` / `nopan` / `nodrag`); `paneClickDistance`
  and `nodeClickDistance`; `selectNodesOnDrag`.
- **Connecting:** `connectionDragThreshold` (default 1 px — a click on a handle is no longer a connection),
  `connectionRadius` (20) and `reconnectRadius` (10), in graph units; `connectOnClick` (default true) with
  `onClickConnectStart` / `onClickConnectEnd` — click a handle, then another.
- **Selection:** a box selection leaves a rectangle round what it took (`selectionRectFeature`), which is
  dragged to move it all and right-clicked: `onSelectionDragStart` / `onSelectionDrag` / `onSelectionDragStop`
  (with `onNodeDrag*` called as well) and `onSelectionContextMenu`. `autoPanOnSelection`: a box held at the
  pane's edge pans the view, its corner staying on the same place in the graph.
- **Look:** `elevateNodesOnSelect` (default on) and `elevateEdgesOnSelect` (off) and `zIndexMode`
  (`'basic'`, `'auto'`, `'manual'`) as `stackingFeature` — a selected node, and what is inside it, is raised by
  1000; `colorMode` (`'light'`, `'dark'`, `'system'`) as `colorModeFeature`; `defaultMarkerColor`;
  `connectionLineContainerStyle`.
- **Accessibility and diagnostics:** `nodesFocusable`, `disableKeyboardA11y`, a node's and an edge's own
  `focusable`, `ariaLabelConfig` (descriptions nodes and edges point at, a live announcement of a keyboard
  move, labels for the controls, minimap and handles), `autoPanOnNodeFocus` — all `a11yFeature`; `debug`
  (`debugFeature`).
- **`Node.handles`** — where a node's handles are, for an edge to meet before they are drawn and measured
  (server-rendered output, the first measure). **`interpolate: 'smooth'`** (`smoothFeature`, van Wijk and Nuij's
  path). **`MiniMap`'s `inversePan`.** **`NodeToolbar`'s `nodeId`** for another node, or several, drawn at them in
  graph space. **`Controls`' `showInteractive` / `onInteractiveChange`** — a lock that switches dragging,
  connecting and selecting off and on over the canvas's props.
- New features, all in `allFeatures`: `a11yFeature`, `colorModeFeature`, `debugFeature`,
  `selectionRectFeature`, `smoothFeature`, `stackingFeature`, `zoomKeyFeature`. A prop for one a `FlowingerCore`
  lacks says so in development, as the others do.
- **`nodeOrigin` and `node.origin`.** Where on a node its `position` is: `[0, 0]` top-left (default),
  `[0.5, 0.5]` the centre. A child's `position` is relative to its parent's top-left, as in React Flow. Edges,
  hit testing, the minimap, `fitView`, extents, intersections and the resizer all use the drawn box.
- **`panActivationKeyCode`** — holding the key turns a drag into a pan — as `panKeyFeature` (in `allFeatures`,
  so `FlowingerCanvas` has it; a `FlowingerCore` is told in development that it does nothing without it). Off
  unless given: React Flow's own default of `'Space'` is not applied.
- **`nodeDragThreshold`**, in pixels; `0` is none. Needs `dragFeature`.
- **`ease`** on viewport moves (`setViewport`, `fitView`, `setCenter`, `zoomTo`…).
- **`MiniMap`: `nodeComponent`, `onNodeClick`, `zoomable`, `zoomStep`, `offsetScale`**; `MiniMapNode`.
- **`NodeResizeControl`**, one resize control (a handle or a line, on a side or a corner) with `children`;
  `NodeResizer` is eight of them. **`NodeResizer`'s `nodeId` and `autoScale`.**
- `SimpleBezierEdge` and `getSimpleBezierPath`, `EdgeText`, `EdgeToolbar`, `experimental_useOnNodesChangeMiddleware`
  and `experimental_useOnEdgesChangeMiddleware`, and `viewportInitialized` on the instance (a live getter).
- **The "pro" modules, free and separate entry points** — [`flowinger/history`](docs/pro.md#undo-and-redo--flowingerhistory)
  (`useUndoRedo`), `flowinger/clipboard` (`useClipboard`), `flowinger/snaplines` (`useSnapLines`,
  `SnapLinesOverlay`), `flowinger/export` (`exportCanvasToSvg`, `exportCanvasToPng`, `downloadFile`),
  `flowinger/smart-edges` (`SmartEdge`, `getSmartEdgePath`), `flowinger/shapes` (flowchart nodes) and
  `flowinger/tree` (`useCollapsibleTree`), or all of them from `flowinger/pro`. They add nothing to the core
  unless imported. See [the pro modules](docs/pro.md).
- `scripts/audit-react-flow.mjs` reports members *named* and *implemented* apart.

### Changed

- **`FlowingerCanvas`'s node position is a top-left corner everywhere.** `store.absolutePosition` (and
  `InternalNode.internals.positionAbsolute`) is the node's drawn top-left; with the default `nodeOrigin` this
  is what it always was.
- **Size budgets are 34 kB (whole canvas) and 19 kB (core)**, up from 27 / 17.5. Measured: 33.6 / 18.7. Each
  of the 39 props that were only names costs its own code, in the features that act on it; the core's share is
  the wheel, the click distances, the two stacking hooks and the lock.
- **Defaults that move, where React Flow's are followed:** a press on a handle is a connection only once the
  pointer has travelled 1 px; a drop snaps to a handle within 20 graph units; clicking two handles connects them;
  a selected node is raised by 1000; a box selection leaves a draggable rectangle round what it took; a node
  that takes keyboard focus out of view is panned to. Where flowinger's own behaviour was established it is
  kept when the prop is left out — Shift still adds to a selection, `zoomOnScroll` off is still no zoom, and
  animated moves stay `'linear'`.
- `ZIndexMode` is `'auto' | 'basic' | 'manual'`, as in React Flow (it was `'auto' | 'manual'`).
- `FitViewOptions` no longer repeats `ease` / `interpolate`, which it inherits from `SetViewportOptions`.

### Fixed

- **`MiniMap`'s new props were spread onto the `<svg>` as unknown attributes**, so React warned; `NodeToolbar`'s
  `nodeId` did the same on a `<div>`. `NodeResizer` ignored `nodeId`.
- **`useClipboard`** asked the browser for clipboard permission on every paste (it read `navigator.clipboard` on
  a keydown); it uses the `copy` / `cut` / `paste` events. A copied child is placed in the copy of its parent,
  and is not offset twice.
- **`exportCanvasToSvg`** exported the visible view at the wrong size at any zoom but 1. It exports the whole
  diagram.
- **`useSnapLines`** left guides on screen for alignments it had not snapped to, compared nodes of different
  parents as one space, and ignored `nodeOrigin`; **`SnapLinesOverlay`** drew in screen space, so its guides were
  wrong at any pan or zoom; and it only *drew* guides — `snapNodeChanges` applies the snap.
- **`useCollapsibleTree`** revealed what sat under a branch still collapsed when an ancestor was expanded.
- **`SmartEdge`** treated its own end nodes as obstacles (so every edge ran the router), did not leave a handle
  the way it faced, and recomputed on every drag frame.
- **Shape nodes** ignored the node's `width` / `height`, and `data.color` was declared and unread.

## [0.4.0] - 2026-10-10

### Added

- **`Panel`, `NodeToolbar`, `MiniMap`, `Handle` and `BaseEdge` take the attributes of their own element** —
  `id`, `title`, `role`, `aria-*`, `tabIndex`, `data-*`. Not its event handlers, which the canvas's own
  pointer and keyboard handling would lose to (a compile error, rather than a handler that quietly
  replaces a drag); a handle's `id` is still its handle id; on `BaseEdge` they land on the path. The
  engine's classes, positioning and handlers win over yours.
- **A controlled view: `viewport` and `onViewportChange`.** Given `viewport`, the canvas draws exactly it and
  moves nowhere on its own; a pan, a wheel zoom, a zoom button or `fitView` asks through
  `onViewportChange` where it would go, and the view changes when `viewport` does. An animated move is
  followed frame by frame by an owner that applies each, and cut short if the owner moves the view itself.
  Without `viewport`, `onViewportChange` reports each move after it is made. `defaultViewport` is ignored
  when `viewport` is given; in development, a `viewport` with no `onViewportChange` says it cannot move.
- **`sourcePosition` and `targetPosition` on a node, and React Flow's built-in node types behind them.** A
  node with no component of its own — no `type`, or one `nodeTypes` does not name — now has handles, as
  React Flow's `default`, `input` and `output` do: a target on `targetPosition` (default top), a source on
  `sourcePosition` (default bottom); `input` has only the source, `output` only the target, `group` none. A
  component of your own is handed both fields. Before, such a node had no handles at all and edges
  attached to it by direction. The handle sets are compared with React Flow's own rendering.
- **`nodeTypes.default` is used, as in React Flow.** A node with no `type`, or a `type` nobody registered,
  is drawn by the `default` you register — before, only the built-in view was ever used for them. `input`,
  `output` and `group` stay the built-ins unless registered. Compared with React Flow's own rendering.
- **React Flow's type names**, for the types flowinger already has: `OnNodesChange`, `OnEdgesChange`,
  `OnConnect`, `OnConnectStart`, `OnConnectEnd`, `OnInit`, `OnMove*`, `OnNodeDrag`, `OnDelete`,
  `OnBeforeDelete`, `OnSelectionChangeFunc`, `NodeMouseHandler`, `EdgeMouseHandler`, `IsValidConnection`,
  `ReactFlowProps`, `ReactFlowInstance`, `ReactFlowJsonObject`, `DefaultEdgeOptions`, `CoordinateExtent`,
  `SnapGrid`, `ControlProps`, `ConnectionLineComponent`, `BezierEdgeProps` and the other built-in edges'
  props, `GetBezierPathParams` and its two siblings, `HandleConnection`, `DeleteElementsOptions`,
  `FitBoundsOptions`, `OnResize` and the other resize callbacks, and a few more — 59 in all. Types only, so nothing
  reaches a bundle. `ReactFlowProps` and `ReactFlowInstance` are not generic, on purpose. Of React Flow's
  211 exports flowinger now has 158 (it had 99).
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

## [0.4.0-rc.1] - 2026-10-10

A release candidate, published to the `next` dist-tag. It carried what became `0.4.0`, above, and was the
first run of the release pipeline itself — npm trusted publishing and the provenance attestation — before the
real release.

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

[Unreleased]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.3.0...v0.4.0
[0.4.0-rc.1]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.3.0...v0.4.0-rc.1
[0.3.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Naveen-Boddepalli/flowinger/releases/tag/v0.1.0
