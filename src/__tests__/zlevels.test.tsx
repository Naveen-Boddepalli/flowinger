import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import {
  FlowingerCanvas,
  Handle,
  Position,
  type ConnectionLineProps,
  type Edge,
  type Node,
} from '../index.ts';

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const layers = (c: ParentNode) => [...c.querySelectorAll<SVGSVGElement>('svg.flowinger-edges')];
const z = (el: Element) => (el as HTMLElement | SVGElement).style.zIndex;
const node = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
const idsIn = (svg: Element) =>
  [...svg.querySelectorAll('[data-testid^="edge-"]')].map((g) => g.getAttribute('data-testid')?.replace('edge-', ''));

const n = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  width: 100,
  height: 40,
  data: {},
  ...extra,
});

describe('where an edge is stacked', () => {
  it('is one layer under every node when nothing is nested — as before', () => {
    const { container } = render(
      <FlowingerCanvas nodes={[n('a', 0, 0), n('b', 0, 200)]} edges={[{ id: 'e', source: 'a', target: 'b' }]} />,
    );
    expect(layers(container)).toHaveLength(1);
    expect(z(layers(container)[0] as Element)).toBe('0');
  });

  it('is still one layer with no edges at all', () => {
    const { container } = render(<FlowingerCanvas nodes={[n('a', 0, 0)]} />);
    expect(layers(container)).toHaveLength(1);
  });

  it('puts an edge into a group’s child above the group, so it can be clicked there', () => {
    const nodes = [n('g', 0, 0, { width: 400, height: 300 }), n('k', 50, 50, { parentId: 'g' }), n('out', 0, 500)];
    const edges: Edge[] = [
      { id: 'into', source: 'out', target: 'k' },
      { id: 'plain', source: 'out', target: 'g' },
    ];
    const { container } = render(<FlowingerCanvas nodes={nodes} edges={edges} />);
    expect(z(node(container, 'g'))).toBe('1');
    expect(z(node(container, 'k'))).toBe('2');
    const [low, high] = layers(container);
    expect(layers(container)).toHaveLength(2);
    // The edge to the child is above the group (1) and no higher than the child it ends at (2).
    expect(z(high as Element)).toBe('2');
    expect(idsIn(high as Element)).toEqual(['into']);
    expect(z(low as Element)).toBe('0');
    expect(idsIn(low as Element)).toEqual(['plain']);
  });

  it('follows the deeper of the two nodes', () => {
    const nodes = [n('p', 0, 0), n('c', 5, 5, { parentId: 'p' }), n('g', 5, 5, { parentId: 'c' }), n('x', 0, 300)];
    const edges: Edge[] = [
      { id: 'to-c', source: 'x', target: 'c' },
      { id: 'to-g', source: 'x', target: 'g' },
    ];
    const { container } = render(<FlowingerCanvas nodes={nodes} edges={edges} />);
    expect(layers(container).map(z)).toEqual(['2', '3']);
    expect(idsIn(layers(container)[1] as Element)).toEqual(['to-g']);
  });

  it('takes an edge’s own zIndex, and a node’s', () => {
    const nodes = [n('a', 0, 0, { zIndex: 7 }), n('b', 0, 200), n('c', 0, 400)];
    const edges: Edge[] = [
      { id: 'raised', source: 'a', target: 'b' }, // follows a's 7
      { id: 'chosen', source: 'b', target: 'c', zIndex: 4 },
    ];
    const { container } = render(<FlowingerCanvas nodes={nodes} edges={edges} />);
    expect(layers(container).map(z)).toEqual(['4', '7']);
  });

  it('keeps edges of one level together, and in their own order', () => {
    const nodes = [n('p', 0, 0), n('c', 5, 5, { parentId: 'p' }), n('x', 0, 300), n('y', 300, 300)];
    const edges: Edge[] = [
      { id: 'a', source: 'x', target: 'c' },
      { id: 'b', source: 'x', target: 'y' },
      { id: 'c', source: 'y', target: 'c' },
    ];
    const { container } = render(<FlowingerCanvas nodes={nodes} edges={edges} />);
    const [low, high] = layers(container);
    expect(idsIn(low as Element)).toEqual(['b']);
    expect(idsIn(high as Element)).toEqual(['a', 'c']);
  });

  it('shares its arrowheads and animation across layers, from the lowest', () => {
    const nodes = [n('p', 0, 0), n('c', 5, 5, { parentId: 'p' }), n('x', 0, 300)];
    const edges: Edge[] = [
      { id: 'flat', source: 'x', target: 'p', markerEnd: 'arrowclosed', animated: true },
      { id: 'deep', source: 'x', target: 'c', markerEnd: 'arrowclosed' },
    ];
    const { container } = render(<FlowingerCanvas nodes={nodes} edges={edges} />);
    const [low, high] = layers(container);
    expect(low?.querySelector('defs')).not.toBeNull();
    expect(high?.querySelector('defs')).toBeNull();
    expect(low?.querySelectorAll('style')).toHaveLength(1);
    expect(high?.querySelector('style')).toBeNull();
    // Every arrowhead an edge points at exists somewhere in the document.
    for (const path of container.querySelectorAll('[marker-end]')) {
      const id = /url\(#(.+)\)/.exec(path.getAttribute('marker-end') ?? '')?.[1] ?? '';
      expect(container.querySelector(`marker[id="${id}"]`)).not.toBeNull();
    }
  });

  describe('the line being dragged', () => {
    afterEach(() => {
      Reflect.deleteProperty(document, 'elementFromPoint');
    });
    it('is drawn in the highest layer', () => {
      function Ports() {
        return <Handle id="out" type="source" position={Position.Bottom} />;
      }
      function Line(_p: ConnectionLineProps) {
        return <circle data-testid="line" r={3} />;
      }
      const nodes = [
        { ...n('p', 0, 0), type: 'ports' },
        n('c', 5, 5, { parentId: 'p' }),
        n('x', 0, 300),
      ];
      const edges: Edge[] = [
        { id: 'flat', source: 'x', target: 'p' },
        { id: 'deep', source: 'x', target: 'c' },
      ];
      const { container } = render(
        <FlowingerCanvas
          nodes={nodes}
          edges={edges}
          nodeTypes={{ ports: Ports }}
          nodesConnectable
          connectionLineComponent={Line}
        />,
      );
      Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
      fireEvent.pointerDown(must(container, '[data-handleid="out"]'), { pointerId: 1, button: 0, clientX: 50, clientY: 40 });
      const [, high] = layers(container);
      expect(high?.querySelector('[data-testid="line"]')).not.toBeNull();
      expect(layers(container)[0]?.querySelector('[data-testid="line"]')).toBeNull();
    });
  });
});
