import {
  memo,
  useId,
  useMemo,
  useSyncExternalStore,
  type CSSProperties,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { BaseEdge, DEFAULT_EDGE_COLOR } from './BaseEdge.tsx';
import { EdgeContext } from './edgeContext.ts';
import type { Feature } from './features.ts';
import { handleCoordinates } from './handlePoint.ts';
import { useFlowingerStore } from './context.ts';
import { absolutePositionOf, createNodeIndex } from './parents.ts';
import { pathFor } from './paths.ts';
import { warnAboutEdgePath } from './devWarnings.ts';
import type { ConnectionLineProps, ConnectionLineType } from './types.ts';
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
  /** Whether a click on an edge selects it, where the edge says nothing itself (its own `selectable` wins). */
  elementsSelectable?: boolean;
  /** Whether anything acts on selecting — an edge's own `selectable: true` means nothing without it. Default true. */
  selectionActs?: boolean;
  /** Whether selectable edges are tab stops. */
  edgesFocusable?: boolean;
  /** Whether something listens to events on edges, so that every edge takes the pointer, selectable or not. */
  interactive?: boolean;
  /** Whether `edge.selected` is what says so (a controlled edge list), as opposed to the store's own set. */
  controlledSelection?: boolean;
  /** Nodes not drawn — hidden, or inside something hidden — and so no edges to or from them. */
  hiddenNodeIds?: ReadonlySet<string> | undefined;
  /** When only what is in view is drawn: the edges that are. */
  visibleEdgeIds?: ReadonlySet<string> | undefined;
  connectionLineType?: ConnectionLineType | undefined;
  connectionLineStyle?: CSSProperties | undefined;
  connectionLineComponent?: ComponentType<ConnectionLineProps> | undefined;
  /** Style for the element the line is drawn in (its stacking, say); the line's own is `connectionLineStyle`. */
  connectionLineContainerStyle?: CSSProperties | undefined;
  /** The colour of an arrowhead that names none; left out, it is its edge's stroke. */
  defaultMarkerColor?: string | null | undefined;
  /** Whether a selected edge shows drag handles on its ends — an `onReconnect` is there to hear of them. */
  reconnectable?: boolean;
  /** How many parents deep each node is, for stacking an edge with the nodes it joins. */
  depths?: ReadonlyMap<string, number> | undefined;
  /** What the canvas can do — the features that draw with the edges. Must not change. */
  features?: readonly Feature[] | undefined;
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
  /** Whether something listens to events on edges: the edge takes the pointer even when it cannot be selected. */
  interactive: boolean;
  /** The features that act on an edge's clicks and keys — selecting it. */
  hooks: readonly Feature[];
}

/**
 * What every edge's `<g>` shares, built or built on: its classes, `onEdgeClick`, and the clicks and keys
 * the features (selecting) act on.
 */
function useEdgeChrome({ edge, selected, selectable, focusable, interactive, hooks }: EdgeChrome) {
  const store = useFlowingerStore();
  const bits = hooks.flatMap((f) => f.useEdge?.({ store, edge, selectable }) ?? []);
  const LabelBox = bits.find((b) => b.LabelBox)?.LabelBox ?? null;
  const context = useMemo(
    () => ({ selected, selectable, interactive, LabelBox }),
    [selected, selectable, interactive, LabelBox],
  );
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
    for (const b of bits) b.onClick?.(e);
  };
  const onKeyDown = (e: ReactKeyboardEvent<SVGGElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    for (const b of bits) b.onKeyDown?.(e);
  };
  const props = {
    ...Object.assign({}, ...bits.map((b) => b.props)),
    className,
    'data-testid': `rf__edge-${edge.id}`,
    onClick,
    // The svg itself takes no events; an edge takes them where there is something to do with them.
    ...(selectable || interactive
      ? { style: { pointerEvents: 'stroke', ...(selectable ? { cursor: 'pointer' } : {}) } as CSSProperties }
      : {}),
    ...(focusable && (selectable || edge.focusable === true)
      ? { tabIndex: 0, 'aria-pressed': selected, onKeyDown }
      : {}),
    role: edge.ariaRole ?? (selectable && focusable ? 'button' : undefined),
    'aria-label': edge.ariaLabel ?? (selectable && focusable ? `Edge from ${edge.source} to ${edge.target}` : undefined),
    // An escape hatch, last: never a handler, or `id` / `style` / `className` / `role`, which are the
    // engine's own — the type excludes them, so this can only add what is not already here.
    ...edge.domAttributes,
  };
  return { context, props };
}

