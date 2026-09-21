# Flowinger: Independent React Flow Replacement

## 0. Status

*Updated September 2026.* The engine is in `src/`; tests are in `src/__tests__/` — `flowinger.test.tsx`
(components: pan, wheel zoom, pinch, keyboard, drag, `fitView`, handles, arrowheads and labels, custom
edges, selection, connecting, the minimap, `translateExtent`, and the render-loop regression),
`flowingerStore.test.ts` (the pure store), `pointer.test.ts` (pinch maths), `ssr.test.tsx` (a server render
in vitest's `node` environment, where there really is no `document`) and `hydration.test.tsx`.
`pnpm typecheck`, `pnpm test` (599 tests, in 25 files) and `pnpm build` pass on React 19 **and** React 18, and the
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

### Not built

- Connecting by *keyboard* (a drag is the only way to make a connection). React Flow does not offer it either,
  as far as I know.
- A lot that React Flow has. Measured (not from memory) with `scripts/audit-react-flow.mjs` against `@xyflow/react`
  12.11.6's type declarations: 78 of its 211 exports (108 of the 133 missing are types), 60 of 119 `ReactFlow`
  props, 27 of 32 instance methods, 14 of 22 `Node` fields, 11 of 20 `Edge` fields, 5 of 13 `NodeProps` fields.
  The README's "Coming from React Flow" lists what is missing, by category. It is enough for QueryLens (whose
  `FlowTree` uses eight names) and not for an arbitrary React Flow app.
- `useStore` reads ten fields (`panZoom`, `isReady`, `nodes`, `edges`, `transform`, `width`, `height`, `minZoom`, `maxZoom`, `nodesInitialized`), not React Flow's whole internal store.
- Publishing to npm. It installs from GitHub (`prepare` builds `dist/`; verified with pnpm 11 and npm 12,
  see the README), but has not been published. CI (`.github/workflows/ci.yml`: typecheck, tests and build
  on React 18 and 19) exists, and both legs pass locally, but the first GitHub run has not been read —
  the repo is private and nothing here could view it.

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

1. Replace the dependency; import from `flowinger` in `FlowTree`. Installed from GitHub, pnpm 11 refuses
   to build a git-hosted package unless QueryLens's `pnpm-workspace.yaml` allow-lists it
   (`allowBuilds:` → `flowinger: true`); the error names exactly that fix.
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
- **A policy collision:** QueryLens's `pnpm-workspace.yaml` deliberately has `allowBuilds: []`, so that a
  build script is always a reviewed diff. A git-hosted package has no `dist/`, so flowinger's `prepare`
  script must run, which needs `allowBuilds: flowinger: true` there. That works (`blockExoticSubdeps`
  is about *transitive* git dependencies and does not block a direct one), but it is a weaker posture
  than QueryLens has chosen. **Publishing flowinger to a registry is the clean fix**: `dist/` ships
  prebuilt, no script runs, and `minimumReleaseAge` applies as it does to everything else.

### Before publishing or announcing

- Add a `LICENSE` file (`package.json` says MIT; there is none).
- Attribute React Flow: `src/paths.ts` uses React Flow's (MIT) bezier control-point formula, so keep a
  `NOTICE`/attribution unless that has been decided otherwise.
