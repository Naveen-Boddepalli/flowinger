import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { FlowingerCanvas, useNodesState, type Node, type NodeChange } from '../index.ts';
import { beginGroup, growGroup } from '../expand.ts';

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const el = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
const at = (c: ParentNode, id: string) => el(c, id).style.transform;
/** The changes that name a node — `add` names none. */
const about = (changes: NodeChange[], id: string) => changes.filter((c) => 'id' in c && c.id === id);
const size = (c: ParentNode, id: string) => [el(c, id).style.width, el(c, id).style.height];

const box = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  width: w,
  height: h,
  data: {},
  ...extra,
});

/** A parent at (100, 100), 300 × 200, holding a draggable child that may grow it, and a sibling that stays. */
const family = (kid: Partial<Node> = { expandParent: true }): Node[] => [
  box('p', 100, 100, 300, 200),
  box('k', 10, 10, 50, 30, { parentId: 'p', ...kid }),
  box('s', 200, 100, 50, 30, { parentId: 'p' }),
];

function Harness({
  initial = family(),
  onChange,
  onNodeDrag,
  selectable = false,
}: {
  initial?: Node[];
  onChange?: (c: NodeChange[]) => void;
  onNodeDrag?: (e: unknown, n: Node, all: Node[]) => void;
  selectable?: boolean;
}) {
  const [nodes, , onNodesChange] = useNodesState(initial);
  return (
    <FlowingerCanvas
      nodes={nodes}
      nodesDraggable
      elementsSelectable={selectable}
      onNodesChange={(c) => {
        onChange?.(c);
        onNodesChange(c);
      }}
      onNodeDrag={onNodeDrag as never}
    />
  );
}

function drag(c: ParentNode, id: string, moves: [number, number][]) {
  const node = el(c, id);
  fireEvent.pointerDown(node, pointer({ clientX: 0, clientY: 0 }));
  for (const [x, y] of moves) fireEvent.pointerMove(node, pointer({ clientX: x, clientY: y }));
  const last = moves.at(-1) ?? [0, 0];
  fireEvent.pointerUp(node, pointer({ clientX: last[0], clientY: last[1] }));
}

describe('a parent that grows for a child dragged past its right or bottom edge', () => {
  it('reaches exactly as far as the child’s far side', () => {
    const { container } = render(<Harness />);
    drag(container, 'k', [[400, 300]]);
    // k is now at (510, 410), 50 × 30: its right is 560 and its bottom 440.
    expect(at(container, 'k')).toBe('translate(510px, 410px)');
    expect(size(container, 'p')).toEqual(['460px', '340px']); // from x 100 and y 100
    expect(at(container, 'p')).toBe('translate(100px, 100px)'); // its corner did not move
    expect(at(container, 's')).toBe('translate(300px, 200px)');
  });

  it('reports the growth as a dimensions change that writes width and height', () => {
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);
    onChange.mockClear();
    drag(container, 'k', [[400, 300]]);
    const all = (onChange.mock.calls as NodeChange[][][]).flat(2);
    expect(all).toContainEqual({
      type: 'dimensions',
      id: 'p',
      dimensions: { width: 460, height: 340 },
      setAttributes: true,
    });
    // Its corner stayed put, so there is no position change for it.
    expect(about(all, 'p').some((c) => c.type === 'position')).toBe(false);
  });

  it('does not shrink when the child comes back in', () => {
    const { container } = render(<Harness />);
    drag(container, 'k', [[400, 300], [100, 50]]);
    expect(size(container, 'p')).toEqual(['460px', '340px']);
    expect(at(container, 'k')).toBe('translate(210px, 160px)');
  });

  it('says nothing about the parent while the child stays inside', () => {
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);
    onChange.mockClear();
    drag(container, 'k', [[100, 50]]);
    const all = (onChange.mock.calls as NodeChange[][][]).flat(2);
    expect(about(all, 'p')).toEqual([]);
    expect(size(container, 'p')).toEqual(['300px', '200px']);
  });

  it('says a step that changes nothing nothing', () => {
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);
    onChange.mockClear();
    drag(container, 'k', [[400, 300], [401, 300], [400, 301], [400, 300]]);
    const grew = (onChange.mock.calls as NodeChange[][][])
      .flat(2)
      .filter((c) => c.type === 'dimensions' && 'id' in c && c.id === 'p');
    // Grown by the first move, then by the 1 px further on each side — never repeated.
    expect(new Set(grew.map((c) => JSON.stringify(c))).size).toBe(grew.length);
  });
});

