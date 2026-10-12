import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  FlowingerCanvas,
  FlowingerProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type FlowingerInstance,
  type Node,
} from '../index.ts';
import {
  SmartEdge,
  SnapLinesOverlay,
  exportCanvasToPng,
  exportCanvasToSvg,
  getSmartEdgePath,
  shapeNodeTypes,
  useClipboard,
  useCollapsibleTree,
  useSnapLines,
  useUndoRedo,
  type UseClipboardResult,
  type UseCollapsibleTreeResult,
  type UseUndoRedoResult,
} from '../pro/index.ts';
import { getSmoothStepPath } from '../paths.ts';
import { Position } from '../types.ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const box = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  width: 100,
  height: 40,
  data: {},
  ...extra,
});

interface Hooks {
  flow?: FlowingerInstance;
  nodes: Node[];
  edges: Edge[];
}

/** Hands the test the instance. */
function Probe({ out }: { out: Hooks }) {
  out.flow = useReactFlow();
  return null;
}

/** A canvas that owns its graph, with a probe inside the provider that hands back the instance and the state. */
function Editor({
  initialNodes,
  initialEdges = [],
  out,
  children,
  edgeTypes,
  nodeTypes,
}: {
  initialNodes: Node[];
  initialEdges?: Edge[];
  out: Hooks;
  children?: ReactNode;
  edgeTypes?: Record<string, never> | Record<string, unknown>;
  nodeTypes?: Record<string, unknown>;
}) {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  out.nodes = nodes;
  out.edges = edges;
  return (
    <FlowingerProvider>
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          elementsSelectable
          {...(edgeTypes ? { edgeTypes: edgeTypes as never } : {})}
          {...(nodeTypes ? { nodeTypes: nodeTypes as never } : {})}
        >
          <Probe out={out} />
        </FlowingerCanvas>
      </div>
      {children}
    </FlowingerProvider>
  );
}

/** Mounts a hook inside the provider of an `Editor`, and hands back its latest result. */
function useHookIn<T>(use: () => T, graph: { nodes: Node[]; edges?: Edge[] }, extra: Partial<Parameters<typeof Editor>[0]> = {}) {
  const out: Hooks = { nodes: [], edges: [] };
  const result: { current: T } = { current: undefined as T };
  function Host() {
    result.current = use();
    return null;
  }
  const view = render(
    <Editor initialNodes={graph.nodes} initialEdges={graph.edges ?? []} out={out} {...extra}>
      <Host />
    </Editor>,
  );
  return { ...view, out, result };
}

const ids = (nodes: Node[]) => nodes.map((n) => n.id).sort();

describe('useUndoRedo on a real canvas', () => {
  it('puts the graph back, and forward again, through the canvas', () => {
    const { out, result } = useHookIn<UseUndoRedoResult>(
      () => useUndoRedo({ enableShortcuts: false }),
      { nodes: [box('a', 0, 0), box('b', 200, 0)] },
    );
    expect(ids(out.nodes)).toEqual(['a', 'b']);

    act(() => {
      result.current.takeSnapshot();
      out.flow?.addNodes(box('c', 0, 100));
    });
    expect(ids(out.nodes)).toEqual(['a', 'b', 'c']);
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(ids(out.nodes)).toEqual(['a', 'b']);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(ids(out.nodes)).toEqual(['a', 'b', 'c']);
  });

  it('undoes a move to where the node was', () => {
    const { out, result } = useHookIn<UseUndoRedoResult>(
      () => useUndoRedo({ enableShortcuts: false }),
      { nodes: [box('a', 10, 10)] },
    );
    act(() => {
      result.current.takeSnapshot();
      out.flow?.updateNode('a', { position: { x: 300, y: 300 } });
    });
    expect(out.nodes[0]?.position).toEqual({ x: 300, y: 300 });
    act(() => result.current.undo());
    expect(out.nodes[0]?.position).toEqual({ x: 10, y: 10 });
  });

  it('answers Ctrl+Z and Ctrl+Shift+Z, and leaves a text field alone', () => {
    const { out, result } = useHookIn<UseUndoRedoResult>(() => useUndoRedo(), {
      nodes: [box('a', 0, 0)],
    });
    act(() => {
      result.current.takeSnapshot();
      out.flow?.addNodes(box('b', 100, 0));
    });
    const field = document.createElement('input');
    document.body.appendChild(field);
    fireEvent.keyDown(field, { key: 'z', ctrlKey: true });
    expect(ids(out.nodes)).toEqual(['a', 'b']); // typed into, not undone
    field.remove();

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(ids(out.nodes)).toEqual(['a']);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(ids(out.nodes)).toEqual(['a', 'b']);
  });

  it('keeps no more than maxHistory snapshots', () => {
    const { result } = renderHook(() => useUndoRedo({ maxHistory: 3, enableShortcuts: false }));
    act(() => {
      for (let i = 0; i < 6; i++) result.current.takeSnapshot({ nodes: [box(String(i), i, 0)], edges: [] });
    });
    expect(result.current.history.past.map((s) => s.nodes[0]?.id)).toEqual(['3', '4', '5']);
  });
});

