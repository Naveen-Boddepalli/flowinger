import type { CSSProperties, ComponentType, ReactNode } from 'react';

export const Position = {
  Top: 'top',
  Right: 'right',
  Bottom: 'bottom',
  Left: 'left',
} as const;

export type Position = (typeof Position)[keyof typeof Position];

export type HandleType = 'source' | 'target';

export interface XYPosition {
  x: number;
  y: number;
}

export interface Node<T = Record<string, unknown>, Type extends string = string> {
  id: string;
  position: XYPosition;
  data: T;
  type?: Type;
  draggable?: boolean;
  selectable?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Sets the node's width in graph units. Unset, the node's content decides. */
  width?: number;
  height?: number;
  /** What the engine measured, written back by `applyNodeChanges` from a `dimensions` change. */
  measured?: { width?: number; height?: number };
  /** Whether the node is selected. Read only when the flow is controlled (see `onNodesChange`). */
  selected?: boolean;
  /** True while the node is being dragged; set by `applyNodeChanges`. */
  dragging?: boolean;
  /** Set while a `NodeResizer` is dragging it; written by `applyNodeChanges`. */
  resizing?: boolean;
  /** Take the node out of the diagram, and its edges with it. */
  hidden?: boolean;
  /** `false` keeps it out of a delete, whether by key or by `deleteElements`. */
  deletable?: boolean;
  /** `false` stops a connection starting or ending at any of its handles. */
  connectable?: boolean;
  /** A CSS selector: when set, the node can only be dragged by an element that matches it. */
  dragHandle?: string;
}

export interface NodeProps<N extends Node = Node> {
  id: string;
  data: N['data'];
  type?: N['type'];
  selected?: boolean;
  isConnectable?: boolean;
  positionAbsoluteX?: number;
  positionAbsoluteY?: number;
}

export const MarkerType = {
  Arrow: 'arrow',
  ArrowClosed: 'arrowclosed',
} as const;

export type MarkerType = (typeof MarkerType)[keyof typeof MarkerType];

/** An arrowhead. The bare `MarkerType` string takes every default. */
export interface EdgeMarker {
  type: MarkerType;
  /** Defaults to the edge's own stroke colour, else a neutral grey. */
  color?: string;
  /** Size in graph units (not scaled by the stroke). Default 12. */
  width?: number;
  height?: number;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  className?: string;
  style?: CSSProperties;
  animated?: boolean;
  /** Whether the edge is selected. Read only when the edge list is controlled (see `onEdgesChange`). */
  selected?: boolean;
  hidden?: boolean;
  /** `false` opts the edge out of selection by click. */
  selectable?: boolean;
  /** `false` keeps it out of a delete. */
  deletable?: boolean;
  /** A built-in path, or a key of the canvas's `edgeTypes`. */
  type?: 'bezier' | 'straight' | 'smoothstep' | (string & {});
  /** Text drawn at the middle of the edge. */
  label?: string;
  markerStart?: MarkerType | EdgeMarker;
  markerEnd?: MarkerType | EdgeMarker;
  data?: Record<string, unknown>;
}

/** A finished connection: which handle of which node, to which. Always source → target. */
export interface Connection {
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}

/** What a custom edge component receives. */
export interface EdgeProps {
  id: string;
  source: string;
  target: string;
  /** Where the edge attaches at each end, in graph units. */
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  /** Which way it leaves the source / arrives at the target. */
  sourcePosition: Position;
  targetPosition: Position;
  sourceHandleId: string | null;
  targetHandleId: string | null;
  data?: Record<string, unknown> | undefined;
  label?: string | undefined;
  style?: CSSProperties | undefined;
  /** `url(#…)` references into the shared marker definitions — put them on a `<path>`. */
  markerStart?: string | undefined;
  markerEnd?: string | undefined;
}

/** A registry of edge components by `Edge.type`, like `nodeTypes` for nodes. */
export type EdgeTypes = Record<string, ComponentType<EdgeProps>>;

/** The region of graph space the view may show: `[[minX, minY], [maxX, maxY]]`. */
export type TranslateExtent = [[number, number], [number, number]];

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface SetViewportOptions {
  duration?: number;
}

export const BackgroundVariant = {
  Dots: 'dots',
  Lines: 'lines',
  Cross: 'cross',
} as const;

export type BackgroundVariant = (typeof BackgroundVariant)[keyof typeof BackgroundVariant];

