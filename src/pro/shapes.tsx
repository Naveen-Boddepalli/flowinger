import type { CSSProperties, ReactNode } from 'react';
import { Handle } from '../Handle.tsx';
import { Position, type Node, type NodeProps } from '../types.ts';

export interface ShapeNodeData {
  label?: ReactNode;
  /** The outline colour, when `stroke` is not given. */
  color?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  textColor?: string;
  handles?: ('top' | 'bottom' | 'left' | 'right')[];
}

const defaultShapeContainerStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: 8,
  boxSizing: 'border-box',
  width: '100%',
  height: '100%',
};

function renderHandles(handles: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right']) {
  return (
    <>
      {handles.includes('top') && <Handle type="target" position={Position.Top} id="top" />}
      {handles.includes('bottom') && <Handle type="source" position={Position.Bottom} id="bottom" />}
      {handles.includes('left') && <Handle type="target" position={Position.Left} id="left" />}
      {handles.includes('right') && <Handle type="source" position={Position.Right} id="right" />}
    </>
  );
}

/**
 * Diamond / Decision node for flowchart diagrams.
 */
export function DiamondNode({ data }: NodeProps<Node<{ label?: ReactNode; [key: string]: unknown }>>) {
  const shapeData = (data ?? {}) as ShapeNodeData;
  const fill = shapeData.fill ?? 'var(--flowinger-surface, #1e293b)';
  const stroke = shapeData.stroke ?? shapeData.color ?? 'var(--flowinger-border, #3b82f6)';
  const strokeWidth = shapeData.strokeWidth ?? 2;
  const textColor = shapeData.textColor ?? 'var(--flowinger-text, #f8fafc)';

  return (
    <div style={{ ...defaultShapeContainerStyle, minWidth: 120, minHeight: 80 }}>
      {renderHandles(shapeData.handles)}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible' }}
        viewBox="0 0 120 80"
        preserveAspectRatio="none"
      >
        <polygon points="60,2 118,40 60,78 2,40" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
      <div style={{ position: 'relative', zIndex: 1, color: textColor, fontSize: 13, fontWeight: 500 }}>
        {shapeData.label ?? 'Decision'}
      </div>
    </div>
  );
}

/**
 * Circle / State / Terminal node for flowchart diagrams.
 */
export function CircleNode({ data }: NodeProps<Node<{ label?: ReactNode; [key: string]: unknown }>>) {
  const shapeData = (data ?? {}) as ShapeNodeData;
  const fill = shapeData.fill ?? 'var(--flowinger-surface, #1e293b)';
  const stroke = shapeData.stroke ?? shapeData.color ?? 'var(--flowinger-border, #10b981)';
  const strokeWidth = shapeData.strokeWidth ?? 2;
  const textColor = shapeData.textColor ?? 'var(--flowinger-text, #f8fafc)';

  return (
    <div style={{ ...defaultShapeContainerStyle, minWidth: 80, minHeight: 80 }}>
      {renderHandles(shapeData.handles)}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible' }}
        viewBox="0 0 80 80"
      >
        <circle cx="40" cy="40" r="38" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
      <div style={{ position: 'relative', zIndex: 1, color: textColor, fontSize: 13, fontWeight: 500 }}>
        {shapeData.label ?? 'Start / End'}
      </div>
    </div>
  );
}

/**
 * Cylinder / Database node for flowchart diagrams.
 */
export function CylinderNode({ data }: NodeProps<Node<{ label?: ReactNode; [key: string]: unknown }>>) {
  const shapeData = (data ?? {}) as ShapeNodeData;
  const fill = shapeData.fill ?? 'var(--flowinger-surface, #1e293b)';
  const stroke = shapeData.stroke ?? shapeData.color ?? 'var(--flowinger-border, #f59e0b)';
  const strokeWidth = shapeData.strokeWidth ?? 2;
  const textColor = shapeData.textColor ?? 'var(--flowinger-text, #f8fafc)';

  return (
    <div style={{ ...defaultShapeContainerStyle, minWidth: 100, minHeight: 90 }}>
      {renderHandles(shapeData.handles)}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible' }}
        viewBox="0 0 100 90"
        preserveAspectRatio="none"
      >
        {/* Main Body */}
        <path d="M 2,15 L 2,75 A 48,12 0 0,0 98,75 L 98,15 Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        {/* Top Oval */}
        <ellipse cx="50" cy="15" rx="48" ry="12" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
      <div style={{ position: 'relative', zIndex: 1, color: textColor, fontSize: 13, fontWeight: 500, marginTop: 10 }}>
        {shapeData.label ?? 'Database'}
      </div>
    </div>
  );
}

