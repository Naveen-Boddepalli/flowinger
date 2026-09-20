import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import {
  Controls,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  Position,
  useStore,
  useViewport,
  type Edge,
  type Node,
  type NodeProps,
} from '../index.ts';

function PortNode({ data }: NodeProps) {
  return (
    <div>
      <Handle id="in" type="target" position={Position.Top} />
      <span>{String(data.label)}</span>
      <Handle id="out" type="source" position={Position.Bottom} />
    </div>
  );
}

function Probe() {
  const panZoom = useStore((s) => s.panZoom);
  const viewport = useViewport();
  return <output>{`${panZoom === null ? 'unmounted' : 'mounted'} ${String(viewport.zoom)}`}</output>;
}

const nodes: Node[] = [
  { id: 'a', type: 'port', position: { x: 10, y: 20 }, width: 100, height: 40, data: { label: 'alpha' } },
  { id: 'b', type: 'port', position: { x: 10, y: 220 }, width: 100, height: 40, data: { label: 'beta' } },
];
const edges: Edge[] = [
  {
    id: 'e',
    source: 'a',
    target: 'b',
    sourceHandle: 'out',
    targetHandle: 'in',
    label: 'joins',
    markerEnd: 'arrowclosed',
  },
];

const tree = (
  <FlowingerProvider initialViewport={{ x: 5, y: 6, zoom: 2 }}>
    <FlowingerCanvas
      nodes={nodes}
      edges={edges}
      nodeTypes={{ port: PortNode }}
      keyboardNavigation
    >
      <Probe />
    </FlowingerCanvas>
    <Controls />
  </FlowingerProvider>
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Flowinger server rendering', () => {
  it('renders to a string without a DOM, and without React warnings', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = renderToString(tree);
    expect(errors).not.toHaveBeenCalled();

    expect(html).toContain('alpha');
    expect(html).toContain('beta');
    expect(html).toContain('joins'); // the edge label
    expect(html).toContain('Zoom in'); // Controls
    expect(html).toContain('translate(10px, 20px)'); // a node, where the layout put it
  });

  it('writes the initial viewport into the markup, so the first paint is already framed', () => {
    const html = renderToString(tree);
    expect(html).toContain('translate(5px, 6px) scale(2)');
  });

  it('draws edges from declared sizes, before anything can be measured', () => {
    const html = renderToString(tree);
    // a's bottom-middle is (10 + 50, 20 + 40); b's top-middle is (60, 220).
    expect(html).toMatch(/M 60\.00 60\.00 C[^"]*60\.00 220\.00/);
    expect(html).toContain('marker-end="url(#');
  });

  it('reports "not mounted" on the server, where no canvas has attached', () => {
    expect(renderToString(tree)).toContain('unmounted 2');
  });

  it('hydrates the server markup without a mismatch or a warning', async () => {
    const html = renderToString(tree);
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, tree);
    });

    expect(errors).not.toHaveBeenCalled();
    // …and it is alive afterwards: mounted, with its handles measured or not,
    // and the framing intact.
    expect(container.textContent).toContain('mounted 2');
    expect(container.querySelector<HTMLElement>('.flowinger-viewport')?.style.transform).toBe(
      'translate(5px, 6px) scale(2)',
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
