import type { ComponentType } from 'react';
import { BaseEdge } from '../BaseEdge.tsx';
import { Position, type EdgeProps, type Node } from '../types.ts';
import { getSmoothStepPath } from '../paths.ts';
import { useNodes } from '../dataHooks.ts';

export interface GetSmartEdgePathParams {
  sourceX: number;
  sourceY: number;
  sourcePosition?: Position;
  targetX: number;
  targetY: number;
  targetPosition?: Position;
  nodes?: readonly Node[];
  gridRatio?: number;
  nodePadding?: number;
}

interface Point {
  x: number;
  y: number;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function pointInBox(p: Point, b: Box): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

function lineIntersectsBox(p1: Point, p2: Point, b: Box): boolean {
  // Check if either endpoint is inside or line crosses the box
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);

  if (maxX < b.minX || minX > b.maxX || maxY < b.minY || minY > b.maxY) {
    return false;
  }
  return true;
}

/**
 * Computes an obstacle-avoiding orthogonal SVG edge path using A* pathfinding.
 * Automatically steers around intervening nodes on the canvas.
 */
export function getSmartEdgePath(
  params: GetSmartEdgePathParams,
): [path: string, labelX: number, labelY: number, offsetX: number, offsetY: number] {
  const {
    sourceX,
    sourceY,
    sourcePosition = Position.Bottom,
    targetX,
    targetY,
    targetPosition = Position.Top,
    nodes = [],
    gridRatio = 20,
    nodePadding = 12,
  } = params;

  // If no nodes, fall back to smooth step path
  if (!nodes || nodes.length === 0) {
    return getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  // Build obstacle bounding boxes
  const obstacles: Box[] = [];
  for (const n of nodes) {
    if (n.hidden) continue;
    const w = n.measured?.width ?? n.width ?? 150;
    const h = n.measured?.height ?? n.height ?? 50;
    obstacles.push({
      minX: n.position.x - nodePadding,
      minY: n.position.y - nodePadding,
      maxX: n.position.x + w + nodePadding,
      maxY: n.position.y + h + nodePadding,
    });
  }

  // Check if any obstacle is actually in between source and target
  const sourcePoint: Point = { x: sourceX, y: sourceY };
  const targetPoint: Point = { x: targetX, y: targetY };
  const hasObstaclesInPath = obstacles.some((b) => lineIntersectsBox(sourcePoint, targetPoint, b));

  if (!hasObstaclesInPath) {
    return getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  // Grid bounds enclosing start, target, and relevant obstacles
  const minX = Math.floor(Math.min(sourceX, targetX, ...obstacles.map((b) => b.minX)) / gridRatio) * gridRatio - gridRatio * 2;
  const maxX = Math.ceil(Math.max(sourceX, targetX, ...obstacles.map((b) => b.maxX)) / gridRatio) * gridRatio + gridRatio * 2;
  const minY = Math.floor(Math.min(sourceY, targetY, ...obstacles.map((b) => b.minY)) / gridRatio) * gridRatio - gridRatio * 2;
  const maxY = Math.ceil(Math.max(sourceY, targetY, ...obstacles.map((b) => b.maxY)) / gridRatio) * gridRatio + gridRatio * 2;

  const startGrid: Point = {
    x: Math.round(sourceX / gridRatio) * gridRatio,
    y: Math.round(sourceY / gridRatio) * gridRatio,
  };
  const targetGrid: Point = {
    x: Math.round(targetX / gridRatio) * gridRatio,
    y: Math.round(targetY / gridRatio) * gridRatio,
  };

  const key = (p: Point) => `${p.x},${p.y}`;
  const isBlocked = (p: Point): boolean => {
    // Endpoints are not considered blocked
    if ((Math.abs(p.x - sourceX) < gridRatio && Math.abs(p.y - sourceY) < gridRatio) ||
        (Math.abs(p.x - targetX) < gridRatio && Math.abs(p.y - targetY) < gridRatio)) {
      return false;
    }
    return obstacles.some((b) => pointInBox(p, b));
  };

  // A* search
  interface NodeRecord {
    point: Point;
    g: number;
    f: number;
    parent: NodeRecord | null;
  }

  const openList: NodeRecord[] = [];
  const closedSet = new Set<string>();
  const gScores = new Map<string, number>();

  const startRecord: NodeRecord = {
    point: startGrid,
    g: 0,
    f: Math.hypot(startGrid.x - targetGrid.x, startGrid.y - targetGrid.y),
    parent: null,
  };
  openList.push(startRecord);
  gScores.set(key(startGrid), 0);

  const directions: Point[] = [
    { x: gridRatio, y: 0 },
    { x: -gridRatio, y: 0 },
    { x: 0, y: gridRatio },
    { x: 0, y: -gridRatio },
  ];

  let endRecord: NodeRecord | null = null;
  let iterations = 0;
  const maxIterations = 1200;

  while (openList.length > 0 && iterations < maxIterations) {
    iterations += 1;
    // Find node with smallest f
    let bestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      const current = openList[i];
      const best = openList[bestIdx];
      if (current && best && current.f < best.f) bestIdx = i;
    }
    const current = openList.splice(bestIdx, 1)[0];
    if (!current) break;

    const currKey = key(current.point);
    closedSet.add(currKey);

    if (current.point.x === targetGrid.x && current.point.y === targetGrid.y) {
      endRecord = current;
      break;
    }

    for (const dir of directions) {
      const neighbor: Point = {
        x: current.point.x + dir.x,
        y: current.point.y + dir.y,
      };

      if (neighbor.x < minX || neighbor.x > maxX || neighbor.y < minY || neighbor.y > maxY) {
        continue;
      }

      const nKey = key(neighbor);
      if (closedSet.has(nKey) || isBlocked(neighbor)) continue;

      // Penalize turns slightly so paths stay straight
      const turnPenalty = current.parent && (current.parent.point.x !== neighbor.x && current.parent.point.y !== neighbor.y) ? 2 : 0;
      const tentativeG = current.g + gridRatio + turnPenalty;

      const existingG = gScores.get(nKey);
      if (existingG === undefined || tentativeG < existingG) {
        gScores.set(nKey, tentativeG);
        const h = Math.hypot(neighbor.x - targetGrid.x, neighbor.y - targetGrid.y);
        const record: NodeRecord = {
          point: neighbor,
          g: tentativeG,
          f: tentativeG + h,
          parent: current,
        };
        openList.push(record);
      }
    }
  }

  if (!endRecord) {
    // If pathfinder timed out or blocked, fallback cleanly
    return getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  // Reconstruct path
  const rawPoints: Point[] = [];
  let curr: NodeRecord | null = endRecord;
  while (curr) {
    rawPoints.push(curr.point);
    curr = curr.parent;
  }
  rawPoints.reverse();

  // Prepend exact source and append exact target
  const points: Point[] = [{ x: sourceX, y: sourceY }, ...rawPoints, { x: targetX, y: targetY }];

  // Simplify collinear points
  const simplified: Point[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = simplified[simplified.length - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;

    const isCollinearX = prev.x === cur.x && cur.x === next.x;
    const isCollinearY = prev.y === cur.y && cur.y === next.y;

    if (!isCollinearX && !isCollinearY) {
      simplified.push(cur);
    }
  }
  simplified.push(points[points.length - 1]!);

  // Construct SVG path
  let path = `M ${simplified[0]!.x.toFixed(2)} ${simplified[0]!.y.toFixed(2)}`;
  for (let i = 1; i < simplified.length; i++) {
    const p = simplified[i]!;
    path += ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }

  // Compute mid point for label
  const midIdx = Math.floor(simplified.length / 2);
  const mid = simplified[midIdx] ?? { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 };

  return [path, mid.x, mid.y, Math.abs(targetX - sourceX) / 2, Math.abs(targetY - sourceY) / 2];
}

/**
 * Smart obstacle-avoiding edge component for Flowinger and React Flow graphs.
 * Steers cleanly around other nodes on the diagram.
 */
export const SmartEdge: ComponentType<EdgeProps> = function SmartEdge(props: EdgeProps) {
  let nodes: readonly Node[] = [];
  try {
    nodes = useNodes();
  } catch {
    nodes = [];
  }

  const [path, labelX, labelY] = getSmartEdgePath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    nodes,
  });

  return (
    <BaseEdge
      {...props}
      path={path}
      labelX={labelX}
      labelY={labelY}
    />
  );
};