describe('useClipboard on a real canvas', () => {
  const selected = (n: Node): Node => ({ ...n, selected: true });

  it('pastes a copy of the selection, with its edges between copies, and selects it', async () => {
    const { out, result } = useHookIn<UseClipboardResult>(
      () => useClipboard({ enableShortcuts: false, offset: { x: 10, y: 10 } }),
      {
        nodes: [selected(box('a', 0, 0)), selected(box('b', 200, 0)), box('c', 400, 0)],
        edges: [
          { id: 'ab', source: 'a', target: 'b' },
          { id: 'bc', source: 'b', target: 'c' },
        ],
      },
    );
    await act(async () => {
      await result.current.copy();
    });
    await act(async () => {
      await result.current.paste();
    });
    expect(out.nodes).toHaveLength(5);
    expect(out.edges).toHaveLength(3); // ab, bc and one copy of ab; bc was not copied (c was not)
    const copies = out.nodes.filter((n) => !['a', 'b', 'c'].includes(n.id));
    expect(copies.map((n) => n.position)).toEqual([
      { x: 10, y: 10 },
      { x: 210, y: 10 },
    ]);
    expect(copies.every((n) => n.selected)).toBe(true);
    // What was selected before is not.
    expect(out.nodes.filter((n) => n.selected).length).toBe(2);
    const copiedEdge = out.edges.find((e) => !['ab', 'bc'].includes(e.id));
    expect(copiedEdge && copies.map((n) => n.id)).toContain(copiedEdge?.source);
    expect(copies.map((n) => n.id)).toContain(copiedEdge?.target);
  });

  it('puts a copied child in the copy of its parent, without moving it twice', async () => {
    const { out, result } = useHookIn<UseClipboardResult>(
      () => useClipboard({ enableShortcuts: false, offset: { x: 100, y: 100 } }),
      {
        nodes: [
          selected(box('g', 50, 50, { width: 300, height: 200 })),
          selected(box('k', 20, 30, { parentId: 'g' })),
        ],
      },
    );
    await act(async () => {
      await result.current.copy();
    });
    await act(async () => {
      await result.current.paste();
    });
    const g2 = out.nodes.find((n) => n.id !== 'g' && n.id !== 'k' && n.parentId === undefined);
    const k2 = out.nodes.find((n) => n.id !== 'k' && n.parentId !== undefined);
    expect(g2?.position).toEqual({ x: 150, y: 150 });
    expect(k2?.parentId).toBe(g2?.id); // inside the copy, not the original
    expect(k2?.position).toEqual({ x: 20, y: 30 }); // relative to its parent: the parent moved, not it
  });

  it('copies on Ctrl+C and pastes on Ctrl+V through the browser clipboard events', () => {
    const { out } = useHookIn<UseClipboardResult>(() => useClipboard(), {
      nodes: [selected(box('a', 0, 0)), box('b', 200, 0)],
    });
    const data: Record<string, string> = {};
    const clipboardData = {
      setData: (type: string, value: string) => {
        data[type] = value;
      },
      getData: (type: string) => data[type] ?? '',
    };
    const fire = (type: 'copy' | 'cut' | 'paste', target: EventTarget = document.body) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: clipboardData });
      act(() => {
        target.dispatchEvent(event);
      });
      return event;
    };

    const copied = fire('copy');
    expect(copied.defaultPrevented).toBe(true);
    expect(JSON.parse(data['text/plain'] ?? '{}')).toMatchObject({ flowingerClipboard: true });

    const pasted = fire('paste');
    expect(pasted.defaultPrevented).toBe(true);
    expect(out.nodes).toHaveLength(3);

    // In a text field, a copy and a paste are the field's.
    const field = document.createElement('textarea');
    document.body.appendChild(field);
    expect(fire('copy', field).defaultPrevented).toBe(false);
    expect(fire('paste', field).defaultPrevented).toBe(false);
    expect(out.nodes).toHaveLength(3);
    field.remove();
  });

  it('cuts: takes the selection and the edges that touched it out of the graph', async () => {
    const { out, result } = useHookIn<UseClipboardResult>(
      () => useClipboard({ enableShortcuts: false }),
      {
        nodes: [selected(box('a', 0, 0)), box('b', 200, 0)],
        edges: [{ id: 'ab', source: 'a', target: 'b' }],
      },
    );
    await act(async () => {
      await result.current.cut();
    });
    expect(ids(out.nodes)).toEqual(['b']);
    expect(out.edges).toHaveLength(0);
    await act(async () => {
      await result.current.paste();
    });
    expect(out.nodes).toHaveLength(2);
  });
});

