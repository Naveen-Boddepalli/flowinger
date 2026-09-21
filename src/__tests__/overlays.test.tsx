import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  FlowingerCanvas,
  FlowingerProvider,
  NodeResizer,
  NodeToolbar,
  Position,
  getBezierPath,
  useNodesState,
  type EdgeProps,
  type Edge,
  type Node,
  type NodeChange,
  type NodeResizerProps,
} from '../index.ts';

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const node = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
const box = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  width: 100,
  height: 40,
  data: {},
  ...extra,
});
const at = (c: ParentNode, id: string) => node(c, id).style.transform;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EdgeLabelRenderer', () => {
  function LabelledEdge(props: EdgeProps) {
    const [path, labelX, labelY] = getBezierPath(props);
    return (
      <>
        <BaseEdge path={path} />
        <EdgeLabelRenderer>
          <button
            type="button"
            data-testid="label"
            className="nodrag nopan"
            style={{
              position: 'absolute',
              pointerEvents: 'all',
              transform: `translate(-50%, -50%) translate(${String(labelX)}px, ${String(labelY)}px)`,
            }}
          >
            {props.id}
          </button>
        </EdgeLabelRenderer>
      </>
    );
  }
  const nodes = [box('a', 0, 0), box('b', 0, 200)];
  const edges: Edge[] = [{ id: 'ab', source: 'a', target: 'b', type: 'labelled' }];

  it('draws HTML in a layer above the edges — outside the svg, inside the viewport', () => {
    const { container, getByTestId } = render(
      <FlowingerCanvas nodes={nodes} edges={edges} edgeTypes={{ labelled: LabelledEdge }} />,
    );
    const label = getByTestId('label');
    const layer = must(container, '.flowinger-edge-labels');
    expect(layer.contains(label)).toBe(true);
    expect(label.closest('svg')).toBeNull();
    expect(must(container, '.flowinger-viewport').contains(layer)).toBe(true);
    // The layer itself takes no pointer events; the label opts in.
    expect((layer as HTMLElement).style.pointerEvents).toBe('none');
    expect(label.style.pointerEvents).toBe('all');
    expect(label.textContent).toBe('ab');
  });

  it('is above the nodes, so a label over a node can be clicked', () => {
    const under = [box('a', 0, 0, { zIndex: 500 }), box('b', 0, 200)];
    const { container } = render(
      <FlowingerCanvas nodes={under} edges={edges} edgeTypes={{ labelled: LabelledEdge }} nodesDraggable />,
    );
    const layer = must<HTMLElement>(container, '.flowinger-edge-labels');
    // Even above a node being dragged (1000) and one that asked for a high z-index of its own.
    expect(Number(layer.style.zIndex)).toBeGreaterThan(1000);
    for (const id of ['a', 'b']) {
      expect(Number(layer.style.zIndex)).toBeGreaterThan(Number(node(container, id).style.zIndex));
    }
  });

  it('follows the edge as a node moves', () => {
    const { container, getByTestId } = render(
      <FlowingerCanvas nodes={nodes} edges={edges} edgeTypes={{ labelled: LabelledEdge }} nodesDraggable />,
    );
    const before = getByTestId('label').style.transform;
    const a = node(container, 'a');
    fireEvent.pointerDown(a, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(a, pointer({ clientX: 80, clientY: 0 }));
    expect(getByTestId('label').style.transform).not.toBe(before);
  });

  it('renders nothing outside a canvas', () => {
    const { container } = render(
      <EdgeLabelRenderer>
        <span>lost</span>
      </EdgeLabelRenderer>,
    );
    expect(container.textContent).toBe('');
  });

  it('keeps one label layer per canvas', () => {
    const { container } = render(
      <div>
        <FlowingerCanvas nodes={nodes} edges={edges} edgeTypes={{ labelled: LabelledEdge }} />
        <FlowingerCanvas nodes={nodes} edges={edges} edgeTypes={{ labelled: LabelledEdge }} />
      </div>,
    );
    const layers = container.querySelectorAll('.flowinger-edge-labels');
    expect(layers).toHaveLength(2);
    expect([...layers].every((l) => l.querySelectorAll('[data-testid="label"]').length === 1)).toBe(true);
  });
});

