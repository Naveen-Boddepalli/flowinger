// React Flow 13's store hooks. React Flow 13 splits its store six ways — the options, the viewport, the nodes, the
// edges, the connection being made and the selection box — with a hook for each; flowinger keeps one store, and
// these read the same slices from it, so code written against React Flow 13 runs here. They read only, as
// `useStoreApi` does: change things through the instance (`useReactFlow()`).
//
// Each slice is the same object until something in it changes, so a selector may return the whole slice. As with
// React Flow's, a selector that builds a fresh object each time re-renders its caller on every change unless it is
// wrapped in `useShallow`.
import { useRef, useSyncExternalStore } from 'react';
import { NO_CONNECTION, toPublic, type ConnectionState } from './connectionHook.ts';
import { sameInternalNode, useFlowingerStore } from './context.ts';
import type { BoxSelectApi } from './features/boxSelect.tsx';
import type { ConnectApi } from './features/connect.tsx';
import type { HandleConnection, SelectionRect, Transform } from './reactFlowNames.ts';
import type { FlowingerState, FlowingerStore } from './store.ts';
import type { Edge, HandleType, InternalNode, Node } from './types.ts';

/** React Flow 13's `ViewportStore`: the view, the pane's size, and whether the pane is being dragged. */
export interface ViewportStore {
  paneDragging: boolean;
  transform: Transform;
  width: number;
  height: number;
}
/** React Flow 13's `NodesStore`: the nodes as given, and what the engine knows of each (`nodeLookup`). */
export interface NodesStore<N extends Node = Node> {
  nodes: N[];
  nodeLookup: Map<string, InternalNode>;
  /** Each parent's children, by the parent's id. */
  parentLookup: Map<string, Map<string, InternalNode>>;
  nodesInitialized: boolean;
}
/** React Flow 13's `EdgesStore`: the edges as given, by id, and by what each connects. */
export interface EdgesStore<E extends Edge = Edge> {
  edges: E[];
  edgeLookup: Map<string, E>;
  /**
   * React Flow's connection lookup: the connections at a node (key `nodeId`), at one end of it (`nodeId-source`,
   * `nodeId-target`), and at one handle (`nodeId-source-handleId`).
   */
  connectionLookup: Map<string, Map<string, HandleConnection>>;
}
/** React Flow 13's `ConnectionStore`: the connection being dragged, and the handle a first click began one from. */
export interface ConnectionStore {
  connection: ConnectionState;
  connectionClickStartHandle: { nodeId: string; id?: string | null; type: HandleType } | null;
}
/** React Flow 13's `SelectionStore`: the selection box being dragged, in pane pixels. */
export interface SelectionStore {
  userSelectionRect: SelectionRect | null;
}
/** One slice of the store, read only: what it holds now, and a way to hear when that changes. */
export interface ReadonlyStoreApi<S> {
  getState: () => S;
  subscribe: (listener: () => void) => () => void;
}
/** React Flow 13's `ReactFlowStoreApi`, read only. The options store holds what `useStore` reads. */
export interface ReactFlowStoreApi {
  optionsStore: ReadonlyStoreApi<FlowingerState>;
  viewportStore: ReadonlyStoreApi<ViewportStore>;
  nodesStore: ReadonlyStoreApi<NodesStore>;
  edgesStore: ReadonlyStoreApi<EdgesStore>;
  connectionStore: ReadonlyStoreApi<ConnectionStore>;
  selectionStore: ReadonlyStoreApi<SelectionStore>;
}

const both =
  (a: ReadonlyStoreApi<unknown>['subscribe'], b: ReadonlyStoreApi<unknown>['subscribe']) =>
  (listener: () => void): (() => void) => {
    const offA = a(listener);
    const offB = b(listener);
    return () => {
      offA();
      offB();
    };
  };

