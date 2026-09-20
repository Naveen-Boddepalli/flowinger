import { memo, useSyncExternalStore, type CSSProperties } from 'react';
import { useFlowingerStore } from './context.ts';
import { getBezierPath, getSmoothStepPath, getStraightPath } from './paths.ts';
import { type Edge, type HandleType, type Node, Position } from './types.ts';
import type { FlowingerStore, Size } from './store.ts';

export interface FlowingerEdgesProps {
  edges: Edge[];
  nodes: Node[];
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
): string {
  const ends = { sourceX: s.x, sourceY: s.y, targetX: t.x, targetY: t.y };
  const [d] =
    type === 'straight'
      ? getStraightPath(ends)
      : type === 'smoothstep'
        ? getSmoothStepPath({ ...ends, sourcePosition, targetPosition })
        : getBezierPath({ ...ends, sourcePosition, targetPosition });
  return d;
}

interface EdgePathProps {
  id: string;
  d: string;
  className: string;
  style: CSSProperties | undefined;
}

/** Memoised on primitives: a drag moves one node, so most edges keep the same `d`. */
const EdgePath = memo(function EdgePath({ id, d, className, style }: EdgePathProps) {
  return (
    <g className={`flowinger-edge react-flow__edge ${className}`} data-testid={`edge-${id}`}>
      {/* Presentation attributes, so an edge's own `style` or a stylesheet rule wins. */}
      <path
        className="flowinger-edge-path react-flow__edge-path"
        d={d}
        fill="none"
        stroke="var(--color-flow-edge, #b1b1b7)"
        strokeWidth={1}
        style={style}
      />
    </g>
  );
});

export const FlowingerEdges = memo(function FlowingerEdges({ edges, nodes }: FlowingerEdgesProps) {
  const store = useFlowingerStore();
  // Positions and sizes live in the store, not in props. The version is what
  // makes this component re-render when either moves.
  useSyncExternalStore(store.subscribeGeometry, store.getGeometryVersion);

  const byId = new Map(nodes.map((n) => [n.id, n]));

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
      {edges.map((edge) => {
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

        const d = pathFor(edge.type, from.point, from.position, to.point, to.position);

        return (
          <EdgePath
            key={edge.id}
            id={edge.id}
            d={d}
            className={edge.className ?? ''}
            style={edge.style}
          />
        );
      })}
    </svg>
  );
});
