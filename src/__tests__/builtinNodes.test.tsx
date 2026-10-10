import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import * as ReactFlowLib from '@xyflow/react';
import {
  FlowingerCanvas,
  FlowingerCore,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from '../index.ts';

// React Flow's `default`, `input` and `output` node types differ in the handles they have, and put them on
// the sides `sourcePosition` and `targetPosition` name. A node of no type of its own is one of them.

const at = (id: string, type: string | undefined, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x: 0, y: 0 },
  width: 100,
  height: 40,
  data: { label: id },
  ...(type === undefined ? {} : { type }),
  ...extra,
});

/** `source:bottom`, `target:top`… for every handle of a node, in a stable order. */
const handlesOf = (root: ParentNode, id: string): string[] =>
  [...root.querySelectorAll(`[data-id="${id}"] .react-flow__handle`)]
    .map((h) => `${h.getAttribute('data-handletype') ?? (h.classList.contains('source') ? 'source' : 'target')}:${h.getAttribute('data-handlepos') ?? ''}`)
    .sort();

/** The same, from React Flow's own markup, which spells the type as a class. */
const rfHandlesOf = (root: ParentNode, id: string): string[] =>
  [...root.querySelectorAll(`[data-id="${id}"] .react-flow__handle`)]
    .map((h) => `${h.classList.contains('source') ? 'source' : 'target'}:${h.getAttribute('data-handlepos') ?? ''}`)
    .sort();

function flowinger(nodes: Node[], edges: Edge[] = []) {
  return render(
    <div style={{ width: 800, height: 600 }}>
      <FlowingerCanvas nodes={nodes} edges={edges} />
    </div>,
  ).container;
}

function reactFlow(nodes: Node[]) {
  return render(
    <ReactFlowLib.ReactFlowProvider>
      <div style={{ width: 800, height: 600 }}>
        <ReactFlowLib.ReactFlow nodes={nodes as never} edges={[]} />
      </div>
    </ReactFlowLib.ReactFlowProvider>,
  ).container;
}

describe('a node with no component of its own', () => {
  it('has a target handle at the top and a source handle at the bottom', () => {
    const c = flowinger([at('a', undefined)]);
    expect(handlesOf(c, 'a')).toEqual(['source:bottom', 'target:top']);
  });

  it('is an `input` — a start, with only a source — or an `output` — an end, with only a target', () => {
    const c = flowinger([at('i', 'input'), at('o', 'output')]);
    expect(handlesOf(c, 'i')).toEqual(['source:bottom']);
    expect(handlesOf(c, 'o')).toEqual(['target:top']);
  });

  it('is a `group` — a container — with no handle at all', () => {
    const c = flowinger([at('g', 'group', { width: 300, height: 200 })]);
    expect(handlesOf(c, 'g')).toEqual([]);
  });

  it('puts its handles where `sourcePosition` and `targetPosition` say', () => {
    const c = flowinger([
      at('a', undefined, { sourcePosition: Position.Right, targetPosition: Position.Left }),
      at('i', 'input', { sourcePosition: Position.Left }),
      at('o', 'output', { targetPosition: Position.Bottom }),
    ]);
    expect(handlesOf(c, 'a')).toEqual(['source:right', 'target:left']);
    expect(handlesOf(c, 'i')).toEqual(['source:left']);
    expect(handlesOf(c, 'o')).toEqual(['target:bottom']);
  });

  it('puts its handles where React Flow\'s built-in nodes put theirs', () => {
    const nodes = [
      at('d', undefined),
      at('input', 'input'),
      at('output', 'output'),
      at('default', 'default'),
      at('h', 'default', { sourcePosition: Position.Right, targetPosition: Position.Left }),
      at('hi', 'input', { sourcePosition: Position.Left }),
      at('ho', 'output', { targetPosition: Position.Top }),
    ];
    const ours = flowinger(nodes);
    const theirs = reactFlow(nodes);
    for (const { id } of nodes) {
      const expected = rfHandlesOf(theirs, id);
      // Not vacuous: the oracle draws handles for every one of these.
      expect(expected.length, `React Flow draws handles for ${id}`).toBeGreaterThan(0);
      expect(handlesOf(ours, id), `handles of ${id}`).toEqual(expected);
    }
  });
});

describe('a component of your own', () => {
  it('replaces the built-in type of the same name, handles and all', () => {
    const Mine = ({ id }: NodeProps) => <span data-testid={`mine-${id}`}>mine</span>;
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={[at('a', 'input')]} nodeTypes={{ input: Mine }} />
      </div>,
    );
    expect(container.querySelector('[data-testid="mine-a"]')).not.toBeNull();
    expect(handlesOf(container, 'a')).toEqual([]);
  });

  it('is given the node\'s `sourcePosition` and `targetPosition`', () => {
    let seen: Pick<NodeProps, 'sourcePosition' | 'targetPosition'> | undefined;
    const Mine = ({ sourcePosition, targetPosition }: NodeProps) => {
      seen = { sourcePosition, targetPosition };
      return null;
    };
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore
          nodes={[at('a', 'mine', { sourcePosition: Position.Right, targetPosition: Position.Left })]}
          nodeTypes={{ mine: Mine }}
        />
      </div>,
    );
    expect(seen).toEqual({ sourcePosition: 'right', targetPosition: 'left' });
  });

  it('gets neither, and no default, where the node names none', () => {
    let seen: Pick<NodeProps, 'sourcePosition' | 'targetPosition'> | undefined;
    const Mine = ({ sourcePosition, targetPosition }: NodeProps) => {
      seen = { sourcePosition, targetPosition };
      return null;
    };
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={[at('a', 'mine')]} nodeTypes={{ mine: Mine }} />
      </div>,
    );
    expect(seen).toEqual({ sourcePosition: undefined, targetPosition: undefined });
  });
});

describe('edges between built-in nodes', () => {
  it('leave a node on the side its `sourcePosition` names, and arrive on its `targetPosition`', () => {
    const nodes = [
      at('a', undefined, { sourcePosition: Position.Right, targetPosition: Position.Left }),
      at('b', undefined, {
        position: { x: 300, y: 0 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      }),
    ];
    const c = flowinger(nodes, [{ id: 'ab', source: 'a', target: 'b' }]);
    const d = c.querySelector('[data-testid="rf__edge-ab"] .react-flow__edge-path')?.getAttribute('d') ?? '';
    const [sx, sy, , , , , tx, ty] = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    // Unmeasured (jsdom has no layout), a handle is taken to sit at the middle of its side: a's right is
    // x = 100, b's left x = 300, both at half the 40-unit height.
    expect([sx, sy, tx, ty]).toEqual([100, 20, 300, 20]);
  });
});
