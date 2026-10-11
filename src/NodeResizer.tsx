import { useRef, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
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
  /** Automatically scale resize controls with zoom level. */
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
  nodeId?: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  variant?: 'line' | 'handle';
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  color?: string;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  keepAspectRatio?: boolean;
  autoScale?: boolean;
  shouldResize?: (event: ReactPointerEvent, params: ResizeParams) => boolean;
  onResizeStart?: (event: ReactPointerEvent, params: ResizeParams) => void;
  onResize?: (event: ReactPointerEvent, params: ResizeParams) => void;
  onResizeEnd?: (event: ReactPointerEvent, params: ResizeParams) => void;
}

export function NodeResizeControl({
  position = 'bottom-right',
  variant = 'handle',
  className = '',
  style,
  color,
  children,
}: ResizeControlProps) {
  return (
    <div
      className={`react-flow__resize-control nodrag ${variant} ${position} ${className}`.trim()}
      style={{
        position: 'absolute',
        backgroundColor: color,
        ...style,
      }}
    >
      {children}
    </div>
  );
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

const HANDLE = 8;
const HIT = 9;

function placement(c: Control): CSSProperties {
  if (c.kind === 'handle') {
    return {
      [c.y < 0 ? 'top' : 'bottom']: 0,
      [c.x < 0 ? 'left' : 'right']: 0,
      transform: `translate(${c.x < 0 ? '-50%' : '50%'}, ${c.y < 0 ? '-50%' : '50%'})`,
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
 * Drag handles on a node — its sides and corners — that resize it. Goes inside
 * the node's component. A resize is *reported* (a `dimensions` change with
 * `setAttributes`, and a `position` change when the top-left moves), so it needs
 * a controlled flow or `defaultNodes` to have anything to write the size to.
 */
export function NodeResizer({
  isVisible = true,
  color = 'var(--flowinger-selected, #38bdf8)',
  minWidth = 10,
  minHeight = 10,
  maxWidth = Number.MAX_SAFE_INTEGER,
  maxHeight = Number.MAX_SAFE_INTEGER,
  keepAspectRatio = false,
  handleClassName = '',
  handleStyle,
  lineClassName = '',
  lineStyle,
  shouldResize,
  onResizeStart,
  onResize,
  onResizeEnd,
}: NodeResizerProps) {
  const store = useFlowingerStore();
  // A resizer needs nothing of the canvas but this, so it brings it (idempotently, and only if it is drawn).
  store.use([resizeFeature]);
  const { resizeNode, endResize } = store.api(resizeFeature);
  const id = useNodeId();
  const session = useRef<Session | null>(null);
  if (!isVisible || id === null) return null;

  /** The box a drag of `c` by (dx, dy) — graph units — makes of where the node began. */
  const boxFor = (c: Control, from: Rect, dx: number, dy: number): Rect => {
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

  const move = (c: Control) => (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = session.current;
    if (s?.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const zoom = store.getViewport().zoom;
    const next = boxFor(c, s.from, (e.clientX - s.startX) / zoom, (e.clientY - s.startY) / zoom);
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
    <>
      {CONTROLS.map((c) => (
        <div
          key={c.name}
          className={`flowinger-resize-control react-flow__resize-control nodrag nopan ${c.kind} ${c.name} ${
            c.kind === 'handle' ? handleClassName : lineClassName
          }`.trim()}
          style={{
            position: 'absolute',
            cursor: c.cursor,
            pointerEvents: 'all',
            zIndex: 5,
            touchAction: 'none',
            ...placement(c),
            ...(c.kind === 'handle'
              ? { background: color, border: '1px solid var(--flowinger-surface, #1e293b)', borderRadius: 1, ...handleStyle }
              : { ...lineStyle }),
          }}
          onPointerDown={down}
          onPointerMove={move(c)}
          onPointerUp={up}
          onPointerCancel={up}
          onClick={(e) => {
            e.stopPropagation(); // not a click on the node, so no selection change
          }}
        >
          {c.kind === 'line' && (
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
          )}
        </div>
      ))}
    </>
  );
}
