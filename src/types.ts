import type { CSSProperties, ComponentType, ReactNode } from 'react';
import type { Feature } from './features.ts';

export const Position = {
  Top: 'top',
  Right: 'right',
  Bottom: 'bottom',
  Left: 'left',
} as const;

export type Position = (typeof Position)[keyof typeof Position];

export type HandleType = 'source' | 'target';

/**
 * How a connection may be made. `strict` (the default) joins a `source` handle to
 * a `target` handle; `loose` lets any handle join any other, the end the drag
 * began at becoming the source.
 */
export const ConnectionMode = {
  Strict: 'strict',
  Loose: 'loose',
} as const;

export type ConnectionMode = (typeof ConnectionMode)[keyof typeof ConnectionMode];

/**
 * How a selection box picks nodes: `full` takes those wholly inside it, `partial`
 * any it touches.
 */
export const SelectionMode = {
  Full: 'full',
  Partial: 'partial',
} as const;

export type SelectionMode = (typeof SelectionMode)[keyof typeof SelectionMode];

/** Which handle a connection is being dragged out of. */
export interface ConnectStartParams {
  nodeId: string;
  handleId: string | null;
  handleType: HandleType;
}

/** How a connection drag ended. */
export interface ConnectEndState {
  /** What would have been connected, if the pointer was released over a compatible handle. */
  connection: Connection | null;
  /** `true` it was made, `false` it was refused (a clash of types, or `isValidConnection`), `null` no handle was there. */
  isValid: boolean | null;
}

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
  /**
   * Keeps the node inside a region while it is dragged or nudged: a region of
   * graph space, or `'parent'` for the box of its parent node.
   */
  extent?: TranslateExtent | 'parent';
  /**
   * Makes this node a child of another: its `position` is then relative to the
   * parent's, it moves with it, is drawn above it, and is deleted with it.
   */
  parentId?: string;
  /** Stacking order; by default a child sits above its parent. */
  zIndex?: number;
  /**
   * Let the parent grow to hold this node when it is dragged past the parent's
   * edge. Reported as changes to the parent (its size, and its position past the
   * top or left edge), so it needs a controlled flow; it takes the place of
   * `extent: 'parent'`, which would stop the node leaving the parent at all.
   */
  expandParent?: boolean;
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
  /**
   * Stacking order. By default an edge sits at the higher of its two nodes', so one running into a
   * node inside a group is drawn above the group and can be clicked there.
   */
  zIndex?: number;
  /**
   * Whether its ends can be dragged to other handles (see `onReconnect`): `false`
   * for neither, or `'source'` / `'target'` for just that end. Default true.
   */
  reconnectable?: boolean | HandleType;
  /** A built-in path, or a key of the canvas's `edgeTypes`. */
  type?: 'bezier' | 'straight' | 'step' | 'smoothstep' | (string & {});
  /** Text drawn at the middle of the edge. */
  label?: string;
  markerStart?: MarkerType | EdgeMarker;
  markerEnd?: MarkerType | EdgeMarker;
  data?: Record<string, unknown>;
}

/** The shape of the line dragged out of a handle while connecting. */
export const ConnectionLineType = {
  Bezier: 'bezier',
  Straight: 'straight',
  Step: 'step',
  SmoothStep: 'smoothstep',
} as const;

export type ConnectionLineType = (typeof ConnectionLineType)[keyof typeof ConnectionLineType];

/** What a custom connection line component receives. */
export interface ConnectionLineProps {
  /** Where the drag began, and which way it leaves. */
  fromX: number;
  fromY: number;
  fromPosition: Position;
  /** Where the pointer is — or the handle it has snapped to — and which way a line would arrive. */
  toX: number;
  toY: number;
  toPosition: Position;
  connectionLineType: ConnectionLineType;
  connectionLineStyle: CSSProperties | undefined;
  /** `true` over a handle that would make a valid connection, `false` over one that would not, `null` over neither. */
  isValid: boolean | null;
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
  selected?: boolean | undefined;
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
  /** Milliseconds to take over the move; none (or 0) is instant. */
  duration?: number;
}

export interface FitViewOptions extends SetViewportOptions {
  /**
   * As in React Flow, a ratio: `0.1` leaves a tenth of the diagram's size around
   * it. Left out, the margin is a fixed 40 px.
   */
  padding?: number;
  /** Fit only these nodes. */
  nodes?: { id: string }[];
  includeHiddenNodes?: boolean;
  minZoom?: number;
  maxZoom?: number;
}

export interface SetCenterOptions extends SetViewportOptions {
  /** Zoom to this as well. Default: keep the current zoom. */
  zoom?: number;
}