export interface BackgroundProps {
  variant?: BackgroundVariant;
  /** The spacing of the pattern, in graph units. Default 20. */
  gap?: number;
  /**
   * As in React Flow: a dot's *diameter*, or a cross's arm length, in graph units
   * (so it scales with zoom). Default 1 for dots, 6 for crosses; lines ignore it.
   */
  size?: number;
  /** The stroke width of lines and crosses. Default 1. */
  lineWidth?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

export interface HandleProps {
  id?: string;
  type: HandleType;
  position: Position;
  /** Whether a connection can start or end here. Default true — once the canvas has `nodesConnectable`. */
  isConnectable?: boolean;
  className?: string;
  style?: CSSProperties;
}

export interface FlowingerInstance {
  setViewport: (viewport: Viewport, options?: SetViewportOptions) => void;
  zoomIn: (options?: SetViewportOptions) => void;
  zoomOut: (options?: SetViewportOptions) => void;
  fitView: (options?: SetViewportOptions) => void;
  getViewport: () => Viewport;
}

/**
 * A registry of node components by `Node.type`. `NodeProps<never>` is the
 * widest type a component written against a specific `NodeProps<MyNode>` can
 * be assigned to: function parameters are contravariant, so anything narrower
 * than `never` would reject them.
 */
export type NodeTypes = Record<string, ComponentType<NodeProps<never>>>;

export interface FlowingerProps {
  /**
   * The nodes, owned by the caller. Give `onNodesChange` too and the flow is
   * *controlled*: dragging, selecting and measuring are reported as changes for
   * you to apply (see `applyNodeChanges`, `useNodesState`). Without it the
   * canvas still drags and selects, keeping that state itself and leaving your
   * array alone.
   */
  nodes?: Node[];
  edges?: Edge[];
  /** Start from these and let the canvas own the state; `nodes` then is not given. */
  defaultNodes?: Node[];
  defaultEdges?: Edge[];
  /** Given, the nodes are controlled: what happens to them is reported here, not done. */
  onNodesChange?(changes: NodeChange[]): void;
  /** Given, the edges are controlled — selection and removal are reported here, not done. */
  onEdgesChange?(changes: EdgeChange[]): void;
  nodeTypes?: NodeTypes;
  /** Custom edge components, by `Edge.type`. A key overrides a built-in of the same name. */
  edgeTypes?: EdgeTypes;
  minZoom?: number;
  maxZoom?: number;
  nodesDraggable?: boolean;
  /**
   * Let a click select a node (Shift/Ctrl/⌘ adds or removes one), a click on the
   * canvas clear the selection, and make nodes focusable so Enter/Space selects
   * from the keyboard. Default false; a node's own `selectable: false` opts it out.
   */
  elementsSelectable?: boolean;
  panOnDrag?: boolean | number[];
  zoomOnScroll?: boolean;
  /** Zoom with a two-finger pinch on touch. Default true. */
  zoomOnPinch?: boolean;
  /**
   * Keep the view inside this region of graph space, however it is panned or
   * zoomed. An extent smaller than the pane is centred in it. Unset: unbounded.
   */
  translateExtent?: TranslateExtent;
  /**
   * Make the canvas a tab stop and drive it from the keyboard while it has
   * focus: arrow keys pan (Shift for larger steps), `+` / `-` zoom, `0` fits
   * the view. Off by default, since it adds a tab stop.
   */
  keyboardNavigation?: boolean;
  /** The canvas's accessible name when `keyboardNavigation` is on. Default "Diagram". */
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** A drag began past the threshold. `nodes` is everything being dragged — the selection, when `node` is part of it. */
  onNodeDragStart?: (event: React.PointerEvent, node: Node, nodes: Node[]) => void;
  onNodeDrag?: (event: React.PointerEvent, node: Node, nodes: Node[]) => void;
  onNodeDragStop?: (event: React.PointerEvent, node: Node, nodes: Node[]) => void;
  /** A click anywhere on a node (whether or not it is selectable). */
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
  /** A click on the empty canvas — but not the click that ends a pan. */
  onPaneClick?: (event: React.MouseEvent) => void;
  /**
   * Let a handle be dragged to another to make a connection. Default false.
   * The engine never edits `edges`; it reports the connection through `onConnect`.
   */
  nodesConnectable?: boolean;
  /** A connection was dropped on a compatible handle and `isValidConnection` (if any) allowed it. */
  onConnect?: (connection: Connection) => void;
  /** Veto a connection. Also decides whether a handle snaps the in-progress line to itself. */
  isValidConnection?: (connection: Connection) => boolean;
  /** Called whenever the set of selected nodes or edges changes. */
  onSelectionChange?: (selection: { nodes: Node[]; edges: Edge[] }) => void;
  onInit?: (instance: FlowingerInstance) => void;
}

// --- changes ---------------------------------------------------------------
//
// A *controlled* flow reports what happened as a list of changes; the caller
// applies them to its own state with `applyNodeChanges` / `applyEdgeChanges`.

export interface NodePositionChange {
  type: 'position';
  id: string;
  /** Absent on the change that ends a drag. */
  position?: XYPosition;
  dragging?: boolean;
}

export interface NodeDimensionChange {
  type: 'dimensions';
  id: string;
  dimensions?: { width: number; height: number };
  resizing?: boolean;
  /** Also write `width`/`height` on the node (a resize), not only `measured`. */
  setAttributes?: boolean | 'width' | 'height';
}

export interface NodeSelectionChange {
  type: 'select';
  id: string;
  selected: boolean;
}

export interface NodeRemoveChange {
  type: 'remove';
  id: string;
}

export interface NodeAddChange<N extends Node = Node> {
  type: 'add';
  item: N;
  /** Where in the list; the end by default. */
  index?: number;
}

export interface NodeReplaceChange<N extends Node = Node> {
  type: 'replace';
  id: string;
  item: N;
}

export type NodeChange<N extends Node = Node> =
  | NodePositionChange
  | NodeDimensionChange
  | NodeSelectionChange
  | NodeRemoveChange
  | NodeAddChange<N>
  | NodeReplaceChange<N>;

export interface EdgeSelectionChange {
  type: 'select';
  id: string;
  selected: boolean;
}

export interface EdgeRemoveChange {
  type: 'remove';
  id: string;
}

export interface EdgeAddChange<E extends Edge = Edge> {
  type: 'add';
  item: E;
  index?: number;
}

export interface EdgeReplaceChange<E extends Edge = Edge> {
  type: 'replace';
  id: string;
  item: E;
}

export type EdgeChange<E extends Edge = Edge> =
  | EdgeSelectionChange
  | EdgeRemoveChange
  | EdgeAddChange<E>
  | EdgeReplaceChange<E>;
