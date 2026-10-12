import {
  memo,
  useEffect,
  useReducer,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useFlowingerStore, useViewport } from './context.ts';
import { warnAcceptedProps } from './devWarnings.ts';
import { Panel, type PanelPosition } from './Panel.tsx';
import { capturePointer, releasePointer } from './pointer.ts';
import type { PassThroughHtml } from './attributes.ts';
import type { Node } from './types.ts';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MiniMapNodeProps {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: number;
  className: string;
  color?: string;
  shapeRendering?: string;
  strokeColor?: string;
  strokeWidth?: number;
  style?: CSSProperties;
  onClick?: (event: ReactMouseEvent) => void;
  selected?: boolean;
}

export function MiniMapNode({
  x,
  y,
  width,
  height,
  borderRadius,
  className,
  color,
  shapeRendering,
  strokeColor,
  strokeWidth,
  style,
  onClick,
}: MiniMapNodeProps) {
  return (
    <rect
      className={className}
      x={x}
      y={y}
      width={width}
      height={height}
      rx={borderRadius}
      ry={borderRadius}
      fill={color}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      shapeRendering={shapeRendering}
      style={style}
      onClick={onClick}
    />
  );
}

export interface MiniMapProps extends PassThroughHtml<'role', SVGSVGElement> {
  /** The size of the overview, in pixels. Default 200 × 150. */
  width?: number;
  height?: number;
  /** One colour for every node, or a function of the node. */
  nodeColor?: string | ((node: Node) => string);
  /** The outline of each node: a colour, or a function of the node. Default none. */
  nodeStrokeColor?: string | ((node: Node) => string);
  nodeStrokeWidth?: number;
  /** A class on each node's rectangle: a name, or a function of the node. */
  nodeClassName?: string | ((node: Node) => string);
  /** The rounding of each node's rectangle. Default 2. */
  nodeBorderRadius?: number;
  /** What dims the part of the graph outside the view. */
  maskColor?: string;
  /** An outline round the view. */
  maskStrokeColor?: string;
  maskStrokeWidth?: number;
  /** The colour behind the overview. Default the surface colour. */
  bgColor?: string;
  /** Pins the overview to the canvas, as `Panel` does; without it it sits where you put it. */
  position?: PanelPosition;
  /** Click or drag on the overview to move the view. Default true. */
  pannable?: boolean;
  /**
   * @unimplemented Accepted so code written for React Flow compiles; here a press or drag puts the view
   * where the pointer is, so there is no relative pan to invert.
   */
  inversePan?: boolean;
  /** The wheel over the overview zooms the canvas, about its centre. Default false. */
  zoomable?: boolean;
  /** How far one wheel tick zooms, as a multiple of the canvas's own wheel. Default 10, as in React Flow. */
  zoomStep?: number;
  /**
   * The margin round what is shown, in pixels of the overview. Left out, a twentieth of the larger side of
   * what is shown.
   */
  offsetScale?: number;
  /** Draws each node in place of the default rectangle; it is given the box, the colours and the class. */
  nodeComponent?: ComponentType<MiniMapNodeProps>;
  /** A press on a node in the overview that does not become a drag. */
  onNodeClick?: (event: ReactMouseEvent, node: Node) => void;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_NODE_COLOR = 'var(--flowinger-text-dim, #94a3b8)';
const DEFAULT_MASK = 'var(--flowinger-mask, rgba(15, 23, 42, 0.6))';
/** How much room to leave around what is shown, as a share of its larger side. */
const PADDING = 0.05;
/** How far, in pixels, a press may move and still be a click on a node. */
const CLICK_DISTANCE = 4;

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
export const MiniMap = /*#__PURE__*/ memo(function MiniMap({
  width = 200,
  height = 150,
  nodeColor = DEFAULT_NODE_COLOR,
  nodeStrokeColor,
  nodeStrokeWidth = 2,
  nodeClassName,
  nodeBorderRadius = 2,
  maskColor = DEFAULT_MASK,
  maskStrokeColor,
  maskStrokeWidth = 1,
  bgColor,
  position,
  pannable = true,
  inversePan,
  zoomable = false,
  zoomStep = 10,
  offsetScale,
  nodeComponent: NodeComponent,
  onNodeClick,
  ariaLabel = 'Minimap',
  className = '',
  style,
  ...rest
}: MiniMapProps) {
  if (process.env.NODE_ENV !== 'production') warnAcceptedProps('MiniMap', { inversePan });
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
  /** Where the press on the overview began, in client pixels: a click is one that has not moved far. */
  const press = useRef<{ x: number; y: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
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
    const at = store.absolutePosition(node);
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
  // The margin: a share of the larger side, or `offsetScale` pixels of the overview at the scale that fits
  // what is shown without one.
  const pad = empty
    ? 0
    : offsetScale === undefined
      ? Math.max(maxX - minX, maxY - minY) * PADDING
      : offsetScale * Math.max((maxX - minX) / width, (maxY - minY) / height);
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

  /** Where in the graph a pointer over the overview is. */
  const toGraph = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - offsetX) / scale + box.x,
      y: (e.clientY - rect.top - offsetY) / scale + box.y,
    };
  };

