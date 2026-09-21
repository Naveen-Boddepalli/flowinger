import { createContext } from 'react';

/** What an edge knows about itself, for `BaseEdge` (and a custom edge) to draw from. */
export interface EdgeContextValue {
  selected: boolean;
  /** Whether a click on it selects it — and so whether it needs a fat, invisible hit area. */
  selectable: boolean;
}

export const EdgeContext = createContext<EdgeContextValue>({ selected: false, selectable: false });
