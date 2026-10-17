// React Flow's names for types flowinger already has — so `import type { OnNodesChange } from '@xyflow/react'`
// becomes a change of package name and nothing else. These were most of what the audit listed as missing
// (`node scripts/audit-react-flow.mjs`): 103 of 112 exports, and a missing one is the first compile error
// in a migration.
//
// Types only: nothing here exists at runtime, so nothing reaches a bundle.
//
// A name here is not a promise of behaviour: where flowinger has the name but not the feature, the prop is tagged
// `@unimplemented` in `types.ts` and warns in development (`docs/react-flow-coverage.md` lists them).
//
// Differences on purpose:
//   - names whose *shape* differs are still exported, so an import compiles, but a handler annotated with
//     them is a compile error at the call site: `FinalConnectionState` is not what `onConnectEnd` is given
//     (it gets a `ConnectEndState`);
//   - generics flowinger does not have. `ReactFlowProps` and `ReactFlowInstance` take no node/edge type
//     arguments here, because the canvas and the instance are not generic; `ReactFlowInstance<MyNode>` is
//     an error rather than a type that quietly ignores `MyNode`.
//
// Each handler is written out against the prop it describes, and `reactFlowNames.test.ts` asserts that it
// is *exactly* that prop's type — so these cannot drift from what the canvas accepts.
import type {
  ButtonHTMLAttributes,
  ComponentProps,
  ComponentType,
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  SVGAttributes,
} from 'react';
import type { BezierEdge, SmoothStepEdge, StepEdge, StraightEdge } from './builtinEdges.tsx';
import type { ControlsProps } from './Controls.tsx';
import type { NodeConnection } from './connections.ts';
import type { UseNodeConnectionsOptions } from './dataHooks.ts';
import type { EdgeLabelRenderer } from './EdgeLabelRenderer.tsx';
import type { Padding } from './geometry.ts';
import type { MiniMapNodeProps as MiniMapNodePropsType, MiniMapProps } from './MiniMap.tsx';
import type { NodeResizerProps, ResizeControlProps as ResizeControlPropsType, ResizeParams } from './NodeResizer.tsx';
import type { useOnSelectionChange } from './selectionHooks.ts';
import type { ConnectionInProgress, NoConnection } from './connectionHook.ts';
import type {
  AriaLabelConfig as AriaLabelConfigType,
  ColorMode,
  ColorModeClass,
  Connection,
  ConnectEndState,
  ConnectStartParams,
  ConnectionLineProps,
  Edge,
  EdgeChange,
  EdgeProps,
  FlowingerInstance,
  FlowingerProps,
  InternalNode,
  Node,
  NodeChange,
  NodeHandle,
  NodeOrigin,
  PanOnScrollMode,
  Position,
  Rect,
  TranslateExtent,
  Viewport,
  XYPosition,
  ZIndexMode,
} from './types.ts';

// --- the canvas and the instance ------------------------------------------------------------------------

/** The canvas's props. Not generic: `FlowingerProps` takes no node or edge type. */
export type ReactFlowProps = FlowingerProps;
/** What `useReactFlow()` returns. Not generic. */
export type ReactFlowInstance = FlowingerInstance;
/** What `instance.toObject()` returns. */
export type ReactFlowJsonObject<N extends Node = Node, E extends Edge = Edge> = {
  nodes: N[];
  edges: E[];
  viewport: Viewport;
};
/** `defaultEdgeOptions`: defaults for every edge; an edge's own fields win. */
export type DefaultEdgeOptions = NonNullable<FlowingerProps['defaultEdgeOptions']>;

// --- callbacks ------------------------------------------------------------------------------------------

export type OnNodesChange<N extends Node = Node> = (changes: NodeChange<N>[]) => void;
export type OnEdgesChange<E extends Edge = Edge> = (changes: EdgeChange<E>[]) => void;

