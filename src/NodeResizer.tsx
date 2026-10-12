import {
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useFlowingerStore, useNodeId } from './context.ts';
import { resizeFeature } from './features/resize.ts';
import { capturePointer, releasePointer } from './pointer.ts';
import type { Rect } from './types.ts';

/** What the resize callbacks are told: the node's box as it now is, in graph units. */
export type ResizeParams = Rect;

export interface NodeResizerProps {
  /** The id of the node to resize. Inferred from node context when omitted. */
  nodeId?: string;
  /** Show the handles. Default true — often `isVisible={selected}`. */
  isVisible?: boolean;
  /** The colour of the lines and handles. Default `--flowinger-selected`. */
  color?: string;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** Hold the node's aspect ratio while resizing. */
  keepAspectRatio?: boolean;
  /**
   * Keep the handles from shrinking out of reach when zoomed out: below zoom 1 they are drawn larger by
   * the inverse of the zoom. Default true, as in React Flow.
   */
  autoScale?: boolean;
  handleClassName?: string;
  handleStyle?: CSSProperties;
  lineClassName?: string;
  lineStyle?: CSSProperties;
  /** Return `false` to refuse a step of the resize. */
  shouldResize?: (event: ReactPointerEvent, params: ResizeParams) => boolean;
  onResizeStart?: (event: ReactPointerEvent, params: ResizeParams) => void;
  onResize?: (event: ReactPointerEvent, params: ResizeParams) => void;
  onResizeEnd?: (event: ReactPointerEvent, params: ResizeParams) => void;
}

export interface ResizeControlProps {
  /** The id of the node to resize. Inferred from node context when omitted. */
  nodeId?: string;
  /** Which side or corner of the node it sits on, and pushes. Default `'bottom-right'`. */
  position?: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /**
   * A `'handle'` is a small square on the side or corner (default); a `'line'` is a strip along a whole side
   * (on a corner it is a handle).
   */
  variant?: 'line' | 'handle';
  className?: string;
  style?: CSSProperties;
  /** Drawn inside the control — an icon on a handle, say. */
  children?: ReactNode;
  /** The colour of the handle, or of the line. Default `--flowinger-selected`. */
  color?: string;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  keepAspectRatio?: boolean;
  /** As on `NodeResizer`. */
  autoScale?: boolean;
  shouldResize?: (event: ReactPointerEvent, params: ResizeParams) => boolean;
  onResizeStart?: (event: ReactPointerEvent, params: ResizeParams) => void;
  onResize?: (event: ReactPointerEvent, params: ResizeParams) => void;
  onResizeEnd?: (event: ReactPointerEvent, params: ResizeParams) => void;
}

/** Which way a control pushes: -1 the near edge, 1 the far edge, 0 neither. */
const CONTROLS = [
  { name: 'top', x: 0, y: -1, cursor: 'ns-resize', kind: 'line' },
  { name: 'bottom', x: 0, y: 1, cursor: 'ns-resize', kind: 'line' },
  { name: 'left', x: -1, y: 0, cursor: 'ew-resize', kind: 'line' },
  { name: 'right', x: 1, y: 0, cursor: 'ew-resize', kind: 'line' },
  { name: 'top-left', x: -1, y: -1, cursor: 'nwse-resize', kind: 'handle' },
  { name: 'top-right', x: 1, y: -1, cursor: 'nesw-resize', kind: 'handle' },
  { name: 'bottom-left', x: -1, y: 1, cursor: 'nesw-resize', kind: 'handle' },
  { name: 'bottom-right', x: 1, y: 1, cursor: 'nwse-resize', kind: 'handle' },
] as const;

type Control = (typeof CONTROLS)[number];
type Kind = 'line' | 'handle';

const HANDLE = 8;
const HIT = 9;
const SELECTED = 'var(--flowinger-selected, #38bdf8)';
const noSubscription = () => () => {};

/** `top` / `left` pinned at 0, or 50%, or — on the far side — `bottom` / `right`, with where its centre goes. */
function axis(v: number, near: 'top' | 'left', far: 'bottom' | 'right'): CSSProperties {
  return v === 0 ? { [near]: '50%' } : { [v < 0 ? near : far]: 0 };
}
const shift = (v: number) => (v > 0 ? '50%' : '-50%');

function placement(c: Control, kind: Kind, scale: number): CSSProperties {
  if (kind === 'handle' || (c.x !== 0 && c.y !== 0)) {
    return {
      ...axis(c.y, 'top', 'bottom'),
      ...axis(c.x, 'left', 'right'),
      // About its centre, which is on the corner (or the middle of the side) either way.
      transform: `translate(${shift(c.x)}, ${shift(c.y)})${scale === 1 ? '' : ` scale(${String(scale)})`}`,
      width: HANDLE,
      height: HANDLE,
    };
  }
  // A side: a strip along the whole edge, half outside the node.
  return c.x === 0
    ? { [c.y < 0 ? 'top' : 'bottom']: -HIT / 2, left: 0, right: 0, height: HIT }
    : { [c.x < 0 ? 'left' : 'right']: -HIT / 2, top: 0, bottom: 0, width: HIT };
}

interface Session {
  pointerId: number;
  startX: number;
  startY: number;
  from: Rect;
}

/**
 * One control that resizes its node: a handle on a corner or a side, or a strip along a side. Goes inside
 * the node's component, or anywhere with `nodeId`. `NodeResizer` is eight of these; use this one to put a
 * single control — or your own icon — where you want it. A resize is *reported* (a `dimensions` change
 * with `setAttributes`, and a `position` change when the top-left moves), so it needs a controlled flow or
 * `defaultNodes` to have anything to write the size to.
 */