  const centreOn = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pane) return;
    const at = toGraph(e);
    const { zoom } = store.getViewport();
    void store.instance.setViewport({
      x: pane.width / 2 - at.x * zoom,
      y: pane.height / 2 - at.y * zoom,
      zoom,
    });
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    press.current = { x: e.clientX, y: e.clientY };
    if (!pannable) return;
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
    press.current = null;
    releasePointer(e.currentTarget, e.pointerId);
    redraw(); // nothing else changes on release, so ask for the box to be refitted
  };
  // A click is a press and a release in the same place. It is worked out here, from where the pointer
  // is, not from the node's own element: the overview holds the pointer's capture, so a `click` goes to it.
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const down = press.current;
    if (onNodeClick && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < CLICK_DISTANCE) {
      const at = toGraph(e);
      // Last drawn is on top.
      for (let i = rects.length - 1; i >= 0; i--) {
        const r = rects[i];
        if (r && at.x >= r.x && at.x <= r.x + r.w && at.y >= r.y && at.y <= r.y + r.h) {
          onNodeClick(e, r.node);
          break;
        }
      }
    }
    onPointerEnd(e);
  };

  // The wheel over the overview zooms the canvas — a native listener, because a passive one cannot stop the
  // page scrolling. About the centre of the view, as React Flow does.
  useEffect(() => {
    const el = svg.current;
    if (!zoomable || !el) return;
    const onWheel = (e: WheelEvent) => {
      const size = store.getContainerSize();
      if (!size) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002;
      void store.zoomAt(2 ** (-e.deltaY * unit * zoomStep), size.width / 2, size.height / 2);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [store, zoomable, zoomStep]);

  const overview = (
    <svg
      ref={svg}
      data-testid="rf__minimap"
      {...rest}
      className={`flowinger-minimap react-flow__minimap ${className}`.trim()}
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={height}
      viewBox={`${String(box.x)} ${String(box.y)} ${String(box.w)} ${String(box.h)}`}
      style={{
        display: 'block',
        background: bgColor ?? 'var(--flowinger-surface, #1e293b)',
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
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerEnd}
    >
      {rects.map(({ node, x, y, w, h }) => {
        const className = `flowinger-minimap-node ${(typeof nodeClassName === 'function' ? nodeClassName(node) : nodeClassName) ?? ''}`.trim();
        const fill = typeof nodeColor === 'function' ? nodeColor(node) : nodeColor;
        const stroke =
          typeof nodeStrokeColor === 'function' ? nodeStrokeColor(node) : nodeStrokeColor;
        if (NodeComponent) {
          return (
            <NodeComponent
              key={node.id}
              id={node.id}
              x={x}
              y={y}
              width={w}
              height={h}
              borderRadius={nodeBorderRadius}
              className={className}
              color={fill}
              {...(stroke === undefined ? {} : { strokeColor: stroke })}
              strokeWidth={nodeStrokeWidth}
              selected={node.selected === true}
            />
          );
        }
        return (
          <rect
            key={node.id}
            className={className}
            x={x}
            y={y}
            width={w}
            height={h}
            rx={nodeBorderRadius}
            fill={fill}
            {...(stroke === undefined ? {} : { stroke, strokeWidth: nodeStrokeWidth })}
          />
        );
      })}
      {view && (
        <>
          {/* Everything outside the view, dimmed: the whole box with the view cut out of it. */}
          <path
            className="flowinger-minimap-mask"
            fillRule="evenodd"
            fill={maskColor}
            {...(maskStrokeColor === undefined ? {} : { stroke: maskStrokeColor, strokeWidth: maskStrokeWidth })}
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
  return position ? <Panel position={position}>{overview}</Panel> : overview;
});
