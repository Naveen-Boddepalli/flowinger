import { type HTMLAttributes, useCallback, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useFlowingerStore } from '../context.ts';
import type { Feature } from '../features.ts';
import type { FlowingerEdgesProps } from '../FlowingerEdges.tsx';
import { handleCoordinates } from '../handlePoint.ts';
import { HIDDEN } from '../hidden.ts';
import { pathFor } from '../paths.ts';
import { isInteractive } from '../pointer.ts';
import type { HandleRecord } from '../store.ts';
import {
  ConnectionLineType,
  type AriaLabelConfig,
  type Connection,
  type Edge,
  type FlowingerProps,
  type HandleType,
  type Node,
  type Position,
  type XYPosition,
} from '../types.ts';
import type { A11yApi } from './a11y.tsx';
import { autoPanFeature } from './autoPan.ts';

/** Where a connection end lives: a node, one of its handles by id (null = unnamed), and that handle's type. */
interface Endpoint {
  nodeId: string;
  id: string | null;
  type: HandleType;
}

/**
 * How far from a handle, in screen pixels, a finger may land and still be on it. A fingertip is not a 10 px dot,
 * and a graph fitted to a phone draws the dot smaller still.
 */
const TOUCH_REACH = 20;
/** What is said as a connection is made by pressing handles, in English; `ariaLabelConfig` replaces any of it. */
const SAID = {
  'handle.a11yDescription.default': 'Press enter to connect from this handle, then enter on another to connect to it.',
  'connection.ariaLiveMessage.start': ({ from }: { from: string }) =>
    `Connecting from ${from}. Press enter on another handle, or escape to cancel.`,
  'connection.ariaLiveMessage.connected': ({ from, to }: { from: string; to: string }) => `Connected ${from} to ${to}.`,
  'connection.ariaLiveMessage.invalid': ({ from, to }: { from: string; to: string }) =>
    `${from} cannot be connected to ${to}.`,
  'connection.ariaLiveMessage.cancelled': 'Connection cancelled.',
};
/** One of the above: the caller's (`ariaLabelConfig`), else the default. */
const said = <K extends keyof typeof SAID>(labels: AriaLabelConfig, key: K) => (labels[key] ?? SAID[key]) as (typeof SAID)[K];

/** A handle's name: what the caller called handles (`handle.ariaLabel`), or its kind and id. */
const handleName = (labels: AriaLabelConfig, id: string | null, type: HandleType): string =>
  labels['handle.ariaLabel'] ?? `${type} handle ${id ?? ''}`.trim();

/**
 * A handle and its node, as a sentence names them. The node by its `ariaLabel`, else its `data.label` (as React
 * Flow's own nodes are labelled), else the text it shows, else its id.
 */
const describe = (labels: AriaLabelConfig, node: Node | undefined, nodeId: string, record: HandleRecord): string => {
  const label = node?.data.label;
  const shown = record.el.closest<HTMLElement>('.react-flow__node');
  const name = node?.ariaLabel ?? (typeof label === 'string' ? label : (shown?.innerText ?? shown?.textContent));
  return `${handleName(labels, record.id, record.type)} of ${name?.replace(/\s+/g, ' ').trim() || nodeId}`;
};