/** A rectangle in graph space. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
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
  /** Resolves `true` when the move lands, `false` if something else moved the view first. */
  setViewport: (viewport: Viewport, options?: SetViewportOptions) => Promise<boolean>;
  getViewport: () => Viewport;
  getZoom: () => number;
  zoomIn: (options?: SetViewportOptions) => Promise<boolean>;
  zoomOut: (options?: SetViewportOptions) => Promise<boolean>;
  /** Zoom to a level, about the centre of the pane. */
  zoomTo: (zoom: number, options?: SetViewportOptions) => Promise<boolean>;
  /** Put a point of the graph in the middle of the pane. */
  setCenter: (x: number, y: number, options?: SetCenterOptions) => Promise<boolean>;
  fitView: (options?: FitViewOptions) => Promise<boolean>;
  /** Show a rectangle of graph space, as `fitView` shows the nodes. */
  fitBounds: (bounds: Rect, options?: FitViewOptions) => Promise<boolean>;
  /** A point on the screen (`clientX`/`clientY`), in graph units — e.g. where a drop landed. */
  screenToFlowPosition: (position: XYPosition, options?: { snapToGrid?: boolean }) => XYPosition;
  /** The inverse: a point of the graph as a screen (`clientX`/`clientY`) position. */
  flowToScreenPosition: (position: XYPosition) => XYPosition;

  /** The nodes as they stand: a dragged position, a measured size and the selection included. */
  getNodes: () => Node[];
  getNode: (id: string) => Node | undefined;
  getEdges: () => Edge[];
  getEdge: (id: string) => Edge | undefined;
  /**
   * Edit the graph. These are reported as changes (`onNodesChange` / `onEdgesChange`),
   * so they need a controlled flow or `defaultNodes`; on nodes you only pass in, they do nothing.
   */
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  addNodes: (nodes: Node | Node[]) => void;
  addEdges: (edges: Edge | Edge[]) => void;
  /** Merge a patch into a node; with `replace`, swap the whole node for it. */
  updateNode: (
    id: string,
    patch: Partial<Node> | ((node: Node) => Partial<Node>),
    options?: { replace?: boolean },
  ) => void;
  updateNodeData: (
    id: string,
    data: Record<string, unknown> | ((node: Node) => Record<string, unknown>),
    options?: { replace?: boolean },
  ) => void;
  updateEdge: (
    id: string,
    patch: Partial<Edge> | ((edge: Edge) => Partial<Edge>),
    options?: { replace?: boolean },
  ) => void;

  /**
   * Delete nodes and edges by id (a node's edges go with it): reports the removal
   * like a key press does, after `onBeforeDelete`. Resolves with what was deleted.
   */
  deleteElements: (elements: {
    nodes?: { id: string }[];
    edges?: { id: string }[];
  }) => Promise<{ deletedNodes: Node[]; deletedEdges: Edge[] }>;

  /** Nodes that overlap a node or rectangle (`partially`, the default) or lie wholly inside it. */
  getIntersectingNodes: (
    target: Node | Rect | { id: string },
    partially?: boolean,
    nodes?: Node[],
  ) => Node[];
  isNodeIntersecting: (target: Node | Rect | { id: string }, area: Rect, partially?: boolean) => boolean;
  /** The smallest rectangle holding these nodes (or ids). */
  getNodesBounds: (nodes: (Node | string)[]) => Rect;
  toObject: () => { nodes: Node[]; edges: Edge[]; viewport: Viewport };
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
   * What the canvas can do beyond showing a graph and panning it — see `Feature`. `FlowingerCore` has
   * none unless they are given here; `FlowingerCanvas` has them all. Read once, when the canvas mounts.
   */
  features?: readonly Feature[];
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
  /**
   * Dragging on the empty canvas draws a selection box instead of panning (with
   * `elementsSelectable`). Holding Shift does that anyway. Pan with the middle or
   * right button (`panOnDrag={[1, 2]}`), or with the wheel (`panOnScroll`).
   * Default false.
   */
  selectionOnDrag?: boolean;
  /** Whether a selection box takes the nodes it touches or only those wholly inside. Default `'full'`. */
  selectionMode?: SelectionMode;
  /** A selection box began (past the drag threshold). */
  onSelectionStart?: (event: React.PointerEvent) => void;
  onSelectionEnd?: (event: React.PointerEvent) => void;
  /**
   * The wheel pans instead of zooming; Ctrl/⌘ with the wheel (and a trackpad pinch)
   * still zooms. Default false.
   */
  panOnScroll?: boolean;
  /** How far the wheel pans per unit of scroll. Default 0.5. */
  panOnScrollSpeed?: number;
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
  /**
   * An end of a selected edge was dragged onto another handle: `newConnection` is what it would now
   * join, source → target. Nothing is edited for you — swap the edge for it (`reconnectEdge`). Giving
   * this is what shows the drag handles on a selected edge.
   */
  onReconnect?: (oldEdge: Edge, newConnection: Connection) => void;
  /** An end of an edge began to be dragged; `handleType` is which end. */
  onReconnectStart?: (event: PointerEvent, edge: Edge, handleType: HandleType) => void;
  /** The drag ended, whether or not it found a handle. */
  onReconnectEnd?: (event: PointerEvent, edge: Edge, handleType: HandleType, state: ConnectEndState) => void;
  /** Show the drag handles on a selected edge (with `onReconnect`). Default true. */
  edgesReconnectable?: boolean;
  /** The shape of the line drawn while connecting. Default `'bezier'`. */
  connectionLineType?: ConnectionLineType;
  connectionLineStyle?: CSSProperties;
  /** Draw the line yourself: it is given the two ends, which way each faces, and whether it is over a valid handle. */
  connectionLineComponent?: ComponentType<ConnectionLineProps>;
  /** Zoom in on a double click on the empty canvas (out with Shift). Default true. */
  zoomOnDoubleClick?: boolean;
  /** Pan the view when a dragged node is held near the edge of the pane. Default true. */
  autoPanOnNodeDrag?: boolean;
  /** Pan the view when a connection is dragged near the edge of the pane. Default true. */
  autoPanOnConnect?: boolean;
  /** How fast auto-pan goes, in pixels per frame at the very edge. Default 15. */
  autoPanSpeed?: number;
  /**
   * How a connection may be made: `'strict'` (default) source → target only, `'loose'`
   * any handle to any other. `Connection` is always source → target either way.
   */
  connectionMode?: ConnectionMode;
  /** A connection drag began at a handle. */
  onConnectStart?: (event: PointerEvent, params: ConnectStartParams) => void;
  /** A connection drag ended — whether or not it made a connection. */
  onConnectEnd?: (event: PointerEvent, state: ConnectEndState) => void;
  /** A click on an edge (a selectable one, or a custom edge that draws its own hit area). */
  onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
  /** Whether selectable edges are tab stops, selected by Enter or Space. Default true. */
  edgesFocusable?: boolean;
  /**
   * The key that deletes the selection while focus is on the canvas, a node or an
   * edge (and not in a field). A `KeyboardEvent.key`, or a list of them; `null`
   * turns it off. Default `'Backspace'`. Deleting is *reported* — see `onNodesChange`.
   */
  deleteKeyCode?: string | string[] | null;
  /**
   * Called before anything is deleted, with what is about to go (the selection,
   * plus the edges of removed nodes). Return `false` to cancel, or a smaller set
   * to delete only that; it may return a promise — to ask first, say.
   */
  onBeforeDelete?: (elements: { nodes: Node[]; edges: Edge[] }) => boolean | { nodes: Node[]; edges: Edge[] } | Promise<boolean | { nodes: Node[]; edges: Edge[] }>;
  onNodesDelete?: (nodes: Node[]) => void;
  onEdgesDelete?: (edges: Edge[]) => void;
  /** Both lists at once, after `onNodesDelete` and `onEdgesDelete`. */
  onDelete?: (elements: { nodes: Node[]; edges: Edge[] }) => void;
  /** Called whenever the set of selected nodes or edges changes. */
  onSelectionChange?: (selection: { nodes: Node[]; edges: Edge[] }) => void;
  onInit?: (instance: FlowingerInstance) => void;
  /**
   * Draw only the nodes (and edges) that are in view, or near it, so a huge
   * diagram costs what is on screen rather than everything. Selected and dragged
   * nodes are always drawn. Default false.
   */
  onlyRenderVisibleElements?: boolean;
  /**
   * Fit the view to the nodes once, as soon as all of them have been measured.
   * `fitViewOptions` shapes that fit (and is what `fitView()` on the instance
   * does not read — it takes its own).
   */
  fitView?: boolean;
  fitViewOptions?: FitViewOptions;
  /** Defaults for every edge; an edge's own fields win. Compared by value, so an inline object is fine. */
  defaultEdgeOptions?: Partial<Omit<Edge, 'id' | 'source' | 'target'>>;
  /** Keep every dragged node inside this region of graph space. A node's own `extent` wins. */
  nodeExtent?: TranslateExtent;
  /** Round dragged positions to a grid — `snapGrid` (default 15 × 15). */
  snapToGrid?: boolean;
  snapGrid?: [number, number];
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
