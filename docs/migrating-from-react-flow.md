# Migrating from React Flow

Flowinger follows React Flow's API for the part of it that apps like [QueryLens](https://github.com/Naveen-Boddepalli/QueryLens)
use — a viewer of trees and plans, with some editing. It is **not a drop-in for all of React Flow**, so this
is a checklist, not a promise. The compiler will find most of what is missing; this page is for the things it
will not: defaults that differ, and behaviour that changes without an error.

Every default below was read from `@xyflow/react` 12.11.6's source, not remembered.

## 1. Swap the package

```bash
pnpm remove @xyflow/react
pnpm add flowinger
```

```diff
- import { ReactFlow, Background, Controls, useReactFlow } from '@xyflow/react';
- import '@xyflow/react/dist/style.css';
+ import { ReactFlow, Background, Controls, useReactFlow } from 'flowinger';
```

- **Delete the stylesheet import.** Flowinger ships none: the default node, `Controls` and edges are styled
  inline from `--flowinger-*` CSS variables (see [Theming](theming.md)), so they need no CSS file.
- **Your own CSS keeps working** where it selects on `react-flow__*` class names — those are kept — but not
  where it relied on React Flow's *stylesheet* (the look of `.react-flow__handle`, the `--xy-*` variables,
  the default node's border). Restyle those, or set the `--flowinger-*` variables.
- `ReactFlow` is `FlowingerCanvas` under React Flow's name, and `ReactFlowProvider` is `FlowingerProvider`.
  `FlowingerCore` is the small build with only the [features](features.md) you name.

## 2. Set the defaults you were relying on

This is the one that bites. React Flow turns interaction on; Flowinger leaves it off until you ask.

| | React Flow | Flowinger |
|---|---|---|
| `nodesDraggable` | `true` | **`false`** |
| `nodesConnectable` | `true` | **`false`** |
| `elementsSelectable` | `true` | **`false`** |
| `minZoom` | `0.5` | **`0.05`** |
| `maxZoom` | `2` | `2` |
| `fitView` margin | `padding` `0.1` — a ratio | **40 px**, unless you pass a `padding` ratio |
| `deleteKeyCode` | `'Backspace'` | `'Backspace'` |
| keyboard: nodes and edges as tab stops, with a `role` | on | **off** — opt in with `elementsSelectable` / `keyboardNavigation` |

So an app that was relying on the defaults needs:

```tsx
<ReactFlow
  nodesDraggable
  nodesConnectable
  elementsSelectable
  minZoom={0.5}          // only if you want to keep React Flow's limit
  /* … */
/>
```

An app that only *shows* a graph (a viewer) needs none of it, and was probably already setting them to
`false`.

## 3. Types

Flowinger exports every one of React Flow's 211 names (`OnNodesChange`, `OnConnect`, `ReactFlowProps`,
`ReactFlowInstance`, `NodeMouseHandler`, `DefaultEdgeOptions`…), so a type import needs only the package name
changed. Two differences are on purpose:

- **`ReactFlowProps` and `ReactFlowInstance` are not generic.** `ReactFlowInstance<MyNode, MyEdge>` is an
  error here rather than a type argument quietly ignored. Drop the arguments; `useReactFlow()` is not
  generic either.
- **`onConnectEnd` is given a `ConnectEndState`** (`{ connection, isValid }`), not React Flow's
  `FinalConnectionState` (the type is exported, but a handler annotated with it is a compile error).
- `Node<Data, Type>`, `NodeProps<MyNode>`, `Edge`, `NodeChange<MyNode>` and `EdgeChange<MyEdge>` are generic as
  they are in React Flow.

## 4. What is not there

