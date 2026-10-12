import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import {
  FlowingerCanvas,
  FlowingerProvider,
  MiniMap,
  NodeResizeControl,
  NodeResizer,
  useNodesState,
  type MiniMapNodeProps,
  type Node,
  type NodeTypes,
} from '../index.ts';

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MiniMap props', () => {
  const nodes: Node[] = [
    { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {}, selected: true },
    { id: 'b', position: { x: 300, y: 100 }, width: 100, height: 40, data: {} },
  ];
  const draw = (mini: React.ReactNode) => {
    // jsdom lays nothing out: give the canvas a size, or there is no view to cut out of the mask.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    return render(
      <FlowingerProvider>
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCanvas nodes={nodes} />
        </div>
        {mini}
      </FlowingerProvider>,
    );
  };
  const overview = (c: ParentNode) => must<SVGSVGElement>(c, '.react-flow__minimap');
  const shown = (c: ParentNode) => must<HTMLElement>(c, '.flowinger-viewport').style.transform;
  const zoomOf = (c: ParentNode) => Number(/scale\(([\d.]+)\)/.exec(shown(c))?.[1]);

  /** Where on screen a point of the graph is drawn, from what the overview says it shows. */
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
  const press = (svg: SVGSVGElement, gx: number, gy: number, release = { dx: 0, dy: 0 }) => {
    const at = screenOf(svg, gx, gy);
    fireEvent.pointerDown(svg, pointer(at));
    fireEvent.pointerUp(svg, pointer({ clientX: at.clientX + release.dx, clientY: at.clientY + release.dy }));
  };

  it('draws each node by `nodeComponent`, and gives it the box, the colours and the class', () => {
    const seen: MiniMapNodeProps[] = [];
    function Dot(p: MiniMapNodeProps) {
      seen.push(p);
      return <circle data-testid={`dot-${p.id}`} className={p.className} cx={p.x} cy={p.y} r={p.width / 2} fill={p.color} />;
    }
    const { container, queryAllByTestId } = draw(
      <MiniMap nodeComponent={Dot} nodeColor="teal" nodeStrokeColor="red" nodeClassName="mine" nodeBorderRadius={7} />,
    );
    expect(queryAllByTestId(/^dot-/)).toHaveLength(2);
    expect(container.querySelectorAll('rect.flowinger-minimap-node')).toHaveLength(0);
    const a = seen.find((p) => p.id === 'a');
    expect(a).toMatchObject({
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      borderRadius: 7,
      color: 'teal',
      strokeColor: 'red',
      className: 'flowinger-minimap-node mine',
      selected: true,
    });
    expect(seen.find((p) => p.id === 'b')?.selected).toBe(false);
  });

  it('says which node a press on the overview was on, to `onNodeClick`', () => {
    const onNodeClick = vi.fn();
    const { container } = draw(<MiniMap onNodeClick={onNodeClick} />);
    press(overview(container), 350, 120); // inside b
    expect(onNodeClick).toHaveBeenCalledTimes(1);
    expect(onNodeClick.mock.calls[0]?.[1]).toMatchObject({ id: 'b' });
    press(overview(container), 50, 20); // inside a
    expect(onNodeClick.mock.calls[1]?.[1]).toMatchObject({ id: 'a' });
  });

  it('is not a click on a node when it is on none, or when the pointer moved', () => {
    const onNodeClick = vi.fn();
    const { container } = draw(<MiniMap onNodeClick={onNodeClick} />);
    press(overview(container), 200, 400); // empty
    // Pressed at b's left and let go 5 px along — still over b, but a drag, not a click.
    press(overview(container), 320, 120, { dx: 5, dy: 0 });
    expect(onNodeClick).not.toHaveBeenCalled();
  });

  it('still reports a node click when the overview is not pannable', () => {
    const onNodeClick = vi.fn();
    const { container } = draw(<MiniMap pannable={false} onNodeClick={onNodeClick} />);
    press(overview(container), 50, 20);
    expect(onNodeClick).toHaveBeenCalledTimes(1);
  });

  it('zooms the canvas on the wheel when `zoomable`, and leaves the wheel alone when not', () => {
    const off = draw(<MiniMap />);
    const untouched = fireEvent.wheel(overview(off.container), { deltaY: -10 });
    expect(untouched).toBe(true); // not prevented
    expect(zoomOf(off.container)).toBe(1);
    off.unmount();

    const on = draw(<MiniMap zoomable />);
    const prevented = fireEvent.wheel(overview(on.container), { deltaY: -10 });
    expect(prevented).toBe(false);
    expect(zoomOf(on.container)).toBeGreaterThan(1);
  });

  it('zooms further per tick with a larger `zoomStep`', () => {
    const slow = draw(<MiniMap zoomable zoomStep={1} />);
    fireEvent.wheel(overview(slow.container), { deltaY: -10 });
    const slowZoom = zoomOf(slow.container);
    slow.unmount();
    const quick = draw(<MiniMap zoomable zoomStep={10} />);
    fireEvent.wheel(overview(quick.container), { deltaY: -10 });
    expect(zoomOf(quick.container)).toBeGreaterThan(slowZoom);
  });

  it('leaves `offsetScale` pixels of the overview round what it shows', () => {
    const none = draw(<MiniMap offsetScale={0} />);
    const [x0, y0, w0, h0] = (overview(none.container).getAttribute('viewBox') ?? '').split(' ').map(Number);
    // The nodes and the 800 × 600 view, with no margin.
    expect([x0, y0, w0, h0]).toEqual([0, 0, 800, 600]);
    none.unmount();

    const some = draw(<MiniMap offsetScale={10} />);
    const [, , w, h] = (overview(some.container).getAttribute('viewBox') ?? '').split(' ').map(Number);
    // 10 px each side of a 200 × 150 overview showing 800 × 600 at 0.25 px a unit: 40 units each side.
    expect(w).toBeCloseTo(800 + 2 * 10 * (800 / 200), 5);
    expect(h).toBeCloseTo(600 + 2 * 10 * (800 / 200), 5);
  });

  it('does not hand its own props to the svg', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = draw(
      <MiniMap
        zoomable
        zoomStep={3}
        offsetScale={4}
        inversePan
        nodeComponent={() => null}
        onNodeClick={() => {}}
      />,
    );
    const names = overview(container).getAttributeNames().map((n) => n.toLowerCase());
    for (const prop of ['zoomable', 'zoomstep', 'offsetscale', 'inversepan', 'nodecomponent', 'onnodeclick']) {
      expect(names).not.toContain(prop);
    }
    expect(error).not.toHaveBeenCalled();
  });
});

