import { afterEach, describe, expect, it, vi } from 'vitest';
import { allFeatures, selectionFeature } from '../features/index.ts';
import { DEFAULT_ENGINE_OPTIONS, createFlowingerStore } from '../store.ts';
import {
  getNodesBounds,
  isRectIntersecting,
  viewportForBounds,
} from '../geometry.ts';
import type { Feature } from '../features.ts';
import type { Edge, EdgeChange, Node, NodeChange } from '../types.ts';

/** A store attached to detached elements, the pane sized and placed as given. */
function mounted(width = 800, height = 600, left = 0, top = 0) {
  const store = createFlowingerStore();
  store.use(allFeatures);
  const viewport = document.createElement('div');
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: width });
  Object.defineProperty(container, 'clientHeight', { value: height });
  container.getBoundingClientRect = () =>
    ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
  store.attach(viewport, container);
  return { store, viewport, container };
}

const node = (id: string, x: number, y: number, w = 100, h = 40): Node => ({
  id,
  position: { x, y },
  width: w,
  height: h,
  data: {},
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('viewport calls resolve', () => {
  it('true straight away for an instant move', async () => {
    const { store } = mounted();
    await expect(store.instance.setViewport({ x: 5, y: 5, zoom: 1 })).resolves.toBe(true);
  });

  it('true when an animated move lands, false when a later one interrupts it', async () => {
    vi.useFakeTimers();
    const { store } = mounted();
    const first = store.instance.setViewport({ x: 100, y: 0, zoom: 1 }, { duration: 100 });
    const second = store.instance.setViewport({ x: 0, y: 100, zoom: 1 }, { duration: 100 });
    await vi.advanceTimersByTimeAsync(400);
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
    expect(store.getViewport()).toEqual({ x: 0, y: 100, zoom: 1 });
  });

  it('false for a zoom that changes nothing', async () => {
    const { store } = mounted();
    store.setBounds(0.5, 2);
    store.instance.setViewport({ x: 0, y: 0, zoom: 2 });
    await expect(store.instance.zoomIn()).resolves.toBe(false);
  });
});

describe('zoomTo and setCenter', () => {
  it('zooms to a level about the middle of the pane', () => {
    const { store } = mounted(800, 600);
    void store.instance.zoomTo(2);
    // The graph point at the pane's centre (400, 300) stays there.
    expect(store.getViewport()).toEqual({ x: -400, y: -300, zoom: 2 });
    expect(store.instance.getZoom()).toBe(2);
  });

  it('puts a graph point in the middle, at the current zoom or a given one', () => {
    const { store } = mounted(800, 600);
    void store.instance.setCenter(100, 50);
    expect(store.getViewport()).toEqual({ x: 300, y: 250, zoom: 1 });
    void store.instance.setCenter(100, 50, { zoom: 2 });
    expect(store.getViewport()).toEqual({ x: 200, y: 200, zoom: 2 });
  });

  it('does nothing, and says so, before a canvas is attached', async () => {
    const store = createFlowingerStore();
    await expect(store.instance.setCenter(1, 1)).resolves.toBe(false);
    await expect(store.instance.fitView()).resolves.toBe(false);
  });
});

describe('fitView and fitBounds', () => {
  const nodes = [node('a', 0, 0, 100, 50), node('b', 100, 0, 100, 50)]; // 200 × 50 at the origin

  it('keeps its 40 px margin by default', () => {
    const { store } = mounted(800, 600);
    store.setBounds(0.1, 10);
    store.setNodes(nodes);
    void store.instance.fitView();
    expect(store.getViewport().zoom).toBeCloseTo((800 - 80) / 200);
  });

  it('takes a padding ratio as React Flow does, in whole pixels a side', () => {
    const { store } = mounted(800, 600);
    store.setBounds(0.1, 10);
    store.setNodes(nodes);
    void store.instance.fitView({ padding: 0.1 });
    // React Flow 12's arithmetic: floor((800 - 800 / 1.1) / 2) = 36 px a side, so 728 px for 200 of graph.
    const zoom = (800 - 2 * 36) / 200;
    const vp = store.getViewport();
    expect(vp.zoom).toBeCloseTo(zoom);
    expect(vp.x).toBeCloseTo(400 - 100 * zoom); // centred on the bounds' middle
    expect(vp.y).toBeCloseTo(300 - 25 * zoom);
  });

  it('fits only the nodes asked for, and leaves out hidden ones unless told otherwise', () => {
    const { store } = mounted(800, 600);
    store.setBounds(0.1, 10);
    store.setNodes([node('a', 0, 0), node('b', 1000, 0), { ...node('c', 5000, 0), hidden: true }]);
    void store.instance.fitView({ nodes: [{ id: 'a' }], padding: 0 });
    expect(store.getViewport().zoom).toBeCloseTo(8); // 800 / 100
    void store.instance.fitView({ padding: 0 });
    expect(store.getViewport().zoom).toBeCloseTo(800 / 1100);
    void store.instance.fitView({ padding: 0, includeHiddenNodes: true });
    expect(store.getViewport().zoom).toBeCloseTo(800 / 5100);
  });

  it('respects its own zoom limits', () => {
    const { store } = mounted(800, 600);
    store.setBounds(0.1, 10);
    store.setNodes([node('a', 0, 0, 10, 10)]);
    void store.instance.fitView({ maxZoom: 3 });
    expect(store.getViewport().zoom).toBe(3);
  });

  it('shows an arbitrary rectangle', () => {
    const { store } = mounted(800, 600);
    store.setBounds(0.1, 10);
    void store.instance.fitBounds({ x: 100, y: 100, width: 400, height: 300 }, { padding: 0 });
    expect(store.getViewport()).toEqual({ x: -100 * 2 + 0, y: -100 * 2 + 0, zoom: 2 });
  });

  it('is a no-op for an empty diagram', async () => {
    const { store } = mounted();
    await expect(store.instance.fitView()).resolves.toBe(false);
  });
});

describe('viewportForBounds', () => {
  it('centres the bounds and clamps the zoom', () => {
    expect(viewportForBounds({ x: 0, y: 0, width: 100, height: 100 }, 400, 400, 0.5, 2, 0)).toEqual({
      x: 100,
      y: 100,
      zoom: 2,
    });
  });
});

describe('screen and graph coordinates', () => {
  it('converts both ways through the pane’s place on the page and the viewport', () => {
    const { store } = mounted(800, 600, 100, 50);
    store.instance.setViewport({ x: 20, y: 10, zoom: 2 });
    expect(store.instance.screenToFlowPosition({ x: 300, y: 250 })).toEqual({ x: 90, y: 95 });
    expect(store.instance.flowToScreenPosition({ x: 90, y: 95 })).toEqual({ x: 300, y: 250 });
  });

  it('snaps to the grid on request — and only when there is one', () => {
    const { store } = mounted(800, 600, 0, 0);
    store.setOptions({ ...DEFAULT_ENGINE_OPTIONS, snapGrid: [20, 20] });
    expect(store.instance.screenToFlowPosition({ x: 33, y: 47 }, { snapToGrid: true })).toEqual({ x: 40, y: 40 });
    expect(store.instance.screenToFlowPosition({ x: 33, y: 47 })).toEqual({ x: 33, y: 47 });
    store.setOptions({ ...DEFAULT_ENGINE_OPTIONS, snapGrid: null });
    expect(store.instance.screenToFlowPosition({ x: 33, y: 47 }, { snapToGrid: true })).toEqual({ x: 33, y: 47 });
  });
});

describe('reading the graph', () => {
  it('reports a dragged position, a measured size and the selection', () => {
    const { store } = mounted();
    const a = node('a', 10, 20);
    store.setNodes([a, node('b', 200, 0)]);
    store.setEdges([{ id: 'e', source: 'a', target: 'b' }]);
    store.setNodePosition(a, { x: 50, y: 60 });
    store.setSize('a', 120, 30);
    store.api(selectionFeature).selectNode('a');
    const got = store.instance.getNode('a');
    expect(got).toMatchObject({ id: 'a', position: { x: 50, y: 60 }, selected: true, measured: { width: 120, height: 30 } });
    expect(store.instance.getNodes().map((n) => n.id)).toEqual(['a', 'b']);
    expect(store.instance.getNode('b')).toBe(store.getNodes()[1]); // untouched nodes are the given objects
    expect(store.instance.getNode('nope')).toBeUndefined();
    expect(store.instance.getEdge('e')).toMatchObject({ source: 'a' });
    expect(store.instance.getEdges()).toHaveLength(1);
    expect(store.instance.toObject()).toMatchObject({ viewport: { zoom: 1 } });
    expect(store.instance.toObject().nodes).toHaveLength(2);
  });

  it('measures the bounds of nodes or ids, at their current positions', () => {
    const { store } = mounted();
    const a = node('a', 0, 0, 100, 50);
    store.setNodes([a, node('b', 300, 200, 100, 50)]);
    store.setNodePosition(a, { x: 50, y: 0 });
    expect(store.instance.getNodesBounds(['a', 'b'])).toEqual({ x: 50, y: 0, width: 350, height: 250 });
    expect(getNodesBounds([node('c', 10, 10, 20, 20), node('d', 40, 0, 10, 10)])).toEqual({
      x: 10,
      y: 0,
      width: 40,
      height: 30,
    });
    expect(getNodesBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('intersection', () => {
  const setup = () => {
    const { store } = mounted();
    store.setNodes([node('a', 0, 0), node('b', 50, 20), node('c', 300, 300), node('d', 10, 5, 20, 10)]);
    return store;
  };

  it('finds the nodes overlapping a node — never the node itself', () => {
    const store = setup();
    expect(store.instance.getIntersectingNodes({ id: 'a' }).map((n) => n.id)).toEqual(['b', 'd']);
    expect(store.instance.getIntersectingNodes({ id: 'c' })).toEqual([]);
  });

  it('with `partially` off, wants the other wholly inside', () => {
    const store = setup();
    expect(store.instance.getIntersectingNodes({ id: 'a' }, false).map((n) => n.id)).toEqual(['d']);
  });

  it('takes a rectangle, and a list to search', () => {
    const store = setup();
    expect(store.instance.getIntersectingNodes({ x: 290, y: 290, width: 50, height: 50 }).map((n) => n.id)).toEqual(['c']);
    const only = store.instance.getNodes().filter((n) => n.id === 'b');
    expect(store.instance.getIntersectingNodes({ id: 'a' }, true, only).map((n) => n.id)).toEqual(['b']);
  });

  it('tests one node against an area; touching edges do not count', () => {
    const store = setup();
    expect(store.instance.isNodeIntersecting({ id: 'b' }, { x: 0, y: 0, width: 60, height: 30 })).toBe(true);
    expect(store.instance.isNodeIntersecting({ id: 'c' }, { x: 0, y: 0, width: 60, height: 30 })).toBe(false);
    expect(isRectIntersecting({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
    expect(store.instance.isNodeIntersecting({ id: 'missing' }, { x: 0, y: 0, width: 1, height: 1 })).toBe(false);
  });
});

describe('editing the graph reports changes', () => {
  function controlled() {
    const { store } = mounted();
    const nodeChanges: NodeChange[] = [];
    const edgeChanges: EdgeChange[] = [];
    store.setCallbacks({
      onNodesChange: (c) => nodeChanges.push(...c),
      onEdgesChange: (c) => edgeChanges.push(...c),
    });
    const a = node('a', 0, 0);
    const b = node('b', 100, 0);
    store.setNodes([a, b]);
    store.setEdges([{ id: 'e', source: 'a', target: 'b' }]);
    return { store, nodeChanges, edgeChanges, a, b };
  }

  it('setNodes with a function: replaces what changed, removes what is gone, adds what is new', () => {
    const { store, nodeChanges, a } = controlled();
    store.instance.setNodes((ns) => [
      ...ns.filter((n) => n.id === 'a').map((n) => ({ ...n, data: { hi: true } })),
      node('z', 5, 5),
    ]);
    expect(nodeChanges).toEqual([
      { type: 'replace', id: 'a', item: { ...a, data: { hi: true } } },
      { type: 'remove', id: 'b' },
      { type: 'add', item: node('z', 5, 5) },
    ]);
  });

  it('says nothing about a node the new list left as it was', () => {
    const { store, nodeChanges } = controlled();
    store.instance.setNodes((ns) => ns);
    expect(nodeChanges).toEqual([]);
  });

  it('adds nodes and edges, one or several', () => {
    const { store, nodeChanges, edgeChanges } = controlled();
    store.instance.addNodes(node('n', 0, 0));
    store.instance.addNodes([node('m', 0, 0), node('o', 0, 0)]);
    expect(nodeChanges.map((c) => c.type)).toEqual(['add', 'add', 'add']);
    store.instance.addEdges({ id: 'x', source: 'a', target: 'b' });
    expect(edgeChanges).toEqual([{ type: 'add', item: { id: 'x', source: 'a', target: 'b' } }]);
  });

  it('setEdges works the same way', () => {
    const { store, edgeChanges } = controlled();
    store.instance.setEdges([{ id: 'e2', source: 'b', target: 'a' }]);
    expect(edgeChanges).toEqual([
      { type: 'remove', id: 'e' },
      { type: 'add', item: { id: 'e2', source: 'b', target: 'a' } },
    ]);
  });

  it('updates a node by merging, by function, or by replacing outright', () => {
    const { store, nodeChanges } = controlled();
    store.instance.updateNode('a', { className: 'hot' });
    store.instance.updateNode('a', (n) => ({ position: { x: n.position.x + 1, y: 0 } }));
    store.instance.updateNode('b', { id: 'b', position: { x: 9, y: 9 }, data: {} }, { replace: true });
    expect(nodeChanges[0]).toMatchObject({ type: 'replace', id: 'a', item: { className: 'hot', width: 100 } });
    expect(nodeChanges[1]).toMatchObject({ item: { position: { x: 1, y: 0 } } });
    expect(nodeChanges[2]).toEqual({ type: 'replace', id: 'b', item: { id: 'b', position: { x: 9, y: 9 }, data: {} } });
    store.instance.updateNode('nope', { className: 'x' }); // no such node: nothing
    expect(nodeChanges).toHaveLength(3);
  });

  it('updates node data by merging or replacing', () => {
    const { store, nodeChanges } = controlled();
    store.instance.updateNodeData('a', { label: 'x' });
    store.instance.updateNodeData('a', { only: 1 }, { replace: true });
    store.instance.updateNodeData('a', (n) => ({ count: Object.keys(n.data).length }));
    expect(nodeChanges.map((c) => (c as { item: Node }).item.data)).toEqual([{ label: 'x' }, { only: 1 }, { count: 0 }]);
  });

  it('updates an edge', () => {
    const { store, edgeChanges } = controlled();
    store.instance.updateEdge('e', { animated: true });
    expect(edgeChanges).toEqual([
      { type: 'replace', id: 'e', item: { id: 'e', source: 'a', target: 'b', animated: true } },
    ]);
  });

  it('does nothing — quietly — where nobody is listening', () => {
    const { store } = mounted();
    store.setNodes([node('a', 0, 0)]);
    expect(() => {
      store.instance.setNodes([]);
      store.instance.addNodes(node('x', 0, 0));
      store.instance.updateNode('a', { className: 'x' });
    }).not.toThrow();
  });
});

describe('useStore’s snapshot', () => {
  it('is one object until something it reads changes', () => {
    const { store } = mounted(800, 600);
    const s1 = store.getState();
    expect(store.getState()).toBe(s1);
    store.instance.setViewport({ x: 4, y: 5, zoom: 1.5 });
    const s2 = store.getState();
    expect(s2).not.toBe(s1);
    expect(s2.transform).toEqual([4, 5, 1.5]);
    expect(s2).toMatchObject({ width: 800, height: 600, minZoom: 0.05, maxZoom: 2, isReady: true });
    expect(s2.panZoom).toBe(store.instance);
  });

  it('carries the nodes, the edges, and whether all are measured — and announces each change', () => {
    const { store } = mounted();
    const heard = vi.fn();
    store.subscribeState(heard);
    store.setNodes([node('a', 0, 0)]);
    store.setEdges([{ id: 'e', source: 'a', target: 'a' } as Edge]);
    expect(store.getState().nodes).toHaveLength(1);
    expect(store.getState().edges).toHaveLength(1);
    expect(store.getState().nodesInitialized).toBe(false);
    store.setSize('a', 10, 10);
    expect(store.getState().nodesInitialized).toBe(true);
    expect(heard).toHaveBeenCalled();
  });
});

describe('what is asked after every change, answered without a scan', () => {
  it('knows when every node is measured as nodes arrive, are measured, are hidden and go', () => {
    const { store } = mounted();
    const initialized = () => store.areNodesInitialized();
    expect(initialized()).toBe(false); // an empty diagram is not "initialized"

    store.setNodes([node('a', 0, 0), node('b', 0, 100)]);
    expect(initialized()).toBe(false);
    store.setSize('a', 10, 10);
    expect(initialized()).toBe(false);
    store.setSize('b', 10, 10);
    expect(initialized()).toBe(true);

    // Measuring again — the same size, or a new one — is not a second node measured.
    store.setSize('a', 10, 10);
    store.setSize('a', 20, 20);
    store.setNodes([node('a', 0, 0), node('b', 0, 100), node('c', 0, 200)]);
    expect(initialized()).toBe(false);
    // A hidden node is not waited for: it is not drawn, so it will not be measured.
    store.setNodes([node('a', 0, 0), node('b', 0, 100), { ...node('c', 0, 200), hidden: true }]);
    expect(initialized()).toBe(true);
    store.setNodes([node('a', 0, 0), node('b', 0, 100), node('c', 0, 200)]);
    expect(initialized()).toBe(false);
    store.setSize('c', 10, 10);
    expect(initialized()).toBe(true);

    // A node that goes takes its size with it: back, it has to be measured again.
    store.setNodes([node('a', 0, 0), node('c', 0, 200)]);
    expect(initialized()).toBe(true);
    store.setNodes([node('a', 0, 0), node('b', 0, 100), node('c', 0, 200)]);
    expect(initialized()).toBe(false);
    store.setSize('b', 10, 10);
    expect(initialized()).toBe(true);

    // A size that arrives before its node counts when the node does.
    store.setSize('late', 10, 10);
    store.setNodes([node('a', 0, 0), node('b', 0, 100), node('c', 0, 200), node('late', 0, 300)]);
    expect(initialized()).toBe(true);
    // And a zero size is no size.
    store.setSize('zero', 0, 0);
    store.setNodes([node('a', 0, 0), node('zero', 0, 400)]);
    expect(initialized()).toBe(false);
  });

  it('reports the selection of a controlled flow from the elements, and none when none says so', () => {
    const { store } = mounted();
    store.setCallbacks({ onNodesChange: () => {}, onEdgesChange: () => {} });
    store.setNodes([node('a', 0, 0), { ...node('b', 0, 100), selected: true }]);
    store.setEdges([{ id: 'e', source: 'a', target: 'b', selected: true } as Edge]);
    expect(store.getSelection().nodes.map((n) => n.id)).toEqual(['b']);
    expect(store.getSelection().edges.map((e) => e.id)).toEqual(['e']);
    expect(store.hasSelection()).toBe(true);

    store.setNodes([node('a', 0, 0), node('b', 0, 100)]);
    store.setEdges([{ id: 'e', source: 'a', target: 'b' } as Edge]);
    expect(store.getSelection()).toEqual({ nodes: [], edges: [] });
    expect(store.hasSelection()).toBe(false);

    // And it is found again.
    store.setNodes([{ ...node('a', 0, 0), selected: true }, node('b', 0, 100)]);
    expect(store.getSelection().nodes.map((n) => n.id)).toEqual(['a']);
    expect(store.hasSelection()).toBe(true);
  });

  it('reports the selection of an uncontrolled flow from its own set', () => {
    const { store } = mounted();
    store.setNodes([node('a', 0, 0), node('b', 0, 100)]);
    expect(store.hasSelection()).toBe(false);
    store.api(selectionFeature).selectNode('b');
    expect(store.getSelection().nodes.map((n) => n.id)).toEqual(['b']);
    // A node that goes takes its selection with it.
    store.setNodes([node('a', 0, 0)]);
    expect(store.hasSelection()).toBe(false);
  });
});

describe('a list given with a few nodes replaced', () => {
  /**
   * `setNodes` does less work for a list that is the last one with some nodes replaced — a drag, a selection —
   * than for one that is new. This holds it to the same result: a store that is given a long run of such edits
   * (and of the others, which take the long way) ends up as a store that is given the last list at once.
   */
  it('leaves the store as the whole list given at once would', () => {
    let seed = 20261013;
    const random = (n: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % n;
    };
    const probeOf = (store: ReturnType<typeof mounted>['store']) => {
      let ctx: Parameters<NonNullable<Feature['install']>>[0] | null = null;
      store.use([
        {
          name: 'probe',
          install(c) {
            ctx = c;
            return {};
          },
        },
      ]);
      if (!ctx) throw new Error('not installed');
      return ctx as Parameters<NonNullable<Feature['install']>>[0];
    };
    const observe = (store: ReturnType<typeof mounted>['store'], ctx: ReturnType<typeof probeOf>) => ({
      initialized: store.areNodesInitialized(),
      selected: store.getSelection().nodes.map((n) => n.id),
      hasSelection: store.hasSelection(),
      positions: Object.fromEntries(
        store.getNodes().map((n) => [n.id, store.instance.getInternalNode(n.id)?.internals.positionAbsolute]),
      ),
      children: Object.fromEntries([...ctx.childrenOf].map(([k, v]) => [k, [...v].sort()])),
      lookup: [...ctx.nodeById.keys()].sort(),
    });

    const live = mounted();
    live.store.setCallbacks({ onNodesChange: () => {}, onEdgesChange: () => {} });
    const liveCtx = probeOf(live.store);

    let nodes: Node[] = Array.from({ length: 24 }, (_, i) => ({
      ...node(`n${String(i)}`, (i % 6) * 120, Math.floor(i / 6) * 80),
      ...(i % 5 === 4 ? { parentId: `n${String(i - 4)}` } : {}),
    }));
    const measured = new Set<string>();
    let nextId = 100;

    for (let step = 0; step < 300; step++) {
      const at = random(nodes.length);
      const target = nodes[at] as Node;
      const op = random(16);
      let next = nodes;
      if (op <= 4) {
        next = nodes.map((n, i) => (i === at ? { ...n, position: { x: random(900), y: random(500) } } : n));
      } else if (op === 5 || op === 6) {
        next = nodes.map((n, i) => (i === at ? { ...n, selected: n.selected !== true } : n));
      } else if (op === 7) {
        next = nodes.map((n, i) => (i === at ? { ...n, hidden: n.hidden !== true } : n));
      } else if (op === 8) {
        next = nodes.map((n, i) => (i === at ? { ...n, data: { step } } : n));
      } else if (op === 9 && at > 0) {
        // Reparent to an earlier node (so no loops), or to nothing.
        const { parentId: _gone, ...rest } = target;
        next = nodes.map((n, i) =>
          i === at ? (random(2) === 0 ? rest : { ...rest, parentId: (nodes[random(at)] as Node).id }) : n,
        );
      } else if (op === 10) {
        next = [...nodes, node(`n${String(nextId++)}`, random(900), random(500))];
      } else if (op === 11 && nodes.length > 8) {
        next = nodes.filter((_, i) => i !== at);
        const kept = new Set(next.map((n) => n.id));
        for (const id of [...measured]) if (!kept.has(id)) measured.delete(id);
      } else if (op === 12 && nodes.length > 2) {
        next = [...nodes];
        const other = random(nodes.length);
        [next[at], next[other]] = [next[other] as Node, next[at] as Node];
      } else if (op === 13) {
        const id = target.id;
        live.store.setSize(id, 50 + random(60), 30 + random(30));
        measured.add(id);
      } else if (op >= 14) {
        // Let go of everything: what a click on the empty pane does — several nodes replaced at once.
        next = nodes.map((n) => (n.selected === true ? { ...n, selected: false } : n));
      }
      nodes = next;
      live.store.setNodes(nodes);
      // Ids that have gone have lost their size, as they would on any store.
      for (const id of [...measured]) if (!nodes.some((n) => n.id === id)) measured.delete(id);

      {
        const fresh = mounted();
        fresh.store.setCallbacks({ onNodesChange: () => {}, onEdgesChange: () => {} });
        const freshCtx = probeOf(fresh.store);
        fresh.store.setNodes(nodes);
        // The sizes `live` holds, as the same measurements.
        for (const id of measured) {
          const size = live.store.instance.getInternalNode(id)?.measured;
          if (size?.width && size.height) fresh.store.setSize(id, size.width, size.height);
        }
        fresh.store.setNodes(nodes);
        expect(observe(live.store, liveCtx), `after step ${String(step)}`).toEqual(observe(fresh.store, freshCtx));
      }
    }
  }, 30_000);
});