describe('useSnapLines', () => {
  const dragged = box('d', 0, 0, { width: 100, height: 50 });

  it('shows only the guides that are true where it snaps, not ones it passed on the way', () => {
    const { result } = renderHook(() => useSnapLines({ threshold: 8, snapToCenter: false }));
    const others = [
      box('far', 105, 400, { width: 100, height: 50 }), // its left edge is 5 away
      box('near', 101, 800, { width: 100, height: 50 }), // its left edge is 1 away: the one that wins
    ];
    let at = { x: 0, y: 0 };
    act(() => {
      at = result.current.handleNodeDrag(dragged, others, { x: 100, y: 1000 });
    });
    expect(at.x).toBe(101);
    const vertical = result.current.snapLines.filter((l) => l.type === 'vertical');
    // Both of `near`'s edges are lined up with at 101 (the boxes are the same width); `far`, which it passed
    // on the way, is not.
    expect(vertical.map((l) => [l.position, l.targetNodeId])).toEqual([
      [101, 'near'],
      [201, 'near'],
    ]);
  });

  it('shows every guide that is true at the snap, when several nodes line up there', () => {
    const { result } = renderHook(() => useSnapLines({ threshold: 5, snapToCenter: false }));
    const others = [box('p', 300, 0), box('q', 300, 200)];
    act(() => {
      result.current.handleNodeDrag(dragged, others, { x: 302, y: 1000 });
    });
    const vertical = result.current.snapLines.filter((l) => l.type === 'vertical');
    // p and q are lined up on both edges; each place gets one guide.
    expect(vertical.map((l) => l.position).sort((a, b) => a - b)).toEqual([300, 400]);
  });

  it('lines a node up with its siblings only: positions in another parent are in another space', () => {
    const { result } = renderHook(() => useSnapLines({ threshold: 5 }));
    const inside = box('inside', 100, 100, { parentId: 'g' });
    let at = { x: 0, y: 0 };
    act(() => {
      at = result.current.handleNodeDrag(dragged, [inside], { x: 101, y: 101 });
    });
    expect(at).toEqual({ x: 101, y: 101 });
    expect(result.current.snapLines).toHaveLength(0);
  });

  it('works in top-left terms, so a nodeOrigin of the centre snaps its edges, not its middle, to edges', () => {
    const { result } = renderHook(() => useSnapLines({ threshold: 5, snapToCenter: false, nodeOrigin: [0.5, 0.5] }));
    // 100 × 50 centred at x: its left edge is position.x − 50. The other's left edge is at 200.
    const other = box('o', 300, 0, { width: 100, height: 50, origin: [0.5, 0.5] }); // left edge 250, right 350
    let at = { x: 0, y: 0 };
    act(() => {
      // Drag so its right edge (x + 50) is 3 off the other's left edge (250): x = 203.
      at = result.current.handleNodeDrag(dragged, [other], { x: 203, y: 1000 });
    });
    expect(at.x).toBe(200); // right edge exactly at 250
  });
});

