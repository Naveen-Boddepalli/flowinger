import { memo } from 'react';
import { BaseEdge, type BaseEdgeProps } from './BaseEdge.tsx';
import { getBezierPath, getSmoothStepPath, getStraightPath } from './paths.ts';
import type { EdgeProps } from './types.ts';

/** What `BaseEdge` takes of a custom edge's props, apart from the path. */
const drawing = (p: EdgeProps): Omit<BaseEdgeProps, 'path'> => ({
  label: p.label,
  labelStyle: p.labelStyle,
  labelShowBg: p.labelShowBg,
  labelBgStyle: p.labelBgStyle,
  labelBgPadding: p.labelBgPadding,
  labelBgBorderRadius: p.labelBgBorderRadius,
  markerStart: p.markerStart,
  markerEnd: p.markerEnd,
  style: p.style,
  interactionWidth: p.interactionWidth,
});

const ends = (p: EdgeProps) => ({ sourceX: p.sourceX, sourceY: p.sourceY, targetX: p.targetX, targetY: p.targetY });
const sides = (p: EdgeProps) => ({ sourcePosition: p.sourcePosition, targetPosition: p.targetPosition });

// The edges the canvas draws for `type: 'bezier'`, `'straight'`, `'smoothstep'` and `'step'`, as components: a
// custom edge (or an entry of `edgeTypes`) can render one and add to it, or be one of them under another name.

/** A cubic bezier; `pathOptions.curvature` bends it (default 0.25). */
export const BezierEdge = /*#__PURE__*/ memo(function BezierEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ ...ends(props), ...sides(props), curvature: props.pathOptions?.curvature });
  return <BaseEdge path={path} labelX={labelX} labelY={labelY} {...drawing(props)} />;
});

export const StraightEdge = /*#__PURE__*/ memo(function StraightEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getStraightPath(ends(props));
  return <BaseEdge path={path} labelX={labelX} labelY={labelY} {...drawing(props)} />;
});

/** Right angles with rounded corners; `pathOptions.borderRadius` rounds them (default 5). */
export const SmoothStepEdge = /*#__PURE__*/ memo(function SmoothStepEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({
    ...ends(props),
    ...sides(props),
    borderRadius: props.pathOptions?.borderRadius,
  });
  return <BaseEdge path={path} labelX={labelX} labelY={labelY} {...drawing(props)} />;
});

/** Right angles, square corners. */
export const StepEdge = /*#__PURE__*/ memo(function StepEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({ ...ends(props), ...sides(props), borderRadius: 0 });
  return <BaseEdge path={path} labelX={labelX} labelY={labelY} {...drawing(props)} />;
});
