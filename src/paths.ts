import { Position, type Edge } from './types.ts';

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

/** What a path function hands back: the path, where its label goes, and how far that is from the source. */
export type PathResult = [path: string, labelX: number, labelY: number, offsetX: number, offsetY: number];

/** The middle of the straight line between two points, and how far it is from each of them along each axis. */
export function getEdgeCenter({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: GetStraightPathParams): [centerX: number, centerY: number, offsetX: number, offsetY: number] {
  const offsetX = Math.abs(targetX - sourceX) / 2;
  const offsetY = Math.abs(targetY - sourceY) / 2;
  return [
    targetX < sourceX ? targetX + offsetX : targetX - offsetX,
    targetY < sourceY ? targetY + offsetY : targetY - offsetY,
    offsetX,
    offsetY,
  ];
}

/**
 * The point half way along a cubic bezier (t = 0.5), which is on the curve where the middle of the line
 * between its ends is not. `offsetX` and `offsetY` are how far it is from the source.
 */
export function getBezierEdgeCenter({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourceControlX,
  sourceControlY,
  targetControlX,
  targetControlY,
}: GetStraightPathParams & {
  sourceControlX: number;
  sourceControlY: number;
  targetControlX: number;
  targetControlY: number;
}): [centerX: number, centerY: number, offsetX: number, offsetY: number] {
  const centerX = sourceX * 0.125 + sourceControlX * 0.375 + targetControlX * 0.375 + targetX * 0.125;
  const centerY = sourceY * 0.125 + sourceControlY * 0.375 + targetControlY * 0.375 + targetY * 0.125;
  return [centerX, centerY, Math.abs(centerX - sourceX), Math.abs(centerY - sourceY)];
}

/**
 * Generates an SVG cubic bezier path string between two points. The label goes on the curve, half way along.
 */
export function getBezierPath({
  sourceX,
  sourceY,
  sourcePosition = Position.Bottom,
  targetX,
  targetY,
  targetPosition = Position.Top,
  curvature = 0.25,
}: GetBezierPathParams): PathResult {
  const [c1x, c1y, c2x, c2y] = getControlPoints(
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature,
  );

  const [labelX, labelY, offsetX, offsetY] = getBezierEdgeCenter({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourceControlX: c1x,
    sourceControlY: c1y,
    targetControlX: c2x,
    targetControlY: c2y,
  });

  const path = `M ${sourceX.toFixed(2)} ${sourceY.toFixed(2)} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${targetX.toFixed(2)} ${targetY.toFixed(2)}`;

  return [path, labelX, labelY, offsetX, offsetY];
}

/**
 * Generates a straight SVG path string between two points.
 */
export function getStraightPath({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: GetStraightPathParams): PathResult {
  const [labelX, labelY, offsetX, offsetY] = getEdgeCenter({ sourceX, sourceY, targetX, targetY });
  const path = `M ${sourceX.toFixed(2)} ${sourceY.toFixed(2)} L ${targetX.toFixed(2)} ${targetY.toFixed(2)}`;
  return [path, labelX, labelY, offsetX, offsetY];
}

/**
 * The path through `points` with each corner rounded by `radius` — or less where
 * a side is too short to give it that much. A radius of 0 leaves square corners.
 */
function roundedPolyline(points: readonly (readonly [number, number])[], radius: number): string {
  const f = (n: number) => n.toFixed(2);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return '';
  let d = `M ${f(first[0])} ${f(first[1])}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    if (!prev || !corner || !next) continue;
    const before = Math.hypot(corner[0] - prev[0], corner[1] - prev[1]);
    const after = Math.hypot(next[0] - corner[0], next[1] - corner[1]);
    const r = Math.min(radius, before / 2, after / 2);
    if (r <= 0) {
      d += ` L ${f(corner[0])} ${f(corner[1])}`;
      continue;
    }
    const inX = corner[0] - ((corner[0] - prev[0]) / before) * r;
    const inY = corner[1] - ((corner[1] - prev[1]) / before) * r;
    const outX = corner[0] + ((next[0] - corner[0]) / after) * r;
    const outY = corner[1] + ((next[1] - corner[1]) / after) * r;
    d += ` L ${f(inX)} ${f(inY)} Q ${f(corner[0])} ${f(corner[1])} ${f(outX)} ${f(outY)}`;
  }
  return `${d} L ${f(last[0])} ${f(last[1])}`;
}

/**
 * Generates an orthogonal SVG path between two points: out of the source, across
 * halfway, then into the target. Corners are rounded by `borderRadius` (default
 * 5); give 0 for square ones.
 */
export function getSmoothStepPath({
  sourceX,
  sourceY,
  sourcePosition = Position.Bottom,
  targetX,
  targetY,
  borderRadius = 5,
}: GetSmoothStepPathParams): PathResult {
  const isHorizontal = sourcePosition === Position.Left || sourcePosition === Position.Right;
  const [labelX, labelY, offsetX, offsetY] = getEdgeCenter({ sourceX, sourceY, targetX, targetY });
  const points: [number, number][] = isHorizontal
    ? [[sourceX, sourceY], [labelX, sourceY], [labelX, targetY], [targetX, targetY]]
    : [[sourceX, sourceY], [sourceX, labelY], [targetX, labelY], [targetX, targetY]];
  return [roundedPolyline(points, borderRadius), labelX, labelY, offsetX, offsetY];
}

/** The path an edge of this `type` takes between two ends — a built-in one, whatever else `type` may name. */
export function pathFor(
  type: Edge['type'],
  s: { x: number; y: number },
  sourcePosition: Position,
  t: { x: number; y: number },
  targetPosition: Position,
  options?: Edge['pathOptions'],
): { d: string; labelX: number; labelY: number } {
  const ends = { sourceX: s.x, sourceY: s.y, targetX: t.x, targetY: t.y };
  const [d, labelX, labelY] =
    type === 'straight'
      ? getStraightPath(ends)
      : type === 'smoothstep'
        ? getSmoothStepPath({ ...ends, sourcePosition, targetPosition, ...pick(options, 'borderRadius') })
        : type === 'step'
          ? getSmoothStepPath({ ...ends, sourcePosition, targetPosition, borderRadius: 0 })
          : getBezierPath({ ...ends, sourcePosition, targetPosition, ...pick(options, 'curvature') });
  return { d, labelX, labelY };
}

/** `{ [key]: value }` when the option is there, else nothing — so a default still applies. */
const pick = <K extends 'curvature' | 'borderRadius'>(o: Edge['pathOptions'], key: K): { [P in K]?: number } =>
  o?.[key] === undefined ? {} : { [key]: o[key] } as { [P in K]?: number };
