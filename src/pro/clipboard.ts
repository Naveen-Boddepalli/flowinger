import { useCallback, useEffect, useState } from 'react';
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
  /**
   * Whether Cmd/Ctrl+C, Cmd/Ctrl+X and Cmd/Ctrl+V copy, cut and paste the selection. They are the browser's
   * own `copy`, `cut` and `paste` events, so there is no permission prompt, a text field or a text
   * selection keeps its usual meaning, and the system clipboard carries the graph as JSON. Default true.
   */
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

const DEFAULT_OFFSET: XYPosition = { x: 20, y: 20 };

let inMemoryBuffer: ClipboardPayload | null = null;
let pasteCounter = 0;

function defaultIdGenerator(_type: 'node' | 'edge', originalId: string): string {
  pasteCounter += 1;
  return `${originalId}-copy-${String(pasteCounter)}-${Date.now().toString(36).slice(-4)}`;
}

/** What the clipboard text is, if it is a copied graph. */
function parsePayload(text: string | null | undefined): ClipboardPayload | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Partial<ClipboardPayload> | null;
    if (parsed?.flowingerClipboard !== true || !Array.isArray(parsed.nodes)) return null;
    return { flowingerClipboard: true, nodes: parsed.nodes, edges: Array.isArray(parsed.edges) ? parsed.edges : [] };
  } catch {
    return null;
  }
}

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

/** Whether the user has selected some text on the page: then a copy is of that, not of the graph. */
const hasTextSelection = (): boolean =>
  typeof window !== 'undefined' && (window.getSelection()?.toString() ?? '') !== '';

/**
 * Copies of the nodes and edges with new ids, moved by `offset`.
 *
 * Edges are kept only where both ends were copied. A node whose parent was copied too is put inside the *copy* of
 * that parent and not moved (its position is relative to it); one whose parent was not is moved, and stays where
 * it was in the tree.
 */
function instantiate(
  payload: ClipboardPayload,
  offset: XYPosition,
  select: boolean,
  idGenerator: NonNullable<UseClipboardOptions['idGenerator']>,
): { nodes: Node[]; edges: Edge[] } {
  const idMap = new Map<string, string>();
  for (const node of payload.nodes) idMap.set(node.id, idGenerator('node', node.id));

  const nodes = payload.nodes.map((node): Node => {
    const { dragging: _dragging, ...rest } = node;
    const parent = node.parentId === undefined ? undefined : idMap.get(node.parentId);
    return {
      ...rest,
      id: idMap.get(node.id) as string,
      ...(parent === undefined ? {} : { parentId: parent }),
      position:
        parent === undefined
          ? { x: node.position.x + offset.x, y: node.position.y + offset.y }
          : { ...node.position },
      selected: select,
      data: node.data ? { ...node.data } : {},
    };
  });

  const edges = payload.edges.flatMap((edge): Edge[] => {
    const source = idMap.get(edge.source);
    const target = idMap.get(edge.target);
    if (source === undefined || target === undefined) return [];
    return [
      {
        ...edge,
        id: idGenerator('edge', edge.id),
        source,
        target,
        selected: select,
        data: edge.data ? { ...edge.data } : undefined,
      },
    ];
  });
  return { nodes, edges };
}

/**
 * Headless Copy/Cut/Paste clipboard hook for Flowinger and React Flow graphs.
 * Supports system clipboard integration, edge rewiring, offset placement, and keyboard shortcuts.
 */
