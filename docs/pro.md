# The "pro" modules

[← Documentation](README.md) · Undo/redo, copy and paste, snap guides, export, smart edges, editable edges,
flowchart shapes and a collapsible tree — the things React Flow sells as "Pro", here free and MIT-licensed.

Each is a separate entry point, so it costs the core canvas **nothing** unless you import it (measured: the core
is the same size with the modules in the package as without). Import what you use:

```ts
import { useUndoRedo } from 'flowinger/history';
import { useClipboard } from 'flowinger/clipboard';
import { useSnapLines, SnapLinesOverlay } from 'flowinger/snaplines';
import { exportCanvasToSvg, exportCanvasToPng, downloadFile } from 'flowinger/export';
import { SmartEdge, getSmartEdgePath } from 'flowinger/smart-edges';
import { EditableEdge, getEditableEdgePath } from 'flowinger/editable-edge';
import { shapeNodeTypes } from 'flowinger/shapes';
import { useCollapsibleTree } from 'flowinger/tree';
// or all of them: import { … } from 'flowinger/pro';
```

They are written for a canvas that owns its graph through `onNodesChange` / `onEdgesChange`
(`useNodesState` / `useEdgesState`), because that is how a change is applied to the nodes you hold. The hooks
read and write the graph through `useReactFlow()`, so they go **inside a `FlowingerProvider`** (the examples
do). The [editor example](../examples/editor) uses all of them together.

