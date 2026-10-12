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
- [Published benchmarks](docs/benchmarks.md) against React Flow at 1,000, 5,000 and 10,000 nodes, culled and
  not, reproducible with `pnpm bench` — and the three scaling bugs they found in Flowinger's own culling.

## Now — be easy to try and to trust

- **More examples.** `examples/` has a layout viewer, a controlled editor and a collapsible tree; wanted next:
  a graph that loads and saves JSON, and one inside a Next.js app (the server-render story, shown rather
  than claimed).
- **More in the browser suite.** `e2e/` covers load, anchors, wheel, pan, drag, a flick, connecting by
  dragging and by clicking, reconnecting, deleting, export, `nodeOrigin`, the selection rectangle and a box
  held at the pane's edge, stacking by what is on top, `colorMode: 'system'`, the lock, `'smooth'` moves, and
  `nodrag` / `nopan` / `nowheel` from a real press. Still by hand: multi-touch pinch, and a screen reader.

## Next

Flowinger *names* every export and prop of React Flow 12.11.6 (211 of 211 exports, 119 of 119 props) and **every
one does something** (302 of 302 members counted by `node scripts/audit-react-flow.mjs`; the audit counts a name
that compiles and does nothing apart, and there are none). What is left is breadth and proof:

1. **Real-browser coverage for what jsdom cannot see** — done for the 0.5.0 behaviour (see *Now*): it found
   one bug jsdom could not (the selection rectangle, a node toolbar for another node and the focus pan used a
   child's position inside its parent, not on the canvas). Left: touch, which needs a device.
2. **The pro modules' recipes.** `flowinger/editable-edge` and the Hexagon shape are in (unreleased). Still to
   write as `examples/`: grouping and swimlanes, multiplayer presence (Yjs), a workflow-simulation stepper.
3. **Size.** The core grew from 17.6 to 18.9 kB and the whole canvas from 27.3 to 33.9 for the 39 props; the
   features are separable, but a `FlowingerCanvas` pays for all of them. A pass that measures each feature and
   removes duplication (three places build "is this key held", several build "the box round some nodes") is
   worth a day.
4. **Close the culled gap.** With `onlyRenderVisibleElements` on, React Flow is 1.3–1.8× cheaper to drag and
   up to 1.7× to zoom ([benchmarks](docs/benchmarks.md)): Flowinger draws a quarter-view margin (40% more
   nodes), finds the visible set by scanning every node, rebuilds parent structure in three places per drag
   move, and its first render draws every node before culling. Wanted: one shared structure, a visible set
   found incrementally or from a spatial index, and a first render that does not draw what it will remove.
5. **`Controls`' lock default.** React Flow shows it by default; here it is off. Revisit once it has been used.

## Later

- **A docs site.** The reference lives in [`docs/`](docs/README.md) as Markdown, which GitHub renders; when
  that stops being findable — search, a sidebar, versions — it becomes a site (a static site generator,
  deployed beside the demo). Not before there is more than one reader's worth of questions.
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