/**
 * Where one end of an edge attaches, and which way it leaves.
 *
 * In order: the registered handle the edge names (or, naming none, the first of
 * that type) at its measured anchor; the same handle at its side's midpoint if
 * it could not be measured; one the node declares in `handles`; and finally the
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
  // `at` is the node's top-left corner (its origin already taken off), which is what an anchor is measured from.
  const handle = store.findHandle(node.id, handleId, type);
  if (handle) {
    return {
      position: handle.position,
      point: handle.anchor
        ? { x: at.x + handle.anchor.x, y: at.y + handle.anchor.y }
        : handleCoordinates(at, handle.position, store.getNodeSize(node)),
    };
  }
  // Not drawn (yet — or on a server): the node may declare where its handles are.
  const ofType = node.handles?.filter((h) => h.type === type);
  const declared = handleId ? ofType?.find((h) => h.id === handleId) : ofType?.[0];
  if (declared) {
    const { x, y, width = 0, height = 0, position } = declared;
    // A box, as a measured handle is: the edge meets its outer edge. Without one, the middle of its side.
    if (x === undefined || y === undefined) {
      return { position, point: handleCoordinates(at, position, store.getNodeSize(node)) };
    }
    const across = position === Position.Left || position === Position.Right;
    const point = {
      x: at.x + x + (across ? (position === Position.Right ? width : 0) : width / 2),
      y: at.y + y + (across ? height / 2 : position === Position.Bottom ? height : 0),
    };
    return { position, point };
  }
  // No such handle, drawn or declared: the side the edge runs towards. (Before 1.0 a few names — `in`, `out`,
  // `prev`, `next`, `top`… — chose a side here; React Flow has no such rule, and neither does this.)
  return { position: fallback, point: handleCoordinates(at, fallback, store.getNodeSize(node)) };
}


const NO_FEATURES: readonly Feature[] = [];

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

/** Where an edge's ends are, and what may be drawn on them. */
interface EdgeEnds {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  /** Whether the canvas offers reconnecting an end (an `onReconnect` is there to hear of it). */
  reconnectable: boolean;
  /** The features that draw something with a selected edge — the grips on its ends. */
  adornments: readonly Feature[];
}

/** What features draw with a *selected* edge. */
function Adornments({ edge, selected, selectable, ...a }: EdgeEnds & { edge: Edge; selected: boolean; selectable: boolean }) {
  if (!selected) return null;
  return (
    <>
      {a.adornments.map((f) =>
        f.EdgeAdornment ? (
          <f.EdgeAdornment
            key={f.name}
            edge={edge}
            selected={selected}
            selectable={selectable}
            reconnectable={a.reconnectable}
            source={{ x: a.sourceX, y: a.sourceY }}
            target={{ x: a.targetX, y: a.targetY }}
          />
        ) : null,
      )}
    </>
  );
}