describe('NodeToolbar', () => {
  function WithToolbar(props: Partial<React.ComponentProps<typeof NodeToolbar>> & { id?: string }) {
    return (
      <div>
        <NodeToolbar {...props}>
          <button type="button" data-testid={`tb-${props.id ?? 'x'}`}>
            act
          </button>
        </NodeToolbar>
        body
      </div>
    );
  }
  const nodes: Node[] = [box('a', 0, 0), box('b', 200, 0)].map((n) => ({ ...n, type: 't' }));
  const types = {
    t: ({ id }: { id: string }) => <WithToolbar id={id} />,
  };
  const has = (c: ParentNode, id: string) => c.querySelector(`[data-testid="tb-${id}"]`) !== null;

  it('shows while its node is the only one selected', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} nodeTypes={types} elementsSelectable />);
    expect(has(container, 'a')).toBe(false);
    fireEvent.click(node(container, 'a'));
    expect(has(container, 'a')).toBe(true);
    expect(has(container, 'b')).toBe(false);
    fireEvent.click(node(container, 'b'), { shiftKey: true });
    expect(has(container, 'a')).toBe(false); // two selected: no pile-up
    expect(has(container, 'b')).toBe(false);
    fireEvent.click(node(container, 'b'), { shiftKey: true }); // back to one
    fireEvent.click(node(container, 'a'), { shiftKey: true });
    fireEvent.click(node(container, 'a'), { shiftKey: true });
    expect(has(container, 'b')).toBe(false);
  });

  it('hides again when the selection is cleared', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} nodeTypes={types} elementsSelectable />);
    fireEvent.click(node(container, 'a'));
    fireEvent.click(container.firstElementChild as Element);
    expect(has(container, 'a')).toBe(false);
  });

  it('follows a controlled selection', () => {
    const controlled = nodes.map((n) => (n.id === 'b' ? { ...n, selected: true } : n));
    const { container } = render(
      <FlowingerCanvas nodes={controlled} nodeTypes={types} elementsSelectable onNodesChange={() => {}} />,
    );
    expect(has(container, 'b')).toBe(true);
    expect(has(container, 'a')).toBe(false);
  });

  it('takes isVisible over the selection', () => {
    const forced = { t: ({ id }: { id: string }) => <WithToolbar id={id} isVisible /> };
    const { container, rerender } = render(<FlowingerCanvas nodes={nodes} nodeTypes={forced} />);
    expect(has(container, 'a')).toBe(true);
    expect(has(container, 'b')).toBe(true);
    const hidden = { t: ({ id }: { id: string }) => <WithToolbar id={id} isVisible={false} /> };
    rerender(<FlowingerCanvas nodes={nodes} nodeTypes={hidden} elementsSelectable />);
    fireEvent.click(node(container, 'a'));
    expect(has(container, 'a')).toBe(false);
  });

  it('sits on the side and along the edge it is told to, offset by the gap', () => {
    const cases: [Position, 'center' | 'start' | 'end', Record<string, string>][] = [
      [Position.Top, 'center', { bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)' }],
      [Position.Bottom, 'start', { top: 'calc(100% + 10px)', left: '0px' }],
      [Position.Left, 'end', { right: 'calc(100% + 10px)', bottom: '0px' }],
      [Position.Right, 'center', { left: 'calc(100% + 10px)', top: '50%', transform: 'translateY(-50%)' }],
    ];
    for (const [position, align, expected] of cases) {
      const view = {
        t: () => (
          <WithToolbar id="p" isVisible position={position} align={align}>
            x
          </WithToolbar>
        ),
      };
      const { container, unmount } = render(<FlowingerCanvas nodes={[nodes[0] as Node]} nodeTypes={view} />);
      const bar = must<HTMLElement>(container, '.flowinger-node-toolbar');
      for (const [prop, value] of Object.entries(expected)) {
        expect(bar.style.getPropertyValue(prop)).toBe(value);
      }
      unmount();
    }
  });

  it('takes a custom gap', () => {
    const view = { t: () => <WithToolbar isVisible offset={24} /> };
    const { container } = render(<FlowingerCanvas nodes={[nodes[0] as Node]} nodeTypes={view} />);
    expect(must<HTMLElement>(container, '.flowinger-node-toolbar').style.bottom).toBe('calc(100% + 24px)');
  });

  it('does not drag the node or pan the canvas when pressed, and is not a tab-order hazard', () => {
    const { container, getByTestId } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} elementsSelectable nodesDraggable />,
    );
    fireEvent.click(node(container, 'a'));
    const bar = must<HTMLElement>(container, '.flowinger-node-toolbar');
    expect(bar.className).toContain('nodrag');
    expect(bar.className).toContain('nopan');
    const button = getByTestId('tb-a');
    fireEvent.pointerDown(button, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(button, pointer({ clientX: 90, clientY: 90 }));
    fireEvent.pointerUp(button, pointer({ clientX: 90, clientY: 90 }));
    expect(at(container, 'a')).toBe('translate(0px, 0px)');
    expect(must<HTMLElement>(container, '.flowinger-viewport').style.transform).toBe('translate(0px, 0px) scale(1)');
  });
});

