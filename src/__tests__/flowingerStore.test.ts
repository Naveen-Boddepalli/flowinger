import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectionFeature } from '../features/selection.ts';
import { createFlowingerStore, viewportTransform } from '../store.ts';
import type { Node } from '../types.ts';

/** A store attached to detached elements, the container sized as given. */
function mounted(width = 800, height = 600) {
  const store = createFlowingerStore();
  const viewport = document.createElement('div');
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: width });
  Object.defineProperty(container, 'clientHeight', { value: height });
  store.attach(viewport, container);
  return { store, viewport, container };
}

const node = (id: string, x: number, y: number, size?: { width: number; height: number }): Node => ({
  id,
  position: { x, y },
  data: {},
  ...size,
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('flowinger store — viewport', () => {
  it('writes the transform in a stable, matchable format', () => {
    expect(viewportTransform({ x: 0, y: 0, zoom: 1 })).toBe('translate(0px, 0px) scale(1)');
    const { store, viewport } = mounted();
    store.instance.setViewport({ x: 12, y: -8, zoom: 1.5 });
    expect(viewport.style.transform).toBe('translate(12px, -8px) scale(1.5)');
  });

  it('gives a remounted canvas the viewport it left', () => {
    const { store, viewport } = mounted();
    store.instance.setViewport({ x: 5, y: 6, zoom: 0.5 });
    store.detach();
    const next = document.createElement('div');
    store.attach(next, viewport);
    expect(next.style.transform).toBe('translate(5px, 6px) scale(0.5)');
  });

  it('clamps zoom to the bounds', () => {
    const { store } = mounted();
    store.setBounds(0.5, 2);
    store.instance.setViewport({ x: 0, y: 0, zoom: 10 });
    expect(store.getViewport().zoom).toBe(2);
    store.instance.setViewport({ x: 0, y: 0, zoom: 0.01 });
    expect(store.getViewport().zoom).toBe(0.5);
  });

  it('keeps the anchor point fixed when zooming about it', () => {
    const { store } = mounted();
    store.instance.setViewport({ x: 30, y: 10, zoom: 1 });
    const world = (v: { x: number; y: number; zoom: number }) => ({
      x: (200 - v.x) / v.zoom,
      y: (150 - v.y) / v.zoom,
    });
    const before = world(store.getViewport());
    store.zoomAt(1.6, 200, 150);
    const after = world(store.getViewport());
    expect(store.getViewport().zoom).toBeCloseTo(1.6);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('zooms the buttons about the container centre, and stops at the limit', () => {
    const { store } = mounted(800, 600);
    store.setBounds(0.5, 1.25);
    store.instance.zoomIn();
    expect(store.getViewport().zoom).toBe(1.25);
    expect(store.getViewport()).toEqual({ x: -100, y: -75, zoom: 1.25 });
    const at = store.getViewport();
    store.instance.zoomIn();
    expect(store.getViewport()).toBe(at); // already at max: no change, no new object
  });

  it('notifies subscribers, and stops after unsubscribe', () => {
    const { store } = mounted();
    const listener = vi.fn();
    const off = store.subscribeViewport(listener);
    store.instance.setViewport({ x: 1, y: 1, zoom: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    store.instance.setViewport({ x: 2, y: 2, zoom: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('flowinger store — animated moves', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('runs on the real environment: a visible document', () => {
    // Every test below assumes a tween is allowed; a hidden document snaps.
    expect(document.hidden).toBe(false);
  });

  it('tweens to the target, with the DOM and getViewport agreeing all the way', () => {
    const { store, viewport } = mounted();
    store.instance.setViewport({ x: 100, y: 0, zoom: 1 }, { duration: 200 });
    expect(store.getViewport().x).toBe(0); // not yet moved

    vi.advanceTimersByTime(100);
    const mid = store.getViewport().x;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    expect(viewport.style.transform).toBe(viewportTransform(store.getViewport()));

    vi.advanceTimersByTime(200);
    expect(store.getViewport()).toEqual({ x: 100, y: 0, zoom: 1 });
  });

  it('lets a later move cancel one in flight', () => {
    const { store } = mounted();
    store.instance.setViewport({ x: 100, y: 0, zoom: 1 }, { duration: 200 });
    vi.advanceTimersByTime(50);
    store.instance.setViewport({ x: -40, y: 0, zoom: 1 });
    vi.advanceTimersByTime(500);
    expect(store.getViewport().x).toBe(-40);
  });

  it('compounds rapid zoom presses off the requested target, not the mid-tween value', () => {
    const { store } = mounted();
    store.instance.zoomIn({ duration: 200 });
    vi.advanceTimersByTime(20);
    store.instance.zoomIn({ duration: 200 });
    vi.advanceTimersByTime(500);
    expect(store.getViewport().zoom).toBeCloseTo(1.25 * 1.25);
  });

  it('snaps in a hidden tab, where requestAnimationFrame never fires', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const { store } = mounted();
    store.instance.setViewport({ x: 100, y: 0, zoom: 1 }, { duration: 200 });
    expect(store.getViewport().x).toBe(100);
  });

  it('lands the move by timer if frames stop arriving part-way', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const { store } = mounted();
    store.instance.setViewport({ x: 100, y: 0, zoom: 1 }, { duration: 200 });
    expect(store.getViewport().x).toBe(0);
    vi.advanceTimersByTime(400);
    expect(store.getViewport().x).toBe(100);
  });

  it('snaps when the viewer prefers reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const { store } = mounted();
    store.instance.setViewport({ x: 100, y: 0, zoom: 1 }, { duration: 200 });
    expect(store.getViewport().x).toBe(100);
  });
});

describe('flowinger store — mount state', () => {
  it('reports no panZoom until a canvas attaches, and one stable instance after', () => {
    const store = createFlowingerStore();
    expect(store.getState()).toMatchObject({ panZoom: null, isReady: false });

    const el = document.createElement('div');
    store.attach(el, el);
    const first = store.getState().panZoom;
    expect(first).toBe(store.instance);

    store.detach();
    expect(store.getState().panZoom).toBeNull();
    store.attach(el, el);
    // The identity a dependent effect keys on must survive a remount.
    expect(store.getState().panZoom).toBe(first);
  });
});

describe('flowinger store — node geometry', () => {
  it('resolves a dragged position only while the prop position it started from stands', () => {
    const { store } = mounted();
    const a = node('a', 10, 20);
    store.setNodes([a]);
    store.setNodePosition(a, { x: 50, y: 60 });
    expect(store.resolvePosition('a', a.position)).toEqual({ x: 50, y: 60 });

    // The parent lays the node out somewhere new: that layout wins.
    expect(store.resolvePosition('a', { x: 200, y: 200 })).toEqual({ x: 200, y: 200 });
  });

  it('drops drags and sizes for nodes that go away or are re-laid-out', () => {
    const { store } = mounted();
    const a = node('a', 0, 0);
    const b = node('b', 0, 0);
    store.setNodes([a, b]);
    store.setNodePosition(a, { x: 9, y: 9 });
    store.setNodePosition(b, { x: 8, y: 8 });
    store.setSize('a', 100, 40);

    store.setNodes([node('b', 5, 5)]); // a is gone; b moved under us
    expect(store.getNodeSize(a)).toEqual({ width: 150, height: 40 }); // back to the fallback
    expect(store.resolvePosition('b', { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
    store.setNodes([node('b', 0, 0)]);
    expect(store.resolvePosition('b', { x: 0, y: 0 })).toEqual({ x: 0, y: 0 }); // drag did not resurrect
  });

  it('tells a node about its own move and nobody else', () => {
    const { store } = mounted();
    const a = node('a', 0, 0);
    const b = node('b', 0, 0);
    store.setNodes([a, b]);
    const onA = vi.fn();
    const onB = vi.fn();
    const offA = store.subscribeNode('a', onA);
    const offB = store.subscribeNode('b', onB);

    store.setNodePosition(a, { x: 1, y: 1 });
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).not.toHaveBeenCalled();
    offA();
    offB();
  });

  it('bumps the geometry version on a real change only, and ignores an unmeasurable size', () => {
    const { store } = mounted();
    const v0 = store.getGeometryVersion();
    store.setSize('a', 0, 0); // jsdom, display:none
    expect(store.getGeometryVersion()).toBe(v0);
    store.setSize('a', 100, 40);
    expect(store.getGeometryVersion()).toBe(v0 + 1);
    store.setSize('a', 100, 40); // same again: nothing to redraw
    expect(store.getGeometryVersion()).toBe(v0 + 1);
  });

  it('prefers a measured size, then the declared one, then the fallback', () => {
    const { store } = mounted();
    const declared = node('d', 0, 0, { width: 80, height: 30 });
    const bare = node('x', 0, 0);
    expect(store.getNodeSize(declared)).toEqual({ width: 80, height: 30 });
    expect(store.getNodeSize(bare)).toEqual({ width: 150, height: 40 });
    store.setSize('d', 90, 35);
    expect(store.getNodeSize(declared)).toEqual({ width: 90, height: 35 });
  });
});

describe('flowinger store — fitView', () => {
  it('frames every node, from the positions it holds rather than from any provider prop', () => {
    const { store } = mounted(800, 600);
    store.setNodes([
      node('a', 0, 0, { width: 100, height: 50 }),
      node('b', 300, 150, { width: 100, height: 50 }),
    ]);
    store.instance.fitView();
    // Bounds are 400 × 200; (800 − 80) / 400 = 1.8 is the tighter fit.
    const vp = store.getViewport();
    expect(vp.zoom).toBeCloseTo(1.8);
    expect(vp.x).toBeCloseTo(40);
    expect(vp.y).toBeCloseTo(120);
  });

  it('follows a dragged node', () => {
    const { store } = mounted(800, 600);
    const a = node('a', 0, 0, { width: 100, height: 50 });
    store.setNodes([a]);
    store.setNodePosition(a, { x: 1000, y: 0 });
    store.instance.fitView();
    const vp = store.getViewport();
    // The single node now centres at x = 1050, whatever the zoom.
    expect(vp.x + 1050 * vp.zoom).toBeCloseTo(400);
  });

  it('does nothing with no nodes, or a container that has not been laid out', () => {
    const empty = mounted();
    const before = empty.store.getViewport();
    empty.store.instance.fitView();
    expect(empty.store.getViewport()).toBe(before);

    const flat = mounted(0, 0);
    flat.store.setNodes([node('a', 0, 0)]);
    const at = flat.store.getViewport();
    flat.store.instance.fitView();
    expect(flat.store.getViewport()).toBe(at);
  });
});

describe('flowinger store — handle registry', () => {
  const handleEl = () => document.createElement('div');
  const reg = (id: string | null, type: 'source' | 'target', el = handleEl()) => ({
    id,
    type,
    position: type === 'source' ? ('bottom' as const) : ('top' as const),
    el,
  });

  it('finds a handle by id and type, or the first of a type when no id is given', () => {
    const { store } = mounted();
    store.registerHandle('n', reg('out', 'source'));
    store.registerHandle('n', reg('alt', 'source'));
    store.registerHandle('n', reg('in', 'target'));

    expect(store.findHandle('n', 'alt', 'source')?.id).toBe('alt');
    expect(store.findHandle('n', undefined, 'source')?.id).toBe('out'); // first registered
    expect(store.findHandle('n', null, 'target')?.id).toBe('in');
    // Right id, wrong type — and an id nobody registered — both find nothing.
    expect(store.findHandle('n', 'in', 'source')).toBeUndefined();
    expect(store.findHandle('n', 'nope', 'source')).toBeUndefined();
    expect(store.findHandle('other-node', 'out', 'source')).toBeUndefined();
  });

  it('forgets a handle on unregister, and tells the edge layer both times', () => {
    const { store } = mounted();
    const v0 = store.getGeometryVersion();
    const off = store.registerHandle('n', reg('out', 'source'));
    expect(store.getGeometryVersion()).toBeGreaterThan(v0);

    const v1 = store.getGeometryVersion();
    off();
    expect(store.findHandle('n', 'out', 'source')).toBeUndefined();
    expect(store.getGeometryVersion()).toBeGreaterThan(v1);
  });

  it('measures an anchor relative to the node, and only bumps geometry when it moves', () => {
    const { store } = mounted();
    const nodeEl = document.createElement('div');
    Object.defineProperty(nodeEl, 'offsetWidth', { value: 100 });
    const rectOf = (l: number, t: number, w: number, h: number) =>
      ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h } as DOMRect);
    vi.spyOn(nodeEl, 'getBoundingClientRect').mockReturnValue(rectOf(200, 100, 100, 40));

    const el = handleEl();
    const handleRect = vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(rectOf(217, 97, 6, 6));
    store.registerNodeElement('n', nodeEl);
    store.registerHandle('n', reg('p', 'source', el));

    // The handle's centre (220, 100) minus the node's (200, 100) is (20, 0); it
    // is a bottom handle, so the edge attaches at its outer edge, 3 units on.
    expect(store.findHandle('n', 'p', 'source')?.anchor).toEqual({ x: 20, y: 3 });

    const before = store.getGeometryVersion();
    store.measureHandles('n'); // nothing moved
    expect(store.getGeometryVersion()).toBe(before);

    handleRect.mockReturnValue(rectOf(237, 97, 6, 6));
    store.measureHandles('n');
    expect(store.findHandle('n', 'p', 'source')?.anchor).toEqual({ x: 40, y: 3 });
    expect(store.getGeometryVersion()).toBe(before + 1);
  });

  it('leaves the anchor null for a box with no size, so callers fall back to the side midpoint', () => {
    const { store } = mounted();
    const nodeEl = document.createElement('div'); // jsdom: every rect is zero
    store.registerNodeElement('n', nodeEl);
    store.registerHandle('n', reg('p', 'source'));
    expect(store.findHandle('n', 'p', 'source')?.anchor).toBeNull();
  });
});

describe('flowinger store — translateExtent', () => {
  // A 1000 × 800 world in an 800 × 600 pane.
  const world = [[0, 0], [1000, 800]] as [[number, number], [number, number]];
  const withExtent = (extent: [[number, number], [number, number]] | null, w = 800, h = 600) => {
    const m = mounted(w, h);
    m.store.setBounds(0.05, 4, extent);
    return m.store;
  };

  it('stops the view at the extent edges', () => {
    const store = withExtent(world);
    const to = (x: number, y: number, zoom = 1) => {
      store.instance.setViewport({ x, y, zoom });
      return store.getViewport();
    };
    // x may be at most 0 (left edge on the extent's left) and at least 800 − 1000.
    expect(to(100, 0)).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(to(-500, 0).x).toBe(-200);
    // y: at most 0, at least 600 − 800.
    expect(to(0, 100).y).toBe(0);
    expect(to(0, -500).y).toBe(-200);
    // Anywhere inside is left exactly alone.
    expect(to(-120, -75)).toEqual({ x: -120, y: -75, zoom: 1 });
  });

  it('scales the limits with the zoom', () => {
    const store = withExtent(world);
    // At 2× the world is 2000 wide: x runs from 0 down to 800 − 2000.
    store.instance.setViewport({ x: 50, y: 0, zoom: 2 });
    expect(store.getViewport().x).toBe(0);
    store.instance.setViewport({ x: -5000, y: 0, zoom: 2 });
    expect(store.getViewport().x).toBe(-1200);
  });

  it('centres an extent smaller than the pane, instead of pinning it to a corner', () => {
    const store = withExtent([[0, 0], [400, 300]]);
    store.instance.setViewport({ x: -900, y: 900, zoom: 1 });
    // Free space is 800 − 400 and 600 − 300; half of each on either side.
    expect(store.getViewport()).toEqual({ x: 200, y: 150, zoom: 1 });
  });

  it('holds when zooming out would show past the extent', () => {
    const store = withExtent(world);
    store.instance.setViewport({ x: 0, y: 0, zoom: 1 });
    store.zoomAt(0.5, 0, 0); // zoom out to 0.5: the world is now only 500 × 400
    const vp = store.getViewport();
    expect(vp.zoom).toBeCloseTo(0.5);
    // Smaller than the pane, so centred: (800 − 500) / 2 and (600 − 400) / 2.
    expect(vp.x).toBeCloseTo(150);
    expect(vp.y).toBeCloseTo(100);
  });

  it('constrains the target of an animated move too', () => {
    vi.useFakeTimers();
    const store = withExtent(world);
    store.instance.setViewport({ x: 900, y: 0, zoom: 1 }, { duration: 200 });
    vi.advanceTimersByTime(600);
    expect(store.getViewport().x).toBe(0);
  });

  it('is unbounded with no extent, and with a pane that has no size yet', () => {
    const free = withExtent(null);
    free.instance.setViewport({ x: 99999, y: -99999, zoom: 1 });
    expect(free.getViewport()).toEqual({ x: 99999, y: -99999, zoom: 1 });

    const unsized = withExtent(world, 0, 0);
    unsized.instance.setViewport({ x: 500, y: 500, zoom: 1 });
    expect(unsized.getViewport().x).toBe(500);
  });

  it('pulls the current view back in when a tighter extent arrives', () => {
    const store = withExtent(null);
    store.instance.setViewport({ x: 600, y: 0, zoom: 1 });
    store.setBounds(0.05, 4, world);
    expect(store.getViewport().x).toBe(0);
  });

  it('does not treat an equal extent, passed as a fresh array, as a change', () => {
    const store = withExtent(world);
    store.instance.setViewport({ x: -50, y: -50, zoom: 1 });
    const at = store.getViewport();
    store.setBounds(0.05, 4, [[0, 0], [1000, 800]]); // same values, new arrays
    expect(store.getViewport()).toBe(at); // untouched: no needless re-commit
  });
});

describe('flowinger store — selection', () => {
  const nodesOf = (...ids: string[]): Node[] => ids.map((id) => node(id, 0, 0));
  const setup = () => {
    const { store } = mounted();
    store.use([selectionFeature]);
    const onSelectionChange = vi.fn();
    store.setNodes(nodesOf('a', 'b', 'c'));
    store.setCallbacks({ onSelectionChange });
    const ids = () => (onSelectionChange.mock.calls.at(-1)?.[0] as { nodes: Node[] }).nodes.map((n) => n.id);
    return { store, onSelectionChange, ids };
  };

  it('replaces the selection, or toggles within it when additive', () => {
    const { store, ids } = setup();
    store.api(selectionFeature).selectNode('a');
    store.api(selectionFeature).selectNode('b');
    expect(ids()).toEqual(['b']);
    store.api(selectionFeature).selectNode('a', true);
    expect(ids()).toEqual(['a', 'b']); // in graph order, not click order
    store.api(selectionFeature).selectNode('b', true);
    expect(ids()).toEqual(['a']);
    expect([store.isSelected('a'), store.isSelected('b')]).toEqual([true, false]);
  });

  it('stays quiet when nothing changes', () => {
    const { store, onSelectionChange } = setup();
    store.api(selectionFeature).selectNode('a');
    store.api(selectionFeature).selectNode('a'); // already the whole selection
    store.api(selectionFeature).clearSelection();
    store.api(selectionFeature).clearSelection(); // already empty
    expect(onSelectionChange).toHaveBeenCalledTimes(2); // select, then clear
  });

  it('tells only the nodes whose state flipped', () => {
    const { store } = setup();
    const heard: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (const id of ['a', 'b', 'c']) {
      store.subscribeNode(id, () => {
        heard[id] = (heard[id] ?? 0) + 1;
      });
    }
    store.api(selectionFeature).selectNode('a');
    store.api(selectionFeature).selectNode('b'); // a deselected, b selected
    expect(heard).toEqual({ a: 2, b: 1, c: 0 });
  });

  it('drops a selected node that leaves the graph, and reports the survivors', () => {
    const { store, ids, onSelectionChange } = setup();
    store.api(selectionFeature).selectNode('a');
    store.api(selectionFeature).selectNode('c', true);
    onSelectionChange.mockClear();
    store.setNodes(nodesOf('b', 'c')); // a is gone
    expect(ids()).toEqual(['c']);
    expect(store.isSelected('a')).toBe(false);
    expect(store.hasSelection()).toBe(true);
  });
});

describe('flowinger store — geometry notifications for overviews', () => {
  it('bumps geometry when nodes are laid out afresh, not when the same layout is passed again', () => {
    const { store } = mounted();
    const a = node('a', 0, 0, { width: 100, height: 40 });
    store.setNodes([a]);
    const v = store.getGeometryVersion();

    store.setNodes([{ ...a }]); // a new array and object, the same layout
    expect(store.getGeometryVersion()).toBe(v);

    store.setNodes([{ ...a, position: { x: 5, y: 0 } }]);
    expect(store.getGeometryVersion()).toBe(v + 1);
    store.setNodes([{ ...a, position: { x: 5, y: 0 }, width: 120 }]); // a declared size changed
    expect(store.getGeometryVersion()).toBe(v + 2);
    store.setNodes([]); // gone
    expect(store.getGeometryVersion()).toBeGreaterThan(v + 2);
  });

  it('bumps geometry when the pane is resized, and only when its size really changed', () => {
    let notify: () => void = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          notify = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    let width = 800;
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { get: () => width, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    const store = createFlowingerStore();
    store.attach(document.createElement('div'), container);

    const v = store.getGeometryVersion();
    notify(); // an observer callback with nothing changed
    expect(store.getGeometryVersion()).toBe(v);
    width = 500;
    notify();
    expect(store.getGeometryVersion()).toBe(v + 1);
    expect(store.getContainerSize()).toEqual({ width: 500, height: 600 });
  });

  it('lets go of the observer on detach', () => {
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect = disconnect;
      },
    );
    const { store } = mounted();
    store.detach();
    expect(disconnect).toHaveBeenCalled();
    expect(store.getContainerSize()).toBeNull();
  });
});
