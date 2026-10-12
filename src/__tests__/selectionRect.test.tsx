import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { FlowingerCanvas, FlowingerCore, useNodesState, type FlowingerProps, type Node } from '../index.ts';

// What follows a box selection in React Flow: a rectangle round what was selected, which is dragged to move
// all of it — and is where `onSelectionDrag*` and `onSelectionContextMenu` come from. (RF's NodesSelection,
// from its source: shown when a selection box ends with nodes in it, cleared by a click on the pane, a node,
// or a change of selection; dragging it fires onNodeDrag* as well as onSelectionDrag*.)

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const pane = (c: ParentNode) => must<HTMLElement>(c, '.flowinger');
const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

const nodes: Node[] = [
  { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
  { id: 'b', position: { x: 300, y: 100 }, width: 100, height: 40, data: {} },
  { id: 'c', position: { x: 0, y: 400 }, width: 100, height: 40, data: {} },
];

const mount = (props: Partial<FlowingerProps> = {}) =>
  render(
    <div style={{ width: 800, height: 600 }}>
      <FlowingerCanvas nodes={nodes} elementsSelectable nodesDraggable {...props} />
    </div>,
  );

/** A box dragged on the empty canvas with Shift, from one corner to the other. */
function box(c: ParentNode, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(pane(c), pointer({ clientX: from[0], clientY: from[1], shiftKey: true }));
  fireEvent.pointerMove(pane(c), pointer({ clientX: to[0], clientY: to[1], shiftKey: true }));
  fireEvent.pointerUp(pane(c), pointer({ clientX: to[0], clientY: to[1], shiftKey: true }));
}
const rect = (c: ParentNode) => c.querySelector<HTMLElement>('.flowinger-nodesselection-rect');
const at = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`).style.transform;

describe('the rectangle round a box selection', () => {
  it('is drawn round the selected nodes once the box ends, in graph space', () => {
    const { container } = mount();
    expect(rect(container)).toBeNull();
    box(container, [-10, -10], [420, 160]); // a and b
    const r = rect(container);
    expect(r).not.toBeNull();
    // From a's top-left to b's bottom-right: (0, 0) to (400, 140).
    expect(r?.style.transform).toBe('translate(0px, 0px)');
    expect(r?.style.width).toBe('400px');
    expect(r?.style.height).toBe('140px');
    expect(r?.closest('.flowinger-viewport')).not.toBeNull();
  });

  it('is not drawn when the box took nothing', () => {
    const { container } = mount();
    box(container, [500, 300], [600, 350]);
    expect(rect(container)).toBeNull();
  });

  it('goes with a click on the pane, or on a node', () => {
    const { container } = mount();
    box(container, [-10, -10], [420, 160]);
    fireEvent.click(pane(container)); // the click that ends the box is not a click on the pane
    expect(rect(container)).not.toBeNull();
    fireEvent.click(pane(container));
    expect(rect(container)).toBeNull();
    box(container, [-10, -10], [420, 160]);
    fireEvent.click(must(container, '[data-id="c"]'));
    expect(rect(container)).toBeNull();
  });

  it('is not drawn for a selection that was made another way', () => {
    const { container } = mount();
    fireEvent.click(must(container, '[data-id="a"]'));
    fireEvent.click(must(container, '[data-id="b"]'), { shiftKey: true });
    expect(rect(container)).toBeNull();
  });

  it('follows the nodes as they move', () => {
    const { container } = mount();
    box(container, [-10, -10], [420, 160]);
    const r = rect(container) as HTMLElement;
    fireEvent.pointerDown(r, pointer({ clientX: 100, clientY: 70 }));
    fireEvent.pointerMove(r, pointer({ clientX: 150, clientY: 100 }));
    expect(rect(container)?.style.transform).toBe('translate(50px, 30px)');
    fireEvent.pointerUp(r, pointer({ clientX: 150, clientY: 100 }));
  });
});

describe('dragging the rectangle', () => {
  function dragRect(c: ParentNode, dx: number, dy: number) {
    const r = must<HTMLElement>(c, '.flowinger-nodesselection-rect');
    fireEvent.pointerDown(r, pointer({ clientX: 100, clientY: 70 }));
    fireEvent.pointerMove(r, pointer({ clientX: 100 + dx, clientY: 70 + dy }));
    fireEvent.pointerUp(r, pointer({ clientX: 100 + dx, clientY: 70 + dy }));
  }

  it('moves everything selected, and does not pan the canvas', () => {
    const { container } = mount();
    box(container, [-10, -10], [420, 160]);
    const before = must(container, '.flowinger-viewport').getAttribute('style');
    dragRect(container, 40, 20);
    expect(at(container, 'a')).toBe('translate(40px, 20px)');
    expect(at(container, 'b')).toBe('translate(340px, 120px)');
    expect(at(container, 'c')).toBe('translate(0px, 400px)');
    expect(must(container, '.flowinger-viewport').getAttribute('style')).toBe(before);
  });

  it('is the selection\'s drag: onSelectionDrag* are called, with every node moved, and onNodeDrag* too', () => {
    const log: string[] = [];
    const names = (n: Node[]) => n.map((x) => x.id).sort();
    const { container } = mount({
      onNodeDragStart: (_e, _n, all) => log.push(`node-start ${names(all).join()}`),
      onNodeDrag: (_e, _n, all) => log.push(`node-drag ${names(all).join()}`),
      onNodeDragStop: (_e, _n, all) => log.push(`node-stop ${names(all).join()}`),
      onSelectionDragStart: (_e, all) => log.push(`sel-start ${names(all).join()}`),
      onSelectionDrag: (_e, all) => log.push(`sel-drag ${names(all).join()}`),
      onSelectionDragStop: (_e, all) => log.push(`sel-stop ${names(all).join()}`),
    });
    box(container, [-10, -10], [420, 160]);
    dragRect(container, 40, 20);
    expect(log).toEqual([
      'node-start a,b',
      'sel-start a,b',
      'node-drag a,b',
      'sel-drag a,b',
      'node-stop a,b',
      'sel-stop a,b',
    ]);
  });

  it('a node dragged is not a selection drag, even when it is part of the selection', () => {
    const onSelectionDragStart = vi.fn();
    const onNodeDragStart = vi.fn();
    const { container } = mount({ onSelectionDragStart, onNodeDragStart });
    box(container, [-10, -10], [420, 160]);
    const a = must(container, '[data-id="a"]');
    fireEvent.pointerDown(a, pointer({ clientX: 10, clientY: 10 }));
    fireEvent.pointerMove(a, pointer({ clientX: 60, clientY: 60 }));
    fireEvent.pointerUp(a, pointer({ clientX: 60, clientY: 60 }));
    expect(onNodeDragStart).toHaveBeenCalledTimes(1);
    expect(onSelectionDragStart).not.toHaveBeenCalled();
  });

  it('does nothing for a press that does not travel', () => {
    const onSelectionDragStart = vi.fn();
    const { container } = mount({ onSelectionDragStart });
    box(container, [-10, -10], [420, 160]);
    dragRect(container, 0, 0);
    expect(onSelectionDragStart).not.toHaveBeenCalled();
  });
});

describe('the rectangle in a controlled flow, where a change is applied after the pointer has moved on', () => {
  function Controlled() {
    const [list, , onChange] = useNodesState(nodes);
    return (
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={list} onNodesChange={onChange} elementsSelectable nodesDraggable />
      </div>
    );
  }

  it('is round the nodes where they are now, not where they were', () => {
    const { container } = render(<Controlled />);
    box(container, [-10, -10], [420, 160]); // a and b
    const r = must<HTMLElement>(container, '.flowinger-nodesselection-rect');
    expect(r.style.transform).toBe('translate(0px, 0px)');
    fireEvent.pointerDown(r, pointer({ clientX: 100, clientY: 70 }));
    fireEvent.pointerMove(r, pointer({ clientX: 160, clientY: 100 }));
    fireEvent.pointerUp(r, pointer({ clientX: 160, clientY: 100 }));
    expect(at(container, 'a')).toBe('translate(60px, 30px)');
    expect(at(container, 'b')).toBe('translate(360px, 130px)');
    const moved = must<HTMLElement>(container, '.flowinger-nodesselection-rect');
    // From a's top-left to b's bottom-right, all of it moved by (60, 30): the same size, the same corner.
    expect(moved.style.transform).toBe('translate(60px, 30px)');
    expect(moved.style.width).toBe('400px');
    expect(moved.style.height).toBe('140px');
  });
});

describe('the rectangle round a group and what is inside it', () => {
  const tree: Node[] = [
    { id: 'g', position: { x: 40, y: 140 }, width: 300, height: 200, data: {} },
    { id: 'k', position: { x: 20, y: 30 }, width: 100, height: 40, data: {}, parentId: 'g', expandParent: true },
    { id: 'free', position: { x: 400, y: 20 }, width: 100, height: 40, data: {} },
  ];
  function Tree() {
    const [list, , onChange] = useNodesState(tree);
    return (
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={list} onNodesChange={onChange} elementsSelectable nodesDraggable />
      </div>
    );
  }

  it('is round them where they are now', () => {
    const { container } = render(<Tree />);
    box(container, [-10, -10], [600, 400]);
    const r = must<HTMLElement>(container, '.flowinger-nodesselection-rect');
    // From g's left (40) to free's right (500); from free's top (20) to g's bottom (340).
    expect(r.style.transform).toBe('translate(40px, 20px)');
    expect(r.style.width).toBe('460px');
    fireEvent.pointerDown(r, pointer({ clientX: 200, clientY: 200 }));
    fireEvent.pointerMove(r, pointer({ clientX: 260, clientY: 230 }));
    fireEvent.pointerUp(r, pointer({ clientX: 260, clientY: 230 }));
    expect(at(container, 'g')).toBe('translate(100px, 170px)');
    expect(at(container, 'free')).toBe('translate(460px, 50px)');
    const moved = must<HTMLElement>(container, '.flowinger-nodesselection-rect');
    expect(moved.style.transform).toBe('translate(100px, 50px)');
    expect(moved.style.width).toBe('460px');
  });
});

describe('onSelectionContextMenu', () => {
  it('is told the selected nodes when the rectangle is right-clicked', () => {
    const onSelectionContextMenu = vi.fn();
    const { container } = mount({ onSelectionContextMenu });
    box(container, [-10, -10], [420, 160]);
    fireEvent.contextMenu(must(container, '.flowinger-nodesselection-rect'));
    expect(onSelectionContextMenu).toHaveBeenCalledTimes(1);
    const picked = onSelectionContextMenu.mock.calls[0]?.[1] as Node[];
    expect(picked.map((n) => n.id).sort()).toEqual(['a', 'b']);
  });
});

describe('without the feature', () => {
  it('a FlowingerCore says the selection events need it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<FlowingerCore nodes={nodes} onSelectionDragStart={() => {}} />);
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/onSelectionDragStart.*selectionRect/);
    warn.mockRestore();
  });
});
