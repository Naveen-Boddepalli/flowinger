import { useMemo, type ComponentType } from 'react';
import { BaseEdge } from '../BaseEdge.tsx';
import { useFlowinger } from '../context.ts';
import { useNodes } from '../dataHooks.ts';
import { sizeOfNode } from '../geometry.ts';
import { getSmoothStepPath } from '../paths.ts';
import { polylinePath } from './polyline.ts';
import { Position, type EdgeProps, type Node } from '../types.ts';

export interface GetSmartEdgePathParams {
  sourceX: number;
  sourceY: number;
  sourcePosition?: Position;
  targetX: number;
  targetY: number;
  targetPosition?: Position;
  /**
   * The nodes to steer around, each at `position` as its top-left corner in the edge's coordinate space (an
   * absolute position, for nodes in sub-flows).
   */
  nodes?: readonly Node[];
  /** Ids of nodes that are not in the way: the edge's own ends, and any group the edge runs inside. */
  excludeIds?: readonly string[];
  /** The size of a cell of the grid the route is found on. Default 20. */
  gridRatio?: number;
  /** How far from a node the route keeps. Default 12. */
  nodePadding?: number;
  /** The rounding of a corner, in graph units. Default 6. */
  borderRadius?: number;
}

export type SmartEdgePath = [path: string, labelX: number, labelY: number, offsetX: number, offsetY: number];

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

const overlaps = (a: Box, b: Box) => a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;

const STEP: Record<Position, Point> = {
  [Position.Top]: { x: 0, y: -1 },
  [Position.Bottom]: { x: 0, y: 1 },
  [Position.Left]: { x: -1, y: 0 },
  [Position.Right]: { x: 1, y: 0 },
};

/** How many cells either side of the straight way between the ends the route may look for room. */
const SEARCH_CELLS = 8;
/** Search states looked at before giving up and drawing the plain route. */
const MAX_STATES = 6000;

/**
 * The boxes — nodes grown by `nodePadding` — that could be in the way of a route between these ends: the ones in
 * or near the box the two ends make. Cheap, and all the router needs to know of the rest of the graph, so a
 * caller can use it to tell whether anything that matters has moved.
 */
export function getSmartEdgeObstacles(params: GetSmartEdgePathParams): Box[] {
  const { sourceX, sourceY, targetX, targetY, nodes = [], excludeIds = [], gridRatio = 20, nodePadding = 12 } = params;
  const excluded = new Set(excludeIds);
  const reach = SEARCH_CELLS * gridRatio;
  const window: Box = {
    minX: Math.min(sourceX, targetX) - reach,
    minY: Math.min(sourceY, targetY) - reach,
    maxX: Math.max(sourceX, targetX) + reach,
    maxY: Math.max(sourceY, targetY) + reach,
  };
  const boxes: Box[] = [];
  for (const n of nodes) {
    if (n.hidden === true || excluded.has(n.id)) continue;
    const { width, height } = sizeOfNode(n);
    const box: Box = {
      minX: n.position.x - nodePadding,
      minY: n.position.y - nodePadding,
      maxX: n.position.x + width + nodePadding,
      maxY: n.position.y + height + nodePadding,
    };
    if (overlaps(box, window)) boxes.push(box);
  }
  return boxes;
}

/** A binary min-heap on `f`. */
class Heap<T extends { f: number }> {
  private items: T[] = [];
  get size() {
    return this.items.length;
  }
  push(item: T) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((a[parent] as T).f <= (a[i] as T).f) break;
      [a[parent], a[i]] = [a[i] as T, a[parent] as T];
      i = parent;
    }
  }
  pop(): T | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0 && last !== undefined) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && (a[l] as T).f < (a[m] as T).f) m = l;
        if (r < a.length && (a[r] as T).f < (a[m] as T).f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i] as T, a[m] as T];
        i = m;
      }
    }
    return top;
  }
}

interface Step {
  x: number;
  y: number;
  /** Which of the four ways it came here: 0–3, or 4 at the start. */
  dir: number;
  g: number;
  f: number;
  parent: Step | null;
}

const DIRS: Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** A grid route from `from` to `to` that keeps out of `boxes` and goes straight when it can; null if there is none. */
function findRoute(from: Point, to: Point, boxes: readonly Box[], cell: number): Point[] | null {
  // The grid is anchored at `from`, so its first cell is exactly on it.
  const toCell = (v: number, origin: number) => Math.round((v - origin) / cell);
  const goal = { x: toCell(to.x, from.x), y: toCell(to.y, from.y) };
  let loX = Math.min(0, goal.x);
  let hiX = Math.max(0, goal.x);
  let loY = Math.min(0, goal.y);
  let hiY = Math.max(0, goal.y);
  for (const b of boxes) {
    loX = Math.min(loX, Math.floor((b.minX - from.x) / cell));
    hiX = Math.max(hiX, Math.ceil((b.maxX - from.x) / cell));
    loY = Math.min(loY, Math.floor((b.minY - from.y) / cell));
    hiY = Math.max(hiY, Math.ceil((b.maxY - from.y) / cell));
  }
  loX -= 2;
  hiX += 2;
  loY -= 2;
  hiY += 2;

  const blocked = (cx: number, cy: number) => {
    const x = from.x + cx * cell;
    const y = from.y + cy * cell;
    return boxes.some((b) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY);
  };

  const heap = new Heap<Step>();
  const best = new Map<string, number>();
  const start: Step = { x: 0, y: 0, dir: 4, g: 0, f: Math.abs(goal.x) + Math.abs(goal.y), parent: null };
  heap.push(start);
  best.set('0,0,4', 0);

  let visited = 0;
  for (let cur = heap.pop(); cur; cur = heap.pop()) {
    if (cur.x === goal.x && cur.y === goal.y) {
      const cells: Point[] = [];
      for (let s: Step | null = cur; s; s = s.parent) cells.push({ x: from.x + s.x * cell, y: from.y + s.y * cell });
      return cells.reverse();
    }
    if (++visited > MAX_STATES) return null;
    if (cur.g > (best.get(`${String(cur.x)},${String(cur.y)},${String(cur.dir)}`) ?? Infinity)) continue; // stale

    for (let d = 0; d < 4; d++) {
      const dir = DIRS[d] as Point;
      const x = cur.x + dir.x;
      const y = cur.y + dir.y;
      if (x < loX || x > hiX || y < loY || y > hiY) continue;
      // The ends are open even when a neighbour's padding reaches them.
      if (!(x === goal.x && y === goal.y) && blocked(x, y)) continue;
      // A bend costs a cell, so the route is a few long runs, not a staircase.
      const g = cur.g + 1 + (cur.dir !== 4 && cur.dir !== d ? 1 : 0);
      const key = `${String(x)},${String(y)},${String(d)}`;
      if (g >= (best.get(key) ?? Infinity)) continue;
      best.set(key, g);
      heap.push({ x, y, dir: d, g, f: g + Math.abs(goal.x - x) + Math.abs(goal.y - y), parent: cur });
    }
  }
  return null;
}

