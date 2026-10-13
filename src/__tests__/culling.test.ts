import { describe, expect, it, vi } from 'vitest';
import { cullingFeature } from '../features/culling.ts';
import { selectionFeature } from '../features/selection.ts';
import { DEFAULT_ENGINE_OPTIONS, createFlowingerStore, type EngineOptions } from '../store.ts';
import type { Feature } from '../features.ts';
import { Position, type Edge, type Node } from '../types.ts';

const on: EngineOptions = { ...DEFAULT_ENGINE_OPTIONS, elementsSelectable: true, onlyRenderVisibleElements: true };

/** A store that can cull. */
function fresh() {
  const store = createFlowingerStore();
  store.use([cullingFeature, selectionFeature]);
  return store;
}

/** A store on an 800 × 600 pane with culling switched on. */
function culled(nodes: Node[], edges: Edge[] = []) {
  const store = fresh();
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 800 });
  Object.defineProperty(container, 'clientHeight', { value: 600 });
  store.attach(document.createElement('div'), container);
  store.setOptions(on);
  store.setNodes(nodes);
  store.setEdges(edges);
  return store;
}
const box = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  width: 100,
  height: 40,
  data: {},
  ...extra,
});
const ids = (s: ReadonlySet<string> | undefined) => [...(s ?? [])].sort();

describe('the visible set', () => {
  it('is null when culling is off, and while there is no pane to judge by', () => {
    const store = fresh();
    store.setNodes([box('a', 0, 0)]);
    store.setOptions(on);
    expect(store.getVisible()).toBeNull(); // not attached: no size
    const attached = culled([box('a', 0, 0)]);
    attached.setOptions({ ...on, onlyRenderVisibleElements: false });
    expect(attached.getVisible()).toBeNull();
  });

  it('holds the nodes in view, plus a margin of a quarter of the view on every side', () => {
    // The view is 0–800 × 0–600, so the region runs from -200 to 1000 and from -150 to 750.
    const store = culled([
      box('in', 100, 100),
      box('margin', 950, 100), // starts inside the margin
      box('out', 1100, 100),
      box('above', 100, -260), // its bottom, -220, is above the margin
    ]);
    expect(ids(store.getVisible()?.nodes)).toEqual(['in', 'margin']);
  });

  it('counts the view in graph units, at any zoom', () => {
    const store = culled([box('a', 1500, 100), box('b', 5000, 100)]);
    expect(ids(store.getVisible()?.nodes)).toEqual([]);
    void store.instance.setViewport({ x: 0, y: 0, zoom: 0.5 }); // the view is now 1600 × 1200 of graph
    expect(ids(store.getVisible()?.nodes)).toEqual(['a']);
  });

  it('follows a pan', () => {
    const store = culled([box('a', 0, 0), box('b', 5000, 0)]);
    expect(ids(store.getVisible()?.nodes)).toEqual(['a']);
    void store.instance.setViewport({ x: -5000, y: 0, zoom: 1 });
    expect(ids(store.getVisible()?.nodes)).toEqual(['b']);
  });

  it('leaves out hidden nodes and hidden edges', () => {
    const store = culled(
      [box('a', 0, 0), box('h', 10, 10, { hidden: true }), box('b', 300, 0)],
      [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'gone', source: 'a', target: 'b', hidden: true },
      ],
    );
    expect(ids(store.getVisible()?.nodes)).toEqual(['a', 'b']);
    expect(ids(store.getVisible()?.edges)).toEqual(['ab']);
  });

  it('keeps a selected node, wherever it goes', () => {
    const store = culled([box('a', 0, 0), box('b', 5000, 0)]);
    store.api(selectionFeature).selectNode('a');
    void store.instance.setViewport({ x: -5000, y: 0, zoom: 1 });
    expect(ids(store.getVisible()?.nodes)).toEqual(['a', 'b']);
  });

  it('holds an edge for an end in view, or for a span across the view — and nothing else', () => {
    const store = culled(
      [box('a', 0, 0), box('b', 5000, 0), box('c', -3000, 300), box('d', 3000, 300), box('e', -3000, 3000), box('f', -2000, 3000)],
      [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'cd', source: 'c', target: 'd' },
        { id: 'ef', source: 'e', target: 'f' },
      ],
    );
    expect(ids(store.getVisible()?.edges)).toEqual(['ab', 'cd']);
  });

  it('is announced when what is in view changes, and not for a pan that changes nothing', () => {
    const store = culled([box('a', 0, 0), box('b', 5000, 0)]);
    const heard = vi.fn();
    store.subscribeVisible(heard);
    const first = store.getVisible();
    void store.instance.setViewport({ x: -20, y: -10, zoom: 1 });
    void store.instance.setViewport({ x: -40, y: -20, zoom: 1 });
    expect(heard).not.toHaveBeenCalled();
    expect(store.getVisible()).toBe(first); // the same object: a component reading it is not re-rendered
    void store.instance.setViewport({ x: -5000, y: 0, zoom: 1 });
    expect(heard).toHaveBeenCalledTimes(1);
    expect(store.getVisible()).not.toBe(first);
  });

  it('places a nested node by its canvas position', () => {
    const store = culled([box('p', 5000, 0), box('c', -4950, 0, { parentId: 'p' })]);
    // c is at 50 on the canvas — in view — though its own position is far off.
    expect(ids(store.getVisible()?.nodes)).toEqual(['c']);
  });
});

