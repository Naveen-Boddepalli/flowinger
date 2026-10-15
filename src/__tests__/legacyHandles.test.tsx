import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { useFlowingerStore } from '../context.ts';
import { resetLegacyHandleWarning } from '../devWarnings.ts';
import { FlowingerCanvas, FlowingerProvider, Handle, Position, type Edge, type Node } from '../index.ts';

// An edge that names a handle no <Handle> registered meets a side guessed from the name (`next` → right…), a rule
// from before handles were measured. 1.0 removes it; until then development says so — once the node has
// mounted, so a first render or a server render, before handles register, is not mistaken for it.

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

function draw(type?: string) {
  let store: ReturnType<typeof useFlowingerStore> | undefined;
  const Grab = () => {
    store = useFlowingerStore();
    return null;
  };
  render(
    <FlowingerProvider>
      <FlowingerCanvas nodes={nodes(type)} edges={edges} nodeTypes={{ withNext: WithNext }}>
        <Grab />
      </FlowingerCanvas>
    </FlowingerProvider>,
  );
  // The browser measures the node; the edges are drawn again.
  act(() => store?.setSize('a', 100, 40));
}

describe('an edge drawn by the old handle-name rule', () => {
  const warned = () => vi.spyOn(console, 'warn').mockImplementation(() => {});
  const aboutNames = (warn: ReturnType<typeof warned>) =>
    warn.mock.calls.map((c) => String(c[0])).filter((s) => s.includes('guesses a side from the name'));

  afterEach(() => {
    resetLegacyHandleWarning();
    vi.restoreAllMocks();
  });

  it('is named, with the side it meets, the side 1.0 gives it, and the handle to add — once a page', () => {
    const warn = warned();
    draw();
    draw();
    const said = aboutNames(warn);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('handle "next" on node "a"');
    expect(said[0]).toContain("meets the node's right side");
    expect(said[0]).toContain('<Handle id="next" position={Position.Right} />');
    expect(said[0]).toMatch(/will meet the (top|bottom|left) side instead/);
  });

  it('is not said when the node has a <Handle> of that id — though the first render draws the edge before it registers', () => {
    const warn = warned();
    draw('withNext');
    expect(aboutNames(warn)).toHaveLength(0);
  });

  it('is not said by a server render, where nothing mounts', () => {
    const warn = warned();
    const html = renderToString(<FlowingerCanvas nodes={nodes()} edges={edges} />);
    expect(html).toContain('rf__edge-ab');
    expect(aboutNames(warn)).toHaveLength(0);
  });
});