> Tested against a real canvas, not only in isolation — the first version of this page's modules passed
> hook-level tests while exporting the wrong region and asking for a clipboard permission on every paste.
> See [plan.md](../plan.md#eighth-round-react-flows-names-the-free-pro-modules--and-making-the-claims-true).

## Undo and redo — `flowinger/history`

```tsx
const { undo, redo, canUndo, canRedo, takeSnapshot, clearHistory } = useUndoRedo({ maxHistory: 50 });

// Take a snapshot *before* a change, so there is something to go back to:
onNodeDragStart={() => takeSnapshot()}
onBeforeDelete={(elements) => { takeSnapshot(); return elements; }}
const onConnect = (c) => { takeSnapshot(); setEdges((es) => addEdge(c, es)); };
```

It is headless: you say *when* a state is worth going back to (`takeSnapshot()`), it keeps the stack
(`maxHistory`, default 50), and `undo()` / `redo()` put the nodes and edges back through the instance. A new
snapshot clears what could be redone.

- **Ctrl/⌘+Z** undoes, **Ctrl/⌘+Shift+Z** and **Ctrl/⌘+Y** redo, on the page — except in a text field or
  something `contenteditable`. Turn it off with `enableShortcuts: false`. With two canvases on a page, both
  answer; scope your own handler if that matters.
- `onUndo(state)` / `onRedo(state)` say what was restored. `takeSnapshot(state)` takes an explicit
  `{ nodes, edges }` instead of reading the canvas — which is also how it works **without a provider**: pass
  the state in and apply it from `onUndo`.
- A snapshot is the nodes and edges as they are, including `selected`; undo restores selection too.

## Copy, cut and paste — `flowinger/clipboard`

```tsx
const { copy, cut, paste, canPaste } = useClipboard({ offset: { x: 20, y: 20 } });
```

`copy()` takes the selected nodes and the edges *between* them; `cut()` also removes them (and the edges that
touched them); `paste()` adds copies with new ids, moved by `offset`, edges rewired to the copies, and selects
them (`selectOnPaste`; what was selected is deselected). Pass your own nodes: `copy(nodes, edges)`. A custom
`idGenerator(type, originalId)` replaces the default `-copy-N` ids.

- **Sub-flows:** a copied child goes into the *copy* of its parent when the parent was copied too (not
  offset twice — its position is relative), and keeps its original parent when it was not.
- **Ctrl/⌘+C, X, V** use the browser's own `copy`, `cut` and `paste` events, so there is **no permission
  prompt**, a copy of selected text or from a field is the browser's, and the clipboard carries the graph as
  JSON — paste works between tabs and windows running flowinger. `enableShortcuts: false` turns it off.
- `copy()` / `paste()` as functions (a button) use `navigator.clipboard` where it is allowed and fall back to a
  buffer in memory, so a "Paste" button works either way.

## Snap guides — `flowinger/snaplines`

```tsx
const { snapLines, snapNodeChanges } = useSnapLines({ threshold: 6 });

<FlowingerCanvas
  onNodesChange={(changes) => onNodesChange(snapNodeChanges(changes, nodes))}
  /* … */
>
  <SnapLinesOverlay snapLines={snapLines} color="#60a5fa" />
</FlowingerCanvas>
```

While a node is dragged it snaps to the edges and centres of the other nodes within `threshold` graph units
(`snapToEdges`, `snapToCenter`), and guide lines show what it is lined up with. `snapNodeChanges` applies the
snap to the position change as it arrives — a dragged selection moves by the same amount, keeping its shape,
and is lined up with what is *not* moving. The guides clear when the drag ends.

- Nodes are compared in one coordinate space, so a node is lined up with its **siblings** (same `parentId`);
  one inside a sub-flow is not compared with ones outside it.
- Give `nodeOrigin` if your canvas uses one (a node's own `origin` wins).
- `handleNodeDrag(node, nodes, nextPosition)` is the same thing as a function that returns the snapped position,
  for a custom drag.
- `SnapLinesOverlay` draws in the graph's space (it uses [`ViewportPortal`](components.md)), so it pans and
  zooms with the diagram and keeps a one-pixel line.

## Export — `flowinger/export`

```ts
const svg = await exportCanvasToSvg(wrapperEl, { backgroundColor: '#0f172a', padding: 20 });
const png = await exportCanvasToPng(wrapperEl, { pixelRatio: 2 });  // a data: URL
downloadFile(png, 'diagram.png');
```

Exports the **whole diagram**, wherever the view is panned and zoomed to, at 1:1 plus `padding` — or scaled to
fit inside a `width` / `height`. `container` is the element that holds the canvas. It carries the theme set on an
ancestor (the `--flowinger-*` variables) and the page's style sheets (`includeStyles: false` to leave them out),
and `filter(element)` leaves elements out.

It is the page's own DOM drawn into an SVG `<foreignObject>`, which an image can render but not fetch for: an
`<img>` or web font that is not a `data:` URL will not be in the export. `downloadFile` takes a URL, so turn an
SVG string into one first (`URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))`, as the editor
example does).

## Smart edges — `flowinger/smart-edges`

```tsx
const edgeTypes = { smart: SmartEdge };
<FlowingerCanvas edgeTypes={edgeTypes} edges={[{ id: 'e', source: 'a', target: 'b', type: 'smart' }]} />
```

An edge that steers around the nodes between its ends: orthogonal, with rounded corners, leaving and entering
each handle the way it faces, found on a grid with A*. When nothing is in the way — or no route is found — it is
the ordinary smooth-step path. Its own end nodes and the groups it runs inside are not obstacles.
`getSmartEdgePath({ sourceX, …, nodes, gridRatio, nodePadding, borderRadius })` is the same router as a
function, for an edge of your own.

It reads the graph's nodes, so an edge re-routes when a node near it moves; the route is memoised on the boxes
near it, not on every frame of a drag elsewhere. A very dense graph is a case to measure.

## Editable edges — `flowinger/editable-edge`

```tsx
const edgeTypes = { editable: EditableEdge };
{ id: 'e', source: 'a', target: 'b', type: 'editable', data: { points: [{ x: 250, y: 80 }], borderRadius: 8 } }
```

An edge with waypoints you can move. It runs from its source through `data.points` to its target in straight
runs (corners rounded by `data.borderRadius`, default square). Once it is **selected**, each waypoint is a handle
to drag, and the small dot between each pair of ends is a place to add one — drag it out and the waypoint is
made there, in order, and goes on following the pointer. **Double-click a waypoint** to remove it.

The waypoints live in the edge's `data`, written through `updateEdgeData`, so a controlled flow hears of every
move as an edge change and keeps them (`useEdgesState`, or your own). `getEditableEdgePath({ from, points, to,
borderRadius })` is the path and label position as a function, for an edge of your own.

## Flowchart shapes — `flowinger/shapes`

```tsx
const nodeTypes = { ...shapeNodeTypes };   // diamond, circle, cylinder, parallelogram, document, hexagon
{ id: 'q', type: 'diamond', position, width: 140, height: 90, data: { label: 'Approved?' } }
```

SVG nodes with handles on all four sides (`data.handles: ['top', …]` to choose). They fill the size the node is
given (`width` / `height`), with a default when it has none. `data` takes `label`, `fill`, `stroke` (or
`color`), `strokeWidth` and `textColor`; colours default to the `--flowinger-*` theme variables.

## Collapsible tree — `flowinger/tree`

```tsx
const { toggleNode, collapseNode, expandNode, isCollapsed, collapsedNodeIds } = useCollapsibleTree();
```

Collapsing a node hides everything reachable from it along edges, and the edges to them (`hidden: true`);
expanding shows them again — except what sits under a branch that is still collapsed. It writes `hidden` through
the instance, so it needs a controlled flow. It treats the graph as a tree: a node with a second, visible parent
is hidden with the collapsed one; use `getDescendantIds` to build your own rule.

Collapsing hides; it does not move. The people left over would stay spread round a gap, so lay the tree out
again over what is shown — the [`tree` example](../examples/tree) does, with a button on each node, one call
to the hook handed to the nodes by context, and `d3-hierarchy` over the visible subset.

## What is not here

- Real-browser coverage for the pro modules beyond export and editable edges is the editor example and a
  manual pass; the logic above is unit- and integration-tested in jsdom.
- Recipes for grouping and swimlanes, multiplayer presence and a workflow stepper are on the
  [roadmap](../ROADMAP.md); they are examples, not modules.
