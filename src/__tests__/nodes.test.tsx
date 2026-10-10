import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import * as ReactFlowLib from '@xyflow/react';
import {
  FlowingerCanvas,
  FlowingerCore,
  FlowingerProvider,
  Handle,
  Position,
  useUpdateNodeInternals,
  getNodesBounds,
  type FlowingerInstance,
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

/** What each node's component was last given, by node id. */
type Seen = Record<string, NodeProps>;
const spy = (seen: Seen) =>
  function Spy(p: NodeProps) {
    seen[p.id] = p;
    return <div>{p.id}</div>;
  };

const base = (id: string, extra: Partial<Node> = {}): Node => ({
  id,
  type: 'spy',
  position: { x: 0, y: 0 },
  width: 100,
  height: 40,
  data: {},
  ...extra,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('what a node component is told', () => {
  it('carries the node\'s own say: selectable, draggable, deletable, the drag handle, its parent, its size', () => {
    const seen: Seen = {};
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas
          nodes={[
            base('p', { width: 300, height: 200 }),
            base('a', {
              parentId: 'p',
              dragHandle: '.grip',
              deletable: false,
              draggable: true,
              selectable: false,
              width: 120,
              height: 50,
            }),
          ]}
          nodeTypes={{ spy: spy(seen) }}
          elementsSelectable
        />
      </div>,
    );
    expect(seen.a).toMatchObject({
      dragHandle: '.grip',
      deletable: false,
      draggable: true,
      selectable: false,
      parentId: 'p',
      width: 120,
      height: 50,
      dragging: false,
    });
    expect(seen.p).toMatchObject({ deletable: true, selectable: true, draggable: false, width: 300, height: 200 });
    expect(seen.p?.parentId).toBeUndefined();
    expect(seen.p?.dragHandle).toBeUndefined();
  });

  it('follows the canvas where the node says nothing: nodesDraggable, elementsSelectable', () => {
    const seen: Seen = {};
    const draw = (props: object) =>
      render(
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCanvas nodes={[base('a')]} nodeTypes={{ spy: spy(seen) }} {...props} />
        </div>,
      );
    draw({});
    expect(seen.a).toMatchObject({ draggable: false, selectable: false });
    draw({ nodesDraggable: true, elementsSelectable: true });
    expect(seen.a).toMatchObject({ draggable: true, selectable: true });
  });

  it('says nothing can be selected on a core with no selection feature, whatever elementsSelectable says', () => {
    const seen: Seen = {};
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={[base('a')]} nodeTypes={{ spy: spy(seen) }} elementsSelectable />
      </div>,
    );
    expect(seen.a?.selectable).toBe(false);
  });

  it('says the node is being dragged, while it is', () => {
    const seen: Seen = {};
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={[base('a')]} nodeTypes={{ spy: spy(seen) }} nodesDraggable />
      </div>,
    );
    const a = node(container, 'a');
    fireEvent.pointerDown(a, pointer({ clientX: 10, clientY: 10 }));
    fireEvent.pointerMove(a, pointer({ clientX: 40, clientY: 30 }));
    expect(seen.a?.dragging).toBe(true);
    // Above all while it is dragged.
    expect(seen.a?.zIndex).toBe(1000);
    fireEvent.pointerUp(a, pointer({ clientX: 40, clientY: 30 }));
    expect(seen.a?.dragging).toBe(false);
    expect(seen.a?.zIndex).toBe(1);
  });

  it('tells its stacking: above its parent by depth, unless it says otherwise', () => {
    const seen: Seen = {};
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas
          nodes={[
            base('p'),
            base('c', { parentId: 'p' }),
            base('g', { parentId: 'c' }),
            base('z', { zIndex: 42 }),
          ]}
          nodeTypes={{ spy: spy(seen) }}
        />
      </div>,
    );
    expect([seen.p?.zIndex, seen.c?.zIndex, seen.g?.zIndex, seen.z?.zIndex]).toEqual([1, 2, 3, 42]);
    // What it tells is what it is stacked at.
    expect(node(document.body, 'g').style.zIndex).toBe('3');
  });
});

