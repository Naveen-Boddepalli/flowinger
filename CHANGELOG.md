# Changelog

All notable changes to Flowinger. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org): from 1.0.0 a breaking change is a major version
([what that covers](docs/stability.md)). Before 1.0, while the version was `0.x`, a minor release could change the
API; each change that did is listed under **Changed**.

The design notes behind each release — what was measured, what was tried and dropped — are in
[`plan.md`](plan.md).

## [Unreleased]

## [1.2.1] - 2026-10-19

A patch for 1.2.0's cost on a large canvas, which the benchmarks found when they were run again for the launch.

### Fixed

- **1.2.0 made an unculled mount slower and heavier.** Connecting from the keyboard gave every node its own state,
  callback and handlers, whether or not it had a handle to connect: at 10,000 nodes without culling a mount went
  from 0.61 to 0.71 s and the JS heap from 173 to 198 MB (found by re-running the benchmarks for the launch). The
  handles' keyboard props and the node's focus handlers are now one set for the whole canvas, and a node's handles
  become tab stops by setting `tabIndex` on them, so no node redraws for it: 0.59 s and 173 MB again. Culled, and
  everything else, was unaffected.

## [1.2.0] - 2026-10-19

**Connecting from the keyboard.** Two nodes can now be connected without a pointer, and a screen reader is told
each step — checked in three browsers by the suite and with VoiceOver on macOS. Nothing breaks; the Tab sequence
through a node with connectable handles changes (below).

### Added

- **Connecting from the keyboard.** With `nodesConnectable`, a connectable handle is a button: Enter or Space on
  one begins a connection, on another ends it (to `onConnect`, as a dragged or clicked one), and Escape — on a
  handle or anywhere in the canvas — or the same handle again lets go. A node's handles are tab stops while focus
  is inside the node, so Tab goes node by node and from a node into its handles. A handle is named "source handle
  out" (or `handle.ariaLabel`) and reads a hint; each step is said in the live region (with `a11yFeature`), the
  nodes named by their `ariaLabel`, else `data.label`, else their text. It works with `connectOnClick` off — a
  keyboard cannot drag — and does not call `onClickConnectStart` / `onClickConnectEnd`, which are given mouse
  events. `disableKeyboardA11y` turns it off. React Flow has no way to do this.
- **`ariaLabelConfig` keys for it**, flowinger's own: `handle.a11yDescription.default` and
  `connection.ariaLiveMessage.start`, `.connected`, `.invalid` and `.cancelled`.
- **For a feature (experimental):** `NodeBits.handleProps`, props a feature adds to each connectable handle.

### Changed

- **Tab from a focused node with connectable handles goes into its handles** before the next node. Likely to be
  noticed by a test that counts Tab presses.
- **The whole canvas's size budget is 40 kB (was 39).** Connecting from the keyboard takes it from 38.10 to 38.98
  kB gzipped. The core grows by 0.04 kB (21.30, budget 21.5): only what lets a feature add props to a handle.

### Fixed

- **Escape lets go of a connection begun by a click** (`connectOnClick`), and the click and its end are said in
  the live region. 1.1's documentation said Escape did this; nothing did.

## [1.1.0] - 2026-10-17

**The bridge to 2.0**, which follows React Flow 13. Everything React Flow 13.0.0-next.0 adds is here, without breaking
anything — its store hooks, its changesets, `forceColorMode`, `changeParent`, margins with units — so code written for
React Flow 13 runs on 1.1. What 2.0 will change is said in development, once a page each, and in
[Upgrading to 2.0](docs/upgrading.md). And React Flow 12.11.6 has 210 exports, not 211.

### Changed

- **`<ReactFlow>`'s fit margin is written with a unit**: `'4.545454545454546%'` a side, which is the same view to the
  pixel as React Flow 12's `padding: 0.1`, so a number in a margin is always someone's own (see the warnings
  below). `fitViewOptions` is now only what the caller gives; the margin of a fit that names none comes from the
  same place for `fitView`, `fitViewOptions` without a `padding`, the instance and `Controls`.
- **A fit's margin is React Flow's to the pixel.** `fitView`, `fitBounds`, `fitViewOptions` and `Controls`' fit
  button work the margin out as React Flow does: in whole pixels a side, with the view moved where the fit leaves
  less than that on one side. Before, a number was turned into a zoom without rounding, so a `padding: 0.1` fit
  could sit a fraction of a pixel from React Flow's. Flowinger's own margin, 40 px when none is given, is
  unchanged.
