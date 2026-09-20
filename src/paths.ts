import { Position } from './types.ts';

export interface GetBezierPathParams {
  sourceX: number;
  sourceY: number;
  sourcePosition?: Position;
  targetX: number;
  targetY: number;
  targetPosition?: Position;
  curvature?: number;
}

export interface GetStraightPathParams {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

export interface GetSmoothStepPathParams {
  sourceX: number;
  sourceY: number;
  sourcePosition?: Position;
  targetX: number;
  targetY: number;
  targetPosition?: Position;
  borderRadius?: number;
  offset?: number;
}

function calculateControlPointOffset(distance: number, curvature: number): number {
  if (distance >= 0) {
    return 0.5 * distance;
  }
  return curvature * 25 * Math.sqrt(-distance);
}

function getControlPoints(
  sourceX: number,
  sourceY: number,
  sourcePosition: Position,
  targetX: number,
  targetY: number,
  targetPosition: Position,
  curvature: number,
): [number, number, number, number] {
  let c1x = sourceX;
  let c1y = sourceY;
  let c2x = targetX;
  let c2y = targetY;

  switch (sourcePosition) {
    case Position.Left:
      c1x = sourceX - calculateControlPointOffset(sourceX - targetX, curvature);
      break;
    case Position.Right:
      c1x = sourceX + calculateControlPointOffset(targetX - sourceX, curvature);
      break;
    case Position.Top:
      c1y = sourceY - calculateControlPointOffset(sourceY - targetY, curvature);
      break;
    case Position.Bottom:
      c1y = sourceY + calculateControlPointOffset(targetY - sourceY, curvature);
      break;
  }

  switch (targetPosition) {
    case Position.Left:
      c2x = targetX - calculateControlPointOffset(targetX - sourceX, curvature);
      break;
    case Position.Right:
      c2x = targetX + calculateControlPointOffset(sourceX - targetX, curvature);
      break;
    case Position.Top:
      c2y = targetY - calculateControlPointOffset(targetY - sourceY, curvature);
      break;
    case Position.Bottom:
      c2y = targetY + calculateControlPointOffset(sourceY - targetY, curvature);
      break;
  }

  return [c1x, c1y, c2x, c2y];
}

/**
 * Generates an SVG cubic bezier path string between two points.
 */
export function getBezierPath({
  sourceX,
  sourceY,
  sourcePosition = Position.Bottom,
  targetX,
  targetY,
  targetPosition = Position.Top,
  curvature = 0.25,
}: GetBezierPathParams): [path: string, labelX: number, labelY: number] {
  const [c1x, c1y, c2x, c2y] = getControlPoints(
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature,
  );

  // Midpoint approximation for edge labels
  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2;

  const path = `M ${sourceX.toFixed(2)} ${sourceY.toFixed(2)} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${targetX.toFixed(2)} ${targetY.toFixed(2)}`;

  return [path, labelX, labelY];
}

/**
 * Generates a straight SVG path string between two points.
 */
export function getStraightPath({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: GetStraightPathParams): [path: string, labelX: number, labelY: number] {
  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2;
  const path = `M ${sourceX.toFixed(2)} ${sourceY.toFixed(2)} L ${targetX.toFixed(2)} ${targetY.toFixed(2)}`;
  return [path, labelX, labelY];
}

/**
 * Generates an orthogonal smooth-step SVG path string between two points.
 */
export function getSmoothStepPath({
  sourceX,
  sourceY,
  sourcePosition = Position.Bottom,
  targetX,
  targetY,
  targetPosition: _targetPosition = Position.Top,
  borderRadius: _borderRadius = 5,
  offset: _offset = 20,
}: GetSmoothStepPathParams): [path: string, labelX: number, labelY: number] {
  // If points are horizontal or vertical aligned, simple L
  const isHorizontal = sourcePosition === Position.Left || sourcePosition === Position.Right;
  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2;

  if (isHorizontal) {
    const midX = (sourceX + targetX) / 2;
    const path = `M ${sourceX.toFixed(2)} ${sourceY.toFixed(2)} L ${midX.toFixed(2)} ${sourceY.toFixed(2)} L ${midX.toFixed(2)} ${targetY.toFixed(2)} L ${targetX.toFixed(2)} ${targetY.toFixed(2)}`;
    return [path, labelX, labelY];
  }

  const midY = (sourceY + targetY) / 2;
  const path = `M ${sourceX.toFixed(2)} ${sourceY.toFixed(2)} L ${sourceX.toFixed(2)} ${midY.toFixed(2)} L ${targetX.toFixed(2)} ${midY.toFixed(2)} L ${targetX.toFixed(2)} ${targetY.toFixed(2)}`;
  return [path, labelX, labelY];
}
