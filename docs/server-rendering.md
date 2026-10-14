# Server rendering

[← Documentation](README.md) · Shown working in [`examples/nextjs`](../examples/nextjs)

Flowinger renders to HTML on the server and hydrates on the client, on React 18 and 19, without a mismatch or a
warning. The nodes, edges, arrowheads, `Background`, `Controls` and `MiniMap` are all in the server's markup,
so the diagram is on the page before any JavaScript has run.

## What the server draws, and what waits

| | On the server | Once the client has mounted |
|---|---|---|
| Nodes | Drawn where `position` puts them, at their declared `width`/`height` | Measured, so content-sized nodes get their real size |
| Edges | Drawn between handles placed from the declared sizes | Redrawn to the measured handles, wherever CSS put them |
| The view | `defaultViewport` (or a controlled `viewport`), else `{ x: 0, y: 0, zoom: 1 }` | `fitView` runs once every node is measured and the pane has a size |
| HTML edge labels (`EdgeLabelRenderer`) | Not drawn: their layer is made in the browser | Drawn |
| `useStore((s) => s.panZoom)`, `viewportInitialized` | `null`, `false` | Set |

Two things follow:

1. **Give nodes a `width` and `height`** if you want the server's edges to land where the client's will. Without
   them the server takes each node as 150 × 40.
2. **The server cannot measure the page, so it cannot `fitView`.** Frame the first paint with
   `defaultViewport` instead. If the canvas has a known size, work that viewport out on the server, as below,
   and keep `fitView` on as well so a canvas of another size (a phone) is refitted once it is measured.

## Framing the first paint

`viewportForBounds` and `getNodesBounds` are plain functions, so they run on the server. With the canvas's size
and `fitView`'s defaults (zoom 0.05–2, a 40 px margin), they give exactly the viewport `fitView` will choose in
the browser. When the canvas is that size, nothing moves on load:

```ts
import { getNodesBounds, viewportForBounds, type Node } from 'flowinger';

const CANVAS = { width: 960, height: 360 }; // fixed in CSS

export function frame(nodes: Node[]) {
  return viewportForBounds(getNodesBounds(nodes), CANVAS.width, CANVAS.height, 0.05, 2);
}
```

```tsx
<FlowingerCanvas nodes={nodes} edges={edges} defaultViewport={frame(nodes)} fitView />
```

This works for a canvas inside a `FlowingerProvider` too: the canvas's `defaultViewport` (or `viewport`) is
what the server draws, not the provider's starting view.

## Next.js (App Router)

The package has no `'use client'` directive, so its functions can be called from a Server Component, as
above. Components that use hooks or take functions as props, like a canvas with `nodeTypes` or an editor with
`onNodesChange`, go in a client component, which Next.js still renders to HTML on the server:

```tsx
// app/Diagram.tsx
'use client';

import { Background, FlowingerCanvas, FlowingerProvider, type Edge, type Node, type Viewport } from 'flowinger';
import { nodeTypes } from './nodeTypes';

export function Diagram(props: { nodes: Node[]; edges: Edge[]; viewport: Viewport }) {
  return (
    <FlowingerProvider>
      <FlowingerCanvas {...props} nodeTypes={nodeTypes} defaultViewport={props.viewport} fitView>
        <Background />
      </FlowingerCanvas>
    </FlowingerProvider>
  );
}
```

```tsx
// app/page.tsx: a Server Component
import { Diagram } from './Diagram';
import { loadGraph } from './graph'; // a database, an API, a layout: anything server-side

export default async function Page() {
  const { nodes, edges, viewport } = await loadGraph();
  return (
    <div style={{ position: 'relative', height: 360 }}>
      <Diagram nodes={nodes} edges={edges} viewport={viewport} />
    </div>
  );
}
```

Nodes and edges cross from server to client as props, so keep them serialisable: plain data, no functions or
class instances in `data`. There is no stylesheet to import.

[`examples/nextjs`](../examples/nextjs) is all of this as an app: a pipeline laid out and framed on the server,
shown as a viewer and as an editor with undo. CI builds it against the packed library.
