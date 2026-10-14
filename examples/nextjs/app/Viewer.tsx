'use client';

import { Background, FlowingerCanvas, FlowingerProvider, type Edge, type Node, type Viewport } from 'flowinger';
import { nodeTypes } from './StepNode';

/**
 * The read-only diagram. It is a client component only because it names a node type, which is a function and
 * cannot be sent from the server; its props are plain data, and its HTML is rendered on the server all the same.
 */
export function Viewer({ nodes, edges, viewport }: { nodes: Node[]; edges: Edge[]; viewport: Viewport }) {
  return (
    <FlowingerProvider>
      <FlowingerCanvas nodes={nodes} edges={edges} nodeTypes={nodeTypes} defaultViewport={viewport} fitView>
        <Background />
      </FlowingerCanvas>
    </FlowingerProvider>
  );
}
