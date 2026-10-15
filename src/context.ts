import { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore } from 'react';
import { NodeContext } from './nodeContext.ts';
import type { FlowingerInstance, InternalNode, Viewport } from './types.ts';
import type { FlowingerState, FlowingerStore, ViewDefaults } from './store.ts';

export const FlowingerContext = /*#__PURE__*/ createContext<FlowingerStore | null>(null);

/**
 * The defaults for what is not a canvas prop, from `<ReactFlow>` (React Flow's) to the canvas inside it and to
 * `Controls`; none elsewhere. Context rather than store, so `Controls` has them on its first render — on a server
 * too, where the markup must match.
 */
export const ViewDefaultsContext = /*#__PURE__*/ createContext<ViewDefaults | null>(null);

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

// `measured` is rebuilt from a stable `Size` on every `snapshotNode` call (a fresh `{ width, height }`
// literal), so comparing it by reference — as `position` and everything else here can be — would never
// hold once a node has been measured, and `getSnapshot` would never settle.
const sameSize = (a?: { width?: number; height?: number }, b?: { width?: number; height?: number }): boolean =>
  a === b || (a?.width === b?.width && a?.height === b?.height);

// `position` and `internals.z` overlap with `positionAbsolute` and `zIndex` for every change `setNodes`
// itself notices (`sameLayout` — position, width, height, hidden — is what decides a relayout; it does
// not compare `parentId`, so a pure reparent that does not also move anything is not caught here either,
// or upstream of it). Kept anyway: cheap, and correct for a case `sameLayout` does learn of.
const sameInternalNode = (a: InternalNode | undefined, b: InternalNode | undefined): boolean =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    a.position === b.position &&
    sameSize(a.measured, b.measured) &&
    a.selected === b.selected &&
    a.zIndex === b.zIndex &&
    a.internals.z === b.internals.z &&
    a.internals.positionAbsolute.x === b.internals.positionAbsolute.x &&
    a.internals.positionAbsolute.y === b.internals.positionAbsolute.y);

/**
 * A node plus what the engine has worked out about it — `internals.positionAbsolute`,
 * `internals.z` — re-read on a drag, a controlled relayout, or that node's own selection flipping.
 * `undefined` for a node that is not there. Narrower than React Flow's `useInternalNode` (see
 * `InternalNode`): a plain `zIndex`-only edit, with no accompanying move, is not picked up until
 * something else invalidates it.
 */
export function useInternalNode(id: string): InternalNode | undefined {
  const store = useContext(FlowingerContext);
  const subscribe = useCallback(
    (listener: () => void): (() => void) => {
      if (!store) return () => {};
      // Geometry catches a move (a drag, or a controlled relayout); a node's own listener catches a
      // controlled selection flip alone, which does not otherwise touch geometry.
      const offGeometry = store.subscribeGeometry(listener);
      const offNode = store.subscribeNode(id, listener);
      return () => {
        offGeometry();
        offNode();
      };
    },
    [store, id],
  );
  const cache = useRef<InternalNode | undefined>(undefined);
  const getSnapshot = useCallback(() => {
    const next = store?.getInternalNode(id);
    if (sameInternalNode(cache.current, next)) return cache.current;
    cache.current = next;
    return next;
  }, [store, id]);
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}

export interface FlowingerStoreApi {
  getState: () => FlowingerState;
  /** Every change to anything `useStore` can read — a pan included, so this fires often. */
  subscribe: (listener: () => void) => () => void;
}

/**
 * React Flow's `useStoreApi`: `getState()` without subscribing to it — for reading a value from an event
 * handler, say, rather than a render. No `setState`: flowinger's store is not shaped like React Flow's,
 * and does not offer generic writes to its internals — use the instance (`useReactFlow()`) instead.
 */
export function useStoreApi(): FlowingerStoreApi {
  const store = useFlowingerStore();
  return useMemo(() => ({ getState: store.getState, subscribe: store.subscribeState }), [store]);
}
