// Core Canvas and Provider
export { FlowingerCanvas, FlowingerCanvas as ReactFlow } from './FlowingerCanvas.tsx';
export { FlowingerCore } from './FlowingerCore.tsx';
export {
  allFeatures,
  boxSelectFeature,
  connectFeature,
  cullingFeature,
  deleteFeature,
  dragFeature,
  edgeLabelsFeature,
  editingFeature,
  eventsFeature,
  panKeyFeature,
  reconnectFeature,
  selectionFeature,
  selectionRectFeature,
  a11yFeature,
  debugFeature,
  stackingFeature,
  colorModeFeature,
} from './features/index.ts';
export type {
  CanvasArgs,
  CanvasBits,
  EdgeAdornmentProps,
  EngineContext,
  LabelBoxProps,
  Feature,
  NodeArgs,
  NodeBits,
} from './features.ts';
export {
  FlowingerProvider,
  FlowingerProvider as ReactFlowProvider,
} from './FlowingerProvider.tsx';
export {
  useFlowinger,
  useReactFlow,
  useStore,
  useStoreApi,
  useViewport,
  useNodesInitialized,
  useNodeId,
  useInternalNode,
  type FlowingerStoreApi,
} from './context.ts';

// Controlled flows
export {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  reconnectEdge,
  getConnectedEdges,
  getIncomers,
  getOutgoers,
} from './changes.ts';
export { useNodesState, useEdgesState } from './hooks.ts';
export { useOnSelectionChange } from './selectionHooks.ts';
export { useOnViewportChange, type UseOnViewportChangeOptions } from './viewportHooks.ts';
export { useUpdateNodeInternals } from './useUpdateNodeInternals.ts';
export {
  useNodes,
  useEdges,
  useNodesData,
  useNodeConnections,
  useHandleConnections,
  type NodeData,
  type NodeConnection,
  type UseNodeConnectionsOptions,
  type UseHandleConnectionsOptions,
} from './dataHooks.ts';
export {
  useConnection,
  type ConnectionState,
  type ConnectionInProgress,
  type NoConnection,
  type ConnectionHandle,
} from './connectionHook.ts';
export { useKeyPress, type UseKeyPressOptions } from './useKeyPress.ts';

// Geometry
export { getNodesBounds, getViewportForBounds, isRectIntersecting, viewportForBounds } from './geometry.ts';

// Handles & Ports
export { Handle } from './Handle.tsx';
export { BaseEdge, type BaseEdgeProps } from './BaseEdge.tsx';
export { BezierEdge, SimpleBezierEdge, SmoothStepEdge, StepEdge, StraightEdge } from './builtinEdges.tsx';
export { EdgeText } from './EdgeText.tsx';
export { EdgeToolbar } from './EdgeToolbar.tsx';
export { isEdge, isNode } from './guards.ts';
export {
  experimental_useOnNodesChangeMiddleware,
  experimental_useOnEdgesChangeMiddleware,
} from './middlewares.ts';

// Background & Controls
export { Background } from './Background.tsx';
export { MiniMap, MiniMapNode, type MiniMapProps, type MiniMapNodeProps } from './MiniMap.tsx';
export { Controls, ControlButton, type ControlsProps } from './Controls.tsx';
export { Panel, type PanelProps, type PanelPosition } from './Panel.tsx';
export { EdgeLabelRenderer } from './EdgeLabelRenderer.tsx';
export { ViewportPortal } from './ViewportPortal.tsx';
export { NodeToolbar, type NodeToolbarProps } from './NodeToolbar.tsx';
export {
  NodeResizer,
  NodeResizeControl,
  type NodeResizerProps,
  type ResizeControlProps,
  type ResizeParams,
} from './NodeResizer.tsx';

// Edges & Path Math
export { FlowingerEdges, type FlowingerEdgesProps } from './FlowingerEdges.tsx';
export {
  getBezierEdgeCenter,
  getBezierPath,
  getSimpleBezierPath,
  getEdgeCenter,
  getStraightPath,
  getSmoothStepPath,
  type GetBezierPathParams,
  type GetSimpleBezierPathParams,
  type GetSmoothStepPathParams,
  type GetStraightPathParams,
  type PathResult,
} from './paths.ts';