function connectionLookupOf(edges: readonly Edge[]): EdgesStore['connectionLookup'] {
  const lookup: EdgesStore['connectionLookup'] = new Map();
  const add = (key: string, connectionKey: string, connection: HandleConnection) => {
    let map = lookup.get(key);
    if (!map) lookup.set(key, (map = new Map()));
    map.set(connectionKey, connection);
  };
  for (const e of edges) {
    const sourceHandle = e.sourceHandle ?? null;
    const targetHandle = e.targetHandle ?? null;
    const connection: HandleConnection = { edgeId: e.id, source: e.source, target: e.target, sourceHandle, targetHandle };
    // Keyed by the other end, as React Flow keys them.
    const atSource = `${e.target}-${String(targetHandle)}--${e.source}-${String(sourceHandle)}`;
    const atTarget = `${e.source}-${String(sourceHandle)}--${e.target}-${String(targetHandle)}`;
    for (const [nodeId, type, handle, key] of [
      [e.source, 'source', sourceHandle, atSource],
      [e.target, 'target', targetHandle, atTarget],
    ] as const) {
      add(nodeId, key, connection);
      add(`${nodeId}-${type}`, key, connection);
      if (handle) add(`${nodeId}-${type}-${handle}`, key, connection);
    }
  }
  return lookup;
}

const slices = new WeakMap<FlowingerStore, ReactFlowStoreApi>();

/** The six slices of one store, made once per store. */
function slicesOf(store: FlowingerStore): ReactFlowStoreApi {
  const made = slices.get(store);
  if (made) return made;

  let viewport: ViewportStore | null = null;
  const viewportStore: ReadonlyStoreApi<ViewportStore> = {
    getState: () => {
      const s = store.getState();
      const paneDragging = store.isPaneDragging();
      if (
        !viewport ||
        viewport.transform !== s.transform ||
        viewport.width !== s.width ||
        viewport.height !== s.height ||
        viewport.paneDragging !== paneDragging
      ) {
        viewport = { paneDragging, transform: s.transform as Transform, width: s.width, height: s.height };
      }
      return viewport;
    },
    subscribe: store.subscribeState,
  };

  let nodesSlice: NodesStore | null = null;
  let nodesKey: [readonly Node[], boolean, number] | null = null;
  const nodesStore: ReadonlyStoreApi<NodesStore> = {
    getState: () => {
      const { nodes, nodesInitialized } = store.getState();
      const version = store.getGeometryVersion();
      if (nodesSlice && nodesKey?.[0] === nodes && nodesKey[1] === nodesInitialized && nodesKey[2] === version) {
        return nodesSlice;
      }
      nodesKey = [nodes, nodesInitialized, version];
      // The lookups are worked out the first time something reads them, not on every move of every node.
      let nodeLookup: NodesStore['nodeLookup'] | undefined;
      let parentLookup: NodesStore['parentLookup'] | undefined;
      const lookup = () =>
        (nodeLookup ??= new Map(
          nodes.flatMap((n) => {
            const internal = store.getInternalNode(n.id);
            return internal ? [[n.id, internal] as const] : [];
          }),
        ));
      nodesSlice = {
        nodes: nodes as Node[],
        nodesInitialized,
        get nodeLookup() {
          return lookup();
        },
        get parentLookup() {
          if (!parentLookup) {
            parentLookup = new Map();
            for (const internal of lookup().values()) {
              if (internal.parentId === undefined) continue;
              let children = parentLookup.get(internal.parentId);
              if (!children) parentLookup.set(internal.parentId, (children = new Map()));
              children.set(internal.id, internal);
            }
          }
          return parentLookup;
        },
      };
      return nodesSlice;
    },
    subscribe: both(store.subscribeState, store.subscribeGeometry),
  };

  let edgesSlice: EdgesStore | null = null;
  const edgesStore: ReadonlyStoreApi<EdgesStore> = {
    getState: () => {
      const { edges } = store.getState();
      if (edgesSlice?.edges === edges) return edgesSlice;
      let edgeLookup: EdgesStore['edgeLookup'] | undefined;
      let connectionLookup: EdgesStore['connectionLookup'] | undefined;
      edgesSlice = {
        edges: edges as Edge[],
        get edgeLookup() {
          return (edgeLookup ??= new Map(edges.map((e) => [e.id, e])));
        },
        get connectionLookup() {
          return (connectionLookup ??= connectionLookupOf(edges));
        },
      };
      return edgesSlice;
    },
    subscribe: store.subscribeState,
  };

  const connect = () => store.apiOf('connect') as ConnectApi | undefined;
  let connectionSlice: ConnectionStore | null = null;
  let connectionKey: [unknown, unknown] | null = null;
  const connectionStore: ReadonlyStoreApi<ConnectionStore> = {
    getState: () => {
      const raw = store.getConnection();
      const clickStart = connect()?.getClickStart() ?? null;
      if (!connectionSlice || connectionKey?.[0] !== raw || connectionKey[1] !== clickStart) {
        connectionKey = [raw, clickStart];
        connectionSlice = { connection: raw ? toPublic(store, raw) : NO_CONNECTION, connectionClickStartHandle: clickStart };
      }
      return connectionSlice;
    },
    subscribe: (listener) => {
      const offConnection = store.subscribeConnection(listener);
      const offClick = connect()?.subscribeClickStart(listener);
      return () => {
        offConnection();
        offClick?.();
      };
    },
  };

  let selectionSlice: SelectionStore = { userSelectionRect: null };
  let selectionKey: unknown = null;
  const boxSelect = () => store.apiOf('boxSelect') as BoxSelectApi | undefined;
  const selectionStore: ReadonlyStoreApi<SelectionStore> = {
    getState: () => {
      const rect = boxSelect()?.getSelectionRect() ?? null;
      if (rect !== selectionKey) {
        selectionKey = rect;
        selectionSlice = { userSelectionRect: rect ? { startX: rect.x, startY: rect.y, ...rect } : null };
      }
      return selectionSlice;
    },
    subscribe: (listener) => boxSelect()?.subscribeSelectionRect(listener) ?? (() => {}),
  };

  const stores: ReactFlowStoreApi = {
    optionsStore: { getState: store.getState, subscribe: store.subscribeState },
    viewportStore,
    nodesStore,
    edgesStore,
    connectionStore,
    selectionStore,
  };
  slices.set(store, stores);
  return stores;
}

