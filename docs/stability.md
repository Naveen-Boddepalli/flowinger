# What 1.0 promises

From `1.0.0`, Flowinger follows [semantic versioning](https://semver.org): a change that breaks anything on this
page waits for `2.0`. Until then the version is `0.x`, and a minor release may change the API — each change is
listed under **Changed** in the [changelog](../CHANGELOG.md). This page says now what the contract will be, so you
can see what you are building on before it is in force. [Upgrading to 1.0](upgrading.md) says what changes on the
way there.

## Covered

- **Everything exported** from `flowinger` and its subpaths — `flowinger/history`, `/clipboard`, `/snaplines`,
  `/export`, `/smart-edges`, `/editable-edge`, `/shapes`, `/tree` and `/pro`: the components and their props, the
  instance (`useReactFlow()`), the hooks, the helpers (`applyNodeChanges`, the path functions, `getNodesBounds`…),
  the built-in features (`dragFeature`, `allFeatures`…), `reactFlowDefaults` and the types. Except what is under
  *Not covered* below.
- **`useStore` and `useStoreApi`**, and the ten fields of the state they read (`FlowingerState`): `panZoom`,
  `isReady`, `nodes`, `edges`, `transform`, `width`, `height`, `minZoom`, `maxZoom`, `nodesInitialized`.
- **The defaults.** `<FlowingerCanvas>` and `<FlowingerCore>` have flowinger's (interaction off until asked for —
  see the [API reference](api.md)); from 1.0, `<ReactFlow>` has React Flow's (`reactFlowDefaults`). Changing a
  default is a breaking change.
- **What stylesheets and tests select on:** the `react-flow__*` class names on the engine's elements; the test ids
  `rf__wrapper`, `rf__node-<id>`, `rf__edge-<id>`, `rf__background`, `rf__controls` and `rf__minimap`; the
  viewport's `translate(Xpx, Ypx) scale(Z)` transform; and the `--flowinger-*` CSS variables of the
  [theme](theming.md).
- **Where it runs:** React 18 and 19; `import` and `require`, each with its own types; server rendering and
  hydration ([server rendering](server-rendering.md)).

## Not covered

- **Writing your own feature.** `Feature`, `EngineContext`, `CanvasArgs`, `CanvasBits`, `NodeArgs`, `NodeBits`,
  `EdgeArgs`, `EdgeBits`, `LabelBoxProps` and `EdgeAdornmentProps` are tagged `@experimental`: they reach into the
  store, which is still changing as it gets faster, so they may change in a minor release. The changelog will say
  when they do. [Features](features.md) says how to write one.
- **`experimental_useOnNodesChangeMiddleware` and `experimental_useOnEdgesChangeMiddleware`**, as in React Flow.
- **Anything not exported** — the files under `src/`, and the store object a feature is handed.
- **The text of development warnings**, the elements inside a node or an edge beyond the class names and test ids
  above, and exact pixels: a fix to where an edge meets a handle may move it by one.
- **Size.** The budgets (20 kB gzipped for the core, 36 for the whole canvas) are checks in CI, not a promise; a
  release that grows either says so in the changelog.
- **Bugs.** Fixing one is a patch, even when something relied on it; a fix that is likely to be noticed says so in
  the changelog.

## React Flow's API

Flowinger follows React Flow 12.11.6's API ([coverage](react-flow-coverage.md)). When a later React Flow adds a
name, Flowinger may add it in a minor release; when it changes a default or a behaviour, `<ReactFlow>` follows only
in a major one.

## How something covered changes

Before a major release changes or removes something on this page, the minor release before it says so in
development — a warning, once a page, naming what to do — and in the changelog, the way 0.9 does for 1.0. Releases
go to npm from CI, with a provenance attestation: `latest` is the current release, `next` a release candidate.
