# Changelog

All notable changes to Flowinger. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org) — with the usual caveat that while the version
is `0.x`, a minor release may change the API; anything that does is listed under **Changed**.

The design notes behind each release — what was measured, what was tried and dropped — are in
[`plan.md`](plan.md).

## [Unreleased]

The bridge to 1.0: nothing an app can see changes, and in development a canvas now says where 1.0 will be
noticed. [Upgrading to 1.0](docs/upgrading.md) has the detail, and [what 1.0 promises](docs/stability.md) the
contract.

### Added

- **`reactFlowDefaults`** — React Flow's default for every canvas prop where Flowinger's differs, read from its
  source: `nodesDraggable`, `nodesConnectable`, `elementsSelectable` and `nodesFocusable` on, `minZoom` 0.5, a 1 px
  `nodeDragThreshold`, `paneClickDistance` 1 and `nodeClickDistance` 0, ⌘ (on a Mac) or Control for
  `multiSelectionKeyCode` and `zoomActivationKeyCode`, Space for `panActivationKeyCode`, and a 0.1 fit margin.
  `<FlowingerCanvas {...reactFlowDefaults}>` behaves like React Flow's canvas. From 1.0, `<ReactFlow>` applies
  them itself and `<FlowingerCanvas>` keeps Flowinger's.
- **In development, `<ReactFlow>` names the props it leaves out whose default 1.0 changes**, once a page, each with
  today's value and 1.0's — `nodesDraggable (false → true)` — and how to keep either: render `<FlowingerCanvas>`, or
  spread `reactFlowDefaults`. `<ReactFlow>` is therefore its own component now, rendering `<FlowingerCanvas>`.
- **In development, an edge drawn at a side guessed from its handle's name says so**, once a page: an edge naming
  a handle (`in`, `out`, `prev`, `next`, `top`…) that its node has no `<Handle>` of. 1.0 drops that rule, which
  React Flow does not have; the warning names the side 1.0 gives it and the `<Handle>` to add.
- **[What 1.0 promises](docs/stability.md)** and **[Upgrading to 1.0](docs/upgrading.md)**, in the docs and on the
  site.

### Changed

- **Writing a feature is experimental.** `Feature`, `EngineContext` and the types they are made of are tagged
  `@experimental`: they reach into the store, and may change in a minor release, with a line here. Using the
  built-in features is unaffected.
- The migration guide's table of defaults has the four it lacked: `nodesFocusable`, `nodeDragThreshold`,
  `paneClickDistance` and `nodeClickDistance`.

## [0.8.0] - 2026-10-15

### Changed

- **With `onlyRenderVisibleElements`, the first render is culled too.** The nodes and options reach the store in
  layout effects, after the first render, which therefore drew every node — to measure it, and then drop all but
  those in view. The culling feature now judges that render from the props: the nodes as declared, against the
  starting view and an assumed 1920 × 1080 pane, with selected nodes always drawn. At 10,000 nodes a culled
  mount went from about 570 ms to about 70 in a profile. A **server** renders the same set (so hydration matches),
  where it rendered every node: a culled page no longer sends all its nodes as HTML. In a test environment
  with no layout, everything is still drawn once the canvas has mounted. In the benchmark a culled mount is
  41 / 49 / 55 ms at 1,000 / 5,000 / 10,000 nodes, against React Flow's 83 / 302 / 594 —
  [the benchmarks](docs/benchmarks.md).
- **Size.** The core is 19.8 kB gzipped (was 19.7) and the whole canvas 35.9 (was 35.5), inside the 20 and
  36 kB budgets.

### Added

- `Feature.firstVisible` for features: the visible set for a render before the store has one, judged from the
  props. What `cullingFeature` uses for the first render.

## [0.7.0] - 2026-10-14

### Changed

- **With `onlyRenderVisibleElements`, a pan or zoom that stays inside the region last worked out costs nothing.**
  The visible set is worked out for the view and a quarter-view margin round it; while the view stays inside
  that region (and it is not more than three times the view after a zoom in), every node in view is already
  drawn, so nothing is looked at again. A node kept from that region may be drawn a little further out of view
  than before. At 10,000 nodes a pan costs 3.2 ms a frame (was 4.4) and a zoom 2.3 (was 5.0); React Flow 4.2
  and 4.5 in the same run — [the benchmarks](docs/benchmarks.md).
- **An edge label's halo is 6 px wide (was 4),** so the line no longer shows between two close stems — the
  "TT" in "HTTPS" at the default 12 px. Labels drawn with `labelShowBg` are unchanged.
- **A drag, a measurement or a selection now costs what changed, not the size of the graph.** A drag hands the
  canvas a list that is the last one with one node replaced, and everything that was worked out from the whole
  list — the store's maps and counts, the canvas's and the stacking feature's nesting, the dimension reports,
  and the culling pass — now starts from the answer it had and looks at what was replaced. With
  `onlyRenderVisibleElements` on, at 10,000 nodes a drag costs 4.3 ms a move (7.7 before; React Flow 4.5), and
  a mount 0.5 s. See [the benchmarks](docs/benchmarks.md).
- **Size.** The core is 19.7 kB gzipped (was 18.9) and the whole canvas 35.5 (was 33.9); the culling feature
  1.2 kB (was 0.5). The budgets are 20 and 36 kB (were 19 and 34).

### Added

- **A workflow-simulation example** ([`examples/stepper`](examples/stepper)): run, step and pause an order process
  with a decision and a failure path; each step's status and each edge's flow drawn from a pure `next(state)`.