export type OnConnect = (connection: Connection) => void;
/** Which handle a drag began at — narrower than React Flow's (no `null` node or handle type). */
export type OnConnectStartParams = ConnectStartParams;
export type OnConnectStart = (event: PointerEvent, params: OnConnectStartParams) => void;
/** Its second argument is flowinger's `ConnectEndState` — `{ connection, isValid }`. */
export type OnConnectEnd = (event: PointerEvent, state: ConnectEndState) => void;
export type IsValidConnection = (connection: Connection) => boolean;
export type OnReconnect<E extends Edge = Edge> = (oldEdge: E, newConnection: Connection) => void;

export type OnInit = (instance: FlowingerInstance) => void;
export type OnMove = (event: MouseEvent | TouchEvent | null, viewport: Viewport) => void;
export type OnMoveStart = OnMove;
export type OnMoveEnd = OnMove;

export type OnNodeDrag<N extends Node = Node> = (event: React.PointerEvent, node: N, nodes: N[]) => void;
export type NodeMouseHandler<N extends Node = Node> = (event: React.MouseEvent, node: N) => void;
export type EdgeMouseHandler<E extends Edge = Edge> = (event: React.MouseEvent, edge: E) => void;

export type OnNodesDelete<N extends Node = Node> = (nodes: N[]) => void;
export type OnEdgesDelete<E extends Edge = Edge> = (edges: E[]) => void;
export type OnDelete<N extends Node = Node, E extends Edge = Edge> = (elements: { nodes: N[]; edges: E[] }) => void;
/** May return `false`, a smaller set, or a promise of either — a superset of what React Flow's allows. */
export type OnBeforeDelete<N extends Node = Node, E extends Edge = Edge> = (elements: {
  nodes: N[];
  edges: E[];
}) => boolean | { nodes: N[]; edges: E[] } | Promise<boolean | { nodes: N[]; edges: E[] }>;

export type OnSelectionChangeParams<N extends Node = Node, E extends Edge = Edge> = { nodes: N[]; edges: E[] };
export type OnSelectionChangeFunc<N extends Node = Node, E extends Edge = Edge> = (
  params: OnSelectionChangeParams<N, E>,
) => void;

// --- geometry -------------------------------------------------------------------------------------------

export type CoordinateExtent = TranslateExtent;
export type SnapGrid = [number, number];
export type KeyCode = string | string[];
export type Dimensions = { width: number; height: number };
export type Box = XYPosition & { x2: number; y2: number };
export type Transform = [number, number, number];
export type XYZPosition = XYPosition & { z: number };

// --- instance methods, as types -------------------------------------------------------------------------

export type SetViewport = FlowingerInstance['setViewport'];
export type SetCenter = FlowingerInstance['setCenter'];
export type FitBounds = FlowingerInstance['fitBounds'];
export type FitView = FlowingerInstance['fitView'];

// --- components and paths -------------------------------------------------------------------------------

export type ConnectionLineComponentProps = ConnectionLineProps;
export type ConnectionLineComponent = ComponentType<ConnectionLineComponentProps>;
export type ControlProps = ControlsProps;
export type UseNodeConnectionsParams = UseNodeConnectionsOptions;

export type BezierEdgeProps = ComponentProps<typeof BezierEdge>;
export type StraightEdgeProps = ComponentProps<typeof StraightEdge>;
export type SmoothStepEdgeProps = ComponentProps<typeof SmoothStepEdge>;
export type StepEdgeProps = ComponentProps<typeof StepEdge>;

// --- the small ones --------------------------------------------------------------------------------------

/** An edge at a handle, as `useNodeConnections` and `getHandleConnections` return it. */
export type HandleConnection = NodeConnection;
/** What a `ControlButton` takes: a button's own attributes. */
export type ControlButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;
export type EdgeLabelRendererProps = ComponentProps<typeof EdgeLabelRenderer>;
/** What `deleteElements` is given: the ids (and nothing more is read) of what to delete. */
export type DeleteElementsOptions = Parameters<FlowingerInstance['deleteElements']>[0];
/** What `fitBounds` takes after the rectangle. */
export type FitBoundsOptions = NonNullable<Parameters<FlowingerInstance['fitBounds']>[1]>;
export type UseOnSelectionChangeOptions = Parameters<typeof useOnSelectionChange>[0];
/** A marker an edge can ask for: `'arrow'`, `'arrowclosed'` or `{ type, color, width, height }`. */
export type EdgeMarkerType = NonNullable<Edge['markerEnd']>;
/** `proOptions`: accepted so code written for React Flow compiles; there is no attribution to hide. */
export type ProOptions = NonNullable<FlowingerProps['proOptions']>;

