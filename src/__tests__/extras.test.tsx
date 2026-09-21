import { memo, useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import {
  ConnectionLineType,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  Position,
  ViewportPortal,
  useEdges,
  useKeyPress,
  useNodeConnections,
  useNodes,
  useNodesData,
  useOnSelectionChange,
  type ConnectionLineProps,
  type Edge,
  type Node,
  type NodeProps,
} from '../index.ts';

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const node = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
const pane = (c: ParentNode) => c.firstElementChild as HTMLElement;
const viewportOf = (c: ParentNode) => must<HTMLElement>(c, '.flowinger-viewport').style.transform;

const box = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  width: 100,
  height: 40,
  data: {},
  ...extra,
});
const abc = (): Node[] => [box('a', 0, 0), box('b', 200, 0), box('c', 400, 0)];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('zoomOnDoubleClick', () => {
  it('zooms in about the pointer, and out with Shift', () => {
    vi.useFakeTimers();
    const { container } = render(<FlowingerCanvas nodes={abc()} />);
    fireEvent.doubleClick(pane(container), { clientX: 100, clientY: 80 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // The graph point under the pointer stays under it.
    expect(viewportOf(container)).toBe('translate(-100px, -80px) scale(2)');
    fireEvent.doubleClick(pane(container), { clientX: 100, clientY: 80, shiftKey: true });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1)');
  });

  it('is on by default, and off when asked', () => {
    vi.useFakeTimers();
    const { container } = render(<FlowingerCanvas nodes={abc()} zoomOnDoubleClick={false} />);
    fireEvent.doubleClick(pane(container), { clientX: 100, clientY: 80 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1)');
  });

  it('leaves a double click on a node to the node', () => {
    vi.useFakeTimers();
    const { container } = render(<FlowingerCanvas nodes={abc()} />);
    fireEvent.doubleClick(node(container, 'a'), { clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1)');
  });

  it('stops at maxZoom', () => {
    vi.useFakeTimers();
    const { container } = render(<FlowingerCanvas nodes={abc()} maxZoom={1.5} />);
    fireEvent.doubleClick(pane(container), { clientX: 0, clientY: 0 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1.5)');
  });
});

describe('useKeyPress', () => {
  function Probe({ code, ...options }: { code: string | string[] | null } & Parameters<typeof useKeyPress>[1]) {
    return <output data-testid="out">{String(useKeyPress(code, options))}</output>;
  }
  const out = (c: ParentNode) => must(c, '[data-testid="out"]').textContent;
  const key = (init: KeyboardEventInit & { key: string }) => fireEvent.keyDown(document, init);
  const keyUp = (init: KeyboardEventInit & { key: string }) => fireEvent.keyUp(document, init);

  it('is true while a key is held, and false otherwise', () => {
    const { container } = render(<Probe code="a" />);
    expect(out(container)).toBe('false');
    key({ key: 'a' });
    expect(out(container)).toBe('true');
    keyUp({ key: 'a' });
    expect(out(container)).toBe('false');
    key({ key: 'b' });
    expect(out(container)).toBe('false');
  });

  it('ignores case, and takes any key of a list', () => {
    const { container } = render(<Probe code={['x', 'Y']} />);
    key({ key: 'X' });
    expect(out(container)).toBe('true');
    keyUp({ key: 'X' });
    key({ key: 'y' });
    expect(out(container)).toBe('true');
  });

  it('matches the physical key by `code` as well', () => {
    const { container } = render(<Probe code="Space" />);
    key({ key: ' ', code: 'Space' });
    expect(out(container)).toBe('true');
  });

  it('takes a combination, needing exactly its modifiers', () => {
    const { container } = render(<Probe code="Meta+s" />);
    key({ key: 's' });
    expect(out(container)).toBe('false');
    key({ key: 's', metaKey: true });
    expect(out(container)).toBe('true');
    keyUp({ key: 's', metaKey: true });
    expect(out(container)).toBe('false');
    // Held, then the modifier let go.
    key({ key: 's', metaKey: true });
    keyUp({ key: 'Meta' });
    expect(out(container)).toBe('false');
    // An extra modifier is a different combination.
    key({ key: 's', metaKey: true, shiftKey: true });
    expect(out(container)).toBe('false');
  });

  it('lets go when any modifier of a combination is released', () => {
    const cases: [string, string, string][] = [
      ['Ctrl+k', 'ctrlKey', 'Control'],
      ['Shift+k', 'shiftKey', 'Shift'],
      ['Alt+k', 'altKey', 'Alt'],
      ['Meta+k', 'metaKey', 'Meta'],
    ];
    for (const [combo, flag, modifierKey] of cases) {
      const { container, unmount } = render(<Probe code={combo} />);
      key({ key: 'k', [flag]: true });
      expect(out(container)).toBe('true');
      keyUp({ key: modifierKey });
      expect(out(container)).toBe('false');
      unmount();
    }
  });

  it('does not let a plain key match its modified self — by any modifier', () => {
    const { container } = render(<Probe code="s" />);
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
      key({ key: 's', [modifier]: true });
      expect(out(container)).toBe('false');
    }
  });

  it('matches nothing for a blank key, even from a keyboard that reports no `code`', () => {
    const { container, rerender } = render(<Probe code="" />);
    key({ key: 'a', code: '' });
    expect(out(container)).toBe('false');
    rerender(<Probe code="Meta+" />);
    key({ key: 'q', code: '', metaKey: true });
    expect(out(container)).toBe('false');
    // …and a blank `code` is no match for a key named by its code.
    rerender(<Probe code="KeyQ" />);
    key({ key: 'q', code: '' });
    expect(out(container)).toBe('false');
  });

  it('lets go when the key it watches becomes null', () => {
    const { container, rerender } = render(<Probe code="a" />);
    key({ key: 'a' });
    expect(out(container)).toBe('true');
    rerender(<Probe code={null} />);
    expect(out(container)).toBe('false');
  });

  it('takes a modifier as a key on its own, and the plus key', () => {
    const { container, rerender } = render(<Probe code="Shift" />);
    key({ key: 'Shift', shiftKey: true });
    expect(out(container)).toBe('true');
    keyUp({ key: 'Shift' });
    expect(out(container)).toBe('false');
    rerender(<Probe code="+" />);
    key({ key: '+' });
    expect(out(container)).toBe('true');
  });

  it('leaves typing in a field alone, unless a modifier makes it a shortcut', () => {
    const { container, getByTestId } = render(
      <div>
        <input data-testid="field" />
        <Probe code={['a', 'Ctrl+a']} />
      </div>,
    );
    fireEvent.keyDown(getByTestId('field'), { key: 'a' });
    expect(out(container)).toBe('false');
    fireEvent.keyDown(getByTestId('field'), { key: 'a', ctrlKey: true });
    expect(out(container)).toBe('true');
  });

  it('can refuse modified keys in a field too', () => {
    const { container, getByTestId } = render(
      <div>
        <input data-testid="field" />
        <Probe code="Ctrl+a" actInsideInputWithModifier={false} />
      </div>,
    );
    fireEvent.keyDown(getByTestId('field'), { key: 'a', ctrlKey: true });
    expect(out(container)).toBe('false');
  });

  it('lets go when the window loses focus, and when the key it watches changes', () => {
    const { container, rerender } = render(<Probe code="a" />);
    key({ key: 'a' });
    fireEvent.blur(window);
    expect(out(container)).toBe('false');
    key({ key: 'a' });
    rerender(<Probe code="b" />);
    expect(out(container)).toBe('false');
    key({ key: 'a' });
    expect(out(container)).toBe('false');
  });

  it('never matches null, and listens where it is told to', () => {
    const { container, rerender } = render(<Probe code={null} />);
    key({ key: 'a' });
    expect(out(container)).toBe('false');
    const target = document.createElement('div');
    rerender(<Probe code="a" target={target} />);
    key({ key: 'a' }); // on the document: not where it listens
    expect(out(container)).toBe('false');
    fireEvent.keyDown(target, { key: 'a' });
    expect(out(container)).toBe('true');
  });

  it('stops listening when it unmounts', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<Probe code="a" />);
    const added = add.mock.calls.filter(([type]) => type === 'keydown').length;
    unmount();
    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(added);
  });
});

describe('useOnSelectionChange', () => {
  function Listener({ onChange }: { onChange: (s: { nodes: Node[]; edges: Edge[] }) => void }) {
    useOnSelectionChange({ onChange });
    return null;
  }

  it('hears every change from inside the canvas, and nothing at mount', () => {
    const onChange = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={abc()} edges={[{ id: 'ab', source: 'a', target: 'b' }]} elementsSelectable>
        <Listener onChange={onChange} />
      </FlowingerCanvas>,
    );
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(node(container, 'a'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0]?.[0] as { nodes: Node[] }).nodes.map((n) => n.id)).toEqual(['a']);
    fireEvent.click(node(container, 'b'), { shiftKey: true });
    expect((onChange.mock.calls[1]?.[0] as { nodes: Node[] }).nodes.map((n) => n.id)).toEqual(['a', 'b']);
    fireEvent.click(pane(container));
    expect((onChange.mock.calls[2]?.[0] as { nodes: Node[] }).nodes).toEqual([]);
  });

  it('calls the latest callback, not the first', () => {
    const first = vi.fn();
    const second = vi.fn();
    const ui = (fn: () => void) => (
      <FlowingerCanvas nodes={abc()} elementsSelectable>
        <Listener onChange={fn} />
      </FlowingerCanvas>
    );
    const { container, rerender } = render(ui(first));
    rerender(ui(second));
    fireEvent.click(node(container, 'a'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does nothing outside a canvas', () => {
    expect(() => render(<Listener onChange={() => {}} />)).not.toThrow();
  });
});

describe('useNodes, useEdges, useNodesData', () => {
  it('read the nodes and edges as given', () => {
    function Counts() {
      return (
        <output data-testid="counts">
          {useNodes().length}/{useEdges().length}
        </output>
      );
    }
    const { getByTestId } = render(
      <FlowingerCanvas nodes={abc()} edges={[{ id: 'ab', source: 'a', target: 'b' }]}>
        <Counts />
      </FlowingerCanvas>,
    );
    expect(getByTestId('counts').textContent).toBe('3/1');
  });

  describe('useNodesData', () => {
    const renders = { one: 0, many: 0 };
    // Memoised, so a re-render of the canvas that recreates them does not count: only the hook can.
    const One = memo(function One() {
      renders.one += 1;
      const d = useNodesData('a');
      return <output data-testid="one">{d ? JSON.stringify(d.data) : 'none'}</output>;
    });
    const Many = memo(function Many() {
      renders.many += 1;
      const list = useNodesData(['a', 'c', 'nope']);
      return <output data-testid="many">{list.map((n) => n.id).join(',')}</output>;
    });
    afterEach(() => {
      renders.one = 0;
      renders.many = 0;
    });
    const ui = (nodes: Node[]) => (
      <FlowingerCanvas nodes={nodes}>
        <One />
        <Many />
      </FlowingerCanvas>
    );

    it('gives null — not undefined — for a node that is not there', () => {
      let got: unknown = 'unset';
      function Grab() {
        got = useNodesData('nope');
        return null;
      }
      render(
        <FlowingerCanvas nodes={abc()}>
          <Grab />
        </FlowingerCanvas>,
      );
      expect(got).toBeNull();
    });

    it('gives a node’s data, or null; a list drops the ones that are missing', () => {
      const first = render(ui([box('a', 0, 0, { data: { n: 1 } }), box('c', 5, 5)]));
      expect(first.getByTestId('one').textContent).toBe('{"n":1}');
      expect(first.getByTestId('many').textContent).toBe('a,c');
      first.unmount();
      const gone = render(ui([box('b', 0, 0)]));
      expect(gone.getByTestId('one').textContent).toBe('none');
      expect(gone.getByTestId('many').textContent).toBe('');
    });

    it('follows a change to that data, and ignores everything else', () => {
      const data = { n: 1 };
      const other = { n: 9 };
      const nodes = [box('a', 0, 0, { data }), box('c', 5, 5, { data: other })];
      const { getByTestId, rerender } = render(ui(nodes));
      const settled = { ...renders };
      // Both nodes move and are re-created, each with the very same data.
      rerender(ui([box('a', 50, 50, { data }), box('c', 99, 99, { data: other })]));
      expect(renders.one).toBe(settled.one);
      expect(renders.many).toBe(settled.many);
      rerender(ui([box('a', 50, 50, { data: { n: 2 } }), box('c', 99, 99, { data: other })]));
      expect(getByTestId('one').textContent).toBe('{"n":2}');
      expect(renders.one).toBeGreaterThan(settled.one);
    });
  });
});

describe('useNodeConnections', () => {
  const edges = (): Edge[] => [
    { id: 'ab', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in' },
    { id: 'cb', source: 'c', target: 'b', sourceHandle: 'out', targetHandle: 'other' },
    { id: 'bd', source: 'b', target: 'd' },
  ];
  const nodes = (): Node[] => [...abc(), box('d', 600, 0)];
  const ids = (list: { edgeId: string }[]) => list.map((c) => c.edgeId).join(',');

  function Show({ options, testid }: { options?: Parameters<typeof useNodeConnections>[0]; testid: string }) {
    return <output data-testid={testid}>{ids(useNodeConnections(options))}</output>;
  }

  it('lists the edges at a node — leaving, arriving or both — and at one handle', () => {
    const { getByTestId } = render(
      <FlowingerCanvas nodes={nodes()} edges={edges()}>
        <Show testid="all" options={{ id: 'b' }} />
        <Show testid="in" options={{ id: 'b', handleType: 'target' }} />
        <Show testid="out" options={{ id: 'b', handleType: 'source' }} />
        <Show testid="handle" options={{ id: 'b', handleType: 'target', handleId: 'in' }} />
        <Show testid="none" options={{ id: 'a', handleType: 'target' }} />
      </FlowingerCanvas>,
    );
    expect(getByTestId('all').textContent).toBe('ab,cb,bd');
    expect(getByTestId('in').textContent).toBe('ab,cb');
    expect(getByTestId('out').textContent).toBe('bd');
    expect(getByTestId('handle').textContent).toBe('ab');
    expect(getByTestId('none').textContent).toBe('');
  });

  it('filters by the handle at the source end too', () => {
    const { getByTestId } = render(
      <FlowingerCanvas nodes={nodes()} edges={edges()}>
        <Show testid="a-out" options={{ id: 'a', handleType: 'source', handleId: 'out' }} />
        <Show testid="a-other" options={{ id: 'a', handleType: 'source', handleId: 'other' }} />
        <Show testid="b-out" options={{ id: 'b', handleType: 'source', handleId: 'out' }} />
      </FlowingerCanvas>,
    );
    expect(getByTestId('a-out').textContent).toBe('ab');
    expect(getByTestId('a-other').textContent).toBe('');
    expect(getByTestId('b-out').textContent).toBe(''); // bd leaves b from no named handle
  });

  it('follows an edge that keeps its id but is re-wired', () => {
    function Json() {
      return <output data-testid="json">{JSON.stringify(useNodeConnections({ id: 'a' }))}</output>;
    }
    const ui = (targetHandle: string) => (
      <FlowingerCanvas nodes={nodes()} edges={[{ id: 'ab', source: 'a', target: 'b', targetHandle }]}>
        <Json />
      </FlowingerCanvas>
    );
    const { getByTestId, rerender } = render(ui('one'));
    expect(getByTestId('json').textContent).toContain('"targetHandle":"one"');
    rerender(ui('two'));
    expect(getByTestId('json').textContent).toContain('"targetHandle":"two"');
  });

  it('describes each connection from both ends', () => {
    let seen: unknown;
    function Grab() {
      seen = useNodeConnections({ id: 'a' });
      return null;
    }
    render(
      <FlowingerCanvas nodes={nodes()} edges={edges()}>
        <Grab />
      </FlowingerCanvas>,
    );
    expect(seen).toEqual([{ edgeId: 'ab', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in' }]);
  });

  it('defaults to the node it is rendered inside', () => {
    function Inside({ id }: NodeProps) {
      return <span data-testid={`inside-${id}`}>{ids(useNodeConnections({ handleType: 'source' }))}</span>;
    }
    const typed = nodes().map((n) => ({ ...n, type: 'inside' }));
    const { getByTestId } = render(
      <FlowingerCanvas nodes={typed} edges={edges()} nodeTypes={{ inside: Inside }} />,
    );
    expect(getByTestId('inside-a').textContent).toBe('ab');
    expect(getByTestId('inside-b').textContent).toBe('bd');
    expect(getByTestId('inside-d').textContent).toBe('');
  });

  it('says what appeared and what went, but not what was there to begin with', () => {
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    function Watch() {
      useNodeConnections({ id: 'b', onConnect, onDisconnect });
      return null;
    }
    const ui = (list: Edge[]) => (
      <FlowingerCanvas nodes={nodes()} edges={list}>
        <Watch />
      </FlowingerCanvas>
    );
    const { rerender } = render(ui(edges()));
    expect(onConnect).not.toHaveBeenCalled();
    rerender(ui([...edges(), { id: 'db', source: 'd', target: 'b' }]));
    expect(onConnect).toHaveBeenCalledTimes(1);
    expect((onConnect.mock.calls[0]?.[0] as { edgeId: string }[]).map((c) => c.edgeId)).toEqual(['db']);
    rerender(ui(edges().filter((e) => e.id !== 'ab')));
    expect((onDisconnect.mock.calls[0]?.[0] as { edgeId: string }[]).map((c) => c.edgeId).sort()).toEqual(['ab', 'db']);
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('does not re-render for an edge elsewhere in the diagram', () => {
    let renders = 0;
    const Counted = memo(function Counted() {
      renders += 1;
      useNodeConnections({ id: 'a' });
      return null;
    });
    const ui = (list: Edge[]) => (
      <FlowingerCanvas nodes={nodes()} edges={list}>
        <Counted />
      </FlowingerCanvas>
    );
    const { rerender } = render(ui(edges()));
    const settled = renders;
    rerender(ui([...edges(), { id: 'cd', source: 'c', target: 'd' }]));
    expect(renders).toBe(settled);
  });
});

describe('ViewportPortal', () => {
  it('draws into a layer inside the viewport, above the nodes and the edge labels', () => {
    const { container, getByTestId } = render(
      <FlowingerCanvas nodes={abc()}>
        <ViewportPortal>
          <span data-testid="guide" style={{ position: 'absolute', transform: 'translate(40px, 50px)' }}>
            guide
          </span>
        </ViewportPortal>
      </FlowingerCanvas>,
    );
    const layer = must<HTMLElement>(container, '.flowinger-viewport-portal');
    expect(layer.contains(getByTestId('guide'))).toBe(true);
    expect(must(container, '.flowinger-viewport').contains(layer)).toBe(true);
    expect(layer.style.pointerEvents).toBe('none');
    const labels = must<HTMLElement>(container, '.flowinger-edge-labels');
    expect(Number(layer.style.zIndex)).toBeGreaterThan(Number(labels.style.zIndex));
  });

  it('works from inside a node too, and moves with the viewport', () => {
    function Tagged({ id }: NodeProps) {
      return (
        <ViewportPortal>
          <i data-testid={`tag-${id}`} />
        </ViewportPortal>
      );
    }
    const typed = abc().map((n) => ({ ...n, type: 'tag' }));
    const { container, getByTestId } = render(
      <FlowingerProvider initialViewport={{ x: 10, y: 20, zoom: 2 }}>
        <FlowingerCanvas nodes={typed} nodeTypes={{ tag: Tagged }} />
      </FlowingerProvider>,
    );
    expect(must(container, '.flowinger-viewport-portal').contains(getByTestId('tag-b'))).toBe(true);
    expect(viewportOf(container)).toBe('translate(10px, 20px) scale(2)');
  });

  it('renders nothing outside a canvas', () => {
    const { container } = render(
      <ViewportPortal>
        <span>lost</span>
      </ViewportPortal>,
    );
    expect(container.textContent).toBe('');
  });
});

describe('the line dragged out of a handle', () => {
  function Ports() {
    return (
      <div>
        <Handle id="in" type="target" position={Position.Top} />
        <Handle id="out" type="source" position={Position.Bottom} />
      </div>
    );
  }
  const types = { ports: Ports };
  const nodes: Node[] = [
    { id: 'a', type: 'ports', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
    { id: 'b', type: 'ports', position: { x: 0, y: 200 }, width: 100, height: 40, data: {} },
  ];
  const handle = (c: ParentNode, n: string, id: string) =>
    must<HTMLElement>(c, `[data-id="${n}"] [data-handleid="${id}"]`);
  const overPoint = (el: Element | null) =>
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => el });
  afterEach(() => {
    Reflect.deleteProperty(document, 'elementFromPoint');
  });
  const startDrag = (c: ParentNode, over: Element | null, to: [number, number] = [300, 120]) => {
    overPoint(over);
    fireEvent.pointerDown(handle(c, 'a', 'out'), pointer({ clientX: 50, clientY: 40 }));
    fireEvent.pointerMove(window, pointer({ clientX: to[0], clientY: to[1] }));
  };
  const lineD = (c: ParentNode) => must(c, '.react-flow__connection-path').getAttribute('d') ?? '';

  it('is a bezier unless told otherwise, and follows connectionLineType', () => {
    const shapes: [ConnectionLineType | undefined, RegExp][] = [
      [undefined, /^M 50\.00 40\.00 C/],
      [ConnectionLineType.Bezier, /^M 50\.00 40\.00 C/],
      [ConnectionLineType.Straight, /^M 50\.00 40\.00 L 300\.00 120\.00$/],
      [ConnectionLineType.Step, /^M 50\.00 40\.00 L 50\.00 80\.00 L 300\.00 80\.00 L 300\.00 120\.00$/],
      [ConnectionLineType.SmoothStep, /^M 50\.00 40\.00 L 50\.00 75\.00 Q 50\.00 80\.00 55\.00 80\.00 .* L 300\.00 120\.00$/],
    ];
    for (const [type, expected] of shapes) {
      const { container, unmount } = render(
        <FlowingerCanvas nodes={nodes} nodeTypes={types} nodesConnectable connectionLineType={type} />,
      );
      startDrag(container, null);
      expect(lineD(container)).toMatch(expected);
      fireEvent.pointerUp(window, pointer({ clientX: 300, clientY: 120 }));
      unmount();
    }
  });

  it('takes connectionLineStyle over its own defaults', () => {
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        nodeTypes={types}
        nodesConnectable
        connectionLineStyle={{ stroke: 'red', strokeWidth: 5 }}
      />,
    );
    startDrag(container, null);
    const line = must<SVGPathElement>(container, '.react-flow__connection-path');
    expect(line.style.stroke).toBe('red');
    expect(line.style.strokeWidth).toBe('5');
    expect(line.style.pointerEvents).toBe('none'); // still takes no events
  });

  it('takes no pointer events even if its style asks for them — it would hide the handle under the pointer', () => {
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        nodeTypes={types}
        nodesConnectable
        connectionLineStyle={{ pointerEvents: 'all', stroke: 'red' }}
      />,
    );
    startDrag(container, null);
    const line = must<SVGPathElement>(container, '.react-flow__connection-path');
    expect(line.style.stroke).toBe('red');
    expect(line.style.pointerEvents).toBe('none');
  });

  it('is drawn by connectionLineComponent when given one, with both ends and what it is over', () => {
    const seen: ConnectionLineProps[] = [];
    function Mine(props: ConnectionLineProps) {
      seen.push(props);
      return <circle data-testid="mine" cx={props.toX} cy={props.toY} r={4} />;
    }
    const { container, getByTestId } = render(
      <FlowingerCanvas
        nodes={nodes}
        nodeTypes={types}
        nodesConnectable
        connectionLineComponent={Mine}
        connectionLineType={ConnectionLineType.Straight}
        connectionLineStyle={{ stroke: 'red' }}
      />,
    );
    startDrag(container, null);
    expect(container.querySelector('.react-flow__connection-path')).toBeNull(); // not the default line
    expect(getByTestId('mine').getAttribute('cx')).toBe('300');
    const last = seen.at(-1);
    expect(last).toMatchObject({
      fromX: 50,
      fromY: 40,
      fromPosition: 'bottom',
      toX: 300,
      toY: 120,
      toPosition: 'top',
      connectionLineType: 'straight',
      isValid: null,
    });
    expect(last?.connectionLineStyle).toEqual({ stroke: 'red' });
    fireEvent.pointerUp(window, pointer({ clientX: 300, clientY: 120 }));
    expect(container.querySelector('[data-testid="mine"]')).toBeNull(); // gone with the drag
  });

  it('tells the component whether it is over a handle that would be accepted, or one that would not', () => {
    let latest: ConnectionLineProps | undefined;
    function Mine(props: ConnectionLineProps) {
      latest = props;
      return null;
    }
    const ui = (valid: boolean) => (
      <FlowingerCanvas
        nodes={nodes}
        nodeTypes={types}
        nodesConnectable
        connectionLineComponent={Mine}
        isValidConnection={() => valid}
      />
    );
    const { container, rerender } = render(ui(true));
    // Over a compatible target handle: snapped to it, valid.
    startDrag(container, handle(container, 'b', 'in'));
    expect(latest?.isValid).toBe(true);
    fireEvent.pointerUp(window, pointer({ clientX: 300, clientY: 120 }));
    // The same handle, but the caller refuses it.
    rerender(ui(false));
    startDrag(container, handle(container, 'b', 'in'));
    expect(latest?.isValid).toBe(false);
    fireEvent.pointerUp(window, pointer({ clientX: 300, clientY: 120 }));
    // Over the wrong kind of handle.
    rerender(ui(true));
    startDrag(container, handle(container, 'b', 'out'));
    expect(latest?.isValid).toBe(false);
  });
});

describe('the step edge type', () => {
  it('is orthogonal with square corners, where smoothstep is rounded', () => {
    const edges: Edge[] = [
      { id: 'step', source: 'a', target: 'b', type: 'step' },
      { id: 'smooth', source: 'a', target: 'b', type: 'smoothstep' },
    ];
    const { container } = render(<FlowingerCanvas nodes={[box('a', 0, 0), box('b', 200, 200)]} edges={edges} />);
    const d = (id: string) => must(container, `[data-testid="edge-${id}"] .flowinger-edge-path`).getAttribute('d') ?? '';
    expect(d('step')).not.toContain('Q');
    expect(d('step')).toMatch(/^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+ L [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/);
    expect(d('smooth')).toContain('Q');
  });
});

describe('hooks on the server', () => {
  it('report "not pressed" and render nothing extra', async () => {
    const { renderToString } = await import('react-dom/server');
    function Probe() {
      const [n] = useState(0);
      useEffect(() => {}, []);
      return <output>{`${String(useKeyPress('a'))}-${String(n)}-${String(useNodesData('a')?.id)}`}</output>;
    }
    const html = renderToString(
      <FlowingerCanvas nodes={abc()}>
        <Probe />
        <ViewportPortal>
          <b>portal</b>
        </ViewportPortal>
      </FlowingerCanvas>,
    );
    expect(html).toContain('false-0-undefined');
    expect(html).not.toContain('<b>portal</b>');
  });
});
