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
  width?: number;
  height?: number;
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

export interface Edge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  className?: string;
  style?: CSSProperties;
  animated?: boolean;
  type?: 'bezier' | 'straight' | 'smoothstep';
  data?: Record<string, unknown>;
}

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
  gap?: number;
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

export interface HandleProps {
  id?: string;
  type: HandleType;
  position: Position;
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
  nodes: Node[];
  edges?: Edge[];
  nodeTypes?: NodeTypes;
  minZoom?: number;
  maxZoom?: number;
  nodesDraggable?: boolean;
  nodesConnectable?: boolean;
  elementsSelectable?: boolean;
  panOnDrag?: boolean | number[];
  zoomOnScroll?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  onNodeDrag?: (event: React.PointerEvent, node: Node) => void;
  onNodeDragStop?: (event: React.PointerEvent, node: Node) => void;
  onInit?: (instance: FlowingerInstance) => void;
}
