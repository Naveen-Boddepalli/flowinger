import type {
  AriaRole,
  CSSProperties,
  ComponentType,
  DOMAttributes,
  HTMLAttributes,
  ReactNode,
  SVGAttributes,
} from 'react';
import type { PassThroughHtml } from './attributes.ts';
import type { NodeConnection } from './connections.ts';
import type { Feature } from './features.ts';

export const Position = {
  Top: 'top',
  Right: 'right',
  Bottom: 'bottom',
  Left: 'left',
} as const;

export type Position = (typeof Position)[keyof typeof Position];

export type HandleType = 'source' | 'target';

export type NodeOrigin = [number, number];

export type KeyCode = string | string[];

export type Align = 'center' | 'start' | 'end';

export interface NodeHandle {
  id?: string | null;
  type: HandleType;
  position: Position;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export type ColorMode = 'light' | 'dark' | 'system';
export type ColorModeClass = 'light' | 'dark';
export type ZIndexMode = 'auto' | 'basic' | 'manual';

export const PanOnScrollMode = {
  Free: 'free',
  Vertical: 'vertical',
  Horizontal: 'horizontal',
} as const;

export type PanOnScrollMode = (typeof PanOnScrollMode)[keyof typeof PanOnScrollMode];

export interface AriaLabelConfig {
  'node.a11yDescription.default'?: string;
  'node.a11yDescription.keyboardDisabled'?: string;
  'node.a11yDescription.ariaLiveMessage'?: (args: { direction: string; x: number; y: number }) => string;
  'edge.a11yDescription.default'?: string;
  'controls.ariaLabel'?: string;
  'controls.zoomIn.ariaLabel'?: string;
  'controls.zoomOut.ariaLabel'?: string;
  'controls.fitView.ariaLabel'?: string;
  'controls.interactive.ariaLabel'?: string;
  'minimap.ariaLabel'?: string;
  'handle.ariaLabel'?: string;
}

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
  /** Whether a click can select it: `true` even where the canvas does not allow it (`elementsSelectable`), `false` to opt out. */
  selectable?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Sets the node's width in graph units. Unset, the node's content decides. */
  width?: number;
  height?: number;
  /** What a node not yet measured is taken to be — by `fitView`, an edge to it — instead of 150 × 40. */
  initialWidth?: number;
  initialHeight?: number;
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
  /** Whether it is a tab stop: wins over the canvas's `nodesFocusable`, and over its being selectable. Needs `a11yFeature`. */
  focusable?: boolean;
  /**
   * Which side the built-in node types (`default`, `input`, `output`) put their handles on — a source
   * handle at `sourcePosition` (default bottom) and a target handle at `targetPosition` (default top). A
   * horizontal layout sets them to `'right'` and `'left'`. Handed to a node component of your own too,
   * which is free to use them or not.
   */
  sourcePosition?: Position;
  targetPosition?: Position;
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
  /** The ARIA role on the node's element. Default `'group'` once it is a tab stop, else none. */
  ariaRole?: AriaRole;
  ariaLabel?: string;
  /**
   * Origin of the node relative to its position.
   * e.g. [0.5, 0.5] centers the node, [0, 0] is top-left.
   */
  origin?: NodeOrigin;
  /**
   * @unimplemented Accepted so code written for React Flow compiles; this canvas does not act on it, and in
   * development says so. Edges attach to the `<Handle>`s a node renders, measured in the browser — a node's
   * declared handles do not stand in for them before then.
   */
  handles?: NodeHandle[];
  /**
   * Escape hatch for an attribute flowinger has no prop for (`title`, another `aria-*`…) — not a custom
   * `data-*` attribute, which needs a cast (`HTMLAttributes` does not declare it by name; nor does React
   * Flow's own). Never an event handler, or `id` / `style` / `className` / `role`, which the engine sets
   * itself.
   */
  domAttributes?: Omit<
    HTMLAttributes<HTMLDivElement>,
    'id' | 'style' | 'className' | 'draggable' | 'role' | 'children' | keyof DOMAttributes<HTMLDivElement>
  >;
}

/**
 * A node plus what the engine has worked out about it. Narrower than React Flow's own `InternalNode`
 * (no `handleBounds`, no `userNode`) — a snapshot, not the live object a render reads.
 */
