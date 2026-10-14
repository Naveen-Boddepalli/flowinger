# A workflow builder in Next.js

[← Documentation](../README.md) · A workflow laid out and framed in a Server Component, so the diagram is in the
HTML and nothing moves when the page loads — then hydrated into an editor with undo. No stylesheet to import,
no `transpilePackages`. The whole app (App Router, Next.js 16) is [`examples/nextjs`](../../examples/nextjs).

## The server builds the graph

Lay the workflow out on the server, and work out the view for the canvas's known size with
`viewportForBounds`, so the first paint is already framed:

```ts
// app/pipeline.ts — server-only
import { getNodesBounds, viewportForBounds, type Edge, type Node } from 'flowinger';

export function pipeline() {
  const nodes: Node[] = steps.map((s, i) => ({
    id: s.id, type: 'step', position: { x: i * 220, y: 0 }, width: 180, height: 56, data: { label: s.label },
  }));
  const edges: Edge[] = links.map(([a, b]) => ({ id: `${a}-${b}`, source: a, target: b, markerEnd: 'arrowclosed' }));
  // What `fitView` will do in the browser, with its defaults (zoom 0.05–2), for the canvas's CSS size:
  const viewport = viewportForBounds(getNodesBounds(nodes), 900, 420, 0.05, 2);
  return { nodes, edges, viewport };
}
```

```tsx
// app/page.tsx — a Server Component
export default function Page() {
  const { nodes, edges, viewport } = pipeline();
  return (
    <div className="canvas">
      <Editor initialNodes={nodes} initialEdges={edges} viewport={viewport} />
    </div>
  );
}
```

## The editor is a client component

State and event handlers need the browser, so the editor starts with `'use client'`. It takes the server's
nodes as its starting state and its viewport as `defaultViewport`:

```tsx
'use client';
import { FlowingerCanvas, FlowingerProvider, addEdge, useEdgesState, useNodesState } from 'flowinger';
import { useUndoRedo } from 'flowinger/history';

function Canvas({ initialNodes, initialEdges, viewport }: Props) {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { takeSnapshot } = useUndoRedo({ enableShortcuts: true });
  return (
    <FlowingerCanvas
      nodes={nodes} edges={edges}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      onConnect={(c) => { takeSnapshot(); setEdges((es) => addEdge(c, es)); }}
      onNodeDragStart={() => takeSnapshot()}
      nodesDraggable nodesConnectable elementsSelectable
      defaultViewport={viewport}
      fitView
    />
  );
}

export function Editor(props: Props) {
  return <FlowingerProvider><Canvas {...props} /></FlowingerProvider>;
}
```

## Why it does not jump

The server renders nodes, edges and arrowheads into the HTML at the viewport it computed, and the browser's
first render matches it, so hydration changes nothing on screen. `fitView` then lands exactly where the server
framed it — and where the canvas is a different size (a phone), it frames the diagram again once measured.
Give the canvas's parent the width and height the viewport was computed for; the canvas fills its parent.

## Read next

- [Server rendering](../server-rendering.md) — what renders on the server, what waits for the client, and
  framing the first paint.
- [A flowchart editor with undo and redo](flowchart-editor.md).
