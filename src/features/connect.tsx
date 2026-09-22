import { useCallback, useSyncExternalStore } from 'react';
import { useFlowingerStore } from '../context.ts';
import type { Feature } from '../features.ts';
import type { FlowingerEdgesProps } from '../FlowingerEdges.tsx';
import { handleCoordinates } from '../handlePoint.ts';
import { pathFor } from '../paths.ts';
import type { HandleRecord } from '../store.ts';
import {
  ConnectionLineType,
  type Connection,
  type Edge,
  type HandleType,
  type Position,
  type XYPosition,
} from '../types.ts';
import { autoPanFeature } from './autoPan.ts';

/** Where a connection end lives: a node, one of its handles by id (null = unnamed), and that handle's type. */
interface Endpoint {
  nodeId: string;
  id: string | null;
  type: HandleType;
}

const OPPOSITE: Record<Position, Position> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

export interface ConnectApi {
  /** Begins dragging a connection out of a handle. */
  startConnection: (nodeId: string, handleEl: HTMLElement, at: PointerEvent) => void;
  /**
   * The same gesture from a handle already found, and — given `reconnect` — as the drag of one end of an
   * existing edge: the *other* end stays where it is, and on release the drop is reported as a
   * reconnection rather than a new connection.
   */
  beginConnection: (
    nodeId: string,
    record: HandleRecord,
    at: PointerEvent,
    reconnect: { edge: Edge; end: HandleType } | null,
  ) => void;
}

/** Whether a connection joins the very same two handles an edge already does. */
const sameEnds = (edge: Edge, c: Connection): boolean =>
  edge.source === c.source &&
  edge.target === c.target &&
  (edge.sourceHandle ?? null) === c.sourceHandle &&
  (edge.targetHandle ?? null) === c.targetHandle;

/** The line being dragged out of a handle, drawn in the topmost edge layer. */
function ConnectionLine({
  connectionLineType = ConnectionLineType.Bezier,
  connectionLineStyle,
  connectionLineComponent: CustomConnectionLine,
}: FlowingerEdgesProps) {
  const store = useFlowingerStore();
  const connection = useSyncExternalStore(store.subscribeConnection, store.getConnection, () => null);
  if (!connection) return null;
  if (CustomConnectionLine) {
    return (
      <g className="flowinger-connection-line react-flow__connection" style={{ pointerEvents: 'none' }}>
        <CustomConnectionLine
          fromX={connection.start.x}
          fromY={connection.start.y}
          fromPosition={connection.startPosition}
          toX={connection.end.x}
          toY={connection.end.y}
          toPosition={connection.endPosition}
          connectionLineType={connectionLineType}
          connectionLineStyle={connectionLineStyle}
          isValid={connection.isValid}
        />
      </g>
    );
  }
  return (
    <path
      className="flowinger-connection-line react-flow__connection-path"
      d={pathFor(connectionLineType, connection.start, connection.startPosition, connection.end, connection.endPosition).d}
      fill="none"
      stroke="var(--flowinger-selected, #38bdf8)"
      strokeWidth={2}
      strokeDasharray="5 4"
      // Never takes events, whatever the style says: under the pointer it would hide the handle it is over.
      style={{ ...connectionLineStyle, pointerEvents: 'none' }}
    />
  );
}

/**
 * Connecting: dragging a line out of a `<Handle>` (with `nodesConnectable`) and dropping it on another —
 * `onConnect`, `onConnectStart`, `onConnectEnd`, `isValidConnection`, `connectionMode`, and the line
 * itself (`connectionLineType`, `connectionLineStyle`, `connectionLineComponent`).
 */
