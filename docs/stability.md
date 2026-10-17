# What 2.0 promises

Flowinger follows [semantic versioning](https://semver.org), as it has since `1.0.0`: a change that breaks anything
on this page waits for `3.0`, and a minor or patch release only adds or fixes. [Upgrading](upgrading.md) says what
2.0 and 1.0 changed, and the [changelog](../CHANGELOG.md) lists every release. 1.x gets fixes for security problems,
crashes and regressions for six months after `2.0.0`, published to npm's `v1` tag.

## Covered

- **Everything exported** from `flowinger` and its subpaths — `flowinger/history`, `/clipboard`, `/snaplines`,
  `/export`, `/smart-edges`, `/editable-edge`, `/shapes`, `/tree` and `/pro`: the components and their props, the
  instance (`useReactFlow()`), the hooks, the helpers (`applyNodeChanges`, the path functions, `getNodesBounds`…),
  the built-in features (`dragFeature`, `edgePathsFeature`, `allFeatures`…), `reactFlowDefaults`,
  `reactFlow12Defaults`, `NodeChangeset` and `EdgeChangeset`, and the types. Except what is under *Not covered*
  below.
- **`useStore` and `useStoreApi`**, and the ten fields of the state they read (`FlowingerState`): `panZoom`,
  `isReady`, `nodes`, `edges`, `transform`, `width`, `height`, `minZoom`, `maxZoom`, `nodesInitialized`. And React
  Flow 13's store hooks (`useNodesStore`, `useViewportStore`…) with the fields their types name.
- **The defaults.** `<FlowingerCanvas>` and `<FlowingerCore>` have flowinger's (interaction off until asked for —
  see the [API reference](api.md)); `<ReactFlow>` has React Flow 13's (`reactFlowDefaults`, and the three that are
  not props). Changing a default is a breaking change. So is what a margin means: a number is pixels.
- **What stylesheets and tests select on:** the `react-flow__*` class names on the engine's elements; the test ids
  `rf__wrapper`, `rf__node-<id>`, `rf__edge-<id>`, `rf__background`, `rf__controls` and `rf__minimap`; the
  viewport's `translate(Xpx, Ypx) scale(Z)` transform; and the `--flowinger-*` CSS variables of the
  [theme](theming.md).
- **Where it runs:** React 18 and 19; `import`, and `require` where Node loads ES modules with it (20.19+, 22.12+),
  with one set of types; server rendering and hydration ([server rendering](server-rendering.md)).

## Not covered

- **Writing your own feature.** `Feature`, `EngineContext`, `CanvasArgs`, `CanvasBits`, `NodeArgs`, `NodeBits`,
  `EdgeArgs`, `EdgeBits`, `LabelBoxProps` and `EdgeAdornmentProps` are tagged `@experimental`: they reach into the
  store, which is still changing as it gets faster, so they may change in a minor release. The changelog will say
  when they do. [Features](features.md) says how to write one.
- **`experimental_useOnNodesChangeMiddleware` and `experimental_useOnEdgesChangeMiddleware`**, as in React Flow.
- **Anything not exported** — the files under `src/`, and the store object a feature is handed.
- **The text of development warnings**, the elements inside a node or an edge beyond the class names and test ids
  above, and exact pixels: a fix to where an edge meets a handle may move it by one.
- **Size.** The budgets (21 kB gzipped for the core, 39 for the whole canvas) are checks in CI, not a promise; a
  release that grows either says so in the changelog.
- **Bugs.** Fixing one is a patch, even when something relied on it; a fix that is likely to be noticed says so in
  the changelog.

## React Flow's API

Flowinger follows React Flow 13's API ([coverage](react-flow-coverage.md)): all of 13.0.0-next.0's names, and every
name of 12's it dropped as well. When a later React Flow adds a name, Flowinger may add it in a minor release; when
it changes a default or a behaviour, `<ReactFlow>` follows only in a major one. A weekly job checks flowinger
against React Flow's next release, so a change there is seen when it lands.

## How something covered changes

Before a major release changes or removes something on this page, the minor release before it says so in
development — a warning, once a page, naming what to do — and in the changelog, the way 0.9 did for 1.0 and 1.1 for
2.0. Releases go to npm from CI, with a provenance attestation: `latest` is the current release, `next` a release
candidate, `v1` the last of 1.x.
