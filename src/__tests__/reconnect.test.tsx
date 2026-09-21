import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import {
  FlowingerCanvas,
  Handle,
  Position,
  reconnectEdge,
  useEdgesState,
  type Connection,
  type ConnectionLineProps,
  type Edge,
  type FlowingerProps,
  type Node,
} from '../index.ts';

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}

function Ports() {
  return (
    <div>
      <Handle id="in" type="target" position={Position.Top} />
      <Handle id="out" type="source" position={Position.Bottom} />
    </div>
  );
}
const types = { ports: Ports };
// Unmeasured (jsdom), so handles sit at the middle of their side: a.out (50,40), b.in (50,200),
// c.in (350,200), c.out (350,240), b.out (50,240).
const nodes = (): Node[] => [
  { id: 'a', type: 'ports', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
  { id: 'b', type: 'ports', position: { x: 0, y: 200 }, width: 100, height: 40, data: {} },
  { id: 'c', type: 'ports', position: { x: 300, y: 200 }, width: 100, height: 40, data: {} },
];
const edge = (extra: Partial<Edge> = {}): Edge => ({
  id: 'e',
  source: 'a',
  target: 'b',
  sourceHandle: 'out',
  targetHandle: 'in',
  selected: true,
  ...extra,
});

const handle = (c: ParentNode, n: string, id: string) =>
  must<HTMLElement>(c, `[data-id="${n}"] [data-handleid="${id}"]`);
const anchors = (c: ParentNode) => [...c.querySelectorAll<HTMLElement>('.flowinger-reconnect-anchor')];
const anchor = (c: ParentNode, end: 'source' | 'target') =>
  must<HTMLElement>(c, `.flowinger-reconnect-anchor[data-end="${end}"]`);
const overPoint = (el: Element | null) =>
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => el });
afterEach(() => {
  Reflect.deleteProperty(document, 'elementFromPoint');
});

const ui = (props: Partial<FlowingerProps> = {}, edges: Edge[] = [edge()]) => (
  <FlowingerCanvas
    nodes={nodes()}
    edges={edges}
    nodeTypes={types}
    nodesConnectable
    elementsSelectable
    onEdgesChange={() => {}}
    onReconnect={() => {}}
    {...props}
  />
);

/** Presses on an anchor and drags to (x, y) — leaving the pointer down. */
function dragEnd(c: ParentNode, end: 'source' | 'target', over: Element | null, to: [number, number]) {
  const from = end === 'source' ? [50, 40] : [50, 200];
  overPoint(over);
  fireEvent.pointerDown(anchor(c, end), pointer({ clientX: from[0] ?? 0, clientY: from[1] ?? 0 }));
  fireEvent.pointerMove(window, pointer({ clientX: to[0], clientY: to[1] }));
}
const release = (x: number, y: number) => fireEvent.pointerUp(window, pointer({ clientX: x, clientY: y }));

