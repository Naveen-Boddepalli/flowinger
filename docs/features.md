# Features: pay for what you use

[← Documentation](README.md) · The canvas is a small core plus opt-in features, so an app that only shows a graph does not carry the code for editing one.


`FlowingerCanvas` (alias `ReactFlow`) does everything documented in these pages, and is what most apps want. An app that only
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

With no features `FlowingerCore` costs about 17.5 kB gzipped (27 for the whole canvas); each feature you name adds
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
| `panKeyFeature` | A held key turns a drag into a pan, even where `panOnDrag` is off. Off unless `panActivationKeyCode` is given (React Flow's own default is `'Space'`) — it listens for keys, about 0.6 kB a canvas that never wants it should not carry | `panActivationKeyCode` |

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
  features it builds on. The type and its slots are documented in [`src/features.ts`](../src/features.ts).
- The development warnings read `process.env.NODE_ENV`, which a bundler replaces (as it does for React); a
  production build drops them.