- **The core's size budget is 21.5 kB (was 20).** The core goes from 19.91 to 21.25 kB gzipped: React Flow's
  way of working out a fit's margin (0.34 kB), since a fit is part of the core, and changesets (0.94: the class,
  and `applyNodeChanges` and `applyEdgeChanges`, which `applyTo` needs), since every canvas that reports changes
  reports them as a changeset. 2.0 takes back 0.45 by moving the edge paths other than bezier into a feature
  ([the 2.0 plan](PLAN-2.0.md), D3). The whole canvas's budget is 39 kB (was 38): it is 38.04.
- **`onNodesChange` and `onEdgesChange` are given a `NodeChangeset` / `EdgeChangeset`** (below): still an array of
  the same changes, so a handler that treats it as one is unaffected. A test that compares it with
  `toStrictEqual` sees a different class. An `add` change the canvas makes now carries the item's `id`.

### Added

- **Margins with units and per side**, as React Flow writes them: `fitViewOptions={{ padding: '5%' }}`,
  `fitView({ padding: '20px' })`, `{ top: '10px', x: '5%' }`, in every fit and in `getViewportForBounds` and
  `viewportForBounds`. They mean the same in React Flow 12 and 13, and in flowinger 1.x and 2.0, which reads a
  bare number as pixels where 1.x reads it as a ratio. Checked against React Flow's own `getViewportForBounds`.
  `Padding` and `PaddingWithUnit` are exported.
