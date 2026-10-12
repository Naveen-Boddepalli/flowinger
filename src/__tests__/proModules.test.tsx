import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  useUndoRedo,
  useClipboard,
  useSnapLines,
  exportCanvasToSvg,
  downloadFile,
  type HistoryState,
} from '../pro/index.ts';
import type { Node, Edge } from '../types.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Pro Modules: History (useUndoRedo)', () => {
  it('tracks snapshots, performs undo and redo, and updates flags', () => {
    const { result } = renderHook(() => useUndoRedo({ maxHistory: 10, enableShortcuts: false }));

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    const state1: HistoryState = {
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    };
    const state2: HistoryState = {
      nodes: [{ id: '1', position: { x: 50, y: 50 }, data: {} }],
      edges: [],
    };

    act(() => {
      result.current.takeSnapshot(state1);
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    act(() => {
      result.current.takeSnapshot(state2);
    });
    expect(result.current.history.past).toHaveLength(2);

    act(() => {
      result.current.undo();
    });
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.redo();
    });
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.clearHistory();
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});

describe('Pro Modules: Clipboard (useClipboard)', () => {
  it('copies, cuts, and pastes nodes with new IDs and offsets', async () => {
    const { result } = renderHook(() => useClipboard({ enableShortcuts: false, offset: { x: 30, y: 40 } }));

    const nodes: Node[] = [
      { id: 'n1', position: { x: 10, y: 20 }, selected: true, data: { label: 'Node 1' } },
      { id: 'n2', position: { x: 100, y: 200 }, selected: true, data: { label: 'Node 2' } },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'n1', target: 'n2' },
    ];

    await act(async () => {
      await result.current.copy(nodes, edges);
    });
    expect(result.current.canPaste).toBe(true);

    let pasted: { nodes: Node[]; edges: Edge[] } = { nodes: [], edges: [] };
    await act(async () => {
      pasted = await result.current.paste();
    });

    expect(pasted.nodes).toHaveLength(2);
    expect(pasted.edges).toHaveLength(1);

    expect(pasted.nodes[0]?.id).not.toBe('n1');
    expect(pasted.nodes[1]?.id).not.toBe('n2');

    // Position offset: x + 30, y + 40
    expect(pasted.nodes[0]?.position).toEqual({ x: 40, y: 60 });
    expect(pasted.nodes[1]?.position).toEqual({ x: 130, y: 240 });

    // Edge source and target rewired to pasted node IDs
    expect(pasted.edges[0]?.source).toBe(pasted.nodes[0]?.id);
    expect(pasted.edges[0]?.target).toBe(pasted.nodes[1]?.id);
  });
});

describe('Pro Modules: Snaplines (useSnapLines)', () => {
  it('computes vertical and horizontal alignment lines within threshold', () => {
    const { result } = renderHook(() => useSnapLines({ threshold: 5 }));

    const targetNode: Node = {
      id: 'target',
      position: { x: 100, y: 100 },
      width: 100,
      height: 50,
      data: {},
    };

    const draggedNode: Node = {
      id: 'dragged',
      position: { x: 0, y: 0 },
      width: 100,
      height: 50,
      data: {},
    };

    // Dragged to (103, 102) -> within threshold 5 of (100, 100)
    let snapped: { x: number; y: number } = { x: 0, y: 0 };
    act(() => {
      snapped = result.current.handleNodeDrag(draggedNode, [targetNode], { x: 103, y: 102 });
    });

    expect(snapped).toEqual({ x: 100, y: 100 });
    expect(result.current.snapLines.length).toBeGreaterThan(0);

    const vertical = result.current.snapLines.find((l) => l.type === 'vertical');
    expect(vertical?.position).toBe(100);

    const horizontal = result.current.snapLines.find((l) => l.type === 'horizontal');
    expect(horizontal?.position).toBe(100);

    act(() => {
      result.current.clearSnapLines();
    });
    expect(result.current.snapLines).toHaveLength(0);
  });
});

describe('Pro Modules: Export (exportCanvasToSvg & downloadFile)', () => {
  it('exports container element to standalone SVG string', async () => {
    const div = document.createElement('div');
    div.className = 'flowinger';
    div.innerHTML = '<div class="flowinger-viewport"><div class="flowinger-node">Hello Node</div></div>';

    const svg = await exportCanvasToSvg(div, { backgroundColor: '#ffffff', padding: 25 });
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('Hello Node');
  });

  it('triggers download without error', () => {
    expect(() => {
      downloadFile('data:image/svg+xml;utf8,<svg></svg>', 'test.svg');
    }).not.toThrow();
  });
});
