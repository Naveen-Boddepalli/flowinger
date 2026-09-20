# Flowinger: Independent React Flow Replacement

## 0. Status

*Updated September 2026.* The engine is in `src/`; tests are in `src/__tests__/` (components: pan, wheel
zoom, drag, `fitView`, the render-loop regression; `flowingerStore.test.ts`: the pure store — clamping,
tweens, hidden-tab snap, geometry). `pnpm typecheck`, `pnpm test` and `pnpm build` pass.

Flowinger is its own repository. Its first consumer, QueryLens, will import it as a dependency once
flowinger is complete — the way QueryLens imports React Flow today — rather than carrying a copy (§5).
Before this repo was split out, the same engine source ran QueryLens's three tree panels in a real
browser (framing, zoom buttons, mouse pan, wheel zoom); the demo in `demo/` has *not* been run in a
browser.

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
  `--flowinger-text-dim`, `--flowinger-radius`), each with a fallback — so they need no stylesheet and
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
- **`react-flow__*` class names are kept** on the engine's elements, and the viewport's
  `translate(Xpx, Ypx) scale(Z)` string is a contract too: stylesheets, browser tests and code migrating
  from React Flow select on them.

### Not built

- Selection and connecting edges. `nodesConnectable` / `elementsSelectable` are accepted for API
  compatibility and ignored.
- Edge labels and arrowheads; a minimap.
- `useStore` is a two-field shim (`panZoom`, `isReady`), just enough for code migrating from React Flow.
- Install/publish setup: `dist/` is gitignored and there is no `prepare` script, so the package cannot
  be installed from git yet, and it has not been published.

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

1. Replace the dependency; import from `flowinger` in `FlowTree`.
2. Delete the `react-flow__attribution` / `react-flow__pane` CSS overrides (nothing renders them) and
   the `@xyflow/react/dist/style.css` import.
3. Re-point the `flow` chunk in `vite.config.ts` and cut its bundle budget. Measured in the same chunk,
   React Flow + d3 is 60.5 kB gzip (budgeted at 70); the engine plus d3 is 9.4 kB. QueryLens's *total*
   budget currently sits at 422.2 / 424 kB, so it is the swap that buys back the headroom.
4. Run QueryLens's full gate, *including e2e* — the framing, zoom-control and hidden-tab tests are the
   ones that pin this contract. They cannot run until Playwright's browser is installed.

### Before publishing or announcing

- Add a `LICENSE` file (`package.json` says MIT; there is none).
- Attribute React Flow: `src/paths.ts` uses React Flow's (MIT) bezier control-point formula, so keep a
  `NOTICE`/attribution unless that has been decided otherwise.
- Write a real README (it is one line).
- Make the package installable: a `prepare`/publish step, since `dist/` is gitignored.