interface EdgePathProps extends Omit<EdgeChrome, 'edge'>, EdgeEnds {
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
const EdgePath = /*#__PURE__*/ memo(function EdgePath({
  edge,
  selected,
  selectable,
  focusable,
  interactive,
  hooks,
  reconnectable,
  adornments,
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
  const { context, props } = useEdgeChrome({ edge, selected, selectable, focusable, interactive, hooks });
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
          interactionWidth={edge.interactionWidth}
          labelStyle={edge.labelStyle}
          labelShowBg={edge.labelShowBg}
          labelBgStyle={edge.labelBgStyle}
          labelBgPadding={edge.labelBgPadding}
          labelBgBorderRadius={edge.labelBgBorderRadius}
        />
      </EdgeContext.Provider>
      <Adornments
        edge={edge}
        selected={selected}
        selectable={selectable}
        reconnectable={reconnectable}
        adornments={adornments}
        sourceX={sourceX}
        sourceY={sourceY}
        targetX={targetX}
        targetY={targetY}
      />
    </g>
  );
});

interface CustomEdgeProps extends EdgeChrome {
  reconnectable: boolean;
  adornments: readonly Feature[];
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
const CustomEdge = /*#__PURE__*/ memo(function CustomEdge({
  View,
  edge,
  selected,
  selectable,
  focusable,
  interactive,
  hooks,
  reconnectable,
  adornments,
  ...ends
}: CustomEdgeProps) {
  const { context, props } = useEdgeChrome({ edge, selected, selectable, focusable, interactive, hooks });
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
          labelStyle={edge.labelStyle}
          labelShowBg={edge.labelShowBg}
          labelBgStyle={edge.labelBgStyle}
          labelBgPadding={edge.labelBgPadding}
          labelBgBorderRadius={edge.labelBgBorderRadius}
          style={edge.style}
          selected={selected}
          animated={edge.animated}
          selectable={selectable}
          deletable={edge.deletable ?? true}
          interactionWidth={edge.interactionWidth}
          pathOptions={edge.pathOptions}
          {...ends}
        />
      </EdgeContext.Provider>
      <Adornments
        edge={edge}
        selected={selected}
        selectable={selectable}
        reconnectable={reconnectable}
        adornments={adornments}
        sourceX={ends.sourceX}
        sourceY={ends.sourceY}
        targetX={ends.targetX}
        targetY={ends.targetY}
      />
    </g>
  );
});

export const FlowingerEdges = /*#__PURE__*/ memo(function FlowingerEdges(props: FlowingerEdgesProps) {
  const {
    edges,
    nodes,
    edgeTypes,
    elementsSelectable = false,
    selectionActs = true,
    edgesFocusable = true,
    interactive = false,
    controlledSelection = false,
    hiddenNodeIds,
    visibleEdgeIds,
    reconnectable = false,
    depths,
    features = NO_FEATURES,
    defaultMarkerColor,
    connectionLineContainerStyle,
  } = props;
  const store = useFlowingerStore();
  // Stable, so the memoised edges below are not remade by a new array each render.
  const adornments = useMemo(() => features.filter((f) => f.EdgeAdornment), [features]);
  const hooks = useMemo(() => features.filter((f) => f.useEdge), [features]);
  // Positions and sizes live in the store, not in props. The version is what
  // makes this component re-render when either moves.
  useSyncExternalStore(store.subscribeGeometry, store.getGeometryVersion, store.getGeometryVersion);

  // The edge whose end is being dragged elsewhere, if any: the line being dragged stands in for it.
  const reconnecting = useSyncExternalStore(
    store.subscribeConnection,
    () => store.getConnection()?.reconnecting ?? null,
    () => null,
  );

  // Kept between renders, not made at each: with culling the edge layer renders as the view moves, and a map
  // of every node and edge made each time cost more than drawing what is in view. A drag replaces one node
  // in the list, and the map is told of that one.
  const indexNodes = useMemo(createNodeIndex, []);
  const byId = useMemo(() => indexNodes(nodes), [indexNodes, nodes]);
  const edgeById = useMemo(
    () => (visibleEdgeIds ? new Map(edges.map((e) => [e.id, e])) : null),
    [edges, visibleEdgeIds !== undefined],
  );

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
    const marker = resolveMarker(spec, defaultMarkerColor ?? edgeStroke);
    const key = `${marker.type}|${marker.color}|${String(marker.width)}|${String(marker.height)}`;
    let entry = markers.get(key);
    if (!entry) {
      entry = { id: `${prefix}-m${String(markers.size)}`, marker };
      markers.set(key, entry);
    }
    return `url(#${entry.id})`;
  };

  // An edge is stacked with the nodes it joins — the higher of the two — so one
  // running into a node inside a group is drawn above the group, where it can be
  // clicked, and below the node it ends at. With no nesting that is level 0, the
  // one layer under every node.
  const nodeZ = (n: Node): number =>
    features.reduce(
      (z, f) => f.stackNode?.(store, n, z, store.isSelected(n.id), true) ?? z,
      n.zIndex ?? 1 + (depths?.get(n.id) ?? 0),
    );
  const levelOf = (source: Node, target: Node): number => {
    const z = Math.max(nodeZ(source), nodeZ(target));
    return z <= 1 ? 0 : z;
  };
  const levels = new Map<number, ReactElement[]>();

  let anyAnimated = false;
  const drawEdge = (edge: Edge): void => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target || edge.hidden) return;
    if (hiddenNodeIds ? hiddenNodeIds.has(source.id) || hiddenNodeIds.has(target.id) : source.hidden || target.hidden) {
      return;
    }
    if (visibleEdgeIds && !visibleEdgeIds.has(edge.id)) return;
    if (reconnecting === edge.id) return;

