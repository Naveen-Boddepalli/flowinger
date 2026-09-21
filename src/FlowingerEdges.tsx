import {
  memo,
  useId,
  useMemo,
  useSyncExternalStore,
  type CSSProperties,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { BaseEdge, DEFAULT_EDGE_COLOR } from './BaseEdge.tsx';
import { EdgeContext } from './edgeContext.ts';
import { ReconnectAnchors } from './ReconnectAnchors.tsx';
import { handleCoordinates } from './handlePoint.ts';
import { useFlowingerStore } from './context.ts';
import { absolutePositionOf } from './parents.ts';
import { getBezierPath, getSmoothStepPath, getStraightPath } from './paths.ts';
import { ConnectionLineType, type ConnectionLineProps } from './types.ts';
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
import type { FlowingerStore } from './store.ts';

export interface FlowingerEdgesProps {
  edges: Edge[];
  nodes: Node[];
  edgeTypes?: EdgeTypes | undefined;
  /** Whether a click on an edge selects it (an edge's own `selectable: false` opts it out). */
  elementsSelectable?: boolean;
  /** Whether selectable edges are tab stops. */
  edgesFocusable?: boolean;
  /** Whether `edge.selected` is what says so (a controlled edge list), as opposed to the store's own set. */
  controlledSelection?: boolean;
  /** Nodes not drawn — hidden, or inside something hidden — and so no edges to or from them. */
  hiddenNodeIds?: ReadonlySet<string> | undefined;
  /** When only what is in view is drawn: the edges that are. */
  visibleEdgeIds?: ReadonlySet<string> | undefined;
  connectionLineType?: ConnectionLineType | undefined;
  connectionLineStyle?: CSSProperties | undefined;
  connectionLineComponent?: ComponentType<ConnectionLineProps> | undefined;
  /** Whether a selected edge shows drag handles on its ends — an `onReconnect` is there to hear of them. */
  reconnectable?: boolean;
}

/**
 * The stylesheet for `animated` edges. A `<style>` inside the `<svg>` keeps the
 * package free of a stylesheet to import, and `prefers-reduced-motion` is
 * honoured where it belongs, in CSS.
 */
const ANIMATED_EDGE_CSS =
  '@keyframes flowinger-dash{to{stroke-dashoffset:-10}}' +
  '.flowinger-edge-animated .flowinger-edge-path{stroke-dasharray:5;animation:flowinger-dash .5s linear infinite}' +
  '@media (prefers-reduced-motion:reduce){.flowinger-edge-animated .flowinger-edge-path{animation:none}}';

interface EdgeChrome {
  edge: Edge;
  selected: boolean;
  selectable: boolean;
  focusable: boolean;
}

/**
 * What every edge's `<g>` shares, built or built on: its classes, the click
 * that selects it, and Enter / Space from the keyboard.
 */
function useEdgeChrome({ edge, selected, selectable, focusable }: EdgeChrome) {
  const store = useFlowingerStore();
  const context = useMemo(() => ({ selected, selectable }), [selected, selectable]);
  const className = [
    'flowinger-edge react-flow__edge',
    edge.animated ? 'flowinger-edge-animated animated' : '',
    selected ? 'selected' : '',
    selectable ? 'selectable' : '',
    edge.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const onClick = (e: ReactMouseEvent<SVGGElement>) => {
    store.getCallbacks().onEdgeClick?.(e, edge);
    if (selectable) store.selectEdge(edge.id, e.shiftKey || e.metaKey || e.ctrlKey);
  };
  const onKeyDown = (e: ReactKeyboardEvent<SVGGElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    store.selectEdge(edge.id, e.shiftKey);
  };
  const props = {
    className,
    'data-testid': `edge-${edge.id}`,
    // Events only where there is something to do with them; the svg itself takes none.
    ...(selectable
      ? {
          style: { pointerEvents: 'stroke', cursor: 'pointer' } as CSSProperties,
          onClick,
          ...(focusable
            ? {
                tabIndex: 0,
                role: 'button',
                'aria-label': `Edge from ${edge.source} to ${edge.target}`,
                'aria-pressed': selected,
                onKeyDown,
              }
            : {}),
        }
      : { onClick }),
  };
  return { context, props };
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
        : type === 'step'
          ? getSmoothStepPath({ ...ends, sourcePosition, targetPosition, borderRadius: 0 })
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

/** What a selected edge needs to show drag handles on its ends: which ends, and where they are. */
interface EdgeAnchors {
  reconnectSource: boolean;
  reconnectTarget: boolean;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

function Anchors({ edge, ...a }: EdgeAnchors & { edge: Edge }) {
  if (!a.reconnectSource && !a.reconnectTarget) return null;
  return (
    <ReconnectAnchors
      edge={edge}
      source={{ x: a.sourceX, y: a.sourceY }}
      target={{ x: a.targetX, y: a.targetY }}
      ends={{ source: a.reconnectSource, target: a.reconnectTarget }}
    />
  );
}

interface EdgePathProps extends Omit<EdgeChrome, 'edge'>, EdgeAnchors {
  edge: Edge;
  d: string;
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
  edge,
  selected,
  selectable,
  focusable,
  reconnectSource,
  reconnectTarget,
  sourceX,
  sourceY,
  targetX,
  targetY,
  d,
  style,
  label,
  labelX,
  labelY,
  markerStart,
  markerEnd,
}: EdgePathProps) {
  const { context, props } = useEdgeChrome({ edge, selected, selectable, focusable });
  return (
    <g {...props}>
      <EdgeContext.Provider value={context}>
        <BaseEdge
          path={d}
          label={label}
          labelX={labelX}
          labelY={labelY}
          markerStart={markerStart}
          markerEnd={markerEnd}
          style={style}
        />
      </EdgeContext.Provider>
      <Anchors
        edge={edge}
        reconnectSource={reconnectSource}
        reconnectTarget={reconnectTarget}
        sourceX={sourceX}
        sourceY={sourceY}
        targetX={targetX}
        targetY={targetY}
      />
    </g>
  );
});

interface CustomEdgeProps extends EdgeChrome {
  reconnectSource: boolean;
  reconnectTarget: boolean;
  View: ComponentType<EdgeProps>;
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
const CustomEdge = memo(function CustomEdge({
  View,
  edge,
  selected,
  selectable,
  focusable,
  reconnectSource,
  reconnectTarget,
  ...ends
}: CustomEdgeProps) {
  const { context, props } = useEdgeChrome({ edge, selected, selectable, focusable });
  return (
    <g {...props}>
      <EdgeContext.Provider value={context}>
        <View
          id={edge.id}
          source={edge.source}
          target={edge.target}
          sourceHandleId={edge.sourceHandle ?? null}
          targetHandleId={edge.targetHandle ?? null}
          data={edge.data}
          label={edge.label}
          style={edge.style}
          selected={selected}
          {...ends}
        />
      </EdgeContext.Provider>
      <Anchors
        edge={edge}
        reconnectSource={reconnectSource}
        reconnectTarget={reconnectTarget}
        sourceX={ends.sourceX}
        sourceY={ends.sourceY}
        targetX={ends.targetX}
        targetY={ends.targetY}
      />
    </g>
  );
});

export const FlowingerEdges = memo(function FlowingerEdges({
  edges,
  nodes,
  edgeTypes,
  elementsSelectable = false,
  edgesFocusable = true,
  controlledSelection = false,
  hiddenNodeIds,
  visibleEdgeIds,
  connectionLineType = ConnectionLineType.Bezier,
  connectionLineStyle,
  connectionLineComponent: CustomConnectionLine,
  reconnectable = false,
}: FlowingerEdgesProps) {
  const store = useFlowingerStore();
  // Positions and sizes live in the store, not in props. The version is what
  // makes this component re-render when either moves.
  useSyncExternalStore(store.subscribeGeometry, store.getGeometryVersion, store.getGeometryVersion);

  // The connection being dragged out, if any: it lives in the store, and only this layer draws it.
  const connection = useSyncExternalStore(store.subscribeConnection, store.getConnection, () => null);

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

  let anyAnimated = false;
  const paths = edges.map((edge) => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target || edge.hidden) return null;
    if (hiddenNodeIds ? hiddenNodeIds.has(source.id) || hiddenNodeIds.has(target.id) : source.hidden || target.hidden) {
      return null;
    }
    if (visibleEdgeIds && !visibleEdgeIds.has(edge.id)) return null;
    // An edge whose end is being dragged elsewhere is not drawn: the line being dragged stands in for it.
    if (connection?.reconnecting === edge.id) return null;

    const lookup = (id: string) => byId.get(id);
    const sourceAt = absolutePositionOf(source, lookup, store.resolvePosition);
    const targetAt = absolutePositionOf(target, lookup, store.resolvePosition);

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

    const selectable = elementsSelectable && edge.selectable !== false;
    const selected = controlledSelection ? edge.selected === true : store.isEdgeSelected(edge.id);
    if (edge.animated) anyAnimated = true;
    const canReconnect = reconnectable && selectable && selected;
    const reconnectSource = canReconnect && edge.reconnectable !== false && edge.reconnectable !== 'target';
    const reconnectTarget = canReconnect && edge.reconnectable !== false && edge.reconnectable !== 'source';
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
          selected={selected}
          selectable={selectable}
          focusable={edgesFocusable}
          reconnectSource={reconnectSource}
          reconnectTarget={reconnectTarget}
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
        edge={edge}
        selected={selected}
        selectable={selectable}
        focusable={edgesFocusable}
        reconnectSource={reconnectSource}
        reconnectTarget={reconnectTarget}
        sourceX={from.point.x}
        sourceY={from.point.y}
        targetX={to.point.x}
        targetY={to.point.y}
        d={path.d}
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
      {anyAnimated && <style>{ANIMATED_EDGE_CSS}</style>}
      {markers.size > 0 && (
        <defs>
          {[...markers.values()].map(({ id, marker }) => (
            <MarkerDef key={id} id={id} marker={marker} />
          ))}
        </defs>
      )}
      {paths}
      {connection &&
        (CustomConnectionLine ? (
          <g className="flowinger-connection-line react-flow__connection" style={{ pointerEvents: 'none' }}>
            <CustomConnectionLine
              fromX={connection.start.x}
              fromY={connection.start.y}
              fromPosition={connection.startPosition}
              toX={connection.end.x}
              toY={connection.end.y}
              toPosition={connection.endPosition}
              connectionLineType={connectionLineType}
              connectionLineStyle={connectionLineStyle}
              isValid={connection.isValid}
            />
          </g>
        ) : (
          <path
            className="flowinger-connection-line react-flow__connection-path"
            d={
              pathFor(
                connectionLineType,
                connection.start,
                connection.startPosition,
                connection.end,
                connection.endPosition,
              ).d
            }
            fill="none"
            stroke="var(--flowinger-selected, #38bdf8)"
            strokeWidth={2}
            strokeDasharray="5 4"
            // Never takes events, whatever the style says: under the pointer it would hide the handle it is over.
            style={{ ...connectionLineStyle, pointerEvents: 'none' }}
          />
        ))}
    </svg>
  );
});
