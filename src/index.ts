// Core Canvas and Provider
export { FlowingerCanvas, FlowingerCanvas as ReactFlow } from './FlowingerCanvas.tsx';
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
  getConnectedEdges,
  getIncomers,
  getOutgoers,
} from './changes.ts';
export { useNodesState, useEdgesState } from './hooks.ts';

// Geometry
export { getNodesBounds, isRectIntersecting, viewportForBounds } from './geometry.ts';

// Handles & Ports
export { Handle } from './Handle.tsx';
export { BaseEdge, type BaseEdgeProps } from './BaseEdge.tsx';

// Background & Controls
export { Background } from './Background.tsx';
export { MiniMap, type MiniMapProps } from './MiniMap.tsx';
export { Controls } from './Controls.tsx';
export { Panel, type PanelProps, type PanelPosition } from './Panel.tsx';
export { EdgeLabelRenderer } from './EdgeLabelRenderer.tsx';
export { NodeToolbar, type NodeToolbarProps } from './NodeToolbar.tsx';
export { NodeResizer, type NodeResizerProps, type ResizeParams } from './NodeResizer.tsx';

// Edges & Path Math
export { FlowingerEdges } from './FlowingerEdges.tsx';
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
  ConnectStartParams,
  ConnectEndState,
  FitViewOptions,
  SetCenterOptions,
  Rect,
} from './types.ts';
export type { FlowingerState } from './store.ts';