function useSlice<S, T>(slice: ReadonlyStoreApi<S>, selector: ((state: S) => T) | undefined): T {
  const read = () => (selector ? selector(slice.getState()) : (slice.getState() as unknown as T));
  return useSyncExternalStore(slice.subscribe, read, read);
}

/** React Flow 13's stores, read only: each one's `getState()` and `subscribe()`, without re-rendering. */
export function useReactFlowStoreApi(): ReactFlowStoreApi {
  return slicesOf(useFlowingerStore());
}

/** React Flow 13's options store: what `useStore` reads (`FlowingerState`). With no selector, all of it. */
export function useOptionsStore(): FlowingerState;
export function useOptionsStore<T>(selector: (state: FlowingerState) => T): T;
export function useOptionsStore<T>(selector?: (state: FlowingerState) => T): T {
  return useSlice(slicesOf(useFlowingerStore()).optionsStore, selector);
}

/** React Flow 13's viewport store: `transform`, the pane's `width` and `height`, and `paneDragging`. */
export function useViewportStore(): ViewportStore;
export function useViewportStore<T>(selector: (state: ViewportStore) => T): T;
export function useViewportStore<T>(selector?: (state: ViewportStore) => T): T {
  return useSlice(slicesOf(useFlowingerStore()).viewportStore, selector);
}

/** React Flow 13's nodes store: `nodes`, `nodeLookup`, `parentLookup` and `nodesInitialized`. */
export function useNodesStore(): NodesStore;
export function useNodesStore<T>(selector: (state: NodesStore) => T): T;
export function useNodesStore<T>(selector?: (state: NodesStore) => T): T {
  return useSlice(slicesOf(useFlowingerStore()).nodesStore, selector);
}

