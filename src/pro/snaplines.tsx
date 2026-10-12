import { useCallback, useState, type CSSProperties } from 'react';
import type { Node, XYPosition } from '../types.ts';

export interface SnapLine {
  id: string;
  type: 'horizontal' | 'vertical';
  /** Graph coordinate where the alignment line lies (x for vertical, y for horizontal). */
  position: number;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface UseSnapLinesOptions {
  /** Maximum distance in graph units to snap to guidelines. Default 5. */
  threshold?: number;
  /** Whether to snap node centers. Default true. */
  snapToCenter?: boolean;
  /** Whether to snap node outer edges (left, right, top, bottom). Default true. */
  snapToEdges?: boolean;
}

export interface UseSnapLinesResult {
  snapLines: SnapLine[];
  /**
   * Calculates snapped position and updates active alignment lines during node dragging.
   * Pass this in onNodeDrag or use inside custom drag handlers.
   */
  handleNodeDrag: (node: Node, allNodes: Node[], newPosition: XYPosition) => XYPosition;
  clearSnapLines: () => void;
}

function getNodeBox(n: Node): { x: number; y: number; width: number; height: number } {
  const width = n.measured?.width ?? n.width ?? 150;
  const height = n.measured?.height ?? n.height ?? 50;
  return { x: n.position.x, y: n.position.y, width, height };
}

/**
 * Headless magnetic alignment snap lines hook for Flowinger and React Flow graphs.
 * Automatically aligns and snaps dragged nodes to other nodes' centers and edges.
 */
export function useSnapLines(options: UseSnapLinesOptions = {}): UseSnapLinesResult {
  const { threshold = 5, snapToCenter = true, snapToEdges = true } = options;
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);

  const clearSnapLines = useCallback(() => {
    setSnapLines([]);
  }, []);

  const handleNodeDrag = useCallback(
    (draggedNode: Node, allNodes: Node[], nextPosition: XYPosition): XYPosition => {
      const activeWidth = draggedNode.measured?.width ?? draggedNode.width ?? 150;
      const activeHeight = draggedNode.measured?.height ?? draggedNode.height ?? 50;

      let snappedX = nextPosition.x;
      let snappedY = nextPosition.y;

      let minDiffX = threshold + 1;
      let minDiffY = threshold + 1;

      const lines: SnapLine[] = [];

      for (const target of allNodes) {
        if (target.id === draggedNode.id || target.hidden) continue;

        const targetBox = getNodeBox(target);

        // --- Vertical alignment checks (X axis) ---
        const activeLeft = nextPosition.x;
        const activeCenterX = nextPosition.x + activeWidth / 2;
        const activeRight = nextPosition.x + activeWidth;

        const targetLeft = targetBox.x;
        const targetCenterX = targetBox.x + targetBox.width / 2;
        const targetRight = targetBox.x + targetBox.width;

        const xChecks: { active: number; target: number; snapTo: number }[] = [];
        if (snapToEdges) {
          xChecks.push(
            { active: activeLeft, target: targetLeft, snapTo: targetLeft },
            { active: activeRight, target: targetRight, snapTo: targetRight - activeWidth },
            { active: activeLeft, target: targetRight, snapTo: targetRight },
            { active: activeRight, target: targetLeft, snapTo: targetLeft - activeWidth },
          );
        }
        if (snapToCenter) {
          xChecks.push({ active: activeCenterX, target: targetCenterX, snapTo: targetCenterX - activeWidth / 2 });
        }

        for (const check of xChecks) {
          const diff = Math.abs(check.active - check.target);
          if (diff <= threshold && diff < minDiffX) {
            minDiffX = diff;
            snappedX = check.snapTo;
            lines.push({
              id: `v-${draggedNode.id}-${target.id}-${check.target}`,
              type: 'vertical',
              position: check.target,
              sourceNodeId: draggedNode.id,
              targetNodeId: target.id,
            });
          }
        }

        // --- Horizontal alignment checks (Y axis) ---
        const activeTop = nextPosition.y;
        const activeCenterY = nextPosition.y + activeHeight / 2;
        const activeBottom = nextPosition.y + activeHeight;

        const targetTop = targetBox.y;
        const targetCenterY = targetBox.y + targetBox.height / 2;
        const targetBottom = targetBox.y + targetBox.height;

        const yChecks: { active: number; target: number; snapTo: number }[] = [];
        if (snapToEdges) {
          yChecks.push(
            { active: activeTop, target: targetTop, snapTo: targetTop },
            { active: activeBottom, target: targetBottom, snapTo: targetBottom - activeHeight },
            { active: activeTop, target: targetBottom, snapTo: targetBottom },
            { active: activeBottom, target: targetTop, snapTo: targetTop - activeHeight },
          );
        }
        if (snapToCenter) {
          yChecks.push({ active: activeCenterY, target: targetCenterY, snapTo: targetCenterY - activeHeight / 2 });
        }

        for (const check of yChecks) {
          const diff = Math.abs(check.active - check.target);
          if (diff <= threshold && diff < minDiffY) {
            minDiffY = diff;
            snappedY = check.snapTo;
            lines.push({
              id: `h-${draggedNode.id}-${target.id}-${check.target}`,
              type: 'horizontal',
              position: check.target,
              sourceNodeId: draggedNode.id,
              targetNodeId: target.id,
            });
          }
        }
      }

      setSnapLines(lines);
      return { x: snappedX, y: snappedY };
    },
    [threshold, snapToCenter, snapToEdges],
  );

  return {
    snapLines,
    handleNodeDrag,
    clearSnapLines,
  };
}

export interface SnapLinesOverlayProps {
  snapLines: SnapLine[];
  color?: string;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Visual SVG overlay rendering dashed alignment snap lines across the graph.
 */
export function SnapLinesOverlay({
  snapLines,
  color = '#3b82f6',
  strokeWidth = 1,
  className = '',
  style,
}: SnapLinesOverlayProps) {
  if (snapLines.length === 0) return null;

  return (
    <svg
      className={`flowinger-snaplines-overlay ${className}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 9999,
        ...style,
      }}
    >
      {snapLines.map((line) => {
        if (line.type === 'vertical') {
          return (
            <line
              key={line.id}
              x1={line.position}
              y1="-100000"
              x2={line.position}
              y2="100000"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray="4 4"
            />
          );
        }
        return (
          <line
            key={line.id}
            x1="-100000"
            y1={line.position}
            x2="100000"
            y2={line.position}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray="4 4"
          />
        );
      })}
    </svg>
  );
}