describe('useSnapLines: applied to a drag', () => {
  const nodes = [box('moving', 0, 0), box('still', 300, 0), box('mate', 0, 500)];
  type Position = { type: 'position'; id: string; position?: { x: number; y: number }; dragging?: boolean };

  it('moves the dragged node onto the line, as the change is applied', () => {
    const { result } = renderHook(() => useSnapLines({ threshold: 6, snapToCenter: false }));
    let out: Position[] = [];
    act(() => {
      out = result.current.snapNodeChanges<Position>(
        [{ type: 'position', id: 'moving', position: { x: 296, y: 100 }, dragging: true }],
        nodes,
      );
    });
    expect(out[0]?.position).toEqual({ x: 300, y: 100 });
    expect(result.current.snapLines.some((l) => l.type === 'vertical' && l.position === 300)).toBe(true);
  });

  it('moves a dragged selection together: the others by what the lead moved', () => {
    const { result } = renderHook(() => useSnapLines({ threshold: 6, snapToCenter: false }));
    let out: Position[] = [];
    act(() => {
      out = result.current.snapNodeChanges<Position>(
        [
          { type: 'position', id: 'moving', position: { x: 296, y: 100 }, dragging: true },
          { type: 'position', id: 'mate', position: { x: 296, y: 600 }, dragging: true },
        ],
        nodes,
      );
    });
    expect(out.map((c) => c.position)).toEqual([
      { x: 300, y: 100 },
      { x: 300, y: 600 },
    ]);
  });

  it('is not lined up with a node that is moving with it', () => {
    const { result } = renderHook(() => useSnapLines({ threshold: 6, snapToCenter: false }));
    let out: Position[] = [];
    act(() => {
      out = result.current.snapNodeChanges<Position>(
        [
          { type: 'position', id: 'moving', position: { x: 296, y: 100 }, dragging: true },
          { type: 'position', id: 'still', position: { x: 301, y: 100 }, dragging: true },
        ],
        nodes,
      );
    });
    // `still` is being dragged too, so it is not something to line up with.
    expect(out[0]?.position).toEqual({ x: 296, y: 100 });
  });

  it('leaves other changes alone, and clears the guides when the drag ends', () => {
    const { result } = renderHook(() => useSnapLines({ threshold: 6, snapToCenter: false }));
    act(() => {
      result.current.snapNodeChanges<Position>(
        [{ type: 'position', id: 'moving', position: { x: 296, y: 100 }, dragging: true }],
        nodes,
      );
    });
    expect(result.current.snapLines.length).toBeGreaterThan(0);
    const select = { type: 'select' as const, id: 'moving', selected: true };
    let out: unknown[] = [];
    act(() => {
      out = result.current.snapNodeChanges([select, { type: 'position' as const, id: 'moving', dragging: false }], nodes);
    });
    expect(out[0]).toBe(select);
    expect(result.current.snapLines).toHaveLength(0);
  });

  it('draws the guides in graph space: inside the viewport, so they pan and zoom with it', () => {
    function Guides() {
      const { snapLines, handleNodeDrag } = useSnapLines();
      return (
        <>
          <button
            data-testid="go"
            onClick={() => handleNodeDrag(nodes[0] as Node, [nodes[1] as Node], { x: 301, y: 0 })}
          />
          <SnapLinesOverlay snapLines={snapLines} />
        </>
      );
    }
    const { container, getByTestId } = render(
      <FlowingerProvider>
        <FlowingerCanvas nodes={nodes}>
          <Guides />
        </FlowingerCanvas>
      </FlowingerProvider>,
    );
    expect(container.querySelector('.flowinger-snaplines-overlay')).toBeNull();
    fireEvent.click(getByTestId('go'));
    const overlay = container.querySelector('.flowinger-snaplines-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay?.closest('.flowinger-viewport')).not.toBeNull();
  });
});

describe('useCollapsibleTree on a real canvas', () => {
  const tree = {
    nodes: ['root', 'a', 'b', 'a1', 'a2', 'b1'].map((id, i) => box(id, i * 10, i * 10)),
    edges: [
      { id: 'r-a', source: 'root', target: 'a' },
      { id: 'r-b', source: 'root', target: 'b' },
      { id: 'a-a1', source: 'a', target: 'a1' },
      { id: 'a-a2', source: 'a', target: 'a2' },
      { id: 'b-b1', source: 'b', target: 'b1' },
    ] satisfies Edge[],
  };
  const hidden = (out: Hooks) => out.nodes.filter((n) => n.hidden).map((n) => n.id).sort();

  it('hides everything below a collapsed node, and its edges, and shows them again', () => {
    const { out, result } = useHookIn<UseCollapsibleTreeResult>(() => useCollapsibleTree(), tree);
    act(() => result.current.collapseNode('a'));
    expect(hidden(out)).toEqual(['a1', 'a2']);
    expect(out.edges.filter((e) => e.hidden).map((e) => e.id).sort()).toEqual(['a-a1', 'a-a2']);
    act(() => result.current.expandNode('a'));
    expect(hidden(out)).toEqual([]);
    expect(out.edges.some((e) => e.hidden)).toBe(false);
  });

  it('keeps what is under a branch that is still closed hidden when an ancestor is opened', () => {
    const { out, result } = useHookIn<UseCollapsibleTreeResult>(() => useCollapsibleTree(), tree);
    act(() => result.current.collapseNode('a'));
    act(() => result.current.collapseNode('root'));
    expect(hidden(out)).toEqual(['a', 'a1', 'a2', 'b', 'b1']);
    act(() => result.current.expandNode('root'));
    // `a` is shown again, but is still closed: its children stay hidden.
    expect(hidden(out)).toEqual(['a1', 'a2']);
  });

  it('is not its own descendant when the graph loops back', () => {
    const { result } = renderHook(() => useCollapsibleTree());
    const loop: Edge[] = [
      { id: '1', source: 'x', target: 'y' },
      { id: '2', source: 'y', target: 'x' },
    ];
    expect(result.current.getDescendantIds('x', loop)).toEqual(['y']);
  });

  it('does not unhide a node that was hidden for another reason', () => {
    const { out, result } = useHookIn<UseCollapsibleTreeResult>(
      () => useCollapsibleTree(),
      { nodes: [box('root', 0, 0), box('k', 0, 100, { hidden: true }), box('u', 0, 200)], edges: [
        { id: 'r-k', source: 'root', target: 'k' },
        { id: 'r-u', source: 'root', target: 'u' },
      ] },
    );
    act(() => result.current.collapseNode('root'));
    act(() => result.current.expandNode('root'));
    // Both children come back: collapsing is what hid them, and it cannot tell why `k` was hidden before.
    expect(hidden(out)).toEqual([]);
  });
});

describe('getSmartEdgePath', () => {
  const inside = (p: { x: number; y: number }, n: Node) =>
    p.x > n.position.x && p.x < n.position.x + (n.width ?? 0) && p.y > n.position.y && p.y < n.position.y + (n.height ?? 0);

  /** The numbers of a path: its vertices, and a rounding's control point and end, in order. */
  const vertices = (path: string) => {
    const nums = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i] as number, y: nums[i + 1] as number });
    return out;
  };
  /** Points along the path's straight runs, dense enough to find one inside a box. */
  const samples = (path: string) => {
    const v = vertices(path);
    const out: { x: number; y: number }[] = [];
    for (let i = 1; i < v.length; i++) {
      const a = v[i - 1] as { x: number; y: number };
      const b = v[i] as { x: number; y: number };
      for (let t = 0; t <= 1; t += 0.02) out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return out;
  };

  const base = {
    sourceX: 0,
    sourceY: 0,
    sourcePosition: Position.Right,
    targetX: 300,
    targetY: 0,
    targetPosition: Position.Left,
  } as const;

  it('is the smooth-step path when nothing is near', () => {
    const [path] = getSmartEdgePath({ ...base, nodes: [box('far', 0, 2000)] });
    expect(path).toBe(getSmoothStepPath(base)[0]);
  });

  it('goes around a node that is in the way, and does not go through it', () => {
    const blocker = box('block', 130, -30, { width: 60, height: 60 });
    const [path] = getSmartEdgePath({ ...base, nodes: [blocker], gridRatio: 10 });
    expect(path).not.toBe(getSmoothStepPath(base)[0]);
    expect(samples(path).some((p) => inside(p, blocker))).toBe(false);
    const v = vertices(path);
    expect(v[0]).toEqual({ x: 0, y: 0 });
    expect(v[v.length - 1]).toEqual({ x: 300, y: 0 });
  });

  it('does not count the nodes the edge joins as in the way', () => {
    const from = box('from', -100, -20, { width: 100, height: 40 });
    const to = box('to', 300, -20, { width: 100, height: 40 });
    const [path] = getSmartEdgePath({ ...base, nodes: [from, to], excludeIds: ['from', 'to'] });
    expect(path).toBe(getSmoothStepPath(base)[0]);
  });

  it('leaves a handle the way it faces', () => {
    const blocker = box('block', 130, -30, { width: 60, height: 60 });
    const [path] = getSmartEdgePath({ ...base, nodes: [blocker], gridRatio: 10 });
    const v = vertices(path);
    // The first run is to the right — out of a Right handle — before it turns.
    expect((v[1] as { x: number }).x).toBeGreaterThan(0);
    expect((v[1] as { y: number }).y).toBe(0);
  });

  it('is routed on a canvas, around the node between two others', () => {
    const nodes = [
      box('s', 0, 0, { width: 80, height: 40 }),
      box('mid', 200, -10, { width: 80, height: 60 }),
      box('t', 420, 0, { width: 80, height: 40 }),
    ];
    const edges: Edge[] = [{ id: 'e', source: 's', target: 't', type: 'smart', sourceHandle: undefined }];
    const out: Hooks = { nodes: [], edges: [] };
    const { container } = render(
      <Editor initialNodes={nodes} initialEdges={edges} out={out} edgeTypes={{ smart: SmartEdge }} />,
    );
    const d = container.querySelector('.react-flow__edge-path')?.getAttribute('d') ?? '';
    expect(d).not.toBe('');
    const mid = nodes[1] as Node;
    expect(samples(d).some((p) => inside(p, mid))).toBe(false);
  });
});