// What a `NodeResizer` is given and calls — its pointer event is a React one, as React Flow's own is.
export type OnResizeStart = NonNullable<NodeResizerProps['onResizeStart']>;
export type OnResize = NonNullable<NodeResizerProps['onResize']>;
export type OnResizeEnd = NonNullable<NodeResizerProps['onResizeEnd']>;
export type ShouldResize = NonNullable<NodeResizerProps['shouldResize']>;

// --- remaining React Flow exports -------------------------------------------------------------------------

export type { NodeOrigin, ColorMode, ColorModeClass, PanOnScrollMode, ZIndexMode, NodeHandle };
export type AriaLabelConfig = AriaLabelConfigType;
export type OnError = (id: string, message: string) => void;
export type OnSelectionDrag = (event: MouseEvent | TouchEvent, nodes: Node[]) => void;
export type SelectionDragHandler<N extends Node = Node> = (event: ReactMouseEvent, nodes: N[]) => void;
export type SelectionRect = Rect & { startX: number; startY: number };
export type UnselectNodesAndEdgesParams<N extends Node = Node, E extends Edge = Edge> = { nodes?: N[]; edges?: E[] };
export type UseNodesInitializedOptions = { includeHiddenNodes?: boolean };
export type ViewportHelperFunctionOptions = { duration?: number };
export type ViewportHelperFunctions = {
  zoomIn: (options?: ViewportHelperFunctionOptions) => Promise<boolean>;
  zoomOut: (options?: ViewportHelperFunctionOptions) => Promise<boolean>;
  zoomTo: (zoom: number, options?: ViewportHelperFunctionOptions) => Promise<boolean>;
  setViewport: (viewport: Viewport, options?: ViewportHelperFunctionOptions) => Promise<boolean>;
  getViewport: () => Viewport;
  fitView: (options?: Parameters<FlowingerInstance['fitView']>[0]) => Promise<boolean>;
  setCenter: (x: number, y: number, options?: Parameters<FlowingerInstance['setCenter']>[2]) => Promise<boolean>;
  fitBounds: (bounds: Rect, options?: Parameters<FlowingerInstance['fitBounds']>[1]) => Promise<boolean>;
  screenToFlowPosition: (position: XYPosition, options?: { snapToGrid?: boolean }) => XYPosition;
  flowToScreenPosition: (position: XYPosition) => XYPosition;
};
export type ControlLinePosition = 'top' | 'bottom' | 'left' | 'right';
export type ControlPosition = ControlLinePosition | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type Align = 'center' | 'start' | 'end';
export type BezierPathOptions = { curvature?: number };
export type SmoothStepPathOptions = { offset?: number; borderRadius?: number };
export type BuiltInNode =
  | Node<{ label: string }, 'input' | 'output' | 'default'>
  | Node<Record<string, never>, 'group'>;
export type BuiltInEdge = Edge;
/**
 * @deprecated React Flow does not export this: it is the example in a doc comment of its `Node` type, which the
 * coverage audit used to count as an export. Write your own node type; this goes in 2.0.
 */
export type CounterNode = Node<{ initialCount?: number }, 'counter'>;
export type MiniMapNodeProps = MiniMapNodePropsType;
export type MiniMapNodes = Pick<
  MiniMapProps,
  'nodeColor' | 'nodeStrokeColor' | 'nodeClassName' | 'nodeBorderRadius' | 'nodeStrokeWidth' | 'nodeComponent'