- **React Flow 13's store hooks**, read from flowinger's one store, so code written for React Flow 13 runs here:
  `useOptionsStore` (what `useStore` reads), `useViewportStore` (with `paneDragging`), `useNodesStore` (with
  `nodeLookup` and `parentLookup`), `useEdgesStore` (with `edgeLookup`, and `connectionLookup` keyed as React
  Flow keys it — checked against React Flow's own), `useConnectionStore` (with `connectionClickStartHandle`),
  `useSelectionStore` (`userSelectionRect`, with `boxSelectFeature`), `useReactFlowStoreApi`, and `useNode`,
  `useEdge`, `useInternalNodes` and `useShallow`. Read only, like `useStoreApi`. Their types are exported, and
  `HandleBounds`. `useStore` and `useStoreApi` stay as they are.
- **`NodeChangeset` and `EdgeChangeset`**, React Flow 13's changesets, as arrays: what `onNodesChange` and
  `onEdgesChange` are given, so a handler written for React Flow 13 — `setNodes((ns) => changes.applyTo(ns))` —
  works, and one written for 12 does too. `applyTo`, `add`, `remove`, `getByType`, `getForNode` / `getForEdge`,
  `removeForNode` / `removeForEdge`, `toArray`, `size` and `version`. And React Flow 13's names for the kinds of
  change: `PositionChange`, `DimensionChange`, `SelectionChange`, `RemoveChange`, `AddChange`, `ReplaceChange`.
- **`forceColorMode`**, React Flow 13's name for `colorMode`: the same values and classes, and it wins where both
  are given (`colorModeFeature`).
- **`changeParent(nodeId, parentId)`** on the instance, as in React Flow 13: moves a node into another, or out of
  any (`null`), where it is on the canvas — its `position` made relative to the new parent — reported as a
  `replace` (`editingFeature`).
- **What 2.0 changes, said in development**, once a page each, as the stability page promises of the release before
  a major one ([Upgrading to 2.0](docs/upgrading.md)): a fit given a bare number as its margin (pixels in 2.0); a
  `<ReactFlow>` that fits itself with the margin it has by default (`'5%'` a side in 2.0); a `<FlowingerCore>`
  drawing a `straight`, `smoothstep` or `step` edge without `edgePathsFeature`; and flowinger loaded through
  `require` under Jest (2.0 ships ES modules only). Nothing in a production build.
- **`reactFlow12Defaults`**: `reactFlowDefaults` with React Flow 12's margin written with a unit
  (`'4.545454545454546%'` a side, the same view to the pixel as `padding: 0.1`), to spread where 2.0's `<ReactFlow>`
  should keep 1.x's margin.
- **`edgePathsFeature`**, which does nothing yet: in 2.0 the edge paths other than bezier come with it. Name it on a
  `<FlowingerCore>` now and nothing changes when they move. `<FlowingerCanvas>` and `<ReactFlow>` have it.
- With these, flowinger names all 220 exports of React Flow 13.0.0-next.0, and all 303 members the audit counts
  do something; it still names all 210 of React Flow 12.11.6's.

### Deprecated

- **`CounterNode`**, a type React Flow does not export: it is the example in a doc comment of React Flow's `Node`
  type, and the coverage audit read names in comments as exports. It goes in 2.0; write your own node type.

### Fixed

- **React Flow 12.11.6 has 210 exports, not 211**, and flowinger names all of them. The coverage audit now skips
  comments; the README, the coverage page and the migration guide say 210.

### Added

- **A weekly job against React Flow's next major** (`@xyflow/react@next`): the unit tests that take React Flow as
  their oracle, and the coverage audit with `--strict`, which fails on a name flowinger lacks or ignores. A failure
  there is news about React Flow 13, for [the 2.0 plan](PLAN-2.0.md); CI stays on 12.11.6.

## [1.0.1] - 2026-10-17

What a real phone and VoiceOver found, the first time either was tried: handles too small for a finger, and three
things a screen reader user could not do. Each was checked again on the device after the fix.

### Changed

- **The whole canvas's size budget is 38 kB (was 37).** The fixes below take it from 36.36 to 37.01 kB gzipped —
  the reach for a finger near a handle 0.45, the screen-reader fixes 0.2 — over the old budget. The core is
  19.91 kB (budget 20): the fixes are in features, not in it.

### Fixed

- **A finger near a handle is on it.** Fitted to a phone, a 10 px handle is drawn at about 5, and a fingertip
  mostly missed it (found on a real phone: one try in three or four). A touch within 20 screen pixels of a
  connectable handle now starts a connection from it, or, as a tap, clicks it (`connectOnClick`), and a line a
  finger drags drops on a handle that near. On the handle's own node the reach stops halfway to the node's
  centre, so the middle of even a small node still drags it; a press on a button or a `nodrag` element inside a
  node stays that element's. A mouse or a pen still has to hit the handle.
- **Each keyboard move is announced, with where the node is now.** Safari with VoiceOver announced only the first
  move: the live region's text was changed in place, which it reads only once, so each announcement is now an
  element of its own. The message also said where the node *was* (copied from React Flow) under "New
  position"; it now says where the node is, once the move is made.
- **Escape lets go of a focused node or edge**, as React Flow's does. It acted only while the canvas itself had
  focus, so the hint every node reads out — "escape to cancel" — did nothing. Escape on the canvas still clears
  the whole selection (with `keyboardNavigation`).
- **A canvas that takes keys is `role="application"`**, as React Flow's always is, so a screen reader hands it the
  arrow keys: with VoiceOver's Quick Nav on, they moved through the page instead of moving the node. That is a
  canvas with `keyboardNavigation`, or with selectable or focusable nodes — so every `<ReactFlow>`. It was a
  `group` with `keyboardNavigation`, and had no role otherwise; one with nothing to operate still has none. Likely
  to be noticed by a test that looks the canvas up by its role.
- **A connection gives way to a pinch.** A second finger while a line is being dragged drops the line, as it
  ends a node's drag, and the line follows only the finger that began it.

### Added

- **[Accessibility](https://naveen-boddepalli.github.io/flowinger/docs/accessibility/)**, a page: what a keyboard
  and a screen reader can do with a canvas, how to turn it on, what was checked with VoiceOver, and what is not
  done yet.

## [1.0.0] - 2026-10-17

**The first stable release.** From here Flowinger follows semantic versioning: what
[What 1.0 promises](https://naveen-boddepalli.github.io/flowinger/docs/stability/) covers changes only in a major
version. Two breaking changes from 0.9, both described in
[Upgrading to 1.0](https://naveen-boddepalli.github.io/flowinger/docs/upgrading/). The library is the same as
`1.0.0-rc.1`; since then only the docs changed, to describe 1.0.

### Changed

- **Breaking: `<ReactFlow>` has React Flow's defaults.** It applies `reactFlowDefaults` under the props it is given
  (a prop given as `undefined` takes the default, and a `fitViewOptions` is merged over React Flow's margin), and
  three that are not props: a fit that names no margin uses 0.1 of the view (the instance's `fitView` and
  `fitBounds`, and `Controls`' button), an animated move that names no path takes `'smooth'`, and `Controls` shows
  its lock. So moving from React Flow is changing an import. `<FlowingerCanvas>` and `<FlowingerCore>` keep
  flowinger's defaults. To keep what a `<ReactFlow>` did before, render `<FlowingerCanvas>`, which takes the same
  props — [Upgrading to 1.0](docs/upgrading.md). The 0.9 warning that said this was coming is gone.
- **Breaking: an edge that names a handle the node does not have meets the side it runs towards.** A few names
  chose a side before — `in` / `top`, `out` / `bottom`, `prev` / `left`, `next` / `right` — a rule from before
  handles were measured, which React Flow does not have. A `<Handle>` of that id, or an entry in the node's
  `handles`, decides the side as before. Before a node mounts (on a server, and in the first paint) an edge to a
  handle it has not registered yet meets the fallback side unless the node lists it in `handles`. The 0.9 warning
  goes, and with it the store's `hasNodeElement`.

### Fixed

- **A two-finger pinch that starts on a node zooms.** The canvas counted fingers only once a press reached the
  bare pane, and a node takes its own presses, so on a phone — where nodes fill the screen — a pinch on top of
  them did nothing. Fingers are now counted on the way down, wherever they land; a second finger turns the first
  one's drag into the pinch (the node stays where it was), and a finger is forgotten wherever it lifts.

### Added

- **Touch in the browser suite**: a tap selects, a finger drags a node or pans, two fingers zoom in and out about
  the point between them — and on top of a node — sent as real touch through Chromium's DevTools protocol.

## [1.0.0-rc.1] - 2026-10-15

A release candidate, published to the `next` dist-tag. It carried what became `1.0.0`, above.

## [0.9.1] - 2026-10-15

**The first published release of [0.9.0](#090---2026-10-15)'s changes** — the bridge to 1.0: `reactFlowDefaults`,
development warnings where 1.0 will be noticed, and [what 1.0 promises](docs/stability.md) and
[how to upgrade](docs/upgrading.md). 0.9.0 was tagged but its release stopped at the size check before it reached
npm. Nothing in the library changed since; what follows is why it stopped, and the browser suite.

### Changed

- **The whole canvas's size budget is 37 kB (was 36).** 0.9.0 measured 35.97 kB — inside 36 by 26 bytes on one
  machine, and over it on CI's Linux runner, where the same build gzips a little larger; that stopped its release
  before it published. The growth is 0.8.0's culled first render (a culled mount ten times faster). The core's
  budget stays 20 kB.

### Added

- **The browser suite runs in Firefox and WebKit as well as Chromium**, in `pnpm e2e` and in CI. Neither found a
  bug in the library. On a Mac the 29 tests passed in both on their first run, and run five times in all three
  browsers (435 tests) none failed or was flaky. On CI's Linux runner, WebKit found two tests that had assumed the
  browser draws often: there it drew one or two frames in 600 ms. So a box held at the pane's edge had panned
  13.5 px where the test wanted 100, and a 500 ms `'smooth'` move was over before a frame of it was seen. The first
  test now waits until the view has moved; the second steps the move a frame at a time on a paused clock
  (Playwright's `page.clock`). A third test, the lock's, dragged a node to within 40 px of the pane's bottom edge,
  where auto-pan moves the view by as much as the drag is slow; on a busy machine it failed 9 runs in 20. It now
  drags away from the edge. Two differences are covered outside the suite: Playwright's wheel arrives in pixels
  in every browser, so Firefox's wheel in lines (`deltaMode` 1) is tested in jsdom; and Firefox gives the mouse
  pointer id 0 where the others give 1, which is safe because the library only ever compares pointer ids.

## [0.9.0] - 2026-10-15

Tagged, but never published: its release stopped at the size check (see 0.9.1, which published these changes).

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
- **Size.** The core is 19.85 kB gzipped (was 19.83) and the whole canvas 35.97 (was 35.94): `<ReactFlow>` as its
  own component, and the store's `hasNodeElement`. The warnings themselves are development-only and not in a
  production build. Both are inside the 20 and 36 kB budgets, the whole canvas by 0.03 kB.

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

[Unreleased]: https://github.com/Naveen-Boddepalli/flowinger/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/Naveen-Boddepalli/flowinger/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/Naveen-Boddepalli/flowinger/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.9.1...v1.0.0
[1.0.0-rc.1]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.9.1...v1.0.0-rc.1
[0.9.1]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.8.0...v0.9.1
[0.9.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.3.0...v0.4.0
[0.4.0-rc.1]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.3.0...v0.4.0-rc.1
[0.3.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Naveen-Boddepalli/flowinger/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Naveen-Boddepalli/flowinger/releases/tag/v0.1.0
