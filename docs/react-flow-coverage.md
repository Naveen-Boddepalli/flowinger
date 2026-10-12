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
| `ReactFlow` props | 119 | **119** | **86** |
| Instance (`useReactFlow()`) | 32 | **32** | 32 |
| `Node` fields | 22 | **22** | 21 |
| `Edge`, `NodeProps`, `EdgeProps` | 20 / 13 / 20 | **all** | all |
| `Handle`, `Background`, `BaseEdge` props | 6 / 6 / 9 | **all** | all |
| `MiniMap` props | 18 | **18** | 17 |
| `Controls` props | 9 | **9** | 7 |
| `NodeResizer` props | 16 | **16** | 16 |
| `NodeToolbar` props | 4 | **4** | 3 |
| `fitView` options | 8 | **8** | 7 |
| **All members counted** | 302 | **302** | **263** |

The 39 that are named and not done are listed below. A name that compiles and does nothing is worse than a
missing one — it fails silently, in production, in someone else's app — so each of the 39 is tagged
`@unimplemented` in its doc comment (your editor shows it on hover), and **in development a canvas says so, once,
when it is given one that asks for something it would not do** (`flowinger: connectOnClick is accepted so React
Flow code compiles, but does nothing here`). A test keeps the tags and the warnings the same list. The audit
script prints both counts, so this table cannot drift from the code.

"Does" is *a feature behind the name*, not *identical to React Flow*: counts are not weights, and where the
behaviour differs on purpose it is in [Migrating from React Flow](migrating-from-react-flow.md).

## Accepted, not implemented

These compile and have no effect. Where the thing they ask for happens anyway, or there is another way to get
it, the right-hand column says so.

### Canvas props

| Prop | What happens instead |
|---|---|
| `selectionKeyCode` | Shift draws a selection box; with `selectionOnDrag`, any bare drag does. |
| `multiSelectionKeyCode` | Shift, Ctrl or ⌘ add to a selection. |
| `zoomActivationKeyCode` | With `panOnScroll`, Ctrl or ⌘ and the wheel zoom. |
| `panOnScrollMode` | A wheel pan is free: both axes. |
| `preventScrolling` | The wheel is the canvas's whenever `zoomOnScroll` or `panOnScroll` is on, and the page does not scroll then; turn both off to give it to the page. |
| `connectionDragThreshold` | A connection begins the moment a handle is pressed. |
| `nodeClickDistance`, `paneClickDistance` | A press that moves less than the drag threshold (3 px, or `nodeDragThreshold`) is a click. |
| `connectionRadius`, `reconnectRadius` | A connection snaps to the handle the pointer is over, not one near it. |
| `selectNodesOnDrag` | Dragging an unselected node selects it. |
| `connectOnClick`, `onClickConnectStart`, `onClickConnectEnd` | Connect by dragging from one handle to another. |
| `onSelectionDragStart`, `onSelectionDrag`, `onSelectionDragStop` | `onNodeDragStart` / `onNodeDrag` / `onNodeDragStop`, with `nodes` as everything being dragged. |
| `onSelectionContextMenu` | `onNodeContextMenu`. |
| `colorMode` | Theme with the `--flowinger-*` CSS variables on an ancestor ([Theming](theming.md)). |
| `elevateNodesOnSelect`, `elevateEdgesOnSelect`, `zIndexMode` | Stacking is by nesting depth, then the element's own `zIndex`. |
| `defaultMarkerColor` | An arrowhead takes its edge's stroke unless the marker names a colour. |
| `connectionLineContainerStyle` | Style the line with `connectionLineStyle`. |
| `noDragClassName`, `noPanClassName`, `noWheelClassName` | The classes are `nodrag`, `nopan` and `nowheel`, fixed. |
| `nodesFocusable` | A node is a tab stop when it can be selected. |
| `disableKeyboardA11y` | Keyboard navigation is already opt-in: `keyboardNavigation`. |
| `ariaLabelConfig` | The `ariaLabel` props, in English. |
| `autoPanOnNodeFocus`, `autoPanOnSelection` | Focusing or selecting a node does not pan to it. |
| `debug` | There is no debug output. |

`proOptions` and `attributionPosition` are accepted and do nothing *by design*: there is no attribution to hide,
so the end state they ask for is the one you have.

### Fields, components and options

| Member | What happens instead |
|---|---|
| `Node.handles` | Edges attach to the `<Handle>`s a node renders, measured in the browser. Before that — in server-rendered output — an edge is drawn from the node's declared `width` / `height` ([Server rendering](server-rendering.md)); declared `handles` are not used for either. |
| `MiniMap` `inversePan` | A press or drag puts the view where the pointer is; there is no relative pan to invert. |
| `Controls` `showInteractive`, `onInteractiveChange` | There is no lock button; set `nodesDraggable`, `nodesConnectable` and `elementsSelectable`. |
| `NodeToolbar` `nodeId` | The toolbar rides on the node it is rendered inside. Naming that node is fine; another node, or several, is not supported. |
| `interpolate` (viewport and `fitView` options) | A move is always an eased straight interpolation of x, y and zoom — React Flow's `'linear'`. Its default `'smooth'` (a zoom-aware path) is not available. `ease` is. |

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
- **Defaults differ, and that is the part a compiler will not find:** nodes are not draggable, connectable or
  selectable until you say so (`nodesDraggable`, `nodesConnectable`, `elementsSelectable` — React Flow's are
  on), `minZoom` is `0.05` (React Flow's `0.5`), `fitView` keeps a 40 px margin unless you pass a `padding`
  ratio (React Flow's is `0.1`), and `panActivationKeyCode` is off unless given (React Flow's is `'Space'`) and
  needs `panKeyFeature`, which `FlowingerCanvas` has. Nodes and edges do not get React Flow's `role`,
  `aria-roledescription` or live region.

[**docs/migrating-from-react-flow.md**](migrating-from-react-flow.md) is the checklist, with each default
read from React Flow's source.

## Beyond React Flow

Flowinger has 45 exports React Flow does not — the [feature objects](features.md) (`dragFeature`,
`panKeyFeature`…) and what they need — and the [pro modules](pro.md): undo/redo, copy and paste, snap guides,
export, smart routing, flowchart shapes and a collapsible tree. Those are in separate entry points
(`flowinger/history`, `flowinger/clipboard`…) and add **nothing** to the core's size unless imported.
