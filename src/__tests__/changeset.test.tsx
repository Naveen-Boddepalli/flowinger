import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import * as RF from '@xyflow/react';
import {
  EdgeChangeset,
  FlowingerCanvas,
  NodeChangeset,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
  type OnNodesChange,
} from '../index.ts';

const nodes = (): Node[] => [
  { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
  { id: 'b', position: { x: 200, y: 0 }, width: 100, height: 40, data: {} },
];

describe('NodeChangeset and EdgeChangeset', () => {
  it('are arrays — React Flow 12 code takes them as before — with plain arrays from filter and map', () => {
    const changes = new NodeChangeset([
      { type: 'select', id: 'a', selected: true },
      { type: 'position', id: 'b', position: { x: 5, y: 5 } },
    ]);
    expect(Array.isArray(changes)).toBe(true);
    expect(changes).toHaveLength(2);
    expect(changes.filter((c) => c.type === 'select')).toEqual([{ type: 'select', id: 'a', selected: true }]);
    expect(changes.filter(() => true)).not.toBeInstanceOf(NodeChangeset);
    expect([...changes].map((c) => c.id)).toEqual(['a', 'b']);
    expect(applyNodeChanges(changes, nodes()).map((n) => [n.id, n.selected, n.position])).toEqual([
      ['a', true, { x: 0, y: 0 }],
      ['b', undefined, { x: 5, y: 5 }],
    ]);
  });

  it("have React Flow 13's methods: applyTo, getByType, getForNode, toArray, removeForNode (and size, deprecated)", () => {
    const changes = new NodeChangeset([
      { type: 'select', id: 'a', selected: true },
      { type: 'position', id: 'a', position: { x: 1, y: 2 } },
      { type: 'remove', id: 'b' },
    ]);
    expect(changes.applyTo(nodes()).map((n) => [n.id, n.selected, n.position])).toEqual([['a', true, { x: 1, y: 2 }]]);
    expect(changes.getByType('position')).toEqual([{ type: 'position', id: 'a', position: { x: 1, y: 2 } }]);
    expect(changes.getForNode('a').map((c) => c.type)).toEqual(['select', 'position']);
    expect(changes.size).toBe(2);
    const plain = changes.toArray();
    expect(plain).not.toBeInstanceOf(NodeChangeset);
    expect(plain).toEqual([...changes]);
    const before = changes.version;
    changes.removeForNode('a');
    expect(changes.map((c) => c.type)).toEqual(['remove']);
    expect(changes.version).toBeGreaterThan(before);
  });

  it('add queues changes in order; getForNode leaves out the add, which getNewNodes has, as in React Flow 13', () => {
    const changes = new NodeChangeset();
    const select: NodeChange = { type: 'select', id: 'c', selected: true };
    changes.add(select);
    changes.add({ type: 'add', id: 'c', item: { id: 'c', position: { x: 0, y: 0 }, data: {} } });
    expect(changes.map((c) => c.type)).toEqual(['select', 'add']);
    expect(changes.getForNode('c')).toEqual([select]);
    expect(changes.getNewNodes().map((n) => n.id)).toEqual(['c']);
    // An added node gets the changes queued for its id.
    expect(changes.applyTo(nodes()).map((n) => [n.id, n.selected])).toEqual([
      ['a', undefined],
      ['b', undefined],
      ['c', true],
    ]);
    // A node already in the list is not added again, and a remove takes it out whatever else is queued.
    changes.add({ type: 'remove', id: 'c' });
    expect(changes.applyTo([{ id: 'c', position: { x: 9, y: 9 }, data: {} }])).toEqual([]);
    changes.remove(select);
    expect(changes.map((c) => c.type)).toEqual(['add', 'remove']);
    expect(changes.isEmpty()).toBe(false);
    changes.clear();
    expect(changes.isEmpty()).toBe(true);
    expect(changes).toHaveLength(0);
  });

  it("apply update and data changes, which leave a node they do not change as it was", () => {
    const list: Node[] = [{ id: 'a', position: { x: 0, y: 0 }, data: { k: 1, j: 2 } }];
    const changes = new NodeChangeset([
      { type: 'update', id: 'a', item: { position: { x: 5, y: 5 } } },
      { type: 'data', id: 'a', data: { k: 9 } },
    ]);
    expect(changes.applyTo(list)).toEqual([{ id: 'a', position: { x: 5, y: 5 }, data: { k: 9, j: 2 } }]);
    expect(applyNodeChanges(changes, list)).toEqual(changes.applyTo(list));
    expect(new NodeChangeset([{ type: 'data', id: 'a', data: { z: 0 }, replace: true }]).applyTo(list)[0]?.data).toEqual({ z: 0 });
    expect(new NodeChangeset([{ type: 'update', id: 'a', item: { data: list[0]!.data } }]).applyTo(list)[0]).toBe(list[0]);
    // A kind of change this version does not know leaves the node alone rather than losing it.
    expect(applyNodeChanges([{ type: 'unknown', id: 'a' } as unknown as NodeChange], list)).toEqual(list);
  });

  it("applyTo is React Flow 13's, on random batches of every kind of change", () => {
    let seed = 11;
    const rnd = (n: number) => (seed = (seed * 16807) % 2147483647) % n;
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const start = (): Node[] => ['a', 'b', 'c'].map((id, i) => ({ id, position: { x: i, y: i }, data: { n: i } }));
    const change = (): NodeChange => {
      const id = ids[rnd(ids.length)]!;
      const item = { id, position: { x: rnd(50), y: rnd(50) }, data: { m: rnd(9) } };
      switch (rnd(8)) {
        case 0: return { type: 'select', id, selected: rnd(2) === 0 };
        case 1: return { type: 'position', id, position: { x: rnd(50), y: rnd(50) }, dragging: rnd(2) === 0 };
        case 2: return { type: 'dimensions', id, dimensions: { width: rnd(90), height: rnd(90) }, setAttributes: rnd(2) === 0 };
        case 3: return { type: 'remove', id };
        case 4: return { type: 'add', id, item };
        case 5: return { type: 'replace', id, item };
        case 6: return { type: 'update', id, item: { position: { x: rnd(50), y: 0 } } };
        default: return rnd(2) === 0 ? { type: 'data', id, data: { m: rnd(9) } } : { type: 'data', id, data: { r: 1 }, replace: true };
      }
    };
    for (let round = 0; round < 500; round++) {
      const batch = Array.from({ length: 1 + rnd(8) }, change);
      const mine = new NodeChangeset();
      const theirs = new RF.NodeChangeset();
      for (const c of batch) {
        mine.add(c);
        theirs.add(structuredClone(c) as never);
      }
      const label = JSON.stringify(batch);
      expect(mine.applyTo(start()), label).toEqual(theirs.applyTo(start() as never));
      expect(mine.getNewNodes(), label).toEqual(theirs.getNewNodes());
      for (const id of ids) expect(mine.getForNode(id), label).toEqual(theirs.getForNode(id));
      expect(mine.isEmpty()).toBe(theirs.isEmpty());
    }
  });

  it('EdgeChangeset applies edge changes', () => {
    const edges: Edge[] = [{ id: 'e', source: 'a', target: 'b' }];
    const changes = new EdgeChangeset([{ type: 'select', id: 'e', selected: true }]);
    expect(changes.applyTo(edges)[0]?.selected).toBe(true);
    expect(changes.getForEdge('e')).toHaveLength(1);
    changes.removeForEdge('e');
    expect(changes).toHaveLength(0);
  });
});

describe('onNodesChange', () => {
  it('is given a NodeChangeset, which a handler written for React Flow 13 applies with applyTo', () => {
    const seen: unknown[] = [];
    function Flow() {
      const [list, setList] = useState(nodes);
      const onNodesChange: OnNodesChange = (changes) => {
        seen.push(changes);
        setList((current) => (changes as NodeChangeset).applyTo(current));
      };
      return (
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCanvas nodes={list} onNodesChange={onNodesChange} elementsSelectable />
        </div>
      );
    }
    const { container } = render(<Flow />);
    const a = container.querySelector('[data-id="a"]') as HTMLElement;
    fireEvent.click(a);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((c) => c instanceof NodeChangeset)).toBe(true);
    expect(a.classList.contains('selected')).toBe(true);
  });
});
