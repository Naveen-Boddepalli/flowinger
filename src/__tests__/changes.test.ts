import { describe, expect, it } from 'vitest';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  getConnectedEdges,
  getIncomers,
  getOutgoers,
  type Edge,
  type Node,
} from '../index.ts';

const node = (id: string, x = 0, y = 0): Node => ({ id, position: { x, y }, data: {} });
const nodes = [node('a'), node('b', 10, 20), node('c')];

describe('applyNodeChanges', () => {
  it('returns the same list when there is nothing to apply', () => {
    expect(applyNodeChanges([], nodes)).toBe(nodes);
  });

  it('moves a node and keeps every other node — and a no-op change — by identity', () => {
    const next = applyNodeChanges(
      [
        { type: 'position', id: 'b', position: { x: 50, y: 60 }, dragging: true },
        { type: 'position', id: 'c', position: { x: 0, y: 0 } }, // where it already is
      ],
      nodes,
    );
    expect(next[1]).toMatchObject({ id: 'b', position: { x: 50, y: 60 }, dragging: true });
    expect(next[0]).toBe(nodes[0]);
    expect(next[2]).toBe(nodes[2]);
    expect(nodes[1]?.position).toEqual({ x: 10, y: 20 }); // the input is not mutated
  });

  it('ends a drag without a position: only `dragging` changes', () => {
    const dragging = applyNodeChanges([{ type: 'position', id: 'a', position: { x: 5, y: 5 }, dragging: true }], nodes);
    const done = applyNodeChanges([{ type: 'position', id: 'a', dragging: false }], dragging);
    expect(done[0]).toMatchObject({ position: { x: 5, y: 5 }, dragging: false });
  });

  it('records a measured size, and writes width/height only when asked', () => {
    const measured = applyNodeChanges([{ type: 'dimensions', id: 'a', dimensions: { width: 80, height: 30 } }], nodes);
    expect(measured[0]).toMatchObject({ measured: { width: 80, height: 30 } });
    expect(measured[0]?.width).toBeUndefined();

    const resized = applyNodeChanges(
      [{ type: 'dimensions', id: 'a', dimensions: { width: 90, height: 40 }, setAttributes: true, resizing: true }],
      measured,
    );
    expect(resized[0]).toMatchObject({ width: 90, height: 40, resizing: true, measured: { width: 90, height: 40 } });

    const onlyWidth = applyNodeChanges(
      [{ type: 'dimensions', id: 'b', dimensions: { width: 70, height: 25 }, setAttributes: 'width' }],
      nodes,
    );
    expect(onlyWidth[1]?.width).toBe(70);
    expect(onlyWidth[1]?.height).toBeUndefined();
  });

  it('keeps a node by identity when its size did not change', () => {
    const once = applyNodeChanges([{ type: 'dimensions', id: 'a', dimensions: { width: 80, height: 30 } }], nodes);
    const again = applyNodeChanges([{ type: 'dimensions', id: 'a', dimensions: { width: 80, height: 30 } }], once);
    expect(again[0]).toBe(once[0]);
  });

  it('selects and deselects', () => {
    const on = applyNodeChanges([{ type: 'select', id: 'b', selected: true }], nodes);
    expect(on[1]?.selected).toBe(true);
    const off = applyNodeChanges([{ type: 'select', id: 'b', selected: false }], on);
    expect(off[1]?.selected).toBe(false);
  });

  it('removes, adds (at the end or at an index) and replaces', () => {
    expect(applyNodeChanges([{ type: 'remove', id: 'b' }], nodes).map((n) => n.id)).toEqual(['a', 'c']);
    expect(applyNodeChanges([{ type: 'add', item: node('d') }], nodes).map((n) => n.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(applyNodeChanges([{ type: 'add', item: node('d'), index: 1 }], nodes).map((n) => n.id)).toEqual([
      'a',
      'd',
      'b',
      'c',
    ]);
    expect(applyNodeChanges([{ type: 'add', item: node('d'), index: 99 }], nodes).map((n) => n.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    const swapped = applyNodeChanges([{ type: 'replace', id: 'a', item: { ...node('a', 7, 7), type: 'x' } }], nodes);
    expect(swapped[0]).toMatchObject({ type: 'x', position: { x: 7, y: 7 } });
  });

  it('applies several changes to one node in order, and drops a node removed part-way', () => {
    const out = applyNodeChanges(
      [
        { type: 'position', id: 'a', position: { x: 1, y: 1 } },
        { type: 'select', id: 'a', selected: true },
        { type: 'position', id: 'a', position: { x: 2, y: 2 } },
      ],
      nodes,
    );
    expect(out[0]).toMatchObject({ position: { x: 2, y: 2 }, selected: true });
    const gone = applyNodeChanges(
      [
        { type: 'remove', id: 'c' },
        { type: 'position', id: 'c', position: { x: 9, y: 9 } },
      ],
      nodes,
    );
    expect(gone.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('ignores a change for a node that is not there', () => {
    const out = applyNodeChanges([{ type: 'select', id: 'nope', selected: true }], nodes);
    expect(out).toEqual(nodes);
  });
});

describe('applyEdgeChanges', () => {
  const edges: Edge[] = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'c' },
  ];

  it('selects, removes, adds and replaces, leaving untouched edges by identity', () => {
    const sel = applyEdgeChanges([{ type: 'select', id: 'e2', selected: true }], edges);
    expect(sel[1]?.selected).toBe(true);
    expect(sel[0]).toBe(edges[0]);
    expect(applyEdgeChanges([{ type: 'remove', id: 'e1' }], edges).map((e) => e.id)).toEqual(['e2']);
    expect(
      applyEdgeChanges([{ type: 'add', item: { id: 'e3', source: 'a', target: 'c' }, index: 0 }], edges).map(
        (e) => e.id,
      ),
    ).toEqual(['e3', 'e1', 'e2']);
    expect(
      applyEdgeChanges([{ type: 'replace', id: 'e1', item: { id: 'e1', source: 'a', target: 'c' } }], edges)[0]?.target,
    ).toBe('c');
    expect(applyEdgeChanges([], edges)).toBe(edges);
  });
});

describe('addEdge', () => {
  it('turns a connection into an edge with a generated id', () => {
    const out = addEdge({ source: 'a', target: 'b', sourceHandle: 'out', targetHandle: null }, []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: 'a', target: 'b', sourceHandle: 'out', targetHandle: null });
    expect(out[0]?.id).toBeTruthy();
  });

  it('keeps an edge’s own id, and does not add the same connection twice', () => {
    const first = addEdge({ id: 'mine', source: 'a', target: 'b' }, []);
    expect(first[0]?.id).toBe('mine');
    // null and undefined are both "no handle"
    expect(addEdge({ source: 'a', target: 'b', sourceHandle: null, targetHandle: null }, first)).toBe(first);
    // a different handle is a different connection
    expect(addEdge({ source: 'a', target: 'b', sourceHandle: 'x', targetHandle: null }, first)).toHaveLength(2);
  });

  it('gives two different connections two different ids', () => {
    const one = addEdge({ source: 'a', target: 'b', sourceHandle: 'x', targetHandle: null }, []);
    const two = addEdge({ source: 'a', target: 'b', sourceHandle: 'y', targetHandle: null }, one);
    expect(new Set(two.map((e) => e.id)).size).toBe(2);
  });
});

describe('graph helpers', () => {
  const edges: Edge[] = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'c' },
  ];
  it('finds connected edges, incomers and outgoers', () => {
    const [a, b, c] = nodes;
    if (!a || !b || !c) throw new Error('fixture');
    expect(getConnectedEdges([b], edges).map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(getConnectedEdges([a], edges).map((e) => e.id)).toEqual(['e1']);
    expect(getIncomers(b, nodes, edges).map((n) => n.id)).toEqual(['a']);
    expect(getOutgoers(b, nodes, edges).map((n) => n.id)).toEqual(['c']);
    expect(getIncomers(a, nodes, edges)).toEqual([]);
  });
});