describe('a selection the caller makes', () => {
  it('brings a far-off node into the set when the nodes are handed over again, laid out as before', () => {
    const store = culled([box('near', 0, 0), box('far', 5000, 5000)]);
    store.setCallbacks({ onNodesChange: () => {} }); // controlled: `selected` on the node says
    store.setNodes([box('near', 0, 0), box('far', 5000, 5000)]);
    expect(ids(store.getVisible()?.nodes)).toEqual(['near']);
    // Same ids, positions and sizes: nothing was laid out anew, but a selected node is never left out.
    store.setNodes([box('near', 0, 0), box('far', 5000, 5000, { selected: true })]);
    expect(ids(store.getVisible()?.nodes)).toEqual(['far', 'near']);
    store.setNodes([box('near', 0, 0), box('far', 5000, 5000)]);
    expect(ids(store.getVisible()?.nodes)).toEqual(['near']);
  });
});

describe('what a node coming and going costs', () => {
  it('does not recompute the visible set, or wake `useStore`, when a handle registers or goes', () => {
    // A thousand nodes mounting and unmounting register and unregister two handles each: with the set rebuilt
    // for every one, culling cost more than it saved — and each state read forced a layout.
    const store = culled([box('a', 0, 0)]);
    const changed = vi.fn();
    store.use([{ name: 'count', install: (ctx) => ctx.on('change', changed) }]);
    const known = store.getVisible();
    const woken = vi.fn();
    const redrawn = vi.fn();
    store.subscribeState(woken);
    store.subscribeGeometry(redrawn);
    const offs = Array.from({ length: 20 }, () =>
      store.registerHandle('a', {
        id: null,
        type: 'source',
        position: Position.Right,
        el: document.createElement('div'),
      }),
    );
    for (const off of offs) off();
    // The edges those handles anchor must still be told...
    expect(redrawn).toHaveBeenCalledTimes(40);
    // ...but nothing about the nodes' rectangles, or the state `useStore` reads, changed.
    expect(woken).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(store.getVisible()).toBe(known);
  });

  it('still recomputes the visible set when a node moves', () => {
    const store = culled([box('a', 0, 0)]);
    const woken = vi.fn();
    store.subscribeState(woken);
    store.setNodes([box('a', 5000, 0)]);
    expect(woken).toHaveBeenCalled();
    expect(ids(store.getVisible()?.nodes)).toEqual([]);
  });
});

describe('the order of the visible edges', () => {
  it('is the list’s, and a new order of the same edges is a new set — they are drawn in it', () => {
    const edges: Edge[] = [
      { id: 'one', source: 'a', target: 'b' },
      { id: 'two', source: 'a', target: 'b' },
      { id: 'three', source: 'b', target: 'a' },
    ];
    const store = culled([box('a', 0, 0), box('b', 200, 0)], edges);
    expect([...(store.getVisible()?.edges ?? [])]).toEqual(['one', 'two', 'three']);
    const before = store.getVisible();
    store.setEdges([...edges].reverse());
    expect([...(store.getVisible()?.edges ?? [])]).toEqual(['three', 'two', 'one']);
    expect(store.getVisible()).not.toBe(before);
    // The same list again changes nothing, and says nothing.
    const after = store.getVisible();
    store.setEdges([...edges].reverse());
    expect(store.getVisible()).toBe(after);
  });
});

