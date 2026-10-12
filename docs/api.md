# API reference

[← Documentation](README.md) · The canvas, nodes and edges, handles, sub-flows, the instance and controlled flows.

## `FlowingerCanvas` props

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
| `defaultViewport` | | Where the view starts, once. Inside a `FlowingerProvider`, the canvas moves the provider's view there when it mounts. Ignored when `viewport` is given. |
| `viewport`, `onViewportChange` | | **Controlled view.** Given `viewport`, the canvas draws exactly that and moves nowhere on its own: a pan, a wheel zoom, a zoom button, `fitView` — each *asks* through `onViewportChange(viewport)` where it would go, and the view changes when `viewport` does (`const [viewport, setViewport] = useState(…)` and `onViewportChange={setViewport}` is the whole of it). An animation is followed frame by frame, and cut short if you move the view yourself. Without `viewport`, `onViewportChange` is a report: each move, after it is made. |
| `onMoveStart`, `onMove`, `onMoveEnd` | | The view is moving: `(event, viewport)`, `event` the pointer or wheel that moved it, or `null` for a call such as `fitView`. A run of wheel ticks is one move, ended once the wheel has been still for 150 ms; `useOnViewportChange` hears the same moves from anywhere inside a canvas. |
| `onNodeDoubleClick`, `onNodeContextMenu`, `onNodeMouseEnter` / `Move` / `Leave` | | And the same for edges (`onEdgeDoubleClick`…) and the pane (`onPaneContextMenu`, `onPaneMouseEnter`…), plus `onPaneScroll`. Needs `eventsFeature`; giving any edge event makes every edge take the pointer. |
| `selectionOnDrag`, `selectionMode` | `false`, `'full'` | With `elementsSelectable`, dragging on the empty canvas draws a selection box (Shift does it anyway; Ctrl/⌘ held at the start keeps what is already selected). `'full'` takes nodes wholly inside it, `'partial'` any it touches; edges with both ends inside come along. Pan with the middle/right button (`panOnDrag={[1, 2]}`) or the wheel. `onSelectionStart` / `onSelectionEnd` report it. |
| `nodeOrigin` | `[0, 0]` | Where on a node its `position` is: `[0, 0]` its top-left corner, `[0.5, 0.5]` its centre. A node's own `origin` wins. A child's `position` is relative to its parent's *top-left* (as in React Flow), whatever either's origin. Edges, hit testing, the minimap, `fitView`, extents and the resizer all use the drawn box. |
| `nodeDragThreshold` | `3` | Pixels a press must travel before it becomes a node drag; `0` is none. Needs `dragFeature`. |
| `panActivationKeyCode` | none | Holding this key turns a drag into a pan, even where `panOnDrag` is off (`'Space'` is React Flow's default; here it is off unless asked for). Needs `panKeyFeature`, which `FlowingerCanvas` has; a `FlowingerCore` says in development that it does nothing without it. |
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
| `deleteKeyCode` | `'Backspace'` | The key (or list of keys; `null` for none) that deletes the selection while focus is on the canvas, a node or an edge — never in a field. Deleting is *reported*: see [Controlled flows](#controlled-flows). |
| `onBeforeDelete`, `onNodesDelete`, `onEdgesDelete`, `onDelete` | | `onBeforeDelete({ nodes, edges })` may return `false`, a smaller `{ nodes, edges }`, or a promise of either; then the removals are reported and these are called with what went. |
| `onSelectionChange`, `onNodeClick`, `onEdgeClick`, `onPaneClick` | | `onSelectionChange({ nodes, edges })` tells you when the selection changes. A pan's closing click is not a pane click, and neither is a drag's a node click. |
| `onNodeDragStart`, `onNodeDrag`, `onNodeDragStop`, `onInit` | | The drag callbacks get `(event, node, nodes)`: `nodes` is everything being dragged. |

Props that appear in React Flow's API but that nothing here acts on — `colorMode`, `connectOnClick`,
`selectionKeyCode` and the rest — are accepted so code compiles, tagged `@unimplemented` in the types, and
warned about once in development: [the list, with what happens instead](react-flow-coverage.md#accepted-not-implemented).

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

## Nodes with no component of your own

A node whose `type` is missing, or names nothing in `nodeTypes`, is drawn as React Flow's built-ins are: its
`id`, its `data.label`, and handles — a **target** on `targetPosition` (default `'top'`) and a **source** on
`sourcePosition` (default `'bottom'`). `type: 'input'` is a start and has only the source, `type: 'output'` is
an end and has only the target, and `type: 'group'` is a container with none. A horizontal layout sets
`sourcePosition: 'right'` and `targetPosition: 'left'` on its nodes. A component of your own under any of those
names in `nodeTypes` replaces it (and is handed both fields, to use or not). As in React Flow, a
`nodeTypes.default` of your own is also what a node with no `type` is, and what a `type` nobody registered
falls back to — `input`, `output` and `group` stay the built-ins unless you register them.

## Handles

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

## Nodes inside nodes

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

## The instance

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

## Controlled flows

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
