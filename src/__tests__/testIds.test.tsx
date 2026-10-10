import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import * as ReactFlowLib from '@xyflow/react';
import {
  Background,
  Controls,
  FlowingerCanvas,
  FlowingerProvider,
  MiniMap,
  type Edge,
  type Node,
} from '../index.ts';

// Code that tests a React Flow app selects on its `data-testid`s as well as its class names (the class
// names are kept for that reason). So the ids are compared with the real library's, not with a list.

const nodes: Node[] = [
  { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
  { id: 'b', position: { x: 300, y: 0 }, width: 100, height: 40, data: {} },
];
const edges: Edge[] = [{ id: 'a-b', source: 'a', target: 'b' }];

/**
 * React Flow draws an edge only once it knows where the handles are, which a browser tells it by measuring;
 * with no layout here, it is told — the way its server-rendering mode takes them (`width`, `height`, `handles`).
 */
const withHandles = nodes.map((n) => ({
  ...n,
  handles: [
    { type: 'target', position: 'left', x: 0, y: 17, width: 6, height: 6 },
    { type: 'source', position: 'right', x: 94, y: 17, width: 6, height: 6 },
  ],
}));

const testIds = (root: ParentNode): string[] =>
  [...root.querySelectorAll('[data-testid]')]
    .map((el) => el.getAttribute('data-testid') ?? '')
    // A connection line, a handle or an anchor of flowinger's own is not React Flow's to have.
    .filter((id) => id.startsWith('rf__'))
    .sort();

describe('the test ids on what is drawn', () => {
  it('are the ones React Flow stamps: the wrapper, a node, an edge, controls, minimap and background', () => {
    const flowinger = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerProvider>
          <FlowingerCanvas nodes={nodes} edges={edges}>
            <Background />
            <Controls />
            <MiniMap />
          </FlowingerCanvas>
        </FlowingerProvider>
      </div>,
    );
    const reactFlow = render(
      <div style={{ width: 800, height: 600 }}>
        <ReactFlowLib.ReactFlowProvider>
          <ReactFlowLib.ReactFlow nodes={withHandles as never} edges={edges as never} width={800} height={600}>
            <ReactFlowLib.Background />
            <ReactFlowLib.Controls />
            <ReactFlowLib.MiniMap />
          </ReactFlowLib.ReactFlow>
        </ReactFlowLib.ReactFlowProvider>
      </div>,
    );

    const theirs = testIds(reactFlow.container);
    // Not vacuous: the oracle really does render all of them.
    expect(theirs).toEqual(
      ['rf__background', 'rf__controls', 'rf__edge-a-b', 'rf__minimap', 'rf__node-a', 'rf__node-b', 'rf__wrapper'],
    );
    expect(testIds(flowinger.container)).toEqual(theirs);
  });

  it('put the node id on the node itself, and the edge id on the edge\'s group', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={nodes} edges={edges} />
      </div>,
    );
    const node = container.querySelector('[data-testid="rf__node-b"]');
    expect(node?.getAttribute('data-id')).toBe('b');
    const edge = container.querySelector('[data-testid="rf__edge-a-b"]');
    expect(edge?.tagName.toLowerCase()).toBe('g');
    expect(edge?.classList.contains('react-flow__edge')).toBe(true);
  });
});