/**
 * Parallelogram / Input-Output node for flowchart diagrams.
 */
export function ParallelogramNode({ data }: NodeProps<Node<{ label?: ReactNode; [key: string]: unknown }>>) {
  const shapeData = (data ?? {}) as ShapeNodeData;
  const fill = shapeData.fill ?? 'var(--flowinger-surface, #1e293b)';
  const stroke = shapeData.stroke ?? shapeData.color ?? 'var(--flowinger-border, #8b5cf6)';
  const strokeWidth = shapeData.strokeWidth ?? 2;
  const textColor = shapeData.textColor ?? 'var(--flowinger-text, #f8fafc)';

  return (
    <div style={{ ...defaultShapeContainerStyle, minWidth: 130, minHeight: 60 }}>
      {renderHandles(shapeData.handles)}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible' }}
        viewBox="0 0 130 60"
        preserveAspectRatio="none"
      >
        <polygon points="20,2 128,2 110,58 2,58" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
      <div style={{ position: 'relative', zIndex: 1, color: textColor, fontSize: 13, fontWeight: 500 }}>
        {shapeData.label ?? 'Input / Output'}
      </div>
    </div>
  );
}

/**
 * Document node for flowchart diagrams.
 */
export function DocumentNode({ data }: NodeProps<Node<{ label?: ReactNode; [key: string]: unknown }>>) {
  const shapeData = (data ?? {}) as ShapeNodeData;
  const fill = shapeData.fill ?? 'var(--flowinger-surface, #1e293b)';
  const stroke = shapeData.stroke ?? shapeData.color ?? 'var(--flowinger-border, #06b6d4)';
  const strokeWidth = shapeData.strokeWidth ?? 2;
  const textColor = shapeData.textColor ?? 'var(--flowinger-text, #f8fafc)';

  return (
    <div style={{ ...defaultShapeContainerStyle, minWidth: 120, minHeight: 70 }}>
      {renderHandles(shapeData.handles)}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible' }}
        viewBox="0 0 120 70"
        preserveAspectRatio="none"
      >
        <path
          d="M 2,2 L 118,2 L 118,55 C 90,45 70,68 2,55 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      </svg>
      <div style={{ position: 'relative', zIndex: 1, color: textColor, fontSize: 13, fontWeight: 500, marginBottom: 5 }}>
        {shapeData.label ?? 'Document'}
      </div>
    </div>
  );
}

/**
 * Hexagon / Preparation node for flowchart diagrams.
 */
export function HexagonNode({ data }: NodeProps<Node<{ label?: ReactNode; [key: string]: unknown }>>) {
  const shapeData = (data ?? {}) as ShapeNodeData;
  const fill = shapeData.fill ?? 'var(--flowinger-surface, #1e293b)';
  const stroke = shapeData.stroke ?? shapeData.color ?? 'var(--flowinger-border, #ec4899)';
  const strokeWidth = shapeData.strokeWidth ?? 2;
  const textColor = shapeData.textColor ?? 'var(--flowinger-text, #f8fafc)';

  return (
    <div style={{ ...defaultShapeContainerStyle, minWidth: 140, minHeight: 80 }}>
      {renderHandles(shapeData.handles)}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible' }}
        viewBox="0 0 140 80"
        preserveAspectRatio="none"
      >
        <polygon points="30,2 110,2 138,40 110,78 30,78 2,40" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
      <div style={{ position: 'relative', zIndex: 1, color: textColor, fontSize: 13, fontWeight: 500 }}>
        {shapeData.label ?? 'Preparation'}
      </div>
    </div>
  );
}

/**
 * Standard registry dictionary mapping flowchart shape names to their components.
 */
export const shapeNodeTypes = {
  diamond: DiamondNode,
  circle: CircleNode,
  cylinder: CylinderNode,
  parallelogram: ParallelogramNode,
  document: DocumentNode,
  hexagon: HexagonNode,
};
