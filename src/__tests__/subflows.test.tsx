import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import {
  FlowingerCanvas,
  Handle,
  MiniMap,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type FlowingerInstance,
  type Node,
  type NodeProps,
} from '../index.ts';
import { absolutePositionOf, descendantsOf, treeInfo } from '../parents.ts';

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const el = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
const at = (c: ParentNode, id: string) => el(c, id).style.transform;
const has = (c: ParentNode, id: string) => c.querySelector(`[data-id="${id}"]`) !== null;
const edgeD = (c: ParentNode, id: string) =>
  must(c, `[data-testid="rf__edge-${id}"] .flowinger-edge-path`).getAttribute('d') ?? '';

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
});

describe('nesting helpers', () => {
  const nodes = [
    n('root', 100, 50),
    n('kid', 10, 20, { parentId: 'root' }),
    n('grandkid', 1, 2, { parentId: 'kid' }),
    n('other', 0, 0),
  ];
  const lookup = (id: string) => nodes.find((x) => x.id === id);
  const asGiven = (_id: string, fallback: { x: number; y: number }) => fallback;

  it('adds the positions up the chain', () => {
    expect(absolutePositionOf(nodes[0] as Node, lookup, asGiven)).toEqual({ x: 100, y: 50 });
    expect(absolutePositionOf(nodes[1] as Node, lookup, asGiven)).toEqual({ x: 110, y: 70 });
    expect(absolutePositionOf(nodes[2] as Node, lookup, asGiven)).toEqual({ x: 111, y: 72 });
  });

  it('uses the position the caller resolves — a drag — for every link', () => {
    const dragged = (id: string, fallback: { x: number; y: number }) =>
      id === 'root' ? { x: 0, y: 0 } : fallback;
    expect(absolutePositionOf(nodes[2] as Node, lookup, dragged)).toEqual({ x: 11, y: 22 });
  });

  it('stops at a missing parent, and at a loop', () => {
    const orphan = n('o', 5, 5, { parentId: 'gone' });
    expect(absolutePositionOf(orphan, () => undefined, asGiven)).toEqual({ x: 5, y: 5 });
    const a = n('a', 1, 1, { parentId: 'b' });
    const b = n('b', 2, 2, { parentId: 'a' });
    const byId = (id: string) => (id === 'a' ? a : id === 'b' ? b : undefined);
    const result = absolutePositionOf(a, byId, asGiven);
    expect(Number.isFinite(result.x) && Number.isFinite(result.y)).toBe(true);
    // …and finding what is inside a loop ends too.
    expect(descendantsOf(['a'], [a, b]).size).toBeLessThanOrEqual(2);
  });

  it('finds everything nested inside, and only that', () => {
    expect([...descendantsOf(['root'], nodes)].sort()).toEqual(['grandkid', 'kid']);
    expect([...descendantsOf(['kid'], nodes)]).toEqual(['grandkid']);
    expect([...descendantsOf(['other'], nodes)]).toEqual([]);
  });

  it('reads depth, parent origin and hidden-ness from the nodes as given', () => {
    const info = treeInfo(nodes.map((x) => (x.id === 'root' ? { ...x, hidden: true } : x)));
    expect(info.depth.get('grandkid')).toBe(2);
    expect(info.depth.get('other')).toBe(0);
    expect(info.origin.get('kid')).toEqual({ x: 100, y: 50 });
    expect(info.origin.get('grandkid')).toEqual({ x: 110, y: 70 });
    expect(info.origin.get('root')).toEqual({ x: 0, y: 0 });
    expect([...info.hidden].sort()).toEqual(['grandkid', 'kid', 'root']);
  });
});

