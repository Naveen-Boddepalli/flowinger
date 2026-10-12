import { useCallback, useEffect, useRef, useState } from 'react';
import type { Edge, Node } from '../types.ts';
import { useReactFlow } from '../context.ts';

export interface HistoryState {
  nodes: Node[];
  edges: Edge[];
}

export interface UseUndoRedoOptions {
  /** Maximum number of history snapshots to keep. Default 50. */
  maxHistory?: number;
  /** Whether keyboard shortcuts (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Cmd/Ctrl+Y) are enabled. Default true. */
  enableShortcuts?: boolean;
  /** Called when an undo operation completes. */
  onUndo?: (state: HistoryState) => void;
  /** Called when a redo operation completes. */
  onRedo?: (state: HistoryState) => void;
}

export interface UseUndoRedoResult {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  takeSnapshot: (state?: HistoryState) => void;
  clearHistory: () => void;
  history: {
    past: HistoryState[];
    future: HistoryState[];
  };
}

function cloneState(state: HistoryState): HistoryState {
  return {
    nodes: state.nodes.map((n) => ({ ...n, position: { ...n.position }, data: { ...n.data } })),
    edges: state.edges.map((e) => ({ ...e, data: e.data ? { ...e.data } : undefined })),
  };
}

/**
 * Headless Undo/Redo history manager for Flowinger and React Flow graphs.
 * Provides undo, redo, snapshot tracking, and keyboard shortcut support (Cmd/Ctrl+Z).
 */
export function useUndoRedo(options: UseUndoRedoOptions = {}): UseUndoRedoResult {
  const { maxHistory = 50, enableShortcuts = true, onUndo, onRedo } = options;

  let reactFlow: ReturnType<typeof useReactFlow> | null = null;
  try {
    reactFlow = useReactFlow();
  } catch {
    // Graceful fallback if rendered outside FlowingerProvider
    reactFlow = null;
  }

  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
  const pastRef = useRef(past);
  pastRef.current = past;
  const futureRef = useRef(future);
  futureRef.current = future;

  const getCurrentState = useCallback((): HistoryState => {
    if (reactFlow) {
      return {
        nodes: reactFlow.getNodes(),
        edges: reactFlow.getEdges(),
      };
    }
    return { nodes: [], edges: [] };
  }, [reactFlow]);

  const takeSnapshot = useCallback(
    (explicitState?: HistoryState) => {
      const stateToSave = cloneState(explicitState ?? getCurrentState());
      setPast((prev) => {
        const next = [...prev, stateToSave];
        return next.length > maxHistory ? next.slice(next.length - maxHistory) : next;
      });
      setFuture([]);
    },
    [getCurrentState, maxHistory],
  );

  const undo = useCallback(() => {
    const prevPast = pastRef.current;
    if (prevPast.length === 0) return;

    const previous = prevPast[prevPast.length - 1];
    if (!previous) return;

    const current = cloneState(getCurrentState());
    setPast((p) => p.slice(0, p.length - 1));
    setFuture((f) => [current, ...f]);

    if (reactFlow) {
      reactFlow.setNodes(previous.nodes);
      reactFlow.setEdges(previous.edges);
    }
    onUndo?.(previous);
  }, [getCurrentState, reactFlow, onUndo]);

  const redo = useCallback(() => {
    const nextFuture = futureRef.current;
    if (nextFuture.length === 0) return;

    const [next, ...remaining] = nextFuture;
    if (!next) return;

    const current = cloneState(getCurrentState());
    setPast((p) => [...p, current]);
    setFuture(remaining);

    if (reactFlow) {
      reactFlow.setNodes(next.nodes);
      reactFlow.setEdges(next.edges);
    }
    onRedo?.(next);
  }, [getCurrentState, reactFlow, onRedo]);

  const clearHistory = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  useEffect(() => {
    if (!enableShortcuts || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isModifier = e.metaKey || e.ctrlKey;
      if (!isModifier) return;

      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          // Redo: Cmd/Ctrl + Shift + Z
          e.preventDefault();
          redo();
        } else {
          // Undo: Cmd/Ctrl + Z
          e.preventDefault();
          undo();
        }
      } else if (e.key.toLowerCase() === 'y') {
        // Redo: Cmd/Ctrl + Y
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enableShortcuts, undo, redo]);

  return {
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    takeSnapshot,
    clearHistory,
    history: { past, future },
  };
}
