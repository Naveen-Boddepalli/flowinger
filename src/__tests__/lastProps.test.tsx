import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import {
  Controls,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  MiniMap,
  Position,
  NodeToolbar,
  type Edge,
  type FlowingerInstance,
  type Node,
} from '../index.ts';

// The last of the accepted-only names: Node.handles, interpolate 'smooth', MiniMap's inversePan, a NodeToolbar
// for another node (or several), and Controls' lock button.

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const node = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });
const n = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  width: 100,
  height: 40,
  data: {},
  ...extra,
});

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Node.handles', () => {
  const pathOf = (c: ParentNode, id: string) =>
    must(c, `[data-testid="rf__edge-${id}"] .react-flow__edge-path`).getAttribute('d') ?? '';
  const render1 = (nodes: Node[], edges: Edge[]) =>
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={nodes} edges={edges} />
      </div>,
    );

  it('puts an edge on a handle a node declares, where none is drawn yet', () => {
    const nodes = [
      n('a', 0, 0, { handles: [{ id: 'out', type: 'source', position: 'right', x: 96, y: 16, width: 8, height: 8 }] }),
      n('b', 300, 100),
    ];
    const { container } = render1(nodes, [{ id: 'e', source: 'a', target: 'b', sourceHandle: 'out' }]);
    // The handle's box is (96, 16) to (104, 24), facing right: the edge meets its outer edge, (104, 20).
    expect(pathOf(container, 'e')).toMatch(/^M 104\.00 20\.00 /);
  });

  it('a declared handle with no x and y is the middle of its side', () => {
    const nodes = [n('a', 0, 0, { handles: [{ id: 'out', type: 'source', position: 'bottom' }] }), n('b', 300, 100)];
    const { container } = render1(nodes, [{ id: 'e', source: 'a', target: 'b', sourceHandle: 'out' }]);
    expect(pathOf(container, 'e')).toMatch(/^M 50\.00 40\.00 /);
  });

  // A node of your own with no <Handle> in it: nothing is drawn to measure, so the declaration is what there is.
  const plain = { plain: () => <div /> };
  const renderPlain = (nodes: Node[], edges: Edge[]) =>
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={nodes} edges={edges} nodeTypes={plain} />
      </div>,
    );

  it('is what a server render draws from, before anything is measured', () => {
    const nodes = [
      n('a', 0, 0, {
        type: 'plain',
        handles: [{ type: 'source', position: 'right', x: 100, y: 20, width: 0, height: 0 }],
      }),
      n('b', 300, 100, {
        type: 'plain',
        handles: [{ type: 'target', position: 'left', x: 0, y: 20, width: 0, height: 0 }],
      }),
    ];
    const { container } = renderPlain(nodes, [{ id: 'e', source: 'a', target: 'b' }]);
    const d = pathOf(container, 'e');
    expect(d).toMatch(/^M 100\.00 20\.00 /);
    expect(d).toMatch(/300\.00 120\.00$/);
  });

  it('picks the handle an edge names by id, and the first of its type when it names none', () => {
    const nodes = [
      n('a', 0, 0, {
        type: 'plain',
        handles: [
          { id: 'one', type: 'source', position: 'right', x: 100, y: 5, width: 0, height: 0 },
          { id: 'two', type: 'source', position: 'right', x: 100, y: 30, width: 0, height: 0 },
        ],
      }),
      n('b', 300, 100, { type: 'plain' }),
    ];
    const named = renderPlain(nodes, [{ id: 'e', source: 'a', target: 'b', sourceHandle: 'two' }]);
    expect(pathOf(named.container, 'e')).toMatch(/^M 100\.00 30\.00 /);
    named.unmount();
    const unnamed = renderPlain(nodes, [{ id: 'e', source: 'a', target: 'b' }]);
    expect(unnamed.container.querySelector('[data-testid="rf__edge-e"] .react-flow__edge-path')?.getAttribute('d')).toMatch(
      /^M 100\.00 5\.00 /,
    );
  });

  it('gives way to a handle that is really drawn, which is measured and was always right', () => {
    const Drawn = () => <Handle id="real" type="source" position={Position.Bottom} />;
    const nodes = [
      n('a', 0, 0, {
        type: 'drawn',
        handles: [{ id: 'real', type: 'source', position: 'right', x: 100, y: 5, width: 0, height: 0 }],
      }),
      n('b', 300, 100),
    ];
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas
          nodes={nodes}
          edges={[{ id: 'e', source: 'a', target: 'b', sourceHandle: 'real' }]}
          nodeTypes={{ drawn: Drawn }}
        />
      </div>,
    );
    // The drawn one (bottom, unmeasured in jsdom: the middle of its side), not the declaration.
    expect(pathOf(container, 'e')).toMatch(/^M 50\.00 40\.00 /);
  });

  it('is not what the dev warning is about any more', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render1([n('a', 0, 0, { handles: [{ type: 'source', position: 'right' }] })], []);
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).not.toContain('handles');
  });
});