describe('shape nodes', () => {
  it('fill the size the node is given, and have a default when it is not given one', () => {
    const Diamond = shapeNodeTypes.diamond;
    const { container } = render(
      <FlowingerProvider>
        <FlowingerCanvas
          nodes={[box('d', 0, 0, { type: 'diamond', width: 200, height: 120, data: { label: 'Go?' } })]}
          nodeTypes={{ diamond: Diamond }}
        />
      </FlowingerProvider>,
    );
    const wrapper = container.querySelector<HTMLElement>('[data-id="d"]');
    expect(wrapper?.style.width).toBe('200px');
    const shape = wrapper?.firstElementChild as HTMLElement;
    // 100% of a wrapper that has a size; a floor, not a fixed size.
    expect(shape.style.width).toBe('100%');
    expect(shape.style.minWidth).toBe('120px');
  });

  it('takes `color` as the outline when `stroke` is not given', () => {
    const Circle = shapeNodeTypes.circle;
    const { container } = render(
      <FlowingerProvider>
        <FlowingerCanvas
          nodes={[box('c', 0, 0, { type: 'circle', data: { color: '#ff0000' } })]}
          nodeTypes={{ circle: Circle }}
        />
      </FlowingerProvider>,
    );
    expect(container.querySelector('circle')?.getAttribute('stroke')).toBe('#ff0000');
  });
});

