import { describe, expect, it, vi } from 'vitest';
import { cullingFeature } from '../features/culling.ts';
import { selectionFeature } from '../features/selection.ts';
import { DEFAULT_ENGINE_OPTIONS, createFlowingerStore, type EngineOptions } from '../store.ts';
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
