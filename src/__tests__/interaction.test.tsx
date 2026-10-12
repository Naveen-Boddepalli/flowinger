import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import {
  BaseEdge,
  ConnectionMode,
  FlowingerCanvas,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type FlowingerInstance,
  type FlowingerProps,
  type Node,
  type NodeChange,
} from '../index.ts';

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const node = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
const edgeG = (c: ParentNode, id: string) => must<SVGGElement>(c, `[data-testid="rf__edge-${id}"]`);
const at = (c: ParentNode, id: string) => node(c, id).style.transform;

const box = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  width: 100,
  height: 40,
  data: {},
  ...extra,
});
const abc = (): Node[] => [box('a', 0, 0), box('b', 200, 0), box('c', 400, 0)];
const links = (): Edge[] => [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'bc', source: 'b', target: 'c' },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('edge selection', () => {
  it('is off by default: no hit area, nothing to focus, a click selects nothing', () => {
    const { container } = render(<FlowingerCanvas nodes={abc()} edges={links()} />);
    expect(container.querySelector('.flowinger-edge-interaction')).toBeNull();
    expect(edgeG(container, 'ab').hasAttribute('tabindex')).toBe(false);
    fireEvent.click(must(edgeG(container, 'ab'), 'path'));
    expect(edgeG(container, 'ab').classList.contains('selected')).toBe(false);
  });

  it('selects on a click, adds with Shift, and gives the edge a wide hit area', () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={abc()} edges={links()} elementsSelectable onSelectionChange={onSelectionChange} />,
    );
    const hit = must(edgeG(container, 'ab'), '.flowinger-edge-interaction');
    expect(hit.getAttribute('stroke-width')).toBe('20');
    expect(hit.getAttribute('stroke')).toBe('transparent');

    fireEvent.click(hit);
    expect(edgeG(container, 'ab').classList.contains('selected')).toBe(true);
    expect(edgeG(container, 'ab').getAttribute('aria-pressed')).toBe('true');
    expect(must(edgeG(container, 'ab'), '.flowinger-edge-path').getAttribute('stroke')).toContain('--flowinger-selected');
    const last = () => onSelectionChange.mock.calls.at(-1)?.[0] as { nodes: Node[]; edges: Edge[] };
    expect(last().edges.map((e) => e.id)).toEqual(['ab']);

    fireEvent.click(must(edgeG(container, 'bc'), '.flowinger-edge-interaction'), { shiftKey: true });
    expect(last().edges.map((e) => e.id)).toEqual(['ab', 'bc']);
    fireEvent.click(must(edgeG(container, 'ab'), '.flowinger-edge-interaction'), { shiftKey: true });
    expect(last().edges.map((e) => e.id)).toEqual(['bc']);
  });

  it('replaces the selection across kinds: a node click drops the edge, an edge click drops the node', () => {
    const { container } = render(<FlowingerCanvas nodes={abc()} edges={links()} elementsSelectable />);
    fireEvent.click(must(edgeG(container, 'ab'), '.flowinger-edge-interaction'));
    fireEvent.click(node(container, 'a'));
    expect(edgeG(container, 'ab').classList.contains('selected')).toBe(false);
    expect(node(container, 'a').classList.contains('selected')).toBe(true);
    fireEvent.click(must(edgeG(container, 'bc'), '.flowinger-edge-interaction'));
    expect(node(container, 'a').classList.contains('selected')).toBe(false);
    expect(edgeG(container, 'bc').classList.contains('selected')).toBe(true);
    // …and Shift keeps the node.
    fireEvent.click(node(container, 'c'));
    fireEvent.click(must(edgeG(container, 'ab'), '.flowinger-edge-interaction'), { shiftKey: true });
    expect(node(container, 'c').classList.contains('selected')).toBe(true);
    expect(edgeG(container, 'ab').classList.contains('selected')).toBe(true);
  });

  it('is cleared by a click on the pane', () => {
    const { container } = render(<FlowingerCanvas nodes={abc()} edges={links()} elementsSelectable />);
    fireEvent.click(must(edgeG(container, 'ab'), '.flowinger-edge-interaction'));
    fireEvent.click(container.firstElementChild as Element);
    expect(edgeG(container, 'ab').classList.contains('selected')).toBe(false);
  });

  it('honours an edge’s own selectable: false', () => {
    const edges: Edge[] = [{ id: 'ab', source: 'a', target: 'b', selectable: false }];
    const { container } = render(<FlowingerCanvas nodes={abc()} edges={edges} elementsSelectable />);
    expect(container.querySelector('.flowinger-edge-interaction')).toBeNull();
    fireEvent.click(must(edgeG(container, 'ab'), 'path'));
    expect(edgeG(container, 'ab').classList.contains('selected')).toBe(false);
  });

  it('reports a click on an edge, whether or not it selects', () => {
    const onEdgeClick = vi.fn();
    const { container } = render(<FlowingerCanvas nodes={abc()} edges={links()} onEdgeClick={onEdgeClick} />);
    fireEvent.click(must(edgeG(container, 'ab'), 'path'));
    expect(onEdgeClick).toHaveBeenCalledTimes(1);
    expect(onEdgeClick.mock.calls[0]?.[1]).toMatchObject({ id: 'ab' });
  });

  it('can be reached and selected from the keyboard, and left out of the tab order', () => {
    const { container, rerender } = render(<FlowingerCanvas nodes={abc()} edges={links()} elementsSelectable />);
    const g = edgeG(container, 'ab');
    expect(g.getAttribute('tabindex')).toBe('0');
    expect(g.getAttribute('aria-label')).toBe('Edge from a to b');
    fireEvent.keyDown(g, { key: 'Enter' });
    expect(edgeG(container, 'ab').classList.contains('selected')).toBe(true);
    fireEvent.keyDown(g, { key: ' ', shiftKey: true });
    expect(edgeG(container, 'ab').classList.contains('selected')).toBe(false);

    rerender(<FlowingerCanvas nodes={abc()} edges={links()} elementsSelectable edgesFocusable={false} />);
    expect(edgeG(container, 'ab').hasAttribute('tabindex')).toBe(false);
    // Still selectable with the pointer.
    fireEvent.click(must(edgeG(container, 'ab'), '.flowinger-edge-interaction'));
    expect(edgeG(container, 'ab').classList.contains('selected')).toBe(true);
  });

  it('is controlled by `selected` when the edges are: changes out, the flag in', () => {
    const onEdgesChange = vi.fn();
    const { container, rerender } = render(
      <FlowingerCanvas nodes={abc()} edges={links()} elementsSelectable onEdgesChange={onEdgesChange} />,
    );
    fireEvent.click(must(edgeG(container, 'ab'), '.flowinger-edge-interaction'));
    expect(onEdgesChange).toHaveBeenCalledWith([{ type: 'select', id: 'ab', selected: true }]);
    expect(edgeG(container, 'ab').classList.contains('selected')).toBe(false); // not applied yet

    rerender(
      <FlowingerCanvas
        nodes={abc()}
        edges={links().map((e) => (e.id === 'bc' ? { ...e, selected: true } : e))}
        elementsSelectable
        onEdgesChange={onEdgesChange}
      />,
    );
    expect(edgeG(container, 'bc').classList.contains('selected')).toBe(true);
  });

  it('works end to end with useEdgesState', () => {
    function Harness() {
      const [edges, , onEdgesChange] = useEdgesState(links());
      return <FlowingerCanvas nodes={abc()} edges={edges} onEdgesChange={onEdgesChange} elementsSelectable />;
    }
    const { container } = render(<Harness />);
    fireEvent.click(must(edgeG(container, 'ab'), '.flowinger-edge-interaction'));
    expect(edgeG(container, 'ab').classList.contains('selected')).toBe(true);
  });

  it('tells a custom edge it is selected, and gives its BaseEdge the hit area', () => {
    function Mine(props: EdgeProps) {
      return (
        <g data-selected={String(props.selected)}>
          <BaseEdge path={`M ${String(props.sourceX)} ${String(props.sourceY)} L ${String(props.targetX)} ${String(props.targetY)}`} />
        </g>
      );
    }
    const edges: Edge[] = [{ id: 'ab', source: 'a', target: 'b', type: 'mine' }];
    const { container } = render(
      <FlowingerCanvas nodes={abc()} edges={edges} edgeTypes={{ mine: Mine }} elementsSelectable />,
    );
    fireEvent.click(must(edgeG(container, 'ab'), '.flowinger-edge-interaction'));
    expect(must(edgeG(container, 'ab'), '[data-selected]').getAttribute('data-selected')).toBe('true');
  });
});

