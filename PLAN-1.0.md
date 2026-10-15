# Plan: Flowinger 1.0

The next major version is `1.0.0`. While the version is `0.x` a minor release may break the API, and the
[roadmap](ROADMAP.md) held back one change — moving rarely used instance methods behind features — until "a `1.0`
that can say so". This page is the plan for that release: what it promises, what it breaks, what has to be seen
working before it goes out, and in what order. Each section says what is decided and what is done.

## Where it stands (2026-10-15)

- `0.8.0` on npm (the culled first render). Every React Flow 12.11.6 export and prop is named and does
  something (302 of 302 members); over 1,000 unit tests, a browser suite, benchmarks, size budgets (core
  19.8 kB, whole canvas 35.9 kB), eight pro modules as subpaths (and `flowinger/pro` for all of them), nine
  examples built against the packed library in CI.
- About 1,250 downloads in the last 30 days, no stars, no issues from outside. One known consumer: QueryLens,
  which imports the React Flow names (`ReactFlow`, `useReactFlow`…).

So 1.0 is not a feature release. It is a **contract**: the point after which a breaking change costs a major
version. That has two consequences for the plan. Anything worth breaking should break now, while one consumer
has to follow. And 1.0 should wait for the proof that has only been done by hand or not at all — touch, a screen
reader, browsers other than Chromium (that last one since done: step 3).

## What 1.0 promises

Written up as [docs/stability.md](docs/stability.md). In short — covered by semantic versioning from `1.0.0` — a change that breaks any of this waits for `2.0`:

- Everything exported from `flowinger` and its subpaths (`history`, `clipboard`, `snaplines`, `export`,
  `smart-edges`, `editable-edge`, `shapes`, `tree` and `pro`), except what is listed below: the components and
  their props, the instance, the hooks, the helpers and the types.
- `useStore` / `useStoreApi` and the ten fields of `FlowingerState` they read — React Flow's store shape, which
  migrating code selects from.
- The defaults: flowinger's on `FlowingerCanvas` and `FlowingerCore`, React Flow's on `ReactFlow` (D1).
- What stylesheets and tests select on: the `react-flow__*` class names, the viewport's
  `translate(Xpx, Ypx) scale(Z)` string, and the `--flowinger-*` CSS variables.
- React 18 and 19, `import` and `require`, server rendering and hydration.

Not covered, and said so in the docs and in each doc comment:

- **The feature API** — `Feature`, `EngineContext` and the `CanvasArgs` / `NodeArgs` / `EdgeArgs` family. It is
  the store's internals, and it is still moving (`EngineContext.takeDirtyNodes()` arrived in 0.7.0,
  `Feature.firstVisible` in 0.8.0). Tagged `@experimental`: it may change in a minor release, and the changelog
  will say so. Using the built-in features (`dragFeature`, `allFeatures`…) is covered; writing your own is not,
  yet. (`FlowingerState` was on this list in the first draft; it is what `useStore` reads, so it is covered.)
- `experimental_useOnNodesChangeMiddleware` and `experimental_useOnEdgesChangeMiddleware`, as in React Flow.
- The text of development warnings, the DOM inside a node beyond its class names, and exact pixels.
- The size budgets are CI gates, not a promise; a release that grows the core says so in the changelog.

## Decisions

Each changes what 1.0 breaks, so they came before any code.

### D1. Defaults: whose are they? — **decided: C** (2026-10-15)

Flowinger leaves interaction off until asked (`nodesDraggable`, `nodesConnectable`, `elementsSelectable`), and
differs from React Flow on `minZoom` (0.05, not 0.5), the `fitView` margin (40 px, not a 0.1 ratio),
`multiSelectionKeyCode`, `panActivationKeyCode`, `Controls`' lock, `interpolate`, and the ARIA attributes on the
canvas. The migration guide calls this "the one that bites", and it is why "migrating means changing an
import" is not quite true.

| Option | What changes | Who it breaks |
|---|---|---|
| A. Keep flowinger's everywhere (today) | Nothing | Nobody; the migration guide stays the fix |
| B. React Flow's everywhere | Every default in the table | Every viewer that relied on "off by default" |
| **C. Split by name** | `ReactFlow` takes React Flow's defaults; `FlowingerCanvas` keeps flowinger's | Code that renders `<ReactFlow>` and relied on flowinger's defaults (QueryLens: set the props, or import `FlowingerCanvas`) |

**C.** The name says which behaviour you get: code moving from React Flow keeps its behaviour by changing an
import, and a viewer written against `FlowingerCanvas` is untouched. It is a few hundred bytes, in the
whole-canvas entry only. Under it, `reactFlowDefaults` — the props `ReactFlow` applies, exported (in 0.9), so
`<FlowingerCanvas {...reactFlowDefaults}>` has them too; on a `FlowingerCore` each needs its feature.

