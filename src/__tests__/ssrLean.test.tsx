// @vitest-environment node
// The lean canvas installs its features while rendering, and a server has neither layout effects nor a
// `document` — so this runs where there really is none.
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  FlowingerCore,
  Handle,
  Position,
  allFeatures,
  type Edge,
  type Node,
} from '../index.ts';

const types = {
  p: () => (
    <div>
      <Handle id="out" type="source" position={Position.Bottom} />
      <Handle id="in" type="target" position={Position.Top} />
    </div>
  ),
};
const nodes: Node[] = [
  { id: 'a', type: 'p', position: { x: 10, y: 20 }, width: 100, height: 40, data: {} },
  { id: 'b', type: 'p', position: { x: 10, y: 220 }, width: 100, height: 40, data: {} },
];
const edges: Edge[] = [{ id: 'ab', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in', label: 'joins' }];

describe('server rendering the lean canvas', () => {
  it('has no document, as a server has none', () => {
    expect(typeof document).toBe('undefined');
  });

  it('renders nodes, an edge and its label, framed as the client will be', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const html = renderToString(
      <FlowingerCore nodes={nodes} edges={edges} nodeTypes={types} nodesConnectable={false} />,
    );
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
    errors.mockRestore();
    warnings.mockRestore();
    expect(html).toContain('translate(10px, 20px)');
    expect(html).toContain('translate(0px, 0px) scale(1)');
    expect(html).toMatch(/M 60\.00 60\.00 C[^"]*60\.00 220\.00/);
    expect(html).toContain('data-handleid="out"');
  });

  it('draws handles that only draw, with no feature to start a connection', () => {
    const html = renderToString(<FlowingerCore nodes={nodes} nodeTypes={types} nodesConnectable />);
    expect(html).not.toContain('data-connectable');
  });

  it('with every feature, installs them while rendering — a handle is connectable on the first paint', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = renderToString(
      <FlowingerCore nodes={nodes} edges={edges} nodeTypes={types} nodesConnectable nodesDraggable features={allFeatures} />,
    );
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    expect(html).toContain('data-connectable="true"');
    expect(html).toContain('cursor:grab');
  });
});