describe('a custom edge with something of its own inside', () => {
  it('keeps Enter and Space that belong to what it holds', () => {
    function WithControl(props: EdgeProps) {
      return (
        <g>
          <BaseEdge path={`M ${String(props.sourceX)} ${String(props.sourceY)} L ${String(props.targetX)} ${String(props.targetY)}`} />
          <g data-testid="inner" tabIndex={0} />
        </g>
      );
    }
    const edges: Edge[] = [{ id: 'ab', source: 'a', target: 'b', type: 'mine' }];
    const { container, getByTestId } = render(
      <FlowingerCanvas nodes={abc()} edges={edges} edgeTypes={{ mine: WithControl }} elementsSelectable />,
    );
    fireEvent.keyDown(getByTestId('inner'), { key: 'Enter' });
    expect(edgeG(container, 'ab').classList.contains('selected')).toBe(false);
    fireEvent.keyDown(edgeG(container, 'ab'), { key: 'Enter' });
    expect(edgeG(container, 'ab').classList.contains('selected')).toBe(true);
  });
});

describe('animated edges', () => {
  it('marks the edge, and brings the animation with it — once, and only when needed', () => {
    const edges: Edge[] = [
      { id: 'ab', source: 'a', target: 'b', animated: true },
      { id: 'bc', source: 'b', target: 'c' },
      { id: 'ac', source: 'a', target: 'c', animated: true },
    ];
    const { container } = render(<FlowingerCanvas nodes={abc()} edges={edges} />);
    expect(edgeG(container, 'ab').classList.contains('animated')).toBe(true);
    expect(edgeG(container, 'ab').classList.contains('flowinger-edge-animated')).toBe(true);
    expect(edgeG(container, 'bc').classList.contains('animated')).toBe(false);
    const styles = container.querySelectorAll('svg style');
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toContain('@keyframes flowinger-dash');
    expect(styles[0]?.textContent).toContain('prefers-reduced-motion');
  });

  it('adds nothing when no edge is animated', () => {
    const { container } = render(<FlowingerCanvas nodes={abc()} edges={links()} />);
    expect(container.querySelector('svg style')).toBeNull();
  });

  it('takes it from defaultEdgeOptions too', () => {
    const { container } = render(
      <FlowingerCanvas nodes={abc()} edges={links()} defaultEdgeOptions={{ animated: true }} />,
    );
    expect(edgeG(container, 'ab').classList.contains('animated')).toBe(true);
  });
});