export interface InternalNode extends Node {
  internals: {
    positionAbsolute: XYPosition;
    z: number;
  };
}

export interface NodeProps<N extends Node = Node> {
  id: string;
  data: N['data'];
  type?: N['type'];
  selected?: boolean;
  isConnectable?: boolean;
  positionAbsoluteX?: number;
  positionAbsoluteY?: number;
  /** Whether a click can select it: the canvas allows it, and the node has not opted out. */
  selectable?: boolean | undefined;
  /** Whether it can be dragged: the canvas's `nodesDraggable`, or the node's own say. */
  draggable?: boolean | undefined;
  deletable?: boolean | undefined;
  /** Being dragged now. */
  dragging?: boolean | undefined;
  dragHandle?: string | undefined;
  parentId?: string | undefined;
  /** What it is stacked at — the `z-index` the canvas gave it. */
  zIndex?: number | undefined;
  /** The size the node declares (`width`, `height`); the content decides where it does not. */
  width?: number | undefined;
  height?: number | undefined;
  /** Where the node's own `sourcePosition` / `targetPosition` put its handles; undefined unless it set them. */
  sourcePosition?: Position | undefined;
  targetPosition?: Position | undefined;
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
  /** Whether it is a tab stop: wins over the canvas's `edgesFocusable`. */
  focusable?: boolean;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  className?: string;
  style?: CSSProperties;
  animated?: boolean;
  /** Whether the edge is selected. Read only when the edge list is controlled (see `onEdgesChange`). */
  selected?: boolean;
  hidden?: boolean;
  /** Whether a click can select it: `true` even where the canvas does not allow it (`elementsSelectable`), `false` to opt out. */
  selectable?: boolean;
  /** `false` keeps it out of a delete. */
  deletable?: boolean;
  /**
   * Stacking order. By default an edge sits at the higher of its two nodes', so one running into a
   * node inside a group is drawn above the group and can be clicked there.
   */
  zIndex?: number;
  ariaLabel?: string;
  /** The ARIA role on the edge's `<g>`. Default a `button` once it is selectable and focusable, else none. */
  ariaRole?: AriaRole;
  /**
   * Escape hatch for an attribute flowinger has no prop for. Never an event handler, or `id` / `style` /
   * `className` / `role`, which the engine sets itself.
   */
  domAttributes?: Omit<
    SVGAttributes<SVGGElement>,
    'id' | 'style' | 'className' | 'role' | 'children' | keyof DOMAttributes<SVGGElement>
  >;
  /**
   * Whether its ends can be dragged to other handles (see `onReconnect`): `false`
   * for neither, or `'source'` / `'target'` for just that end. Default true.
   */
  reconnectable?: boolean | HandleType;
  /** A built-in path, or a key of the canvas's `edgeTypes`. */
  type?: 'bezier' | 'straight' | 'step' | 'smoothstep' | (string & {});
  /** Text drawn at the middle of the edge. */
  label?: string;
  /** Merged over the label's own style. */
  labelStyle?: CSSProperties;
  /** Draw a box behind the label (instead of the halo that keeps it readable). Its size is measured, so it needs a browser. */
  labelShowBg?: boolean;
  labelBgStyle?: CSSProperties;
  /** Space between the label and its box's edge, `[x, y]`. Default `[2, 4]`. */
  labelBgPadding?: [number, number];
  labelBgBorderRadius?: number;
  /**
   * The width, in graph units, of the invisible strip along the edge that takes the pointer, so a thin edge is
   * easy to hit. Default 20 when the edge can be clicked or the canvas listens to edge events, else none.
   */
  interactionWidth?: number;
  /** How the built-in `bezier` and `smoothstep` paths bend: the bezier's `curvature` (default 0.25), the smoothstep's `borderRadius` (default 5). */
  pathOptions?: { curvature?: number; borderRadius?: number };
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
  labelStyle?: CSSProperties | undefined;
  labelShowBg?: boolean | undefined;
  labelBgStyle?: CSSProperties | undefined;
  labelBgPadding?: [number, number] | undefined;
  labelBgBorderRadius?: number | undefined;
  style?: CSSProperties | undefined;
  selected?: boolean | undefined;
  animated?: boolean | undefined;
  /** Whether a click can select it: the canvas allows that, and the edge has not opted out. */
  selectable?: boolean | undefined;
  deletable?: boolean | undefined;
  interactionWidth?: number | undefined;
  pathOptions?: Edge['pathOptions'];
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
  /** Easing of the move, `t` from 0 to 1 in and 0 to 1 out. Default: ease-out cubic. */
  ease?: (t: number) => number;
  /**
   * @unimplemented Accepted so code written for React Flow compiles; a move is always a straight, eased
   * interpolation of x, y and zoom — which is React Flow's `'linear'`. `'smooth'` (its default) is not here.
   */
  interpolate?: 'smooth' | 'linear';
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
  /** The colour behind the pattern. Default: none, so what is behind the canvas shows. */
  bgColor?: string;
  /** A class on each dot, line or cross of the pattern. */
  patternClassName?: string;
  className?: string;
  style?: CSSProperties;
}

