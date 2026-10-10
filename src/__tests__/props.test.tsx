import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import {
  FlowingerCanvas,
  FlowingerCore,
  FlowingerProvider,
  MiniMap,
  useStore,
  type Edge,
  type FlowingerInstance,
  type Node,
} from '../index.ts';

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const el = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
const at = (c: ParentNode, id: string) => el(c, id).style.transform;
const viewportOf = (c: ParentNode) => must<HTMLElement>(c, '.flowinger-viewport').style.transform;

const box = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  width: 100,
  height: 40,
  data: {},
  ...extra,
});

function drag(c: ParentNode, id: string, dx: number, dy: number) {
  const node = el(c, id);
  fireEvent.pointerDown(node, pointer({ clientX: 0, clientY: 0 }));
  fireEvent.pointerMove(node, pointer({ clientX: dx, clientY: dy }));
  fireEvent.pointerUp(node, pointer({ clientX: dx, clientY: dy }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('nodeExtent', () => {
  const extent: [[number, number], [number, number]] = [
    [0, 0],
    [300, 200],
  ];

  it('stops a dragged node at the edge of the region, by its far side', () => {
    const { container } = render(<FlowingerCanvas nodes={[box('a', 0, 0)]} nodesDraggable nodeExtent={extent} />);
    drag(container, 'a', 500, 500);
    expect(at(container, 'a')).toBe('translate(200px, 160px)'); // 300 - 100, 200 - 40
    drag(container, 'a', -900, -900);
    expect(at(container, 'a')).toBe('translate(0px, 0px)');
  });

  it('lets a node’s own extent win', () => {
    const nodes = [box('a', 0, 0, { extent: [[0, 0], [150, 100]] })];
    const { container } = render(<FlowingerCanvas nodes={nodes} nodesDraggable nodeExtent={extent} />);
    drag(container, 'a', 500, 500);
    expect(at(container, 'a')).toBe('translate(50px, 60px)');
  });

  it('moves a selection as one: the node that hits the wall stops the rest', () => {
    const nodes = [box('a', 0, 0), box('b', 100, 0)];
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodesDraggable elementsSelectable nodeExtent={extent} />,
    );
    fireEvent.click(el(container, 'a'));
    fireEvent.click(el(container, 'b'), { shiftKey: true });
    drag(container, 'a', 500, 0);
    // b may go 100 to the right (to 200), so a goes 100 too — they keep their distance.
    expect(at(container, 'a')).toBe('translate(100px, 0px)');
    expect(at(container, 'b')).toBe('translate(200px, 0px)');
  });

  it('does not bound a node when there is no extent', () => {
    const { container } = render(<FlowingerCanvas nodes={[box('a', 0, 0)]} nodesDraggable />);
    drag(container, 'a', 5000, 0);
    expect(at(container, 'a')).toBe('translate(5000px, 0px)');
  });
});

describe('snapToGrid', () => {
  it('drops the dragged node on the grid — 15 by default', () => {
    const { container } = render(<FlowingerCanvas nodes={[box('a', 0, 0)]} nodesDraggable snapToGrid />);
    drag(container, 'a', 23, 8);
    expect(at(container, 'a')).toBe('translate(30px, 15px)'); // 23 → 30 (nearest 15), 8 → 15
  });

  it('takes its grid from snapGrid', () => {
    const { container } = render(
      <FlowingerCanvas nodes={[box('a', 0, 0)]} nodesDraggable snapToGrid snapGrid={[20, 50]} />,
    );
    drag(container, 'a', 33, 30);
    expect(at(container, 'a')).toBe('translate(40px, 50px)');
  });

  it('snaps the lead node and moves the rest of a selection by the same amount', () => {
    const nodes = [box('a', 0, 0), box('b', 7, 0)];
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodesDraggable elementsSelectable snapToGrid snapGrid={[20, 20]} />,
    );
    fireEvent.click(el(container, 'a'));
    fireEvent.click(el(container, 'b'), { shiftKey: true });
    drag(container, 'a', 33, 0);
    expect(at(container, 'a')).toBe('translate(40px, 0px)');
    expect(at(container, 'b')).toBe('translate(47px, 0px)'); // still 7 to the right
  });

  it('snaps where the node lands, not how far it moved — so a node off the grid comes onto it', () => {
    const { container } = render(
      <FlowingerCanvas nodes={[box('a', 7, 3)]} nodesDraggable snapToGrid snapGrid={[20, 20]} />,
    );
    drag(container, 'a', 33, 4); // 7 + 33 = 40, 3 + 4 = 7
    expect(at(container, 'a')).toBe('translate(40px, 0px)');
  });

  it('is off unless asked for', () => {
    const { container } = render(<FlowingerCanvas nodes={[box('a', 0, 0)]} nodesDraggable />);
    drag(container, 'a', 23, 8);
    expect(at(container, 'a')).toBe('translate(23px, 8px)');
  });
});

describe('defaultEdgeOptions', () => {
  const nodes = [box('a', 0, 0), box('b', 200, 200)];
  const edges: Edge[] = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'a', markerEnd: 'arrow' },
  ];

  it('applies to every edge, and an edge’s own fields win', () => {
    let instance: FlowingerInstance | undefined;
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        edges={edges}
        defaultEdgeOptions={{ markerEnd: 'arrowclosed', className: 'dflt' }}
        onInit={(i) => {
          instance = i;
        }}
      />,
    );
    expect(container.querySelectorAll('.flowinger-edge.dflt')).toHaveLength(2);
    expect(instance?.getEdge('e1')?.markerEnd).toBe('arrowclosed');
    expect(instance?.getEdge('e2')?.markerEnd).toBe('arrow');
  });

  it('is compared by value: an equal object written inline again remakes nothing', () => {
    let instance: FlowingerInstance | undefined;
    const ui = (opts: { className: string }) => (
      <FlowingerCanvas
        nodes={nodes}
        edges={edges}
        defaultEdgeOptions={opts}
        onInit={(i) => {
          instance = i;
        }}
      />
    );
    const { rerender } = render(ui({ className: 'x' }));
    const before = instance?.getEdge('e1');
    rerender(ui({ className: 'x' }));
    expect(instance?.getEdge('e1')).toBe(before);
    rerender(ui({ className: 'y' }));
    expect(instance?.getEdge('e1')).not.toBe(before);
    expect(instance?.getEdge('e1')?.className).toBe('y');
  });

  it('leaves edges as given when there are no options', () => {
    let instance: FlowingerInstance | undefined;
    render(
      <FlowingerCanvas
        nodes={nodes}
        edges={edges}
        onInit={(i) => {
          instance = i;
        }}
      />,
    );
    expect(instance?.getEdge('e1')).toBe(edges[0]);
  });
});

