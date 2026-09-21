import { memo, useId, useSyncExternalStore, type CSSProperties, type ComponentType } from 'react';
import { BaseEdge, DEFAULT_EDGE_COLOR } from './BaseEdge.tsx';
import { useFlowingerStore } from './context.ts';
import { getBezierPath, getSmoothStepPath, getStraightPath } from './paths.ts';
import {
  type Edge,
  type EdgeMarker,
  type EdgeProps,
  type EdgeTypes,
  type HandleType,
  type MarkerType,
  type Node,
  Position,
} from './types.ts';
import type { FlowingerStore, Size } from './store.ts';

export interface FlowingerEdgesProps {
  edges: Edge[];
  nodes: Node[];
  edgeTypes?: EdgeTypes | undefined;
}

/**
 * The legacy fallback, for a handle id that no `<Handle>` registered under:
 * a handful of conventional names map to a side. A registered handle wins over
 * this outright, so an id is only ever a *name* once nodes declare handles.
 */
function resolveHandlePosition(handleId: string | null | undefined, fallback: Position): Position {
  if (!handleId) return fallback;
  switch (handleId.toLowerCase()) {
    case 'top':
    case 'in':
      return Position.Top;
    case 'bottom':
    case 'out':
      return Position.Bottom;
    case 'left':
    case 'prev':
      return Position.Left;
    case 'right':
    case 'next':
      return Position.Right;
    default:
      return fallback;
  }
}

function handleCoordinates(at: { x: number; y: number }, pos: Position, size: Size) {
  switch (pos) {
    case Position.Top:
      return { x: at.x + size.width / 2, y: at.y };
    case Position.Bottom:
      return { x: at.x + size.width / 2, y: at.y + size.height };
    case Position.Left:
      return { x: at.x, y: at.y + size.height / 2 };
    case Position.Right:
      return { x: at.x + size.width, y: at.y + size.height / 2 };
  }
}

/**
 * Where one end of an edge attaches, and which way it leaves.
 *
 * In order: the registered handle the edge names (or, naming none, the first of
 * that type) at its measured anchor; the same handle at its side's midpoint if
 * it could not be measured; the legacy id-to-side table; and finally the
 * direction the edge runs.
 */
function endpoint(
  store: FlowingerStore,
  node: Node,
  at: { x: number; y: number },
  handleId: string | null | undefined,
  type: HandleType,
  fallback: Position,
): { point: { x: number; y: number }; position: Position } {
  const handle = store.findHandle(node.id, handleId, type);
  if (handle) {
    return {
      position: handle.position,
      point: handle.anchor
        ? { x: at.x + handle.anchor.x, y: at.y + handle.anchor.y }
        : handleCoordinates(at, handle.position, store.getNodeSize(node)),
    };
  }
  const position = resolveHandlePosition(handleId, fallback);
  return { position, point: handleCoordinates(at, position, store.getNodeSize(node)) };
}

function pathFor(
  type: Edge['type'],
  s: { x: number; y: number },
  sourcePosition: Position,
  t: { x: number; y: number },
  targetPosition: Position,
): { d: string; labelX: number; labelY: number } {
  const ends = { sourceX: s.x, sourceY: s.y, targetX: t.x, targetY: t.y };
  const [d, labelX, labelY] =
    type === 'straight'
      ? getStraightPath(ends)
      : type === 'smoothstep'
        ? getSmoothStepPath({ ...ends, sourcePosition, targetPosition })
        : getBezierPath({ ...ends, sourcePosition, targetPosition });
  return { d, labelX, labelY };
}

const DEFAULT_MARKER_SIZE = 12;

type ResolvedMarker = Required<EdgeMarker>;

/** Fills in a marker's defaults. Its colour follows the edge's own stroke unless told otherwise. */
function resolveMarker(spec: MarkerType | EdgeMarker, edgeStroke: string): ResolvedMarker {
  const m: EdgeMarker = typeof spec === 'string' ? { type: spec } : spec;
  return {
    type: m.type,
    color: m.color ?? edgeStroke,
    width: m.width ?? DEFAULT_MARKER_SIZE,
    height: m.height ?? DEFAULT_MARKER_SIZE,
  };
}

/**
 * One arrowhead, tip at the origin so it sits exactly on the path's end.
 * `userSpaceOnUse` sizes it in graph units — it does not fatten with the
 * stroke — and `orient="auto-start-reverse"` lets a start marker face outward.
 * `overflow: visible` so the outline's own stroke is not clipped at the tip.
 */
function MarkerDef({ id, marker }: { id: string; marker: ResolvedMarker }) {
  return (
    <marker
      id={id}
      markerWidth={marker.width}
      markerHeight={marker.height}
      viewBox="-10 -5 10 10"
      markerUnits="userSpaceOnUse"
      orient="auto-start-reverse"
      refX="0"
      refY="0"
      overflow="visible"
    >
      <polyline
        points="-8,-4 0,0 -8,4 -8,-4"
        stroke={marker.color}
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={marker.type === 'arrowclosed' ? marker.color : 'none'}
      />
    </marker>
  );
}