describe('the visible set, a little at a time', () => {
  /**
   * When a few nodes change — a drag, a measurement, a selection — the set is not worked out from every node
   * again. This holds that to the same answer: after each of a long run of edits, a store that has been given
   * them one by one has the visible set a store given the end state at once has — edges in the list's order.
   */
  for (const controlled of [true, false]) {
    it(`matches a fresh store after each of 300 random edits (${controlled ? 'controlled' : 'uncontrolled'})`, () => {
      let seed = controlled ? 7001 : 7002;
      const random = (n: number) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed % n;
      };
      type Ctx = Parameters<NonNullable<Feature['install']>>[0];
      const make = (nodes: Node[], edges: Edge[]) => {
        const store = culled(nodes, edges);
        let ctx: Ctx | null = null;
        store.use([{ name: 'probe', install: (c) => { ctx = c; return {}; } }]);
        if (controlled) store.setCallbacks({ onNodesChange: () => {}, onEdgesChange: () => {} });
        store.setNodes(nodes);
        store.setEdges(edges);
        return { store, ctx: ctx as unknown as Ctx };
      };
      const view = (store: ReturnType<typeof fresh>) => {
        const v = store.getVisible();
        return v ? { nodes: ids(v.nodes), edges: [...v.edges] } : null;
      };

      let nodes: Node[] = Array.from({ length: 60 }, (_, i) =>
        box(`n${String(i)}`, (i % 10) * 220, Math.floor(i / 10) * 140, i % 7 === 6 ? { parentId: `n${String(i - 6)}` } : {}),
      );
      let edges: Edge[] = Array.from({ length: 70 }, (_, i) => ({
        id: `e${String(i)}`,
        source: `n${String(random(60))}`,
        target: `n${String(random(60))}`,
      }));
      const live = make(nodes, edges);
      const sizes = new Map<string, [number, number]>();
      const dragged = new Map<string, { x: number; y: number }>();
      let viewport = { x: 0, y: 0, zoom: 1 };

      for (let step = 0; step < 300; step++) {
        const at = random(nodes.length);
        const target = nodes[at] as Node;
        const op = random(11);
        if (op <= 2) {
          nodes = nodes.map((n, i) => (i === at ? { ...n, position: { x: random(2200), y: random(1400) } } : n));
          // A node given a new place is no longer where a drag left it.
          dragged.delete(target.id);
          live.store.setNodes(nodes);
        } else if (op === 3 && controlled) {
          nodes = nodes.map((n, i) => (i === at ? { ...n, selected: n.selected !== true } : n));
          live.store.setNodes(nodes);
        } else if (op === 3) {
          live.store.api(selectionFeature).selectNode(target.id, true);
        } else if (op === 4) {
          nodes = nodes.map((n, i) => (i === at ? { ...n, hidden: n.hidden !== true } : n));
          live.store.setNodes(nodes);
        } else if (op === 5) {
          const size: [number, number] = [60 + random(160), 30 + random(80)];
          sizes.set(target.id, size);
          live.store.setSize(target.id, size[0], size[1]);
        } else if (op === 6) {
          viewport = { x: -random(1500), y: -random(900), zoom: [0.5, 1, 1.5][random(3)] as number };
          live.store.instance.setViewport(viewport);
        } else if (op === 7) {
          edges = edges.map((e, i) => (i === random(edges.length) ? { ...e, hidden: e.hidden !== true } : e));
          live.store.setEdges(edges);
        } else if (op === 8) {
          edges = [...edges].reverse();
          live.store.setEdges(edges);
        } else if (op === 9 && !controlled) {
          const position = { x: random(2200), y: random(1400) };
          dragged.set(target.id, position);
          live.ctx.setNodePosition(target, position);
        } else {
          nodes = nodes.map((n, i) => (i === at ? { ...n, data: { step } } : n));
          live.store.setNodes(nodes);
        }

        const twin = make(nodes, edges);
        twin.store.instance.setViewport(viewport);
        for (const [id, [w, h]] of sizes) twin.store.setSize(id, w, h);
        if (!controlled) {
          for (const n of live.ctx.ownSelection.nodes) twin.store.api(selectionFeature).selectNode(n, true);
          for (const [id, position] of dragged) {
            const n = nodes.find((m) => m.id === id);
            if (n) twin.ctx.setNodePosition(n, position);
          }
        }
        // The twin is told once more, so it has judged everything — it is built from parts that do not each say
        // so. The live store is not: what it holds is what its own edit made of it.
        twin.ctx.changed();
        expect(view(live.store), `after step ${String(step)} (op ${String(op)})`).toEqual(view(twin.store));
      }
    });
  }
});
