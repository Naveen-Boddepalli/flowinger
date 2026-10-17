import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import {
  FlowingerCanvas,
  FlowingerCore,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type FlowingerProps,
  type Node,
} from '../index.ts';

// elevateNodesOnSelect, elevateEdgesOnSelect, zIndexMode, colorMode, defaultMarkerColor and
// connectionLineContainerStyle — React Flow's, from its source: a selected node is raised by 1000 (default on),
// a selected edge too (default off), 'manual' leaves stacking to zIndex alone, 'auto' keeps each group's
// subtree together; colorMode is a class (`light` / `dark`, `system` follows the OS) and the colours with it.

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const node = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
const z = (el: Element) => (el as HTMLElement | SVGElement).style.zIndex;
const layers = (c: ParentNode) => [...c.querySelectorAll<SVGSVGElement>('svg.flowinger-edges')];
const layerOf = (c: ParentNode, edgeId: string) =>
  layers(c).find((l) => l.querySelector(`[data-testid="rf__edge-${edgeId}"]`) !== null);

const n = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  width: 100,
  height: 40,
  data: {},
  ...extra,
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
});

const canvas = (props: Partial<FlowingerProps>) => (
  <div style={{ width: 800, height: 600 }}>
    <FlowingerCanvas elementsSelectable {...props} />
  </div>
);

describe('elevateNodesOnSelect', () => {
  const nodes = [n('a', 0, 0), n('b', 0, 200, { zIndex: 5 })];

  it('raises a selected node by 1000, by default', () => {
    const { container } = render(canvas({ nodes }));
    expect(z(node(container, 'a'))).toBe('1');
    fireEvent.click(node(container, 'a'));
    expect(z(node(container, 'a'))).toBe('1001');
    expect(z(node(container, 'b'))).toBe('5');
    fireEvent.click(node(container, 'b'));
    expect(z(node(container, 'a'))).toBe('1');
    expect(z(node(container, 'b'))).toBe('1005');
  });

  it('off, a selected node stays where it was', () => {
    const { container } = render(canvas({ nodes, elevateNodesOnSelect: false }));
    fireEvent.click(node(container, 'a'));
    expect(z(node(container, 'a'))).toBe('1');
  });

  it('a child of a selected group goes up with it, and stays above it', () => {
    const tree = [n('g', 0, 0, { width: 300, height: 200 }), n('k', 10, 10, { parentId: 'g' })];
    const { container } = render(canvas({ nodes: tree }));
    fireEvent.click(node(container, 'g'));
    expect(z(node(container, 'g'))).toBe('1001');
    expect(z(node(container, 'k'))).toBe('1002');
  });
});

describe('elevateEdgesOnSelect', () => {
  const nodes = [n('a', 0, 0), n('b', 0, 200), n('c', 0, 400)];
  const edges: Edge[] = [
    { id: 'ab', source: 'a', target: 'b' },
    { id: 'bc', source: 'b', target: 'c' },
  ];

  it('is off by default: selecting an edge leaves it in its layer', () => {
    const { container } = render(canvas({ nodes, edges }));
    fireEvent.click(must(container, '[data-testid="rf__edge-ab"]'));
    expect(z(layerOf(container, 'ab') as Element)).toBe('0');
  });

  it('on, a selected edge is raised by 1000', () => {
    const { container } = render(canvas({ nodes, edges, elevateEdgesOnSelect: true }));
    fireEvent.click(must(container, '[data-testid="rf__edge-ab"]'));
    expect(z(layerOf(container, 'ab') as Element)).toBe('1000');
    expect(z(layerOf(container, 'bc') as Element)).toBe('0');
  });

  it('on, the edges of a selected node follow it up', () => {
    const { container } = render(canvas({ nodes, edges, elevateEdgesOnSelect: true }));
    fireEvent.click(node(container, 'a'));
    expect(z(node(container, 'a'))).toBe('1001');
    expect(z(layerOf(container, 'ab') as Element)).toBe('1001');
    expect(z(layerOf(container, 'bc') as Element)).toBe('0');
  });

  it('off, the edges of a selected node stay below it', () => {
    const { container } = render(canvas({ nodes, edges }));
    fireEvent.click(node(container, 'a'));
    expect(z(layerOf(container, 'ab') as Element)).toBe('0');
  });
});