describe('what a node component is told, against React Flow\'s', () => {
  /** What both hand a node component, for the same nodes and canvas settings. */
  const FIELDS = [
    'selected',
    'selectable',
    'draggable',
    'deletable',
    'dragging',
    'isConnectable',
    'dragHandle',
    'parentId',
  ] as const;

  const graph = (): Node[] => [
    base('plain'),
    base('undraggable', { draggable: false }),
    base('draggable', { draggable: true }),
    base('unselectable', { selectable: false }),
    base('selectable', { selectable: true }),
    base('keeper', { deletable: false }),
    base('handled', { dragHandle: '.h' }),
    base('closed', { connectable: false }),
    base('child', { parentId: 'plain' }),
    base('picked', { selected: true }),
  ];

  // Every setting is given, both ways: the defaults differ on purpose (React Flow's are all true, flowinger's
  // all false), and it is what they do, not what they start as, that is compared. And the flow is controlled
  // (`onNodesChange`), the case a node's own `selected` is read in: React Flow reads it always, flowinger only then.
  const setting = (nodesDraggable: boolean, elementsSelectable: boolean, nodesConnectable: boolean) => ({
    nodesDraggable,
    elementsSelectable,
    nodesConnectable,
  });
  const CONFIGS = [
    setting(false, false, false),
    setting(true, false, false),
    setting(false, true, false),
    setting(false, false, true),
    setting(true, true, true),
  ];

  it('is the same, field by field, for every node, over five canvas settings', () => {
    for (const config of CONFIGS) {
      const mine: Seen = {};
      render(
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCanvas nodes={graph()} nodeTypes={{ spy: spy(mine) }} onNodesChange={() => {}} {...config} />
        </div>,
      );
      const theirs: Record<string, Record<string, unknown>> = {};
      const Theirs = (p: Record<string, unknown>) => {
        theirs[String(p.id)] = p;
        return null;
      };
      render(
        <ReactFlowLib.ReactFlowProvider>
          <div style={{ width: 800, height: 600 }}>
            <ReactFlowLib.ReactFlow
              nodes={graph() as never}
              nodeTypes={{ spy: Theirs as never }}
              onNodesChange={() => {}}
              {...config}
            />
          </div>
        </ReactFlowLib.ReactFlowProvider>,
      );
      for (const n of graph()) {
        const ours = mine[n.id];
        const rf = theirs[n.id];
        expect(ours, `ours: ${n.id}`).toBeDefined();
        expect(rf, `React Flow: ${n.id}`).toBeDefined();
        for (const field of FIELDS) {
          expect(ours?.[field], `${JSON.stringify(config)} ${n.id}.${field}`).toEqual(rf?.[field]);
        }
      }
    }
  });
});

describe('initialWidth and initialHeight', () => {
  const bare = (extra: Partial<Node>): Node => ({ id: 'a', position: { x: 10, y: 20 }, data: {}, ...extra });

  it('are what an unmeasured node is taken to be, instead of 150 × 40', () => {
    expect(getNodesBounds([bare({})])).toEqual({ x: 10, y: 20, width: 150, height: 40 });
    expect(getNodesBounds([bare({ initialWidth: 300, initialHeight: 80 })])).toEqual({ x: 10, y: 20, width: 300, height: 80 });
  });

  it('give way to a size the node declares, and to one it was measured at', () => {
    expect(getNodesBounds([bare({ width: 50, initialWidth: 300 })]).width).toBe(50);
    expect(getNodesBounds([bare({ height: 60, initialHeight: 80 })]).height).toBe(60);
    expect(getNodesBounds([bare({ measured: { width: 70, height: 30 }, initialWidth: 300, initialHeight: 80 })])).toMatchObject({
      width: 70,
      height: 30,
    });
  });

  it('reach the instance too: fitView and getNodesBounds see an unmeasured node at that size', () => {
    let instance: FlowingerInstance | undefined;
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore
          nodes={[bare({ initialWidth: 300, initialHeight: 80 })]}
          onInit={(i) => (instance = i)}
        />
      </div>,
    );
    expect(instance?.getNodesBounds(['a'])).toMatchObject({ width: 300, height: 80 });
  });
});

