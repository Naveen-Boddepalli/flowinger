import { useCallback, useEffect, useRef, useState } from 'react';
import type { Edge, Node, XYPosition } from '../types.ts';
import { useReactFlow } from '../context.ts';

export interface ClipboardPayload {
  flowingerClipboard: true;
  nodes: Node[];
  edges: Edge[];
}

export interface UseClipboardOptions {
  /** Offset applied to pasted nodes relative to original positions. Default { x: 20, y: 20 }. */
  offset?: XYPosition;
  /** Whether pasted elements become selected automatically. Default true. */
  selectOnPaste?: boolean;
  /** Whether keyboard shortcuts (Cmd/Ctrl+C, Cmd/Ctrl+V, Cmd/Ctrl+X) are enabled. Default true. */
  enableShortcuts?: boolean;
  /** Function to generate new unique IDs for pasted nodes and edges. */
  idGenerator?: (type: 'node' | 'edge', originalId: string) => string;
}

export interface UseClipboardResult {
  copy: (nodes?: Node[], edges?: Edge[]) => Promise<void>;
  cut: (nodes?: Node[], edges?: Edge[]) => Promise<void>;
  paste: (options?: { offset?: XYPosition; select?: boolean }) => Promise<{ nodes: Node[]; edges: Edge[] }>;
  canPaste: boolean;
}

let inMemoryBuffer: ClipboardPayload | null = null;
let pasteCounter = 0;

function defaultIdGenerator(_type: 'node' | 'edge', originalId: string): string {
  pasteCounter += 1;
  return `${originalId}-copy-${pasteCounter}-${Date.now().toString(36).slice(-4)}`;
}

/**
 * Headless Copy/Cut/Paste clipboard hook for Flowinger and React Flow graphs.
 * Supports system clipboard integration, edge rewiring, offset placement, and keyboard shortcuts.
 */
export function useClipboard(options: UseClipboardOptions = {}): UseClipboardResult {
  const {
    offset: defaultOffset = { x: 20, y: 20 },
    selectOnPaste = true,
    enableShortcuts = true,
    idGenerator = defaultIdGenerator,
  } = options;

  let reactFlow: ReturnType<typeof useReactFlow> | null = null;
  try {
    reactFlow = useReactFlow();
  } catch {
    reactFlow = null;
  }

  const [hasContent, setHasContent] = useState<boolean>(Boolean(inMemoryBuffer));
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const copy = useCallback(
    async (nodes?: Node[], edges?: Edge[]) => {
      const allNodes = nodes ?? (reactFlow ? reactFlow.getNodes().filter((n) => n.selected) : []);
      if (allNodes.length === 0) return;

      const nodeIds = new Set(allNodes.map((n) => n.id));
      const allEdges =
        edges ??
        (reactFlow
          ? reactFlow.getEdges().filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
          : []);

      const payload: ClipboardPayload = {
        flowingerClipboard: true,
        nodes: allNodes,
        edges: allEdges,
      };

      inMemoryBuffer = payload;
      setHasContent(true);

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(JSON.stringify(payload));
        } catch {
          // In-memory buffer will serve as fallback
        }
      }
    },
    [reactFlow],
  );

  const cut = useCallback(
    async (nodes?: Node[], edges?: Edge[]) => {
      const targetNodes = nodes ?? (reactFlow ? reactFlow.getNodes().filter((n) => n.selected) : []);
      if (targetNodes.length === 0) return;

      const nodeIds = new Set(targetNodes.map((n) => n.id));
      const targetEdges =
        edges ??
        (reactFlow
          ? reactFlow.getEdges().filter((e) => nodeIds.has(e.source) || nodeIds.has(e.target))
          : []);

      await copy(targetNodes, targetEdges);

      if (reactFlow) {
        reactFlow.deleteElements({
          nodes: targetNodes,
          edges: targetEdges,
        });
      }
    },
    [copy, reactFlow],
  );

  const paste = useCallback(
    async (pasteOpts?: { offset?: XYPosition; select?: boolean }): Promise<{ nodes: Node[]; edges: Edge[] }> => {
      let payload: ClipboardPayload | null = inMemoryBuffer;

      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        try {
          const text = await navigator.clipboard.readText();
          const parsed = JSON.parse(text) as Partial<ClipboardPayload>;
          if (parsed && parsed.flowingerClipboard && Array.isArray(parsed.nodes)) {
            payload = parsed as ClipboardPayload;
          }
        } catch {
          // Fall back to inMemoryBuffer
        }
      }

      if (!payload || payload.nodes.length === 0) {
        return { nodes: [], edges: [] };
      }

      const offset = pasteOpts?.offset ?? defaultOffset;
      const shouldSelect = pasteOpts?.select ?? selectOnPaste;

      const idMap = new Map<string, string>();
      const newNodes: Node[] = payload.nodes.map((node) => {
        const newId = idGenerator('node', node.id);
        idMap.set(node.id, newId);
        return {
          ...node,
          id: newId,
          position: {
            x: node.position.x + offset.x,
            y: node.position.y + offset.y,
          },
          selected: shouldSelect,
          data: node.data ? { ...node.data } : {},
        };
      });

      const newEdges: Edge[] = payload.edges.flatMap((edge) => {
        const newSource = idMap.get(edge.source);
        const newTarget = idMap.get(edge.target);
        if (!newSource || !newTarget) return [];
        return [
          {
            ...edge,
            id: idGenerator('edge', edge.id),
            source: newSource,
            target: newTarget,
            selected: shouldSelect,
            data: edge.data ? { ...edge.data } : undefined,
          },
        ];
      });

      if (reactFlow) {
        if (shouldSelect) {
          // Deselect existing elements
          const unselectedNodes = reactFlow.getNodes().map((n) => (n.selected ? { ...n, selected: false } : n));
          const unselectedEdges = reactFlow.getEdges().map((e) => (e.selected ? { ...e, selected: false } : e));
          reactFlow.setNodes([...unselectedNodes, ...newNodes]);
          reactFlow.setEdges([...unselectedEdges, ...newEdges]);
        } else {
          reactFlow.addNodes(newNodes);
          reactFlow.addEdges(newEdges);
        }
      }

      return { nodes: newNodes, edges: newEdges };
    },
    [defaultOffset, selectOnPaste, idGenerator, reactFlow],
  );

  useEffect(() => {
    if (!enableShortcuts || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isModifier = e.metaKey || e.ctrlKey;
      if (!isModifier) return;

      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'c') {
        e.preventDefault();
        void copy();
      } else if (key === 'v') {
        e.preventDefault();
        void paste();
      } else if (key === 'x') {
        e.preventDefault();
        void cut();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enableShortcuts, copy, paste, cut]);

  return {
    copy,
    cut,
    paste,
    canPaste: hasContent,
  };
}