- **A multiplayer example with Yjs** ([`examples/presence`](examples/presence)): a shared graph, and each
  person's cursor (in graph units) and selection through Yjs awareness, synced between tabs with no server.
- **A swimlanes example** ([`examples/swimlanes`](examples/swimlanes)): lanes as parent nodes, steps as their
  children, and moving a step to another lane by re-parenting it on drop, re-based so it stays put.
- **Guides** ([`docs/guides/`](docs/guides), and a section on the site): an org chart, laying out a DAG with
  dagre, a flowchart editor with undo, export to PNG/SVG, save and load as JSON, and a workflow builder in
  Next.js — each leads with what people search for and points at the example that does it.
- **An example that exports the diagram as an image** ([`examples/export`](examples/export)): PNG, JPEG, WebP
  or SVG at 1–3×, with the page's background, none or white, as the whole diagram or fitted to a 1200 × 630
  card; previewed, downloaded or copied to the clipboard, with `filter` leaving out a badge and the handles.
- **An example that saves and loads a graph as JSON** ([`examples/save-load`](examples/save-load)): `toObject()`
  kept in the browser across a reload, downloaded and opened as a file, or edited as text, with a check that
  says what is wrong with a file instead of handing the canvas something it cannot draw.
- **A documentation site** at https://naveen-boddepalli.github.io/flowinger/ (Astro Starlight, in
  [`site/`](site)): search, a sidebar, and a live editor on the home page that is rendered on the server. Its
  pages are generated from the repository's Markdown (`docs/`, the examples, the changelog, roadmap,
  contributing guide and design record), so each is written once. The demo moved to `/flowinger/demo/`; `llms.txt` stays at the root.
- **An example in Next.js** ([`examples/nextjs`](examples/nextjs)): a graph laid out and framed in a Server
  Component, then shown as a viewer and as an editor with undo. Built against the packed library in CI like the
  others. [Server rendering](docs/server-rendering.md) is rewritten around it: what the server draws, what
  waits for the client, and how to frame the first paint.
- `EngineContext.takeDirtyNodes()` for features: the nodes whose place, size, visibility or selection changed
  since it was last asked, or `null` for "any". What `cullingFeature` looks again at.

### Fixed

- **A canvas inside a `FlowingerProvider` was server-rendered at the origin**, not at its `defaultViewport` or
  controlled `viewport`: the canvas moved the provider's view there in an effect, and a server runs none. It
  now starts there on its first render, so the server's HTML is framed and hydration draws the same.
- **In an uncontrolled flow, selecting a node did not tell culling**, so a selected node outside the view was
  not drawn until the next change of anything else, and one that was let go of stayed drawn.

## [0.6.0] - 2026-10-13

### Added

- **`flowinger/editable-edge`** — `EditableEdge`, an edge with waypoints you can move: it runs through
  `data.points`, and once selected each waypoint is a handle to drag, the dot between each pair of ends is a
  place to add one, and a double click removes one. Written through `updateEdgeData`, so a controlled flow hears
  every move. `getEditableEdgePath` is the path as a function. See [the pro modules](docs/pro.md).
- **`HexagonNode`** in `flowinger/shapes` (`shapeNodeTypes.hexagon`).
- **A collapsible-tree example** ([`examples/tree`](examples/tree)): an org chart whose branches fold with
  `useCollapsibleTree`, laid out again around what is hidden. Built against the packed library in CI like the
  others.
- **[Benchmarks](docs/benchmarks.md)** against React Flow at 1,000, 5,000 and 10,000 nodes, with and without
  `onlyRenderVisibleElements`: mount, pan, zoom, drag, memory. `pnpm bench` re-runs it in a real browser and
  rewrites the table; `bench/results.json` has the numbers.

### Changed

- **Size.** The core is 18.9 kB gzipped (was 18.7) and the whole canvas 33.9 (was 33.7): the counters and
  fast paths that made culling scale. The budgets, 19 and 34, are unchanged.

### Fixed

- **`Controls` were unreadable in a light theme that set `--flowinger-surface` and `--flowinger-text` and
  nothing else**: the buttons fell back to a dark `--flowinger-surface-raised` under dark text. It now falls
  back to `--flowinger-surface`. (The `layouts` and `editor` examples had the bug in light mode; both now set
  it.)
- **`onlyRenderVisibleElements` cost more than it saved at scale.** With it on, 10,000 nodes mounted in 2.1 s,
  zoomed at 13.6 ms a frame and dragged at 10 ms a move (React Flow: 0.6 s, 4.8, 4.8). Work proportional to the
  whole graph was done where it should have been proportional to the view: registering a handle ran the culling
  pass and woke every `useStore` reader (forcing a layout each time a node unmounted); "is every node
  measured?" scanned every node after every handle (a quadratic mount); the selection was recomputed from every
  node and edge when none was selected; and the edge layer rebuilt a map of all nodes whenever the visible set
  moved. Now 0.5 s, 5.5 ms and 7.7 ms. Found by the benchmark above.
- **The rectangle round a box selection, a `NodeToolbar` for another node (`nodeId`), and the pan to a node
  that takes keyboard focus (`autoPanOnNodeFocus`) used a child's position *inside its parent* as if it were on
  the canvas.** With a group in the selection the rectangle's corner was wrong, and the toolbar and the pan went
  to the wrong place for a child. Found by watching them in a browser; the unit tests had no sub-flow.

## [0.5.0] - 2026-10-13

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

## [0.4.0] - 2026-10-11

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

[Unreleased]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.3.0...v0.4.0
[0.4.0-rc.1]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.3.0...v0.4.0-rc.1
[0.3.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Naveen-Boddepalli/flowinger/releases/tag/v0.1.0