describe('a child node', () => {
  it('is placed relative to its parent, and above it', () => {
    const nodes = [n('p', 100, 50), n('c', 10, 20, { parentId: 'p' }), n('g', 1, 2, { parentId: 'c' })];
    const { container } = render(<FlowingerCanvas nodes={nodes} />);
    expect(at(container, 'p')).toBe('translate(100px, 50px)');
    expect(at(container, 'c')).toBe('translate(110px, 70px)');
    expect(at(container, 'g')).toBe('translate(111px, 72px)');
    expect(el(container, 'p').style.zIndex).toBe('1');
    expect(el(container, 'c').style.zIndex).toBe('2');
    expect(el(container, 'g').style.zIndex).toBe('3');
  });

  it('takes an explicit zIndex over its depth', () => {
    const nodes = [n('p', 0, 0, { zIndex: 7 }), n('c', 0, 0, { parentId: 'p', zIndex: 0 })];
    const { container } = render(<FlowingerCanvas nodes={nodes} />);
    expect(el(container, 'p').style.zIndex).toBe('7');
    expect(el(container, 'c').style.zIndex).toBe('0');
  });

  it('is a root when its parent is not there, and a loop of parents does not hang', () => {
    const { container } = render(
      <FlowingerCanvas
        nodes={[
          n('lost', 5, 6, { parentId: 'gone' }),
          n('a', 1, 1, { parentId: 'b' }),
          n('b', 2, 2, { parentId: 'a' }),
        ]}
      />,
    );
    expect(at(container, 'lost')).toBe('translate(5px, 6px)');
    expect(has(container, 'a') && has(container, 'b')).toBe(true);
  });

  it('gives its component its absolute position', () => {
    function Coords({ positionAbsoluteX, positionAbsoluteY }: NodeProps) {
      return (
        <span data-testid="abs">
          {String(positionAbsoluteX)},{String(positionAbsoluteY)}
        </span>
      );
    }
    const nodes = [n('p', 100, 50), n('c', 10, 20, { parentId: 'p', type: 'k' })];
    const { getByTestId } = render(<FlowingerCanvas nodes={nodes} nodeTypes={{ k: Coords }} />);
    expect(getByTestId('abs').textContent).toBe('110,70');
  });

  it('is what an edge attaches to, in canvas coordinates', () => {
    const nodes = [n('p', 100, 50), n('c', 10, 20, { parentId: 'p' }), n('far', 100, 400)];
    const edges: Edge[] = [{ id: 'e', source: 'c', target: 'far' }];
    const { container } = render(<FlowingerCanvas nodes={nodes} edges={edges} />);
    // c is at (110, 70), 100 × 40: its bottom-middle is (160, 110).
    expect(edgeD(container, 'e')).toMatch(/^M 160\.00 110\.00 C/);
  });

  it('is what an edge attaches to at either end', () => {
    const nodes = [n('p', 100, 50), n('c', 10, 20, { parentId: 'p' }), n('above', 100, -400)];
    // c is the target now, and above is higher up: the edge arrives at c's top-middle.
    const edges: Edge[] = [{ id: 'e', source: 'above', target: 'c' }];
    const { container } = render(<FlowingerCanvas nodes={nodes} edges={edges} />);
    expect(edgeD(container, 'e')).toMatch(/160\.00 70\.00$/); // c at (110, 70): top-middle (160, 70)
  });

  it('hides with a hidden parent, and its edges with it', () => {
    const nodes = [n('p', 0, 0, { hidden: true }), n('c', 10, 10, { parentId: 'p' }), n('x', 300, 0)];
    const edges: Edge[] = [{ id: 'e', source: 'c', target: 'x' }];
    const { container } = render(<FlowingerCanvas nodes={nodes} edges={edges} />);
    expect(has(container, 'p')).toBe(false);
    expect(has(container, 'c')).toBe(false);
    expect(has(container, 'x')).toBe(true);
    expect(container.querySelector('[data-testid="rf__edge-e"]')).toBeNull();
  });

  it('is drawn at its canvas position on the minimap', () => {
    const nodes = [n('p', 1000, 0), n('c', 500, 0, { parentId: 'p' })];
    const { container } = render(
      <FlowingerCanvas nodes={nodes}>
        <MiniMap />
      </FlowingerCanvas>,
    );
    const xs = [...container.querySelectorAll('.flowinger-minimap-node')].map((r) => Number(r.getAttribute('x')));
    expect(xs).toHaveLength(2);
    // The parent is at 1000 and the child 500 inside it, i.e. at 1500: the child is the one on the right.
    expect(xs[1]).toBeGreaterThan(xs[0] as number);
  });
});