describe('a parent that grows for a child dragged past its left or top edge', () => {
  it('moves its own corner out, and keeps everything else where it was on the canvas', () => {
    const { container } = render(<Harness />);
    const sBefore = at(container, 's');
    drag(container, 'k', [[-150, -120]]);
    // k is at (-40, -10) on the canvas; the parent now starts there and reaches x 400, y 300.
    expect(at(container, 'k')).toBe('translate(-40px, -10px)');
    expect(at(container, 'p')).toBe('translate(-40px, -10px)');
    expect(size(container, 'p')).toEqual(['440px', '310px']);
    // s was at canvas (300, 200) and still is, though its parent's corner moved 140 and 110.
    expect(at(container, 's')).toBe(sBefore);
  });

  it('gives the child a position relative to the new corner, and reports it so', () => {
    const onNodeDrag = vi.fn();
    const onChange = vi.fn();
    const { container } = render(<Harness onNodeDrag={onNodeDrag} onChange={onChange} />);
    onChange.mockClear();
    drag(container, 'k', [[-150, -120]]);
    const [, moved] = onNodeDrag.mock.calls.at(-1) as [unknown, Node];
    expect(moved.position).toEqual({ x: 0, y: 0 }); // at the parent's new top-left
    const all = (onChange.mock.calls as NodeChange[][][]).flat(2);
    expect(all).toContainEqual({ type: 'position', id: 'p', position: { x: -40, y: -10 } });
    expect(all).toContainEqual({ type: 'position', id: 's', position: { x: 340, y: 210 } });
    expect(all).toContainEqual({ type: 'position', id: 'k', position: { x: 0, y: 0 }, dragging: true });
  });

  it('grows one axis at a time', () => {
    const { container } = render(<Harness />);
    drag(container, 'k', [[-150, 0]]);
    expect(at(container, 'p')).toBe('translate(-40px, 100px)');
    expect(size(container, 'p')).toEqual(['440px', '200px']);
  });

  it('grows upward alone, leaving the left edge', () => {
    const { container } = render(<Harness />);
    drag(container, 'k', [[0, -120]]);
    expect(at(container, 'p')).toBe('translate(100px, -10px)');
    expect(size(container, 'p')).toEqual(['300px', '310px']);
    expect(at(container, 'k')).toBe('translate(110px, -10px)');
    expect(at(container, 's')).toBe('translate(300px, 200px)');
  });

  it('keeps a grandchild where it was, since its own parent is only re-based', () => {
    const initial = [...family(), box('g', 5, 5, 20, 20, { parentId: 's' })];
    const { container } = render(<Harness initial={initial} />);
    const before = at(container, 'g'); // canvas (305, 205)
    drag(container, 'k', [[-150, -120]]);
    expect(at(container, 'g')).toBe(before);
  });
});