describe('export', () => {
  /** jsdom lays nothing out: draw each element where its own inline transform and size say, under the viewport's. */
  function layOut(root: HTMLElement) {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const el = this as HTMLElement;
      const viewport = root.querySelector<HTMLElement>('.flowinger-viewport');
      const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(\s*([\d.]+)/.exec(viewport?.style.transform ?? '');
      const [tx, ty, zoom] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 1];
      const rect = (l: number, t: number, w: number, h: number) =>
        ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t, toJSON() {} }) as DOMRect;
      if (el === viewport) return rect(tx, ty, 800 * zoom, 600 * zoom);
      if (el.classList?.contains('react-flow__node')) {
        const at = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(el.style.transform);
        const x = at ? Number(at[1]) : 0;
        const y = at ? Number(at[2]) : 0;
        return rect(tx + x * zoom, ty + y * zoom, parseFloat(el.style.width) * zoom, parseFloat(el.style.height) * zoom);
      }
      return rect(0, 0, 0, 0);
    });
  }

  const nodes = [box('a', 100, 50), box('b', 400, 300, { width: 120, height: 60 })];
  const size = (svg: string) => {
    const m = /<svg[^>]*width="([\d.]+)" height="([\d.]+)"/.exec(svg);
    return [Number(m?.[1]), Number(m?.[2])];
  };

  function mount(viewport?: { x: number; y: number; zoom: number }) {
    const out: Hooks = { nodes: [], edges: [] };
    const view = render(
      <FlowingerProvider>
        <div style={{ width: 800, height: 600 }} data-testid="wrap">
          <FlowingerCanvas nodes={nodes} {...(viewport ? { defaultViewport: viewport } : {})} />
        </div>
      </FlowingerProvider>,
    );
    void out;
    layOut(view.container);
    return view;
  }

  it('is the whole diagram and its padding, wherever the view is panned and zoomed to', async () => {
    // The diagram runs from (100, 50) to (520, 360): 420 × 310.
    for (const viewport of [{ x: 0, y: 0, zoom: 1 }, { x: -500, y: 80, zoom: 0.5 }, { x: 30, y: 30, zoom: 2 }]) {
      const view = mount(viewport);
      const svg = await exportCanvasToSvg(view.getByTestId('wrap'), { padding: 20 });
      expect(size(svg)).toEqual([460, 350]);
      view.unmount();
    }
  });

  it('draws the diagram at 1:1 from the padding in', async () => {
    const view = mount({ x: 0, y: 0, zoom: 0.5 });
    const svg = await exportCanvasToSvg(view.getByTestId('wrap'), { padding: 20 });
    // The layer is moved so the top-left of the diagram (100, 50) lands on (20, 20), at scale 1.
    expect(svg).toContain('translate(-80px, -30px) scale(1)');
  });

  it('scales the diagram into a size it is given', async () => {
    const view = mount({ x: 0, y: 0, zoom: 1 });
    const svg = await exportCanvasToSvg(view.getByTestId('wrap'), { padding: 0, width: 210, height: 1000 });
    expect(size(svg)).toEqual([210, 1000]);
    // 420 units of width into 210: half size.
    expect(svg).toMatch(/scale\(0\.5\)/);
  });

  it('carries the theme set on an ancestor, and the page styles unless told not to', async () => {
    const view = mount();
    const wrap = view.getByTestId('wrap');
    wrap.style.setProperty('--flowinger-surface', '#123456');
    const style = document.createElement('style');
    style.textContent = '.my-node { color: tomato; }';
    document.head.appendChild(style);
    const withStyles = await exportCanvasToSvg(wrap);
    expect(withStyles).toContain('--flowinger-surface: #123456');
    expect(withStyles).toContain('.my-node');
    const without = await exportCanvasToSvg(wrap, { includeStyles: false });
    expect(without).not.toContain('.my-node');
    style.remove();
  });

  it('leaves out what the filter refuses', async () => {
    const view = mount();
    const svg = await exportCanvasToSvg(view.getByTestId('wrap'), {
      filter: (el) => el.getAttribute('data-id') !== 'b',
    });
    expect(svg).toContain('data-id="a"');
    expect(svg).not.toContain('data-id="b"');
  });

  it('says so when there is nothing to export from', async () => {
    await expect(exportCanvasToSvg(null)).rejects.toThrow(/container element is null/);
    await expect(exportCanvasToSvg(document.createElement('div'))).rejects.toThrow(/no canvas/);
  });

  it('rasterises through a data: URL, at the size asked for', async () => {
    const view = mount();
    const svgBlobs: string[] = [];
    // jsdom has no image decoding: stand in for it and look at what the image was given.
    class FakeImage {
      width = 460;
      height = 350;
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      set src(value: string) {
        svgBlobs.push(value);
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const drawn: number[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          scale: () => {},
          fillRect: () => {},
          fillStyle: '',
          drawImage: (_: unknown, x: number, y: number) => drawn.push(x, y),
        }) as never,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
    const url = await exportCanvasToPng(view.getByTestId('wrap'), { pixelRatio: 3 });
    expect(url).toBe('data:image/png;base64,AAAA');
    expect(svgBlobs[0]).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(drawn).toEqual([0, 0]);
  });
});