describe('moving nodes that have children', () => {
  const nodes = () => [n('p', 0, 0), n('c', 10, 10, { parentId: 'p' }), n('g', 5, 5, { parentId: 'c' })];
  const drag = (c: ParentNode, id: string, dx: number, dy: number) => {
    const node = el(c, id);
    fireEvent.pointerDown(node, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(node, pointer({ clientX: dx, clientY: dy }));
    fireEvent.pointerUp(node, pointer({ clientX: dx, clientY: dy }));
  };

  it('carries the children when the parent is dragged', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes()} nodesDraggable />);
    drag(container, 'p', 30, 20);
    expect(at(container, 'p')).toBe('translate(30px, 20px)');
    expect(at(container, 'c')).toBe('translate(40px, 30px)');
    expect(at(container, 'g')).toBe('translate(45px, 35px)');
  });

  it('moves a child alone, in its parent’s coordinates, when the child is dragged', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes()} nodesDraggable />);
    drag(container, 'c', 30, 20);
    expect(at(container, 'p')).toBe('translate(0px, 0px)');
    expect(at(container, 'c')).toBe('translate(40px, 30px)');
    expect(at(container, 'g')).toBe('translate(45px, 35px)'); // it goes with c
  });

  it('does not move a child twice when it and its parent are dragged together', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes()} nodesDraggable elementsSelectable />);
    fireEvent.click(el(container, 'p'));
    fireEvent.click(el(container, 'c'), { shiftKey: true });
    drag(container, 'p', 30, 20);
    expect(at(container, 'p')).toBe('translate(30px, 20px)');
    expect(at(container, 'c')).toBe('translate(40px, 30px)'); // +30, not +60
  });

  it('follows a parent moved by a controlled flow', () => {
    function Harness() {
      const [list, , onNodesChange] = useNodesState(nodes());
      return <FlowingerCanvas nodes={list} nodesDraggable onNodesChange={onNodesChange} />;
    }
    const { container } = render(<Harness />);
    drag(container, 'p', 30, 20);
    expect(at(container, 'c')).toBe('translate(40px, 30px)');
    expect(at(container, 'g')).toBe('translate(45px, 35px)');
  });

  it('reports only the dragged nodes’ own (relative) positions in a controlled flow', () => {
    const onNodesChange = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes()} nodesDraggable onNodesChange={onNodesChange} />,
    );
    onNodesChange.mockClear();
    const c = el(container, 'c');
    fireEvent.pointerDown(c, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(c, pointer({ clientX: 30, clientY: 20 }));
    expect(onNodesChange).toHaveBeenLastCalledWith([
      { type: 'position', id: 'c', position: { x: 40, y: 30 }, dragging: true },
    ]);
  });

  it('keeps a child with extent "parent" inside its parent’s box', () => {
    const boxed = [
      n('p', 100, 50, { width: 300, height: 200 }),
      n('c', 10, 10, { parentId: 'p', extent: 'parent', width: 50, height: 30 }),
    ];
    const { container } = render(<FlowingerCanvas nodes={boxed} nodesDraggable />);
    drag(container, 'c', 1000, 1000);
    // the far corner may reach the parent's: x 100 + 300 - 50 = 350, y 50 + 200 - 30 = 220
    expect(at(container, 'c')).toBe('translate(350px, 220px)');
    drag(container, 'c', -2000, -2000);
    expect(at(container, 'c')).toBe('translate(100px, 50px)'); // its parent's top-left
  });

  it('snaps a child to the canvas grid, not to its parent’s', () => {
    const grid = [n('p', 7, 0), n('c', 0, 0, { parentId: 'p' })];
    const { container } = render(<FlowingerCanvas nodes={grid} nodesDraggable snapToGrid snapGrid={[20, 20]} />);
    drag(container, 'c', 33, 0); // 7 + 33 = 40 on the canvas
    expect(at(container, 'c')).toBe('translate(40px, 0px)');
  });

  it('nudges a parent and its selected child once, not twice', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes()} nodesDraggable elementsSelectable />);
    fireEvent.click(el(container, 'p'));
    fireEvent.click(el(container, 'c'), { shiftKey: true });
    fireEvent.keyDown(el(container, 'p'), { key: 'ArrowRight' });
    expect(at(container, 'p')).toBe('translate(5px, 0px)');
    expect(at(container, 'c')).toBe('translate(15px, 10px)'); // +5, not +10
  });

  it('starts a connection from a child’s handle at its canvas position', () => {
    function Port() {
      return <Handle id="out" type="source" position={Position.Bottom} />;
    }
    const placed = [n('p', 100, 50), n('c', 10, 20, { parentId: 'p', type: 'port' })];
    const { container } = render(<FlowingerCanvas nodes={placed} nodeTypes={{ port: Port }} nodesConnectable />);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
    fireEvent.pointerDown(
      must(container, '[data-id="c"] [data-handleid="out"]'),
      pointer({ clientX: 160, clientY: 110 }),
    );
    // c is at (110, 70), 100 × 40: its bottom-middle is (160, 110).
    expect(must(container, '.react-flow__connection-path').getAttribute('d')).toMatch(/^M 160\.00 110\.00 C/);
    fireEvent.pointerUp(window, pointer({ clientX: 0, clientY: 0 }));
    Reflect.deleteProperty(document, 'elementFromPoint');
  });

  it('nudges a selected child with the arrow keys, in canvas units', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes()} nodesDraggable elementsSelectable />);
    fireEvent.click(el(container, 'c'));
    fireEvent.keyDown(el(container, 'c'), { key: 'ArrowRight' });
    expect(at(container, 'c')).toBe('translate(15px, 10px)');
    expect(at(container, 'g')).toBe('translate(20px, 15px)');
  });
});

