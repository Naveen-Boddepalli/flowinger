import { createContext } from 'react';
import type { HandleRegistration } from './store.ts';

export interface NodeContextValue {
  nodeId: string;
  /** The canvas's `nodesConnectable`. A handle also needs its own `isConnectable` not to be false. */
  connectable: boolean;
  /** Registers a handle with the node it is rendered inside. Returns its cleanup. */
  registerHandle: (registration: HandleRegistration) => () => void;
  /** Begins dragging a connection out of one of this node's handles. */
  startConnection: (handle: HTMLElement, at: { clientX: number; clientY: number }) => void;
}

/** Null outside a node — a `<Handle>` rendered there simply draws, and registers nowhere. */
export const NodeContext = createContext<NodeContextValue | null>(null);