Read from React Flow's source rather than the migration guide, the props that differ are twelve: the three
interaction switches, `nodesFocusable`, `minZoom`, `nodeDragThreshold` (1 px, not 3), `paneClickDistance` and
`nodeClickDistance`, the three key codes, and `fitViewOptions.padding`. The guide had missed four of them. Three
defaults are not props, and `ReactFlow` sets them in 1.0 by telling the store: the margin of a fit that names
none (instance and `Controls`), `interpolate: 'smooth'` for animated moves, and `Controls`' lock shown (which
settles the roadmap's *`Controls`' lock default*). Left out of D1: colours, which follow the `--flowinger-*`
theme, and the canvas's ARIA attributes, which the accessibility pass decides.

### D2. The instance's rarely used methods move behind features — **measured: nothing moves**

The roadmap's size item: the core is the store (37%), the canvas (19%) and the edges (13%), and what is left to
take out is the instance API itself. `editingFeature` already holds `setNodes`, `updateNodeData` and the rest.

The rule was: measure what each method a viewer seldom calls costs the lean entry, and move it only if it saves
at least 0.1 kB gzip. Measured on 2026-10-15 by building the lean entry with each method lent to a feature the
way `editingFeature` lends `setNodes` (`lend()` in the store):

| Method | Saves | Method | Saves |
|---|---|---|---|
| `screenToFlowPosition` | 0.065 kB | `zoomTo` | 0.012 kB |
| `setCenter` | 0.054 kB | `toObject` | 0.011 kB |
| `flowToScreenPosition` | 0.022 kB | `getNodesBounds` | 0.006 kB |
| `getNode`, `getEdge`, `getInternalNode`, `getZoom`, `fitBounds` | 0 or less | **all eleven** | **0.235 kB** |

None reaches the bar, and all of them together are 1.2% of the 19.8 kB core: what they use, the store needs
anyway. So the instance stays whole on every canvas, and 1.0 breaks nothing here. The roadmap's guess that the
instance API was what remained to take out of the core was wrong; what is left is the store itself.

### D3. Remove the legacy handle-id table

An edge that names a handle no `<Handle>` registered falls back to a table from before handles were measured:
`top`/`in`, `bottom`/`out`, `left`/`prev`, `right`/`next` (`resolveHandlePosition` in `src/FlowingerEdges.tsx`).
React Flow has no such rule, so an edge whose handle id happens to be `in` lands on a different side here.

**Remove it** — with a 0.9 development warning, once a page, when an edge is drawn by it (done). QueryLens was
checked: its `FlowTree` registers real `<Handle>`s called `in`, `prev`, `out` and `next`, on exactly the sides the
table guesses — the table came from it — so after mount the table is not used there. Before mount it is: on the
server and in the first paint, an edge to a handle called `out` meets the bottom because of the name. In 1.0 it
meets the fallback side until the handle registers, unless the node lists its handles in `handles`. The warning
only fires once a node has mounted (`store.hasNodeElement`), so that case is not mistaken for the other; the
upgrade guide says it.

### D4. The feature API is experimental — **done in 0.9**

As above under *Not covered*. The alternative — freezing `EngineContext` at 1.0 — would make the
next performance pass (the spatial index, below) a major version.

### Considered and left as they are

- **React 18.** Kept as a peer through 1.x; CI already runs both, and dropping it buys nothing measurable.
- **`typesVersions` and the subpath stub directories** (for TypeScript's `node10` resolution). They cost nothing
  at run time and still serve TypeScript 5 projects.
- **`viewportForBounds` beside `getViewportForBounds`.** They differ on purpose (40 px against React Flow's
  ratio); both stay.
- **`useFlowinger` beside `useReactFlow`**, and the other flowinger/React Flow name pairs. Aliases are free.

## The order of work

### 1. `0.9.0` — the bridge (non-breaking) — **done** (versioned 2026-10-15)

(`0.8.0` went to the culled first render, so the bridge is `0.9.0`.) Everything 1.0 changes is announced in the
code first, so nobody on `0.x` is surprised by `1.0`:

- `reactFlowDefaults`, exported, with a test that reads each value from React Flow's source.
- Development warnings, once a page: a `<ReactFlow>` that leaves out any of `reactFlowDefaults`' props, naming
  each with today's value and 1.0's (`nodesDraggable (false → true)`); an edge drawn by the legacy handle table,
  naming the side 1.0 gives it and the `<Handle>` to add. (No warning for D2, which moves nothing.)
- `@experimental` on the feature API. Nothing exported is removed, so nothing is `@deprecated`.
- [docs/upgrading.md](docs/upgrading.md) and [docs/stability.md](docs/stability.md), on the site under
  *Reference*; the migration guide's defaults section leads with `reactFlowDefaults`.

### 2. The breaking changes (`release/1.0` branch, one PR) — **done on the branch** (2026-10-15)

D1 and D3, one commit each, each with its tests and its line in the upgrade guide: `ReactFlow` spreads
`reactFlowDefaults` under its props (merging `fitViewOptions`) and tells the store its three non-prop defaults;
`resolveHandlePosition` and its warning go. Done: D1 sets the three non-prop defaults through a context the
canvas and `Controls` read (`ViewDefaultsContext`), and D3 took the store's `hasNodeElement` with it. After both
the whole canvas is 36.19 kB and the core 19.77 (D1 added 0.32 and 0.07; D3 took back 0.10 and 0.15). The size
budgets were measured again at the end: after the bridge the
whole canvas is 35.97 kB, and its budget was raised to 37 kB after 0.9.0's release stopped on it (CI's Linux build
measured over 36), so D1 fits unless it adds more than about a kilobyte; the changelog says why either way.

