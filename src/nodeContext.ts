import { createContext } from 'react';
import type { HandleRegistration } from './store.ts';

export interface NodeContextValue {
  /** Registers a handle with the node it is rendered inside. Returns its cleanup. */
  registerHandle: (registration: HandleRegistration) => () => void;
}

/** Null outside a node — a `<Handle>` rendered there simply draws, and registers nowhere. */
export const NodeContext = createContext<NodeContextValue | null>(null);