describe('NodeResizeControl and NodeResizer.nodeId', () => {
  const box = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({
    id,
    position: { x, y },
    width: 100,
    height: 40,
    data: {},
    ...extra,
  });
  function Harness({
    nodeTypes,
    zoom = 1,
  }: {
    nodeTypes: NodeTypes;
    zoom?: number;
  }) {
    const [nodes, , onNodesChange] = useNodesState<Node>([
      { ...box('a', 50, 50), type: 'r' },
      box('b', 400, 50),
    ]);
    return (
      <FlowingerProvider initialViewport={{ x: 0, y: 0, zoom }}>
        <FlowingerCanvas
          nodes={nodes}
          nodeTypes={nodeTypes}
          nodesDraggable
          elementsSelectable
          onNodesChange={onNodesChange}
        />
      </FlowingerProvider>
    );
  }
  const node = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
  const size = (c: ParentNode, id: string) => [node(c, id).style.width, node(c, id).style.height];
  const drag = (el: HTMLElement, dx: number, dy: number) => {
    fireEvent.pointerDown(el, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(el, pointer({ clientX: dx, clientY: dy }));
    fireEvent.pointerUp(el, pointer({ clientX: dx, clientY: dy }));
  };

  it('resizes with a single control, a handle on the bottom-right corner unless told otherwise', () => {
    const types = { r: () => <NodeResizeControl /> };
    const { container } = render(<Harness nodeTypes={types} />);
    const control = must<HTMLElement>(container, '.flowinger-resize-control');
    expect(control.classList.contains('handle')).toBe(true);
    expect(control.classList.contains('bottom-right')).toBe(true);
    expect(container.querySelectorAll('.flowinger-resize-control')).toHaveLength(1);
    drag(control, 30, 20);
    expect(size(container, 'a')).toEqual(['130px', '60px']);
  });

  it('is a strip along a side as a `line`, and moves one axis', () => {
    const types = { r: () => <NodeResizeControl position="right" variant="line" /> };
    const { container } = render(<Harness nodeTypes={types} />);
    const control = must<HTMLElement>(container, '.flowinger-resize-control.right');
    expect(control.classList.contains('line')).toBe(true);
    drag(control, 25, 99);
    expect(size(container, 'a')).toEqual(['125px', '40px']);
  });

  it('is a handle in the middle of a side when it is a `handle` on one', () => {
    const types = { r: () => <NodeResizeControl position="left" /> };
    const { container } = render(<Harness nodeTypes={types} />);
    const control = must<HTMLElement>(container, '.flowinger-resize-control.left');
    expect(control.classList.contains('handle')).toBe(true);
    expect(control.style.left).toBe('50%'.replace('50%', '0px'));
    expect(control.style.top).toBe('50%');
    drag(control, -20, 0); // pulling the left edge outwards grows it
    expect(size(container, 'a')).toEqual(['120px', '40px']);
  });

  it('draws what it is given inside itself', () => {
    const types = { r: () => <NodeResizeControl><span data-testid="grip">⇲</span></NodeResizeControl> };
    const { getByTestId } = render(<Harness nodeTypes={types} />);
    expect(getByTestId('grip').parentElement?.classList.contains('flowinger-resize-control')).toBe(true);
  });

  it('resizes the node it names, not the one it is drawn in', () => {
    const types = { r: () => <NodeResizer nodeId="b" /> };
    const { container } = render(<Harness nodeTypes={types} />);
    drag(must<HTMLElement>(container, '.flowinger-resize-control.bottom-right'), 10, 10);
    expect(size(container, 'b')).toEqual(['110px', '50px']);
    expect(size(container, 'a')).toEqual(['100px', '40px']);
  });

  describe('autoScale', () => {
    const handleTransform = (c: ParentNode, name: string) =>
      must<HTMLElement>(c, `.flowinger-resize-control.${name}`).style.transform;

    it('draws handles larger by the inverse of a zoom below 1, so they stay within reach', () => {
      const types = { r: () => <NodeResizer /> };
      const { container } = render(<Harness nodeTypes={types} zoom={0.5} />);
      expect(handleTransform(container, 'bottom-right')).toContain('scale(2)');
      // A line is as long as its side: it is not scaled.
      expect(handleTransform(container, 'bottom')).not.toContain('scale');
    });

    it('does nothing at zoom 1 or above', () => {
      const types = { r: () => <NodeResizer /> };
      const one = render(<Harness nodeTypes={types} zoom={1} />);
      expect(handleTransform(one.container, 'bottom-right')).not.toContain('scale');
      one.unmount();
      const two = render(<Harness nodeTypes={types} zoom={2} />);
      expect(handleTransform(two.container, 'bottom-right')).not.toContain('scale');
    });

    it('is off with `autoScale={false}`', () => {
      const types = { r: () => <NodeResizer autoScale={false} /> };
      const { container } = render(<Harness nodeTypes={types} zoom={0.5} />);
      expect(handleTransform(container, 'bottom-right')).not.toContain('scale');
    });
  });
});