describe('a declared node size', () => {
  it('is the node’s size on screen', () => {
    const { container } = render(<FlowingerCanvas nodes={[box('a', 0, 0, { width: 123, height: 45 })]} />);
    expect(node(container, 'a').style.width).toBe('123px');
    expect(node(container, 'a').style.height).toBe('45px');
  });

  it('leaves a node with none to its content, and lets its own style win', () => {
    const plain: Node = { id: 'p', position: { x: 0, y: 0 }, data: {} };
    const styled = box('s', 0, 0, { style: { width: 300, height: 77 } });
    const { container } = render(<FlowingerCanvas nodes={[plain, styled]} />);
    expect(node(container, 'p').style.width).toBe('');
    expect(node(container, 's').style.width).toBe('300px');
    expect(node(container, 's').style.height).toBe('77px');
  });
});

describe('NodeResizer', () => {
  /** A node component that carries a resizer with the given props. */
  const resizable = (props: NodeResizerProps = {}) => ({
    r: function R() {
      return (
        <div>
          <NodeResizer {...props} />
        </div>
      );
    },
  });
  const start = (): Node[] => [{ ...box('a', 50, 50), type: 'r' }];

  function Harness({
    types,
    initial = start(),
    onChange,
    zoom = 1,
  }: {
    types: ReturnType<typeof resizable>;
    initial?: Node[];
    onChange?: (c: NodeChange[]) => void;
    zoom?: number;
  }) {
    const [nodes, , onNodesChange] = useNodesState(initial);
    return (
      <FlowingerProvider initialViewport={{ x: 0, y: 0, zoom }}>
        <FlowingerCanvas
          nodes={nodes}
          nodeTypes={types}
          nodesDraggable
          elementsSelectable
          onNodesChange={(c) => {
            onChange?.(c);
            onNodesChange(c);
          }}
        />
      </FlowingerProvider>
    );
  }
  const control = (c: ParentNode, name: string) =>
    must<HTMLElement>(c, `.flowinger-resize-control.${name}`);
  const resize = (c: ParentNode, name: string, dx: number, dy: number) => {
    const el = control(c, name);
    fireEvent.pointerDown(el, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(el, pointer({ clientX: dx, clientY: dy }));
    fireEvent.pointerUp(el, pointer({ clientX: dx, clientY: dy }));
  };
  const size = (c: ParentNode) => [node(c, 'a').style.width, node(c, 'a').style.height];

  it('draws eight controls: four sides, four corners', () => {
    const { container } = render(<Harness types={resizable()} />);
    const names = [...container.querySelectorAll('.flowinger-resize-control')].map((e) =>
      [...e.classList].find((c) => /^(top|bottom|left|right)(-(left|right))?$/.test(c)),
    );
    expect(names.sort()).toEqual(
      ['bottom', 'bottom-left', 'bottom-right', 'left', 'right', 'top', 'top-left', 'top-right'].sort(),
    );
    expect(container.querySelectorAll('.flowinger-resize-control.handle')).toHaveLength(4);
    expect(container.querySelectorAll('.flowinger-resize-control.line')).toHaveLength(4);
  });

  it('grows from the bottom-right corner, leaving the top-left where it is', () => {
    const { container } = render(<Harness types={resizable()} />);
    resize(container, 'bottom-right', 30, 20);
    expect(size(container)).toEqual(['130px', '60px']);
    expect(at(container, 'a')).toBe('translate(50px, 50px)');
  });

  it('grows from the top-left corner by moving the node as much as it grows', () => {
    const { container } = render(<Harness types={resizable()} />);
    resize(container, 'top-left', -10, -5);
    expect(size(container)).toEqual(['110px', '45px']);
    expect(at(container, 'a')).toBe('translate(40px, 45px)');
  });

  it('a side changes one axis only, and a near side moves the node', () => {
    const { container } = render(<Harness types={resizable()} />);
    resize(container, 'right', 25, 99);
    expect(size(container)).toEqual(['125px', '40px']);
    resize(container, 'bottom', 99, 10);
    expect(size(container)).toEqual(['125px', '50px']);
    resize(container, 'top', 0, -10);
    expect(size(container)).toEqual(['125px', '60px']);
    expect(at(container, 'a')).toBe('translate(50px, 40px)');
    resize(container, 'left', -5, 0);
    expect(size(container)).toEqual(['130px', '60px']);
    expect(at(container, 'a')).toBe('translate(45px, 40px)');
  });

  it('stops at min and max — the far side staying put when a near side is pushed past the limit', () => {
    const { container } = render(<Harness types={resizable({ minWidth: 60, minHeight: 30, maxWidth: 200, maxHeight: 80 })} />);
    resize(container, 'top-left', 500, 500); // shrink hard
    expect(size(container)).toEqual(['60px', '30px']);
    // the far (bottom-right) corner was at (150, 90) and still is
    expect(at(container, 'a')).toBe('translate(90px, 60px)');
    resize(container, 'bottom-right', 900, 900); // grow hard
    expect(size(container)).toEqual(['200px', '80px']);
  });

  it('keeps the aspect ratio when asked', () => {
    const { container } = render(<Harness types={resizable({ keepAspectRatio: true })} />);
    resize(container, 'right', 50, 0); // ratio 2.5: 150 wide wants 60 high
    expect(size(container)).toEqual(['150px', '60px']);
    resize(container, 'bottom-right', 0, 30); // dragged down: the height leads
    expect(size(container)).toEqual(['225px', '90px']);
  });

  it('measures the drag in graph units, so it tracks the pointer at any zoom', () => {
    const { container } = render(<Harness types={resizable()} zoom={2} />);
    resize(container, 'bottom-right', 40, 20);
    expect(size(container)).toEqual(['120px', '50px']);
  });

  it('reports each step as a dimensions change with setAttributes, a position change only when the corner moves, and ends the resize', () => {
    const onChange = vi.fn();
    const { container } = render(<Harness types={resizable()} onChange={onChange} />);
    onChange.mockClear();
    resize(container, 'bottom-right', 30, 20);
    const all = (onChange.mock.calls as NodeChange[][][]).flat(2);
    expect(all).toEqual([
      { type: 'dimensions', id: 'a', dimensions: { width: 130, height: 60 }, resizing: true, setAttributes: true },
      { type: 'dimensions', id: 'a', resizing: false },
    ]);
    onChange.mockClear();
    resize(container, 'top-left', -10, -10);
    const moved = (onChange.mock.calls as NodeChange[][][]).flat(2);
    expect(moved.some((c) => c.type === 'position')).toBe(true);
  });

  it('marks the node resizing while it is, and not after', () => {
    let latest: Node[] = [];
    const types = resizable(); // once: a new component type each render would remount the node
    function Probe() {
      const [nodes, , onNodesChange] = useNodesState(start());
      latest = nodes;
      return <FlowingerCanvas nodes={nodes} nodeTypes={types} onNodesChange={onNodesChange} />;
    }
    const { container } = render(<Probe />);
    const el = control(container, 'bottom-right');
    fireEvent.pointerDown(el, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(el, pointer({ clientX: 10, clientY: 10 }));
    expect(latest[0]?.resizing).toBe(true);
    fireEvent.pointerUp(el, pointer({ clientX: 10, clientY: 10 }));
    expect(latest[0]?.resizing).toBe(false);
    expect(latest[0]).toMatchObject({ width: 110, height: 50 });
  });

  it('calls the callbacks with the node’s box, and lets shouldResize refuse a step', () => {
    const onResizeStart = vi.fn();
    const onResize = vi.fn();
    const onResizeEnd = vi.fn();
    const shouldResize = vi.fn((_e: unknown, p: { width: number }) => p.width < 140);
    const { container } = render(
      <Harness types={resizable({ onResizeStart, onResize, onResizeEnd, shouldResize })} />,
    );
    const el = control(container, 'bottom-right');
    fireEvent.pointerDown(el, pointer({ clientX: 0, clientY: 0 }));
    expect(onResizeStart.mock.calls[0]?.[1]).toEqual({ x: 50, y: 50, width: 100, height: 40 });
    fireEvent.pointerMove(el, pointer({ clientX: 30, clientY: 0 }));
    expect(onResize.mock.calls[0]?.[1]).toEqual({ x: 50, y: 50, width: 130, height: 40 });
    fireEvent.pointerMove(el, pointer({ clientX: 60, clientY: 0 })); // 160: refused
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(size(container)).toEqual(['130px', '40px']);
    fireEvent.pointerUp(el, pointer({ clientX: 60, clientY: 0 }));
    expect(onResizeEnd).toHaveBeenCalledTimes(1);
  });

  it('is not shown when isVisible is false', () => {
    const { container } = render(<Harness types={resizable({ isVisible: false })} />);
    expect(container.querySelector('.flowinger-resize-control')).toBeNull();
  });

  it('does not drag the node or pan the canvas, and is not a click on the node', () => {
    const onNodeClick = vi.fn();
    const { container } = render(
      <FlowingerCanvas
        defaultNodes={start()}
        nodeTypes={resizable()}
        nodesDraggable
        elementsSelectable
        onNodeClick={onNodeClick}
      />,
    );
    const el = control(container, 'right');
    fireEvent.pointerDown(el, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(el, pointer({ clientX: 40, clientY: 40 }));
    fireEvent.pointerUp(el, pointer({ clientX: 40, clientY: 40 }));
    fireEvent.click(el);
    expect(at(container, 'a')).toBe('translate(50px, 50px)'); // widened, not moved
    expect(node(container, 'a').style.width).toBe('140px');
    expect(must<HTMLElement>(container, '.flowinger-viewport').style.transform).toBe('translate(0px, 0px) scale(1)');
    expect(onNodeClick).not.toHaveBeenCalled();
    expect(node(container, 'a').classList.contains('selected')).toBe(false);
  });

  it('leaves the canvas with no stray pointer, so the next touch is a pan and not half a pinch', () => {
    const { container } = render(<Harness types={resizable()} />);
    resize(container, 'bottom-right', 20, 20); // pointer 1 goes down and up on the control
    const pane = container.firstElementChild as Element;
    fireEvent.pointerDown(pane, { pointerId: 2, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(pane, { pointerId: 2, button: 0, clientX: 160, clientY: 100 });
    expect(must<HTMLElement>(container, '.flowinger-viewport').style.transform).toBe('translate(60px, 0px) scale(1)');
  });

  it('has nothing to write the size to on nodes that are only passed in — and so does nothing', () => {
    const { container } = render(<FlowingerCanvas nodes={start()} nodeTypes={resizable()} />);
    resize(container, 'bottom-right', 30, 20);
    expect(size(container)).toEqual(['100px', '40px']);
  });

  it('ignores a press of another mouse button', () => {
    const { container } = render(<Harness types={resizable()} />);
    const el = control(container, 'bottom-right');
    fireEvent.pointerDown(el, pointer({ clientX: 0, clientY: 0, button: 2 }));
    fireEvent.pointerMove(el, pointer({ clientX: 30, clientY: 30 }));
    expect(size(container)).toEqual(['100px', '40px']);
  });
});
