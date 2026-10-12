import { type PointerEvent as ReactPointerEvent } from 'react';
import { BaseEdge } from '../BaseEdge.tsx';
import { useFlowinger } from '../context.ts';
import type { EdgeProps, XYPosition } from '../types.ts';
import { polylinePath } from './polyline.ts';

export interface GetEditableEdgePathParams {
  from: XYPosition;
  /** The waypoints, in graph units, in order from the source's end. */
  points: readonly XYPosition[];
  to: XYPosition;
  /** The rounding of each corner, in graph units, never more than half a run. Default 0: square. */
  borderRadius?: number;
}

/** The path from `from` through each of `points` to `to`, and where its label goes: halfway, by length. */
export function getEditableEdgePath({
  from,
  points,
  to,
  borderRadius = 0,
}: GetEditableEdgePathParams): [path: string, labelX: number, labelY: number] {
  const { path, mid } = polylinePath([from, ...points, to], borderRadius);
  return [path, mid.x, mid.y];
}

/** What `EditableEdge` reads from an edge's `data`. */
export interface EditableEdgeData {
  /** The waypoints, in graph units. Written back as they are dragged, added and removed. */
  points?: XYPosition[];
  /** The rounding of the corners, in graph units. Default 0. */
  borderRadius?: number;
}

const HANDLE_RADIUS = 5;
const MID_RADIUS = 3.5;

const isPoint = (p: unknown): p is XYPosition =>
  typeof p === 'object' &&
  p !== null &&
  typeof (p as XYPosition).x === 'number' &&
  typeof (p as XYPosition).y === 'number';

/**
 * An edge with waypoints you can move. It runs from its source through `data.points` to its target; once it is
 * selected each waypoint is a handle to drag, and a small dot between each pair of ends is a place to add one
 * — drag it out. A double click on a waypoint removes it. The waypoints live in the edge's `data`, written
 * through `updateEdgeData`, so a controlled flow hears of every change as an edge change.
 *
 * Register it as an edge type: `edgeTypes={{ editable: EditableEdge }}`.
 */
export function EditableEdge(props: EdgeProps) {
  const flow = useFlowinger();
  const data = props.data as EditableEdgeData | undefined;
  const points = Array.isArray(data?.points) ? data.points.filter(isPoint) : [];
  const from = { x: props.sourceX, y: props.sourceY };
  const to = { x: props.targetX, y: props.targetY };
  const [path, labelX, labelY] = getEditableEdgePath({
    from,
    points,
    to,
    borderRadius: typeof data?.borderRadius === 'number' ? data.borderRadius : 0,
  });

  const write = (next: XYPosition[]) => {
    flow.updateEdgeData(props.id, { points: next });
  };

  /** Follows the pointer, in graph space, until it is let go; `list` is what is written as it moves. */
  const drag = (event: ReactPointerEvent, list: XYPosition[], index: number) => {
    // Neither the canvas (a pan) nor the edge (a click that would select it again) takes this press.
    event.stopPropagation();
    event.preventDefault();
    let current = list;
    const move = (e: PointerEvent) => {
      const at = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      current = current.map((p, i) => (i === index ? at : p));
      write(current);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const ends = [from, ...points, to];
  return (
    <>
      <BaseEdge {...props} path={path} labelX={labelX} labelY={labelY} />
      {props.selected === true && (
        <g className="flowinger-edge-points nodrag nopan" style={{ pointerEvents: 'all' }}>
          {ends.slice(0, -1).map((a, i) => {
            const b = ends[i + 1] as XYPosition;
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            return (
              <circle
                key={`mid-${String(i)}`}
                className="flowinger-edge-midpoint nodrag nopan"
                cx={mid.x}
                cy={mid.y}
                r={MID_RADIUS}
                fill="var(--flowinger-surface, #1e293b)"
                stroke="var(--flowinger-selected, #38bdf8)"
                strokeWidth={1.5}
                opacity={0.7}
                style={{ cursor: 'copy', pointerEvents: 'all' }}
                // Dragged out, it becomes a waypoint here, in order, and goes on being dragged.
                onPointerDown={(e) => {
                  const next = [...points.slice(0, i), mid, ...points.slice(i)];
                  write(next);
                  drag(e, next, i);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              />
            );
          })}
          {points.map((p, i) => (
            <circle
              key={`point-${String(i)}`}
              className="flowinger-edge-point nodrag nopan"
              cx={p.x}
              cy={p.y}
              r={HANDLE_RADIUS}
              fill="var(--flowinger-surface, #1e293b)"
              stroke="var(--flowinger-selected, #38bdf8)"
              strokeWidth={2}
              style={{ cursor: 'grab', pointerEvents: 'all' }}
              onPointerDown={(e) => {
                drag(e, points, i);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                write(points.filter((_, j) => j !== i));
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
            />
          ))}
        </g>
      )}
    </>
  );
}