describe('what takes part', () => {
  it('a child that does not say expandParent leaves its parent alone', () => {
    const onChange = vi.fn();
    const { container } = render(<Harness initial={family({})} onChange={onChange} />);
    onChange.mockClear();
    drag(container, 'k', [[400, 300]]);
    expect(size(container, 'p')).toEqual(['300px', '200px']);
    const all = (onChange.mock.calls as NodeChange[][][]).flat(2);
    expect(about(all, 'p')).toEqual([]);
  });

  it('expandParent lets a child with extent "parent" out — and it grows the parent instead', () => {
    const { container } = render(<Harness initial={family({ expandParent: true, extent: 'parent' })} />);
    drag(container, 'k', [[400, 300]]);
    expect(at(container, 'k')).toBe('translate(510px, 410px)');
    expect(size(container, 'p')).toEqual(['460px', '340px']);
  });

  it('extent "parent" alone still holds the child in', () => {
    const { container } = render(<Harness initial={family({ extent: 'parent' })} />);
    drag(container, 'k', [[400, 300]]);
    // The parent's far corner is (400, 300): the child stops with its own far side there.
    expect(at(container, 'k')).toBe('translate(350px, 270px)');
    expect(size(container, 'p')).toEqual(['300px', '200px']);
  });

  it('needs a controlled flow: on nodes that are only passed in, the drag just drags', () => {
    const { container } = render(<FlowingerCanvas nodes={family()} nodesDraggable />);
    drag(container, 'k', [[400, 300]]);
    expect(at(container, 'k')).toBe('translate(510px, 410px)');
    expect(size(container, 'p')).toEqual(['300px', '200px']); // nobody to write the size to
    // …and past the top-left the child simply goes where it is dragged, the parent staying put.
    const past = render(<FlowingerCanvas nodes={family()} nodesDraggable />);
    drag(past.container, 'k', [[-150, -120]]);
    expect(at(past.container, 'k')).toBe('translate(-40px, -10px)');
    expect(at(past.container, 'p')).toBe('translate(100px, 100px)');
  });

  it('places the children of a grown parent by the move the drag was allowed, not the one asked for', () => {
    function Snapped() {
      const [nodes, , onNodesChange] = useNodesState(family());
      return <FlowingerCanvas nodes={nodes} nodesDraggable snapToGrid snapGrid={[20, 20]} onNodesChange={onNodesChange} />;
    }
    const snapped = render(<Snapped />);
    drag(snapped.container, 'k', [[403, 303]]);
    // k's canvas x is 110; 110 + 403 = 513 snaps to 520, so it moved 410 and 310, not 403 and 303.
    expect(at(snapped.container, 'k')).toBe('translate(520px, 420px)');
    expect(size(snapped.container, 'p')).toEqual(['470px', '350px']); // to 570 and 450 from 100
  });

  it('does not double-report a sibling that is being dragged itself', () => {
    const onChange = vi.fn();
    const initial = [
      box('p', 100, 100, 300, 200),
      box('k1', 10, 10, 50, 30, { parentId: 'p', expandParent: true }),
      box('k2', 100, 10, 50, 30, { parentId: 'p', expandParent: true }),
    ];
    const { container } = render(<Harness initial={initial} selectable onChange={onChange} />);
    fireEvent.click(el(container, 'k1'));
    fireEvent.click(el(container, 'k2'), { shiftKey: true });
    onChange.mockClear();
    drag(container, 'k1', [[-150, -120]]);
    const all = (onChange.mock.calls as NodeChange[][][]).flat(2);
    // Every change to k2 comes from the drag itself: none is a bare compensation for the parent's move.
    expect(about(all, 'k2').every((c) => c.type === 'position' && 'dragging' in c)).toBe(true);
  });

  it('holds several children of one parent to one box', () => {
    const initial = [
      box('p', 100, 100, 300, 200),
      box('k1', 10, 10, 50, 30, { parentId: 'p', expandParent: true }),
      box('k2', 100, 10, 50, 30, { parentId: 'p', expandParent: true }),
    ];
    const { container } = render(<Harness initial={initial} selectable />);
    fireEvent.click(el(container, 'k1'));
    fireEvent.click(el(container, 'k2'), { shiftKey: true });
    drag(container, 'k1', [[400, 0]]);
    // k2 ends at canvas x 200 + 400 = 600, reaching 650: the parent, from 100, is 550 wide.
    expect(size(container, 'p')).toEqual(['550px', '200px']);
    expect(at(container, 'k1')).toBe('translate(510px, 110px)');
    expect(at(container, 'k2')).toBe('translate(600px, 110px)');
  });

  it('is not started by dragging the parent, whose children ride along', () => {
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);
    onChange.mockClear();
    drag(container, 'p', [[500, 500]]);
    expect(size(container, 'p')).toEqual(['300px', '200px']);
    expect(at(container, 'k')).toBe('translate(610px, 610px)');
    const all = (onChange.mock.calls as NodeChange[][][]).flat(2);
    expect(about(all, 'p').some((c) => c.type === 'dimensions')).toBe(false);
  });

  it('ends the drag as usual', () => {
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);
    onChange.mockClear();
    drag(container, 'k', [[400, 300]]);
    const all = (onChange.mock.calls as NodeChange[][][]).flat(2);
    expect(all.at(-1)).toEqual({ type: 'position', id: 'k', dragging: false });
  });
});

describe('growGroup', () => {
  const parentBox = { x: 100, y: 100, width: 300, height: 200 };
  const start = () =>
    beginGroup('p', { x: 100, y: 100 }, parentBox, ['k'], [{ id: 's', rel: { x: 200, y: 100 } }]);

  it('says nothing for a child inside the box, but still says where it sits in it', () => {
    const { changes, relative } = growGroup(start(), [{ id: 'k', x: 150, y: 150, width: 50, height: 30 }]);
    expect(changes).toEqual([]);
    expect(relative.get('k')).toEqual({ x: 50, y: 50 });
  });

  it('tracks the furthest the children have been, not where they are now', () => {
    const g = start();
    growGroup(g, [{ id: 'k', x: 500, y: 100, width: 50, height: 30 }]);
    const { changes } = growGroup(g, [{ id: 'k', x: 120, y: 100, width: 50, height: 30 }]);
    expect(changes).toEqual([]); // back inside: the box stays as grown, and there is nothing new to say
    expect(g.box.right).toBe(550);
  });
});
