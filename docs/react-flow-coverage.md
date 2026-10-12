# How much of React Flow this covers

[← Documentation](README.md) · Measured, not recalled: [`scripts/audit-react-flow.mjs`](../scripts/audit-react-flow.mjs) reads React Flow's own type declarations. For what to *do* about the gaps, see [Migrating from React Flow](migrating-from-react-flow.md).

Flowinger keeps React Flow's shape and names — `ReactFlow`, `ReactFlowProvider`, `useReactFlow`, `useStore`,
`Handle`, `Position`, `Background`, `MarkerType`, `useNodesState`, `applyNodeChanges`, `addEdge`, the `Node` /
`Edge` / `NodeProps` types — and the `react-flow__*` class names on the elements it draws. It began as the part of the
API an app like [QueryLens](https://github.com/Naveen-Boddepalli/QueryLens) uses (which it replaced, with identical
geometry and its whole end-to-end suite passing), and has since grown to name all of the rest.

**Naming something is not the same as doing it**, and this page counts the two apart.

## The numbers

Measured against `@xyflow/react` 12.11.6's own type declarations
(`node scripts/audit-react-flow.mjs <path to its dist/esm/index.d.ts>`, after `pnpm build`):

| | React Flow has | Flowinger **names** | …and **does** |
|---|---|---|---|
| Exports (components, hooks, functions, types) | 211 | **211** | — |
| `ReactFlow` props | 119 | **119** | **119** |
| Instance (`useReactFlow()`) | 32 | **32** | 32 |
| `Node`, `Edge`, `NodeProps`, `EdgeProps` fields | 22 / 20 / 13 / 20 | **all** | all |
| `Handle`, `Background`, `BaseEdge` props | 6 / 6 / 9 | **all** | all |
| `MiniMap`, `Controls`, `NodeResizer`, `NodeToolbar` props | 18 / 9 / 16 / 4 | **all** | all |
| `fitView` options | 8 | **8** | 8 |
| **All members counted** | 302 | **302** | **302** |

A name that compiles and does nothing is worse than a missing one — it fails silently, in production, in someone
else's app — so the audit counts the two apart: a member whose doc comment says `@unimplemented` is *named*, not
*done*, and a canvas given one says so in development. **None are, now.** The mechanism stays as a ratchet: a
test keeps the tags and the warning table the same list, so a name added before it works is a visible exception
and not a quiet one.

"Does" is *a feature behind the name*, not *identical to React Flow*: counts are not weights, and the places the
behaviour differs on purpose are listed below and in [Migrating from React Flow](migrating-from-react-flow.md).

## Accepted, not implemented

Nothing is. (`proOptions` and `attributionPosition` are accepted and do nothing *by design*: there is no
attribution to hide, so the end state they ask for is the one you have.)

Most of what did nothing in the first measurement is a *feature* — a prop that needs the feature that acts on it
says which, once, in development ([Features](features.md)). New ones: `a11yFeature`, `stackingFeature`,
`colorModeFeature`, `selectionRectFeature`, `zoomKeyFeature`, `smoothFeature` and `debugFeature`, all in
`FlowingerCanvas`.

## Differences on purpose

- **`ReactFlowProps` and `ReactFlowInstance` are not generic.** The canvas and the instance are not, so
  `ReactFlowInstance<MyNode>` is an error rather than a type argument quietly ignored.
- **`onConnectEnd` is given a `ConnectEndState`** (`{ connection, isValid }`), not `FinalConnectionState`.
  The type is exported under React Flow's name, but is not what the callback receives, so a handler annotated
  with it is a compile error rather than a quietly wrong shape.
- **`useReactFlow()` returns one object for the life of the provider.** `viewportInitialized` on it is a live
  getter, so it is current when you read it — but, as the object never changes, flipping it does not re-render
  you. Use `onInit` or `useNodesInitialized()` to react to it.
- **`useStore` reads ten fields**, not React Flow's whole internal store, and `useStoreApi()` has `getState`
  and `subscribe` but no `setState`.
- **`Panel`, `NodeToolbar`, `MiniMap`, `Handle` and `BaseEdge` take their element's attributes** — `id`,
  `title`, `role`, `aria-*`, `tabIndex`, `data-*` — but not its event handlers, which the canvas's own pointer
  and keyboard handling would lose to; a handle's `id` stays its handle id, and on `BaseEdge` they land on the
  path. The engine's own classes, positioning and handlers win over yours.
- **Where a prop's default is not React Flow's, on purpose:** `multiSelectionKeyCode` left out lets Shift add to a
  selection as well as Control and ⌘; `zoomActivationKeyCode` left out leaves `zoomOnScroll` off meaning no zoom;
  `interpolate` is `'linear'` (React Flow's is `'smooth'`; `smoothFeature` has it when asked); `Controls`'
  `showInteractive` is off (React Flow's is on); `colorMode` left out adds no class and keeps the library's
  palette, and `colorMode` only reaches what is drawn inside the canvas (a `MiniMap` or `Controls` outside it
  takes the `--flowinger-*` variables from an ancestor as before).
- **Defaults differ, and that is the part a compiler will not find:** nodes are not draggable, connectable or
  selectable until you say so (`nodesDraggable`, `nodesConnectable`, `elementsSelectable` — React Flow's are
  on), `minZoom` is `0.05` (React Flow's `0.5`), `fitView` keeps a 40 px margin unless you pass a `padding`
  ratio (React Flow's is `0.1`), and `panActivationKeyCode` is off unless given (React Flow's is `'Space'`) and
  needs `panKeyFeature`, which `FlowingerCanvas` has. Nodes and edges do not get React Flow's `role`,
  `aria-roledescription` or live region.

[**docs/migrating-from-react-flow.md**](migrating-from-react-flow.md) is the checklist, with each default
read from React Flow's source.

## Beyond React Flow

Flowinger has 52 exports React Flow does not — the [feature objects](features.md) (`dragFeature`,
`panKeyFeature`…) and what they need — and the [pro modules](pro.md): undo/redo, copy and paste, snap guides,
export, smart routing, flowchart shapes and a collapsible tree. Those are in separate entry points
(`flowinger/history`, `flowinger/clipboard`…) and add **nothing** to the core's size unless imported.