describe('useUpdateNodeInternals', () => {
  /** jsdom lays nothing out: a node is as wide as the test says. */
  let width = 100;
  const measured = (): number => width;
  const stubLayout = () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(measured);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40);
  };

  function Grabbing({ grab }: { grab: (update: ReturnType<typeof useUpdateNodeInternals>) => void }) {
    grab(useUpdateNodeInternals());
    return null;
  }

  const setup = () => {
    stubLayout();
    width = 100;
    let update: ReturnType<typeof useUpdateNodeInternals> | undefined;
    let instance: FlowingerInstance | undefined;
    const view = render(
      <FlowingerProvider>
        <Grabbing grab={(u) => (update = u)} />
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCore
            nodes={[
              { id: 'a', position: { x: 0, y: 0 }, data: {} },
              { id: 'b', position: { x: 300, y: 0 }, data: {} },
            ]}
            onInit={(i) => (instance = i)}
          />
        </div>
      </FlowingerProvider>,
    );
    return {
      ...view,
      update: (id: string | string[]) => {
        if (!update) throw new Error('no updater');
        update(id);
      },
      widthOf: (id: string) => instance?.getNodesBounds([id]).width,
    };
  };

  it('has the canvas read a node\'s size again — a frame later, when what changed has been drawn', () => {
    vi.useFakeTimers();
    const s = setup();
    expect(s.widthOf('a')).toBe(100);
    width = 250;
    act(() => {
      s.update('a');
    });
    // Not at once.
    expect(s.widthOf('a')).toBe(100);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(s.widthOf('a')).toBe(250);
    vi.useRealTimers();
  });

  it('takes several ids, and ignores one that is not there', () => {
    vi.useFakeTimers();
    const s = setup();
    width = 180;
    act(() => {
      s.update(['a', 'b', 'nope']);
      vi.advanceTimersByTime(50);
    });
    expect([s.widthOf('a'), s.widthOf('b')]).toEqual([180, 180]);
    vi.useRealTimers();
  });

  it('is one function for the life of the canvas, so it can go in a dependency list', () => {
    stubLayout();
    const seen: unknown[] = [];
    const Probe = () => {
      seen.push(useUpdateNodeInternals());
      return null;
    };
    const tree = (n: number) => (
      <FlowingerProvider>
        <Probe key="p" />
        <span>{n}</span>
      </FlowingerProvider>
    );
    const { rerender } = render(tree(1));
    rerender(tree(2));
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
  });

  it('moves an edge to where a handle has moved — the handles are read again with the node', () => {
    vi.useFakeTimers();
    stubLayout();
    let handleLeft = 90;
    // The node is 100 × 40 at the origin; its handle is a 10 × 10 dot whose place the test moves.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const dot = this.classList.contains('react-flow__handle');
      return (dot
        ? { left: handleLeft, top: 15, width: 10, height: 10, right: handleLeft + 10, bottom: 25, x: handleLeft, y: 15 }
        : { left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40, x: 0, y: 0 }) as DOMRect;
    });
    let update: ReturnType<typeof useUpdateNodeInternals> | undefined;
    const Mover = () => {
      update = useUpdateNodeInternals();
      return <Handle id="h" type="source" position={Position.Right} />;
    };
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore
          nodes={[
            { id: 'a', type: 'mover', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
            { id: 'b', position: { x: 400, y: 100 }, width: 100, height: 40, data: {} },
          ]}
          edges={[{ id: 'e', source: 'a', target: 'b', sourceHandle: 'h' }]}
          nodeTypes={{ mover: Mover }}
        />
      </div>,
    );
    const startX = () =>
      Number(must<SVGPathElement>(container, '.react-flow__edge-path').getAttribute('d')?.match(/-?\d+(?:\.\d+)?/)?.[0]);
    // The dot's outer side: its centre (95) and half its width (5).
    expect(startX()).toBe(100);
    handleLeft = 40;
    // Nothing tells the canvas a handle moved; it does not look until asked.
    expect(startX()).toBe(100);
    act(() => {
      update?.('a');
      vi.advanceTimersByTime(50);
    });
    expect(startX()).toBe(50);
    vi.useRealTimers();
  });
});