// Types & Enums
export {
  Position,
  BackgroundVariant,
  MarkerType,
  ConnectionMode,
  SelectionMode,
  ConnectionLineType,
} from './types.ts';

export type {
  Node,
  InternalNode,
  NodeProps,
  NodeTypes,
  Edge,
  Viewport,
  SetViewportOptions,
  FlowingerInstance,
  FlowingerProps,
  HandleProps,
  HandleType,
  XYPosition,
  BackgroundProps,
  TranslateExtent,
  Connection,
  EdgeMarker,
  EdgeProps,
  EdgeTypes,
  NodeChange,
  NodePositionChange,
  NodeDimensionChange,
  NodeSelectionChange,
  NodeRemoveChange,
  NodeAddChange,
  NodeReplaceChange,
  EdgeChange,
  EdgeSelectionChange,
  EdgeRemoveChange,
  EdgeAddChange,
  EdgeReplaceChange,
  ConnectionLineProps,
  ConnectStartParams,
  ConnectEndState,
  FitViewOptions,
  SetCenterOptions,
  Rect,
} from './types.ts';
export type { FlowingerState } from './store.ts';

// React Flow's names for types flowinger already has (types only — see the file for what is left out).
export type {
  Align,
  AriaLabelConfig,
  BezierPathOptions,
  Box,
  BezierEdgeProps,
  BuiltInEdge,
  BuiltInNode,
  ColorMode,
  ColorModeClass,
  ConnectionLineComponent,
  ConnectionLineComponentProps,
  ControlButtonProps,
  ControlLinePosition,
  ControlPosition,
  ControlProps,
  CoordinateExtent,
  CounterNode,
  DefaultEdgeOptions,
  DeleteElementsOptions,
  Dimensions,
  EdgeComponentProps,
  EdgeComponentWithPathOptions,
  EdgeLabelOptions,
  EdgeLabelRendererProps,
  EdgeMarkerType,
  EdgeMouseHandler,
  EdgeTextProps,
  EdgeToolbarProps,
  EdgeWrapperProps,
  FinalConnectionState,
  FitBounds,
  FitBoundsOptions,
  FitView,
  FitViewParams,
  GeneralHelpers,
  GetMiniMapNodeAttribute,
  HandleConnection,
  IsValidConnection,
  KeyCode,
  MiniMapNodes,
  NodeHandle,
  NodeMouseHandler,
  NodeOrigin,
  NodeWrapperProps,
  OnBeforeDelete,
  OnConnect,
  OnConnectEnd,
  OnConnectStart,
  OnConnectStartParams,
  OnDelete,
  OnEdgesChange,
  OnEdgesDelete,
  OnError,
  OnInit,
  OnMove,
  OnMoveEnd,
  OnMoveStart,
  OnNodeDrag,
  OnNodesChange,
  OnNodesDelete,
  OnReconnect,
  OnResize,
  OnResizeEnd,
  OnResizeStart,
  OnSelectionChangeFunc,
  OnSelectionChangeParams,
  OnSelectionDrag,
  PanOnScrollMode,
  ProOptions,
  ReactFlowActions,
  ReactFlowInstance,
  ReactFlowJsonObject,
  ReactFlowProps,
  ReactFlowState,
  ReactFlowStore,
  ResizeControlLineProps,
  ResizeControlVariant,
  ResizeDragEvent,
  ResizeParamsWithDirection,
  SelectionDragHandler,
  SelectionRect,
  SetCenter,
  SetViewport,
  ShouldResize,
  SimpleBezierEdgeProps,
  SmoothStepEdgeProps,
  SmoothStepPathOptions,
  SnapGrid,
  StepEdgeProps,
  StraightEdgeProps,
  Transform,
  UnselectNodesAndEdgesParams,
  UseNodeConnectionsParams,
  UseNodesInitializedOptions,
  UseOnSelectionChangeOptions,
  ViewportHelperFunctionOptions,
  ViewportHelperFunctions,
  XYZPosition,
  ZIndexMode,
} from './reactFlowNames.ts';
