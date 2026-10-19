# Upgrading

What changed in each major version, and how to upgrade: [to 2.0](#upgrading-to-20) from 1.x, and
[to 1.0](#upgrading-to-10) from `0.x`. What a major version covers is on [its own page](stability.md).

## Upgrading to 2.0

2.0 follows React Flow 13. React Flow 13 changes what a number means as a fit's margin and the margin
`<ReactFlow>` fits with, gives change handlers a changeset, and ships ES modules only; 2.0 does the same, and moves
the edge paths other than bezier out of the core. Everything React Flow 13 *adds* came in 1.1, without breaking
anything: its store hooks, its changesets, `forceColorMode`, `changeParent`.

1.1 changed nothing an app could see, and in development it names — once a page, in the console, ending with *See
"Upgrading to 2.0"* — each place an app would notice 2.0. An app that runs on 1.1 without one of those warnings, and
does not load flowinger with `require` under Jest, needs nothing more. (1.2 gives the same warnings.)

### In short

| If your app… | In 2.0 | To upgrade |
|---|---|---|
| gives a fit a bare number as its margin (`padding: 0.1`) | the number is **pixels**, as in React Flow 13 (it was a ratio) | write it with a unit — `'5%'`, `'20px'` — which means the same in 1.1 and 2.0 |
| renders `<ReactFlow fitView>` without a margin | the margin is React Flow 13's, **`'5%'` a side** (it was 0.1 of the view, about 4.5%) | nothing, to have 13's; spread `reactFlow12Defaults` to keep 1.x's |
| types or calls an `onNodesChange` / `onEdgesChange` handler | its argument is typed as a **`NodeChangeset`** / `EdgeChangeset`, which it has been at run time since 1.1 | where you call one with a list, pass `new NodeChangeset(list)` |
| renders `<FlowingerCore>` with `straight`, `smoothstep` or `step` edges | those paths come with **`edgePathsFeature`** | add it to `features` (`<FlowingerCanvas>` and `<ReactFlow>` have it) |
| loads flowinger with `require` | there is **no CommonJS build**; Node's `require` loads the ES modules (Node 20.19+ or 22.12+) | under Jest, see [5](#5-es-modules-only); in TypeScript, a `.cts` file needs `module: nodenext` |
| imports the type `CounterNode` | it is gone: React Flow never exported it | write your own node type |

### 1. A number as a margin is pixels

`padding` — in `fitViewOptions`, `fitView()`, `fitBounds()`, `getViewportForBounds()` and `viewportForBounds()` — was
a ratio when it was a bare number: `0.1` left a tenth of the fitted size, split between two sides, as in React Flow
12. In 2.0 a number is pixels, as in React Flow 13: `padding: 20` leaves 20 px a side, and `padding: 0.1` leaves
none. A margin with a unit — `'20px'`, `'5%'` of the pane, or per side, `{ top: '10px', x: '5%' }` — means the same
in both, and 1.1 takes it: write margins that way and the upgrade changes nothing. Zero is zero in both.

To keep exactly what `padding: 0.1` gave, write `'4.545454545454546%'`: what React Flow 12 leaves for `0.1`
(`(1 − 1/1.1) / 2` of the pane a side), the same view to the pixel.

### 2. `<ReactFlow>` fits with React Flow 13's margin

A `<ReactFlow>` fit that names no margin — `fitView` on the canvas, `fitView()` on the instance, `Controls`' button —
leaves `'5%'` of the pane a side, React Flow 13's default, where it left 0.1 of the view (about 4.5%). Most graphs
move by a pixel or two. To keep 1.x's margin on the canvas, spread `reactFlow12Defaults` (1.1 has it):

```tsx
<ReactFlow {...reactFlow12Defaults} nodes={nodes} edges={edges} fitView />
```

and pass the same `padding` to the instance's `fitView()` and to `Controls`' `fitViewOptions`. `reactFlowDefaults`
is React Flow 13's in 2.0 (the margin `'5%'`, the rest unchanged). `<FlowingerCanvas>` and `<FlowingerCore>` keep
their 40 px.

### 3. Change handlers are given a changeset

Since 1.1, `onNodesChange` and `onEdgesChange` are given a `NodeChangeset` / `EdgeChangeset`: an array of the same
changes that is also React Flow 13's changeset, so both of these work:

```ts
const onNodesChange: OnNodesChange = (changes) => setNodes((ns) => applyNodeChanges(changes, ns)); // React Flow 12
const onNodesChange: OnNodesChange = (changes) => setNodes((ns) => changes.applyTo(ns)); // React Flow 13
```

In 2.0 the types say so: `OnNodesChange` takes a `NodeChangeset`. A handler written for a plain array still
compiles; code that *calls* one with an array needs `new NodeChangeset(list)`.

### 4. The edge paths other than bezier come with a feature

A `<FlowingerCore>` draws `straight`, `smoothstep` and `step` edges only with `edgePathsFeature`; without it they are
beziers. It takes 0.45 kB out of a core whose edges are all beziers. 1.1 has the feature (it does nothing there),
so name it before upgrading and nothing changes. The path functions (`getSmoothStepPath`…) and the edge components
(`SmoothStepEdge`…) are where they were.

### 5. ES modules only

There is one build, of ES modules, as React Flow 13 has. What changes depends on what loads it:

- **A bundler, Vite, Next.js, Vitest, Node's `import`**: nothing.
- **Node's `require`**: nothing on Node 20.19+ or 22.12+, which `require` an ES module.
- **Jest**, which loads modules itself: run it with `NODE_OPTIONS=--experimental-vm-modules` on Node 22.21+ or
  24.9+, or let a transform compile flowinger (`transformIgnorePatterns: ['/node_modules/(?!flowinger/)']` with a
  Babel config that turns ES modules into CommonJS).
- **TypeScript**: a `.cts` file needs `module: nodenext` (or `bundler` in an app that bundles); `node16` refuses to
  import an ES module from CommonJS. `moduleResolution: node10`, which TypeScript 7 removed, no longer finds the
  subpaths (`flowinger/history`…).

`pnpm check:toolchains` is the check behind this list.

### What stays as it is

- `<FlowingerCanvas>` and `<FlowingerCore>` and their defaults; every name 1.x exports but `CounterNode` —
  `applyNodeChanges`, `useStore`, `useStoreApi`, `colorMode` among them, though React Flow 13 dropped them; the
  class names, test ids and CSS variables; React 18 and 19; server rendering.
- What 1.2 added: connecting from the keyboard, with its `ariaLabelConfig` keys
  ([accessibility](accessibility.md#connecting-from-the-keyboard)).

## Upgrading to 1.0

What changed between `0.x` and `1.0`, and how to upgrade. There are two changes an app can notice, both below.
`0.9` changed nothing an app could see, and in development it named — once a page, in the console — where an app
would notice 1.0; an app that went through 0.9 and did what it said needs nothing more.

### In short

| If your app… | In 1.0 | To upgrade |
|---|---|---|
| renders `<FlowingerCanvas>` or `<FlowingerCore>` | nothing changes | nothing |
| renders `<ReactFlow>` | it takes **React Flow's defaults** | nothing, if you want React Flow's behaviour; rename it to `<FlowingerCanvas>` to keep what you had |
| has an edge that names a handle `in`, `out`, `prev`, `next`, `top`, `bottom`, `left` or `right` that no `<Handle>` has | the edge no longer meets a side guessed from the name | add the `<Handle>` |
| writes its own `Feature` | the feature API is `@experimental` | nothing; minor releases may change it |

What a major version promises from then on is on [its own page](stability.md).

### 1. `<ReactFlow>` takes React Flow's defaults

`<ReactFlow>` and `<FlowingerCanvas>` are the same canvas under two names, and before 1.0 both had flowinger's
defaults: interaction off until it is asked for. That is the one difference [the migration
guide](migrating-from-react-flow.md#2-set-the-defaults-you-were-relying-on) warns about, and why moving from
React Flow was more than changing an import. In 1.0 the name decides: `<ReactFlow>` behaves like React Flow,
and `<FlowingerCanvas>` keeps flowinger's defaults.

| Prop | `<FlowingerCanvas>`, and `<ReactFlow>` before 1.0 | `<ReactFlow>` in 1.0 — React Flow's |
|---|---|---|
| `nodesDraggable` | `false` | `true` |
| `nodesConnectable` | `false` | `true` |
| `elementsSelectable` | `false` | `true` |
| `nodesFocusable` | as `elementsSelectable` | `true`: every node is a tab stop |
| `minZoom` | `0.05` | `0.5` |
| `nodeDragThreshold` | 3 px | 1 px |
| `paneClickDistance` | a press is a click however far it moved | not a click once it moved more than 1 px |
| `nodeClickDistance` | the same | not a click once it moved at all |
| `multiSelectionKeyCode` | Shift, Control or ⌘ adds to a selection | ⌘ on a Mac, Control elsewhere — not Shift |
| `zoomActivationKeyCode` | none | ⌘ / Control: held, the wheel zooms even with `zoomOnScroll` off |
| `panActivationKeyCode` | none | Space: held, a drag pans even with `panOnDrag` off |
| `fitViewOptions.padding` | a 40 px margin | 0.1 of the view |

Three more are not props, and changed for `<ReactFlow>` too:

- **The margin of a fit** that names none — the instance's `fitView()` and `fitBounds()`, and `Controls`' fit
  button: 40 px → 0.1 of the view. Pass `padding` to choose.
- **Animated moves** (`setViewport`, `fitView`, `zoomTo`… with a `duration`): a straight line → React Flow's
  `'smooth'` path, which zooms out and back in over a long move. Pass `interpolate` to choose.
- **`Controls`' lock** (`showInteractive`): hidden → shown.

What does not change, on either canvas: colours (`colorMode`, `defaultMarkerColor` and the
[`--flowinger-*` theme](theming.md)), since flowinger has no stylesheet to bring React Flow's; and the ARIA
attributes on the canvas, which the accessibility pass decides.

**To keep what you had**, render `<FlowingerCanvas>`. It takes the same props.

```tsx
import { FlowingerCanvas } from 'flowinger';

<FlowingerCanvas nodes={nodes} edges={edges} onNodesChange={onNodesChange} />
```

**To have React Flow's on a `<FlowingerCanvas>`**, spread `reactFlowDefaults` under your props (a
`<ReactFlow>` that already spreads it, as 0.9 suggested, keeps working and can drop the spread):

```tsx
import { FlowingerCanvas, reactFlowDefaults } from 'flowinger';

<FlowingerCanvas {...reactFlowDefaults} nodes={nodes} edges={edges} onNodesChange={onNodesChange} />
```

Spread like that, a `fitViewOptions` of your own replaces the one in `reactFlowDefaults` (`<ReactFlow>` merges
them), so give it `padding: 0.1` if you want React Flow's margin. The three defaults that are not props come with
`<ReactFlow>` only; elsewhere pass them: `padding` to a fit, `interpolate: 'smooth'` to a move, `showInteractive`
to `Controls`.

On a `<FlowingerCore>`, most of these props need their feature (`dragFeature` for `nodesDraggable`, `panKeyFeature`
for `panActivationKeyCode`…), and a core without one says so in development, as for any other prop.

### 2. An edge no longer meets a side guessed from its handle's name

An edge can name the handle it meets (`sourceHandle`, `targetHandle`). When the node has no `<Handle>` of that id,
flowinger has looked at the name: `top` or `in` is the top, `bottom` or `out` the bottom, `left` or `prev` the
left, `right` or `next` the right. The rule is from before handles were measured, and React Flow has no such
thing. 1.0 removed it, and such an edge is drawn as one with no handle to go on: from the source's bottom to the
target's top when the target sits lower, otherwise from the source's right to the target's left.

In development, 0.9 named the edge's node and handle, the side the rule gave it and the side 1.0 does. Add the
handle where the rule put it:

```tsx
<Handle id="out" type="source" position={Position.Bottom} />
```

A node that does have the `<Handle>` is not affected once it has mounted. Before that — on the server, and in the
first paint, before its handles have registered — the rule still chose the side, so a server-rendered edge to a
handle called `out` met the bottom. In 1.0 it is drawn as one with no handle to go on until the handle registers.
To keep the server's HTML exact, list the node's handles in `handles`, which the server reads
([server rendering](server-rendering.md)).

### 3. Writing a feature is experimental

If you write your own `Feature` (`install`, `useCanvas`, `useNode`…), its types are `@experimental` from 1.0: they
reach into the store, which is still changing, and may change in a minor release, with a line in the changelog.
Using the built-in features is covered like everything else. See [what 1.0 promises](stability.md).

### What stays as it is

- **Every method of the instance, on every canvas.** Moving the rarely used ones (`fitBounds`, `setCenter`,
  `screenToFlowPosition`, `toObject`…) behind features, so a `FlowingerCore` that does not call them does not
  carry them, was measured before 1.0: all eleven together are 0.24 kB of the 19.8 kB core. Not worth breaking
  code that calls them, so they stay.
- `<FlowingerCanvas>` and `<FlowingerCore>`, their props and their defaults; the React Flow names (`useReactFlow`,
  `ReactFlowProvider`…); the class names, test ids and CSS variables; React 18 and 19.