describe('a node\'s or edge\'s own `selectable`', () => {
  const two: Node[] = [
    { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
    { id: 'b', position: { x: 300, y: 0 }, width: 100, height: 40, data: {} },
  ];
  const selected = (c: ParentNode, id: string) => node(c, id).classList.contains('selected');

  it('wins over the canvas: a node that says true is selectable where the canvas does not allow it', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={[{ ...two[0]!, selectable: true }, two[1]!]} elementsSelectable={false} />
      </div>,
    );
    fireEvent.click(node(container, 'a'));
    fireEvent.click(node(container, 'b'));
    expect(selected(container, 'a')).toBe(true);
    // The node that says nothing follows the canvas.
    expect(selected(container, 'b')).toBe(false);
  });

  it('wins the other way as well: a node that says false is not, where the canvas allows it', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={[{ ...two[0]!, selectable: false }, two[1]!]} elementsSelectable />
      </div>,
    );
    fireEvent.click(node(container, 'a'));
    expect(selected(container, 'a')).toBe(false);
    fireEvent.click(node(container, 'b'));
    expect(selected(container, 'b')).toBe(true);
  });

  it('is what the keyboard reaches: a node that opts in is a tab stop', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={[{ ...two[0]!, selectable: true }, two[1]!]} />
      </div>,
    );
    expect(node(container, 'a').getAttribute('tabindex')).toBe('0');
    expect(node(container, 'b').hasAttribute('tabindex')).toBe(false);
  });

  it('means nothing without something that acts on selecting: a core with no selection feature', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={[{ ...two[0]!, selectable: true }, two[1]!]} elementsSelectable />
      </div>,
    );
    fireEvent.click(node(container, 'a'));
    expect(selected(container, 'a')).toBe(false);
    expect(node(container, 'a').hasAttribute('tabindex')).toBe(false);
  });

  it('holds for edges: one that says true is selectable on a canvas that does not allow it; false, not', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas
          nodes={two}
          edges={[
            { id: 'yes', source: 'a', target: 'b', selectable: true },
            { id: 'plain', source: 'a', target: 'b' },
          ]}
          elementsSelectable={false}
        />
      </div>,
    );
    const g = (id: string) => must<SVGGElement>(container, `[data-testid="rf__edge-${id}"]`);
    expect(g('yes').classList.contains('selectable')).toBe(true);
    expect(g('plain').classList.contains('selectable')).toBe(false);
    fireEvent.click(g('yes'));
    expect(g('yes').classList.contains('selected')).toBe(true);
    fireEvent.click(g('plain'));
    expect(g('plain').classList.contains('selected')).toBe(false);

    const on = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={two} edges={[{ id: 'no', source: 'a', target: 'b', selectable: false }]} elementsSelectable />
      </div>,
    );
    expect(must(on.container, '[data-testid="rf__edge-no"]').classList.contains('selectable')).toBe(false);
  });

  it('is no edge selectable on a core with no selection feature, whatever the edge says', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={two} edges={[{ id: 'yes', source: 'a', target: 'b', selectable: true }]} elementsSelectable />
      </div>,
    );
    expect(must(container, '[data-testid="rf__edge-yes"]').classList.contains('selectable')).toBe(false);
  });
});