export interface HandleProps extends PassThroughHtml<'id'> {
  /** The handle's own name, which an edge's `sourceHandle` / `targetHandle` refers to — not a DOM `id`. */
  id?: string;
  type: HandleType;
  position: Position;
  /** Whether a connection can start or end here. Default true — once the canvas has `nodesConnectable`. */
  isConnectable?: boolean;
  /** Whether a connection can be dragged out of it. Default true. */
  isConnectableStart?: boolean;
  /** Whether a connection can be dropped on it. Default true. */
  isConnectableEnd?: boolean;
  /** Vets connections dragged out of this handle, in place of the canvas's `isValidConnection`. */
  isValidConnection?: (connection: Connection) => boolean;
  /** A connection dragged out of this handle was made — heard after the canvas's `onConnect`. */
  onConnect?: (connection: Connection) => void;
  className?: string;
  style?: CSSProperties;
}

export interface FlowingerInstance {
  /** True when the viewport has initialized and framed the pane. */
  readonly viewportInitialized: boolean;
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
  /**
   * A node plus what the engine has worked out about it: `internals.positionAbsolute` (its own position
   * plus every ancestor's — what an edge or `screenToFlowPosition` uses) and `internals.z` (its stacking
   * order, as drawn). Narrower than React Flow's own `InternalNode` — no `handleBounds`, no `userNode`.
   */
  getInternalNode: (id: string) => InternalNode | undefined;
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
  updateEdgeData: (
    id: string,
    data: Record<string, unknown> | ((edge: Edge) => Record<string, unknown>),
    options?: { replace?: boolean },
  ) => void;
  /**
   * The edges at a node, narrowed by which end of them it is (`type`) and, with a `type`, by handle. As in React
   * Flow, a `handleId` alone, or `null`, does not narrow.
   */
  getNodeConnections: (query: { type?: HandleType; nodeId: string; handleId?: string | null }) => NodeConnection[];
  /** The edges at one handle — `getNodeConnections` for a `type`, as React Flow's older call has it. */
  getHandleConnections: (query: { type: HandleType; nodeId: string; id?: string | null }) => NodeConnection[];

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
  getNodesBounds: (nodes: (Node | string)[], options?: { nodeOrigin?: NodeOrigin }) => Rect;
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
  /** Sets the `id` of the canvas's own element. */
  id?: string;
  /**
   * Escape hatch for an attribute flowinger has no prop for (`title`, another `aria-*`…) — not a custom
   * `data-*` attribute without a cast, same limit `HTMLAttributes` puts on Node's and Edge's own. React
   * Flow accepts almost any HTML attribute directly on `<ReactFlow>`; this is narrower — never an event
   * handler, since the canvas owns its own pointer, keyboard and click handling, or `id` / `style` /
   * `className` / `children` / `role` / `tabIndex`, which are the engine's (or `keyboardNavigation`'s) own.
   */
  domAttributes?: Omit<
    HTMLAttributes<HTMLDivElement>,
    | 'id'
    | 'style'
    | 'className'
    | 'children'
    | 'role'
    | 'tabIndex'
    | keyof DOMAttributes<HTMLDivElement>
  >;
  /** A drag began past the threshold. `nodes` is everything being dragged — the selection, when `node` is part of it. */
  onNodeDragStart?: (event: React.PointerEvent, node: Node, nodes: Node[]) => void;
  onNodeDrag?: (event: React.PointerEvent, node: Node, nodes: Node[]) => void;
  onNodeDragStop?: (event: React.PointerEvent, node: Node, nodes: Node[]) => void;
  /** A click anywhere on a node (whether or not it is selectable). */
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
  /** A click on the empty canvas — but not the click that ends a pan. */
  onPaneClick?: (event: React.MouseEvent) => void;
  /** A double click on a node. */
  onNodeDoubleClick?: (event: React.MouseEvent, node: Node) => void;
  /** A right click on a node. */
  onNodeContextMenu?: (event: React.MouseEvent, node: Node) => void;
  /** The pointer came onto a node, moved over it, or left it. */
  onNodeMouseEnter?: (event: React.MouseEvent, node: Node) => void;
  onNodeMouseMove?: (event: React.MouseEvent, node: Node) => void;
  onNodeMouseLeave?: (event: React.MouseEvent, node: Node) => void;
  /**
   * A double click, a right click, or the pointer coming onto, moving over and leaving an edge. Giving any of
   * these (or `onEdgeClick`) makes every edge take the pointer, selectable or not.
   */
  onEdgeDoubleClick?: (event: React.MouseEvent, edge: Edge) => void;
  onEdgeContextMenu?: (event: React.MouseEvent, edge: Edge) => void;
  onEdgeMouseEnter?: (event: React.MouseEvent, edge: Edge) => void;
  onEdgeMouseMove?: (event: React.MouseEvent, edge: Edge) => void;
  onEdgeMouseLeave?: (event: React.MouseEvent, edge: Edge) => void;
  /**
   * A right click on the empty canvas. With right-button panning (`panOnDrag={[1, 2]}`) the browser's menu is
   * held back and this is not called, as in React Flow.
   */
  onPaneContextMenu?: (event: React.MouseEvent) => void;
  /** The pointer came onto the canvas (nodes and all), moved over it, or left it. */
  onPaneMouseEnter?: (event: React.MouseEvent) => void;
  onPaneMouseMove?: (event: React.MouseEvent) => void;
  onPaneMouseLeave?: (event: React.MouseEvent) => void;
  /** The wheel turned over the empty canvas — whether or not it zoomed. */
  onPaneScroll?: (event?: React.WheelEvent) => void;
  /**
   * Accepted so that code written for React Flow compiles; there is nothing to hide, since flowinger draws no
   * attribution.
   */
  proOptions?: { hideAttribution?: boolean; account?: string };
  attributionPosition?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  /**
   * Where the view starts. Once, when the canvas mounts — `fitView` then replaces it, as in React Flow. Inside a
   * `FlowingerProvider`, the canvas moves the provider's view there.
   */
  defaultViewport?: Viewport;
  /**
   * The view, owned by the caller. Given, the canvas draws exactly this and moves nowhere on its own: a
   * pan, a zoom, `fitView`, a zoom button — each asks through `onViewportChange` with where it would go, and
   * the view changes when `viewport` does. Without `onViewportChange` the view cannot be moved at all.
   * `defaultViewport` is ignored.
   */
  viewport?: Viewport;
  /**
   * Hears every change of the view, where it is going. With `viewport` it is the request to move; without,
   * a report that it has — after the move, and not for one `viewport` itself made.
   */
  onViewportChange?: (viewport: Viewport) => void;
  /**
   * The view is moving — from its first change to its last. `event` is what moves it (the pointer, the
   * wheel) or null for a call such as `fitView`; a run of wheel ticks is one move, ended when the wheel has
   * been still for 150 ms.
   */
  onMoveStart?: (event: MouseEvent | TouchEvent | null, viewport: Viewport) => void;
  onMove?: (event: MouseEvent | TouchEvent | null, viewport: Viewport) => void;
  onMoveEnd?: (event: MouseEvent | TouchEvent | null, viewport: Viewport) => void;
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
  /** A click on an edge — a selectable one, or any edge when an `onEdge…` handler is given. */
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
  /**
   * Where on a node its `position` is: `[0, 0]` its top-left corner (the default), `[0.5, 0.5]` its centre. A
   * node's own `origin` wins. A child's `position` is relative to its parent's top-left corner, as in React Flow.
   */
  nodeOrigin?: NodeOrigin;
  /**
   * Holding this key turns a drag into a pan, even where `panOnDrag` is off. Needs `panKeyFeature` (which
   * `FlowingerCanvas` has). Off unless given — React Flow's own default is `'Space'`.
   */
  panActivationKeyCode?: string | string[] | null;
  /**
   * Pixels a press must travel before it becomes a node drag. Left out, the engine's own 3; an explicit `0` is
   * no threshold. Needs `dragFeature`.
   */
  nodeDragThreshold?: number;
  /**
   * The key that, held, turns a drag on the empty canvas into a selection box (with `elementsSelectable`). A key or combination (`'Alt'`, `'Meta+a'`), or a list; `null` for none, so only `selectionOnDrag` draws one. Default `'Shift'`. Needs `boxSelectFeature`.
   */
  selectionKeyCode?: string | string[] | null;
  /**
   * The key that, held, makes a click or a drag add to the selection instead of replacing it. Left out, Shift, Control and ⌘ all do; given, only this key; `null` for none. Needs `selectionFeature`.
   */
  multiSelectionKeyCode?: string | string[] | null;
  /**
   * The key that, held, makes the wheel zoom — even where `zoomOnScroll` is off, and instead of panning under `panOnScroll`. A pinch (Control + wheel) zooms whatever `zoomOnScroll` says once a key is given. Left out, Control or ⌘ only chooses between panning and zooming under `panOnScroll`.
   */
  zoomActivationKeyCode?: string | string[] | null;
  /**
   * With `panOnScroll`, which axes the wheel pans: `'free'` (both, the default), `'vertical'` or `'horizontal'`. Shift turns a vertical wheel sideways, except in `'vertical'` (macOS does that itself).
   */
  panOnScrollMode?: PanOnScrollMode;
  /**
   * Whether the wheel over the canvas is the canvas's and the page does not scroll (default true). Off, a plain wheel scrolls the page and does not zoom; a pinch (Control + wheel) still zooms, and a wheel that pans (`panOnScroll`) is still the canvas's.
   */
  preventScrolling?: boolean;
  /**
   * Pixels the pointer must travel from a handle before it becomes a connection (default 1). A press that does not travel is only a click on the handle — see `connectOnClick` — and starts no connection, so `onConnectStart` and `onConnectEnd` are not called for it. `0` starts it at the press. Needs `connectFeature`.
   */
  connectionDragThreshold?: number;
  /**
   * How far, in pixels, a press on a node may move and still be a click. Further than that, and not far enough to be a drag, it is not a click (no `onNodeClick`, no selection). Left out, any press that does not become a drag is a click. Needs `dragFeature`.
   */
  nodeClickDistance?: number;
  /**
   * How far, in pixels, a press on the empty canvas may move and still be a click on the pane (`onPaneClick`, clearing the selection). Left out, any press that does not become a pan is a click.
   */
  paneClickDistance?: number;
  /**
   * How near a handle a dropped connection snaps to it, in graph units (default 20): the nearest connectable handle within that of the pointer is the one it ends at, and the line is drawn to it, even where the pointer is not over it. A handle under the pointer is always preferred. `0` is only a handle the pointer is over. Needs `connectFeature`.
   */
  connectionRadius?: number;
  /**
   * As `connectionRadius`, for dragging an end of an edge to reconnect it (default 10). Needs `reconnectFeature`.
   */
  reconnectRadius?: number;
  /**
   * Whether dragging an unselected node selects it (default true). Off, it moves alone and what was selected is dropped; a click still selects. Needs `dragFeature`.
   */
  selectNodesOnDrag?: boolean;
  /**
   * Make a connection by clicking a handle and then another, as well as by dragging (default true; with `nodesConnectable`). The first click is `onClickConnectStart` and puts a `clickconnecting` class on the handle; the second makes the connection if it is valid and is `onClickConnectEnd` either way. Needs `connectFeature`.
   */
  connectOnClick?: boolean;
  /** A first click on a handle, beginning a connection made by clicking (`connectOnClick`). */
  onClickConnectStart?: (event: MouseEvent | TouchEvent, params: ConnectStartParams) => void;
  /** The second click, whether or not it made a connection: `{ connection, isValid }` as `onConnectEnd` is given. */
  onClickConnectEnd?: (event: MouseEvent | TouchEvent, state: ConnectEndState) => void;
  /** The rectangle round a box selection starts to be dragged (`nodes`: everything it moves). `onNodeDragStart` is called as well. Needs `selectionRectFeature`. */
  onSelectionDragStart?: (event: React.MouseEvent, nodes: Node[]) => void;
  /** The rectangle round a box selection is being dragged. `onNodeDrag` is called as well. Needs `selectionRectFeature`. */
  onSelectionDrag?: (event: React.MouseEvent, nodes: Node[]) => void;
  /** The rectangle round a box selection was let go. `onNodeDragStop` is called as well. Needs `selectionRectFeature`. */
  onSelectionDragStop?: (event: React.MouseEvent, nodes: Node[]) => void;
  /** A right click on the rectangle round a box selection, with the selected nodes. Needs `selectionRectFeature`. */
  onSelectionContextMenu?: (event: React.MouseEvent, nodes: Node[]) => void;
  /**
   * `'light'`, `'dark'` or `'system'` (the OS's setting, followed as it changes). The canvas gets the class `light` or `dark`, as in React Flow; `light` also sets the `--flowinger-*` colours to a light palette for what is drawn inside the canvas (`dark` is the library's default). Needs `colorModeFeature`.
   */
  colorMode?: ColorMode;
  /**
   * Raise a selected node (and what is inside it) by 1000, above its overlapping neighbours (default true, as in React Flow). Needs `stackingFeature`.
   */
  elevateNodesOnSelect?: boolean;
  /**
   * Raise a selected edge by 1000, and the edges of a selected node with it (default false, as in React Flow). Needs `stackingFeature`.
   */
  elevateEdgesOnSelect?: boolean;
  /**
   * `'basic'` (default): a child above its parent, a node's own `zIndex` honoured, selected ones raised. `'auto'`: as basic, and each group's subtree is kept above the one before it. `'manual'`: only `zIndex`, with no nesting and no raising. Needs `stackingFeature`.
   */
  zIndexMode?: ZIndexMode;
  /**
   * The colour of an arrowhead that names none. Left out, it is its edge's stroke.
   */
  defaultMarkerColor?: string | null;
  /**
   * Style for the element the connection line is drawn in — its `zIndex`, say. The line's own style is `connectionLineStyle`. Needs `connectFeature`.
   */
  connectionLineContainerStyle?: CSSProperties;
  /**
   * A class of your own for what a press does not drag a node from, as `nodrag` does — which keeps working.
   */
  noDragClassName?: string;
  /**
   * A class of your own for what a press does not pan from, as `nopan` does — which keeps working.
   */
  noPanClassName?: string;
  /**
   * A class of your own for what the wheel passes through, as `nowheel` does — which keeps working.
   */
  noWheelClassName?: string;
  /**
   * Whether nodes are tab stops: `true` for every node, selectable or not, `false` for none. Left out, a node is one where it can be selected (`elementsSelectable`), as before. A node's own `focusable` wins. Needs `a11yFeature`.
   */
  nodesFocusable?: boolean;
  /**
   * Take nodes and edges out of the tab order and silence their keys (Enter and Space to select, the arrows to move). Clicking still works. Needs `a11yFeature`.
   */
  disableKeyboardA11y?: boolean;
  /**
   * Replacement text for what the canvas says to assistive technology: the descriptions nodes and edges point at (`aria-describedby`), the live message that announces a move made with the keyboard, and the labels of the controls, the minimap and a handle. A part of it may be given; the rest stays English. Needs `a11yFeature`.
   */
  ariaLabelConfig?: AriaLabelConfig;
  /**
   * Pan to a node that takes focus (from the keyboard) when it is out of view, keeping the zoom (default true). Needs `a11yFeature`.
   */
  autoPanOnNodeFocus?: boolean;
  /**
   * Pan the view while a selection box is held at the pane's edge, keeping the box's corner on the same place in the graph (default true). Needs `boxSelectFeature`.
   */
  autoPanOnSelection?: boolean;
  /**
   * Log every change a controlled flow is told of (`flowinger: node changes`, `flowinger: edge changes`) to the console. Needs `debugFeature`.
   */
  debug?: boolean;
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
