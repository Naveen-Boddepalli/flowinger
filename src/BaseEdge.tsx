import { useContext, useRef, type CSSProperties } from 'react';
import type { PassThroughSvg } from './attributes.ts';
import { EdgeContext } from './edgeContext.ts';

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
// line, without measuring the text to size a background box. 6, not 4: at 4 the
// line still showed in the gap between two stems ("TT" in "HTTPS" at 12px).
const labelHaloStyle: CSSProperties = {
  ...labelTextStyle,
  stroke: 'var(--flowinger-surface, #1e293b)',
  strokeWidth: 6,
  strokeLinejoin: 'round',
  paintOrder: 'stroke',
};

const DEFAULT_LABEL_PADDING: [number, number] = [2, 4];

/** Attributes the edge's path sets itself, so a caller's cannot replace them. */
type OwnedByPath = 'd' | 'fill' | 'stroke' | 'strokeWidth' | 'markerStart' | 'markerEnd' | 'path';

export interface BaseEdgeProps extends PassThroughSvg<SVGPathElement, OwnedByPath> {
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
  /** A box behind the label, in place of the halo — drawn by the `edgeLabels` feature, which measures the text, so it appears once the browser has laid it out. */
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
  ...rest
}: BaseEdgeProps) {
  const { selected, selectable, interactive, LabelBox } = useContext(EdgeContext);
  const textRef = useRef<SVGTextElement | null>(null);
  const boxed = labelShowBg === true && LabelBox !== null;
  const text = label;
  const labelText = (
    <text
      ref={textRef}
      className="flowinger-edge-label react-flow__edge-text"
      x={labelX}
      y={labelY}
      textAnchor="middle"
      dominantBaseline="central"
      style={{ ...(boxed ? labelTextStyle : labelHaloStyle), ...labelStyle }}
    >
      {label}
    </text>
  );
  const hitWidth = interactionWidth ?? (selectable || interactive ? DEFAULT_INTERACTION_WIDTH : 0);
  return (
    <>
      {/* Presentation attributes, so an edge's own `style` or a stylesheet rule wins. */}
      <path
        {...rest}
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
      {text &&
        (boxed ? (
          <LabelBox
            textRef={textRef}
            label={text}
            x={labelX}
            y={labelY}
            labelStyle={labelStyle}
            padding={labelBgPadding}
            borderRadius={labelBgBorderRadius}
            style={labelBgStyle}
          >
            {labelText}
          </LabelBox>
        ) : (
          labelText
        ))}
    </>
  );
}
