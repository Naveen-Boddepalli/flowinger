import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
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

  it("have React Flow 13's methods: applyTo, getByType, getForNode, toArray, size, removeForNode", () => {
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

  it("add: an element's remove, then its add, go before its other changes, as in React Flow 13", () => {
    const changes = new NodeChangeset();
    const select: NodeChange = { type: 'select', id: 'c', selected: true };
    changes.add(select);
    changes.add({ type: 'add', id: 'c', item: { id: 'c', position: { x: 0, y: 0 }, data: {} } });
    expect(changes.map((c) => c.type)).toEqual(['add', 'select']);
    changes.add({ type: 'remove', id: 'c' });
    expect(changes.map((c) => c.type)).toEqual(['remove', 'add', 'select']);
    // Removed and added again: the node as added. (A change to a node added in the same batch is not applied to
    // it, as in React Flow 12's applyNodeChanges, which applyTo is.)
    expect(changes.applyTo([{ id: 'c', position: { x: 9, y: 9 }, data: {} }]).map((n) => n.position)).toEqual([{ x: 0, y: 0 }]);
    changes.remove(select);
    expect(changes.map((c) => c.type)).toEqual(['remove', 'add']);
    changes.add([{ type: 'select', id: 'd', selected: false }]);
    expect(changes.getForElement('d')).toHaveLength(1);
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