describe('hidden', () => {
  const nodes = [box('a', 0, 0), box('b', 200, 0, { hidden: true }), box('c', 400, 0)];
  const edges: Edge[] = [
    { id: 'ab', source: 'a', target: 'b' },
    { id: 'ac', source: 'a', target: 'c' },
    { id: 'hid', source: 'a', target: 'c', hidden: true },
  ];

  it('draws neither a hidden node, nor an edge touching one, nor a hidden edge', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} edges={edges} />);
    expect(container.querySelector('[data-id="b"]')).toBeNull();
    expect(container.querySelector('[data-id="a"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="rf__edge-ab"]')).toBeNull();
    expect(container.querySelector('[data-testid="rf__edge-hid"]')).toBeNull();
    expect(container.querySelector('[data-testid="rf__edge-ac"]')).not.toBeNull();
  });

  it('draws it again when it is shown', () => {
    const { container, rerender } = render(<FlowingerCanvas nodes={nodes} edges={edges} />);
    rerender(<FlowingerCanvas nodes={nodes.map((n) => ({ ...n, hidden: false }))} edges={edges} />);
    expect(container.querySelector('[data-id="b"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="rf__edge-ab"]')).not.toBeNull();
  });

  it('keeps a hidden node off the minimap', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes} edges={edges}>
        <MiniMap />
      </FlowingerCanvas>,
    );
    const map = must(container, '[aria-label="Minimap"]');
    expect(map.querySelectorAll('rect.flowinger-minimap-node, .flowinger-minimap-node')).toHaveLength(2);
  });
});

