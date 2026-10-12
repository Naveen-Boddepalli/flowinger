# Flowinger: Independent React Flow Replacement

## 0. Status

*Updated September 2026.* The engine is in `src/`; tests are in `src/__tests__/` — `flowinger.test.tsx`
(components: pan, wheel zoom, pinch, keyboard, drag, `fitView`, handles, arrowheads and labels, custom
edges, selection, connecting, the minimap, `translateExtent`, and the render-loop regression),
`flowingerStore.test.ts` (the pure store), `pointer.test.ts` (pinch maths), `ssr.test.tsx` (a server render
in vitest's `node` environment, where there really is no `document`) and `hydration.test.tsx`.
`pnpm typecheck`, `pnpm test` (867 tests, in 39 files, plus 8 in a real browser) and `pnpm build` pass on React 19 **and** React 18, and the
installed tarball renders, hydrates and type-checks (TypeScript 7, `skipLibCheck` off) on both.

Flowinger is its own repository. Its first consumer, QueryLens, will import it as a dependency once
flowinger is complete — the way QueryLens imports React Flow today — rather than carrying a copy (§5).
Before this repo was split out, the same engine source ran QueryLens's three tree panels in a real
browser (framing, zoom buttons, mouse pan, wheel zoom). The demo in `demo/` has since been run in a real
browser too, with real input: measured handle anchors (an edge starts at a node's *measured* half-width,
not a declared one), arrowheads and the label halo, a node drag (edge, arrowheads and label all follow;
the viewport does not pan), arrow keys, `0` to fit, wheel zoom about the cursor, and a background pan,
with the browser's own focus ring showing on the focused canvas. Not seen by eye: the *smoothness* of
animated moves — the pane that ran it fires `requestAnimationFrame` about once per 300 ms, so the tween
could only be shown to *land* (its backstop timer did), and smoothness rests on the fake-timer tests —
and multi-touch pinch, which needs a touch device (the maths and the pointer handling are unit-tested).

| Phase | State |
|---|---|
| 1. Core engine & data model | Done. |
| 2. Pan & zoom | Done. Left *or* middle drag pans (no spacebar-drag); wheel zooms about the cursor; ctrl+wheel (trackpad pinch) zooms faster. |
| 3. Node dragging | Done. Off by default (`nodesDraggable`); `node.draggable` overrides it either way. |
| 4. Edges & ports | Done. Each `<Handle>` registers its side, type and element with the store; the node wrapper measures where each is actually drawn, so a handle moved with `style` still gets its edge. An edge names a handle by `id` (and its end fixes the type), or names none and gets the first of that type — as React Flow does. Resolution order: registered handle at its measured anchor → same handle at its side's midpoint (unmeasurable, e.g. jsdom) → the legacy id table (`in`/`out`/`prev`/`next`/`top`/`bottom`/`left`/`right`) → the edge's direction. |
| 5. Integration | Happens in QueryLens, as a dependency swap — see §5. Not started in this repo. |

### Where the build deliberately departs from §2

- **State is an external store, not React Context + `useState` (§2A).** The first cut followed the plan
  and put the viewport in `useState` behind a context value rebuilt every render. A framing effect keyed
  on the pan/zoom instance then re-ran on every render, called `setViewport`, and re-rendered — about
  8,000 renders a second on a page showing a tree, invisible to jsdom because a pane measured at 0×0
  never frames. `src/store.ts` fixes it structurally: the instance is created once and never replaced,
  the viewport transform is written straight to the DOM, and components subscribe
  (`useSyncExternalStore`) to only the slice they draw — a node to its own position, the edge layer to
  geometry, `<Background>` to the viewport.
- **Animated moves are our own rAF tween, not a CSS transition.** So the background pattern,
  `getViewport()` and a zoom button pressed mid-move all see the value the pixels do. A hidden tab (no
  rAF) snaps; a timer lands the move if frames stop mid-tween.
- **A press only becomes a drag past 3px**, and pointer capture is taken only then — capture retargets
  the eventual `click`, which would break buttons inside nodes.
- **`nodes` is never mutated.** A dragged position is stored with the prop position it started from; a
  fresh layout from the parent (different prop position) wins, a re-render with the same positions
  keeps the drag.
- **The default node view and `<Controls>` are styled inline from `--flowinger-*` CSS variables**
  (`--flowinger-surface`, `--flowinger-surface-raised`, `--flowinger-border`, `--flowinger-text`,
  `--flowinger-text-dim`, `--flowinger-edge`, `--flowinger-radius`), each with a fallback — so they need no stylesheet and
  no utility framework, and theme from any ancestor. There is no `:hover` style (inline styles cannot
  express it) and no `outline` rule, so the browser's own focus ring stays.
- **Keyboard navigation is opt-in (`keyboardNavigation`)** because it adds a tab stop, which changes
  a consumer's tab order; a page that already has a toolbar does not want a second stop per diagram.
  When on, the canvas is a focusable `role="group"` (name it with `ariaLabel`); arrows pan (Shift ×4),
  `+`/`-` zoom, `0` fits. It acts only when the canvas itself has focus, so a key pressed inside a node
  is the node's, and it ignores Ctrl/⌘/Alt chords so browser zoom still works. Two-finger pinch is always
  on (`zoomOnPinch`), since it changes nothing else.
- **Pan limits are `translateExtent`**, with d3-zoom's constraint rule (§4.3): the visible region stays
  inside `[[minX, minY], [maxX, maxY]]` however it is panned, zoomed, keyed or animated, and an extent
  smaller than the pane is centred rather than pinned to a corner. It needs the pane's size, so it is a
  no-op until the canvas has been laid out; it is not re-applied on resize.
- **Arrowheads and labels are SVG.** `markerStart`/`markerEnd` (`'arrow'`, `'arrowclosed'`, or an
  `{ type, color, width, height }`) become `<marker>` definitions, shared between edges that ask for the
  same one, sized in graph units (`userSpaceOnUse`) so they do not fatten with the stroke, and coloured
  from the edge's own stroke unless told otherwise. `label` is SVG text at the path's midpoint with a
  surface-coloured halo (`paint-order: stroke`) for legibility — no text measuring, hence no background
  box, and string labels only. Edges without an explicit stroke default from `--flowinger-edge`.
- **Server rendering works (React 18 and 19).** Every `useSyncExternalStore` has a server snapshot (the
  hook that reads state outside React throws without one), layout effects fall back to `useEffect` where
  there is no DOM (React 18 warns otherwise), and the initial viewport is written into the markup so the
  first paint is already framed. Verified against the *installed tarball*: a server render with no DOM,
  then a client render and a hydration of that server HTML, under React 19.3 and 18.3 — no warnings.
  jsdom tests alone could not have found this; they only ever render on a client.
- **Custom edges are components, like custom nodes.** `edgeTypes` maps `edge.type` to a component that
  receives `EdgeProps` — both attach points, both directions, `data`, `label`, and `url(#…)` marker
  references — and is wrapped in the same `<g class="react-flow__edge">` as a built-in edge. `BaseEdge`
  is the default drawing, exported so a custom edge can start from it. A registered key wins over a
  built-in name; an unregistered type falls back to a bezier. Memoised on the edge object and its
  coordinates, so a drag elsewhere does not re-render it.
- **Selection is opt-in and uncontrolled.** `elementsSelectable` (default off, like `nodesDraggable`).
  The engine holds the set; `onSelectionChange({ nodes })` reports it, and each node re-renders only when
  its own state flips. Two details that are easy to get wrong: pointer capture sends the click that ends a
  pan to the canvas, which would deselect everything after every pan, so that one click is swallowed; and
  a click on a control *inside* a node selects nothing. Selectable nodes are focusable (Enter/Space
  selects, Shift adds) so selection is not mouse-only, and expose state as `aria-current` — a global
  attribute, valid on a plain `div`, where `aria-selected`/`aria-pressed` are not.
- **Connecting is a `window`-level gesture that reports, never edits.** A handle takes the press (and
  stops it reaching the node and canvas, or a connection would also drag or pan); the store then follows
  `pointermove`/`pointerup` on `window` so it survives leaving the node, and resolves the drop with
  `elementFromPoint`, counting only handles that say `data-connectable`. A drag from either end gives one
  `source → target` `Connection`; `isValidConnection` can veto it and also decides whether the line
  snaps. `edges` is the caller's prop, so `onConnect` hands the connection back rather than adding it.
  Escape, `pointercancel` and unmounting all cancel cleanly.
- **The minimap is an SVG of the same geometry the edges use.** It draws from the store (positions,
  measured sizes, the node list, the pane's size), so it needed the store to announce two things it
  previously did not: a new layout from the parent, and a resized pane (both now bump the geometry
  version, which the edge layer also benefits from). It always includes the visible region as well as the
  nodes, so panning far away zooms it out. Because that makes its own box move whenever the view does,
  a drag *freezes* the box — otherwise the map rescales under the pointer and the drag swims — and it
  refits on release. It is a pointer shortcut (announced as an image); the keyboard paths are the
  canvas's arrows and `Controls`.
- **Edges attach at a handle's outer edge, and node sizes are fractional.** Both found by trial-swapping
  flowinger into QueryLens and diffing the rendered geometry against React Flow's: React Flow ends an
  edge at the *outer* edge of the handle's dot (about 3 units past the node's border for a 6px handle);
  the first cut ended it at the dot's centre. And `offsetWidth` rounds to whole pixels, which put every
  edge up to half a unit off a node's true middle *and* skewed the zoom scale used to place handles;
  the computed width is the used value, fractions included (`src/measure.ts`).
- **`react-flow__*` class names are kept** on the engine's elements, and the viewport's
  `translate(Xpx, Ypx) scale(Z)` string is a contract too: stylesheets, browser tests and code migrating
  from React Flow select on them.

### Second round: what React Flow had that flowinger lacked

Added after the trial swap, in checkpoints (one commit each), every new guard mutation-tested — break it,
confirm a test fails, restore:

1. **Controlled flows** — `onNodesChange` / `onEdgesChange`, `applyNodeChanges`, `useNodesState`, `addEdge`,
   `defaultNodes`, `node.selected`, `dimensions` reporting (and `measured`), `useNodesInitialized`, group drag,
   `dragHandle`. A flow is controlled when someone listens; without a listener nothing changes.
2. **The instance** — `zoomTo`, `setCenter`, `fitBounds`, `fitView` options, `screenToFlowPosition`, node/edge
   getters and mutators, intersection helpers, promise-returning view calls; `nodeExtent`, `snapToGrid`,
   `defaultEdgeOptions`, `hidden`, the `fitView` prop, a wider `useStore`.
3. **Edges and keys** — edge selection, `animated`, delete (`deleteKeyCode`, `deleteElements`,
   `onBeforeDelete`), `connectionMode`, `onConnectStart`/`onConnectEnd`, arrow-key nudging.
4. **Selection box, `panOnScroll`, `Panel`.**
5. **`EdgeLabelRenderer`, `NodeToolbar`, `NodeResizer`**, and a declared `width`/`height` is now applied.
6. **Sub-flows** (`parentId`, `extent: 'parent'`) and `onlyRenderVisibleElements`.

What testing in a real browser found that jsdom could not: (1) **a quick drag lost the node** — pointer
capture is deliberately deferred until the drag threshold (capturing at once would send the click of
anything *inside* a node to the node), but the first `pointermove` could land on the pane or the node
underneath, whose events never reached the dragged node; a window listener now captures on the move that
crosses the threshold, wherever it lands; (2) **an HTML edge label under a node could not be clicked** — the
label layer now sits above the nodes. Both have tests. Two smaller ones came from the tests themselves: a
stray pointer left in the canvas after a resize (the next touch looked like half a pinch), and a `fitView`
prop that framed against the *previous* node list.

Re-verified against QueryLens: the trial branch now pins `0c74b6a` (the first round of these) — typecheck
clean, lint clean, **1170** unit tests, **79 / 79** e2e (installed Chrome). It costs: QueryLens's `flow` chunk
went 14.0 → 21.7 kB gzip and its total 373.9 → 380.7 kB, because the canvas and its store carry every feature
whether or not a consumer uses it (only separate exports — hooks, `NodeResizer`, `Panel` — tree-shake away).
`pnpm size` reports what a minimal consumer pays, and CI holds it to a budget.

A third batch, each in its own module where it could be so that unused ones cost a small consumer nothing:
`useKeyPress`, `useOnSelectionChange`, `useNodesData`, `useNodeConnections`, `useNodes`, `useEdges`,
`ViewportPortal`, `zoomOnDoubleClick`, `connectionLineType` / `connectionLineStyle` / `connectionLineComponent`,
a `step` edge type, and `smoothstep` that is actually smooth (its `borderRadius` was ignored).

What driving this round in a real browser found: an edge running into a group's child was **unclickable inside
the group** — every edge sat in one SVG below every node, so the group covered it. Edges are now stacked with the
nodes they join (the higher of the two), one `<svg>` per level; with no nesting it is still one layer at z 0, so
QueryLens's markup is unchanged (a test holds that). Also confirmed there, with real input: a child dragged past
its parent's edge grows it while everything else stays put; auto-pan with the pointer held at the edge, and it
stops on release; double-click zoom about the pointer; selecting an edge and dragging its end to another handle.

Re-run against QueryLens with this build's tarball (nothing committed): typecheck and lint clean, **1170** unit,
**79 / 79** e2e. Its `flow` chunk is **24.0 kB** gzip (14.0 with the first pin, 21.7 with the second) against the
25 kB budget the trial branch now carries, so there is about 1 kB left; `pnpm size` here reads 21.0 kB for the
same imports, with a CI budget of 22.

A fifth, **`onReconnect`**: the rings on a selected edge's ends are HTML in the layer above the nodes (in the
edges' own SVG a node would cover half of each), and the drag is the connection gesture run from the end that
stays, so it snaps, is vetoed and is cancelled exactly as a new connection is; `reconnectEdge` applies it.

A fourth: **auto-pan** (`autoPanOnNodeDrag`, `autoPanOnConnect`, `autoPanSpeed`) and **`expandParent`**. Auto-pan
needed the node drag measured in *graph* space (the pointer's graph position now, less its graph position
at the press) rather than in screen deltas, or a node would drift from under the pointer as the view pans; that
also fixes a node's drag when the view moves for any other reason mid-drag. `expandParent` is a pure module
(`src/expand.ts`): the parent's box only grows, and growing past its top or left moves its corner, so its
other children are re-based to stay put on the canvas.

### Third round: a modular core

The problem was the size trend. QueryLens's `flow` chunk went 14.0 → 21.7 → 24.0 kB gzip as features were added,
because a canvas and its store carried every feature whether a consumer used it or not — and QueryLens uses none of
drag, connect, selection boxes, delete or the edit API; it hands a static viewer `nodes` and `edges`.

- **Features.** `FlowingerCore` is the canvas with only the `features` it is given. `FlowingerCanvas` (alias
  `ReactFlow`) is `FlowingerCore` with `allFeatures`, plus the own-state behind `defaultNodes` / `defaultEdges`
  (moved out of the core so `changes.ts` is not in a lean bundle). The public API is otherwise unchanged.
- **A feature has two halves** (`src/features.ts`). `install(ctx)` is the engine half: an `EngineContext` — getters
  over the store's *current* state, `on('change' | 'detach')`, `changed()`, `api(other)` — and it returns the
  methods it adds. The React half is six slots: `useCanvas` (pane gestures, keys, the pane click, container style), `useNode`
  (a node's pointer, click and key handlers, `dragging`, `focusable`, `startConnection`), `useEdge` (an edge's
  click and keys), `Layer`, `EdgesLayer` (in the topmost edge layer) and `EdgeAdornment` (with a selected edge). Hooks run in the order the features were given, so the list is
  read once. `needs` installs dependencies first; a feature is known by its name.
- **What moved out:** `drag` (with `expandParent` and the arrow keys), `autoPan` (needed by drag and connect),
  `connect` (with the connection line), `reconnect` (with the grips), `boxSelect` (with the box), `delete` (with the
  key), `culling`, `editing` (the instance's mutators) and `resize` (installed by `NodeResizer` itself). **What
  stayed:** sub-flows, the viewport, handles and measurement, and edges — and, at first, selection ("small, and
  slicing it needs node, edge and pane slots for about 0.7 kB"). It moved afterwards; see the end of this section.
- **Instance methods a feature supplies are stable delegators**, present from the start: `const { setNodes } =
  useReactFlow()` taken before the canvas renders (the ordinary React Flow pattern) still works, and without the
  feature it throws and names it.
- **A dev warning** (`src/devWarnings.ts`, behind `process.env.NODE_ENV`, so a production bundle drops it) says
  when a prop's feature is missing. Writing it turned up a real flaw — it judged `defaultEdges` only when `nodes`
  was also absent — found by a test written for it.
- **What mattered most in measuring:** `dist/index.js` is *one pre-bundled file*, so a consumer's bundler can only
  drop what nothing at the top level keeps alive. Top-level `memo()` / `createContext()` calls are now marked
  `/*#__PURE__*/`; without that, `MiniMap` and `Controls` stayed in a lean bundle although never imported (+1.2 kB),
  and a measurement taken from `src` (a real module graph) would not have shown it. `scripts/size-dist.mjs` and
  `src/__tests__/bundle.test.ts` build the library and bundle small consumers from the *built* output; the test
  fails if a feature, an unused component, `changes.ts` or the warning table leaks in (checked by breaking each).
  It only matches text that survives minification — a function's name is mangled and would prove nothing.
- **Numbers** (gzip, a consumer importing `Background`, `Handle`, `Position`, the canvas, its provider,
  `useReactFlow`, `useStore`): the whole canvas **22.8 kB** (21.0 before — the plumbing costs 1.8); the core with no
  features **15.2 kB** from `dist` (15.4 from `src`). CI holds them to 24 and 16, and the core from `dist` to 16.
- **Verified:** 599 tests (53 new: resolving, the store's `use` / `api` / hooks, delegators, the lean canvas, one
  feature at a time, a feature of one's own, a server render of the lean canvas, and the bundle contents);
  **mutation testing of the seams** — about 70 mutants across the store plumbing, the canvas and node wiring, the
  edges, the owning wrapper and the warnings, with every survivor killed by a new test or shown equivalent
  (some of those gaps predate this round: a controlled selection reaching culling, and the wrapper owning *edges*); React 18.3.1; the packed tarball on TypeScript 7 (bundler and nodenext, `skipLibCheck` off,
  `exactOptionalPropertyTypes`) with a custom `Feature`, and three negative controls that must fail; and a real
  browser. There: the whole canvas (drag, selection, the node toolbar, a new connection, and a reconnect of *each*
  end) and the core with nothing, then with only `drag`, then with only `reconnect` (whose `needs` made every
  handle connectable). In the core, a press on a node pans instead of dragging it, a click still selects, and the
  delete key does nothing. Two reconnects "failed" first: both would have duplicated an edge that already existed,
  which `reconnectEdge` refuses by design.
- **QueryLens** (`flowinger-trial`, pin `d132971`, `FlowTree` on `FlowingerCore` + `FlowingerProvider` and no
  feature): typecheck and lint clean, 1170 unit tests, **79 / 79** e2e on the installed Chrome. Its `flow` chunk is
  **18.2 kB** (24.0 carrying the same features in the canvas, 21.7 at the previous pin, 60.5 with React Flow), total
  377.2 kB; the flow budget there is 25 → 20.
- **Costs and changes to know about.** `@types/node` is a dev dependency, and `tsconfig.json` sets
  `types: ["node"]` (TypeScript 6 stopped auto-including `@types/*`), for the tests and for `process.env.NODE_ENV`;
  the library now reads that one variable, as React does, so a page that loads the ES module *without* a bundler
  must define it. The exported `FlowingerEdges` draws the connection line and the reconnect grips only when given
  the features that draw them. An `EdgeAdornment` is drawn only with *selected* edges, so an unselected edge costs
  what it did.
  `pnpm size` takes `--max-full` / `--max-lean` (the old `--max` is gone). Not done: trimming the core further —
  its floor is the viewport, edges, handles and measurement.
- **Selection became a feature afterwards** (`selectionFeature`, at the user's request). What is *selected* stays in
  the core — a controlled node's `selected` is drawn, and `onSelectionChange`, `useOnSelectionChange`, `onNodeClick`,
  `onEdgeClick` and `onPaneClick` work on any canvas, as in React Flow, where the selection is reported however it
  changes. What moved is *changing* it by interaction: `setSelection` / `selectNode` / `selectEdge` /
  `clearSelection`, the click, Enter and Space on a node and an edge, the click on the empty canvas, and Escape. That
  took three additions to the slot contract (`useEdge`; `onClick` and `focusable` on a node; `onPaneClick` and
  `selectable` on the canvas), and `drag` and `boxSelect` now `need` it. **Measured, it saves less than estimated:**
  the core 15.2 → 15.0 kB gzip from `dist` (about 0.2 kB, against the ~0.7 kB I guessed — gzip had already squeezed
  that repetitive code) while the whole canvas grows 22.8 → 23.2 kB from the extra plumbing. So it is a trade of a
  little on the full canvas for a little on the core, made for consistency (everything that *acts* is a feature;
  the core is a viewer). Reverting it is one commit. 612 tests; about 90 mutants of the feature and its wiring, of
  which one was equivalent (a value the core already ANDs) and the rest were killed — after new tests for the
  ones that survived: keeping a selected edge when Shift-adding a node, a pane click when the canvas does not allow
  selecting, each Escape guard, and the edge keyboard handler.

### Fourth round: the cheap common React Flow gaps

Closing the audit's most commonly hit gaps — chosen for being cheap, not exhaustive. `@xyflow/react` went in as a
dev-only dependency (`node_modules`, never a runtime one), read directly for exact behaviour rather than recalled,
and used as an oracle in tests: several suites assert against React Flow's own functions, not against a
description of them.

- **Mouse events, as a feature (`eventsFeature`).** A double click, a right click, and the pointer entering,
  moving over and leaving a node, an edge or the pane; the wheel over the pane (`onPaneScroll`). `onNodeClick`,
  `onEdgeClick` and `onPaneClick` already worked on any canvas and stayed there — only the rest needed a feature.
  Giving any edge event (or `onEdgeClick`) makes every edge take the pointer, selectable or not, matching React
  Flow's `inactive` class logic. The feature reads the canvas's latest props through a ref set in a layout effect,
  so a handler that changes between renders is heard as it now is, not as the canvas mounted with.
- **The view moving.** `defaultViewport` (once, at mount; a caller's own `FlowingerProvider` is moved there instead
  of the canvas making a fresh one); `onMoveStart` / `onMove` / `onMoveEnd`, each `(event, viewport)` with `event`
  the pointer or wheel that moved it or `null` for a call; `useOnViewportChange` for a listener anywhere in the
  tree. A pan, a pinch and a run of wheel ticks are each one move — the wheel's ends 150 ms after the last tick,
  timed so a tween that begins mid-run still holds the move open past it. `nowheel` lets the wheel through to
  something that scrolls for itself.
- **Edges.** `interactionWidth`; `pathOptions` (`curvature` for a bezier, `borderRadius` for a smoothstep) reaches
  the built-in paths and the new `BezierEdge` / `StraightEdge` / `SmoothStepEdge` / `StepEdge` components (an
  `edgeTypes` entry can render one and add to it, or be one under another name); `labelStyle`, and the box behind a
  label (`labelShowBg`, `labelBgStyle`, `labelBgPadding`, `labelBgBorderRadius`) as its own feature
  (`edgeLabelsFeature`) — it needs a browser to measure the text, so it is not in the core. `getBezierPath`'s label
  now sits where the curve actually is (`getBezierEdgeCenter`, half way along the curve, not the straight line
  between the ends — the two agree only when the curve is symmetric); every path function also returns
  `offsetX`/`offsetY`. `updateEdgeData`, `getNodeConnections`, `getHandleConnections` (both React Flow's own
  reading of a handle id: alone, or `null`, it does not narrow — only paired with a `type`); `isNode`, `isEdge`.
  A custom edge is now given `animated`, `selectable`, `deletable`, `pathOptions` and the label style fields.
- **Nodes.** `NodeProps` carries `selectable`, `draggable`, `deletable`, `dragging`, `dragHandle`, `parentId`,
  `zIndex`, `width` and `height` — checked field by field against what React Flow hands the same component, over
  five canvas settings. `initialWidth` / `initialHeight` size an unmeasured node (`fitView`, `getNodesBounds`)
  instead of the 150×40 fallback. `useUpdateNodeInternals` has the canvas re-read a node's size and handle anchors
  a frame later, for a node that changes what it is made of without the canvas being told. A node's or an edge's
  own `selectable` now wins over the canvas's `elementsSelectable` either way (`true` even where the canvas
  disallows it, `false` even where it allows it), as React Flow has it — previously the canvas's flag always
  answered first, and a node's own `true` did nothing without it.
- **Handles.** `isConnectableStart` / `isConnectableEnd` (a handle that cannot start a drag still catches one; a
  handle that cannot end one is invisible to a drop, as if nothing were there); its own `isValidConnection` (asked
  in place of the canvas's, not as well — and not consulted during a *reconnect*, where the canvas's is what
  React Flow's own behaviour implies); its own `onConnect`, heard after the canvas's.
- **Components.** `Controls`: `position` (pins it like `Panel`), `fitViewOptions`, `showFitView` (alongside
  `showFit`), `onZoomIn`/`onZoomOut`/`onFitView`, and `ControlButton` for a button of your own among the built-in
  ones. `MiniMap`: `position`, `nodeStrokeColor`/`nodeStrokeWidth`, `nodeClassName`, `nodeBorderRadius`,
  `maskStrokeColor`/`maskStrokeWidth`, `bgColor`. `Background`: `bgColor`, `patternClassName`. `getViewportForBounds`
  matches React Flow's fit to the pixel — including its floor-rounded per-side nudge when the fit falls a pixel
  short of the requested padding on one side (proven over a grid of bounds, panes and paddings, plus one hand-picked
  case where the two sides fall short by different amounts). `proOptions` and `attributionPosition` are accepted
  and do nothing, since there is no attribution to hide.
- **Verified:** 774 tests (111 new, four new files — `events.test.tsx`, `viewport.test.tsx`, `edges.test.tsx`,
  `nodes.test.tsx`, `handles.test.tsx`, `components.test.tsx` — several running the same input through flowinger
  and a real `@xyflow/react` and diffing the results); mutation testing of the new seams (viewport gestures, the
  selectable rule, per-handle connect options, `getViewportForBounds`, the edge label box, `isNode`/`isEdge`, the
  built-in edge components, `Background`/`Controls`/`MiniMap`) — every survivor closed with a new test but two
  confirmed equivalent (a redundant-render guard on the label box; setting a style property to `undefined`, which
  React already treats as absent). CI's size gates moved 24/16 → 26/17 kB gzip to match the measured growth (core
  16.2 kB from `dist`, whole canvas 25.2 kB); the bundle test's needle table grew for the two new features and the
  built-in edge components. The demo picks up both new features and exercises `onNodeDoubleClick`,
  `onPaneContextMenu`, `labelShowBg`, and `Controls`/`MiniMap`'s `position`, checked in a real browser (unchecking a
  feature removes what it does, at once).
- **Not done in this round:** the demo's own event wiring is illustrative only (a text banner, not a real feature);
  no attempt was made at the rarer props (key-code overrides, `nodeOrigin`, ARIA parity) — see "Not built" below,
  which the audit still drives.

### Fifth round: instance and accessibility completion

Smaller than the fourth: `getInternalNode` and `useInternalNode` (a node plus `internals.positionAbsolute` and
`internals.z` — narrower than React Flow's own `InternalNode`, no `handleBounds` or `userNode`), `useStoreApi`
(`getState()` without subscribing, and `subscribe()` — no generic `setState`, since flowinger's store is not
zustand-shaped and offers no generic write to its internals), and `ariaLabel` / `ariaRole` / `domAttributes` on
both `Node` and `Edge` (an escape hatch that can never be an event handler or `id`/`style`/`className`/`role`,
matching React Flow's own `Omit` exactly so it cannot silently break a handler).

- **`viewportInitialized` was deliberately not added.** It is a plain boolean field on React Flow's own
  instance — and React Flow's `useReactFlow()` rebuilds that whole object with `useMemo` whenever it flips,
  which is why the field can be a snapshot there. Flowinger's instance is created once and never replaced —
  on purpose, since the opposite (a fresh object every render) was the exact bug plan.md's "Where the build
  deliberately departs from §2" describes (an effect keyed on the instance re-running every render). Adding
  the field as flowinger has it would go stale the moment it flipped true; adding it as a *function* would
  silently misbehave for code written against React Flow's boolean (`if (instance.viewportInitialized)` is
  always truthy on a function). Neither is honest, so it stays off the list rather than being faked.
- **A real bug found on the way, not introduced by it:** `store.ts`'s `snapshotNode` rebuilds `measured` as a
  fresh `{ width, height }` object on every call once a node has been measured, even when nothing has changed.
  Nothing before `useInternalNode` needed that object's *identity* to be stable across two calls in the same
  tick; `useSyncExternalStore` does, to tell "changed" from "call it again to be sure" — so the very first
  version of `useInternalNode` looped forever once a node had a measured size (real DOM layout, not just
  jsdom's zeroes). Fixed by comparing `measured` structurally in the cache check, not `snapshotNode` itself,
  and pinned with a regression test that renders a normal, measured node through the hook.
- **`useInternalNode`'s subscription is the union of two:** `subscribeGeometry` (a drag, or a controlled
  relayout) and the node's own `subscribeNode(id)` (a controlled *selection* flip alone touches neither
  geometry nor `sameLayout` — position, size and `hidden` are unmoved — so it would otherwise go unseen).
  Even so, it is narrower than React Flow's: `sameLayout` does not compare `parentId`, so a pure reparent
  that does not also move anything is invisible to it and to this hook alike; and a bare `zIndex` edit with
  no accompanying move is not picked up until something else invalidates the cache. Both are disclosed in
  the hook's own doc comment rather than fixed, since fixing the first means changing `sameLayout`'s
  contract for everything that reads it, not just this one hook.
- **Verified:** 797 tests (23 new, `internals.test.tsx`, several run against a real `@xyflow/react` —
  `positionAbsolute` matches its own `getInternalNode` exactly); mutation testing of the new wiring, all
  survivors closed but one confirmed equivalent (`sameInternalNode`'s `position`/`z`/`positionAbsolute.y`
  checks overlap with fields already covered by other checks or by `sameLayout`'s own blind spots — removing
  them changes nothing a real, store-notified change can exercise). Checked in the demo, alongside the fourth
  round's features, with no console errors and the expected `role="group"` on a selectable node.
- **Not done:** `useConnection`, `useHandleConnections` (the connect feature does not currently track handle
  or node objects during a drag, only points and positions — adding them is more than this round's size);
  `sourcePosition` / `targetPosition` as `Node` fields (a fallback for the default-node case, which needs a
  design decision about how it interacts with the existing legacy id-to-side table, not made here — made in the
  seventh round, below).

### Sixth round: connections and the canvas's own attributes

Smaller still. Picked up the fifth round's two deferred hooks, now that the connect feature has somewhere to
put the ids they need, plus what the canvas's own element was still missing.

- **`useConnection`.** The connect feature's internal state (`DragConnection` — renamed from `ConnectionState`,
  which now names the *public* shape instead) gained `fromNodeId`/`fromHandleId`/`fromHandleType` and
  `toNodeId`/`toHandleId`/`toHandleType`: the target ones set from whatever `handleAt(x, y)` finds under the
  pointer *regardless of validity* — so a consumer can colour an incompatible target red, the way React
  Flow's own doc example does — while `end`/`endPosition`/`isValid`, which decide where the drawn connection
  line snaps to, are untouched. `useConnection()` resolves those ids into `fromNode`/`toNode` (flowinger's
  `InternalNode`, reusing the fifth round's `getInternalNode`) and `fromHandle`/`toHandle` (`{ nodeId, id,
  type }` — no measured position, unlike React Flow's `Handle`) only when the raw connection object's
  reference has actually changed, the same caching `useInternalNode` needed. It only re-reads on what moves
  a connection along — a pointer move, or the drag starting or ending — so if the node it started from is
  removed with nothing else changing meanwhile, that alone is not seen until the next pointer move or the
  drag's end; disclosed in the hook's own doc comment rather than fixed, since watching the node list too
  would mean firing on every drag frame for an unrelated reason.
- **`useHandleConnections`.** React Flow's own docs say it is deprecated in favour of `useNodeConnections`,
  which flowinger already had; this is a one-line wrapper with the renamed, reordered parameters
  (`{ type, id, nodeId }` instead of `{ id, handleType, handleId }`) that name — added anyway, since the
  audit still counts it and the cost is one function.
- **The canvas's own `id` and `domAttributes`.** React Flow's whole `ReactFlowProps` extends
  `Omit<HTMLAttributes<HTMLDivElement>, 'onError'>`, so almost any HTML attribute lands directly on
  `<ReactFlow>` — including, structurally, event handlers, which would collide with the canvas's own pointer
  and keyboard handling if flowinger copied that literally. Narrower on purpose: `id` as its own prop, and a
  `domAttributes` object excluding every `DOMAttributes` member (so no handler), plus `id` / `style` /
  `className` / `children` / `role` / `tabIndex`, which the engine or `keyboardNavigation` already own.
  Same shape, and same real limit, as the fifth round's `Node.domAttributes` and `Edge.domAttributes`: none
  of the three accept an arbitrary `data-*` key without a cast, since `HTMLAttributes` does not declare one
  by name — true of React Flow's own `domAttributes` too, and the fifth round's docs oversold it before this
  round's tests caught the mismatch (`domAttributes={{ 'data-testid': 'x' }}` does not typecheck; only
  `AriaAttributes`' *named* `aria-*` members, and anything `HTMLAttributes` itself declares, like `title`,
  do). Fixed the wording in all three places rather than the type, since matching React Flow's own
  (also-narrow) contract is the point.
- **Verified:** 814 tests (17 new, `moreHooks.test.tsx`); mutation testing of the new wiring — one confirmed
  equivalent (`hit?.nodeId ?? null` reads the same as the ternary it replaced for every real id, and a
  same-pattern rewrite for `toNode`/`toHandle` resolution), the rest closed, including two that needed a new
  test rather than a rewrite: a selector applied to the very first (pre-mount) snapshot, and the dragged-from
  node vanishing mid-drag. Checked in the demo: still renders, no console errors, edge count unchanged
  after some exploratory dragging (a pixel-coordinate connection drag was not completed there — the pane's
  viewport-emulation scaling made screen coordinates unreliable enough that the attempt was abandoned in
  favour of the already-thorough unit and mutation coverage).

### Seventh round: open-source readiness

Not engine work. The question was *what stands between this and someone else using it*, and the answers
came from looking at the **published artifact and the repository's public face**, not the source:

- **The `require` types were wrong, in every release.** `exports` pointed `require` at a CJS file and its
  `types` at the one `dist/index.d.ts`, which — the package being `"type": "module"` — TypeScript reads as
  ESM. Are the Types Wrong: *Masquerading as ESM* under `node16` from CJS; publint warned the same. Nothing
  here had caught it because every check ran from ESM or a bundler. **Fixed** by giving `require` its own
  declarations: `scripts/cjs-types.mjs` copies the emitted `.d.ts` files into `dist/cjs/`, whose
  `package.json` says `"type": "commonjs"`. (A `.d.cts` beside each file would not do — the declarations
  import one another, and a CJS declaration may not import an ESM one.) **Verified on the packed tarball:**
  attw green on node10 / node16-from-CJS / node16-from-ESM / bundler; `publint --strict`; a throwaway
  consumer that `require`s and `import`s it and server-renders from each; a strict TypeScript consumer on
  `nodenext` as `.cts` and `.mts` with `skipLibCheck` off. `pnpm check:package` runs the first two in CI.
  Cost: the tarball is 108.6 → 121.1 kB. Rejected: going ESM-only (breaks CJS-based test runners and
  toolchains, for nothing at this size) and bundling declarations with a plugin (a second bundler in the
  build for the same result).
- **A token-based publish path was the only one, and its tokens are gone.** npm revoked classic tokens in
  December 2025 and caps granular write tokens at 90 days (GitHub's changelog, 2025-11-05 and 2025-12-09);
  trusted publishing — OIDC from the workflow, no stored secret — is the supported route, and it attaches a
  provenance attestation by itself (`0.3.0` has none). `release.yml` does that: a `vX.Y.Z` tag runs the same
  gate as CI and publishes. What npm requires, from its own page: CLI ≥ 11.5.1, Node ≥ 22.14,
  `id-token: write`, a GitHub-hosted runner, a **public** repository for provenance, `repository.url`
  matching exactly, and a first successful publish within two days of saving the configuration — which it
  does not validate on save, so the first real tag is the test (make it a prerelease; a hyphenated tag goes
  to the `next` dist-tag).
- **Release tooling: a tag and a hand-kept `CHANGELOG.md`.** Not Changesets (monorepo-shaped, a file per
  pull request for one maintainer); not release-please or semantic-release (they read conventional commits,
  and this history is prose). Revisit when there are outside contributors.
- **The repository was not reachable.** `api.github.com/repos/Naveen-Boddepalli/flowinger` answered 404 to
  an anonymous request, while `package.json`'s `repository`, `homepage` and `bugs`, the README's links and
  the npm page all point at it: private, or not pushed. Everything in this round that depends on it being
  public (the Pages demo, the badges, provenance, the issue forms) is built and waiting — see the launch
  checklist below. I did not check the remote with credentials.
- **React Flow's type names — 59 aliases** (`src/reactFlowNames.ts`; 47 at first, 12 more once the shapes had
  been read), the single largest migration
  paper-cut the audit had: 103 of the 112 missing exports were types. The audit went **99 → 158 of 211**
  exports. Each handler is written against the prop it describes and a test asserts it is *exactly* that
  prop's type, so it cannot drift; where React Flow's own shape is identical (`OnConnect`,
  `CoordinateExtent`, `SnapGrid`, `KeyCode`, `Dimensions`, `Box`, `Transform`, `XYZPosition`) the test
  compares against `@xyflow/react`'s. The type tests are enforced by `pnpm typecheck`, since `expectTypeOf`
  is a no-op at runtime — so they were **negative-controlled**: a handler changed to take an extra argument
  and `Transform` shortened to a pair each failed at the assertion, and were restored. **Left out on
  purpose:** names for things flowinger lacks (`NodeOrigin`, `ColorMode`…), a name whose shape differs
  (`FinalConnectionState`), and the generics — `ReactFlowInstance<MyNode>` is an error rather than a type
  argument silently ignored (the same reasoning as `viewportInitialized`, fifth round). A `GetBezierPathParams`
  family was already declared in `paths.ts`, only not exported.
- **A demo that can be linked to.** `vite.demo.config.ts` builds the root `index.html` for GitHub Pages
  (`pnpm demo:build`, `pages.yml`); CI builds it on every pull request so a broken demo fails the PR, not
  the deploy. Its version label now reads `package.json` instead of being bumped by hand each release.
  *Known wart:* the demo loads Tailwind from its CDN script, which Tailwind says is not for production —
  fine for a demo, but it is a third-party script on a public page; replacing it with the build-time plugin
  is a small job on `ROADMAP.md`'s list.
- **Examples, and a bug they found.** `examples/layouts` (a read-only viewer on `FlowingerCore`: one plan
  laid out by `d3-hierarchy`, `dagre` and `elkjs` behind one signature, top-down or left-to-right, tree or
  DAG) and `examples/editor` (a controlled editor with a custom node and edge). `scripts/check-examples.mjs`
  builds each against the *packed* library in a throwaway directory and is a CI job. Every layout × direction
  × shape combination was walked in a real browser and checked from geometry: no overlaps, children on the
  right side of parents, every node inside the pane, handles facing the layout. Two things came out of it:
  (1) **the example's own bug** — it remounted the canvas the moment a button was pressed, while the new
  positions arrived a moment later, so `fitView` framed the *old* layout; the numbers gave it away (a
  top-down layout with the scale of a left-to-right one), a screenshot would not have. It now keys the canvas
  on the finished layout. (2) **a library bug** — the first page load, in a browser pane that had just been
  opened, stayed unframed: the `fitView` prop set its "done" flag when the nodes were measured even though
  the pane had no size, where framing is a no-op, and so never framed once shown. That is any canvas mounted
  in a closed tab, modal or accordion. Fixed (`paneHasSize`), with a red-green test and a mutant for the
  effect's dependency; the suite also had no StrictMode test, so two were added (they pass). The examples ask
  the registry for the released package and use only API it has; Vite 6 rather than the repository's 8,
  because they are meant for StackBlitz — not tested there from here.
- **A real browser in CI, and what it found at once.** `e2e/smoke.spec.ts` (Playwright, against the demo as
  Pages serves it; `E2E_CHANNEL=chrome` uses the installed Chrome): framing and no console errors, an edge's
  ends against the *measured* handle, wheel zoom about the pointer, pan, node drag with its edges, a flick, a
  connection, delete. Written to the behaviours plan.md says only a browser showed. **Three things it found:**
  (1) *a flick lost the drag* — one far move then the release left the node put. The move that crosses the
  threshold goes to whatever is under the pointer (the capture it triggers starts with the *next* event), so
  the node never saw the pointer travel; the unit tests always sent a second move. Fixed at the release,
  with seven mutants of the new branch killed (two needed new assertions: that the release does not bubble,
  and that the pointer is let go). (2) *my test's "empty" spot was the minimap*, which is pannable the other
  way — it read as a pan bug until the number (-220 for a +90 drag) gave it away. (3) *port 4173 already had
  another project's preview on it* (QueryLens), which Playwright's `reuseExistingServer` quietly adopted: the
  suite "ran" against the wrong app. The config now uses an unusual port and never reuses a server.
- **A migration guide, and what writing it corrected.** `docs/migrating-from-react-flow.md`, with every
  default read from `@xyflow/react`'s source rather than recalled. That found two things wrong in this
  project's own docs: (1) the README listed `deleteKeyCode` being `'Backspace'` alone as a *difference* — it
  is React Flow's default too — and (2) nobody had listed `minZoom` (`0.5` there, `0.05` here) or the one
  that matters most, that React Flow's `nodesDraggable`, `nodesConnectable` and `elementsSelectable` default
  to **on** and flowinger's to off. **Test ids:** React Flow stamps `rf__wrapper`, `rf__node-<id>`,
  `rf__edge-<id>`, `rf__controls`, `rf__minimap` and `rf__background`; flowinger had only `edge-<id>`, so a
  migrated app's tests would break the way its stylesheet would have. Aligned (a 0.x breaking change to the
  one id, flagged in the changelog; QueryLens selects on none of them) and compared against the real
  library's output — which first failed because React Flow itself draws no edge in jsdom until it is told
  where the handles are (its server-rendering inputs: `width`, `height`, `handles`). Six producers, six
  mutants, all killed.
- **`sourcePosition` / `targetPosition`, which were really "built-in node types".** The fifth round deferred
  them as needing a design decision about the legacy id-to-side table. Looking at what React Flow does with
  them settled it: they only mean something to its built-in `default`, `input` and `output` nodes, which
  render handles — and flowinger's default view drew *none*, so a migrated app's plain nodes lost their
  handles and edges attached by direction. The default view now registers real handles (a target on
  `targetPosition`, default top; a source on `sourcePosition`, default bottom; `input` only the source,
  `output` only the target, `group` neither), and a custom component is handed both fields. The legacy table
  is untouched: it still answers only for a handle *id* that no registered handle carries, and the built-in
  handles carry none. Checked against React Flow's own DOM for seven node configurations; ten mutants, all
  killed. One difference kept: flowinger's default node also shows its `id`.
- **A controlled `viewport`, and a design flaw the mutants found in it.** Everything that moves the view —
  gestures, tweens, `fitView`, the zoom buttons — already went through one function (`commitViewport`, three
  call sites, all in `setViewport`), so controlled mode is a flag at that seam: a request goes to
  `onViewportChange` and the view stays put; `syncViewport` (the prop changing) applies a view without
  reporting it. The first version cancelled the running tween whenever the prop changed — but an owner
  applying each frame it is asked for changes the prop *because of* that tween, so every animated move in
  controlled mode would have stopped after one frame. The mutant that removed the cancel *survived*, which
  is what showed the behaviour was untested, and then wrong. Now the sync recognises an echo of the last
  request (leave the tween and its destination alone) from an owner's own jump (cancel it), with a test for
  each and one for the second wheel tick building on the owner's view. Two other survivors were a missing
  assertion (the server-rendered first paint) and an *equivalent* mutant (the `defaultViewport` guard: that
  effect runs before the callbacks and listeners exist, so the transient move it avoids cannot be seen).
- **Pass-through attributes — and a node-type rule found by testing them.** `Panel`, `NodeToolbar`, `MiniMap`,
  `Handle` and `BaseEdge` take their element's non-handler attributes (a shared types-only
  `PassThroughHtml` / `PassThroughSvg`, `attributes.ts`): the useful part of what React Flow lets through,
  minus the handlers that would silently replace the canvas's own. A handle's `id` stays the handle id; on
  `BaseEdge` they land on the path and the engine's `d`, `fill`, markers and classes win (a test passes them
  by cast to pin that). The tests used `nodeTypes={{ default: … }}` to put a component in a typeless node,
  and it was *not used* — React Flow resolves `node.type || 'default'`, and sends an unregistered type to
  `nodeTypes.default` too. Fixed, and the oracle caught my first fix: React Flow still draws its built-in
  `input`/`output`/`group` when `default` is overridden, which mine had sent to the override. Eleven
  mutants, two survivors that became tests (a typeless `group`; the engine winning over a cast-in `d`).
- **Where the bytes went, and the budget raise.** The whole canvas went 25.4 → 26.0 kB gzip over this round and the
  lean core 16.5 → 16.9 (16.3 → 16.8 from `dist`): ~0.1 each for the flick fix, the test ids, the built-in node
  handles and the pass-through attributes, and 0.2–0.3 for the controlled viewport (measured at each commit, from
  a clean checkout). All were compatibility features chosen deliberately, so the full-canvas budget moved
  26 → 27, in CI, the release workflow and CONTRIBUTING; **the lean budget stayed 17**, with 0.1 kB of room — too little, as the first CI run
  showed (next entry); it is 17.5 now. The next change that touches the core still has to earn its bytes (or
  be a feature). `release.yml` also now
  runs the examples and the browser suite — it said "the same gate as CI" and was not.
- **The README became a landing page.** It had grown to 470 lines of reference. Now it is ~230: hero and
  screenshot, why, install, quick start (with the interactive opt-in called out, since that is the first
  surprise), pay-for-what-you-use with the size table, a documentation index, the two examples with
  screenshots, an honest "is it for you", compatibility, contributing, acknowledgements. The reference moved,
  verbatim, into `docs/` (`api`, `components`, `features`, `theming`, `server-rendering`,
  `react-flow-coverage`) with a `docs/README.md` index and a new `getting-started.md`; inbound links were
  repointed and every link and image in all 20 Markdown files is checked. Screenshots are real (Playwright,
  installed Chrome, 2×), of the demo's canvas and the two examples; the layouts one is the left-to-right tree,
  because with the shared-scan toggle on, the example's generic smoothstep edge runs behind two nodes — a
  fair limit of the example, not something to put in a hero image.
- **The first CI run, and a margin that was inside the noise.** `demo`, `examples` and `e2e` passed first time —
  which is the first real evidence the workflows and the action versions I took from release pages are
  sound — and `check` failed the lean gate: **17.0 kB in CI against 16.95 here**, the same 56.5 kB minified
  bundle. gzip's output differs by ~0.07 kB between Node/zlib builds, so the "0.1 kB of room" I had recorded
  and said would be tight was within environmental noise, not headroom. Fixed as a gate, not as code: the
  lean budget is 17.5 (full stays 27, 0.9 clear), the scripts print two decimals so a difference like this is
  visible, and the rule is written down — a budget sits about half a kilobyte above what CI measures. Not
  done: trimming 0.1 kB to chase a decimal, which would have been a worse fix and would have failed again.
- **After the merge: what the first CI runs and Dependabot found.** `demo`, `examples`, `e2e` and `check`
  passed on `main`; the Pages `deploy` 404s until Pages is switched on (checklist 2). Dependabot opened its
  first grouped PRs at once and one was merged: **TypeScript 6 → 7** and `@types/node` 24 → 26. CI passed
  it — typecheck, 867 tests, build, package, examples, browser all fine on TS 7 — but **it broke
  `scripts/audit-react-flow.mjs`**, which CI never ran: TypeScript 7's `require('typescript')` is only
  `{ version }` (the compiler is a native binary behind an unstable interface). Fixed with an alias,
  `typescript-js-api` → `typescript@^6`, used only by that script; and the script is now a CI step, so a
  tool that backs the published coverage numbers cannot go quiet again. Dependabot's *examples* PR (Vite
  6 → 8, plugin-react 4 → 6, TypeScript 5.9 → 7) failed the `examples` job — the gate working — on a latent
  bug of mine: the examples never declared Vite's client types (`vite-env.d.ts`), which TS 7 now insists on
  for `import './styles.css'`. Fixed; with it the examples build on the bumped toolchain too. They stay
  pinned to Vite 6 on purpose (StackBlitz), so Dependabot is told to leave their toolchain majors alone.
  Also: `runs-on` is `ubuntu-24.04`, not `ubuntu-latest`, ahead of GitHub's 2026-10-19 move to Ubuntu 26 — the
  browser job installs system packages through Playwright, the part a new distro breaks first.
- **Also:** `CONTRIBUTING.md` (including the release procedure and the one-time npm setup),
  `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md`, issue forms that ask whether React Flow
  behaves differently (a compat library's best bug report), a pull-request template, Dependabot (the
  `@xyflow/react` oracle is pinned and excluded), `CHANGELOG.md` rebuilt from the registry's `gitHead` for
  each release (`0.1.0` → `68bbe79`, `0.2.0` → `574437d`, `0.3.0` → `a0e9c00`), `ROADMAP.md`, README badges
  and an "Is it for you?" section using this file's own measurements.
- **Checked while writing:** the README's first draft said the demo lays out a tree; it does not (positions
  are hand-written) — corrected before it shipped. The release-notes extraction in `release.yml` swallowed
  the changelog's link references for the oldest entry — caught by running it against the real file.
- **Not done:** a docs site, and the rest of `ROADMAP.md`. (The release itself, the browser suite, the layout recipes
  and the examples were done afterwards — see below.)

### The release, as verified

`v0.4.0-rc.1` went out through `release.yml` with no stored token, and was checked from the outside, not by the
green ticks:

- **The run** (`publish` 1m 46s, then `release`): every gate step — tag and version agree, a changelog heading,
  npm ≥ 11.5.1, typecheck, tests, build, both size budgets, package check, examples, browser suite — and then
  the publish. The first run of `check:package` and of OIDC publishing on CI, both green.
- **The registry:** `latest` stays `0.3.0`, `next` is `0.4.0-rc.1`; the version carries a SLSA provenance
  attestation naming `release.yml @ refs/tags/v0.4.0-rc.1` on a GitHub-hosted runner, plus npm's publish
  attestation.
- **The artifact, installed from the registry into an empty project:** `npm audit signatures` verifies the
  registry signatures and the attestations; `require` and `import` load it, a server render from each carries
  the new test ids and a controlled viewport in the first markup; a strict `nodenext` TypeScript consumer
  (`.cts` and `.mts`, `skipLibCheck` off) resolves the new type names.
- **The GitHub release** was created as a prerelease with the changelog's notes.
- **The npm page:** relative images and links are rewritten to `raw.githubusercontent.com` / `blob/HEAD`.

`v0.4.0` followed the same way, on the second attempt (published 2026-10-11 04:1x UTC, `latest` → `0.4.0`,
provenance naming `release.yml @ refs/tags/v0.4.0`, `gitHead` `ab14dc6`; installed from the registry into an
empty project with the same checks passing). The first attempt is worth keeping: the tag `v0.4.0` was
created while `main` was still the *candidate's* merge commit (`904405d`, where `package.json` says
`0.4.0-rc.1`), before the release PR had merged. The guard refused it in 10 s — `tag v0.4.0 does not match
package.json version 0.4.0-rc.1` — and nothing was published; the tag was then moved to the PR's merge commit
and run #3 published. Two things came of it: the guard's message now names the likely cause, and the release
step edits a release page that already exists instead of failing on it (`7bc73e8`, the owner's own fix).
CONTRIBUTING's *Releasing* section says to pull `main` before tagging and not to create the release by hand.

### Launch checklist

What is *in the repository* is done; what is left is switches only the owner can flip.

| # | Step | State |
|---|---|---|
| 1 | Make the GitHub repository public. | **done** (it is public; PR #1 is merged) |
| 2 | Settings → Pages → Source: **GitHub Actions** (then `pages.yml` publishes the demo). Until it was, `deploy` failed with `HttpError: Not Found` / 404 — seen on the first two runs, with `build` green, so the artifact and its `/flowinger/` base were fine | **done**: https://naveen-boddepalli.github.io/flowinger/ answers 200 |
| 3 | npmjs.com → `flowinger` → Settings → **Trusted Publisher** → GitHub Actions: owner `Naveen-Boddepalli`, repo `flowinger`, workflow `release.yml` | **done**, and validated by the first publish. Still open: *Publishing access* → "Require two-factor authentication and disallow bypass 2fa tokens" — trusted publishing keeps working under it, and npm is restricting bypass tokens anyway |
| 4 | Settings → Security → enable **private vulnerability reporting**; Settings → enable **Discussions**; set the description, homepage (the demo) and topics | open |
| 5 | Tag the three published releases at the commits npm recorded (`git tag v0.1.0 68bbe79 && git tag v0.2.0 574437d && git tag v0.3.0 a0e9c00`) — so the changelog's compare links work | **done**: tagged, each checked against the registry's `gitHead`, and pushed with the branch |
| 6 | Merge this work; push a **prerelease** tag first (`v0.4.0-rc.1`) to prove steps 1–3, then `v0.4.0` | **done**: `v0.4.0-rc.1` (2026-10-10) and `v0.4.0` (2026-10-11, run #3) are on npm, with provenance. See *The release, as verified* |
| 7 | Replace the contact line in `CODE_OF_CONDUCT.md` with a dedicated address if wanted (it points at the GitHub profile) | optional |
| 8 | After the first release, look at the README on npmjs.com: its three images are relative paths. | **done**: npm rewrites them to `raw.githubusercontent.com/…/HEAD/docs/assets/…` and all three load; relative links become `github.com/…/blob/HEAD/…`. No change needed |

### Not built

- Connecting by *keyboard* (a drag is the only way to make a connection). React Flow does not offer it either,
  as far as I know.
- A lot that React Flow has, though less than before each round above. Measured (not from memory) with
  `scripts/audit-react-flow.mjs` against `@xyflow/react` 12.11.6's type declarations: 158 of its 211 exports
  (44 of the 53 missing are types — 99 of 211 before the seventh round's type names), 83 of 119 `ReactFlow` props, 31 of 32 instance methods, 21 of 22
  `Node` fields, 13 of 13 `NodeProps` fields, 20 of 20 on both `Edge` and `EdgeProps`. The README's "Coming
  from React Flow" lists what is missing, by category — mostly key-code and threshold props
  (`selectionKeyCode`, `nodeDragThreshold`…), `nodeOrigin`, `colorMode`, and HTML attributes on `Panel`,
  `NodeToolbar`, `MiniMap`, `Handle` and `BaseEdge` (the canvas itself now takes `id` and `domAttributes`).
  It is enough for QueryLens (whose `FlowTree` uses eight names) and not for an arbitrary React Flow app.
- `useStore` reads ten fields (`panZoom`, `isReady`, `nodes`, `edges`, `transform`, `width`, `height`, `minZoom`, `maxZoom`, `nodesInitialized`), not React Flow's whole internal store.
- Published to npm: `flowinger@0.1.0` (2026-09-21), then `0.2.0` (2026-09-22, the fourth round's additions —
  events, viewport moves, edge label styling, `NodeProps`, the NOTICE), then `0.3.0` (2026-09-22, the fifth
  round — `getInternalNode`, `useInternalNode`, `useStoreApi`, ARIA fields), then `0.4.0` (2026-10-11 — the
  sixth round and the seventh, published from CI by tag with provenance, after `0.4.0-rc.1` on the `next`
  tag). QueryLens's trial branch tracked the registry version and was bumped at
  each release before it was merged into QueryLens `main` (2026-09-22, PR #6) — QueryLens now bumps `main`
  directly at each flowinger release instead; `flow` chunk 18.0 → 18.9 → 19.0 kB across `0.1.0` → `0.2.0` →
  `0.3.0`.
  CI (`.github/workflows/ci.yml`: typecheck, tests and build on React 18 and 19) is green.

## 1. Context and Goals

QueryLens relies on `@xyflow/react` (React Flow) to render interactive, node-based diagrams such as Abstract Syntax Trees (ASTs), Query Plans, and B+Trees. While React Flow is powerful and MIT-licensed, it brings a significant amount of code complexity, bundle size, and features that QueryLens does not strictly need.

**The Goal:** Build "Flowinger", a bespoke, lightweight, and dependency-free node graph renderer. It is developed here as an independent library; QueryLens imports it as a dependency once it is complete. That removes the reliance on a third-party visualization library for node graphs, and gives 100% control over the rendering pipeline, performance, and styling.

### Key Requirements
*   **Dependency-Free:** Pure React and standard DOM APIs (HTML/CSS/SVG).
*   **Performance:** Must be able to render large trees smoothly. Moving one node should not re-render the entire graph.
*   **Interactivity:** Support panning the canvas, zooming in/out, and dragging individual nodes.
*   **Flexibility:** Support custom React components for nodes (to render specific query plan details or AST nodes).

---

## 2. Architecture & Tech Stack

Flowinger will be built using a layered architecture to keep DOM updates efficient.

### A. State Management (The Brain)
We will avoid standard React `useState` for the global canvas to prevent full re-renders on every mouse pixel movement.
*   Use **React Context** combined with a pub/sub model (or standard state if heavily optimized with `useMemo`/`memo`) to store the graph's state.
*   **Data Structures:**
    *   `nodes`: Array of objects `{ id, type, position: {x, y}, data }`
    *   `edges`: Array of objects `{ id, source, target }`
    *   `viewport`: `{ x, y, zoom }`

### B. The Viewport Layer (The Canvas)
An outer wrapper `<div>` that captures global mouse events.
*   **Pan:** Middle-click + drag or Spacebar + drag. Updates `viewport.x` and `viewport.y`.
*   **Zoom:** Mouse wheel (`wheel` event). Updates `viewport.zoom`.
*   Applied via a highly performant CSS `transform: translate(x, y) scale(zoom)` on the inner container.

### C. The Edges Layer (The Lines)
A single full-screen `<svg>` element placed *behind* the nodes.
*   Iterates over the `edges` array.
*   Finds the geometric center or specific anchor points (ports) of the `source` and `target` nodes.
*   Draws `<path d="..." />` using SVG cubic bezier math for smooth curved lines, or simple linear paths.

### D. The Nodes Layer (The Blocks)
A standard HTML layer containing absolute-positioned `<div>` elements.
*   Each node receives its `x` and `y` coordinates as inline styles: `top: y, left: x`.
*   Nodes wrap custom components injected by the application (e.g., `PlanNode`, `ASTNode`).
*   Attach `onPointerDown` events directly to nodes to initiate dragging.

---

## 3. Implementation Phases

### Phase 1: Core Engine & Data Model
*   Define TypeScript interfaces for `Node`, `Edge`, and `Viewport`.
*   Create the main `<FlowingerCanvas />` wrapper component.
*   Implement basic rendering of absolute-positioned placeholder nodes.

### Phase 2: Canvas Interactivity (Pan & Zoom)
*   Add `onWheel` event listener to calculate zoom scale (preventing default browser scroll).
*   Add pointer event listeners to the canvas background to calculate delta changes for panning.
*   Apply the CSS `transform` matrix to the inner container.

### Phase 3: Node Dragging & Selection
*   Implement pointer capture on nodes.
*   Update the specific node's `x/y` coordinates on `onPointerMove`.
*   Ensure dragging a node does not accidentally trigger canvas panning.

### Phase 4: Edge Routing & SVG Rendering
*   Create the `<FlowingerEdges />` SVG overlay.
*   Write a utility function to generate SVG Bezier path strings between two node coordinates.
*   Implement "ports" (handles) so edges connect to the top/bottom of nodes rather than their top-left corners.

### Phase 5: Integration & Layouting
*   **In QueryLens, not here:** replace the `@xyflow/react` dependency with `flowinger` and change the imports in QueryLens's `FlowTree` (see §5).
*   Ensure the existing tree-layout logic (`d3-hierarchy`, in QueryLens) feeds `x/y` coordinates correctly into the Flowinger nodes array.

---

## 4. Known Challenges & Mitigation

1.  **Re-render Lag:** Dragging a node at 60fps might cause React to choke if it re-renders the whole tree.
    *   *Mitigation:* Use `React.memo` heavily for Node components. Consider using mutable refs for node positions during the drag operation and only committing to React state on `onPointerUp`.
2.  **Connecting Edges to Moving Nodes:** The SVG path needs to update in real-time as a node is dragged.
    *   *Mitigation:* We will tie edge rendering to the same optimized coordinate system used by the nodes.
3.  **Bounding Boxes:** Trees can grow infinitely.
    *   *Mitigation:* Ensure the pan limits and initial zoom bounds auto-fit the generated tree layout.

---

## 5. Importing into QueryLens

QueryLens will swap `@xyflow/react` for this package when flowinger is complete. Nothing in this repo
depends on QueryLens; this section records what QueryLens depends on, so the swap is a checklist.

### API QueryLens uses (all exported, as React Flow-compatible aliases)

`ReactFlow` (= `FlowingerCanvas`), `ReactFlowProvider` (= `FlowingerProvider`), `useReactFlow`
(`setViewport`, `zoomIn`, `zoomOut`), `useStore((s) => s.panZoom)`, `Handle`, `Position`, `Background`,
`BackgroundVariant.Dots`, and the types `Node`, `Edge`, `NodeProps`.

- Canvas props: `nodes`, `edges`, `nodeTypes`, `minZoom`, `maxZoom`, `nodesDraggable={false}`,
  `nodesConnectable={false}`, `elementsSelectable={false}`, and a `<Background>` child.
- Node fields: `id`, `type`, `position`, `data`, `width`, `height`, `draggable: false`, `selectable: false`.
- Edge fields: `id`, `source`, `target`, `sourceHandle`/`targetHandle` (`out`→`in` down the tree,
  `next`→`prev` along a sibling chain), `className: 'is-active'`, `style`.
- QueryLens supplies its own node component and its own zoom toolbar; it does not use the default node
  view or `<Controls>`.

### Behaviour it relies on

- `useStore((s) => s.panZoom)` is `null` until a canvas has mounted, then **one stable object for good**.
  QueryLens frames the diagram in an effect keyed on it; an instance rebuilt per render loops forever
  (there is a regression test for this).
- `setViewport(vp, { duration })` is instant when `duration` is 0, in a hidden tab, or under reduced
  motion; otherwise animated, and it must still *land* if `requestAnimationFrame` stalls.
- The viewport element is `.react-flow__viewport` with an inline
  `transform: translate(Xpx, Ypx) scale(Z)`. The initial value is exactly `translate(0px, 0px) scale(1)`,
  which QueryLens's browser tests treat as "never framed", and they read the zoom back with
  `scale\(([\d.]+)\)`.
- Class names: `.react-flow` (canvas root), `.react-flow__viewport`, `.react-flow__node`,
  `.react-flow__edge` (a `<g>` carrying the edge's `className`), and `.react-flow__edge-path` inside it.
  QueryLens styles `.react-flow__edge.is-active .react-flow__edge-path` (an animated dash). An edge's
  inline `style` on the path outranks that CSS — the same as React Flow — so stroke colour stays inline.
- Edges resolve handles through the registry (Phase 4 above). QueryLens's ids (`in`, `out`, `prev`,
  `next`) are registered by its own `<Handle>`s, so the legacy id table is no longer what it relies on.

### On the QueryLens side, when swapping

1. Replace the dependency; import from `flowinger` in `FlowTree`. From the registry (`flowinger@0.1.0`, published
   2026-09-21) there is nothing to allow-list. Installed from GitHub instead, pnpm 11 refuses to build a
   git-hosted package unless `pnpm-workspace.yaml` allow-lists it (`allowBuilds:` → `flowinger: true`).
2. Delete the `react-flow__attribution` / `react-flow__pane` CSS overrides (nothing renders them) and
   the `@xyflow/react/dist/style.css` import.
3. Re-point the `flow` chunk in `vite.config.ts` and cut its bundle budget. Measured in the same chunk,
   React Flow + d3 is 60.5 kB gzip (budgeted at 70); the engine plus d3 is 9.4 kB. QueryLens's *total*
   budget currently sits at 422.2 / 424 kB, so it is the swap that buys back the headroom.
4. Run QueryLens's full gate, *including e2e* — the framing, zoom-control and hidden-tab tests are the
   ones that pin this contract. They cannot run until Playwright's browser is installed.

### Trial swap — what actually happened

The checklist above was a prediction; it has since been run. QueryLens's repo has a `flowinger-trial`
branch (a worktree, not merged) that swaps `@xyflow/react` for a git dependency pinned to a flowinger
commit, and takes `FlowTree` across by changing its imports alone.

- **Contract:** QueryLens's full e2e suite — the tests §5 names — passes **79 / 79** on both React Flow
  and flowinger (Playwright pointed at the installed Chrome; nothing downloaded). Typecheck, lint and all
  1170 unit tests are unchanged. On the parse tree and the B+Tree the viewport transform and every node
  rectangle are *identical*.
- **Weight:** the `flow` chunk 60.5 → 14.0 kB gzip; QueryLens's total 422.2 → 373.9 kB (budget 424).
- **What the suite could not see, and a side-by-side did:** (1) `Background`'s `size` is a dot's
  *diameter* in React Flow and was a radius here — QueryLens's dots would have been twice as large;
  (2) React Flow ends an edge at the *outer* edge of a handle's dot, flowinger at its centre — about 3
  units at each end; and `offsetWidth` rounds to whole pixels. All three are fixed (`1dccd68`,
  `dc36570`); edge endpoints now agree to within 0.2 units.
- **Behaviour that changes for QueryLens, and is arguably better:** React Flow sets `pointer-events: none`
  on nodes that are neither draggable nor selectable, so `FlowTree`'s documented hover styling and
  tooltips *never fired*; they do now. React Flow also leaves inert nodes focusable (five no-op tab
  stops in the parse-tree pane) with a `role`, `aria-roledescription` and an assertive live region;
  flowinger adds none unless a canvas opts in. The "React Flow" attribution badge disappears.
- **A policy collision, resolved by publishing:** QueryLens's `pnpm-workspace.yaml` deliberately has
  `allowBuilds: []`, so that a build script is always a reviewed diff. A git-hosted package has no `dist/`,
  so flowinger's `prepare` script must run, which needed `allowBuilds: flowinger: true` there — a weaker
  posture than QueryLens has chosen. Since `flowinger@0.1.0` is on npm, `dist/` ships prebuilt and the trial
  branch is back to `allowBuilds: []`; a fresh `pnpm install --frozen-lockfile` (pnpm 11.1.2) needs no
  exception. Two things met on the way, worth knowing:
  - pnpm's `minimumReleaseAge` (QueryLens sets 7 days) refuses a release younger than that, so *resolving*
    `0.1.0` in its first week needs `minimumReleaseAgeExclude: [flowinger]` — once. The lockfile then holds the
    resolution and installs, frozen or not, need no exemption.
  - Switching an existing checkout from the git dependency to the registry printed
    `ERR_PNPM_IGNORED_BUILDS` for `flowinger@0.1.0` and wrote a placeholder into `allowBuilds`; a clean install
    of the same lockfile does not. It is leftover state from the git-hosted copy, not the package
    (`prepare` stays in the manifest; a registry install never runs a dependency's `prepare`).
- **On the registry, the same gates:** typecheck, lint, all 1170 unit tests and the whole e2e suite (79 / 79)
  pass; the `flow` chunk is 18.0 kB gzip and QueryLens's total 377.0 / 424 kB.

### Before publishing or announcing

- Done: `LICENSE.md` (MIT), and published to npm as `flowinger@0.1.0` (2026-09-21).
- Done: attribute React Flow — `NOTICE.md` credits the bezier control-point formula and the edge-centre maths in
  `src/paths.ts` (0.2.0).
- Everything else is the seventh round's **Launch checklist**, above.