describe('deleting a parent', () => {
  it('takes everything nested in it along, and the edges of all of it', async () => {
    let instance: FlowingerInstance | undefined;
    function Harness() {
      const [list, , onNodesChange] = useNodesState<Node>([
        n('p', 0, 0),
        n('c', 10, 10, { parentId: 'p', deletable: false }),
        n('g', 5, 5, { parentId: 'c' }),
        n('x', 300, 0),
      ]);
      const [links, , onEdgesChange] = useEdgesState<Edge>([
        { id: 'cx', source: 'c', target: 'x' },
        { id: 'gx', source: 'g', target: 'x' },
      ]);
      return (
        <FlowingerCanvas
          nodes={list}
          edges={links}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={(i) => {
            instance = i;
          }}
        />
      );
    }
    const { container } = render(<Harness />);
    let result: Awaited<ReturnType<FlowingerInstance['deleteElements']>> | undefined;
    await act(async () => {
      result = await instance?.deleteElements({ nodes: [{ id: 'p' }] });
    });
    expect(result?.deletedNodes.map((x) => x.id).sort()).toEqual(['c', 'g', 'p']);
    expect(result?.deletedEdges.map((e) => e.id).sort()).toEqual(['cx', 'gx']);
    expect(has(container, 'x')).toBe(true);
    expect(has(container, 'p') || has(container, 'c') || has(container, 'g')).toBe(false);
  });

  it('does not delete a child on its own account when only the child is undeletable', async () => {
    let instance: FlowingerInstance | undefined;
    render(
      <FlowingerCanvas
        defaultNodes={[n('p', 0, 0), n('c', 0, 0, { parentId: 'p', deletable: false })]}
        onInit={(i) => {
          instance = i;
        }}
      />,
    );
    let result: Awaited<ReturnType<FlowingerInstance['deleteElements']>> | undefined;
    await act(async () => {
      result = await instance?.deleteElements({ nodes: [{ id: 'c' }] });
    });
    expect(result?.deletedNodes).toEqual([]);
  });
});

describe('what reads a child’s position', () => {
  it('reports canvas coordinates for bounds, intersection and box selection', () => {
    let instance: FlowingerInstance | undefined;
    const nodes = [n('p', 100, 50), n('c', 10, 20, { parentId: 'p' }), n('near', 120, 80)];
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        elementsSelectable
        selectionOnDrag
        onInit={(i) => {
          instance = i;
        }}
      />,
    );
    expect(instance?.getNodesBounds(['c'])).toEqual({ x: 110, y: 70, width: 100, height: 40 });
    expect(instance?.getIntersectingNodes({ id: 'near' }).map((x) => x.id).sort()).toEqual(['c', 'p']);
    // The data stays relative: getNode is what the caller gave.
    expect(instance?.getNode('c')?.position).toEqual({ x: 10, y: 20 });

    // A box around where c is on the canvas (110–210 × 70–110), not where 10,20 would be.
    const pane = container.firstElementChild as Element;
    fireEvent.pointerDown(pane, pointer({ clientX: 105, clientY: 65 }));
    fireEvent.pointerMove(pane, pointer({ clientX: 215, clientY: 115 }));
    expect(el(container, 'c').classList.contains('selected')).toBe(true);
    expect(el(container, 'p').classList.contains('selected')).toBe(false);
  });

  it('frames the diagram by canvas coordinates', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40);
    // Only a child, far from the origin once its parent is counted in.
    const nodes = [n('p', 1000, 1000), n('c', 0, 0, { parentId: 'p' })];
    const { container } = render(<FlowingerCanvas nodes={nodes} fitView fitViewOptions={{ padding: 0 }} maxZoom={1} />);
    // The two overlap at (1000, 1000): 100 × 40, centred on (1050, 1020) at zoom 1.
    expect(must<HTMLElement>(container, '.flowinger-viewport').style.transform).toBe(
      'translate(-650px, -720px) scale(1)',
    );
  });
});