describe('zIndexMode', () => {
  const nested = [
    n('g', 0, 0, { width: 300, height: 200 }),
    n('k', 10, 10, { parentId: 'g' }),
    n('loose', 400, 0, { zIndex: 3 }),
  ];

  it('basic (the default): a child above its parent, and a node\'s own zIndex', () => {
    const { container } = render(canvas({ nodes: nested }));
    expect([z(node(container, 'g')), z(node(container, 'k')), z(node(container, 'loose'))]).toEqual(['1', '2', '3']);
  });

  it('manual: only what is given, with no nesting and no raising', () => {
    const { container } = render(canvas({ nodes: nested, zIndexMode: 'manual' }));
    expect([z(node(container, 'g')), z(node(container, 'k')), z(node(container, 'loose'))]).toEqual(['0', '0', '3']);
    fireEvent.click(node(container, 'loose'));
    expect(z(node(container, 'loose'))).toBe('3');
  });

  it('manual: an edge is stacked by its own zIndex alone', () => {
    const edges: Edge[] = [
      { id: 'raised', source: 'g', target: 'loose', zIndex: 4 },
      { id: 'plain', source: 'k', target: 'loose' },
    ];
    const { container } = render(canvas({ nodes: nested, edges, zIndexMode: 'manual' }));
    expect(z(layerOf(container, 'raised') as Element)).toBe('4');
    expect(z(layerOf(container, 'plain') as Element)).toBe('0');
  });

  it('auto: each group\'s subtree is kept together, above the one before it', () => {
    const groups = [
      n('g1', 0, 0, { width: 200, height: 100 }),
      n('k1', 10, 10, { parentId: 'g1' }),
      n('g2', 400, 0, { width: 200, height: 100 }),
      n('k2', 10, 10, { parentId: 'g2' }),
      n('free', 0, 300),
    ];
    const { container } = render(canvas({ nodes: groups, zIndexMode: 'auto' }));
    const zs = ['g1', 'k1', 'g2', 'k2', 'free'].map((id) => Number(z(node(container, id))));
    // A subtree is above everything of the group before it, and a node with no children is as it was.
    expect(zs[2]).toBeGreaterThan(zs[1] as number);
    expect(zs[3]).toBeGreaterThan(zs[2] as number);
    expect(zs[4]).toBe(1);
  });

  it('a core without the feature ignores the three, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<FlowingerCore nodes={nested} zIndexMode="manual" elevateEdgesOnSelect />);
    const said = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(said).toMatch(/elevateEdgesOnSelect, zIndexMode.*stacking/);
  });
});