describe("interpolate: 'smooth'", () => {
  function mount() {
    vi.useFakeTimers();
    let flow: FlowingerInstance | undefined;
    const view = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={[n('a', 0, 0)]} onInit={(i) => (flow = i)} />
      </div>,
    );
    return { ...view, flow: () => flow as FlowingerInstance };
  }
  const zoomNow = (c: ParentNode) =>
    Number(/scale\(([\d.]+)\)/.exec(must<HTMLElement>(c, '.flowinger-viewport').style.transform)?.[1]);
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 20) act(() => vi.advanceTimersByTime(20));
  };

  it('zooms out part-way along a long move and back in, and lands on the target', () => {
    const { container, flow } = mount();
    act(() => {
      void flow().setViewport({ x: -3000, y: 0, zoom: 1 }, { duration: 400, interpolate: 'smooth' });
    });
    const during: number[] = [];
    for (let t = 0; t < 400; t += 20) {
      act(() => vi.advanceTimersByTime(20));
      during.push(zoomNow(container));
    }
    run(100);
    expect(Math.min(...during)).toBeLessThan(0.9);
    expect(zoomNow(container)).toBe(1);
    expect(must<HTMLElement>(container, '.flowinger-viewport').style.transform).toBe('translate(-3000px, 0px) scale(1)');
  });

  it("'linear', and left out, keep the zoom as it was all the way", () => {
    const { container, flow } = mount();
    act(() => {
      void flow().setViewport({ x: -3000, y: 0, zoom: 1 }, { duration: 400, interpolate: 'linear' });
    });
    const during: number[] = [];
    for (let t = 0; t < 400; t += 20) {
      act(() => vi.advanceTimersByTime(20));
      during.push(zoomNow(container));
    }
    expect(Math.min(...during)).toBe(1);
  });
});

describe("MiniMap's inversePan", () => {
  const nodes = [n('a', 0, 0), n('b', 300, 100)];
  const draw = (mini: React.ReactNode) =>
    render(
      <FlowingerProvider>
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCanvas nodes={nodes} />
        </div>
        {mini}
      </FlowingerProvider>,
    );
  const overview = (c: ParentNode) => must<SVGSVGElement>(c, '.react-flow__minimap');
  function screenOf(svg: SVGSVGElement, gx: number, gy: number) {
    const [bx = 0, by = 0, bw = 1, bh = 1] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
    const width = Number(svg.getAttribute('width'));
    const height = Number(svg.getAttribute('height'));
    const scale = Math.min(width / bw, height / bh);
    return {
      clientX: (gx - bx) * scale + (width - bw * scale) / 2,
      clientY: (gy - by) * scale + (height - bh * scale) / 2,
    };
  }
  /** Where the view's centre is, in graph units, after a press at one graph point and a drag to another. */
  function centreAfterDrag(inverse: boolean) {
    const { container } = draw(<MiniMap inversePan={inverse} />);
    const svg = overview(container);
    const a = screenOf(svg, 50, 20);
    const b = screenOf(svg, 350, 120);
    fireEvent.pointerDown(svg, pointer(a));
    fireEvent.pointerMove(svg, pointer(b));
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(
      must<HTMLElement>(container, '.flowinger-viewport').style.transform,
    );
    const [x = 0, y = 0, z = 1] = [m?.[1], m?.[2], m?.[3]].map(Number);
    return { cx: (400 - x) / z, cy: (300 - y) / z };
  }

  it('by default puts the centre of the view where the pointer is', () => {
    const c = centreAfterDrag(false);
    expect(c.cx).toBeCloseTo(350, 0);
    expect(c.cy).toBeCloseTo(120, 0);
  });

  it('inverted, moves it the other way from where the press began', () => {
    const c = centreAfterDrag(true);
    // From (50, 20), by (+300, +100) the pointer went: the view goes (-300, -100) from there.
    expect(c.cx).toBeCloseTo(-250, 0);
    expect(c.cy).toBeCloseTo(-80, 0);
  });
});

