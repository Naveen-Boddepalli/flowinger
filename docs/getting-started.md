# Getting started

[← Documentation](README.md) · From install to an editable diagram, and the things that most often trip a first
run.

## Install

```bash
npm install flowinger      # or: pnpm add flowinger · yarn add flowinger
```

React 18 or 19 is a peer dependency. The package is ES modules with TypeScript declarations — Node's `require` loads
them on Node 20.19+ or 22.12+, and Jest needs [a setting](upgrading.md#5-es-modules-only) — and
needs no stylesheet.

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

## A first diagram

Nodes are plain objects and edges name the nodes they join. A node's `type` picks a React component from
`nodeTypes`; with none, a node is drawn as a plain box with its `id` and `data.label`.

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

`FlowingerProvider` is optional — it lets something *outside* the canvas (a toolbar, the `Controls`) drive it.
Without one, the canvas makes its own.

## Make it interactive

By default a canvas only pans and zooms. Dragging, connecting and selecting are switched on by props, and the
canvas **reports** what happened rather than editing your arrays — so an editor keeps the graph in state and
applies the changes it is told about:

```tsx
import {
  FlowingerCanvas, addEdge, useEdgesState, useNodesState,
} from 'flowinger';

function Editor() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  return (
    <FlowingerCanvas
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={(connection) => setEdges((current) => addEdge(connection, current))}
      nodesDraggable
      nodesConnectable
      elementsSelectable
    />
  );
}
```

Giving `onNodesChange` is what makes the flow *controlled*. The [API reference](api.md#controlled-flows) has
the change types, deleting, and the instance methods that edit the graph.

## Where positions come from

Flowinger draws what it is given; it does not lay a graph out. Compute `x` / `y` with a layout library and feed
them in — the [layouts example](../examples/layouts) shows `d3-hierarchy`, `dagre` and `elkjs` behind one
function signature.

## Style it

The default node, `Controls` and edges read CSS variables with fallbacks, so they need no stylesheet:

```css
.my-diagram {
  --flowinger-surface: #ffffff;
  --flowinger-border: #cbd5e1;
  --flowinger-text: #0f172a;
}
```

[Theming](theming.md) lists them all. Nodes you supply are yours to style, and the elements carry
`react-flow__*` class names as well as `flowinger-*` ones.

## When something is not as expected

| You see | Why |
|---|---|
| **Nothing is drawn** | The canvas fills its parent, so the parent needs a height. |
| **Nodes will not drag, select or connect** | Those are off until you set `nodesDraggable`, `elementsSelectable`, `nodesConnectable`. React Flow's are on by default. |
| **A prop does nothing on `FlowingerCore`** | It belongs to a feature you did not pass. In development the console says which. [Features](features.md) lists them. |
| **Edges attach to the wrong place** | Give each `Handle` an `id` and name it in the edge's `sourceHandle` / `targetHandle`. An edge with none takes the first handle of that type. |
| **`fitView` did not frame the diagram** | It frames once, when every node is measured and the pane has a size. Call `fitView()` on the instance to frame again. |
| **It works in the browser but not in a test** | jsdom has no layout, so nothing is measured; give nodes a `width` and `height`. |

## Next

- [Components and hooks](components.md) — everything the package exports, and what it is for
- [Features](features.md) — keep the core small, and add only what you use
- [Migrating from React Flow](migrating-from-react-flow.md) — if you are coming from it
