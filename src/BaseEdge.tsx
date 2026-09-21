import { useContext, useRef, useState, type CSSProperties } from 'react';
import { EdgeContext } from './edgeContext.ts';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect.ts';

/** Read from `--flowinger-edge` so a consumer can theme every edge at once. */
export const DEFAULT_EDGE_COLOR = 'var(--flowinger-edge, #b1b1b7)';
const SELECTED_EDGE_COLOR = 'var(--flowinger-selected, #38bdf8)';

/** How wide, in graph units, the invisible strip that catches a click on a selectable edge is. */
const DEFAULT_INTERACTION_WIDTH = 20;

const labelTextStyle: CSSProperties = {
  fontSize: 12,
  fill: 'var(--flowinger-text, #e2e8f0)',
  pointerEvents: 'none',
};

// A halo in the surface colour keeps the text readable where it crosses the
// line, without measuring the text to size a background box.
const labelHaloStyle: CSSProperties = {
  ...labelTextStyle,
  stroke: 'var(--flowinger-surface, #1e293b)',
  strokeWidth: 4,
  strokeLinejoin: 'round',
  paintOrder: 'stroke',
};

const DEFAULT_LABEL_PADDING: [number, number] = [2, 4];

export interface BaseEdgeProps {
  /** The SVG path data — from `getBezierPath` and friends, or your own. */
  path: string;
  label?: string | undefined;
  labelX?: number;
  labelY?: number;
  markerStart?: string | undefined;
  markerEnd?: string | undefined;
  style?: CSSProperties | undefined;
  /**
   * The width of an invisible strip along the path that takes the click, so a thin
   * edge is easy to hit. Default 20 when the edge is selectable or the canvas listens to edge events, else none.
   */
  interactionWidth?: number | undefined;
  /** Merged over the label's own style — `fill`, `fontSize`, and the rest of what SVG text takes. */
  labelStyle?: CSSProperties | undefined;
  /** A box behind the label, in place of the halo. Its size is measured, so it appears once the browser has laid the text out. */
  labelShowBg?: boolean | undefined;
  labelBgStyle?: CSSProperties | undefined;
  /** `[x, y]` between the text and the edge of its box. Default `[2, 4]`. */
  labelBgPadding?: [number, number] | undefined;
  labelBgBorderRadius?: number | undefined;
}

/**
 * How every built-in edge is drawn: a path, with an optional label, in the
 * default stroke. A custom edge can render this and add to it.
 */
export function BaseEdge({
  path,
  label,
  labelX = 0,
  labelY = 0,
  markerStart,
  markerEnd,
  style,
  interactionWidth,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding = DEFAULT_LABEL_PADDING,
  labelBgBorderRadius = 2,
}: BaseEdgeProps) {
  const { selected, selectable, interactive } = useContext(EdgeContext);
  const hitWidth = interactionWidth ?? (selectable || interactive ? DEFAULT_INTERACTION_WIDTH : 0);
  return (
    <>
      {/* Presentation attributes, so an edge's own `style` or a stylesheet rule wins. */}
      <path
        className="flowinger-edge-path react-flow__edge-path"
        d={path}
        fill="none"
        stroke={selected ? SELECTED_EDGE_COLOR : DEFAULT_EDGE_COLOR}
        strokeWidth={1}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={style}
      />
      {hitWidth > 0 && (
        <path
          className="flowinger-edge-interaction react-flow__edge-interaction"
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={hitWidth}
        />
      )}
      {label && (
        <EdgeLabel
          label={label}
          x={labelX}
          y={labelY}
          style={labelStyle}
          showBg={labelShowBg === true}
          bgStyle={labelBgStyle}
          bgPadding={labelBgPadding}
          bgBorderRadius={labelBgBorderRadius}
        />
      )}
    </>
  );
}

interface EdgeLabelProps {
  label: string;
  x: number;
  y: number;
  style: CSSProperties | undefined;
  showBg: boolean;
  bgStyle: CSSProperties | undefined;
  bgPadding: [number, number];
  bgBorderRadius: number;
}

/** The text of a label, and — asked for — the box behind it, sized to what the browser laid out. */
function EdgeLabel({ label, x, y, style, showBg, bgStyle, bgPadding, bgBorderRadius }: EdgeLabelProps) {
  const ref = useRef<SVGTextElement | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    // jsdom has no `getBBox`, and the server has no layout: no box there, the text still shows.
    if (!showBg || !el || typeof el.getBBox !== 'function') return;
    const { x: bx, y: by, width, height } = el.getBBox();
    setBox((was) =>
      was && was.x === bx && was.y === by && was.width === width && was.height === height
        ? was
        : { x: bx, y: by, width, height },
    );
  }, [showBg, label, x, y, style]);
  return (
    <>
      {showBg && box && (
        <rect
          className="flowinger-edge-label-bg react-flow__edge-textbg"
          x={box.x - bgPadding[0]}
          y={box.y - bgPadding[1]}
          width={box.width + 2 * bgPadding[0]}
          height={box.height + 2 * bgPadding[1]}
          rx={bgBorderRadius}
          ry={bgBorderRadius}
          style={{ fill: 'var(--flowinger-surface, #1e293b)', ...bgStyle }}
        />
      )}
      <text
        ref={ref}
        className="flowinger-edge-label react-flow__edge-text"
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ ...(showBg ? labelTextStyle : labelHaloStyle), ...style }}
      >
        {label}
      </text>
    </>
  );
}