describe('the drag handles on a selected edge', () => {
  it('sit on both ends, above the nodes, and only when there is an onReconnect to hear of them', () => {
    const { container, rerender } = render(ui());
    expect(anchors(container)).toHaveLength(2);
    // Centred on where the edge attaches: (50, 40) and (50, 200), radius 8.
    expect([anchor(container, 'source').style.left, anchor(container, 'source').style.top]).toEqual(['42px', '32px']);
    expect([anchor(container, 'target').style.left, anchor(container, 'target').style.top]).toEqual(['42px', '192px']);
    expect(must(container, '.flowinger-edge-labels').contains(anchor(container, 'source'))).toBe(true);
    rerender(ui({ onReconnect: undefined }));
    expect(anchors(container)).toHaveLength(0);
  });

  it('follow the edge as a node moves', () => {
    const { container } = render(ui({ nodesDraggable: true }));
    const b = must<HTMLElement>(container, '[data-id="b"]');
    fireEvent.pointerDown(b, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(b, pointer({ clientX: 0, clientY: 60 }));
    expect(anchor(container, 'target').style.top).toBe('252px'); // 192 + 60
  });

  it('are not there for an edge that is not selected, or a canvas that cannot select', () => {
    const { container, rerender } = render(ui({}, [edge({ selected: false })]));
    expect(anchors(container)).toHaveLength(0);
    rerender(ui({ elementsSelectable: false }));
    expect(anchors(container)).toHaveLength(0);
  });

  it('can be switched off for all edges, one edge, or one end', () => {
    const { container, rerender } = render(ui({ edgesReconnectable: false }));
    expect(anchors(container)).toHaveLength(0);
    rerender(ui({}, [edge({ reconnectable: false })]));
    expect(anchors(container)).toHaveLength(0);
    rerender(ui({}, [edge({ reconnectable: 'source' })]));
    expect(anchors(container).map((a) => a.dataset.end)).toEqual(['source']);
    rerender(ui({}, [edge({ reconnectable: 'target' })]));
    expect(anchors(container).map((a) => a.dataset.end)).toEqual(['target']);
    rerender(ui({}, [edge({ reconnectable: true })]));
    expect(anchors(container)).toHaveLength(2);
  });

  it('appear on selecting the edge, by click, and go with the selection', () => {
    const { container } = render(ui({ onEdgesChange: undefined }, [edge({ selected: undefined })]));
    expect(anchors(container)).toHaveLength(0);
    fireEvent.click(must(container, '.flowinger-edge-interaction'));
    expect(anchors(container)).toHaveLength(2);
    fireEvent.click(container.firstElementChild as Element);
    expect(anchors(container)).toHaveLength(0);
  });

  it('are on custom edges too, on the same spots', () => {
    function Mine() {
      return <path d="M 0 0 L 1 1" />;
    }
    const { container } = render(ui({ edgeTypes: { mine: Mine } }, [edge({ type: 'mine' })]));
    expect(anchors(container)).toHaveLength(2);
    expect([anchor(container, 'source').style.left, anchor(container, 'source').style.top]).toEqual(['42px', '32px']);
    expect([anchor(container, 'target').style.left, anchor(container, 'target').style.top]).toEqual(['42px', '192px']);
  });
});

describe('dragging one end to another handle', () => {
  it('reports the target end moved to another target handle', () => {
    const onReconnect = vi.fn();
    const onReconnectStart = vi.fn();
    const onReconnectEnd = vi.fn();
    const { container } = render(ui({ onReconnect, onReconnectStart, onReconnectEnd }));
    dragEnd(container, 'target', handle(container, 'c', 'in'), [350, 200]);
    expect(onReconnectStart).toHaveBeenCalledTimes(1);
    expect(onReconnectStart.mock.calls[0]?.[1]).toMatchObject({ id: 'e' });
    expect(onReconnectStart.mock.calls[0]?.[2]).toBe('target');
    expect(onReconnect).not.toHaveBeenCalled(); // not until it is let go
    release(350, 200);
    const wanted: Connection = { source: 'a', sourceHandle: 'out', target: 'c', targetHandle: 'in' };
    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(onReconnect.mock.calls[0]?.[0]).toMatchObject({ id: 'e', source: 'a', target: 'b' });
    expect(onReconnect.mock.calls[0]?.[1]).toEqual(wanted);
    expect(onReconnectEnd.mock.calls[0]?.[2]).toBe('target');
    expect(onReconnectEnd.mock.calls[0]?.[3]).toEqual({ connection: wanted, isValid: true });
  });

  it('reports the source end moved to another source handle — still source → target', () => {
    const onReconnect = vi.fn();
    const onReconnectStart = vi.fn();
    const { container } = render(ui({ onReconnect, onReconnectStart }));
    dragEnd(container, 'source', handle(container, 'c', 'out'), [350, 240]);
    release(350, 240);
    expect(onReconnectStart.mock.calls[0]?.[2]).toBe('source');
    expect(onReconnect.mock.calls[0]?.[1]).toEqual({
      source: 'c',
      sourceHandle: 'out',
      target: 'b',
      targetHandle: 'in',
    });
  });

  it('is a reconnection, not also a new connection', () => {
    const onConnect = vi.fn();
    const onConnectStart = vi.fn();
    const onConnectEnd = vi.fn();
    const { container } = render(ui({ onConnect, onConnectStart, onConnectEnd }));
    dragEnd(container, 'target', handle(container, 'c', 'in'), [350, 200]);
    release(350, 200);
    expect(onConnect).not.toHaveBeenCalled();
    expect(onConnectStart).not.toHaveBeenCalled();
    expect(onConnectEnd).not.toHaveBeenCalled();
  });

  it('counts a move to another handle of the same node as a change', () => {
    function TwoOuts() {
      return (
        <div>
          <Handle id="out" type="source" position={Position.Bottom} />
          <Handle id="out2" type="source" position={Position.Right} />
        </div>
      );
    }
    const onReconnect = vi.fn();
    const two = nodes().map((n) => (n.id === 'a' ? { ...n, type: 'two' } : n));
    const { container } = render(
      ui({ nodes: two, nodeTypes: { ...types, two: TwoOuts }, onReconnect }),
    );
    dragEnd(container, 'source', handle(container, 'a', 'out2'), [100, 20]);
    release(100, 20);
    expect(onReconnect.mock.calls[0]?.[1]).toEqual({
      source: 'a',
      sourceHandle: 'out2',
      target: 'b',
      targetHandle: 'in',
    });
  });

  it('leaves the other edges drawn while one is dragged', () => {
    const others = [edge(), edge({ id: 'f', source: 'b', target: 'c', sourceHandle: 'out', targetHandle: 'in', selected: false })];
    const { container } = render(ui({}, others));
    dragEnd(container, 'target', null, [300, 120]);
    expect(container.querySelector('[data-testid="edge-e"]')).toBeNull();
    expect(container.querySelector('[data-testid="edge-f"]')).not.toBeNull();
  });

  it('reports nothing when released over no handle, but says how it ended', () => {
    const onReconnect = vi.fn();
    const onReconnectEnd = vi.fn();
    const { container } = render(ui({ onReconnect, onReconnectEnd }));
    dragEnd(container, 'target', null, [500, 500]);
    release(500, 500);
    expect(onReconnect).not.toHaveBeenCalled();
    expect(onReconnectEnd.mock.calls[0]?.[3]).toEqual({ connection: null, isValid: null });
  });

  it('refuses the wrong kind of handle, and one isValidConnection vetoes', () => {
    const onReconnect = vi.fn();
    const onReconnectEnd = vi.fn();
    const { container, rerender } = render(ui({ onReconnect, onReconnectEnd }));
    // A target end dropped on a source handle: strict mode joins source to target only.
    dragEnd(container, 'target', handle(container, 'c', 'out'), [350, 240]);
    release(350, 240);
    expect(onReconnect).not.toHaveBeenCalled();
    expect(onReconnectEnd.mock.calls[0]?.[3]).toEqual({ connection: null, isValid: false });

    rerender(ui({ onReconnect, onReconnectEnd, isValidConnection: () => false }));
    dragEnd(container, 'target', handle(container, 'c', 'in'), [350, 200]);
    release(350, 200);
    expect(onReconnect).not.toHaveBeenCalled();
    expect((onReconnectEnd.mock.calls[1]?.[3] as { isValid: boolean }).isValid).toBe(false);
  });

  it('is not a change when the end is put back where it was', () => {
    const onReconnect = vi.fn();
    const onReconnectEnd = vi.fn();
    const { container } = render(ui({ onReconnect, onReconnectEnd }));
    dragEnd(container, 'target', handle(container, 'b', 'in'), [50, 200]);
    release(50, 200);
    expect(onReconnect).not.toHaveBeenCalled();
    expect((onReconnectEnd.mock.calls[0]?.[3] as { isValid: boolean }).isValid).toBe(true);
  });

  it('is cancelled by Escape', () => {
    const onReconnect = vi.fn();
    const { container } = render(ui({ onReconnect }));
    dragEnd(container, 'target', handle(container, 'c', 'in'), [350, 200]);
    fireEvent.keyDown(window, { key: 'Escape' });
    release(350, 200);
    expect(onReconnect).not.toHaveBeenCalled();
    expect(container.querySelector('.react-flow__connection-path')).toBeNull();
  });

  it('takes only the primary button', () => {
    const onReconnectStart = vi.fn();
    const { container } = render(ui({ onReconnectStart }));
    fireEvent.pointerDown(anchor(container, 'target'), pointer({ clientX: 50, clientY: 200, button: 2 }));
    expect(onReconnectStart).not.toHaveBeenCalled();
  });

  it('draws the line from the end that stays, and hides the edge while it is dragged', () => {
    const seen: ConnectionLineProps[] = [];
    function Line(props: ConnectionLineProps) {
      seen.push(props);
      return null;
    }
    const { container } = render(ui({ connectionLineComponent: Line }));
    expect(container.querySelector('[data-testid="edge-e"]')).not.toBeNull();
    dragEnd(container, 'target', null, [300, 120]);
    const last = seen.at(-1);
    // The target end is the one moving: the line starts at the source's handle, a.out.
    expect(last).toMatchObject({ fromX: 50, fromY: 40, toX: 300, toY: 120 });
    expect(container.querySelector('[data-testid="edge-e"]')).toBeNull(); // the line stands in for it
    release(300, 120);
    expect(container.querySelector('[data-testid="edge-e"]')).not.toBeNull();
  });

  it('draws it from the target when the source end is dragged', () => {
    const seen: ConnectionLineProps[] = [];
    function Line(props: ConnectionLineProps) {
      seen.push(props);
      return null;
    }
    const { container } = render(ui({ connectionLineComponent: Line }));
    dragEnd(container, 'source', null, [300, 80]);
    expect(seen.at(-1)).toMatchObject({ fromX: 50, fromY: 200, toX: 300, toY: 80 });
  });

  it('does not pan the canvas or change the selection', () => {
    const onSelectionChange = vi.fn();
    const { container } = render(ui({ onSelectionChange }));
    onSelectionChange.mockClear();
    dragEnd(container, 'target', null, [400, 400]);
    release(400, 400);
    fireEvent.click(anchor(container, 'target'));
    expect(must<HTMLElement>(container, '.flowinger-viewport').style.transform).toBe('translate(0px, 0px) scale(1)');
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(anchors(container)).toHaveLength(2);
  });

  it('is not a click on the edge', () => {
    const onEdgeClick = vi.fn();
    const { container } = render(ui({ onEdgeClick }));
    fireEvent.click(anchor(container, 'target'));
    expect(onEdgeClick).not.toHaveBeenCalled();
  });

  it('leaves the canvas with no stray pointer, so the next touch is a pan and not half a pinch', () => {
    const { container } = render(ui());
    dragEnd(container, 'target', null, [400, 400]);
    release(400, 400);
    const pane = container.firstElementChild as Element;
    fireEvent.pointerDown(pane, { pointerId: 2, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(pane, { pointerId: 2, button: 0, clientX: 160, clientY: 100 });
    expect(must<HTMLElement>(container, '.flowinger-viewport').style.transform).toBe('translate(60px, 0px) scale(1)');
  });

  it('needs the end it keeps to have a handle: with none registered, nothing starts', () => {
    const onReconnectStart = vi.fn();
    const bare = nodes().map((n) => (n.id === 'a' ? { ...n, type: undefined } : n));
    const { container } = render(ui({ nodes: bare, onReconnectStart }));
    dragEnd(container, 'target', null, [300, 120]);
    expect(onReconnectStart).not.toHaveBeenCalled();
  });
});

describe('reconnectEdge', () => {
  const edges: Edge[] = [
    { id: 'x', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in', label: 'hi', style: { stroke: 'red' } },
    { id: 'y', source: 'b', target: 'c' },
  ];
  const to: Connection = { source: 'a', sourceHandle: 'out', target: 'c', targetHandle: 'in' };

  it('moves the edge to the new connection, in place, keeping everything else about it', () => {
    const [first] = edges;
    if (!first) throw new Error('fixture');
    const out = reconnectEdge(first, to, edges);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ source: 'a', target: 'c', sourceHandle: 'out', targetHandle: 'in', label: 'hi', style: { stroke: 'red' } });
    expect(out[1]).toBe(edges[1]);
    expect(out[0]?.id).not.toBe('x'); // the id follows the connection
  });

  it('keeps the id when asked', () => {
    const [first] = edges;
    if (!first) throw new Error('fixture');
    expect(reconnectEdge(first, to, edges, { shouldReplaceId: false })[0]?.id).toBe('x');
  });

  it('gives two different connections two different ids', () => {
    const [first] = edges;
    if (!first) throw new Error('fixture');
    const a = reconnectEdge(first, to, edges)[0]?.id;
    const b = reconnectEdge(first, { ...to, targetHandle: 'other' }, edges)[0]?.id;
    expect(a).not.toBe(b);
  });

  it('is not blocked by an edge that joins the same nodes by other handles', () => {
    const [first] = edges;
    if (!first) throw new Error('fixture');
    const near: Edge[] = [...edges, { id: 'z', source: 'a', target: 'c', sourceHandle: 'out', targetHandle: 'other' }];
    expect(reconnectEdge(first, to, near)).not.toBe(near);
    expect(reconnectEdge(first, to, near)).toHaveLength(3);
  });

  it('does not make a twin of an edge that already joins those handles', () => {
    const [first] = edges;
    if (!first) throw new Error('fixture');
    const twin: Edge[] = [...edges, { id: 'z', source: 'a', target: 'c', sourceHandle: 'out', targetHandle: 'in' }];
    expect(reconnectEdge(first, to, twin)).toBe(twin);
    // "no handle" is null or undefined alike
    const bare: Edge[] = [...edges, { id: 'z', source: 'a', target: 'c' }];
    expect(reconnectEdge(first, { source: 'a', sourceHandle: null, target: 'c', targetHandle: null }, bare)).toBe(bare);
  });

  it('leaves the list alone for an edge that is not in it', () => {
    expect(reconnectEdge({ id: 'nope', source: 'a', target: 'b' }, to, edges)).toBe(edges);
  });

  it('works end to end: drag an end, apply it, and the edge now runs to the new handle', () => {
    function Harness() {
      const [list, setList, onEdgesChange] = useEdgesState<Edge>([edge()]);
      return (
        <FlowingerCanvas
          nodes={nodes()}
          edges={list}
          nodeTypes={types}
          nodesConnectable
          elementsSelectable
          onEdgesChange={onEdgesChange}
          onReconnect={(old, next) => {
            setList((es) => reconnectEdge(old, next, es));
          }}
        />
      );
    }
    const { container } = render(<Harness />);
    dragEnd(container, 'target', handle(container, 'c', 'in'), [350, 200]);
    release(350, 200);
    const path = must(container, '.flowinger-edge-path').getAttribute('d') ?? '';
    expect(path).toMatch(/^M 50\.00 40\.00 C/); // still from a.out…
    expect(path).toMatch(/350\.00 200\.00$/); // …but now to c.in
  });
});
