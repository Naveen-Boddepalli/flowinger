import type { Feature } from '../features.ts';
import { smoothViewport } from '../smooth.ts';

/**
 * `interpolate: 'smooth'` on a viewport move (`setViewport`, `fitView`, `setCenter`, `zoomTo`…): van Wijk and
 * Nuij's path, which over a long move zooms out and back in so the eye can follow. Without it, `'smooth'` is
 * a linear move, which is what the engine does by default.
 */
export const smoothFeature: Feature = {
  name: 'smooth',
  smoothViewport,
};
