# Plan: Flowinger 1.0

The next major version is `1.0.0`. While the version is `0.x` a minor release may break the API, and the
[roadmap](ROADMAP.md) already holds back one change — moving rarely used instance methods behind features —
until "a `1.0` that can say so". This page is the plan for that release: what it promises, what it breaks, what
has to be seen working before it goes out, and in what order.

## Where it stands (2026-10-14)

- `0.7.0` on npm. Every React Flow 12.11.6 export and prop is named and does something (302 of 302 members);
  over 1,000 unit tests, a browser suite, benchmarks, size budgets (core 19.7 kB, whole canvas 35.5 kB), eight
  pro modules as subpaths (and `flowinger/pro` for all of them), nine examples built against the packed library
  in CI.
- About 1,250 downloads in the last 30 days, no stars, no issues from outside. One known consumer: QueryLens,
  which imports the React Flow names (`ReactFlow`, `useReactFlow`…).

So 1.0 is not a feature release. It is a **contract**: the point after which a breaking change costs a major
version. That has two consequences for the plan. Anything worth breaking should break now, while one consumer
has to follow. And 1.0 should wait for the proof that has only been done by hand or not at all — touch, a screen
reader, browsers other than Chromium.

## What 1.0 promises

Covered by semantic versioning from `1.0.0` — a change that breaks any of this waits for `2.0`:

- Everything exported from `flowinger` and its subpaths (`history`, `clipboard`, `snaplines`, `export`,
  `smart-edges`, `editable-edge`, `shapes`, `tree` and `pro`), except what is listed below: the components and
  their props, the instance, the hooks, the helpers and the types.
- The defaults in the [migration guide](docs/migrating-from-react-flow.md)'s tables, as they stand at 1.0.
- What stylesheets and tests select on: the `react-flow__*` class names, the viewport's
  `translate(Xpx, Ypx) scale(Z)` string, and the `--flowinger-*` CSS variables.
- React 18 and 19, `import` and `require`, server rendering and hydration.

Not covered, and said so in the docs and in each doc comment:

- **The feature API** — `Feature`, `EngineContext`, `FlowingerStore`, `FlowingerState` and the `CanvasArgs` /
  `NodeArgs` family. It is the store's internals, and it is still moving (`EngineContext.takeDirtyNodes()` arrived
  in 0.7.0). Tagged `@experimental`: it may change in a minor release, and the changelog will say so. Using the
  built-in features (`dragFeature`, `allFeatures`…) is covered; writing your own is not, yet.
- `experimental_useOnNodesChangeMiddleware` and `experimental_useOnEdgesChangeMiddleware`, as in React Flow.
- The text of development warnings, the DOM inside a node beyond its class names, and exact pixels.
- The size budgets are CI gates, not a promise; a release that grows the core says so in the changelog.

## Decisions to make first

Each changes what 1.0 breaks, so they come before any code. A recommendation is given for each.

### D1. Defaults: whose are they? *(the one that matters)*

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

**Recommended: C.** The name says which behaviour you get: code moving from React Flow keeps its behaviour by
changing an import, and a viewer written against `FlowingerCanvas` is untouched. It is a few hundred bytes, in
the whole-canvas entry only. Under it, a `reactFlowDefaults` object — the props `ReactFlow` applies, exported,
so `<FlowingerCanvas {...reactFlowDefaults}>` and `<FlowingerCore {...reactFlowDefaults}>` can have them too.
`Controls` reads which canvas it is in from the store, so its lock follows the same rule (this settles the
roadmap's *`Controls`' lock default*).

If C is too clever, A plus the exported `reactFlowDefaults` is the non-breaking fallback.

### D2. The instance's rarely used methods move behind features (`FlowingerCore` only)

The roadmap's size item: the core is the store (37%), the canvas (19%) and the edges (13%), and what is left to
take out is the instance API itself. `editingFeature` already holds `setNodes`, `updateNodeData` and the rest.

**Recommended: do it, by measurement.** For each method a viewer seldom calls (candidates: `fitBounds`,
`getNodesBounds`, `toObject`, `getInternalNode`, `flowToScreenPosition`, `getNodeConnections`…), measure what it
costs the lean entry the way `pnpm size:features` measures a feature, and move it only if it saves at least
0.1 kB gzip. `FlowingerCanvas` and `ReactFlow` have every feature, so they lose nothing; only a `FlowingerCore`
that calls a moved method breaks, and in development the call throws with the feature's name, as a prop without
its feature already warns. The instance type stays whole, so this is a run-time break, not a compile-time one
— the upgrade guide lists each moved method.

### D3. Remove the legacy handle-id table

An edge that names a handle no `<Handle>` registered falls back to a table from before handles were measured:
`top`/`in`, `bottom`/`out`, `left`/`prev`, `right`/`next` (`resolveHandlePosition` in `src/FlowingerEdges.tsx`).
React Flow has no such rule, so an edge whose handle id happens to be `in` lands on a different side here.

