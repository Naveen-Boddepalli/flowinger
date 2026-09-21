# Flowinger

A small, dependency-free node-graph renderer for React. HTML nodes over SVG edges, with pan, zoom,
drag, touch pinch, arrowheads, labels, and an API shaped like [React Flow](https://reactflow.dev)'s.
About 11 kB gzipped, everything included; the only peer dependencies are `react` and `react-dom` (18 or 19).

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

Flowinger is not on npm yet; install it from GitHub. Its `dist/` is built on install, which package
managers gate behind an explicit opt-in:

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
| `FlowingerCanvas` | The canvas. Pan by dragging, zoom with the wheel or a pinch, drag nodes if you allow it. |
| `FlowingerProvider` | Optional: owns the state, so a toolbar *outside* the canvas can drive it. The canvas makes its own when there is none. |
| `Handle` | A connection point on a node. Edges attach to the handle they name, wherever it is drawn. |
| `BaseEdge` | How every built-in edge is drawn (a path, an optional label). A custom edge can render it and add to it. |
| `Background`, `Controls` | A dot/line/cross backdrop; zoom and fit buttons. Both go inside the provider. |
| `MiniMap` | An overview of the whole graph with the visible region cut out of a dimming mask. Click or drag on it to move the view; it holds still during a drag. Props: `width`, `height`, `nodeColor` (a colour or a function of the node), `maskColor`, `pannable`, `ariaLabel`. Goes inside the provider, next to the canvas or inside it. |
| `useFlowinger()`, `useViewport()` | The viewport controls (`setViewport`, `zoomIn`, `zoomOut`, `fitView`, `getViewport`), and the current viewport. |
| `getBezierPath`, `getStraightPath`, `getSmoothStepPath` | The path maths, each returning `[path, labelX, labelY]`. |

### `FlowingerCanvas` props

| Prop | Default | |
|---|---|---|
| `nodes`, `edges`, `nodeTypes` | | The graph. `nodeTypes` maps `node.type` to your component. |
| `edgeTypes` | | Custom edge components by `edge.type`, receiving `EdgeProps` (where each end attaches, which way it leaves, `data`, `label`, marker references). A key overrides a built-in of the same name; an unknown `type` draws a bezier. |
| `minZoom`, `maxZoom` | `0.05`, `2` | |
| `nodesDraggable` | `false` | A node's own `draggable` overrides it, either way. |
| `panOnDrag` | `true` | `false`, or a list of mouse buttons, e.g. `[1]` for middle only. |
| `zoomOnScroll`, `zoomOnPinch` | `true` | |
| `translateExtent` | none | `[[minX, minY], [maxX, maxY]]`: keeps the view inside it. |
| `keyboardNavigation` | `false` | Makes the canvas a tab stop: arrows pan (Shift for more), `+` `-` zoom, `0` fits. Name it with `ariaLabel`. |
| `elementsSelectable` | `false` | A click selects a node (Shift/Ctrl/⌘ adds or removes), a click on the canvas clears, and nodes become focusable: Enter or Space selects, Escape clears (with `keyboardNavigation`). A node's own `selectable: false` opts it out. |
| `nodesConnectable` | `false` | Handles become drag handles and drop targets: drag from one to another to make a connection. A handle's own `isConnectable={false}` opts it out. |
| `onConnect`, `isValidConnection` | | `onConnect({ source, target, sourceHandle, targetHandle })` — always source → target, whichever end the drag began at. `isValidConnection` can veto, and decides whether the line snaps to a handle. |
| `onSelectionChange`, `onNodeClick`, `onPaneClick` | | Selection is held by the engine; `onSelectionChange({ nodes })` tells you. A pan's closing click is not a pane click. |
| `onNodeDrag`, `onNodeDragStop`, `onInit` | | |

`nodes` is never mutated: a dragged position is kept internally, and a fresh layout from you wins over
it. **Edges**: `id`, `source`, `target`, `sourceHandle`, `targetHandle`, `type`
(`'bezier'` \| `'straight'` \| `'smoothstep'`), `label`, `markerStart`, `markerEnd`
(`'arrow'`, `'arrowclosed'`, or `{ type, color, width, height }`), `className`, `style`. Give a node
`width` and `height` if you know them; the engine measures the rendered size once it can.

### Handles

An edge names a handle by `id`; its end decides the type (`sourceHandle` finds a `source` handle). Name
none and it takes the first handle of that type. A handle moved with `style` (say `left: '30%'`) still
gets its edge, because the engine measures where each one is actually drawn.

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

## Theming

The default node, `Controls` and edges are styled inline from CSS variables, each with a fallback, so
they need no stylesheet and no utility framework. Set any of these on an ancestor:

`--flowinger-surface` · `--flowinger-surface-raised` · `--flowinger-border` · `--flowinger-text` ·
`--flowinger-text-dim` · `--flowinger-edge` · `--flowinger-selected` (a selected node, and the line you drag) ·
`--flowinger-radius`

Nodes you supply are yours to style. The elements carry `react-flow__*` class names as well as
`flowinger-*` ones, so existing stylesheets and tests that select on React Flow's keep working.

## Coming from React Flow

`ReactFlow`, `ReactFlowProvider`, `useReactFlow`, `useStore` (only `panZoom` and `isReady`), `Handle`,
`Position`, `Background`, `BackgroundVariant`, `MarkerType` and the `Node`/`Edge`/`NodeProps` types are
all exported under React Flow's names. **Not built:** `animated` (style an edge with a class instead). Selection is uncontrolled and covers nodes only (not
edges), and dragging a selected node moves just that node.

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
```

[`plan.md`](plan.md) has the design, the places it deliberately departs from it, and what is left.