describe('colorMode', () => {
  const wrapper = (c: ParentNode) => must<HTMLElement>(c, '.flowinger');
  const mockScheme = (dark: boolean) => {
    const listeners = new Set<() => void>();
    const mql = {
      matches: dark,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    };
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => mql });
    return {
      set(next: boolean) {
        mql.matches = next;
        for (const fn of listeners) fn();
      },
    };
  };

  it('is nothing at all when not given: the library\'s own palette', () => {
    const { container } = render(canvas({ nodes: [n('a', 0, 0)] }));
    expect(wrapper(container).classList.contains('light')).toBe(false);
    expect(wrapper(container).classList.contains('dark')).toBe(false);
    expect(wrapper(container).style.getPropertyValue('--flowinger-surface')).toBe('');
  });

  it("forceColorMode is React Flow 13's name for it, and wins where both are given", () => {
    const { container } = render(canvas({ nodes: [n('a', 0, 0)], forceColorMode: 'light', colorMode: 'dark' }));
    expect(wrapper(container).classList.contains('light')).toBe(true);
    expect(wrapper(container).classList.contains('dark')).toBe(false);
  });

  it('is nothing on a <ReactFlow> given neither: no class, as in React Flow 13', () => {
    const { container } = render(<ReactFlow nodes={[n('a', 0, 0)]} />);
    expect(wrapper(container).classList.contains('light')).toBe(false);
    expect(wrapper(container).classList.contains('dark')).toBe(false);
  });

  it('dark is a class, and the default palette', () => {
    const { container } = render(canvas({ nodes: [n('a', 0, 0)], colorMode: 'dark' }));
    expect(wrapper(container).classList.contains('dark')).toBe(true);
    expect(wrapper(container).style.getPropertyValue('--flowinger-surface')).toBe('');
  });

  it('light is a class and a light palette, as variables the components already read', () => {
    const { container } = render(canvas({ nodes: [n('a', 0, 0)], colorMode: 'light' }));
    expect(wrapper(container).classList.contains('light')).toBe(true);
    const surface = wrapper(container).style.getPropertyValue('--flowinger-surface');
    expect(surface).toMatch(/^#f|^#ffffff|^white|^rgb/i);
    expect(wrapper(container).style.getPropertyValue('--flowinger-text')).not.toBe('');
  });

  it('system follows the OS, and its changes', () => {
    const scheme = mockScheme(true);
    const { container } = render(canvas({ nodes: [n('a', 0, 0)], colorMode: 'system' }));
    expect(wrapper(container).classList.contains('dark')).toBe(true);
    act(() => scheme.set(false));
    expect(wrapper(container).classList.contains('light')).toBe(true);
    expect(wrapper(container).classList.contains('dark')).toBe(false);
  });

  it('is kept alongside the caller\'s own class', () => {
    const { container } = render(canvas({ nodes: [n('a', 0, 0)], colorMode: 'light', className: 'mine' }));
    expect(wrapper(container).classList.contains('mine')).toBe(true);
    expect(wrapper(container).classList.contains('light')).toBe(true);
  });
});

describe('defaultMarkerColor', () => {
  const nodes = [n('a', 0, 0), n('b', 0, 200)];
  const colours = (c: ParentNode) =>
    [...c.querySelectorAll('marker polyline')].map((p) => p.getAttribute('stroke'));

  it('colours an arrowhead that names no colour, instead of the edge\'s stroke', () => {
    const edges: Edge[] = [{ id: 'e', source: 'a', target: 'b', markerEnd: 'arrowclosed', style: { stroke: 'red' } }];
    const { container } = render(canvas({ nodes, edges, defaultMarkerColor: '#123456' }));
    expect(colours(container)).toEqual(['#123456']);
  });

  it('is not what a marker that names its own colour gets', () => {
    const edges: Edge[] = [
      { id: 'e', source: 'a', target: 'b', markerEnd: { type: 'arrowclosed', color: 'green' } },
    ];
    const { container } = render(canvas({ nodes, edges, defaultMarkerColor: '#123456' }));
    expect(colours(container)).toEqual(['green']);
  });

  it('left out, an arrowhead takes its edge\'s stroke as before', () => {
    const edges: Edge[] = [{ id: 'e', source: 'a', target: 'b', markerEnd: 'arrowclosed', style: { stroke: 'red' } }];
    const { container } = render(canvas({ nodes, edges }));
    expect(colours(container)).toEqual(['red']);
  });
});

describe('connectionLineContainerStyle', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'elementFromPoint');
  });
  const types = {
    out: () => <Handle id="out" type="source" position={Position.Bottom} />,
  };

  it('styles the element the line is drawn in', () => {
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
    const { container } = render(
      canvas({
        nodes: [{ ...n('a', 0, 0), type: 'out' }],
        nodeTypes: types,
        nodesConnectable: true,
        connectionLineContainerStyle: { zIndex: 999, opacity: 0.5 },
      }),
    );
    const handle = must(container, '[data-handleid="out"]');
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 50, clientY: 40 });
    fireEvent.pointerMove(window, { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    const holder = must<SVGSVGElement>(container, '.flowinger-connection');
    expect(holder.style.zIndex).toBe('999');
    expect(holder.style.opacity).toBe('0.5');
    expect(holder.querySelector('.react-flow__connection-path')).not.toBeNull();
    fireEvent.pointerUp(window, { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
  });
});
