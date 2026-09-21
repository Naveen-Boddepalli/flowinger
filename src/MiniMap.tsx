import {
  memo,
  useReducer,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useFlowingerStore, useViewport } from './context.ts';
import { capturePointer, releasePointer } from './pointer.ts';
import type { Node } from './types.ts';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MiniMapProps {
  /** The size of the overview, in pixels. Default 200 × 150. */
  width?: number;
  height?: number;
  /** One colour for every node, or a function of the node. */
  nodeColor?: string | ((node: Node) => string);
  /** What dims the part of the graph outside the view. */
  maskColor?: string;
  /** Click or drag on the overview to move the view. Default true. */
  pannable?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_NODE_COLOR = 'var(--flowinger-text-dim, #94a3b8)';
const DEFAULT_MASK = 'var(--flowinger-mask, rgba(15, 23, 42, 0.6))';
/** How much room to leave around what is shown, as a share of its larger side. */
const PADDING = 0.05;

/**
 * An overview of the whole graph, with the part currently in view cut out of a
 * dimming mask. Put it inside the provider, wherever you like — the canvas
 * itself does not need to be its parent.
 *
 * The overview always includes the visible region as well as the nodes, so
 * panning far off the graph zooms it out to keep both in sight.
 *
 * It is a pointer shortcut, not a control of its own: keyboard users have the
 * canvas's arrow keys and `Controls`, and the overview is announced as an image.
 */
export const MiniMap = memo(function MiniMap({
  width = 200,
  height = 150,
  nodeColor = DEFAULT_NODE_COLOR,
  maskColor = DEFAULT_MASK,
  pannable = true,
  ariaLabel = 'Minimap',
  className = '',
  style,
}: MiniMapProps) {
  const store = useFlowingerStore();
  // Positions, sizes, node lists and the pane's size all arrive as geometry
  // changes; the viewport is its own subscription.
  useSyncExternalStore(store.subscribeGeometry, store.getGeometryVersion, store.getGeometryVersion);
  const viewport = useViewport();
  /** A press began on the overview and has not ended: moves now steer the view. */
  const dragging = useRef(false);
  /**
   * The region shown, held still for the length of a drag. It always includes
   * the visible region, so moving the view would otherwise rescale the map under
   * the pointer and the drag would swim.
   */
  const frozen = useRef<Box | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  const pane = store.getContainerSize();
  const view =
    pane && pane.width > 0 && pane.height > 0
      ? {
          x: -viewport.x / viewport.zoom,
          y: -viewport.y / viewport.zoom,
          w: pane.width / viewport.zoom,
          h: pane.height / viewport.zoom,
        }
      : null;

  const rects = store.getNodes().filter((node) => node.hidden !== true).map((node) => {
    const at = store.resolvePosition(node.id, node.position);
    const size = store.getNodeSize(node);
    return { node, x: at.x, y: at.y, w: size.width, h: size.height };
  });

  // The region shown: every node, and the view.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number, w: number, h: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  };
  for (const r of rects) grow(r.x, r.y, r.w, r.h);
  if (view) grow(view.x, view.y, view.w, view.h);

  const empty = !Number.isFinite(minX);
  const pad = empty ? 0 : Math.max(maxX - minX, maxY - minY) * PADDING;
  const live: Box = empty
    ? { x: 0, y: 0, w: width, h: height }
    : { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  const box = frozen.current ?? live;

  // `preserveAspectRatio="xMidYMid meet"`, worked out by hand: the scale that
  // fits, and the letterbox that centres it. Needed to turn a pointer back
  // into a point in the graph.
  const scale = Math.min(width / box.w, height / box.h);
  const offsetX = (width - box.w * scale) / 2;
  const offsetY = (height - box.h * scale) / 2;

  const centreOn = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pane) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const graphX = (e.clientX - rect.left - offsetX) / scale + box.x;
    const graphY = (e.clientY - rect.top - offsetY) / scale + box.y;
    const { zoom } = store.getViewport();
    void store.instance.setViewport({
      x: pane.width / 2 - graphX * zoom,
      y: pane.height / 2 - graphY * zoom,
      zoom,
    });
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pannable || e.button !== 0) return;
    // The overview may sit inside the canvas: this press is not a pan, a drag or a pane click.
    e.stopPropagation();
    e.preventDefault();
    dragging.current = true;
    frozen.current = box; // what is on screen now is what the pointer is mapped to
    capturePointer(e.currentTarget, e.pointerId);
    centreOn(e);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (pannable && dragging.current) centreOn(e);
  };
  const onPointerEnd = (e: ReactPointerEvent<SVGSVGElement>) => {
    dragging.current = false;
    frozen.current = null;
    releasePointer(e.currentTarget, e.pointerId);
    redraw(); // nothing else changes on release, so ask for the box to be refitted
  };

  return (
    <svg
      className={`flowinger-minimap react-flow__minimap ${className}`.trim()}
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={height}
      viewBox={`${String(box.x)} ${String(box.y)} ${String(box.w)} ${String(box.h)}`}
      style={{
        display: 'block',
        background: 'var(--flowinger-surface, #1e293b)',
        // An inset shadow, not a border: a border would sit outside the drawing
        // area and shift where a pointer maps to by a pixel.
        boxShadow: 'inset 0 0 0 1px var(--flowinger-border, #334155)',
        borderRadius: 'var(--flowinger-radius, 8px)',
        touchAction: 'none',
        ...(pannable ? { cursor: 'pointer' } : {}),
        ...style,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {rects.map(({ node, x, y, w, h }) => (
        <rect
          key={node.id}
          className="flowinger-minimap-node"
          x={x}
          y={y}
          width={w}
          height={h}
          rx={2}
          fill={typeof nodeColor === 'function' ? nodeColor(node) : nodeColor}
        />
      ))}
      {view && (
        <>
          {/* Everything outside the view, dimmed: the whole box with the view cut out of it. */}
          <path
            className="flowinger-minimap-mask"
            fillRule="evenodd"
            fill={maskColor}
            d={`M${String(box.x)},${String(box.y)}h${String(box.w)}v${String(box.h)}h${String(-box.w)}z M${String(view.x)},${String(view.y)}h${String(view.w)}v${String(view.h)}h${String(-view.w)}z`}
          />
          <rect
            className="flowinger-minimap-view"
            x={view.x}
            y={view.y}
            width={view.w}
            height={view.h}
            fill="none"
            stroke="var(--flowinger-selected, #38bdf8)"
            strokeWidth={1.5 / scale}
            style={{ pointerEvents: 'none' }}
          />
        </>
      )}
    </svg>
  );
});
