import { createContext, useContext, useSyncExternalStore } from 'react';
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

const NOT_MOUNTED: FlowingerState = { panZoom: null, isReady: false };
const noSubscription = () => () => {};

/**
 * React Flow's `useStore`, cut down to the two fields code migrating from it
 * tends to read: `panZoom` and `isReady`.
 *
 * The selector must return something referentially stable (a field, not a
 * fresh object) — the same rule React Flow's own `useStore` has.
 */
export function useStore<T>(selector: (state: FlowingerState) => T): T {
  const store = useContext(FlowingerContext);
  const read = () => selector(store ? store.getState() : NOT_MOUNTED);
  // Nothing is mounted on the server, or while hydrating, so both agree.
  return useSyncExternalStore(
    store ? store.subscribeMount : noSubscription,
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