### 3. The proof — what 1.0 has to have been seen doing

These are the gaps the roadmap lists under *Now* and *Later* that a "1.0" is read as having closed:

- **Firefox and WebKit in the browser suite — done.** `playwright.config.ts` has a project for each beside
  Chromium, and CI and `release.yml` run all three. They found no bug in the library. On a Mac the 29 tests passed in
  both on their first run, and run five times in all three browsers (435 tests) none failed or was flaky. On CI's
  Linux runner WebKit draws a frame or two in 600 ms, which two tests had not allowed for: a box held at the edge
  is now waited on until the view moves, and a `'smooth'` move is stepped on a paused clock. Playwright's wheel is
  in pixels in every browser, so Firefox's wheel in lines stays a jsdom test; Firefox's mouse is pointer 0, which
  the library only ever compares. One thing to undo: on macOS 27 Playwright 1.64's Firefox will not start on a
  Mac with Firefox installed (microsoft/playwright#42768), so the config gives it a home of its own there, to
  drop with Playwright 1.65.
- **Touch — automated in Chromium; real phones to do.** `e2e/touch.spec.ts` sends real touch through Chromium's
  DevTools protocol (tap, a finger dragging a node or panning, two fingers zooming in and out, and a pinch that
  starts on a node). It found one bug, fixed: a pinch on top of a node did nothing, since the fingers were counted
  only on the bare pane. Still by hand: Safari on an iPhone and Chrome on Android (the iOS Simulator needs a full
  Xcode, not installed here). Also seen: at a phone's width the demo's options panel covers the graph.
- **A screen reader and the keyboard alone.** VoiceOver on macOS and NVDA on Windows against the demo with
  `elementsSelectable` and `keyboardNavigation` on — and, after D1, against `<ReactFlow>`'s defaults. Written up
  honestly in `docs/accessibility.md`: what works, what does not, what is planned. It also decides whether
  `<ReactFlow>` adds React Flow's `role="application"` and live region, which D1 left out.
- **A real consumer on the candidate.** QueryLens moves to `1.0.0-rc.1` and runs on it for a week.
- **The registry checks** from the 0.4.0 release: installed from npm into an empty project, `require` and
  `import`, a server render from each, a strict `nodenext` consumer, `npm audit signatures`.

### 4. Docs for 1.0

- README: the *Status* line, and the claim "migrating means changing an import" made exact by D1.
- The migration guide and the upgrade guide say "from 1.0" in the present tense.
- CHANGELOG: drop the `0.x` caveat from the header; the 1.0 entry links the upgrade guide.
- The `0.x` docs stay readable at the `v0.9.0` tag on GitHub. A versioned docs site waits, as the roadmap says,
  until a `1.x` has users on more than one version.

### 5. Release

`1.0.0-rc.1` on the `next` dist-tag through `release.yml`, as `0.4.0-rc.1` was — **versioned on `release/1.0`**
(2026-10-15), tagged from the branch, since a candidate does not merge; a second candidate if the week
on QueryLens or the proof finds anything. Then `1.0.0` on `latest`, tagged from `main` after the release PR has
merged (CONTRIBUTING's *Releasing*). Tagging is the owner's.

## Not in 1.0 (additive, so 1.x)

- **A spatial index for culling** (a grid of node ids) — roadmap *Next* 4 (the culled first render shipped in
  0.8.0). Internal, so a minor release, given D4.
- **Mutation testing in CI.**
- **Connecting by keyboard.**
- **A versioned docs site.**
- New pro modules or props. Breadth after the contract, not before.

## Risks

- **D1's split confuses.** Two canvases that differ only in defaults need one sentence everywhere they are named:
  `ReactFlow` behaves like React Flow, `FlowingerCanvas` is a viewer until you ask for more.
- **The proof finds a lot.** Then 1.0 waits. A late, true 1.0 is worth more than a quick one that the first phone
  disproves; the roadmap's ordering rule — easy to install and trust first — applies.
- **Nobody outside answers before 1.0.** Likely, at current downloads. The QueryLens week and the registry checks
  are the floor; the GROWTH plan's launch can come after 1.0, when there is a stable version to point at.
