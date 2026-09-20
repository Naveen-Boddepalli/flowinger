// Core Canvas and Provider
export { FlowingerCanvas, FlowingerCanvas as ReactFlow } from './FlowingerCanvas.tsx';
export {
  FlowingerProvider,
  FlowingerProvider as ReactFlowProvider,
} from './FlowingerProvider.tsx';
export { useFlowinger, useReactFlow, useStore, useViewport } from './context.ts';

// Handles & Ports
export { Handle } from './Handle.tsx';

// Background & Controls
export { Background } from './Background.tsx';
export { Controls } from './Controls.tsx';

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
} from './types.ts';
export type { FlowingerState } from './store.ts';
