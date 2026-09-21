import { createContext, type ComponentType } from 'react';
import type { LabelBoxProps } from './features.ts';

/** What an edge knows about itself, for `BaseEdge` (and a custom edge) to draw from. */
export interface EdgeContextValue {
  selected: boolean;
  /** Whether a click on it selects it — and so whether it needs a fat, invisible hit area. */
  selectable: boolean;
  /** Whether the canvas listens to events on edges, so even one that cannot be selected needs a hit area. */
  interactive: boolean;
  /** What draws the box behind a label — from a feature; without one, `labelShowBg` shows nothing. */
  LabelBox: ComponentType<LabelBoxProps> | null;
}

export const EdgeContext = /*#__PURE__*/ createContext<EdgeContextValue>({
  selected: false,
  selectable: false,
  interactive: false,
  LabelBox: null,
});
