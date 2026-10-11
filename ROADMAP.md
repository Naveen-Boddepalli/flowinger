# Roadmap

Where Flowinger is going, in the order I think it should happen. This is a plan, not a promise — it is a
small project with one maintainer, and the order changes when someone shows me what blocks them. If
something here matters to you, say so in an [issue](https://github.com/Naveen-Boddepalli/flowinger/issues):
that is the single most useful thing you can do.

The ordering rule: **first make it easy to install and trust, then make it easy to switch to, then widen
it.** A library nobody can find the answer to a question about is not helped by more props.

## Done

- Published to npm (`0.1.0` → `0.3.0`), MIT licensed, tested on React 18 and 19, server-rendered and
  hydrated, and measured against `@xyflow/react` rather than described from memory.
- Correct types for `import` *and* `require`, checked on the packed tarball in CI (publint and Are the
  Types Wrong).
- React Flow's type names — `OnNodesChange`, `OnConnect`, `ReactFlowProps`, `ReactFlowInstance`… — so a
  migration's first compile error is not an import. Types only, derived from the props they describe, and
  checked against React Flow's own where the shapes agree.
- A real-browser suite in CI (Playwright, against the demo): framing, measured handle anchors, wheel
  zoom about the pointer, pan, node drag, a flick, connecting, deleting.
- A [migration guide](docs/migrating-from-react-flow.md) with every default read from React Flow's source —
  the part a compiler does not find. (A codemod is only worth writing if people ask for one.)
- Two examples that build against the packed library in CI: layouts (`d3-hierarchy`, `dagre`, `elkjs`
  behind one signature) and a controlled editor.
- `0.4.0`, published from CI by tag with a provenance attestation and no stored token (after `0.4.0-rc.1`
  on `next`); the demo live on GitHub Pages.
- A release pipeline in the repository — a tag publishes to npm from CI with no stored token and a
  provenance attestation — a changelog, and a demo built for GitHub Pages. (Each needs a one-time switch on
  GitHub or npm; [CONTRIBUTING.md](CONTRIBUTING.md#releasing) lists them.)
- Contribution, conduct and security policies; issue and pull-request templates.

## Now — be easy to try and to trust

- **More examples.** `examples/` has a layout viewer and a controlled editor; wanted next: a tree with
  collapsible subtrees, a graph that loads and saves JSON, and one inside a Next.js app (the server-render
  story, shown rather than claimed).
- **More in the browser suite.** `e2e/smoke.spec.ts` covers load, anchors, wheel, pan, drag, a flick and a
  connection; still by hand: multi-touch pinch, a reconnect, the box selection, and each opt-out
  (`nodrag`, `nopan`, `nowheel`) from a real press.

## Next — 100% Free React Flow Parity & Pro Feature Equivalence

Ordered by how often it comes up, from the audit (`node scripts/audit-react-flow.mjs`: 158 of 211 exports, 83
of 119 canvas props):

1. **Phase 1: High-Frequency Core Parity**
   - **`nodeOrigin`** and `node.origin` — origin-aware bounding boxes, node rendering transform, handle anchors, subflows.
   - **Key-code props** — `selectionKeyCode`, `multiSelectionKeyCode`, `panActivationKeyCode`, `zoomActivationKeyCode`, `panOnScrollMode`.
   - **Thresholds & Radii** — `nodeDragThreshold`, `connectionDragThreshold`, `nodeClickDistance`, `paneClickDistance`, `connectionRadius`, `reconnectRadius`.
   - **Components & Paths** — `SimpleBezierEdge`, `getSimpleBezierPath`, `EdgeText`, `EdgeToolbar`, `NodeResizeControl`.
   - **Instance & Types** — `viewportInitialized` getter on the stable instance; export the remaining 44 types.
2. **Phase 2: Complete Free Parity & Middleware**
   - **Click-to-connect** — `connectOnClick`, `onClickConnectStart`, `onClickConnectEnd`.
   - **Selection drag events** — `onSelectionDragStart`, `onSelectionDrag`, `onSelectionDragStop`, `onSelectionContextMenu`, `selectNodesOnDrag`.
   - **`colorMode`** (`light` | `dark` | `system`), `elevateNodesOnSelect`, `elevateEdgesOnSelect`, `zIndexMode`.
   - **Change Middlewares** — `experimental_useOnNodesChangeMiddleware`, `experimental_useOnEdgesChangeMiddleware`.
   - **Audit target** — 211 of 211 exports, 0 missing props.
3. **Phase 3: Zero-Cost "Pro" Utility Modules**
   - Packaged as tree-shakeable headless hooks and subpath exports without adding a byte to the core canvas:
   - `flowinger/history` (`useUndoRedo`) — temporal state management with keyboard shortcuts.
   - `flowinger/clipboard` (`useClipboard`) — copy, cut, paste, duplicate with ID remapping.
   - `flowinger/snaplines` (`useSnapLines`) — magnetic alignment guides and snap lines.
   - `flowinger/export` (`exportCanvasToSvg`, `exportCanvasToPng`) — high-DPI full diagram export.
4. **Phase 4: Pro Edges, Shapes & Tree Controls**
   - `flowinger/smart-edges` — collision-avoiding A* orthogonal routing.
   - `flowinger/editable-edge` — draggable waypoints.
   - `flowinger/shapes` — SVG flowchart nodes (Decision, Cylinder, Hexagon, Circle).
   - `flowinger/tree` (`useCollapsibleTree`) — collapsible hierarchy branches.
5. **Phase 5: Production-Ready Pro Recipes & Examples**
   - Dynamic layouts with animated transitions (`d3-hierarchy`, `dagre`, `elkjs`, `d3-force`).
   - Dynamic grouping, drag-to-group, auto-resizing parent containers and swimlanes.
   - Real-time multiplayer canvas with live cursors and Yjs state synchronization.
   - Workflow simulation pipeline stepper with animated pulse state.

## Later

- **A docs site.** The reference lives in [`docs/`](docs/README.md) as Markdown, which GitHub renders; when
  that stops being findable — search, a sidebar, versions — it becomes a site (a static site generator,
  deployed beside the demo). Not before there is more than one reader's worth of questions.
- **Published benchmarks** against React Flow at 1k, 5k and 10k nodes, reproducible from the repository —
  `onlyRenderVisibleElements` exists; the claim that it is enough should be a chart.
- **An accessibility pass** with a screen reader and the keyboard alone, written up honestly. The canvas is
  opt-in tab stops and ARIA fields today; "good" is not yet measured.
- **Real touch devices.** Multi-touch pinch is unit-tested in its maths and handling but has not been seen
  on a phone. If you have one and a spare ten minutes, that is a wanted bug report.
- **Mutation testing in CI.** Every guard in the project has been broken by hand and watched to fail; that
  is a job for a tool.

## Architecture Boundaries (Keeping Core Lean)

- **Layout engines and heavy dependencies are NOT bundled into the core package.** They live in `examples/` recipes or standalone subpaths so a lean canvas user pays 0 bytes.
- **Editor chrome & temporal state are headless opt-ins.** The canvas stays a pure rendering surface.
- **Other frameworks.** The engine is React-shaped throughout.

## Where help is most useful

1. Swap it into something real and report what was missing or different — a minimal repro, and what React
   Flow does with the same input.
2. Layout recipes and examples (see *Now*) — no knowledge of the engine needed.
3. A look at it on a phone, in Safari, with a screen reader.

[CONTRIBUTING.md](CONTRIBUTING.md) says how.