describe('onlyRenderVisibleElements', () => {
  const stubPane = () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  };
  const renders: Record<string, number> = {};
  function Counted({ id }: NodeProps) {
    useEffect(() => {
      renders[id] = (renders[id] ?? 0) + 1;
    });
    return <span />;
  }
  afterEach(() => {
    for (const k of Object.keys(renders)) delete renders[k];
  });

  const nodes = [n('near', 0, 0), n('far', 5000, 0), n('below', 0, 4000)];

  it('draws what is in view and leaves the rest out', () => {
    stubPane();
    const { container } = render(<FlowingerCanvas nodes={nodes} onlyRenderVisibleElements />);
    expect(has(container, 'near')).toBe(true);
    expect(has(container, 'far')).toBe(false);
    expect(has(container, 'below')).toBe(false);
  });

  it('draws everything when it is off', () => {
    stubPane();
    const { container } = render(<FlowingerCanvas nodes={nodes} />);
    expect(has(container, 'far') && has(container, 'below')).toBe(true);
  });

  it('draws everything when the pane has no size to judge by', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} onlyRenderVisibleElements />);
    expect(has(container, 'far')).toBe(true);
  });

  it('brings a node in as it is panned to, and lets go of the one it left', () => {
    stubPane();
    let instance: FlowingerInstance | undefined;
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        onlyRenderVisibleElements
        onInit={(i) => {
          instance = i;
        }}
      />,
    );
    act(() => {
      void instance?.setViewport({ x: -5000, y: 0, zoom: 1 });
    });
    expect(has(container, 'far')).toBe(true);
    expect(has(container, 'near')).toBe(false);
  });

  it('does not re-render nodes for a pan that reveals nothing new', () => {
    stubPane();
    let instance: FlowingerInstance | undefined;
    render(
      <FlowingerCanvas
        nodes={[{ ...n('near', 0, 0), type: 'k' }]}
        nodeTypes={{ k: Counted }}
        onlyRenderVisibleElements
        onInit={(i) => {
          instance = i;
        }}
      />,
    );
    const before = renders.near;
    act(() => {
      void instance?.setViewport({ x: -20, y: -10, zoom: 1 });
    });
    act(() => {
      void instance?.setViewport({ x: -40, y: -20, zoom: 1 });
    });
    expect(renders.near).toBe(before);
  });

  it('keeps a selected node drawn wherever the view goes', () => {
    stubPane();
    let instance: FlowingerInstance | undefined;
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        elementsSelectable
        onlyRenderVisibleElements
        onInit={(i) => {
          instance = i;
        }}
      />,
    );
    fireEvent.click(el(container, 'near'));
    act(() => {
      void instance?.setViewport({ x: -5000, y: 0, zoom: 1 });
    });
    expect(has(container, 'near')).toBe(true);
    expect(has(container, 'far')).toBe(true);
  });

  it('keeps a node being dragged drawn, and lets it go once dropped out of view', () => {
    stubPane();
    const { container } = render(<FlowingerCanvas nodes={nodes} nodesDraggable onlyRenderVisibleElements />);
    const near = el(container, 'near');
    fireEvent.pointerDown(near, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(near, pointer({ clientX: 6000, clientY: 0 }));
    expect(has(container, 'near')).toBe(true); // 6000 px away, and still under the pointer
    fireEvent.pointerUp(near, pointer({ clientX: 6000, clientY: 0 }));
    expect(has(container, 'near')).toBe(false);
  });

  it('draws an edge that has an end in view, or crosses it, and not one that does neither', () => {
    stubPane();
    const many = [
      n('a', 0, 0),
      n('b', 5000, 0),
      n('c', -3000, 300),
      n('d', 3000, 300),
      n('e', -3000, 3000),
      n('f', -2000, 3000),
    ];
    const edges: Edge[] = [
      { id: 'ab', source: 'a', target: 'b' }, // one end in view
      { id: 'cd', source: 'c', target: 'd' }, // both out, but it crosses the view
      { id: 'ef', source: 'e', target: 'f' }, // both out, far from it
    ];
    const { container } = render(<FlowingerCanvas nodes={many} edges={edges} onlyRenderVisibleElements />);
    const drawn = (id: string) => container.querySelector(`[data-testid="rf__edge-${id}"]`) !== null;
    expect(drawn('ab')).toBe(true);
    expect(drawn('cd')).toBe(true);
    expect(drawn('ef')).toBe(false);
  });
});