Nothing of React Flow's canvas API: every prop of `ReactFlow` — and every member of the components, the instance and
the types you write against — is named **and does something** ([React Flow coverage](react-flow-coverage.md),
measured from React Flow's own type declarations). What is worth knowing is where the behaviour, or the default,
is not React Flow's:

| | React Flow | Flowinger |
|---|---|---|
| `multiSelectionKeyCode` | Meta (macOS) / Control | left out: **Shift, Control and ⌘** all add; given: only that key |
| `zoomActivationKeyCode` | Meta / Control; holding it zooms even with `zoomOnScroll` off | left out: Ctrl/⌘ only chooses zoom or pan under `panOnScroll`, and `zoomOnScroll` off is no zoom; **given: React Flow's behaviour** |
| `panActivationKeyCode` | `'Space'` | none unless given; needs `panKeyFeature` (in `FlowingerCanvas`) |
| `Controls` `showInteractive` | on | **off** |
| `interpolate` | `'smooth'` | `'linear'`; `'smooth'` is there when asked |
| `colorMode` | a class, and `--xy-*` colours | a class, and — for `light` — `--flowinger-*` colours, for what is inside the canvas |
| `ariaLabelConfig` | labels and descriptions | the same keys; the English labels flowinger already had stay when there is no config |
| `elevateNodesOnSelect` / `connectOnClick` / `autoPanOnNodeFocus`… | on | on — with the interaction itself off until you ask (`nodesDraggable` etc.) |

A press on a handle is no longer a connection until the pointer has travelled (`connectionDragThreshold`, 1 px),
so `onConnectStart` and `onConnectEnd` are not called for a click — a click is `onClickConnectStart` — and
nearby handles are snapped to (`connectionRadius`, 20 units). If your tests press a handle and look for the line
at once, move the pointer first.

If something *you* use differs from what you expected, [open an issue](https://github.com/Naveen-Boddepalli/flowinger/issues)
saying what you were building.

## 5. Things that look the same and are not

- **A controlled `viewport` is asked, not told.** As in React Flow, give `viewport` and `onViewportChange`
  and the view is yours: a gesture or an instance call *asks* for where it would go and nothing moves until
  `viewport` changes. If you never apply what it asks, the canvas simply cannot be moved (in development it
  says so, once).

- **A node with no component of your own** is React Flow's `default`, `input` or `output`: `id` and
  `data.label`, with handles on `targetPosition` / `sourcePosition`. It also shows its `id` in bold above the
  label, which React Flow's does not. A `default` of your own in `nodeTypes` replaces it for nodes with no
  type and for types nobody registered, as in React Flow.
- **`Panel`, `MiniMap`, `NodeToolbar`, `Handle` and `BaseEdge` take their element's attributes** (`id`,
  `aria-*`, `data-*`…) but not its event handlers; React Flow lets those through, and a handler there would
  replace what the canvas does with the press. Put a handler on an element inside, or on a wrapper.

- **`useStore`** reads ten fields (`panZoom`, `isReady`, `nodes`, `edges`, `transform`, `width`, `height`,
  `minZoom`, `maxZoom`, `nodesInitialized`), not React Flow's whole internal store, and **`useStoreApi`** has
  `getState` and `subscribe` but no `setState`.
- **`useReactFlow()` returns one object for the life of the provider.** An effect with it in its
  dependencies runs once. (In React Flow it is rebuilt when the viewport initialises.) `viewportInitialized`
  is therefore not on it.
- **The instance's editing calls report changes.** `setNodes`, `updateNodeData` and friends are applied by
  your `onNodesChange` (or by `defaultNodes`); on nodes you merely pass in they do nothing. With
  `FlowingerCore` they need `editingFeature`.
- **A node with no `width`/`height` is measured**, and until then a declared `initialWidth`/`initialHeight`
  — or a 150 × 40 fallback — is used for `fitView` and `getNodesBounds`.
- **Accessibility attributes are opt-in.** React Flow's `role="application"`, `aria-roledescription` and
  live region are not added. Turn on `elementsSelectable` or `keyboardNavigation`, and use `ariaLabel`.
- **There is no attribution badge.** `proOptions` and `attributionPosition` are accepted and do nothing.
- **Pointer behaviour on inert nodes differs, for the better.** React Flow sets `pointer-events: none` on a
  node that is neither draggable nor selectable, which silences hover styles and tooltips in it; Flowinger
  does not.

## 6. What stays the same

- The data: `{ id, position, data, type, … }` for nodes and `{ id, source, target, sourceHandle, … }` for
  edges, `applyNodeChanges`, `applyEdgeChanges`, `addEdge`, `useNodesState`, `useEdgesState`.
- The `react-flow__*` class names, `nodrag` / `nopan` / `nowheel`, and the viewport element's
  `transform: translate(Xpx, Ypx) scale(Z)`.
- The `data-testid`s: `rf__wrapper`, `rf__node-<id>`, `rf__edge-<id>`, `rf__controls`, `rf__minimap` and
  `rf__background`.
- Edge geometry: handle anchors, bezier control points and label positions agree with React Flow's to
  within 0.2 units, and `getViewportForBounds` matches its fit to the pixel.

## 7. Check it

1. Run the type checker: a missing prop, hook or field is a compile error, and it is the quickest list of
   what you need.
2. Look at the diagram next to the old build. The things that differ without an error are the `fitView`
   margin, the default node's appearance, and anything interactive you did not set (§2).
3. Run your end-to-end tests. Selectors on `react-flow__*` classes and `rf__*` test ids carry over; ones on
   React Flow's `role` or `aria-*` attributes will not.