describe('the fitView prop', () => {
  const stubPane = () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40);
  };
  const nodes = [box('a', 0, 0), box('b', 300, 0)]; // 400 × 40

  it('frames the nodes once they are measured', () => {
    stubPane();
    const { container } = render(<FlowingerCanvas nodes={nodes} fitView fitViewOptions={{ padding: 0 }} />);
    // 800 / 400 = 2, capped at maxZoom 2; centred on (200, 20).
    expect(viewportOf(container)).toBe('translate(0px, 260px) scale(2)');
  });

  it('does nothing without the prop', () => {
    stubPane();
    const { container } = render(<FlowingerCanvas nodes={nodes} />);
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1)');
  });

  it('frames under StrictMode too — which is how create-vite and Next.js run an app in development', () => {
    stubPane();
    const { container } = render(
      <StrictMode>
        <FlowingerCanvas nodes={nodes} fitView fitViewOptions={{ padding: 0 }} />
      </StrictMode>,
    );
    expect(viewportOf(container)).toBe('translate(0px, 260px) scale(2)');
  });

  it.each([
    ['a plain tree', false],
    ['StrictMode', true],
  ])('frames a canvas remounted by `key` under one provider, as an app that re-lays out does (%s)', (_, strict) => {
    stubPane();
    const tree = (key: string, list: Node[]) => {
      const inner = (
        <FlowingerProvider>
          <FlowingerCore key={key} nodes={list} fitView fitViewOptions={{ padding: 0 }} />
        </FlowingerProvider>
      );
      return strict ? <StrictMode>{inner}</StrictMode> : inner;
    };
    // Laid out asynchronously: the canvas is first mounted with no nodes, then remounted with them.
    const { container, rerender } = render(tree('empty', []));
    rerender(tree('laid-out', nodes));
    expect(viewportOf(container)).toBe('translate(0px, 260px) scale(2)');
  });

  it('waits for the pane to have a size: a canvas mounted hidden (a tab, a modal) frames when it is shown', () => {
    // Nodes can be measured while the pane is 0 × 0 (an ancestor with display: none still gives a
    // node a declared size), and framing then has nothing to frame against. It must not give up.
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40);
    let pane = { width: 0, height: 0 };
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => pane.width);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => pane.height);
    const observers: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observers.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );

    const { container } = render(<FlowingerCanvas nodes={nodes} fitView fitViewOptions={{ padding: 0 }} />);
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1)');

    pane = { width: 800, height: 600 };
    act(() => {
      observers.forEach((callback) => { callback(); });
    });
    expect(viewportOf(container)).toBe('translate(0px, 260px) scale(2)');
    vi.unstubAllGlobals();
  });

  it('frames once: a later change of nodes does not re-frame', () => {
    stubPane();
    const { container, rerender } = render(<FlowingerCanvas nodes={nodes} fitView fitViewOptions={{ padding: 0 }} />);
    const first = viewportOf(container);
    rerender(<FlowingerCanvas nodes={[...nodes, box('c', 5000, 0)]} fitView fitViewOptions={{ padding: 0 }} />);
    expect(viewportOf(container)).toBe(first);
  });

  it('waits for the nodes to exist and be measured', () => {
    stubPane();
    const { container, rerender } = render(<FlowingerCanvas nodes={[]} fitView fitViewOptions={{ padding: 0 }} />);
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1)');
    rerender(<FlowingerCanvas nodes={nodes} fitView fitViewOptions={{ padding: 0 }} />);
    expect(viewportOf(container)).toBe('translate(0px, 260px) scale(2)');
  });
});

describe('useStore, widened', () => {
  const shallowEqual = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);

  it('follows the viewport, the nodes and the zoom limits', () => {
    let instance: FlowingerInstance | undefined;
    function Reader() {
      const count = useStore((s) => s.nodes.length);
      const transform = useStore((s) => s.transform);
      const min = useStore((s) => s.minZoom);
      return <output data-testid="out">{JSON.stringify([count, transform, min])}</output>;
    }
    const ui = (nodes: Node[]) => (
      <FlowingerCanvas
        nodes={nodes}
        minZoom={0.5}
        onInit={(i) => {
          instance = i;
        }}
      >
        <Reader />
      </FlowingerCanvas>
    );
    const { container, rerender } = render(ui([box('a', 0, 0)]));
    const out = () => must(container, '[data-testid="out"]').textContent;
    expect(out()).toBe('[1,[0,0,1],0.5]');
    act(() => {
      void instance?.setViewport({ x: 10, y: 20, zoom: 1.5 });
    });
    expect(out()).toBe('[1,[10,20,1.5],0.5]');
    rerender(ui([box('a', 0, 0), box('b', 5, 5)]));
    expect(out()).toBe('[2,[10,20,1.5],0.5]');
  });

  it('takes an equality function, so a selector may return a new array', () => {
    let instance: FlowingerInstance | undefined;
    let renders = 0;
    function Reader() {
      renders += 1;
      const [count, zoom] = useStore((s) => [s.nodes.length, s.transform[2]], shallowEqual);
      return <output data-testid="out">{`${String(count)} ${String(zoom)}`}</output>;
    }
    const { container } = render(
      <FlowingerCanvas
        nodes={[box('a', 0, 0)]}
        onInit={(i) => {
          instance = i;
        }}
      >
        <Reader />
      </FlowingerCanvas>,
    );
    const settled = renders;
    act(() => {
      void instance?.setViewport({ x: 50, y: 50, zoom: 1 }); // a pan: neither selected value moved
    });
    expect(renders).toBe(settled);
    act(() => {
      void instance?.setViewport({ x: 50, y: 50, zoom: 2 });
    });
    expect(must(container, '[data-testid="out"]').textContent).toBe('1 2');
  });
});
