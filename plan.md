# Flowinger: Independent React Flow Replacement

## 0. Status

*Updated September 2026.* The engine is in `src/`; tests are in `src/__tests__/` — `flowinger.test.tsx`
(components: pan, wheel zoom, pinch, keyboard, drag, `fitView`, handles, arrowheads and labels, custom
edges, selection, connecting, the minimap, `translateExtent`, and the render-loop regression),
`flowingerStore.test.ts` (the pure store), `pointer.test.ts` (pinch maths), `ssr.test.tsx` (a server render
in vitest's `node` environment, where there really is no `document`) and `hydration.test.tsx`.
`pnpm typecheck`, `pnpm test` (427 tests, in 17 files) and `pnpm build` pass on React 19 **and** React 18, and the
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

Re-verified against QueryLens: the trial branch's suites, run with the packed tarball of this build in place
of its pinned commit — typecheck clean, **1170** unit tests, **79 / 79** e2e (installed Chrome). The branch
itself still pins the earlier commit; nothing in QueryLens was changed.

### Not built

- Connecting by *keyboard* (a drag is the only way to make a connection). React Flow does not offer it either,
  as far as I know.
- Things React Flow has that this does not: `expandParent`, reconnecting an edge (`onReconnect`),
  `connectionLineComponent`, auto-pan while dragging near the pane's edge, `zoomOnDoubleClick`,
  `ViewportPortal`, `useOnSelectionChange`, `useKeyPress`, `useNodesData`, `useNodeConnections`, `nodeOrigin`,
  `NodeToolbar` for a node other than its own. This list is from memory of React Flow's API, not an audit.
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