export function NodeResizeControl({
  nodeId,
  position = 'bottom-right',
  variant = 'handle',
  className = '',
  style,
  children,
  color = SELECTED,
  minWidth = 10,
  minHeight = 10,
  maxWidth = Number.MAX_SAFE_INTEGER,
  maxHeight = Number.MAX_SAFE_INTEGER,
  keepAspectRatio = false,
  autoScale = true,
  shouldResize,
  onResizeStart,
  onResize,
  onResizeEnd,
}: ResizeControlProps) {
  const store = useFlowingerStore();
  // A resize control needs nothing of the canvas but this, so it brings it (idempotently, and only if it is drawn).
  store.use([resizeFeature]);
  const { resizeNode, endResize } = store.api(resizeFeature);
  const contextId = useNodeId();
  const id = nodeId ?? contextId;
  const session = useRef<Session | null>(null);
  const c = CONTROLS.find((control) => control.name === position) ?? CONTROLS[7];
  const kind: Kind = c.x !== 0 && c.y !== 0 ? 'handle' : variant;
  // Only a handle follows the zoom — and only the zoom, so a pan does not draw it again.
  const zoom = useSyncExternalStore(
    autoScale && kind === 'handle' ? store.subscribeViewport : noSubscription,
    () => store.getViewport().zoom,
    () => 1,
  );
  if (id === null) return null;

  /** The box a drag by (dx, dy) — graph units — makes of where the node began. */
  const boxFor = (from: Rect, dx: number, dy: number): Rect => {
    let width = from.width + c.x * dx;
    let height = from.height + c.y * dy;
    if (keepAspectRatio && from.height > 0 && from.width > 0) {
      const ratio = from.width / from.height;
      // The axis moved further leads; a side control moves one axis, so it leads.
      if (c.x !== 0 && (c.y === 0 || Math.abs(dx) >= Math.abs(dy) * ratio)) height = width / ratio;
      else width = height * ratio;
    }
    width = Math.max(minWidth, Math.min(maxWidth, width));
    height = Math.max(minHeight, Math.min(maxHeight, height));
    return {
      // A far-edge drag leaves the top-left where it is; a near-edge one moves it by what the size lost.
      x: c.x < 0 ? from.x + from.width - width : from.x,
      y: c.y < 0 ? from.y + from.height - height : from.y,
      width,
      height,
    };
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const from = store.getNodeRect(id);
    if (!from) return;
    // Neither the node (a drag) nor the canvas (a pan) may take this press.
    e.stopPropagation();
    e.preventDefault();
    capturePointer(e.currentTarget, e.pointerId);
    session.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, from };
    onResizeStart?.(e, from);
  };

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = session.current;
    if (s?.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const z = store.getViewport().zoom;
    const next = boxFor(s.from, (e.clientX - s.startX) / z, (e.clientY - s.startY) / z);
    if (shouldResize && !shouldResize(e, next)) return;
    resizeNode(id, next, true);
    onResize?.(e, next);
  };

  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = session.current;
    if (s?.pointerId !== e.pointerId) return;
    session.current = null;
    e.stopPropagation();
    releasePointer(e.currentTarget, e.pointerId);
    endResize(id);
    onResizeEnd?.(e, store.getNodeRect(id) ?? s.from);
  };

  return (
    <div
      className={`flowinger-resize-control react-flow__resize-control nodrag nopan ${kind} ${c.name} ${className}`.trim()}
      style={{
        position: 'absolute',
        cursor: c.cursor,
        pointerEvents: 'all',
        zIndex: 5,
        touchAction: 'none',
        ...placement(c, kind, autoScale && kind === 'handle' ? Math.max(1 / zoom, 1) : 1),
        ...(kind === 'handle'
          ? { background: color, border: '1px solid var(--flowinger-surface, #1e293b)', borderRadius: 1 }
          : {}),
        ...style,
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={(e) => {
        e.stopPropagation(); // not a click on the node, so no selection change
      }}
    >
      {kind === 'line' ? (
        <div
          style={{
            position: 'absolute',
            background: color,
            pointerEvents: 'none',
            ...(c.x === 0
              ? { left: 0, right: 0, top: HIT / 2 - 0.5, height: 1 }
              : { top: 0, bottom: 0, left: HIT / 2 - 0.5, width: 1 }),
          }}
        />
      ) : null}
      {children}
    </div>
  );
}

/**
 * Drag handles on a node — its sides and corners — that resize it. Goes inside
 * the node's component. A resize is *reported* (a `dimensions` change with
 * `setAttributes`, and a `position` change when the top-left moves), so it needs
 * a controlled flow or `defaultNodes` to have anything to write the size to.
 */
export function NodeResizer({
  nodeId,
  isVisible = true,
  color,
  handleClassName = '',
  handleStyle,
  lineClassName = '',
  lineStyle,
  ...shared
}: NodeResizerProps) {
  const contextId = useNodeId();
  const id = nodeId ?? contextId;
  if (!isVisible || id === null) return null;
  return (
    <>
      {CONTROLS.map((c) => (
        <NodeResizeControl
          key={c.name}
          {...shared}
          nodeId={id}
          position={c.name}
          variant={c.kind}
          {...(color === undefined ? {} : { color })}
          className={c.kind === 'handle' ? handleClassName : lineClassName}
          {...((c.kind === 'handle' ? handleStyle : lineStyle) === undefined
            ? {}
            : { style: c.kind === 'handle' ? handleStyle : lineStyle })}
        />
      ))}
    </>
  );
}
