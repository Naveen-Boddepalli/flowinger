import { afterEach, describe, expect, it, vi } from 'vitest';
import { layoutSize } from '../measure.ts';
import { createFlowingerStore } from '../store.ts';
import type { Position } from '../types.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const withComputed = (el: HTMLElement, width: string, height: string) => {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((target, pseudo) =>
    target === el ? ({ width, height } as CSSStyleDeclaration) : real(target, pseudo),
  );
};

describe('layoutSize', () => {
  it('reads the fractional layout size, where offsetWidth would round it', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetWidth', { value: 143 }); // 142.703 rounded
    Object.defineProperty(el, 'offsetHeight', { value: 43 });
    withComputed(el, '142.703px', '42.7px');
    expect(layoutSize(el)).toEqual({ width: 142.703, height: 42.7 });
  });

  it('falls back to the offset where there is no computed size (jsdom, display: none)', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetWidth', { value: 120 });
    Object.defineProperty(el, 'offsetHeight', { value: 30 });
    withComputed(el, 'auto', '');
    expect(layoutSize(el)).toEqual({ width: 120, height: 30 });
  });
});

describe('handle anchors', () => {
  const rectOf = (l: number, t: number, w: number, h: number) =>
    ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h }) as DOMRect;

  /** A 100 × 40 node at (200, 100), with a 6 × 6 handle centred at (cx, cy) in screen space. */
  const anchorFor = (position: Position, cx: number, cy: number) => {
    const store = createFlowingerStore();
    const nodeEl = document.createElement('div');
    Object.defineProperty(nodeEl, 'offsetWidth', { value: 100 });
    vi.spyOn(nodeEl, 'getBoundingClientRect').mockReturnValue(rectOf(200, 100, 100, 40));
    const el = document.createElement('div');
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(rectOf(cx - 3, cy - 3, 6, 6));
    store.registerNodeElement('n', nodeEl);
    store.registerHandle('n', { id: 'h', type: 'source', position, el });
    return store.findHandle('n', 'h', 'source')?.anchor;
  };

  it('is the handle’s outer edge on every side — the one facing away from the node', () => {
    // Each handle straddles its side of the node; the anchor is 3 units past the centre, outward.
    expect(anchorFor('top', 250, 100)).toEqual({ x: 50, y: -3 });
    expect(anchorFor('bottom', 250, 140)).toEqual({ x: 50, y: 43 });
    expect(anchorFor('left', 200, 120)).toEqual({ x: -3, y: 20 });
    expect(anchorFor('right', 300, 120)).toEqual({ x: 103, y: 20 });
  });
});