**Recommended: remove it**, after checking QueryLens's edges do not depend on it, and with a 0.8 development
warning whenever an edge resolves through it.

### D4. The feature API is experimental

**Recommended**, as above under *Not covered*. The alternative — freezing `EngineContext` at 1.0 — would make the
next performance pass (the spatial index, below) a major version.

### Considered and left as they are

- **React 18.** Kept as a peer through 1.x; CI already runs both, and dropping it buys nothing measurable.
- **`typesVersions` and the subpath stub directories** (for TypeScript's `node10` resolution). They cost nothing
  at run time and still serve TypeScript 5 projects.
- **`viewportForBounds` beside `getViewportForBounds`.** They differ on purpose (40 px against React Flow's
  ratio); both stay.
- **`useFlowinger` beside `useReactFlow`**, and the other flowinger/React Flow name pairs. Aliases are free.

## The order of work

### 1. `0.8.0` — the bridge (non-breaking)

Everything 1.0 changes is announced in the code first, so nobody on `0.x` is surprised by `1.0`:

- `reactFlowDefaults`, exported (useful whichever way D1 goes).
- Development warnings, once per page: `<ReactFlow>` rendered with one of the D1 props left out ("in 1.0
  `<ReactFlow>` takes React Flow's defaults — set it, or use `<FlowingerCanvas>`"); an edge resolved through the
  legacy handle table; a `FlowingerCore` calling a method that 1.0 moves behind a feature.
- `@deprecated` on whatever goes; `@experimental` on the feature API.
- `docs/upgrading-to-1.0.md` drafted, and `docs/stability.md` — the contract above — published.

### 2. The breaking changes (`release/1.0` branch, one PR)

D1, D2 and D3 as decided, one commit each, each with its tests and its line in the upgrade guide. The size
budgets are measured again at the end; D2's saving is the number the changelog leads with.

### 3. The proof — what 1.0 has to have been seen doing

These are the gaps the roadmap lists under *Now* and *Later* that a "1.0" is read as having closed:

- **Firefox and WebKit in the browser suite.** `e2e/` runs in Chromium only (`playwright.config.ts`). Add the two
  projects and fix what they find; wheel deltas and pointer capture are where browsers differ.
- **Touch.** A first pass in the iOS Simulator (two-finger pinch, pan and drag on the demo in Safari), then a real
  iPhone and an Android phone. Written up in the browser-coverage notes, failures as issues.
- **A screen reader and the keyboard alone.** VoiceOver on macOS and NVDA on Windows against the demo with
  `elementsSelectable` and `keyboardNavigation` on — and, after D1, against `<ReactFlow>`'s defaults. Written up
  honestly in `docs/accessibility.md`: what works, what does not, what is planned.
- **A real consumer on the candidate.** QueryLens moves to `1.0.0-rc.1` and runs on it for a week.
- **The registry checks** from the 0.4.0 release: installed from npm into an empty project, `require` and
  `import`, a server render from each, a strict `nodenext` consumer, `npm audit signatures`.

### 4. Docs for 1.0

- README: the *Status* line, and the claim "migrating means changing an import" made exact by D1.
- The migration guide's default tables say which canvas has which defaults.
- CHANGELOG: drop the `0.x` caveat from the header; the 1.0 entry links the upgrade guide.
- The `0.x` docs stay readable at the `v0.8.0` tag on GitHub. A versioned docs site waits, as the roadmap says,
  until a `1.x` has users on more than one version.

### 5. Release

`1.0.0-rc.1` on the `next` dist-tag through `release.yml`, as `0.4.0-rc.1` was; a second candidate if the week
on QueryLens or the proof finds anything. Then `1.0.0` on `latest`, tagged from `main` after the release PR has
merged (CONTRIBUTING's *Releasing*). Tagging is the owner's.

## Not in 1.0 (additive, so 1.x)

- **A spatial index for culling** (a grid of node ids) and a first render that does not draw every node before
  culling — roadmap *Next* 4. Internal, so a minor release, given D4.
- **Mutation testing in CI.**
- **Connecting by keyboard.**
- **A versioned docs site.**
- New pro modules or props. Breadth after the contract, not before.

## Risks

- **D1's split confuses.** Two canvases that differ only in defaults need one sentence everywhere they are named:
  `ReactFlow` behaves like React Flow, `FlowingerCanvas` is a viewer until you ask for more.
- **D2 breaks at run time, not compile time.** Mitigated by the development error, the upgrade guide's list, and
  the fact that `FlowingerCore` is the opt-in, smaller-bundle path that few will be on.
- **The proof finds a lot.** Then 1.0 waits. A late, true 1.0 is worth more than a quick one that the first phone
  disproves; the roadmap's ordering rule — easy to install and trust first — applies.
- **Nobody outside answers before 1.0.** Likely, at current downloads. The QueryLens week and the registry checks
  are the floor; the GROWTH plan's launch can come after 1.0, when there is a stable version to point at.
