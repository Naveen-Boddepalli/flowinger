import { useRef, useSyncExternalStore } from 'react';
import { useFlowingerStore } from './context.ts';
import type { DragConnection, FlowingerStore } from './store.ts';
import type { HandleType, InternalNode, Position, XYPosition } from './types.ts';

/** One end of a connection, as `useConnection` reports it — narrower than a registered `<Handle>`: no
 * measured position or size, just what names it. */
export interface ConnectionHandle {
  nodeId: string;
  id: string | null;
  type: HandleType;
}

/** No connection is being dragged. Every field a `ConnectionInProgress` has is `null` here instead. */
export interface NoConnection {
  inProgress: false;
  isValid: null;
  from: null;
  to: null;
  fromPosition: null;
  toPosition: null;
  fromNode: null;
  toNode: null;
  fromHandle: null;
  toHandle: null;
}

/** A connection is being dragged, from `fromHandle` to wherever the pointer is (or a handle it is over). */
export interface ConnectionInProgress {
  inProgress: true;
  /** Over a handle that would make a valid connection, over one that would not, or over neither. */
  isValid: boolean | null;
  from: XYPosition;
  to: XYPosition;
  fromPosition: Position;
  toPosition: Position;
  fromNode: InternalNode;
  /** The node under the pointer, whether or not dropping there would connect — `null` over neither. */
  toNode: InternalNode | null;
  fromHandle: ConnectionHandle;
  toHandle: ConnectionHandle | null;
}

/**
 * What `useConnection` reports. Narrower than React Flow's own (`fromNode`/`toNode` are flowinger's
 * `InternalNode` — see there for what that leaves out — and `fromHandle`/`toHandle` name a handle without
 * its measured position or size).
 */
export type ConnectionState = NoConnection | ConnectionInProgress;

export const NO_CONNECTION: NoConnection = {
  inProgress: false,
  isValid: null,
  from: null,
  to: null,
  fromPosition: null,
  toPosition: null,
  fromNode: null,
  toNode: null,
  fromHandle: null,
  toHandle: null,
};

/** The engine's connection in its public shape. Not part of the public surface: `useConnection` is. */
export function toPublic(store: FlowingerStore, raw: DragConnection | null): ConnectionState {
  if (!raw) return NO_CONNECTION;
  // The dragged-from node went (deleted mid-drag): nothing sensible to report.
  const fromNode = store.getInternalNode(raw.fromNodeId);
  if (!fromNode) return NO_CONNECTION;
  return {
    inProgress: true,
    isValid: raw.isValid,
    from: raw.start,
    to: raw.end,
    fromPosition: raw.startPosition,
    toPosition: raw.endPosition,
    fromNode,
    toNode: raw.toNodeId ? (store.getInternalNode(raw.toNodeId) ?? null) : null,
    fromHandle: { nodeId: raw.fromNodeId, id: raw.fromHandleId, type: raw.fromHandleType },
    toHandle: raw.toNodeId ? { nodeId: raw.toNodeId, id: raw.toHandleId, type: raw.toHandleType! } : null,
  };
}

/**
 * The connection being dragged right now, or `NoConnection` when none is. Colour a handle by whether it
 * is `connection.toHandle` and `connection.isValid`, say. `selector` narrows what re-renders the caller —
 * `(c) => c.isValid`, not something it allocates fresh each call, which loses the point.
 *
 * Only re-reads on what moves a connection along — a pointer move, or the drag starting or ending —
 * the same as the line drawn while connecting. If the node it started from disappears mid-drag with
 * nothing else changing meanwhile, that alone is not seen; the next pointer move (or the drag ending)
 * catches up and reports `NoConnection`.
 */
export function useConnection<T = ConnectionState>(selector?: (connection: ConnectionState) => T): T {
  const store = useFlowingerStore();
  // `store.getConnection()` is the same object reference until something actually changes, so the mapped
  // public value can be too — cached here, the way `useSyncExternalStore`'s stability check needs.
  const cache = useRef<{ raw: DragConnection | null; mapped: ConnectionState }>({
    raw: null,
    mapped: NO_CONNECTION,
  });
  const read = (): T => {
    const raw = store.getConnection();
    const mapped = cache.current.raw === raw ? cache.current.mapped : toPublic(store, raw);
    cache.current = { raw, mapped };
    return selector ? selector(mapped) : (mapped as T);
  };
  return useSyncExternalStore(
    store.subscribeConnection,
    read,
    () => (selector ? selector(NO_CONNECTION) : (NO_CONNECTION as T)),
  );
}
