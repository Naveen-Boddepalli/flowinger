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
- `1.1.0` (2026-10-17): the bridge to 2.0 — React Flow 13.0.0-next.0's additions without breaking anything, and a
  development warning for each thing 2.0 changes ([the 2.0 plan](PLAN-2.0.md)).
- `1.2.0` (2026-10-19): connecting two nodes from the keyboard, each step announced — React Flow has no way to.
- `1.2.1` (2026-10-19): 1.2.0 had made a 10,000-node unculled mount 17% slower; found by re-running the
  benchmarks, and fixed.
- `2.0.0` (2026-11-22): follows React Flow 13 (13.0.2) — a number margin is pixels, `<ReactFlow>` has 13's
  defaults, changesets in the types, ES modules only, and the edge paths other than bezier in `edgePathsFeature`.
  Built on `release/2.0` from 2026-10-17, a release candidate (rc.1–rc.5) until React Flow 13.0.0 was out. 1.x keeps
  fixes on the `v1` branch for six months. [The 2.0 plan](PLAN-2.0.md) and
  [Upgrading to 2.0](docs/upgrading.md#upgrading-to-20).
- `2.1.0` (2026-11-22): dragging a node without culling costs what moved — the one row React Flow 13 led, now
  Flowinger's at every size (at 10,000 nodes 44 ms a move against 47; it was 68 against 49).

## Now — be easy to try and to trust

- **More examples.** `examples/` has a layout viewer, a controlled editor, a collapsible tree, a Next.js
  app (laid out and framed on the server, hydrated into an editor), a graph that saves and loads JSON, and
  exporting to PNG, JPEG, WebP or SVG, and the three recipes: grouping and swimlanes, presence with Yjs, and a
  simulation stepper. Wanted next: what an issue asks for.
- **More in the browser suite.** `e2e/` covers load, anchors, wheel, pan, drag, a flick, connecting by
  dragging and by clicking, reconnecting, deleting, export, `nodeOrigin`, the selection rectangle and a box
  held at the pane's edge, stacking by what is on top, `colorMode: 'system'`, the lock, `'smooth'` moves, and
  `nodrag` / `nopan` / `nowheel` from a real press — in Chromium, Firefox and WebKit, locally and in CI (Firefox
  and WebKit are done: they found no bug in the library, and two tests that assumed a browser draws often). Still
  by hand: touch is automated in Chromium (taps, drags, pinches) and was checked on a real phone, and VoiceOver on
  macOS was checked for 1.0.1; NVDA on Windows has not been tried.

## Next

Flowinger *names* every export and prop of React Flow 13.0.2 (220 of 220 exports, 118 of 118 props) and **every
one does something** (301 of 301 members counted by `node scripts/audit-react-flow.mjs`, which counts a name that
compiles and does nothing apart; there are none), and it keeps every name of 12's. What is left is speed, and proof:

1. **Dragging a node without culling** — closed in 2.1.0. It was the one row React Flow 13
   led, 1.3–2× (at 10,000 nodes 49 ms a mouse move against 68); the edge layer drew every edge again on each move.
   It keeps them now, and the drag costs 44 ms against React Flow's 47 at 10,000 nodes, 16 against 18 at 5,000
   ([benchmarks](docs/benchmarks.md)). Both are still heavy at those sizes without culling: what is left of the 44
   is React's work for the nodes, which a canvas that draws everything does.
2. **A spatial index for culling** — done on `main`, for 2.2. With `onlyRenderVisibleElements` on, flowinger leads
   every row: at 10,000 nodes a mount is 53 ms against 511, a pan 2.6 ms a frame against 4.7, a zoom 1.6 against 4.8;
   at 50,000, 104 ms against 2.6 s and a drag 5.1 ms a move against 27. A pass that runs when the view leaves the
   region asked every node and edge (24 ms at 100,000 nodes); it now asks a grid of cells (0.19 ms).
3. **Size.** The core is 21.45 kB against a 22 budget and the whole canvas 40.65 against 41 — the core's raised by
   half a kilobyte for the drag, the canvas's by a kilobyte for the drag and the culling grid, each in the open — so
   the next feature that touches either finds the bytes or raises the budget again. What could still come out of the
   core is the rarely used part of the instance API, behind a feature — a break, so 3.0's.
4. **Touch and screen readers.** Touch is automated in Chromium and was checked on a phone for 1.0.1 and 2.0;
   VoiceOver on macOS for 1.0.1 and keyboard connecting.
5. **`Controls`' lock default.** React Flow shows it by default; here it is off. Revisit once it has been used.

## Later

- **Versioned docs.** The [site](https://naveen-boddepalli.github.io/flowinger/) shows `main`, and the `v1`
  branch under [`/v1/`](https://naveen-boddepalli.github.io/flowinger/v1/); a page per minor release only once a
  `2.x` has users on more than one.
- **A screen reader on Windows.** VoiceOver on macOS has been checked, connecting from the keyboard included
  ([accessibility](docs/accessibility.md)); NVDA and JAWS have not been tried.
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