export const connectFeature: Feature<ConnectApi> = {
  name: 'connect',
  needs: [autoPanFeature],
  install(ctx) {
    let stopConnecting: (() => void) | null = null;
    let connecting = false;

    /** Where a registered handle sits in graph space: its measured anchor, else its side's midpoint. */
    const pointOfHandle = (nodeId: string, record: HandleRecord): XYPosition | null => {
      const node = ctx.nodeById.get(nodeId);
      if (!node) return null;
      const at = ctx.absolutePosition(node);
      return record.anchor
        ? { x: at.x + record.anchor.x, y: at.y + record.anchor.y }
        : handleCoordinates(at, record.position, ctx.getNodeSize(node));
    };

    /**
     * The connectable handle under a screen point. A handle says so with
     * `data-connectable`; browsers also skip `pointer-events: none` in
     * `elementFromPoint`, but this does not lean on that.
     */
    const handleAt = (clientX: number, clientY: number): { nodeId: string; record: HandleRecord } | null => {
      if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return null;
      const el = document
        .elementFromPoint(clientX, clientY)
        ?.closest<HTMLElement>('[data-nodeid][data-handletype][data-connectable]');
      const nodeId = el?.dataset.nodeid;
      if (!el || !nodeId) return null;
      for (const record of ctx.handlesOf(nodeId)) {
        // A handle that cannot end a connection is not there, as far as a drop is concerned.
        if (record.el === el) return record.options?.current.isConnectableEnd === false ? null : { nodeId, record };
      }
      return null;
    };

    /**
     * A source → target connection between two ends, whichever one the drag began
     * at. Strict, the types must differ; loose, anything joins anything but a
     * handle to itself, and two of a kind make the end the drag began at the source.
     */
    const connectionBetween = (a: Endpoint, b: Endpoint): Connection | null => {
      const loose = ctx.options.connectionMode === 'loose';
      if (a.type === b.type && !loose) return null;
      if (loose && a.nodeId === b.nodeId && a.id === b.id) return null;
      const [from, to] = a.type === 'target' && b.type === 'source' ? [b, a] : [a, b];
      return { source: from.nodeId, sourceHandle: from.id, target: to.nodeId, targetHandle: to.id };
    };

    /** The handle a drag began at vets a new connection, if it has a say; otherwise the canvas does. */
    const isAllowed = (c: Connection, start: HandleRecord, reconnecting: boolean): boolean =>
      (reconnecting ? ctx.callbacks.isValidConnection : (start.options?.current.isValidConnection ?? ctx.callbacks.isValidConnection))?.(c) !==
      false;

    const cancelConnection = () => {
      stopConnecting?.();
      stopConnecting = null;
      if (connecting) {
        connecting = false;
        ctx.setConnection(null);
      }
    };
    ctx.on('detach', cancelConnection);

    /** What the line follows: the pointer, or — over a handle that would make a valid connection — that handle. */
    const connectionEnd = (
      from: Endpoint,
      start: HandleRecord,
      reconnecting: boolean,
      clientX: number,
      clientY: number,
    ) => {
      const hit = handleAt(clientX, clientY);
      // The handle under the pointer, whether or not dropping there would actually connect — so a
      // consumer of `useConnection` can colour it as a target either way, as React Flow's own does.
      const to = hit
        ? { toNodeId: hit.nodeId, toHandleId: hit.record.id, toHandleType: hit.record.type }
        : { toNodeId: null, toHandleId: null, toHandleType: null };
      if (hit) {
        const c = connectionBetween(from, { nodeId: hit.nodeId, id: hit.record.id, type: hit.record.type });
        const point = pointOfHandle(hit.nodeId, hit.record);
        if (c && isAllowed(c, start, reconnecting) && point) {
          return { end: point, endPosition: hit.record.position, isValid: true, ...to };
        }
      }
      return {
        end: ctx.toGraph(clientX, clientY),
        endPosition: OPPOSITE[start.position],
        isValid: hit ? false : null,
        ...to,
      };
    };

    /**
     * The gesture is followed on `window`, so it survives the pointer leaving the handle, the node and
     * the canvas; Escape cancels it. Nothing here edits `edges` — a finished connection is handed to
     * `onConnect` for the caller to add.
     */
    const beginConnection: ConnectApi['beginConnection'] = (nodeId, record, at, reconnect) => {
      const start = pointOfHandle(nodeId, record);
      if (!start) return;
      cancelConnection();

      const from: Endpoint = { nodeId, id: record.id, type: record.type };
      const follow = (clientX: number, clientY: number) => {
        connecting = true;
        ctx.setConnection({
          start,
          startPosition: record.position,
          fromNodeId: nodeId,
          fromHandleId: record.id,
          fromHandleType: record.type,
          ...connectionEnd(from, record, reconnect !== null, clientX, clientY),
          reconnecting: reconnect?.edge.id ?? null,
        });
      };
      follow(at.clientX, at.clientY);
      if (reconnect) ctx.callbacks.onReconnectStart?.(at, reconnect.edge, reconnect.end);
      else ctx.callbacks.onConnectStart?.(at, { nodeId, handleId: record.id, handleType: record.type });

      // Held near the edge, the view pans — and the line's free end, being in graph
      // space, has to be worked out again against the view it has just moved to.
      let pointer = { x: at.clientX, y: at.clientY };
      const stopAutoPan = ctx.api(autoPanFeature).beginAutoPan(
        'connect',
        () => pointer,
        () => {
          follow(pointer.x, pointer.y);
        },
      );

      const onMove = (e: PointerEvent) => {
        pointer = { x: e.clientX, y: e.clientY };
        follow(e.clientX, e.clientY);
      };
      const onUp = (e: PointerEvent) => {
        const hit = handleAt(e.clientX, e.clientY);
        cancelConnection(); // clear first, so a callback sees a settled canvas
        const c = hit
          ? connectionBetween(from, { nodeId: hit.nodeId, id: hit.record.id, type: hit.record.type })
          : null;
        const valid = hit === null ? null : c !== null && isAllowed(c, record, reconnect !== null);
        if (reconnect) {
          // Dropped back where it came from is not a change.
          if (c && valid && !sameEnds(reconnect.edge, c)) ctx.callbacks.onReconnect?.(reconnect.edge, c);
          ctx.callbacks.onReconnectEnd?.(e, reconnect.edge, reconnect.end, { connection: c, isValid: valid });
          return;
        }
        if (c && valid) {
          ctx.callbacks.onConnect?.(c);
          record.options?.current.onConnect?.(c);
        }
        ctx.callbacks.onConnectEnd?.(e, { connection: c, isValid: valid });
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') cancelConnection();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', cancelConnection);
      window.addEventListener('keydown', onKey);
      stopConnecting = () => {
        stopAutoPan();
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', cancelConnection);
        window.removeEventListener('keydown', onKey);
      };
    };

    const startConnection: ConnectApi['startConnection'] = (nodeId, handleEl, at) => {
      const record = [...ctx.handlesOf(nodeId)].find((r) => r.el === handleEl);
      if (record) beginConnection(nodeId, record, at, null);
    };

    return { startConnection, beginConnection };
  },

  useNode({ store, node }) {
    const { startConnection } = store.api(connectFeature);
    const id = node.id;
    // Stable, so a node's context — and every handle reading it — is not remade on each render.
    const start = useCallback(
      (handle: HTMLElement, at: PointerEvent) => {
        startConnection(id, handle, at);
      },
      [startConnection, id],
    );
    return { startConnection: start };
  },

  EdgesLayer: ConnectionLine,
};
