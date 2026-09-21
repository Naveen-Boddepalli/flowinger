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
  editingFeature,
  eventsFeature,
  reconnectFeature,
  selectionFeature,
} from './features/index.ts';
export type {
  CanvasArgs,
  CanvasBits,
  EdgeAdornmentProps,
  EngineContext,
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
  useViewport,
  useNodesInitialized,
  useNodeId,
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
export {
  useNodes,
  useEdges,
  useNodesData,
  useNodeConnections,
  type NodeData,
  type NodeConnection,
  type UseNodeConnectionsOptions,
} from './dataHooks.ts';
export { useKeyPress, type UseKeyPressOptions } from './useKeyPress.ts';

// Geometry
export { getNodesBounds, getViewportForBounds, isRectIntersecting, viewportForBounds } from './geometry.ts';

// Handles & Ports
export { Handle } from './Handle.tsx';
export { BaseEdge, type BaseEdgeProps } from './BaseEdge.tsx';

// Background & Controls
export { Background } from './Background.tsx';
export { MiniMap, type MiniMapProps } from './MiniMap.tsx';
export { Controls } from './Controls.tsx';
export { Panel, type PanelProps, type PanelPosition } from './Panel.tsx';
export { EdgeLabelRenderer } from './EdgeLabelRenderer.tsx';
export { ViewportPortal } from './ViewportPortal.tsx';
export { NodeToolbar, type NodeToolbarProps } from './NodeToolbar.tsx';
export { NodeResizer, type NodeResizerProps, type ResizeParams } from './NodeResizer.tsx';

// Edges & Path Math
export { FlowingerEdges, type FlowingerEdgesProps } from './FlowingerEdges.tsx';
export {
  getBezierPath,
  getStraightPath,
  getSmoothStepPath,
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
