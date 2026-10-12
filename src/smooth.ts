import type { Viewport } from './types.ts';

const RHO = Math.SQRT2;
const RHO2 = 2;
const RHO4 = 4;

const cosh = (x: number) => (Math.exp(x) + Math.exp(-x)) / 2;
const sinh = (x: number) => (Math.exp(x) - Math.exp(-x)) / 2;
const tanh = (x: number) => {
  const e = Math.exp(2 * x);
  return (e - 1) / (e + 1);
};

/**
 * The path between two views of van Wijk and Nuij, "Smooth and efficient zooming and panning": over a long
 * move it zooms out and back in, so the eye can follow it — React Flow's `'smooth'`, from d3's
 * `interpolateZoom`. The view is its centre and its width in graph units; `t` runs 0 to 1.
 */
export function smoothViewport(from: Viewport, to: Viewport, width: number, height: number): (t: number) => Viewport {
  const size = Math.max(width, height);
  const centre = (v: Viewport) => [(width / 2 - v.x) / v.zoom, (height / 2 - v.y) / v.zoom, size / v.zoom] as const;
  const [ux0, uy0, w0] = centre(from);
  const [ux1, uy1, w1] = centre(to);
  const dx = ux1 - ux0;
  const dy = uy1 - uy0;
  const d2 = dx * dx + dy * dy;

  let at: (t: number) => readonly [number, number, number];
  if (d2 < 1e-12) {
    // The same place: only the zoom changes.
    const s = Math.log(w1 / w0) / RHO;
    at = (t) => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(RHO * t * s)];
  } else {
    const d1 = Math.sqrt(d2);
    const b0 = (w1 * w1 - w0 * w0 + RHO4 * d2) / (2 * w0 * RHO2 * d1);
    const b1 = (w1 * w1 - w0 * w0 - RHO4 * d2) / (2 * w1 * RHO2 * d1);
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
    const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
    const s = (r1 - r0) / RHO;
    at = (t) => {
      const u = (w0 / (RHO2 * d1)) * (cosh(r0) * tanh(RHO * t * s + r0) - sinh(r0));
      return [ux0 + u * dx, uy0 + u * dy, (w0 * cosh(r0)) / cosh(RHO * t * s + r0)];
    };
  }
  return (t) => {
    const [ux, uy, w] = at(t);
    const zoom = size / w;
    return { x: width / 2 - ux * zoom, y: height / 2 - uy * zoom, zoom };
  };
}
