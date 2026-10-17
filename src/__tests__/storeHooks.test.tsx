import { describe, expect, it } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { useEffect } from 'react';
import { ReactFlowProvider as ReactFlowsProvider, useEdgesStore as useReactFlowsEdgesStore } from '@xyflow/react';
import {
  FlowingerCanvas,
  Handle,
  Position,
  useConnectionStore,
  useEdge,
  useEdgesStore,
  useInternalNodes,
  useNode,
  useNodesStore,
  useOptionsStore,
  useReactFlowStoreApi,
  useSelectionStore,
  useShallow,
  useStore,
  useViewportStore,
  type ConnectionStore,
  type Edge,
  type EdgesStore,
  type InternalNode,
  type Node,
  type NodesStore,
  type ReactFlowStoreApi,
  type SelectionStore,
  type ViewportStore,
} from '../index.ts';

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });
const pane = (c: ParentNode) => c.querySelector('.flowinger') as HTMLElement;

const nodes: Node[] = [
  { id: 'g', position: { x: 0, y: 0 }, width: 300, height: 200, data: {} },
  { id: 'a', parentId: 'g', position: { x: 10, y: 20 }, width: 100, height: 40, data: {} },
  { id: 'b', position: { x: 400, y: 0 }, width: 100, height: 40, data: {} },
];
const edges: Edge[] = [
  { id: 'a-b', source: 'a', target: 'b' },
  { id: 'a-b2', source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' },
  { id: 'b-g', source: 'b', target: 'g' },
];

/** Renders a canvas with a probe inside it that hands back what `read` returns on every render. */
function probe<T>(read: () => T, props: Partial<Parameters<typeof FlowingerCanvas>[0]> = {}) {
  const seen: T[] = [];
  function Probe() {
    seen.push(read());
    return null;
  }
  const view = render(
    <div style={{ width: 800, height: 600 }}>
      <FlowingerCanvas nodes={nodes} edges={edges} {...props}>
        <Probe />
      </FlowingerCanvas>
    </div>,
  );
  return { ...view, seen, last: () => seen[seen.length - 1] as T };
}

describe("React Flow 13's store hooks", () => {
  it('useNodesStore: the nodes, each with its internals, the children of each parent, and whether all are measured', () => {
    const r = probe(() => useNodesStore());
    const s: NodesStore = r.last();
    expect(s.nodes).toBe(nodes);
    expect([...s.nodeLookup.keys()].sort()).toEqual(['a', 'b', 'g']);
    expect(s.nodeLookup.get('a')?.internals.positionAbsolute).toEqual({ x: 10, y: 20 });
    expect([...(s.parentLookup.get('g')?.keys() ?? [])]).toEqual(['a']);
    expect(s.parentLookup.has('b')).toBe(false);
    expect(typeof s.nodesInitialized).toBe('boolean');
  });

  it('useEdgesStore: the edges, by id, and the connection lookup keyed as React Flow keys it', () => {
    const r = probe(() => useEdgesStore());
    const s: EdgesStore = r.last();
    expect(s.edges).toBe(edges);
    expect(s.edgeLookup.get('a-b2')).toBe(edges[1]);

    // React Flow 13 builds the same lookup in its edges store from the same edges.
    let theirs: Map<string, Map<string, unknown>> | null = null;
    function Read() {
      theirs = useReactFlowsEdgesStore((state) => state.connectionLookup);
      return null;
    }
    render(
      <ReactFlowsProvider initialNodes={nodes as never} initialEdges={edges as never}>
        <Read />
      </ReactFlowsProvider>,
    );
    const plain = (lookup: Map<string, Map<string, unknown>>) =>
      Object.fromEntries([...lookup].map(([k, v]) => [k, Object.fromEntries(v)]));
    expect(theirs).not.toBeNull();
    expect(plain(s.connectionLookup)).toEqual(plain(theirs!));
  });

  it('useViewportStore: the transform, the pane size, and paneDragging while the pane is dragged', () => {
    const r = probe(() => useViewportStore(), { defaultViewport: { x: 5, y: 6, zoom: 2 } });
    const s: ViewportStore = r.last();
    expect(s.transform).toEqual([5, 6, 2]);
    expect(s.paneDragging).toBe(false);
    fireEvent.pointerDown(pane(r.container), pointer({ clientX: 100, clientY: 100 }));
    fireEvent.pointerMove(pane(r.container), pointer({ clientX: 150, clientY: 120 }));
    expect(r.last().paneDragging).toBe(true);
    fireEvent.pointerUp(pane(r.container), pointer({ clientX: 150, clientY: 120 }));
    expect(r.last().paneDragging).toBe(false);
    expect(r.last().transform[0]).not.toBe(5);
  });

  it('useConnectionStore: no connection, then the handle a first click began one from', () => {
    function Ports() {
      return (
        <div>
          <Handle id="in" type="target" position={Position.Top} />
          <Handle id="out" type="source" position={Position.Bottom} />
        </div>
      );
    }
    const r = probe(() => useConnectionStore(), {
      nodes: [nodes[2]!, { id: 'c', type: 'ports', position: { x: 0, y: 0 }, data: {} }],
      nodeTypes: { ports: Ports },
      nodesConnectable: true,
    });
    const s: ConnectionStore = r.last();
    expect(s.connection.inProgress).toBe(false);
    expect(s.connectionClickStartHandle).toBeNull();
    fireEvent.click(r.container.querySelector('[data-id="c"] [data-handleid="out"]')!);
    expect(r.last().connectionClickStartHandle).toEqual({ nodeId: 'c', id: 'out', type: 'source' });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(r.container.querySelector('[data-id="c"] [data-handleid="out"]')!);
    expect(r.last().connectionClickStartHandle).toBeNull();
  });

  it('useSelectionStore: the box being dragged, from the corner it began at', () => {
    const r = probe(() => useSelectionStore(), { elementsSelectable: true });
    expect(r.last().userSelectionRect).toBeNull();
    fireEvent.pointerDown(pane(r.container), pointer({ clientX: 300, clientY: 200, shiftKey: true }));
    fireEvent.pointerMove(pane(r.container), pointer({ clientX: 100, clientY: 50, shiftKey: true }));
    const s: SelectionStore = r.last();
    expect(s.userSelectionRect).toMatchObject({ x: 100, y: 50, width: 200, height: 150, startX: 300, startY: 200 });
    fireEvent.pointerUp(pane(r.container), pointer({ clientX: 100, clientY: 50, shiftKey: true }));
    expect(r.last().userSelectionRect).toBeNull();
  });

  it('useOptionsStore: what useStore reads, and a selector over it', () => {
    let fromUseStore: unknown;
    const r = probe(() => {
      fromUseStore = useStore((s) => s);
      return [useOptionsStore(), useOptionsStore((s) => s.maxZoom)] as const;
    });
    expect(r.last()[0]).toBe(fromUseStore);
    expect(r.last()[1]).toBe(2);
  });

  it('useReactFlowStoreApi: each store read without re-rendering, the same slice until it changes', () => {
    let api: ReactFlowStoreApi | null = null;
    probe(() => {
      api = useReactFlowStoreApi();
      return null;
    });
    const a = api!;
    expect(a.nodesStore.getState()).toBe(a.nodesStore.getState());
    expect(a.edgesStore.getState().edges).toBe(edges);
    expect(a.viewportStore.getState().width).toBeGreaterThanOrEqual(0);
    expect(a.optionsStore.getState().nodes).toBe(nodes);
    expect(a.selectionStore.getState().userSelectionRect).toBeNull();
    let heard = 0;
    const off = a.viewportStore.subscribe(() => (heard += 1));
    void act(() => {
      void a.optionsStore.getState().panZoom?.setViewport({ x: 1, y: 2, zoom: 1 });
    });
    off();
    expect(heard).toBeGreaterThan(0);
    expect(a.viewportStore.getState().transform).toEqual([1, 2, 1]);
  });

  it('useNode, useEdge and useInternalNodes: one node, one edge, some nodes with their internals', () => {
    const r = probe(() => [useNode('b'), useNode('nope'), useEdge('a-b'), useInternalNodes(['a', 'nope', 'b'])] as const);
    const [b, none, edge, internals] = r.last();
    expect(b).toBe(nodes[2]);
    expect(none).toBeUndefined();
    expect(edge).toBe(edges[0]);
    expect((internals as InternalNode[]).map((n) => n.id)).toEqual(['a', 'b']);
    expect((internals as InternalNode[])[0]?.internals.positionAbsolute).toEqual({ x: 10, y: 20 });
  });

  it('useShallow: a result holding the same things as the last one is the last one', () => {
    const results: unknown[] = [];
    function Probe() {
      const ids = useNodesStore(useShallow((s: NodesStore) => s.nodes.map((n) => n.id)));
      useEffect(() => {
        results.push(ids);
      });
      return null;
    }
    const { rerender } = render(
      <FlowingerCanvas nodes={nodes} edges={edges}>
        <Probe />
      </FlowingerCanvas>,
    );
    const settled = results[results.length - 1];
    expect(settled).toEqual(['g', 'a', 'b']);
    rerender(
      <FlowingerCanvas nodes={nodes.map((n) => ({ ...n }))} edges={edges}>
        <Probe />
      </FlowingerCanvas>,
    );
    // New node objects, the same ids: the same array as before.
    expect(results[results.length - 1]).toBe(settled);
  });
});
