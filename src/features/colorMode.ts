import { useSyncExternalStore, type CSSProperties } from 'react';
import type { Feature } from '../features.ts';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const noSubscription = () => () => {};

/**
 * The library's own colours are a dark palette read from `--flowinger-*` variables with fallbacks. `light` is the
 * same variables, set on the canvas, to light values — so everything drawn inside the canvas that reads them
 * (nodes, edges, controls and a minimap placed as its children) follows.
 */
const LIGHT = {
  '--flowinger-surface': '#ffffff',
  '--flowinger-surface-raised': '#f1f5f9',
  '--flowinger-border': '#cbd5e1',
  '--flowinger-text': '#0f172a',
  '--flowinger-text-dim': '#64748b',
  '--flowinger-mask': 'rgba(241, 245, 249, 0.7)',
  '--flowinger-selected': '#0284c7',
} as CSSProperties;

/**
 * `colorMode`: `'light'`, `'dark'` or `'system'` (the OS's, and following it). The canvas gets the class
 * `light` or `dark`, as React Flow's does, for your own CSS; `light` also sets the colours above. `dark` is the
 * library's default palette, so it adds only the class. Left out, nothing is added.
 */
export const colorModeFeature: Feature = {
  name: 'colorMode',

  useCanvas({ props }) {
    const mode = props.colorMode;
    const system = mode === 'system';
    const osDark = useSyncExternalStore(
      system && typeof window !== 'undefined' && window.matchMedia
        ? (fn) => {
            const query = window.matchMedia(DARK_QUERY);
            query.addEventListener('change', fn);
            return () => {
              query.removeEventListener('change', fn);
            };
          }
        : noSubscription,
      () => (system && typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches) || false,
      // The server cannot ask: it draws the library's own palette.
      () => true,
    );
    if (mode === undefined) return undefined;
    const scheme = system ? (osDark ? 'dark' : 'light') : mode;
    return { className: scheme, ...(scheme === 'light' ? { style: LIGHT } : {}) };
  },
};
