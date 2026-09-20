import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(store.getState()).toEqual({ panZoom: null, isReady: false });

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

    // Centre (220, 100) minus the node's (200, 100).
    expect(store.findHandle('n', 'p', 'source')?.anchor).toEqual({ x: 20, y: 0 });

    const before = store.getGeometryVersion();
    store.measureHandles('n'); // nothing moved
    expect(store.getGeometryVersion()).toBe(before);

    handleRect.mockReturnValue(rectOf(237, 97, 6, 6));
    store.measureHandles('n');
    expect(store.findHandle('n', 'p', 'source')?.anchor).toEqual({ x: 40, y: 0 });
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
