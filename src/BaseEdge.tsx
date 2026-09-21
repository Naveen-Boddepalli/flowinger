import { useContext, type CSSProperties } from 'react';
import { EdgeContext } from './edgeContext.ts';

/** Read from `--flowinger-edge` so a consumer can theme every edge at once. */
export const DEFAULT_EDGE_COLOR = 'var(--flowinger-edge, #b1b1b7)';
const SELECTED_EDGE_COLOR = 'var(--flowinger-selected, #38bdf8)';

/** How wide, in graph units, the invisible strip that catches a click on a selectable edge is. */
const DEFAULT_INTERACTION_WIDTH = 20;

// A halo in the surface colour keeps the text readable where it crosses the
// line, without measuring the text to size a background box.
const labelStyle: CSSProperties = {
  fontSize: 12,
  fill: 'var(--flowinger-text, #e2e8f0)',
  stroke: 'var(--flowinger-surface, #1e293b)',
  strokeWidth: 4,
  strokeLinejoin: 'round',
  paintOrder: 'stroke',
  pointerEvents: 'none',
};

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
  interactionWidth?: number;
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
        <text
          className="flowinger-edge-label react-flow__edge-text"
          x={labelX}
          y={labelY}
          textAnchor="middle"
          dominantBaseline="central"
          style={labelStyle}
        >
          {label}
        </text>
      )}
    </>
  );
}