> & {
  nodes: Node[];
};
export type GetMiniMapNodeAttribute<N extends Node = Node> = (node: N) => string;
export type ResizeControlVariant = 'line' | 'handle';
export type ResizeControlProps = ResizeControlPropsType;
export type ResizeControlLineProps = Omit<ResizeControlProps, 'resizeDirection'> & { position?: ControlLinePosition };
export type ResizeDragEvent = React.PointerEvent;
export type ResizeParamsWithDirection = ResizeParams & { direction: number[] };
export type EdgeLabelOptions = {
  label?: ReactNode;
  labelStyle?: CSSProperties;
  labelShowBg?: boolean;
  labelBgStyle?: CSSProperties;
  labelBgPadding?: [number, number];
  labelBgBorderRadius?: number;
};
export type EdgeComponentProps = EdgeProps;
export type EdgeComponentWithPathOptions<PathOptions = BezierPathOptions> = EdgeComponentProps & {
  pathOptions?: PathOptions;
};
export type SimpleBezierEdgeProps = EdgeComponentProps;
export type EdgeTextProps = Omit<SVGAttributes<SVGElement>, 'x' | 'y'> &
  EdgeLabelOptions & {
    x: number;
    y: number;
    children?: ReactNode;
    className?: string;
  };
export type EdgeToolbarProps = {
  edgeId: string;
  x?: number;
  y?: number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  isVisible?: boolean;
  alignX?: Align;
  alignY?: Align;
};
export type EdgeWrapperProps<E extends Edge = Edge> = {
  id: string;
  edgesFocusable?: boolean;
  edgesReconnectable?: boolean;
  elementsSelectable?: boolean;
  noPanClassName?: string;
  onClick?: EdgeMouseHandler<E>;
  onDoubleClick?: EdgeMouseHandler<E>;
  onReconnect?: OnReconnect<E>;
  onContextMenu?: EdgeMouseHandler<E>;
  onMouseEnter?: EdgeMouseHandler<E>;
  onMouseMove?: EdgeMouseHandler<E>;
  onMouseLeave?: EdgeMouseHandler<E>;
  reconnectRadius?: number;
};
export type NodeWrapperProps<N extends Node = Node> = {
  id: string;
  nodesConnectable?: boolean;
  elementsSelectable?: boolean;
  nodesDraggable?: boolean;
  nodesFocusable?: boolean;
  onClick?: NodeMouseHandler<N>;
  onDoubleClick?: NodeMouseHandler<N>;
  onMouseEnter?: NodeMouseHandler<N>;
  onMouseMove?: NodeMouseHandler<N>;
  onMouseLeave?: NodeMouseHandler<N>;
  onContextMenu?: NodeMouseHandler<N>;
  noDragClassName?: string;
  noPanClassName?: string;
  disableKeyboardA11y?: boolean;
  nodeClickDistance?: number;
};
export type FinalConnectionState =
  | (Omit<ConnectionInProgress, 'inProgress' | 'toPosition'> & {
      toPosition: Position | null;
    })
  | Omit<NoConnection, 'inProgress'>;
export type FitViewParams<N extends Node = Node> = {
  nodes?: N[];
  width?: number;
  height?: number;
  minZoom?: number;
  maxZoom?: number;
  padding?: Padding;
};
export type ReactFlowStore<N extends Node = Node, E extends Edge = Edge> = {
  rfId: string;
  width: number;
  height: number;
  transform: Transform;
  nodes: N[];
  edges: E[];
  viewportInitialized: boolean;
};
export type ReactFlowActions<N extends Node = Node, E extends Edge = Edge> = {
  setNodes: (nodes: N[]) => void;
  setEdges: (edges: E[]) => void;
  setDefaultNodesAndEdges: (nodes?: N[], edges?: E[]) => void;
  updateNodeInternals: (updates: Map<string, unknown>) => void;
  reset: () => void;
};
export type ReactFlowState<N extends Node = Node, E extends Edge = Edge> = ReactFlowStore<N, E> &
  ReactFlowActions<N, E>;
export type GeneralHelpers<N extends Node = Node, E extends Edge = Edge> = {
  getNodes: () => N[];
  getNode: (id: string) => N | undefined;
  getInternalNode: (id: string) => InternalNode | undefined;
  getEdges: () => E[];
  getEdge: (id: string) => E | undefined;
  toObject: () => ReactFlowJsonObject<N, E>;
};