describe('deleting', () => {
  /** Controlled nodes and edges, with the spies the callbacks need. */
  function Harness({
    onNodeChanges,
    onEdgeChanges,
    ...rest
  }: {
    onNodeChanges?: (c: NodeChange[]) => void;
    onEdgeChanges?: (c: EdgeChange[]) => void;
  } & Partial<FlowingerProps>) {
    const [nodes, , onNodesChange] = useNodesState(abc());
    const [edges, , onEdgesChange] = useEdgesState(links());
    return (
      <FlowingerCanvas
        nodes={nodes}
        edges={edges}
        onNodesChange={(c) => {
          onNodeChanges?.(c);
          onNodesChange(c);
        }}
        onEdgesChange={(c) => {
          onEdgeChanges?.(c);
          onEdgesChange(c);
        }}
        elementsSelectable
        {...rest}
      />
    );
  }
  const has = (c: ParentNode, sel: string) => c.querySelector(sel) !== null;

  it('removes the selected node and the edges touching it, on Backspace', async () => {
    const onNodeChanges = vi.fn();
    const onEdgeChanges = vi.fn();
    const onNodesDelete = vi.fn();
    const onEdgesDelete = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(
      <Harness
        onNodeChanges={onNodeChanges}
        onEdgeChanges={onEdgeChanges}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(node(container, 'b'));
    onNodeChanges.mockClear();
    onEdgeChanges.mockClear();
    fireEvent.keyDown(node(container, 'b'), { key: 'Backspace' });
    // Deleting is async (onBeforeDelete may be); let it settle.
    await act(async () => {});
    expect(has(container, '[data-id="b"]')).toBe(false);
    expect(has(container, '[data-testid="rf__edge-ab"]')).toBe(false);
    expect(has(container, '[data-testid="rf__edge-bc"]')).toBe(false);
    expect(has(container, '[data-id="a"]')).toBe(true);
    expect(onNodeChanges).toHaveBeenCalledWith([{ type: 'remove', id: 'b' }]);
    expect(onEdgeChanges).toHaveBeenCalledWith([
      { type: 'remove', id: 'ab' },
      { type: 'remove', id: 'bc' },
    ]);
    expect((onNodesDelete.mock.calls[0]?.[0] as Node[]).map((n) => n.id)).toEqual(['b']);
    expect((onEdgesDelete.mock.calls[0]?.[0] as Edge[]).map((e) => e.id)).toEqual(['ab', 'bc']);
    const all = onDelete.mock.calls[0]?.[0] as { nodes: Node[]; edges: Edge[] };
    expect([all.nodes.length, all.edges.length]).toEqual([1, 2]);
  });

  it('deletes a selected edge on its own', async () => {
    const onNodesDelete = vi.fn();
    const { container } = render(<Harness onNodesDelete={onNodesDelete} />);
    fireEvent.click(must(edgeG(container, 'ab'), '.flowinger-edge-interaction'));
    fireEvent.keyDown(edgeG(container, 'ab'), { key: 'Backspace' });
    await act(async () => {});
    expect(has(container, '[data-testid="rf__edge-ab"]')).toBe(false);
    expect(has(container, '[data-testid="rf__edge-bc"]')).toBe(true);
    expect(has(container, '[data-id="a"]')).toBe(true);
    expect(onNodesDelete).not.toHaveBeenCalled(); // no node went
  });

  it('takes its key from deleteKeyCode — one, several, or none', async () => {
    const { container, rerender } = render(<Harness deleteKeyCode="Delete" />);
    fireEvent.click(node(container, 'a'));
    fireEvent.keyDown(node(container, 'a'), { key: 'Backspace' });
    await act(async () => {});
    expect(has(container, '[data-id="a"]')).toBe(true);
    fireEvent.keyDown(node(container, 'a'), { key: 'Delete' });
    await act(async () => {});
    expect(has(container, '[data-id="a"]')).toBe(false);

    rerender(<Harness deleteKeyCode={['x', 'y']} />);
    fireEvent.click(node(container, 'b'));
    fireEvent.keyDown(node(container, 'b'), { key: 'y' });
    await act(async () => {});
    expect(has(container, '[data-id="b"]')).toBe(false);

    rerender(<Harness deleteKeyCode={null} />);
    fireEvent.click(node(container, 'c'));
    fireEvent.keyDown(node(container, 'c'), { key: 'Backspace' });
    await act(async () => {});
    expect(has(container, '[data-id="c"]')).toBe(true);
  });

  it('leaves a key pressed in a field to the field, and ignores modified keys', async () => {
    function Field() {
      return <input data-testid="field" />;
    }
    // Selected from the start: in a controlled flow a click alone selects nothing.
    const nodes = [box('a', 0, 0, { type: 'field', selected: true })];
    const onNodesDelete = vi.fn();
    const { container, getByTestId } = render(
      <FlowingerCanvas
        nodes={nodes}
        nodeTypes={{ field: Field }}
        elementsSelectable
        onNodesChange={() => {}}
        onNodesDelete={onNodesDelete}
      />,
    );
    fireEvent.keyDown(getByTestId('field'), { key: 'Backspace' });
    fireEvent.keyDown(node(container, 'a'), { key: 'Backspace', ctrlKey: true });
    fireEvent.keyDown(node(container, 'a'), { key: 'Backspace', metaKey: true });
    fireEvent.keyDown(node(container, 'a'), { key: 'Backspace', altKey: true });
    await act(async () => {});
    expect(onNodesDelete).not.toHaveBeenCalled();
    // …while the same selection does go for a plain key on the node itself.
    fireEvent.keyDown(node(container, 'a'), { key: 'Backspace' });
    await act(async () => {});
    expect(onNodesDelete).toHaveBeenCalledTimes(1);
  });

  it('does nothing — and does not swallow the key — with nothing selected', () => {
    const { container } = render(<Harness />);
    const notPrevented = fireEvent.keyDown(node(container, 'a'), { key: 'Backspace' });
    expect(notPrevented).toBe(true);
  });

  it('keeps out what says deletable: false — but not the edges of a node that goes', async () => {
    function Local() {
      const [nodes, , onNodesChange] = useNodesState([box('a', 0, 0, { deletable: false }), box('b', 200, 0), box('c', 400, 0)]);
      const [edges, , onEdgesChange] = useEdgesState<Edge>([
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'bc', source: 'b', target: 'c', deletable: false },
        { id: 'ac', source: 'a', target: 'c', deletable: false },
      ]);
      return (
        <FlowingerCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          elementsSelectable
        />
      );
    }
    const { container } = render(<Local />);
    // a cannot be deleted; select a and b, delete: only b goes, and its edges with it — even bc.
    fireEvent.click(node(container, 'a'));
    fireEvent.click(node(container, 'b'), { shiftKey: true });
    fireEvent.keyDown(node(container, 'b'), { key: 'Backspace' });
    await act(async () => {});
    expect(has(container, '[data-id="a"]')).toBe(true);
    expect(has(container, '[data-id="b"]')).toBe(false);
    expect(has(container, '[data-testid="rf__edge-ab"]')).toBe(false);
    expect(has(container, '[data-testid="rf__edge-bc"]')).toBe(false);
    expect(has(container, '[data-testid="rf__edge-ac"]')).toBe(true);
    // A non-deletable edge, selected on its own, stays.
    fireEvent.click(must(edgeG(container, 'ac'), '.flowinger-edge-interaction'));
    fireEvent.keyDown(edgeG(container, 'ac'), { key: 'Backspace' });
    await act(async () => {});
    expect(has(container, '[data-testid="rf__edge-ac"]')).toBe(true);
  });

  it('asks onBeforeDelete first: false cancels, a smaller set narrows, a promise is waited for', async () => {
    const onBeforeDelete = vi.fn<NonNullable<FlowingerProps['onBeforeDelete']>>();
    const onEdgeChanges = vi.fn();
    const { container } = render(<Harness onBeforeDelete={onBeforeDelete} onEdgeChanges={onEdgeChanges} />);
    fireEvent.click(node(container, 'b'));

    onBeforeDelete.mockReturnValueOnce(false);
    fireEvent.keyDown(node(container, 'b'), { key: 'Backspace' });
    await act(async () => {});
    expect(has(container, '[data-id="b"]')).toBe(true);
    const asked = onBeforeDelete.mock.calls[0]?.[0];
    expect(asked?.nodes.map((n) => n.id)).toEqual(['b']);
    expect(asked?.edges.map((e) => e.id)).toEqual(['ab', 'bc']); // what would go, edges included

    onBeforeDelete.mockImplementationOnce((els) =>
      Promise.resolve({ nodes: els.nodes, edges: els.edges.filter((e) => e.id === 'ab') }),
    );
    fireEvent.keyDown(node(container, 'b'), { key: 'Backspace' });
    expect(has(container, '[data-id="b"]')).toBe(true); // still waiting
    await act(async () => {});
    expect(has(container, '[data-id="b"]')).toBe(false);
    // Only the edge the caller left in the set was reported gone.
    expect(onEdgeChanges).toHaveBeenCalledTimes(1);
    expect(onEdgeChanges).toHaveBeenCalledWith([{ type: 'remove', id: 'ab' }]);
  });

  it('reports without removing where the nodes are only passed in', async () => {
    const onNodesDelete = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={abc()} edges={links()} elementsSelectable onNodesDelete={onNodesDelete} />,
    );
    fireEvent.click(node(container, 'b'));
    fireEvent.keyDown(node(container, 'b'), { key: 'Backspace' });
    await act(async () => {});
    expect(onNodesDelete).toHaveBeenCalledTimes(1);
    expect(has(container, '[data-id="b"]')).toBe(true); // yours to remove
  });

  it('is available on the instance, and resolves with what went', async () => {
    let instance: FlowingerInstance | undefined;
    const onDelete = vi.fn();
    const onBeforeDelete = vi.fn(() => true);
    const { container } = render(
      <Harness
        onDelete={onDelete}
        onBeforeDelete={onBeforeDelete}
        onInit={(i) => {
          instance = i;
        }}
      />,
    );
    let result: Awaited<ReturnType<FlowingerInstance['deleteElements']>> | undefined;
    await act(async () => {
      result = await instance?.deleteElements({ nodes: [{ id: 'c' }], edges: [{ id: 'nope' }] });
    });
    expect(result?.deletedNodes.map((n) => n.id)).toEqual(['c']);
    expect(result?.deletedEdges.map((e) => e.id)).toEqual(['bc']);
    expect(has(container, '[data-id="c"]')).toBe(false);
    await act(async () => {
      result = await instance?.deleteElements({ nodes: [{ id: 'missing' }] });
    });
    expect(result).toEqual({ deletedNodes: [], deletedEdges: [] });
    // Nothing to delete: nobody is asked, and nobody is told.
    expect(onBeforeDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('makes the canvas focusable — but not a tab stop — so the key reaches it after a click', () => {
    const { container } = render(<Harness />);
    expect(container.firstElementChild?.getAttribute('tabindex')).toBe('-1');
    const off = render(<FlowingerCanvas nodes={abc()} elementsSelectable deleteKeyCode={null} />);
    expect(off.container.firstElementChild?.hasAttribute('tabindex')).toBe(false);
    const plain = render(<FlowingerCanvas nodes={abc()} />);
    expect(plain.container.firstElementChild?.hasAttribute('tabindex')).toBe(false);
  });
});

describe('connectionMode and connect callbacks', () => {
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
  const pointerOver = (el: Element | null) =>
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => el });
  afterEach(() => {
    Reflect.deleteProperty(document, 'elementFromPoint');
  });
  // `at` is where it is let go: over nothing, that must be out of reach of every handle (`connectionRadius`).
  const drag = (from: Element, to: Element | null, at: [number, number] = [50, 200]) => {
    pointerOver(to);
    fireEvent.pointerDown(from, pointer({ clientX: 50, clientY: 40 }));
    fireEvent.pointerMove(window, pointer({ clientX: at[0], clientY: at[1] }));
    fireEvent.pointerUp(window, pointer({ clientX: at[0], clientY: at[1] }));
  };

  it('refuses a source dropped on a source in strict mode — the default — and says why', () => {
    const onConnect = vi.fn();
    const onConnectEnd = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} nodesConnectable onConnect={onConnect} onConnectEnd={onConnectEnd} />,
    );
    drag(handle(container, 'a', 'out'), handle(container, 'b', 'out'));
    expect(onConnect).not.toHaveBeenCalled();
    expect(onConnectEnd.mock.calls[0]?.[1]).toEqual({ connection: null, isValid: false });
  });

  it('joins any handle to any other in loose mode, the drag’s start being the source', () => {
    const onConnect = vi.fn();
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        nodeTypes={types}
        nodesConnectable
        connectionMode={ConnectionMode.Loose}
        onConnect={onConnect}
      />,
    );
    drag(handle(container, 'a', 'out'), handle(container, 'b', 'out'));
    expect(onConnect).toHaveBeenCalledWith({ source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'out' });
    drag(handle(container, 'a', 'in'), handle(container, 'b', 'in'));
    expect(onConnect).toHaveBeenLastCalledWith({ source: 'a', sourceHandle: 'in', target: 'b', targetHandle: 'in' });
  });

  it('still orients source → target in loose mode when the types differ', () => {
    const onConnect = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} nodesConnectable connectionMode="loose" onConnect={onConnect} />,
    );
    drag(handle(container, 'a', 'in'), handle(container, 'b', 'out')); // began at a target
    expect(onConnect).toHaveBeenCalledWith({ source: 'b', sourceHandle: 'out', target: 'a', targetHandle: 'in' });
  });

  it('never joins a handle to itself, even loosely', () => {
    const onConnect = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} nodesConnectable connectionMode="loose" onConnect={onConnect} />,
    );
    const h = handle(container, 'a', 'out');
    drag(h, h);
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('tells onConnectStart where the drag began, and onConnectEnd how it ended', () => {
    const onConnectStart = vi.fn();
    const onConnectEnd = vi.fn();
    const onConnect = vi.fn<(c: Connection) => void>();
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        nodeTypes={types}
        nodesConnectable
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
      />,
    );
    drag(handle(container, 'a', 'out'), handle(container, 'b', 'in'));
    expect(onConnectStart).toHaveBeenCalledTimes(1);
    expect(onConnectStart.mock.calls[0]?.[1]).toEqual({ nodeId: 'a', handleId: 'out', handleType: 'source' });
    expect(onConnectEnd.mock.calls[0]?.[1]).toEqual({
      connection: { source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' },
      isValid: true,
    });
    // Onto nothing.
    drag(handle(container, 'a', 'out'), null, [500, 500]);
    expect(onConnectEnd.mock.calls[1]?.[1]).toEqual({ connection: null, isValid: null });
    // Vetoed by isValidConnection.
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('reports a vetoed drop as invalid, with the connection that was refused', () => {
    const onConnectEnd = vi.fn();
    const onConnect = vi.fn();
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        nodeTypes={types}
        nodesConnectable
        isValidConnection={() => false}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
      />,
    );
    drag(handle(container, 'a', 'out'), handle(container, 'b', 'in'));
    expect(onConnect).not.toHaveBeenCalled();
    expect(onConnectEnd.mock.calls[0]?.[1]).toEqual({
      connection: { source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' },
      isValid: false,
    });
  });
});

