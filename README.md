# Flowinger

A small, dependency-free node-graph renderer for React. HTML nodes over SVG edges, with pan, zoom,
drag, touch pinch, arrowheads, labels, and an API shaped like [React Flow](https://reactflow.dev)'s.
Pay for what you use: the core is about 16 kB gzipped and each feature adds only its own code — about 25 kB with
all of them (see [Pay for what you use](#pay-for-what-you-use)). The only peer dependencies are `react` and
`react-dom` (18 or 19).

```tsx
import {
  Background, Controls, FlowingerCanvas, FlowingerProvider, Handle, Position,
  type Edge, type Node, type NodeProps,
} from 'flowinger';

function Step({ data }: NodeProps) {
  return (
    <div className="step">
      <Handle id="in" type="target" position={Position.Top} />
      {String(data.label)}
      <Handle id="out" type="source" position={Position.Bottom} />
    </div>
  );
}

// Defined outside the component, so they keep their identity between renders.
const nodeTypes = { step: Step };
const nodes: Node[] = [
  { id: 'a', type: 'step', position: { x: 0, y: 0 }, data: { label: 'Scan' } },
  { id: 'b', type: 'step', position: { x: 0, y: 120 }, data: { label: 'Filter' } },
];
const edges: Edge[] = [
  { id: 'a-b', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in', markerEnd: 'arrowclosed' },
];

export function Diagram() {
  return (
    // The canvas fills its parent, so the parent needs a height.
    <div style={{ position: 'relative', height: 400 }}>
      <FlowingerProvider>
        <FlowingerCanvas nodes={nodes} edges={edges} nodeTypes={nodeTypes}>
          <Background />
        </FlowingerCanvas>
        <Controls style={{ position: 'absolute', right: 12, bottom: 12 }} />
      </FlowingerProvider>
    </div>
  );
}
```

## Install

```bash
pnpm add flowinger      # or: npm install flowinger
```

React 18 or 19 is a peer dependency. The package ships its built `dist/`.

To try a commit that is not released, install from GitHub instead. A git dependency has no `dist/`, so it is
built on install, which package managers gate behind an explicit opt-in:

```bash
# pnpm 11 — allow the build first, in pnpm-workspace.yaml:
#   allowBuilds:
#     flowinger: true
pnpm add github:Naveen-Boddepalli/flowinger

# npm 12 — git dependencies are off by default
npm install --allow-git=all github:Naveen-Boddepalli/flowinger
```

## What is in the box

| | |
|---|---|
| `FlowingerCanvas` | The whole canvas, every feature: pan by dragging, zoom with the wheel or a pinch, drag nodes if you allow it. Also `ReactFlow`. |
| `FlowingerCore` | The same canvas with only the [features](#pay-for-what-you-use) you name — pan, zoom, nodes and edges are always there. Takes `id` and a `domAttributes` escape hatch for its own element (never an event handler, or `id`/`style`/`className`/`children`/`role`/`tabIndex`, which are the engine's own). |
| `FlowingerProvider` | Optional: owns the state, so a toolbar *outside* the canvas can drive it. The canvas makes its own when there is none. |
| `Handle` | A connection point on a node. Edges attach to the handle they name, wherever it is drawn. |
| `BaseEdge` | How every built-in edge is drawn (a path, an optional label). A custom edge can render it and add to it. |
| `ViewportPortal` | Draws your own elements in graph space — they pan and zoom with the diagram and sit above its nodes and edge labels. Renders nothing on the server. |
| `EdgeLabelRenderer` | Inside a custom edge: draws HTML (a button, an input) at a point of the edge, in a layer above the edges that pans and zooms with the graph. Position it with a `translate(x, y)` from the edge's own label coordinates; give it `pointerEvents: 'all'` and a `nopan` class to make it clickable. |
| `NodeToolbar` | Inside a node: buttons attached to a side of it (`position`, `align`, `offset`), shown while it is the only thing selected (`isVisible` overrides). It rides on the node, so it follows drags and zoom and never changes the node's size. |
| `NodeResizer` | Inside a node: eight drag handles (sides and corners) that resize it — `minWidth`, `minHeight`, `maxWidth`, `maxHeight`, `keepAspectRatio`, `isVisible`, `color`, `shouldResize`, `onResizeStart` / `onResize` / `onResizeEnd`. Reported as `dimensions` (written to `width`/`height`) and `position` changes, so it needs a [controlled flow](#controlled-flows) or `defaultNodes`. |
| `Panel` | A box of your own UI pinned to the canvas — `position` is `top-left` (default), `top-center`, `top-right`, `center-left`, `center-right`, `bottom-left`, `bottom-center` or `bottom-right`. A press on it does not pan, and a click on it is not a pane click. |
| `Background`, `Controls` | A dot/line/cross backdrop (`size` is a dot's diameter or a cross's arm length, `lineWidth` a stroke's, `bgColor` behind the pattern — as in React Flow); zoom and fit buttons (`showZoom`, `showFit`/`showFitView`, `fitViewOptions`, `onZoomIn`/`onZoomOut`/`onFitView`, your own `ControlButton`s as children). Both go inside the provider; a `position` pins either to the canvas, as `Panel` does. |
| `MiniMap` | An overview of the whole graph with the visible region cut out of a dimming mask. Click or drag on it to move the view; it holds still during a drag. Props: `width`, `height`, `nodeColor`/`nodeStrokeColor`/`nodeClassName` (a value or a function of the node), `nodeStrokeWidth`, `nodeBorderRadius`, `maskColor`, `maskStrokeColor`/`maskStrokeWidth`, `bgColor`, `pannable`, `position`, `ariaLabel`. Goes inside the provider, next to the canvas or inside it. |
| `useFlowinger()`, `useViewport()`, `useOnViewportChange()`, `useUpdateNodeInternals()` | The instance (below); the current viewport; hearing the view move from anywhere in the tree; having the canvas re-read a node's size and handles after it changes what it is made of without telling the canvas. |
| `useInternalNode(id)`, `useStoreApi()` | A node plus `internals.positionAbsolute` and `internals.z` — narrower than React Flow's own `InternalNode` (no `handleBounds`, no `userNode`); `getState()` without subscribing, and `subscribe()` — no generic `setState`. |
| `useConnection(selector?)` | The connection being dragged right now — `fromNode`/`toNode` (flowinger's `InternalNode`), `fromHandle`/`toHandle` (just what names one: `{ nodeId, id, type }`, not a measured position), `isValid`, `from`/`to`. `NoConnection` (`inProgress: false`) when none is. |
| `useHandleConnections(options)` | `useNodeConnections` narrowed to one handle, under React Flow's older name for it. |
| `BezierEdge`, `StraightEdge`, `SmoothStepEdge`, `StepEdge` | The built-in edges, as components — for an `edgeTypes` entry that renders one and adds to it, or is one under another name. |
| `getBezierPath`, `getStraightPath`, `getSmoothStepPath` | The path maths, each returning `[path, labelX, labelY, offsetX, offsetY]`. |
| `getEdgeCenter`, `getBezierEdgeCenter`, `getViewportForBounds`, `isNode`, `isEdge` | Smaller helpers React Flow also has: the straight-line and on-curve midpoints a label sits at; a `viewportForBounds` that matches React Flow's own fit to the pixel; and the type guards. |

## Pay for what you use

`FlowingerCanvas` (alias `ReactFlow`) does everything on this page, and is what most apps want. An app that only
*shows* a graph — pan, zoom, nodes, edges, handles, `fitView` — needs far less, so the canvas is a small core
plus **features**, and you import the ones you use:

```tsx
import { FlowingerCore, connectFeature, dragFeature } from 'flowinger';

<FlowingerCore
  nodes={nodes} edges={edges}
  features={[dragFeature, connectFeature]}   // read once, when the canvas mounts
  nodesDraggable nodesConnectable
/>
```

With no features `FlowingerCore` costs about 16 kB gzipped (25 for the whole canvas); each feature you name adds
only its own code. The props, the nodes and the instance are the same either way.

| Feature | What it adds | Props that need it |
|---|---|---|
| `selectionFeature` | Selecting by click (Shift, Ctrl or ⌘ adds), Enter and Space, a click on the empty canvas or Escape clearing it; nodes and edges become tab stops | `elementsSelectable`, `edgesFocusable` |
| `dragFeature` | Dragging nodes and selections, snapping, extents, `expandParent`, the arrow keys, auto-pan (brings `selectionFeature`) | `nodesDraggable`, `onNodeDragStart` / `onNodeDrag` / `onNodeDragStop`, `snapToGrid`, `snapGrid`, `nodeExtent`, `autoPanOnNodeDrag`, `autoPanSpeed` |
| `connectFeature` | Dragging a connection out of a handle, and the line it draws | `nodesConnectable`, `onConnect`, `onConnectStart`, `onConnectEnd`, `isValidConnection`, `connectionMode`, `connectionLine*`, `autoPanOnConnect`; a `<Handle>`'s own `isConnectableStart` / `isConnectableEnd`, `isValidConnection`, `onConnect` |
| `reconnectFeature` | Dragging an end of a selected edge to another handle (brings `connectFeature`) | `onReconnect`, `onReconnectStart`, `onReconnectEnd`, `edgesReconnectable` |
| `boxSelectFeature` | Selecting with a box (brings `selectionFeature`) | `selectionOnDrag`, `selectionMode`, `onSelectionStart`, `onSelectionEnd` |
| `deleteFeature` | The delete key, and `deleteElements` | `deleteKeyCode`, `onBeforeDelete`, `onNodesDelete`, `onEdgesDelete`, `onDelete` |
| `cullingFeature` | Drawing only what is in view | `onlyRenderVisibleElements` |
| `editingFeature` | The instance's `setNodes`, `setEdges`, `addNodes`, `addEdges`, `updateNode`, `updateNodeData`, `updateEdge`, `updateEdgeData`, `getNodeConnections`, `getHandleConnections`, `getIntersectingNodes`, `isNodeIntersecting` | |
| `eventsFeature` | A double click, a right click, and the pointer entering, moving over and leaving a node, an edge or the pane; the wheel over the pane. Giving any edge event (or `onEdgeClick`) makes every edge take the pointer, selectable or not | `onNodeDoubleClick`, `onNodeContextMenu`, `onNodeMouseEnter` / `Move` / `Leave` and the same for edges and the pane, `onPaneScroll` |
| `edgeLabelsFeature` | The box behind an edge's label (`labelShowBg`), sized to the text once a browser has laid it out | `labelShowBg` on an edge |

Always in the core: pan and zoom (drag, wheel, pinch, double click, keyboard), nodes, edges (every built-in path,
labels, arrowheads, custom edges) and handles, the viewport calls and `fitView`, sub-flows, `useStore`, and the
hooks — and *reporting* the selection: a controlled node's `selected` is drawn, and `onSelectionChange`,
`useOnSelectionChange`, `onNodeClick`, `onEdgeClick` and `onPaneClick` work on any canvas. What `selectionFeature`
adds is *changing* it from the pointer and keyboard. `allFeatures` is the list the whole canvas has.

- **A prop for a feature the canvas lacks does nothing**, and in development the console says so, once, with the
  feature to pass. (Switched off — `nodesDraggable={false}` — is not "given".)
- **An instance method a feature supplies** is on the instance from the start, so `const { setNodes } =
  useReactFlow()` works wherever it is taken; without the feature, calling it throws and names the feature.
- `defaultNodes` / `defaultEdges` need `FlowingerCanvas`, which can own the graph; `FlowingerCore` shows the
  `nodes` it is given and reports changes.
- `NodeResizer`, `MiniMap`, `Controls` and the hooks cost something only when imported; the resizer installs
  what it needs itself.
- Your own feature is a plain object — `install(ctx)` to add to the store, `useCanvas` / `useNode` to add to the
  canvas's and each node's handlers, `Layer`, `EdgesLayer` and `EdgeAdornment` to draw, and `needs` for the
  features it builds on. The type and its slots are documented in [`src/features.ts`](src/features.ts).
- The development warnings read `process.env.NODE_ENV`, which a bundler replaces (as it does for React); a
  production build drops them.

### `FlowingerCanvas` props

| Prop | Default | |
|---|---|---|
| `nodes`, `edges`, `nodeTypes` | | The graph. `nodeTypes` maps `node.type` to your component. Give `onNodesChange` / `onEdgesChange` and the flow is [controlled](#controlled-flows). |
| `defaultNodes`, `defaultEdges` | | Start from these and let the canvas own the list (no `nodes` prop). |
| `edgeTypes` | | Custom edge components by `edge.type`, receiving `EdgeProps` (where each end attaches, which way it leaves, `data`, `label`, marker references). A key overrides a built-in of the same name; an unknown `type` draws a bezier. |
| `minZoom`, `maxZoom` | `0.05`, `2` | |
| `nodesDraggable` | `false` | A node's own `draggable` overrides it, either way. |
| `panOnDrag` | `true` | `false`, or a list of mouse buttons, e.g. `[1]` for middle only. |
| `zoomOnScroll`, `zoomOnPinch` | `true` | |
| `autoPanOnNodeDrag`, `autoPanOnConnect`, `autoPanSpeed` | `true`, `true`, `15` | Hold a dragged node — or the end of a connection you are dragging — near the pane's edge and the view pans that way, faster the nearer the edge (`autoPanSpeed` px per frame at the edge itself). Drags are measured in graph space, so the node stays under the pointer as the view moves. |
| `zoomOnDoubleClick` | `true` | A double click on the empty canvas zooms in about the pointer (out with Shift). |
| `panOnScroll`, `panOnScrollSpeed` | `false`, `0.5` | The wheel pans instead of zooming (Ctrl/⌘ or a trackpad pinch still zoom). A `nowheel` class lets the wheel through to something inside that scrolls for itself — a code block, a list. |
| `defaultViewport` | | Where the view starts, once — a controlled `viewport` is not taken. Inside a `FlowingerProvider`, the canvas moves the provider's view there when it mounts. |
| `onMoveStart`, `onMove`, `onMoveEnd` | | The view is moving: `(event, viewport)`, `event` the pointer or wheel that moved it, or `null` for a call such as `fitView`. A run of wheel ticks is one move, ended once the wheel has been still for 150 ms; `useOnViewportChange` hears the same moves from anywhere inside a canvas. |
| `onNodeDoubleClick`, `onNodeContextMenu`, `onNodeMouseEnter` / `Move` / `Leave` | | And the same for edges (`onEdgeDoubleClick`…) and the pane (`onPaneContextMenu`, `onPaneMouseEnter`…), plus `onPaneScroll`. Needs `eventsFeature`; giving any edge event makes every edge take the pointer. |
| `selectionOnDrag`, `selectionMode` | `false`, `'full'` | With `elementsSelectable`, dragging on the empty canvas draws a selection box (Shift does it anyway; Ctrl/⌘ held at the start keeps what is already selected). `'full'` takes nodes wholly inside it, `'partial'` any it touches; edges with both ends inside come along. Pan with the middle/right button (`panOnDrag={[1, 2]}`) or the wheel. `onSelectionStart` / `onSelectionEnd` report it. |
| `translateExtent` | none | `[[minX, minY], [maxX, maxY]]`: keeps the view inside it. |
| `nodeExtent` | none | The same shape, but for *nodes*: a dragged node (or selection) stops at its edge. A node's own `extent` wins. |
| `snapToGrid`, `snapGrid` | `false`, `[15, 15]` | A dragged node lands on the grid; a selection keeps its shape, snapping by the node you hold. |
| `onlyRenderVisibleElements` | `false` | Draw only the nodes and edges in view (plus a margin of a quarter of the view), so a huge diagram costs what is on screen. Selected and dragged nodes are always drawn; an edge is drawn if either end is, or it crosses the view. |
| `fitView`, `fitViewOptions` | `false` | Frame the nodes once, as soon as every one has been measured. |
| `defaultEdgeOptions` | | Defaults for every edge (`animated`, `markerEnd`, `style`…); an edge's own fields win. Compared by value, so writing it inline is fine. |
| `keyboardNavigation` | `false` | Makes the canvas a tab stop: arrows pan (Shift for more), `+` `-` zoom, `0` fits. Name it with `ariaLabel`. |
| `elementsSelectable` | `false` | A click selects a node *or an edge* (Shift/Ctrl/⌘ adds or removes), a click on the canvas clears, and nodes and edges become focusable: Enter or Space selects, Escape clears (with `keyboardNavigation`), and the arrow keys nudge a selected node (Shift for four times as far). A node's or edge's own `selectable: false` opts it out; `edgesFocusable={false}` takes edges out of the tab order. |
| `nodesConnectable` | `false` | Handles become drag handles and drop targets: drag from one to another to make a connection. A handle's own `isConnectable={false}` opts it out, and so does a node's `connectable: false`. |
| `connectionLineType`, `connectionLineStyle`, `connectionLineComponent` | `'bezier'` | The line dragged out of a handle: `'bezier'`, `'straight'`, `'step'` or `'smoothstep'`; a style for it (it never takes pointer events, whatever the style says); or your own component, given `fromX/Y`, `toX/Y`, which way each end faces, and `isValid` (`true` over a handle that would be accepted, `false` over one that would not, `null` over neither). |
| `connectionMode` | `'strict'` | `'strict'` joins a source handle to a target handle; `'loose'` joins any handle to any other (never itself), the end you dragged from becoming the source. |
| `onReconnect`, `onReconnectStart`, `onReconnectEnd`, `edgesReconnectable` | `true` | Select an edge and drag either end (a ring appears on it) onto another handle: `onReconnect(oldEdge, newConnection)` says what it would now join, source → target. Nothing is edited for you — `setEdges((es) => reconnectEdge(old, next, es))`. Needs `nodesConnectable`, as handles are the drop targets, and an `onReconnect` to switch the rings on; an edge's own `reconnectable` is `false`, `'source'` or `'target'`. Dropped back on its own handle is not a change; the edge is not drawn while its end is dragged. `onReconnectStart(event, edge, handleType)` / `onReconnectEnd(event, edge, handleType, { connection, isValid })` bracket the drag. |
| `onConnectStart`, `onConnectEnd` | | `onConnectStart(event, { nodeId, handleId, handleType })`; `onConnectEnd(event, { connection, isValid })` when the pointer is released — `isValid` is `true` (made), `false` (refused) or `null` (no handle there). |
| `onConnect`, `isValidConnection` | | `onConnect({ source, target, sourceHandle, targetHandle })` — always source → target, whichever end the drag began at. `isValidConnection` can veto, and decides whether the line snaps to a handle. |
| `deleteKeyCode` | `'Backspace'` | The key (or list of keys; `null` for none) that deletes the selection while focus is on the canvas, a node or an edge — never in a field. Deleting is *reported*: see below. |
| `onBeforeDelete`, `onNodesDelete`, `onEdgesDelete`, `onDelete` | | `onBeforeDelete({ nodes, edges })` may return `false`, a smaller `{ nodes, edges }`, or a promise of either; then the removals are reported and these are called with what went. |
| `onSelectionChange`, `onNodeClick`, `onEdgeClick`, `onPaneClick` | | `onSelectionChange({ nodes, edges })` tells you when the selection changes. A pan's closing click is not a pane click, and neither is a drag's a node click. |
| `onNodeDragStart`, `onNodeDrag`, `onNodeDragStop`, `onInit` | | The drag callbacks get `(event, node, nodes)`: `nodes` is everything being dragged. |

Without `onNodesChange`, `nodes` is never mutated: a dragged position is kept internally, and a fresh
layout from you wins over it. Dragging a selected node drags the whole selection; a node with a
`dragHandle` (a CSS selector) drags only by that element. **Edges**: `id`, `source`, `target`, `sourceHandle`, `targetHandle`, `type`
(`'bezier'` \| `'straight'` \| `'step'` \| `'smoothstep'` — `step` has square corners, `smoothstep` rounds them), `label`, `markerStart`, `markerEnd`
(`'arrow'`, `'arrowclosed'`, or `{ type, color, width, height }`), `className`, `style`. Give a node
`width` and `height` to fix its size — as in React Flow they are applied to the node, and are what server
rendering and `fitView` use before it has been measured. Leave them out and the content decides; the engine
measures the rendered size either way, and reports it (`node.measured`) to a controlled flow.

A node or an edge also takes `ariaLabel`, `ariaRole` (default `'group'` on a node once it is a tab stop; on
an edge, a `'button'` once it is selectable and focusable) and `domAttributes` — an escape hatch for an
attribute flowinger has no prop for (`title`, another `aria-*`…) — not a custom `data-*` attribute without a
cast, since `HTMLAttributes` does not declare it by name. `domAttributes` can never be an
event handler, or `id` / `style` / `className` / `role`, which are the engine's own to set; it wins over
anything else it is allowed to touch.

### Handles

An edge names a handle by `id`; its end decides the type (`sourceHandle` finds a `source` handle). Name
none and it takes the first handle of that type. A handle moved with `style` (say `left: '30%'`) still
gets its edge, because the engine measures where each one is actually drawn. An edge attaches at the
handle's *outer* edge (the side facing away from the node), as React Flow's do, so it stops at the dot
rather than running into it.

With `nodesConnectable`, a drag from one handle to a compatible one calls `onConnect`. The engine never
edits `edges` itself (they are your prop), so you add it:

```tsx
<FlowingerCanvas
  nodesConnectable
  onConnect={(c) => setEdges((edges) => [...edges, { id: `${c.source}-${c.target}`, ...c }])}
  /* … */
/>
```

The dashed line follows the pointer, snaps to a handle that would make a valid connection, and Escape
cancels. The gesture is tracked on `window`, so it survives leaving the node and the canvas.

### Nodes inside nodes

Give a node a `parentId` and it becomes a child: its `position` is *relative to its parent's*, it moves with
it, it is drawn above it (a deeper node above a shallower; `zIndex` overrides), and it is hidden and deleted
with it. That nests as deep as you like.

```tsx
const nodes = [
  { id: 'group', position: { x: 100, y: 50 }, width: 300, height: 200, data: {} },
  { id: 'inside', parentId: 'group', extent: 'parent', position: { x: 20, y: 30 }, data: {} },
];
```

`extent: 'parent'` keeps a child inside its parent's box while it is dragged. Everything that draws or
hit-tests — edges, the minimap, `fitView`, box selection, `getIntersectingNodes`, `nodeExtent`, `snapToGrid`
(to the canvas' grid, not the parent's) — works from the node's place on the canvas, which a custom node gets
as `positionAbsoluteX` / `positionAbsoluteY`; the `position` in your data stays relative, in a `position`
change too. Drag or nudge a parent together with its own children and they move once, not twice.

An edge is stacked with the nodes it joins — the higher of the two — so one running into a child is drawn
*above* its group (and can be clicked there) and below the child it ends at; `edge.zIndex` overrides. With no
nesting every edge stays in the one layer under every node. Edges of different levels are separate `<svg>`s;
arrowheads are shared through the lowest.

Give a child `expandParent: true` and dragging it past its parent's edge makes the parent *grow* to hold it
(instead of `extent: 'parent'`, which would stop it): a `dimensions` change for the parent's size, and past the
top or left edge a `position` change too — the parent's corner moves out, and its other children are re-based
so that nothing but the parent's edge moves on the canvas. It never shrinks during a drag, needs a
[controlled flow](#controlled-flows) (the size is yours to keep), and looks one level up only.

### The instance

`useReactFlow()` (alias `useFlowinger()`) returns one object for the life of the provider, so it is safe in an
effect's dependencies; `onInit` hands you the same one.

- **View**, each returning a `Promise<boolean>` — `true` when the move lands, `false` if another one cut it
  short: `setViewport`, `zoomIn`, `zoomOut`, `zoomTo(zoom)`, `setCenter(x, y, { zoom })`,
  `fitView({ padding, nodes, includeHiddenNodes, minZoom, maxZoom, duration })`, `fitBounds(rect, options)`;
  and `getViewport()`, `getZoom()`. `padding` is a ratio, as in React Flow (`0.1` = a tenth of the diagram's
  size on each side); left out, `fitView` keeps a 40 px margin.
- **Coordinates**: `screenToFlowPosition({ x, y }, { snapToGrid })` takes a pointer position (`clientX`,
  `clientY`) to graph units — for dropping a node where the pointer is — and `flowToScreenPosition` goes back.
- **Read**: `getNodes()`, `getNode(id)`, `getEdges()`, `getEdge(id)`, `getNodesBounds(nodesOrIds)`,
  `getIntersectingNodes(nodeOrRect, partially?, nodes?)`, `isNodeIntersecting(nodeOrRect, rect, partially?)`,
  `toObject()`. They report the nodes as they stand: a dragged position, a measured size and the selection
  included.
- **Edit**: `setNodes`, `setEdges` (a list or an updater), `addNodes`, `addEdges`, `updateNode`,
  `updateNodeData`, `updateEdge`, and `deleteElements({ nodes, edges })`. They are reported as changes, so they
  need a [controlled flow](#controlled-flows) or `defaultNodes`; on nodes you merely pass in, there is nobody to
  apply them and they do nothing. On a `FlowingerCore` they need `editingFeature` (and `deleteFeature` for
  `deleteElements`).

**Hooks**: `useKeyPress('Meta+s')` (a key, a combination, or a list; ignores typing in fields unless modified),
`useOnSelectionChange({ onChange })`, `useNodesData(id | ids)` (re-renders only when that `data` changes),
`useNodeConnections({ id, handleType, handleId, onConnect, onDisconnect })`, `useNodes()`, `useEdges()`,
`useNodesInitialized()` and `useNodeId()`.

`useStore(selector, equalityFn?)` reads `panZoom`, `isReady`, `nodes`, `edges`, `transform` (`[x, y, zoom]`),
`width`, `height`, `minZoom`, `maxZoom` and `nodesInitialized`. The selector must return a stable value, or you
pass an equality function.

A node with `hidden: true` is neither drawn nor listed on the minimap, and nor are its edges.

### Controlled flows

Give the canvas `onNodesChange` and it stops keeping state for you: dragging, selecting and measuring
are *reported* as a list of changes, and you apply them.

```tsx
const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

<FlowingerCanvas
  nodes={nodes}
  edges={edges}
  onNodesChange={onNodesChange}
  onEdgesChange={onEdgesChange}
  onConnect={(c) => setEdges((es) => addEdge(c, es))}
  nodesDraggable
  elementsSelectable
/>
```

`useNodesState` is `useState` plus `onNodesChange = (changes) => setNodes((ns) => applyNodeChanges(changes, ns))`;
write that yourself if you keep nodes in a store. A change is one of `position` (with `dragging`),
`dimensions` (the measured size, which `applyNodeChanges` writes to `node.measured`), `select`, `remove`,
`add` and `replace`. Selection then lives on `node.selected`, and the canvas draws it from there.
`applyNodeChanges` returns the same object for every node a change did not touch, so memoised views skip
them. `useNodesInitialized()` is true once every node has been measured, and re-renders only when that flips.

Also exported: `addEdge`, `reconnectEdge`, `getConnectedEdges`, `getIncomers`, `getOutgoers`.

**Deleting** works the same way: a delete key (or `instance.deleteElements({ nodes, edges })`) removes the
selected nodes, the selected edges and every edge touching a removed node, as `remove` changes, after
`onBeforeDelete` has had its say. A node or edge with `deletable: false` stays (but a node's edges go if the
node does). Where the nodes are only passed in, so nothing applies the changes, the delete callbacks
still fire and removing them is up to you.

An edge with `animated: true` draws marching dashes (its own `<style>` in the SVG; switched off under
`prefers-reduced-motion`). A selected edge is drawn in `--flowinger-selected`, its `<g>` gets the `selected`
class, and a custom edge receives `selected` in its props; `BaseEdge` adds an invisible 20-unit strip
along the path so a thin edge is easy to click (`interactionWidth` changes it).

## Theming

The default node, `Controls` and edges are styled inline from CSS variables, each with a fallback, so
they need no stylesheet and no utility framework. Set any of these on an ancestor:

`--flowinger-surface` · `--flowinger-surface-raised` · `--flowinger-border` · `--flowinger-text` ·
`--flowinger-text-dim` · `--flowinger-edge` · `--flowinger-selected` (a selected node, and the line you drag) ·
`--flowinger-radius`

Nodes you supply are yours to style. The elements carry `react-flow__*` class names as well as
`flowinger-*` ones, so existing stylesheets and tests that select on React Flow's keep working.

## Coming from React Flow

It keeps React Flow's shape and names for the core — `ReactFlow`, `ReactFlowProvider`, `useReactFlow`, `useStore`,
`Handle`, `Position`, `Background`, `BackgroundVariant`, `MarkerType`, `useNodesState`, `useEdgesState`,
`applyNodeChanges`, `applyEdgeChanges`, `addEdge`, `useNodesInitialized`, and the `Node` / `Edge` / `NodeProps`
types — and the `react-flow__*` class names on the elements it draws. **It is not a drop-in for arbitrary React
Flow code**: it covers the part of the API an app like [QueryLens](https://github.com/Naveen-Boddepalli/QueryLens)
uses (which it replaced, with identical geometry and its whole end-to-end suite passing), not all of it.

Measured against `@xyflow/react` 12.11.6's own type declarations
(`node scripts/audit-react-flow.mjs <path to its dist/esm/index.d.ts>`, after `pnpm build`): **99 of its 211
exports** (103 of the 112 missing are type aliases, so code that imports `OnNodesChange`, `ReactFlowProps` or
`ReactFlowInstance` by name will not compile until you rename them), **81 of 119** `ReactFlow` props, 31 of 32
instance methods, 19 of 22 `Node` fields, 11 of 13 `NodeProps` fields, and **20 of 20** on both `Edge` and
`EdgeProps`. What is missing:

- **Canvas events:** `onSelectionContextMenu`, `onSelectionDrag*`; `onViewportChange` (there is `onMove` /
  `onMoveStart` / `onMoveEnd`, and `useOnViewportChange`); `onClickConnectStart` / `End` (connecting by click,
  as opposed to dragging). Mouse events on nodes, edges and the pane (double click, context menu, enter, move,
  leave) and the pane's scroll are covered, as `eventsFeature`.
- **Viewport and gestures:** a controlled `viewport` (there is `defaultViewport`, and the provider's
  `initialViewport`); `selectionKeyCode`, `multiSelectionKeyCode`, `panActivationKeyCode`,
  `zoomActivationKeyCode`, `panOnScrollMode`, `selectNodesOnDrag`, `nodesFocusable`, `disableKeyboardA11y`,
  `connectOnClick`, `connectionRadius`, `reconnectRadius`, the drag and click distance thresholds,
  `preventScrolling`, `noDragClassName` / `noPanClassName` (`nodrag`, `nopan` and now `nowheel` are honoured).
- **Layout and look:** `nodeOrigin`, `elevateNodesOnSelect` / `elevateEdgesOnSelect`, `zIndexMode`, `colorMode`,
  `debug`, `ariaLabelConfig`, `defaultMarkerColor`, `connectionLineContainerStyle` (`proOptions` and
  `attributionPosition` are accepted and do nothing — there is no attribution to hide). The canvas now takes
  `id` and a `domAttributes` escape hatch (never an event handler, or what it already owns); `Panel`,
  `NodeToolbar`, `MiniMap`, `Handle` and `BaseEdge` still take only `className`, `style` and `children`.
- **Hooks and instance:** `useUpdateNodeInternals`, `useOnViewportChange`, `useConnection`,
  `useHandleConnections`, `useStoreApi` (`getState()` and `subscribe()`, no generic `setState`),
  `getNodeConnections` and `getHandleConnections` are all there now. `viewportInitialized`: on purpose —
  React Flow's own instance is rebuilt when it flips, and flowinger's is created once and never replaced
  (deliberately, see `plan.md`), so a boolean *field* here would either go stale or be a silently wrong
  shape; there is no honest way to add it without one of those.
- **Components:** `SimpleBezierEdge`, `EdgeText`, `EdgeToolbar`, `NodeResizeControl`, `MiniMapNode` (there are
  now `BezierEdge`, `StraightEdge`, `SmoothStepEdge`, `StepEdge`, `isNode`, `isEdge`, `getEdgeCenter`,
  `getBezierEdgeCenter`, `getViewportForBounds` and `ControlButton`). `MiniMap`'s `zoomable`, `nodeComponent`,
  `offsetScale`, `onNodeClick`, `inversePan`; `Controls`' `showInteractive`, `onInteractiveChange`;
  `NodeResizer`'s `autoScale`.
- **Fields:** a node's `sourcePosition`, `targetPosition`, `handles` (there is now `initialWidth` /
  `initialHeight`, `ariaLabel`, `ariaRole` and `domAttributes` — an escape hatch, never an event handler or
  `id` / `style` / `className` / `role`, on both a node and an edge). A custom node is not given
  `sourcePosition` or `targetPosition` (it now gets `selectable`, `draggable`, `deletable`, `dragging`,
  `dragHandle`, `parentId`, `zIndex`, `width` and `height`, alongside `id`, `data`, `type`, `selected`,
  `isConnectable` and its absolute position). `fitView` has no `ease` / `interpolate`.

Counts are not weights — most of the list is niche — but it is a list to check your own code against before
swapping. Defaults that differ: `fitView` keeps a 40 px margin unless you pass a `padding` ratio, and `deleteKeyCode`
is `'Backspace'` alone. Nodes and edges do not get React Flow's `role`, `aria-roledescription` or live region.

## Server rendering

Works on React 18 and 19, including hydration. Nothing measures until the client mounts, so edges are
first drawn from each node's declared `width`/`height` and settle once measured.

## Development

```bash
pnpm install
pnpm dev         # the demo, in demo/
pnpm typecheck
pnpm test
pnpm build       # dist/: ESM, CJS and type declarations
pnpm size        # what a small consumer pays: the gzip size of the subset it imports, whole canvas and core
node scripts/size-dist.mjs   # the same, from the built package (after pnpm build), which is what an app really bundles
node scripts/audit-react-flow.mjs <path>   # how much of React Flow's API this has, from its own type declarations
```

[`plan.md`](plan.md) has the design, the places it deliberately departs from it, and what is left.

## License

MIT, see [LICENSE.md](LICENSE.md). A few lines of `src/paths.ts` — the bezier control-point formula, and
where its label sits on the curve — are adapted from React Flow, credited in [NOTICE.md](NOTICE.md).
