import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { useFlowingerStore } from '../context.ts';
import { FlowingerCanvas, FlowingerProvider, Handle, Position, type Edge, type Node } from '../index.ts';

// An edge that names a handle no <Handle> registered (and the node does not declare in `handles`) meets the side
// the edge runs towards. Before 1.0 a few names chose a side instead — `in` / `top`, `out` / `bottom`, `prev` /
// `left`, `next` / `right` — a rule from before handles were measured, which React Flow does not have.

// 'a' above 'b': an edge from 'a' to 'b' runs down, so it leaves 'a' at the bottom.
const nodes = (type?: string): Node[] => [
  { id: 'a', type, position: { x: 0, y: 0 }, width: 100, height: 40, data: { label: 'A' } },
  { id: 'b', type, position: { x: 0, y: 200 }, width: 100, height: 40, data: { label: 'B' } },
];
const edges: Edge[] = [{ id: 'ab', source: 'a', target: 'b', sourceHandle: 'next' }];

function WithNext() {
  return (
    <>
      <Handle type="target" position={Position.Top} />
      <Handle id="next" type="source" position={Position.Right} />
    </>
  );
}

/** Where the edge's path starts: `M x y …`. */
const start = (container: Element): [number, number] => {
  const d = container.querySelector('[data-testid="rf__edge-ab"] .react-flow__edge-path')?.getAttribute('d') ?? '';
  const [, x, y] = /^M\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(d) ?? [];
  return [Number(x), Number(y)];
};

function draw(type?: string) {
  let store: ReturnType<typeof useFlowingerStore> | undefined;
  const Grab = () => {
    store = useFlowingerStore();
    return null;
  };
  const view = render(
    <FlowingerProvider>
      <FlowingerCanvas nodes={nodes(type)} edges={edges} nodeTypes={{ withNext: WithNext }}>
        <Grab />
      </FlowingerCanvas>
    </FlowingerProvider>,
  );
  // The browser measures the node; the edges are drawn again.
  act(() => store?.setSize('a', 100, 40));
  return view;
}

describe('an edge naming a handle the node does not have', () => {
  it('meets the side the edge runs towards, not one guessed from the name', () => {
    const { container } = draw();
    // `next` once meant the right side (100, 20); now the edge leaves 'a' at the middle of its bottom.
    expect(start(container)).toEqual([50, 40]);
  });

  it('meets the handle when the node has one of that id', () => {
    const { container } = draw('withNext');
    const [x] = start(container);
    expect(x).toBeGreaterThanOrEqual(100); // the right side, where the <Handle> is
  });

  it('says nothing about it, in development or on a server', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    draw();
    const html = renderToString(<FlowingerCanvas nodes={nodes()} edges={edges} />);
    expect(html).toContain('rf__edge-ab');
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('from the name'))).toEqual([]);
    warn.mockRestore();
  });
});