    const lookup = (id: string) => byId.get(id);
    // Top-left corners: each node on a chain gives up its origin's share of its size.
    const sourceAt = absolutePositionOf(source, lookup, store.resolvePosition, store.originOffset);
    const targetAt = absolutePositionOf(target, lookup, store.resolvePosition, store.originOffset);

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

    const selectable = edge.selectable === undefined ? elementsSelectable : edge.selectable && selectionActs;
    const selected = controlledSelection ? edge.selected === true : store.isEdgeSelected(edge.id);
    if (edge.animated) anyAnimated = true;
    const stroke = typeof edge.style?.stroke === 'string' ? edge.style.stroke : DEFAULT_EDGE_COLOR;
    const markerStart = markerRef(edge.markerStart, stroke);
    const markerEnd = markerRef(edge.markerEnd, stroke);

    // A key of `edgeTypes` wins, even over a built-in name.
    const View = edge.type ? edgeTypes?.[edge.type] : undefined;
    const level = features.reduce(
      (l, f) => f.stackEdge?.(store, edge, l, selected) ?? l,
      edge.zIndex ?? levelOf(source, target),
    );
    const place = (element: ReactElement): void => {
      const at = levels.get(level);
      if (at) at.push(element);
      else levels.set(level, [element]);
    };
    if (View) {
      place(
        <CustomEdge
          key={edge.id}
          View={View}
          edge={edge}
          selected={selected}
          selectable={selectable}
          focusable={edge.focusable ?? edgesFocusable}
          interactive={interactive}
          hooks={hooks}
          reconnectable={reconnectable}
          adornments={adornments}
          sourceX={from.point.x}
          sourceY={from.point.y}
          targetX={to.point.x}
          targetY={to.point.y}
          sourcePosition={from.position}
          targetPosition={to.position}
          markerStart={markerStart}
          markerEnd={markerEnd}
        />,
      );
      return;
    }

    if (process.env.NODE_ENV !== 'production' && store.apiOf('edgePaths') === undefined) warnAboutEdgePath(edge.type);
    const path = pathFor(edge.type, from.point, from.position, to.point, to.position, edge.pathOptions);
    place(
      <EdgePath
        key={edge.id}
        edge={edge}
        selected={selected}
        selectable={selectable}
        focusable={edge.focusable ?? edgesFocusable}
        interactive={interactive}
        hooks={hooks}
        reconnectable={reconnectable}
        adornments={adornments}
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
      />,
    );
  };
  // With culling, the edges to draw are the ones named, in the order they were found — which is the order
  // of the list — not every edge asked whether it is one of them.
  if (visibleEdgeIds && edgeById) {
    for (const id of visibleEdgeIds) {
      const edge = edgeById.get(id);
      if (edge) drawEdge(edge);
    }
  } else {
    edges.forEach(drawEdge);
  }

  // One <svg> per level, lowest first. The marker definitions and the animation's
  // stylesheet ride in the lowest — `url(#…)` finds a marker anywhere in the
  // document — and the line being dragged in the highest.
  const ordered = [...levels.keys()].sort((a, b) => a - b);
  if (ordered.length === 0) ordered.push(0);
  const lowest = ordered[0];
  const highest = ordered[ordered.length - 1];

  return (
    <>
      {ordered.map((level) => (
        <svg
          key={level}
          className="flowinger-edges react-flow__edges"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
            zIndex: level,
          }}
        >
          {level === lowest && anyAnimated && <style>{ANIMATED_EDGE_CSS}</style>}
          {level === lowest && markers.size > 0 && (
            <defs>
              {[...markers.values()].map(({ id, marker }) => (
                <MarkerDef key={id} id={id} marker={marker} />
              ))}
            </defs>
          )}
          {levels.get(level)}
        </svg>
      ))}
      {features.some((f) => f.EdgesLayer) && (
        // The line being dragged: its own element, as high as the highest edges unless told otherwise.
        <svg
          className="flowinger-connection react-flow__connectionline"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
            zIndex: highest,
            ...connectionLineContainerStyle,
          }}
        >
          {features.map((f) => (f.EdgesLayer ? <f.EdgesLayer key={f.name} {...props} /> : null))}
        </svg>
      )}
    </>
  );
});