/** How far a tap may drift, in screen pixels, and still be the tap that pressed near a handle. */
const TAP_SLOP = 10;

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
  /**
   * A click on a handle: the first begins a connection (`onClickConnectStart`), the second, on another, ends
   * it — made if valid, and `onClickConnectEnd` either way. Does nothing with `connectOnClick` off.
   */
  clickConnect: (nodeId: string, handleEl: HTMLElement, at: MouseEvent) => void;
  /**
   * Enter or Space on a handle: as a click, but whether or not `connectOnClick` is on — a keyboard cannot drag —
   * and without `onClickConnectStart` / `onClickConnectEnd`, which are given mouse events. Pressing the handle a
   * connection began at again lets go of it.
   */
  pressConnect: (nodeId: string, handleEl: HTMLElement) => void;
  /** Lets go of a connection begun by a click or a press, if there is one, and says so; false if there was none. */
  cancelPress: () => boolean;
  /** The handle a first click began a connection from (`connectOnClick`), until the second click or Escape. */
  getClickStart: () => { nodeId: string; id: string | null; type: HandleType } | null;
  subscribeClickStart: (listener: () => void) => () => void;
  /**
   * The handle a finger at a screen point is on, give or take {@link TOUCH_REACH}: the nearest that may start
   * a connection. Given the node the finger is on, only its handles and those of the nodes inside it; and on a
   * node the reach stops halfway to its centre — so a node smaller than a finger's reach is still dragged from
   * its middle.
   */
  handleNearTouch: (clientX: number, clientY: number, onNode: string | null) => { nodeId: string; record: HandleRecord } | null;
  /** What the canvas was last given for the props that shape a connection; written by `useCanvas`. */
  readonly config: {
    dragThreshold: number;
    radius: number;
    reconnectRadius: number;
    connectOnClick: boolean;
    onClickStart: FlowingerProps['onClickConnectStart'];
    onClickEnd: FlowingerProps['onClickConnectEnd'];
    /** Whether two fingers are pinching, which a connection gives way to. */
    isPinching: () => boolean;
    /** Handles can be operated from the keyboard (not `disableKeyboardA11y`). */
    keyboard: boolean;
    /** Unique to this canvas, for the hint every handle points at. */
    id: string;
    labels: AriaLabelConfig;
    /** Tells a screen reader (`a11yFeature`'s live region; nothing without it). */
    say: (message: string) => void;
  };
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
    const config: ConnectApi['config'] = {
      dragThreshold: 1,
      radius: 20,
      reconnectRadius: 10,
      connectOnClick: true,
      onClickStart: undefined,
      onClickEnd: undefined,
      isPinching: () => false,
      keyboard: true,
      id: 'flowinger-connect',
      labels: {},
      say: () => undefined,
    };
    /** The handle a first click was made on, waiting for a second. */
    let pending: { nodeId: string; record: HandleRecord } | null = null;
    // What a first click began from, in React Flow's shape (13's `connectionClickStartHandle`).
    let clickStart: ReturnType<ConnectApi['getClickStart']> = null;
    const clickStartListeners = new Set<() => void>();
    const setClickStart = (next: typeof clickStart) => {
      clickStart = next;
      for (const listener of clickStartListeners) listener();
    };
    /** The handle a drag just ended on: the click that follows it is not the start of a click connection. */
    let afterDrag: HTMLElement | null = null;

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
    /**
     * The connectable handle nearest a screen point within `radius` graph units that `take` accepts; of several
     * at one distance (overlapping handles), one of type `prefer`. With `halfway`, on a node the reach stops
     * halfway from its handle to its centre — a finger on the middle is dragging the node.
     */
    const nearestHandle = (
      clientX: number,
      clientY: number,
      radius: number,
      take: (nodeId: string, record: HandleRecord) => boolean,
      prefer: HandleType | null,
      halfway = false,
    ): { nodeId: string; record: HandleRecord } | null => {
      if (radius <= 0) return null;
      const p = ctx.toGraph(clientX, clientY);
      let best: { nodeId: string; record: HandleRecord } | null = null;
      let bestDistance = Infinity;
      for (const node of ctx.nodes) {
        if (node.hidden === true) continue;
        // A handle sits on its node's edge, give or take its own size: look only at nodes the point is near.
        const at = ctx.absolutePosition(node);
        const size = ctx.getNodeSize(node);
        const margin = radius + 50;
        if (p.x < at.x - margin || p.x > at.x + size.width + margin) continue;
        if (p.y < at.y - margin || p.y > at.y + size.height + margin) continue;
        const inside = halfway && p.x >= at.x && p.x <= at.x + size.width && p.y >= at.y && p.y <= at.y + size.height;
        for (const record of ctx.handlesOf(node.id)) {
          if (!record.el.hasAttribute('data-connectable') || !take(node.id, record)) continue;
          const point = pointOfHandle(node.id, record);
          if (!point) continue;
          const distance = Math.hypot(point.x - p.x, point.y - p.y);
          const limit = inside
            ? Math.min(radius, Math.hypot(at.x + size.width / 2 - point.x, at.y + size.height / 2 - point.y) / 2)
            : radius;
          if (distance > limit || distance > bestDistance) continue;
          if (distance < bestDistance || record.type === prefer) {
            best = { nodeId: node.id, record };
            bestDistance = distance;
          }
        }
      }
      return best;
    };

    /** Where a drag may end: not the handle it began at, nor one that cannot end a connection. */
    const dropNear = (clientX: number, clientY: number, from: Endpoint, radius: number) =>
      nearestHandle(
        clientX,
        clientY,
        radius,
        (nodeId, record) =>
          !(nodeId === from.nodeId && record.id === from.id && record.type === from.type) &&
          record.options?.current.isConnectableEnd !== false,
        // The opposite kind is the one to end at.
        from.type === 'source' ? 'target' : 'source',
      );

    /** Whether a node is `root` or inside it, at any depth. */
    const within = (id: string | undefined, root: string): boolean =>
      id !== undefined && (id === root || within(ctx.nodeById.get(id)?.parentId, root));

    const handleNearTouch: ConnectApi['handleNearTouch'] = (clientX, clientY, onNode) =>
      nearestHandle(
        clientX,
        clientY,
        TOUCH_REACH / ctx.viewport.zoom,
        (nodeId, record) =>
          (onNode === null || within(nodeId, onNode)) && record.options?.current.isConnectableStart !== false,
        null,
        true,
      );

    const handleAt = (
      clientX: number,
      clientY: number,
      from: Endpoint,
      radius: number,
    ): { nodeId: string; record: HandleRecord } | null => {
      if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return null;
      const el = document
        .elementFromPoint(clientX, clientY)
        ?.closest<HTMLElement>('[data-nodeid][data-handletype][data-connectable]');
      const nodeId = el?.dataset.nodeid;
      if (el && nodeId) {
        for (const record of ctx.handlesOf(nodeId)) {
          // A handle that cannot end a connection is not there, as far as a drop is concerned.
          if (record.el === el) {
            return record.options?.current.isConnectableEnd === false
              ? dropNear(clientX, clientY, from, radius)
              : { nodeId, record };
          }
        }
      }
      // Not over one: the nearest within reach, as React Flow's `connectionRadius`.
      return dropNear(clientX, clientY, from, radius);
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
      radius: number,
      clientX: number,
      clientY: number,
    ) => {
      const hit = handleAt(clientX, clientY, from, radius);
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
      const base = reconnect ? config.reconnectRadius : config.radius;
      // A finger drops near a handle as it presses near one: at least its reach, in screen pixels, at this zoom.
      const radius =
        at.pointerType === 'touch' && base > 0 ? Math.max(base, TOUCH_REACH / ctx.viewport.zoom) : base;
      const follow = (clientX: number, clientY: number) => {
        connecting = true;
        ctx.setConnection({
          start,
          startPosition: record.position,
          fromNodeId: nodeId,
          fromHandleId: record.id,
          fromHandleType: record.type,
          ...connectionEnd(from, record, reconnect !== null, radius, clientX, clientY),
          reconnecting: reconnect?.edge.id ?? null,
        });
      };

      // A press is not a connection until the pointer has travelled `connectionDragThreshold` — so a click on
      // a handle is only a click.
      let started = false;
      let pointer = { x: at.clientX, y: at.clientY };
      let stopAutoPan = () => {};
      const begin = () => {
        started = true;
        follow(at.clientX, at.clientY);
        if (reconnect) ctx.callbacks.onReconnectStart?.(at, reconnect.edge, reconnect.end);
        else ctx.callbacks.onConnectStart?.(at, { nodeId, handleId: record.id, handleType: record.type });
        // Held near the edge, the view pans — and the line's free end, being in graph
        // space, has to be worked out again against the view it has just moved to.
        stopAutoPan = ctx.api(autoPanFeature).beginAutoPan(
          'connect',
          () => pointer,
          () => {
            follow(pointer.x, pointer.y);
          },
        );
      };
      if (config.dragThreshold <= 0) begin();

      const onMove = (e: PointerEvent) => {
        // Another finger is not this gesture's; two of them are a pinch, which this gives way to.
        if (e.pointerId !== at.pointerId) return;
        if (config.isPinching()) {
          cancelConnection();
          return;
        }
        pointer = { x: e.clientX, y: e.clientY };
        if (!started) {
          if (Math.hypot(e.clientX - at.clientX, e.clientY - at.clientY) <= config.dragThreshold) return;
          begin();
        }
        follow(e.clientX, e.clientY);
      };
      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== at.pointerId) return;
        // A flick: released far from the press with no move between (a touch, a fast mouse) — it travelled.
        if (!started && Math.hypot(e.clientX - at.clientX, e.clientY - at.clientY) > config.dragThreshold) begin();
        const hit = started ? handleAt(e.clientX, e.clientY, from, radius) : null;
        const began = started;
        cancelConnection(); // clear first, so a callback sees a settled canvas
        // What was only a press is for the click that follows it (`connectOnClick`), not for us.
        if (!began) return;
        // The click a release over the handle it began at makes is the end of this drag, not a first click.
        afterDrag = record.el;
        setTimeout(() => {
          afterDrag = null;
        }, 0);
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

    const clearPending = () => {
      pending?.record.el.classList.remove('clickconnecting');
      pending?.record.el.removeAttribute('aria-pressed');
      pending = null;
      if (clickStart) setClickStart(null);
    };
    ctx.on('detach', clearPending);

    const cancelPress: ConnectApi['cancelPress'] = () => {
      if (!pending) return false;
      clearPending();
      config.say(said(config.labels, 'connection.ariaLiveMessage.cancelled'));
      return true;
    };

    /** The first press on a handle begins a connection, the second, on another, ends it: a click (`e`) or a key. */
    const press = (nodeId: string, handleEl: HTMLElement, e: MouseEvent | null) => {
      const record = [...ctx.handlesOf(nodeId)].find((r) => r.el === handleEl);
      if (!record) return;
      const { labels, say } = config;
      if (!pending) {
        if (record.options?.current.isConnectableStart === false) return;
        pending = { nodeId, record };
        setClickStart({ nodeId, id: record.id, type: record.type });
        record.el.classList.add('clickconnecting');
        // Set here rather than rendered, so a connection begun on one node does not redraw every node.
        if (config.keyboard) record.el.setAttribute('aria-pressed', 'true');
        if (e) config.onClickStart?.(e, { nodeId, handleId: record.id, handleType: record.type });
        say(said(labels, 'connection.ariaLiveMessage.start')({ from: describe(labels, ctx.nodeById.get(nodeId), nodeId, record) }));
        return;
      }
      if (!e && pending.record === record) {
        cancelPress();
        return;
      }
      const first = pending;
      clearPending();
      const c =
        record.options?.current.isConnectableEnd === false
          ? null
          : connectionBetween(
              { nodeId: first.nodeId, id: first.record.id, type: first.record.type },
              { nodeId, id: record.id, type: record.type },
            );
      const valid = c !== null && isAllowed(c, first.record, false);
      if (c && valid) {
        ctx.callbacks.onConnect?.(c);
        first.record.options?.current.onConnect?.(c);
      }
      if (e) config.onClickEnd?.(e, { connection: c, isValid: valid });
      const ends = {
        from: describe(labels, ctx.nodeById.get(first.nodeId), first.nodeId, first.record),
        to: describe(labels, ctx.nodeById.get(nodeId), nodeId, record),
      };
      say(said(labels, valid ? 'connection.ariaLiveMessage.connected' : 'connection.ariaLiveMessage.invalid')(ends));
    };

    const clickConnect: ConnectApi['clickConnect'] = (nodeId, handleEl, e) => {
      if (!config.connectOnClick) return;
      if (afterDrag === handleEl) {
        afterDrag = null;
        return;
      }
      press(nodeId, handleEl, e);
    };

    return {
      startConnection,
      beginConnection,
      clickConnect,
      pressConnect: (nodeId, handleEl) => {
        press(nodeId, handleEl, null);
      },
      cancelPress,
      handleNearTouch,
      config,
      getClickStart: () => clickStart,
      subscribeClickStart: (listener) => {
        clickStartListeners.add(listener);
        return () => {
          clickStartListeners.delete(listener);
        };
      },
    };
  },

  useCanvas({ store, props }) {
    const { config, handleNearTouch, beginConnection, clickConnect, cancelPress } = store.api(connectFeature);
    config.dragThreshold = props.connectionDragThreshold ?? 1;
    config.radius = props.connectionRadius ?? 20;
    config.reconnectRadius = props.reconnectRadius ?? 10;
    config.connectOnClick = props.connectOnClick ?? true;
    config.onClickStart = props.onClickConnectStart;
    config.onClickEnd = props.onClickConnectEnd;
    config.isPinching = store.isPinching;
    config.keyboard = props.disableKeyboardA11y !== true;
    config.labels = props.ariaLabelConfig ?? {};
    // Unique per canvas, and the same on the server and the client.
    config.id = `flowinger-connect-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
    // Said in `a11yFeature`'s live region, on a canvas that has it.
    config.say = (store.apiOf('a11y') as A11yApi | undefined)?.say ?? config.say;
    // A press near a handle, waiting for the click a tap ends with.
    const tap = useRef<{ nodeId: string; el: HTMLElement; x: number; y: number } | null>(null);
    return {
      // Escape anywhere in the canvas lets go of a connection begun by a click or a press.
      onKeyDown: (e) => {
        if (e.key !== 'Escape' || !cancelPress()) return false;
        e.preventDefault();
        return true;
      },
      props: {
        // A finger that lands near a handle is on it: the press starts a connection from it, as a press on the
        // handle would, and the click a tap ends with is the handle's (`connectOnClick`). Only on the bare pane
        // or a node — not on an edge, a control, or what a node keeps for itself (`nodrag`, a button…).
        onPointerDownCapture: (e) => {
          tap.current = null;
          if (e.pointerType !== 'touch' || !e.isPrimary || !(e.target instanceof Element)) return;
          if (e.target.closest('[data-handletype]')) return; // on a handle already: its own
          const nodeEl = e.target.closest<HTMLElement>('.react-flow__node');
          const onPane = e.target === e.currentTarget;
          if (!onPane && (!nodeEl || isInteractive(e.target, store.getOptions().ignored))) return;
          const hit = handleNearTouch(e.clientX, e.clientY, onPane ? null : (nodeEl?.dataset.id ?? null));
          if (!hit) return;
          e.stopPropagation();
          e.preventDefault();
          tap.current = { nodeId: hit.nodeId, el: hit.record.el, x: e.clientX, y: e.clientY };
          beginConnection(hit.nodeId, hit.record, e.nativeEvent, null);
        },
        onClickCapture: (e) => {
          const near = tap.current;
          tap.current = null;
          if (!near || e.target === near.el || Math.hypot(e.clientX - near.x, e.clientY - near.y) > TAP_SLOP) return;
          e.stopPropagation();
          clickConnect(near.nodeId, near.el, e.nativeEvent);
        },
      },
    };
  },

  useNode({ store, node }) {
    const { startConnection, clickConnect, pressConnect, cancelPress, config } = store.api(connectFeature);
    const id = node.id;
    // Stable, so a node's context — and every handle reading it — is not remade on each render.
    const start = useCallback(
      (handle: HTMLElement, at: PointerEvent) => {
        startConnection(id, handle, at);
      },
      [startConnection, id],
    );
    const click = useCallback(
      (handle: HTMLElement, at: MouseEvent) => {
        clickConnect(id, handle, at);
      },
      [clickConnect, id],
    );
    // A node's handles are tab stops while focus is inside it — on the node, or on one of them — so the tab order
    // goes node by node, and from a node into its handles.
    const [within, setWithin] = useState(false);
    const { keyboard, labels, id: hint } = config;
    const handleProps = useCallback(
      (handleId: string | null, type: HandleType): HTMLAttributes<HTMLDivElement> =>
        keyboard
          ? {
              tabIndex: within ? 0 : -1,
              role: 'button',
              'aria-label': handleName(labels, handleId, type),
              'aria-describedby': `${hint}-handle-desc`,
              onKeyDown: (e) => {
                if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
                if (e.key === 'Enter' || e.key === ' ') pressConnect(id, e.currentTarget);
                else if (e.key !== 'Escape' || !cancelPress()) return;
                // The handle's, not the node's or the canvas's: Space would scroll the page, or hold a pan.
                e.preventDefault();
                e.stopPropagation();
              },
            }
          : {},
      [keyboard, labels, hint, within, id, pressConnect, cancelPress],
    );
    return {
      startConnection: start,
      clickConnect: click,
      handleProps,
      props: {
        onFocusCapture: () => {
          setWithin(true);
        },
        onBlurCapture: (e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Element | null)) setWithin(false);
        },
      },
    };
  },

  Layer: HandleHint,
  EdgesLayer: ConnectionLine,
};

/** The hint every handle that can be operated from the keyboard points at (`aria-describedby`). */
function HandleHint() {
  const { config } = useFlowingerStore().api(connectFeature);
  return config.keyboard ? (
    <div id={`${config.id}-handle-desc`} style={HIDDEN}>
      {said(config.labels, 'handle.a11yDescription.default')}
    </div>
  ) : null;
}
