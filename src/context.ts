import { createContext, useContext, useRef, useSyncExternalStore } from 'react';
import { NodeContext } from './nodeContext.ts';
import type { FlowingerInstance, Viewport } from './types.ts';
import type { FlowingerState, FlowingerStore } from './store.ts';

export const FlowingerContext = createContext<FlowingerStore | null>(null);

/** The store itself, for the engine's own components. Not part of the public surface. */
export function useFlowingerStore(): FlowingerStore {
  const store = useContext(FlowingerContext);
  if (!store) {
    throw new Error('Flowinger hooks must be used within a FlowingerProvider or FlowingerCanvas');
  }
  return store;
}

/**
 * The viewport controls. The returned object is created once per provider and
 * never replaced, so it is safe as an effect dependency. It does not carry the
 * current viewport — that changes every frame of a pan; read it with
 * `useViewport()` in the components that draw from it.
 */
export function useFlowinger(): FlowingerInstance {
  return useFlowingerStore().instance;
}

/** React Flow compatibility alias. */
export const useReactFlow = useFlowinger;

/** The current viewport. Re-renders its caller on every change — use it sparingly. */
export function useViewport(): Viewport {
  const store = useFlowingerStore();
  // The server has no pan or zoom yet, so it renders the same viewport the
  // client starts from — the one the store was created with.
  return useSyncExternalStore(store.subscribeViewport, store.getViewport, store.getViewport);
}

const NOT_MOUNTED: FlowingerState = {
  panZoom: null,
  isReady: false,
  nodes: [],
  edges: [],
  transform: [0, 0, 1],
  width: 0,
  height: 0,
  minZoom: 0.05,
  maxZoom: 2,
  nodesInitialized: false,
};
const noSubscription = () => () => {};

/**
 * React Flow's `useStore`, cut down to the fields code migrating from it tends
 * to read: `panZoom`, `isReady`, `nodes`, `edges`, `transform`, `width`,
 * `height`, `minZoom`, `maxZoom` and `nodesInitialized`.
 *
 * The selector must return something referentially stable (a field, not a
 * fresh object) — the same rule React Flow's own `useStore` has — or else say
 * when two results are the same with `equalityFn`, e.g. a shallow comparison.
 */
export function useStore<T>(
  selector: (state: FlowingerState) => T,
  equalityFn?: (a: T, b: T) => boolean,
): T {
  const store = useContext(FlowingerContext);
  const last = useRef<{ value: T } | null>(null);
  const read = () => {
    const next = selector(store ? store.getState() : NOT_MOUNTED);
    const prev = last.current;
    if (prev && equalityFn?.(prev.value, next)) return prev.value;
    last.current = { value: next };
    return next;
  };
  // Nothing is mounted on the server, or while hydrating, so both agree.
  return useSyncExternalStore(
    store ? store.subscribeState : noSubscription,
    read,
    () => selector(NOT_MOUNTED),
  );
}

/**
 * Whether every node has been measured — false for an empty diagram. Re-renders
 * its caller only when that flips, not on every drag or pan.
 */
export function useNodesInitialized(): boolean {
  const store = useContext(FlowingerContext);
  return useSyncExternalStore(
    store ? store.subscribeGeometry : noSubscription,
    () => store?.areNodesInitialized() ?? false,
    () => false,
  );
}

/** The id of the node this component is rendered inside; null anywhere else. */
export function useNodeId(): string | null {
  return useContext(NodeContext)?.nodeId ?? null;
}