/** React Flow 13's edges store: `edges`, `edgeLookup` and `connectionLookup`. */
export function useEdgesStore(): EdgesStore;
export function useEdgesStore<T>(selector: (state: EdgesStore) => T): T;
export function useEdgesStore<T>(selector?: (state: EdgesStore) => T): T {
  return useSlice(slicesOf(useFlowingerStore()).edgesStore, selector);
}

/** React Flow 13's connection store: the `connection` being dragged and `connectionClickStartHandle`. */
export function useConnectionStore(): ConnectionStore;
export function useConnectionStore<T>(selector: (state: ConnectionStore) => T): T;
export function useConnectionStore<T>(selector?: (state: ConnectionStore) => T): T {
  return useSlice(slicesOf(useFlowingerStore()).connectionStore, selector);
}

/** React Flow 13's selection store: `userSelectionRect`, the box being dragged (with `boxSelectFeature`). */
export function useSelectionStore(): SelectionStore;
export function useSelectionStore<T>(selector: (state: SelectionStore) => T): T;
export function useSelectionStore<T>(selector?: (state: SelectionStore) => T): T {
  return useSlice(slicesOf(useFlowingerStore()).selectionStore, selector);
}

const nodesById = new WeakMap<readonly Node[], Map<string, Node>>();

/** A node, as given to the canvas — `undefined` where there is none with that id. Re-renders when it changes. */
export function useNode<N extends Node = Node>(id: string): N | undefined {
  const store = useFlowingerStore();
  const read = () => {
    const { nodes } = store.getState();
    let byId = nodesById.get(nodes);
    if (!byId) nodesById.set(nodes, (byId = new Map(nodes.map((n) => [n.id, n]))));
    return byId.get(id) as N | undefined;
  };
  return useSyncExternalStore(store.subscribeState, read, read);
}

/** An edge, as given to the canvas — `undefined` where there is none with that id. Re-renders when it changes. */
export function useEdge<E extends Edge = Edge>(id: string): E | undefined {
  const edges = slicesOf(useFlowingerStore()).edgesStore;
  const read = () => edges.getState().edgeLookup.get(id) as E | undefined;
  return useSyncExternalStore(edges.subscribe, read, read);
}

/**
 * The nodes with these ids, with what the engine knows of each (`internals`), in the order asked for — leaving
 * out an id with no node. The same array until one of them moves or changes.
 */
export function useInternalNodes(ids: readonly string[]): InternalNode[] {
  const store = useFlowingerStore();
  const last = useRef<InternalNode[]>([]);
  const read = () => {
    const next = ids.flatMap((id) => {
      const internal = store.getInternalNode(id);
      return internal ? [internal] : [];
    });
    const prev = last.current;
    if (next.length === prev.length && next.every((n, i) => sameInternalNode(n, prev[i]))) return prev;
    last.current = next;
    return next;
  };
  return useSyncExternalStore(both(store.subscribeState, store.subscribeGeometry), read, read);
}

/** Whether two values are the same, or hold the same things: the members of arrays, objects, maps and sets. */
function shallow(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (a instanceof Map && b instanceof Map) {
    return a.size === b.size && [...a].every(([k, v]) => b.has(k) && Object.is(v, b.get(k)));
  }
  if (a instanceof Set && b instanceof Set) return a.size === b.size && [...a].every((v) => b.has(v));
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return (
    keysA.length === keysB.length &&
    keysA.every((k) => Object.hasOwn(b, k) && Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}

/**
 * React Flow's `useShallow` (zustand's): wraps a selector so that a result holding the same things as the last
 * one — the same members of an array or an object — is the last one, and does not re-render the caller.
 */
export function useShallow<S, U>(selector: (state: S) => U): (state: S) => U {
  const last = useRef<{ value: U } | null>(null);
  return (state) => {
    const next = selector(state);
    if (last.current && shallow(last.current.value, next)) return last.current.value;
    last.current = { value: next };
    return next;
  };
}