interface EdgePathProps {
  id: string;
  d: string;
  className: string;
  style: CSSProperties | undefined;
  label: string | undefined;
  labelX: number;
  labelY: number;
  /** `url(#…)` references into the shared `<defs>`. */
  markerStart: string | undefined;
  markerEnd: string | undefined;
}

/** Memoised on primitives: a drag moves one node, so most edges keep the same `d`. */
const EdgePath = memo(function EdgePath({
  id,
  d,
  className,
  style,
  label,
  labelX,
  labelY,
  markerStart,
  markerEnd,
}: EdgePathProps) {
  return (
    <g className={`flowinger-edge react-flow__edge ${className}`} data-testid={`edge-${id}`}>
      <BaseEdge
        path={d}
        label={label}
        labelX={labelX}
        labelY={labelY}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={style}
      />
    </g>
  );
});

interface CustomEdgeProps {
  View: ComponentType<EdgeProps>;
  /** Stable while the caller's `edges` array is, so an untouched edge is skipped. */
  edge: Edge;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: EdgeProps['sourcePosition'];
  targetPosition: EdgeProps['targetPosition'];
  markerStart: string | undefined;
  markerEnd: string | undefined;
}

/** A user's edge component, in the same wrapper as a built-in edge, and memoised the same way. */
const CustomEdge = memo(function CustomEdge({ View, edge, ...ends }: CustomEdgeProps) {
  return (
    <g className={`flowinger-edge react-flow__edge ${edge.className ?? ''}`} data-testid={`edge-${edge.id}`}>
      <View
        id={edge.id}
        source={edge.source}
        target={edge.target}
        sourceHandleId={edge.sourceHandle ?? null}
        targetHandleId={edge.targetHandle ?? null}
        data={edge.data}
        label={edge.label}
        style={edge.style}
        {...ends}
      />
    </g>
  );
});

export const FlowingerEdges = memo(function FlowingerEdges({
  edges,
  nodes,
  edgeTypes,
}: FlowingerEdgesProps) {
  const store = useFlowingerStore();
  // Positions and sizes live in the store, not in props. The version is what
  // makes this component re-render when either moves.
  useSyncExternalStore(store.subscribeGeometry, store.getGeometryVersion, store.getGeometryVersion);

  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Identical arrowheads share one <marker>. `useId` keeps ids unique across
  // canvases on a page; its format varies by React version (`:r1:`, `«r1»`,
  // `_r_1_`), so keep only characters that are always safe inside url(#…).
  const prefix = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const markers = new Map<string, { id: string; marker: ResolvedMarker }>();
  const markerRef = (
    spec: MarkerType | EdgeMarker | undefined,
    edgeStroke: string,
  ): string | undefined => {
    if (!spec) return undefined;
    const marker = resolveMarker(spec, edgeStroke);
    const key = `${marker.type}|${marker.color}|${String(marker.width)}|${String(marker.height)}`;
    let entry = markers.get(key);
    if (!entry) {
      entry = { id: `${prefix}-m${String(markers.size)}`, marker };
      markers.set(key, entry);
    }
    return `url(#${entry.id})`;
  };

  const paths = edges.map((edge) => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) return null;

    const sourceAt = store.resolvePosition(source.id, source.position);
    const targetAt = store.resolvePosition(target.id, target.position);

    // With nothing to go on, leave the source's bottom for the target's top
    // when the target sits below it, else run sideways.
    const below = targetAt.y > sourceAt.y;
    const from = endpoint(
      store,
      source,
      sourceAt,
      edge.sourceHandle,
      'source',
      below ? Position.Bottom : Position.Right,
    );
    const to = endpoint(
      store,
      target,
      targetAt,
      edge.targetHandle,
      'target',
      below ? Position.Top : Position.Left,
    );

    const stroke = typeof edge.style?.stroke === 'string' ? edge.style.stroke : DEFAULT_EDGE_COLOR;
    const markerStart = markerRef(edge.markerStart, stroke);
    const markerEnd = markerRef(edge.markerEnd, stroke);

    // A key of `edgeTypes` wins, even over a built-in name.
    const View = edge.type ? edgeTypes?.[edge.type] : undefined;
    if (View) {
      return (
        <CustomEdge
          key={edge.id}
          View={View}
          edge={edge}
          sourceX={from.point.x}
          sourceY={from.point.y}
          targetX={to.point.x}
          targetY={to.point.y}
          sourcePosition={from.position}
          targetPosition={to.position}
          markerStart={markerStart}
          markerEnd={markerEnd}
        />
      );
    }

    const path = pathFor(edge.type, from.point, from.position, to.point, to.position);
    return (
      <EdgePath
        key={edge.id}
        id={edge.id}
        d={path.d}
        className={edge.className ?? ''}
        style={edge.style}
        label={edge.label}
        labelX={path.labelX}
        labelY={path.labelY}
        markerStart={markerStart}
        markerEnd={markerEnd}
      />
    );
  });

  return (
    <svg
      className="flowinger-edges react-flow__edges"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 0,
      }}
    >
      {markers.size > 0 && (
        <defs>
          {[...markers.values()].map(({ id, marker }) => (
            <MarkerDef key={id} id={id} marker={marker} />
          ))}
        </defs>
      )}
      {paths}
    </svg>
  );
});