export function useClipboard(options: UseClipboardOptions = {}): UseClipboardResult {
  const {
    offset: defaultOffset = DEFAULT_OFFSET,
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

  /** What a copy of these is: the selected nodes, and the edges between them, unless given. */
  const gather = useCallback(
    (nodes?: Node[], edges?: Edge[], touching = false): ClipboardPayload | null => {
      const picked = nodes ?? (reactFlow ? reactFlow.getNodes().filter((n) => n.selected) : []);
      if (picked.length === 0) return null;
      const ids = new Set(picked.map((n) => n.id));
      const between =
        edges ??
        (reactFlow
          ? reactFlow
              .getEdges()
              .filter((e) => (touching ? ids.has(e.source) || ids.has(e.target) : ids.has(e.source) && ids.has(e.target)))
          : []);
      return { flowingerClipboard: true, nodes: picked, edges: between };
    },
    [reactFlow],
  );

  const remember = useCallback((payload: ClipboardPayload) => {
    inMemoryBuffer = payload;
    setHasContent(true);
  }, []);

  const copy = useCallback(
    async (nodes?: Node[], edges?: Edge[]) => {
      const payload = gather(nodes, edges);
      if (!payload) return;
      remember(payload);
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(JSON.stringify(payload));
        } catch {
          // In-memory buffer will serve as fallback
        }
      }
    },
    [gather, remember],
  );

  const removeFromGraph = useCallback(
    (payload: ClipboardPayload) => {
      // The edges that go to a cut node are deleted with it, though only those between cut nodes are kept.
      const ids = new Set(payload.nodes.map((n) => n.id));
      const touching = reactFlow ? reactFlow.getEdges().filter((e) => ids.has(e.source) || ids.has(e.target)) : [];
      reactFlow?.deleteElements({ nodes: payload.nodes, edges: touching });
    },
    [reactFlow],
  );

  const cut = useCallback(
    async (nodes?: Node[], edges?: Edge[]) => {
      const payload = gather(nodes, edges);
      if (!payload) return;
      await copy(payload.nodes, payload.edges);
      removeFromGraph(payload);
    },
    [gather, copy, removeFromGraph],
  );

  /** Puts a copied graph into the canvas. */
  const insert = useCallback(
    (payload: ClipboardPayload, pasteOpts?: { offset?: XYPosition; select?: boolean }) => {
      const select = pasteOpts?.select ?? selectOnPaste;
      const made = instantiate(payload, pasteOpts?.offset ?? defaultOffset, select, idGenerator);
      if (reactFlow) {
        if (select) {
          // What was selected is not any more: the pasted elements are the selection.
          const nodes = reactFlow.getNodes().map((n) => (n.selected ? { ...n, selected: false } : n));
          const edges = reactFlow.getEdges().map((e) => (e.selected ? { ...e, selected: false } : e));
          reactFlow.setNodes([...nodes, ...made.nodes]);
          reactFlow.setEdges([...edges, ...made.edges]);
        } else {
          reactFlow.addNodes(made.nodes);
          reactFlow.addEdges(made.edges);
        }
      }
      return made;
    },
    [defaultOffset, selectOnPaste, idGenerator, reactFlow],
  );

  const paste = useCallback(
    async (pasteOpts?: { offset?: XYPosition; select?: boolean }): Promise<{ nodes: Node[]; edges: Edge[] }> => {
      let payload: ClipboardPayload | null = inMemoryBuffer;
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        try {
          payload = parsePayload(await navigator.clipboard.readText()) ?? payload;
        } catch {
          // Not allowed, or nothing there: the in-memory buffer serves.
        }
      }
      if (!payload || payload.nodes.length === 0) return { nodes: [], edges: [] };
      return insert(payload, pasteOpts);
    },
    [insert],
  );

  // The browser's own events: they carry the clipboard to us (`clipboardData`), so there is no permission to
  // ask for, and a copy from a text field or of selected text is left alone.
  useEffect(() => {
    if (!enableShortcuts || typeof document === 'undefined') return;

    const onCopy = (e: ClipboardEvent, remove: boolean) => {
      if (isEditable(e.target) || hasTextSelection()) return;
      const payload = gather();
      if (!payload) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', JSON.stringify(payload));
      remember(payload);
      if (remove) removeFromGraph(payload);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return;
      const payload = parsePayload(e.clipboardData?.getData('text/plain')) ?? inMemoryBuffer;
      if (!payload || payload.nodes.length === 0) return;
      e.preventDefault();
      insert(payload);
    };
    const copyHandler = (e: ClipboardEvent) => onCopy(e, false);
    const cutHandler = (e: ClipboardEvent) => onCopy(e, true);

    document.addEventListener('copy', copyHandler);
    document.addEventListener('cut', cutHandler);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', copyHandler);
      document.removeEventListener('cut', cutHandler);
      document.removeEventListener('paste', onPaste);
    };
  }, [enableShortcuts, gather, remember, removeFromGraph, insert]);

  return {
    copy,
    cut,
    paste,
    canPaste: hasContent,
  };
}
