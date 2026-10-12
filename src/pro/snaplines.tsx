import { useCallback, useState, type CSSProperties } from 'react';
import { sizeOfNode } from '../geometry.ts';
import type { Node, NodeOrigin, XYPosition } from '../types.ts';

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
  /** The canvas's `nodeOrigin`, for nodes with no `origin` of their own. Default `[0, 0]`. */
  nodeOrigin?: NodeOrigin;
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

interface Candidate {
  /** How far the dragged box is from lining up. */
  diff: number;
  /** Where the dragged box's near edge would be, lined up. */
  snapStart: number;
  /** The guide: where the line lies, in graph units. */
  at: number;
  targetId: string;
}

/** The ways a box `[start, start + size]` can line up with another along one axis. */
function candidates(
  start: number,
  size: number,
  other: { start: number; size: number; id: string },
  edges: boolean,
  centres: boolean,
): Candidate[] {
  const end = start + size;
  const oEnd = other.start + other.size;
  const out: Candidate[] = [];
  const add = (mine: number, theirs: number, snapStart: number) =>
    out.push({ diff: Math.abs(mine - theirs), snapStart, at: theirs, targetId: other.id });
  if (edges) {
    add(start, other.start, other.start);
    add(end, oEnd, oEnd - size);
    add(start, oEnd, oEnd);
    add(end, other.start, other.start - size);
  }
  if (centres) {
    const centre = other.start + other.size / 2;
    add(start + size / 2, centre, centre - size / 2);
  }
  return out;
}

/**
 * Headless magnetic alignment snap lines hook for Flowinger and React Flow graphs.
 * Automatically aligns and snaps dragged nodes to other nodes' centers and edges.
 *
 * Nodes are compared in one coordinate space, so a node is lined up with the nodes that share its parent (the
 * top level, or one sub-flow); a node inside a sub-flow is not compared with ones outside it.
 */
export function useSnapLines(options: UseSnapLinesOptions = {}): UseSnapLinesResult {
  const { threshold = 5, snapToCenter = true, snapToEdges = true, nodeOrigin = [0, 0] } = options;
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);

  const clearSnapLines = useCallback(() => {
    setSnapLines([]);
  }, []);

  const handleNodeDrag = useCallback(
    (draggedNode: Node, allNodes: Node[], nextPosition: XYPosition): XYPosition => {
      const size = sizeOfNode(draggedNode);
      const [ox, oy] = draggedNode.origin ?? nodeOrigin;
      // Everything below is in terms of top-left corners, whatever the origin says `position` is.
      const left = nextPosition.x - ox * size.width;
      const top = nextPosition.y - oy * size.height;

      const across: Candidate[] = [];
      const down: Candidate[] = [];
      for (const target of allNodes) {
        if (target.id === draggedNode.id || target.hidden || target.parentId !== draggedNode.parentId) continue;
        const their = sizeOfNode(target);
        const [tox, toy] = target.origin ?? nodeOrigin;
        const tLeft = target.position.x - tox * their.width;
        const tTop = target.position.y - toy * their.height;
        across.push(
          ...candidates(left, size.width, { start: tLeft, size: their.width, id: target.id }, snapToEdges, snapToCenter),
        );
        down.push(
          ...candidates(top, size.height, { start: tTop, size: their.height, id: target.id }, snapToEdges, snapToCenter),
        );
      }

      // The nearest alignment wins the snap; the guides are every alignment that is true *there* — a stale
      // guide for a nearer-looking line that lost would say the node is lined up with something it is not.
      const settle = (list: Candidate[], position: number) => {
        let best: Candidate | null = null;
        for (const c of list) if (c.diff <= threshold && (best === null || c.diff < best.diff)) best = c;
        if (!best) return { value: position, lines: [] as Candidate[] };
        const chosen = best.snapStart;
        return {
          value: chosen,
          lines: list.filter((c) => c.diff <= threshold && Math.abs(c.snapStart - chosen) < 0.01),
        };
      };
      const x = settle(across, left);
      const y = settle(down, top);

      // One guide to a place: two nodes lined up on the same edge are one line.
      const once = (list: Candidate[]) => {
        const seen = new Set<number>();
        return list.filter((c) => !seen.has(c.at) && seen.add(c.at));
      };
      const lines: SnapLine[] = [
        ...once(x.lines).map((c): SnapLine => ({
          id: `v-${draggedNode.id}-${c.targetId}-${String(c.at)}`,
          type: 'vertical',
          position: c.at,
          sourceNodeId: draggedNode.id,
          targetNodeId: c.targetId,
        })),
        ...once(y.lines).map((c): SnapLine => ({
          id: `h-${draggedNode.id}-${c.targetId}-${String(c.at)}`,
          type: 'horizontal',
          position: c.at,
          sourceNodeId: draggedNode.id,
          targetNodeId: c.targetId,
        })),
      ];
      setSnapLines(lines);
      return { x: x.value + ox * size.width, y: y.value + oy * size.height };
    },
    [threshold, snapToCenter, snapToEdges, nodeOrigin],
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
