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
- Two examples that build against the packed library in CI: layouts (`d3-hierarchy`, `dagre`, `elkjs`
  behind one signature) and a controlled editor.
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
- **A migration guide**, from the "Coming from React Flow" list: what changes, what is missing, what is
  better. A codemod is only worth writing if people ask for one.

## Next — close what blocks switching

Ordered by how often it comes up, from the audit (`node scripts/audit-react-flow.mjs`: 146 of 211 exports, 81
of 119 canvas props):

1. **A controlled `viewport`** with `onViewportChange`.
2. **`nodeOrigin`**, and `sourcePosition` / `targetPosition` on a node.
3. **Key-code props** — `selectionKeyCode`, `multiSelectionKeyCode`, `panActivationKeyCode`,
   `zoomActivationKeyCode` — and the click and drag distance thresholds.
4. **`colorMode`**, `connectOnClick`, `connectionRadius`.
5. **Pass-through HTML attributes** on `Panel`, `MiniMap`, `NodeToolbar`, `Handle` and `BaseEdge`.
6. **The small types still missing** — `DeleteElementsOptions`, `FitBoundsOptions`, `HandleConnection`,
   `UseOnSelectionChangeOptions`, `ControlButtonProps`.

Each lands the way the rest did: a test that fails without it, the oracle (`@xyflow/react`) run on the same
input where behaviour should match, and — if it adds code — in a feature, so a canvas that only shows a graph
does not pay for it.

## Later

- **A docs site.** The README is a good reference and a long one; when it stops being findable, it becomes
  pages (a static site generator, deployed beside the demo). Not before there is more than one reader's
  worth of questions.
- **Published benchmarks** against React Flow at 1k, 5k and 10k nodes, reproducible from the repository —
  `onlyRenderVisibleElements` exists; the claim that it is enough should be a chart.
- **An accessibility pass** with a screen reader and the keyboard alone, written up honestly. The canvas is
  opt-in tab stops and ARIA fields today; "good" is not yet measured.
- **Real touch devices.** Multi-touch pinch is unit-tested in its maths and handling but has not been seen
  on a phone. If you have one and a spare ten minutes, that is a wanted bug report.
- **Mutation testing in CI.** Every guard in the project has been broken by hand and watched to fail; that
  is a job for a tool.

## Deliberately not planned

- **A layout engine in the package.** It would be the largest thing in it and the thing most people already
  have a preference about.
- **Editor chrome** — a node palette, undo/redo, a properties panel. Flowinger is the canvas under those.
- **Keyboard connecting.** React Flow does not offer it either; if there is a good design, it is welcome as
  a proposal.
- **Other frameworks.** The engine is React-shaped throughout.
- **Being a drop-in for everything.** The goal is *the part apps use*, measured, and honest about the rest.

## Where help is most useful

1. Swap it into something real and report what was missing or different — a minimal repro, and what React
   Flow does with the same input.
2. Layout recipes and examples (see *Now*) — no knowledge of the engine needed.
3. A look at it on a phone, in Safari, with a screen reader.

[CONTRIBUTING.md](CONTRIBUTING.md) says how.
