# Upgrading to 1.0

What changed between `0.x` and `1.0`, and how to upgrade. There are two changes an app can notice, both below.
`0.9` changed nothing an app could see, and in development it named — once a page, in the console — where an app
would notice 1.0; an app that went through 0.9 and did what it said needs nothing more.

## In short

| If your app… | In 1.0 | To upgrade |
|---|---|---|
| renders `<FlowingerCanvas>` or `<FlowingerCore>` | nothing changes | nothing |
| renders `<ReactFlow>` | it takes **React Flow's defaults** | nothing, if you want React Flow's behaviour; rename it to `<FlowingerCanvas>` to keep what you had |
| has an edge that names a handle `in`, `out`, `prev`, `next`, `top`, `bottom`, `left` or `right` that no `<Handle>` has | the edge no longer meets a side guessed from the name | add the `<Handle>` |
| writes its own `Feature` | the feature API is `@experimental` | nothing; minor releases may change it |

What 1.0 promises from then on is on [its own page](stability.md).

## 1. `<ReactFlow>` takes React Flow's defaults

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

## 2. An edge no longer meets a side guessed from its handle's name

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

## 3. Writing a feature is experimental

If you write your own `Feature` (`install`, `useCanvas`, `useNode`…), its types are `@experimental` from 1.0: they
reach into the store, which is still changing, and may change in a minor release, with a line in the changelog.
Using the built-in features is covered like everything else. See [what 1.0 promises](stability.md).

## What stays as it is

- **Every method of the instance, on every canvas.** Moving the rarely used ones (`fitBounds`, `setCenter`,
  `screenToFlowPosition`, `toObject`…) behind features, so a `FlowingerCore` that does not call them does not
  carry them, was measured before 1.0: all eleven together are 0.24 kB of the 19.8 kB core. Not worth breaking
  code that calls them, so they stay.
- `<FlowingerCanvas>` and `<FlowingerCore>`, their props and their defaults; the React Flow names (`useReactFlow`,
  `ReactFlowProvider`…); the class names, test ids and CSS variables; React 18 and 19.