describe("NodeToolbar's nodeId", () => {
  const Bar = ({ ids, visible }: { ids?: string | string[]; visible?: boolean }) => (
    <NodeToolbar {...(ids === undefined ? {} : { nodeId: ids })} {...(visible === undefined ? {} : { isVisible: visible })}>
      <button data-testid="tool">go</button>
    </NodeToolbar>
  );
  const types = (ids?: string | string[], visible?: boolean) => ({
    holder: () => <Bar {...(ids === undefined ? {} : { ids })} {...(visible === undefined ? {} : { visible })} />,
  });
  const nodes = [n('a', 0, 0, { type: 'holder' }), n('b', 300, 200), n('c', 500, 400)];
  const mount = (ids?: string | string[], visible?: boolean, extra = {}) =>
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={nodes} nodeTypes={types(ids, visible)} elementsSelectable {...extra} />
      </div>,
    );

  it('names the node it is drawn in: the same as leaving it out', () => {
    const { container } = mount('a', true);
    expect(node(container, 'a').contains(must(container, '[data-testid="tool"]'))).toBe(true);
  });

  it('names another: it is drawn at that node, in graph space, not inside this one', () => {
    const { container } = mount('b', true);
    const tool = must(container, '[data-testid="tool"]');
    expect(node(container, 'a').contains(tool)).toBe(false);
    const holder = tool.closest('.flowinger-node-toolbar-holder') as HTMLElement;
    expect(holder.style.transform).toBe('translate(300px, 200px)');
    expect(holder.style.width).toBe('100px');
    expect(holder.style.height).toBe('40px');
    expect(holder.closest('.flowinger-viewport')).not.toBeNull();
  });

  it('names several: it is drawn at the box round them', () => {
    const { container } = mount(['b', 'c'], true);
    const holder = must<HTMLElement>(container, '.flowinger-node-toolbar-holder');
    // (300, 200) to (600, 440).
    expect(holder.style.transform).toBe('translate(300px, 200px)');
    expect(holder.style.width).toBe('300px');
    expect(holder.style.height).toBe('240px');
  });

  it('is shown, by default, while the one node it names is the only one selected', () => {
    const { container } = mount('b');
    expect(container.querySelector('[data-testid="tool"]')).toBeNull();
    fireEvent.click(node(container, 'b'));
    expect(container.querySelector('[data-testid="tool"]')).not.toBeNull();
    fireEvent.click(node(container, 'c'), { shiftKey: true });
    expect(container.querySelector('[data-testid="tool"]')).toBeNull();
  });

  it('follows the node when it moves', () => {
    const { container } = mount('b', true, { nodesDraggable: true });
    const b = node(container, 'b');
    fireEvent.pointerDown(b, pointer({ clientX: 310, clientY: 210 }));
    fireEvent.pointerMove(b, pointer({ clientX: 360, clientY: 250 }));
    fireEvent.pointerUp(b, pointer({ clientX: 360, clientY: 250 }));
    expect(must<HTMLElement>(container, '.flowinger-node-toolbar-holder').style.transform).toBe('translate(350px, 240px)');
  });
});

describe("Controls' lock", () => {
  const onChange = vi.fn();
  afterEach(() => onChange.mockClear());
  const mount = (props = {}, canvas = {}) =>
    render(
      <FlowingerProvider>
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCanvas nodes={[n('a', 0, 0)]} {...canvas} />
        </div>
        <Controls {...props} />
      </FlowingerProvider>,
    );
  const lock = (c: ParentNode) => c.querySelector<HTMLButtonElement>('button[aria-label="Toggle interactivity"]');
  const drag = (c: ParentNode) => {
    const a = node(c, 'a');
    fireEvent.pointerDown(a, pointer({ clientX: 10, clientY: 10 }));
    fireEvent.pointerMove(a, pointer({ clientX: 60, clientY: 60 }));
    fireEvent.pointerUp(a, pointer({ clientX: 60, clientY: 60 }));
  };

  it('is not there unless asked for', () => {
    const { container } = mount();
    expect(lock(container)).toBeNull();
  });

  it('switches interaction off and on again, whatever the canvas started with', () => {
    const { container } = mount(
      { showInteractive: true, onInteractiveChange: onChange },
      { nodes: [n('a', 0, 0), n('b', 300, 0)], nodesDraggable: true, elementsSelectable: true },
    );
    drag(container);
    expect(node(container, 'a').style.transform).toBe('translate(50px, 50px)');
    fireEvent.click(lock(container) as HTMLButtonElement);
    expect(onChange).toHaveBeenLastCalledWith(false);
    drag(container);
    expect(node(container, 'a').style.transform).toBe('translate(50px, 50px)'); // did not move again
    fireEvent.click(node(container, 'b'));
    expect(node(container, 'b').classList.contains('selected')).toBe(false); // nothing more can be selected
    fireEvent.click(lock(container) as HTMLButtonElement);
    expect(onChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(node(container, 'b'));
    expect(node(container, 'b').classList.contains('selected')).toBe(true);
  });

  it('from a canvas that is not interactive, a press makes it so, as in React Flow', () => {
    const { container } = mount({ showInteractive: true, onInteractiveChange: onChange });
    drag(container);
    expect(node(container, 'a').style.transform).toBe('translate(0px, 0px)');
    fireEvent.click(lock(container) as HTMLButtonElement);
    expect(onChange).toHaveBeenLastCalledWith(true);
    drag(container);
    expect(node(container, 'a').style.transform).toBe('translate(50px, 50px)');
  });

  it('its label can come from the config', () => {
    const { getByLabelText } = render(
      <FlowingerProvider>
        <FlowingerCanvas nodes={[n('a', 0, 0)]} ariaLabelConfig={{ 'controls.interactive.ariaLabel': 'Lock' }} />
        <Controls showInteractive />
      </FlowingerProvider>,
    );
    expect(getByLabelText('Lock')).toBeTruthy();
  });
});
