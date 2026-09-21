import type { CSSProperties } from 'react';

/** Read from `--flowinger-edge` so a consumer can theme every edge at once. */
export const DEFAULT_EDGE_COLOR = 'var(--flowinger-edge, #b1b1b7)';

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
}: BaseEdgeProps) {
  return (
    <>
      {/* Presentation attributes, so an edge's own `style` or a stylesheet rule wins. */}
      <path
        className="flowinger-edge-path react-flow__edge-path"
        d={path}
        fill="none"
        stroke={DEFAULT_EDGE_COLOR}
        strokeWidth={1}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={style}
      />
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