/**
 * Routes between two ends around `obstacles` — what `getSmartEdgeObstacles` returned — on a grid: orthogonal, leaving
 * and entering each end the way its handle faces, with few bends. When nothing is in the way, or no route is
 * found, it is the ordinary smooth-step path.
 */
export function routeSmartEdge(params: GetSmartEdgePathParams, obstacles: readonly Box[]): SmartEdgePath {
  const {
    sourceX,
    sourceY,
    sourcePosition = Position.Bottom,
    targetX,
    targetY,
    targetPosition = Position.Top,
    gridRatio = 20,
    borderRadius = 6,
  } = params;
  const plain = () => getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  // Out of the handle and into the target: the route is found between these, so it leaves and arrives straight.
  const s = STEP[sourcePosition];
  const t = STEP[targetPosition];
  const source: Point = { x: sourceX, y: sourceY };
  const target: Point = { x: targetX, y: targetY };
  const out: Point = { x: sourceX + s.x * gridRatio, y: sourceY + s.y * gridRatio };
  const into: Point = { x: targetX + t.x * gridRatio, y: targetY + t.y * gridRatio };

  // Nothing near the way: the plain path is right, and cheaper.
  const way: Box = {
    minX: Math.min(sourceX, targetX, out.x, into.x),
    minY: Math.min(sourceY, targetY, out.y, into.y),
    maxX: Math.max(sourceX, targetX, out.x, into.x),
    maxY: Math.max(sourceY, targetY, out.y, into.y),
  };
  if (!obstacles.some((b) => overlaps(b, way))) return plain();

  const cells = findRoute(out, into, obstacles, gridRatio);
  if (!cells) return plain();

  // The route ends on the cell nearest `into`; join the two with one corner, in the direction the target faces.
  const last = cells[cells.length - 1] as Point;
  const join: Point[] = [];
  if (last.x !== into.x && last.y !== into.y) {
    join.push(t.x !== 0 ? { x: last.x, y: into.y } : { x: into.x, y: last.y });
  }
  const { path, mid } = polylinePath([source, ...cells, ...join, into, target], borderRadius);
  return [path, mid.x, mid.y, Math.abs(targetX - sourceX) / 2, Math.abs(targetY - sourceY) / 2];
}

/**
 * Computes an obstacle-avoiding orthogonal SVG edge path: steers around the nodes between its ends. Where the
 * plain route is clear it is the ordinary smooth-step path.
 */
export function getSmartEdgePath(params: GetSmartEdgePathParams): SmartEdgePath {
  return routeSmartEdge(params, getSmartEdgeObstacles(params));
}

/**
 * An edge that steers around the nodes between its ends. Register it as an edge type
 * (`edgeTypes={{ smart: SmartEdge }}`); it needs a canvas, as it reads the graph's nodes.
 */
export const SmartEdge: ComponentType<EdgeProps> = function SmartEdge(props: EdgeProps) {
  const flow = useFlowinger();
  const nodes = useNodes();

  // Where each node is drawn — an absolute position, as a node in a sub-flow is placed in its parent —
  // and which nodes are groups the edge may run inside.
  const parents = new Set<string>();
  for (const n of nodes) if (n.parentId !== undefined) parents.add(n.parentId);
  const placed = nodes.map((n) => {
    const at = flow.getInternalNode(n.id)?.internals.positionAbsolute;
    return at ? { ...n, position: at } : n;
  });

  const params: GetSmartEdgePathParams = {
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    ...(props.sourcePosition === undefined ? {} : { sourcePosition: props.sourcePosition }),
    targetX: props.targetX,
    targetY: props.targetY,
    ...(props.targetPosition === undefined ? {} : { targetPosition: props.targetPosition }),
    nodes: placed,
    excludeIds: [props.source, props.target, ...parents],
  };
  const obstacles = getSmartEdgeObstacles(params);

  // Everything is a drag frame away from re-rendering; the route depends only on the ends and the boxes near it.
  const key = obstacles.map((b) => `${String(b.minX)},${String(b.minY)},${String(b.maxX)},${String(b.maxY)}`).join('|');
  const [path, labelX, labelY] = useMemo(
    () => routeSmartEdge(params, obstacles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.sourceX, props.sourceY, props.sourcePosition, props.targetX, props.targetY, props.targetPosition, key],
  );

  return <BaseEdge {...props} path={path} labelX={labelX} labelY={labelY} />;
};
