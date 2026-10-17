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
- `0.4.0` (2026-10-11), published from CI by tag with a provenance attestation and no stored token (after `0.4.0-rc.1`
  on `next`); the demo live on GitHub Pages.
- A release pipeline in the repository — a tag publishes to npm from CI with no stored token and a
  provenance attestation — a changelog, and a demo built for GitHub Pages. (Each needs a one-time switch on
  GitHub or npm; [CONTRIBUTING.md](CONTRIBUTING.md#releasing) lists them.)
- Contribution, conduct and security policies; issue and pull-request templates.
- A [documentation site](https://naveen-boddepalli.github.io/flowinger/) (Astro Starlight) with search, a
  sidebar and a live editor on the home page, generated from `docs/` so the Markdown stays the one copy; the
  demo moved to `/flowinger/demo/`.
- [Published benchmarks](docs/benchmarks.md) against React Flow at 1,000, 5,000 and 10,000 nodes, culled and
  not, reproducible with `pnpm bench` — and the scaling bugs they found in Flowinger's own culling, fixed:
  with culling on, a drag at 10,000 nodes went from 10 ms to 4.3 (React Flow: 4.5).
- `0.5.0` and `0.6.0` (2026-10-13): every React Flow prop does something; the pro modules as entry points;
  editable edges; a collapsible-tree example; benchmarks.
- `0.7.0` (2026-10-14): culled pan and zoom level with or ahead of React Flow; a drag that costs what changed;
  a documentation site and guides; examples for Next.js, export, JSON, swimlanes, Yjs presence and a stepper.
- `0.8.0` (2026-10-15): the first render is culled too — a culled mount at 10,000 nodes in 55 ms (React Flow
  594), and a culled page's server HTML only the nodes near the view.
- `0.9.1` (2026-10-15): the bridge to 1.0 — `reactFlowDefaults`, development warnings where 1.0 will be noticed,
  and [what 1.0 promises](docs/stability.md) and [how to upgrade](docs/upgrading.md). (Tagged as `0.9.0`, whose
  release stopped at the size check before it published.)
- `1.0.0` (2026-10-17): semantic versioning from here ([what it covers](docs/stability.md)); `<ReactFlow>` has
  React Flow's defaults, so switching is an import change; touch in the browser suite, and a pinch on top of a
  node zooms. Shipped without the real-phone and screen-reader passes, which are next under *Now*.
- `1.0.1` (2026-10-17): what those passes found, on a real phone and with VoiceOver — a finger near a handle is on
  it, each keyboard move is announced, Escape lets go of a focused node, and the canvas is an `application` when
  it takes keys. Written up in [Accessibility](docs/accessibility.md).

## Now — be easy to try and to trust

- **More examples.** `examples/` has a layout viewer, a controlled editor, a collapsible tree, a Next.js
  app (laid out and framed on the server, hydrated into an editor), a graph that saves and loads JSON, and
  exporting to PNG, JPEG, WebP or SVG;
  wanted next: the recipes under *Next* (grouping and swimlanes, presence, a simulation stepper).
- **More in the browser suite.** `e2e/` covers load, anchors, wheel, pan, drag, a flick, connecting by
  dragging and by clicking, reconnecting, deleting, export, `nodeOrigin`, the selection rectangle and a box
  held at the pane's edge, stacking by what is on top, `colorMode: 'system'`, the lock, `'smooth'` moves, and
  `nodrag` / `nopan` / `nowheel` from a real press — in Chromium, Firefox and WebKit, locally and in CI (Firefox
  and WebKit are done: they found no bug in the library, and two tests that assumed a browser draws often). Still
  by hand: touch is automated in Chromium (taps, drags, pinches) and was checked on a real phone, and VoiceOver on
  macOS was checked for 1.0.1; NVDA on Windows has not been tried.

## Next

Flowinger *names* every export and prop of React Flow 12.11.6 (211 of 211 exports, 119 of 119 props) and **every
one does something** (302 of 302 members counted by `node scripts/audit-react-flow.mjs`; the audit counts a name
that compiles and does nothing apart, and there are none). What is left is breadth and proof:

1. **Real-browser coverage for what jsdom cannot see** — done for the 0.5.0 behaviour (see *Now*): it found
   one bug jsdom could not (the selection rectangle, a node toolbar for another node and the focus pan used a
   child's position inside its parent, not on the canvas). Left: touch, which needs a device.
2. **The pro modules' recipes — written.** `flowinger/editable-edge` and the Hexagon shape are in (0.6.0), and
   the three recipes are examples: [grouping and swimlanes](examples/swimlanes), [multiplayer presence with
   Yjs](examples/presence) and [a workflow-simulation stepper](examples/stepper).
3. **Size.** The core grew from 17.6 to 19.6 kB and the whole canvas from 27.3 to 35.4 — the 39 props, then
   making a drag cost what changed rather than the size of the graph. The duplication pass is done (one parser
   for key codes, one box round some rectangles) saved 0.13 kB of the whole canvas and nothing of the core,
   because gzip had already folded most of the copies — and the faster culling pass took about that back (35.5 kB). Measured, the core is the store (37%), the canvas (19%) and
   the edges (13%), with no development text left in a production build. What remains is the React Flow
   instance API itself; moving its rarely used methods behind features would save more, and break code that
   calls them — so not before a `1.0` that can say so. [The 1.0 plan](PLAN-1.0.md) says what that release
   promises, breaks and has to be seen doing first.
4. **The culled gap is closed.** With `onlyRenderVisibleElements` on, a pan or zoom that stays inside the
   region last worked out costs nothing, and at 10,000 nodes a pan is 3.2 ms a frame (was 4.4; React Flow
   2.6–4.2 across runs) and a zoom 2.3 (was 5.0; React Flow 4.3–4.5) — [benchmarks](docs/benchmarks.md).
   The first render is culled too (0.8.0): a culled mount at 10,000 nodes is 55 ms against React Flow's
   594. Still possible: a spatial index (a grid of node ids) so the pass that does run, when the view leaves the
   region, asks only the cells it enters.
5. **`Controls`' lock default.** React Flow shows it by default; here it is off. Revisit once it has been used.

## Later

- **Versioned docs.** The [site](https://naveen-boddepalli.github.io/flowinger/) shows `main`; a page per
  release only once a `1.x` has users on more than one version.
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
