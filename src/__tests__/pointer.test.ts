import { describe, expect, it } from 'vitest';
import { distance, midpoint, pinchViewport } from '../pointer.ts';

const start = {
  viewport: { x: 30, y: -10, zoom: 1 },
  mid: { x: 150, y: 100 },
  dist: 100,
};

describe('pinch math', () => {
  it('measures the midpoint and the spread', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 100, y: 40 })).toEqual({ x: 50, y: 20 });
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('leaves the viewport alone when the fingers have not moved', () => {
    expect(pinchViewport(start, start.mid, start.dist, 0.1, 4)).toEqual(start.viewport);
  });

  it('scales the zoom with the spread', () => {
    expect(pinchViewport(start, start.mid, 250, 0.1, 4).zoom).toBeCloseTo(2.5);
    expect(pinchViewport(start, start.mid, 50, 0.1, 4).zoom).toBeCloseTo(0.5);
  });

  it('keeps the graph point that began under the midpoint under it, however the fingers move', () => {
    const graphAtStart = {
      x: (start.mid.x - start.viewport.x) / start.viewport.zoom,
      y: (start.mid.y - start.viewport.y) / start.viewport.zoom,
    };
    // Spread and drift together.
    const mid = { x: 220, y: 70 };
    const vp = pinchViewport(start, mid, 180, 0.1, 4);
    expect((mid.x - vp.x) / vp.zoom).toBeCloseTo(graphAtStart.x);
    expect((mid.y - vp.y) / vp.zoom).toBeCloseTo(graphAtStart.y);
  });

  it('pans with no zoom change when both fingers drift the same way', () => {
    const vp = pinchViewport(start, { x: 190, y: 130 }, start.dist, 0.1, 4);
    expect(vp).toEqual({ x: 70, y: 20, zoom: 1 });
  });

  it('clamps to the zoom bounds, and keeps the anchor true at the clamped zoom', () => {
    const vp = pinchViewport(start, start.mid, 1000, 0.1, 2); // wants ×10
    expect(vp.zoom).toBe(2);
    expect((start.mid.x - vp.x) / vp.zoom).toBeCloseTo(
      (start.mid.x - start.viewport.x) / start.viewport.zoom,
    );
  });

  it('gives back the starting viewport when the fingers began on the same point', () => {
    expect(pinchViewport({ ...start, dist: 0 }, start.mid, 50, 0.1, 4)).toBe(start.viewport);
  });
});