describe('moving a selected node with the arrow keys', () => {
  it('nudges by 5, or 20 with Shift, and leaves an unselected node alone', () => {
    const { container } = render(<FlowingerCanvas nodes={abc()} nodesDraggable elementsSelectable />);
    const notPrevented = fireEvent.keyDown(node(container, 'a'), { key: 'ArrowRight' });
    expect(at(container, 'a')).toBe('translate(0px, 0px)'); // not selected
    expect(notPrevented).toBe(true); // and the page keeps its arrow key
    fireEvent.click(node(container, 'a'));
    fireEvent.keyDown(node(container, 'a'), { key: 'ArrowRight' });
    fireEvent.keyDown(node(container, 'a'), { key: 'ArrowDown' });
    expect(at(container, 'a')).toBe('translate(5px, 5px)');
    fireEvent.keyDown(node(container, 'a'), { key: 'ArrowLeft', shiftKey: true });
    expect(at(container, 'a')).toBe('translate(-15px, 5px)');
    fireEvent.keyDown(node(container, 'a'), { key: 'ArrowUp' });
    expect(at(container, 'a')).toBe('translate(-15px, 0px)');
  });

  it('moves the whole selection, one grid cell at a time when snapping', () => {
    const { container } = render(
      <FlowingerCanvas nodes={abc()} nodesDraggable elementsSelectable snapToGrid snapGrid={[10, 10]} />,
    );
    fireEvent.click(node(container, 'a'));
    fireEvent.click(node(container, 'b'), { shiftKey: true });
    fireEvent.keyDown(node(container, 'a'), { key: 'ArrowRight' });
    expect(at(container, 'a')).toBe('translate(10px, 0px)');
    expect(at(container, 'b')).toBe('translate(210px, 0px)');
    expect(at(container, 'c')).toBe('translate(400px, 0px)');
  });

  it('does nothing for a node that cannot be dragged, and stops at the extent', () => {
    const { container, rerender } = render(<FlowingerCanvas nodes={abc()} elementsSelectable />);
    fireEvent.click(node(container, 'a'));
    fireEvent.keyDown(node(container, 'a'), { key: 'ArrowRight' });
    expect(at(container, 'a')).toBe('translate(0px, 0px)');
    rerender(<FlowingerCanvas nodes={abc()} nodesDraggable elementsSelectable nodeExtent={[[0, 0], [1000, 1000]]} />);
    fireEvent.keyDown(node(container, 'a'), { key: 'ArrowLeft' });
    expect(at(container, 'a')).toBe('translate(0px, 0px)'); // already at the wall
  });

  it('reports the move as a change in a controlled flow', () => {
    const onNodesChange = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={abc().map((n) => (n.id === 'a' ? { ...n, selected: true } : n))} nodesDraggable elementsSelectable onNodesChange={onNodesChange} />,
    );
    onNodesChange.mockClear();
    fireEvent.keyDown(node(container, 'a'), { key: 'ArrowDown' });
    expect(onNodesChange).toHaveBeenCalledWith([
      { type: 'position', id: 'a', position: { x: 0, y: 5 }, dragging: false },
    ]);
  });
});
