import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import {
  FlowingerCanvas,
  useNodesInitialized,
  useNodesState,
  type Node,
  type NodeChange,
  type FlowingerProps,
} from '../index.ts';

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const el = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
const at = (c: ParentNode, id: string) => el(c, id).style.transform;
const selectedIds = (c: ParentNode) =>
  ['a', 'b', 'c'].filter((id) => el(c, id).classList.contains('selected'));

const three = (): Node[] =>
  ['a', 'b', 'c'].map((id, i) => ({ id, position: { x: i * 200, y: 0 }, data: { label: id } }));

/** Drags `id` by (dx, dy) screen pixels: down, one move past the threshold, up. */
function drag(c: ParentNode, id: string, dx: number, dy: number, mods: Record<string, boolean> = {}) {
  const node = el(c, id);
  fireEvent.pointerDown(node, pointer({ clientX: 0, clientY: 0, ...mods }));
  fireEvent.pointerMove(node, pointer({ clientX: dx, clientY: dy, ...mods }));
  fireEvent.pointerUp(node, pointer({ clientX: dx, clientY: dy, ...mods }));
}

/** A controlled flow whose state lives in `useNodesState`, as a caller would write it. */
function Controlled({
  initial = three(),
  onChange,
  ...rest
}: { initial?: Node[]; onChange?: (c: NodeChange[]) => void } & Partial<FlowingerProps>) {
  const [nodes, , onNodesChange] = useNodesState(initial);
  return (
    <FlowingerCanvas
      nodes={nodes}
      onNodesChange={(changes) => {
        onChange?.(changes);
        onNodesChange(changes);
      }}
      {...rest}
    />
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('controlled flow: dragging', () => {
  it('reports a drag as position changes and moves nothing itself', () => {
    const onNodesChange = vi.fn();
    const { container } = render(<FlowingerCanvas nodes={three()} onNodesChange={onNodesChange} nodesDraggable />);
    const node = el(container, 'a');
    fireEvent.pointerDown(node, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(node, pointer({ clientX: 30, clientY: 20 }));
    expect(onNodesChange).toHaveBeenLastCalledWith([
      { type: 'position', id: 'a', position: { x: 30, y: 20 }, dragging: true },
    ]);
    expect(at(container, 'a')).toBe('translate(0px, 0px)'); // the caller has not applied it
    fireEvent.pointerUp(node, pointer({ clientX: 30, clientY: 20 }));
    expect(onNodesChange).toHaveBeenLastCalledWith([{ type: 'position', id: 'a', dragging: false }]);
  });

  it('moves the node once the caller applies the changes, and ends the drag', () => {
    const { container } = render(<Controlled nodesDraggable />);
    const node = el(container, 'a');
    fireEvent.pointerDown(node, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(node, pointer({ clientX: 30, clientY: 20 }));
    expect(at(container, 'a')).toBe('translate(30px, 20px)');
    expect(node.classList.contains('dragging')).toBe(true);
    fireEvent.pointerUp(node, pointer({ clientX: 30, clientY: 20 }));
    expect(at(container, 'a')).toBe('translate(30px, 20px)');
    expect(node.classList.contains('dragging')).toBe(false);
  });

  it('says when a drag begins — once, past the threshold, with what is being dragged', () => {
    const onNodeDragStart = vi.fn();
    const { container } = render(<Controlled nodesDraggable onNodeDragStart={onNodeDragStart} />);
    const node = el(container, 'a');
    fireEvent.pointerDown(node, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(node, pointer({ clientX: 1, clientY: 1 }));
    expect(onNodeDragStart).not.toHaveBeenCalled();
    fireEvent.pointerMove(node, pointer({ clientX: 10, clientY: 0 }));
    fireEvent.pointerMove(node, pointer({ clientX: 20, clientY: 0 }));
    expect(onNodeDragStart).toHaveBeenCalledTimes(1);
    const [, lead, dragged] = onNodeDragStart.mock.calls[0] as [unknown, Node, Node[]];
    expect(lead.id).toBe('a');
    expect(dragged.map((n) => n.id)).toEqual(['a']);
  });
});

describe('dragging a selection', () => {
  const selectAB = (c: ParentNode) => {
    fireEvent.click(el(c, 'a'));
    fireEvent.click(el(c, 'b'), { shiftKey: true });
  };

  it('moves every selected node together, and the others not at all', () => {
    const onNodeDrag = vi.fn();
    const onNodeDragStop = vi.fn();
    const { container } = render(
      <FlowingerCanvas
        nodes={three()}
        nodesDraggable
        elementsSelectable
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
      />,
    );
    selectAB(container);
    drag(container, 'a', 30, 20);
    expect(at(container, 'a')).toBe('translate(30px, 20px)');
    expect(at(container, 'b')).toBe('translate(230px, 20px)');
    expect(at(container, 'c')).toBe('translate(400px, 0px)');
    const [, lead, dragged] = onNodeDrag.mock.calls.at(-1) as [unknown, Node, Node[]];
    expect(lead.id).toBe('a');
    expect(dragged.map((n) => [n.id, n.position.x])).toEqual([
      ['a', 30],
      ['b', 230],
    ]);
    const [, , stopped] = onNodeDragStop.mock.calls.at(-1) as [unknown, Node, Node[]];
    expect(stopped.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('does the same in a controlled flow, in one batch of changes', () => {
    const onChange = vi.fn();
    const { container } = render(<Controlled nodesDraggable elementsSelectable onChange={onChange} />);
    selectAB(container);
    onChange.mockClear();
    const node = el(container, 'b');
    fireEvent.pointerDown(node, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(node, pointer({ clientX: 10, clientY: 5 }));
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'position', id: 'a', position: { x: 10, y: 5 }, dragging: true },
      { type: 'position', id: 'b', position: { x: 210, y: 5 }, dragging: true },
    ]);
    expect(at(container, 'a')).toBe('translate(10px, 5px)');
    expect(at(container, 'c')).toBe('translate(400px, 0px)');
  });

  it('drags a node that is not selected alone, and selects just it', () => {
    const { container } = render(<FlowingerCanvas nodes={three()} nodesDraggable elementsSelectable />);
    selectAB(container);
    drag(container, 'c', 10, 10);
    expect(at(container, 'c')).toBe('translate(410px, 10px)');
    expect(at(container, 'a')).toBe('translate(0px, 0px)');
    expect(at(container, 'b')).toBe('translate(200px, 0px)');
    expect(selectedIds(container)).toEqual(['c']);
  });

  it('adds an unselected node to the selection when dragged with Shift', () => {
    const { container } = render(<FlowingerCanvas nodes={three()} nodesDraggable elementsSelectable />);
    fireEvent.click(el(container, 'a'));
    drag(container, 'c', 10, 10, { shiftKey: true });
    expect(selectedIds(container)).toEqual(['a', 'c']);
    expect(at(container, 'a')).toBe('translate(10px, 10px)');
    expect(at(container, 'c')).toBe('translate(410px, 10px)');
  });

  it('leaves a selected node that is not draggable where it is', () => {
    const nodes = three().map((n) => (n.id === 'b' ? { ...n, draggable: false } : n));
    const { container } = render(<FlowingerCanvas nodes={nodes} nodesDraggable elementsSelectable />);
    selectAB(container);
    drag(container, 'a', 10, 10);
    expect(at(container, 'a')).toBe('translate(10px, 10px)');
    expect(at(container, 'b')).toBe('translate(200px, 0px)');
  });

  it('does not let the click that ends a drag collapse the selection — or count as a click', () => {
    const onNodeClick = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={three()} nodesDraggable elementsSelectable onNodeClick={onNodeClick} />,
    );
    selectAB(container);
    onNodeClick.mockClear();
    drag(container, 'a', 30, 20);
    fireEvent.click(el(container, 'a')); // what the browser sends after a captured drag
    expect(selectedIds(container)).toEqual(['a', 'b']);
    expect(onNodeClick).not.toHaveBeenCalled();
    // The next, real click is a click again.
    fireEvent.click(el(container, 'a'));
    expect(selectedIds(container)).toEqual(['a']);
    expect(onNodeClick).toHaveBeenCalledTimes(1);
  });

  it('does not swallow a click after a drag whose click never arrived', () => {
    const onNodeClick = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={three()} nodesDraggable elementsSelectable onNodeClick={onNodeClick} />,
    );
    drag(container, 'a', 30, 20); // released elsewhere: no click follows
    fireEvent.pointerDown(el(container, 'a'), pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerUp(el(container, 'a'), pointer({ clientX: 0, clientY: 0 }));
    fireEvent.click(el(container, 'a'));
    expect(onNodeClick).toHaveBeenCalledTimes(1);
  });

  it('leaves the canvas with nothing to pan after a node drag: a bare pointer move does not pan', () => {
    const { container } = render(<FlowingerCanvas nodes={three()} nodesDraggable />);
    drag(container, 'a', 30, 20);
    const pane = container.firstElementChild as Element;
    fireEvent.pointerMove(pane, pointer({ clientX: 200, clientY: 200 }));
    expect(must<HTMLElement>(container, '.flowinger-viewport').style.transform).toBe(
      'translate(0px, 0px) scale(1)',
    );
  });
});

describe('capturing the pointer for a drag', () => {
  // jsdom has no pointer capture; a stand-in records which element asked, and for which pointer.
  const asked: { el: Element; id: number }[] = [];
  const install = () => {
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      configurable: true,
      value(this: Element, id: number) {
        asked.push({ el: this, id });
      },
    });
  };
  afterEach(() => {
    asked.length = 0;
    Reflect.deleteProperty(Element.prototype, 'setPointerCapture');
  });

  it('takes it on the move that crosses the threshold, even when that move lands off the node', () => {
    install();
    const { container } = render(<FlowingerCanvas nodes={three()} nodesDraggable />);
    const pane = container.firstElementChild as Element;
    fireEvent.pointerDown(el(container, 'a'), pointer({ clientX: 0, clientY: 0 }));
    // A quick drag: the first move is already past the node, over the pane (or whatever is under it).
    fireEvent.pointerMove(pane, pointer({ clientX: 1, clientY: 1 }));
    expect(asked).toEqual([]); // not yet a drag
    fireEvent.pointerMove(pane, pointer({ clientX: 60, clientY: 40 }));
    expect(asked).toHaveLength(1);
    expect(asked[0]?.el).toBe(el(container, 'a'));
    expect(asked[0]?.id).toBe(1);
  });

  it('then lets the node drag from what it is sent next, from where the press began', () => {
    install();
    const { container } = render(<FlowingerCanvas nodes={three()} nodesDraggable />);
    const pane = container.firstElementChild as Element;
    fireEvent.pointerDown(el(container, 'a'), pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(pane, pointer({ clientX: 60, clientY: 40 }));
    // Captured, so the next move is delivered to the node itself.
    fireEvent.pointerMove(el(container, 'a'), pointer({ clientX: 70, clientY: 45 }));
    expect(at(container, 'a')).toBe('translate(70px, 45px)');
  });

  it('asks once per press, and not for a press that ended before it became a drag', () => {
    install();
    const { container } = render(<FlowingerCanvas nodes={three()} nodesDraggable />);
    const pane = container.firstElementChild as Element;
    fireEvent.pointerDown(el(container, 'a'), pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(pane, pointer({ clientX: 60, clientY: 40 }));
    fireEvent.pointerMove(pane, pointer({ clientX: 80, clientY: 40 }));
    expect(asked).toHaveLength(1);
    fireEvent.pointerUp(pane, pointer({ clientX: 80, clientY: 40 }));

    asked.length = 0;
    fireEvent.pointerDown(el(container, 'a'), pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerUp(el(container, 'a'), pointer({ clientX: 0, clientY: 0 })); // a click
    fireEvent.pointerMove(pane, pointer({ clientX: 200, clientY: 200 })); // a later, unrelated move
    expect(asked).toEqual([]);
  });

  it('ignores another pointer, and a node that cannot be dragged', () => {
    install();
    const { container, rerender } = render(<FlowingerCanvas nodes={three()} nodesDraggable />);
    const pane = container.firstElementChild as Element;
    fireEvent.pointerDown(el(container, 'a'), pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(pane, { pointerId: 2, button: 0, clientX: 90, clientY: 90 });
    expect(asked).toEqual([]);
    fireEvent.pointerUp(pane, pointer({ clientX: 0, clientY: 0 }));

    rerender(<FlowingerCanvas nodes={three()} />);
    fireEvent.pointerDown(el(container, 'a'), pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(pane, pointer({ clientX: 90, clientY: 90 }));
    // The press pans the canvas instead, so the canvas takes the pointer — never the node.
    expect(asked.some((a) => a.el === el(container, 'a'))).toBe(false);
  });

  it('stops watching when the node goes away', () => {
    install();
    const { container, unmount } = render(<FlowingerCanvas nodes={three()} nodesDraggable />);
    const pane = container.firstElementChild as Element;
    fireEvent.pointerDown(el(container, 'a'), pointer({ clientX: 0, clientY: 0 }));
    unmount();
    fireEvent.pointerMove(document.body, pointer({ clientX: 90, clientY: 90 }));
    void pane;
    expect(asked).toEqual([]);
  });
});

describe('dragHandle', () => {
  function Grip() {
    return (
      <div>
        <span data-testid="grip" className="grip">
          ::
        </span>
        <span data-testid="body">body</span>
      </div>
    );
  }
  const nodes: Node[] = [{ id: 'a', type: 'grip', position: { x: 0, y: 0 }, data: {}, dragHandle: '.grip' }];

  it('drags by the handle only', () => {
    const { container, getByTestId } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={{ grip: Grip }} nodesDraggable />,
    );
    const press = (target: Element) => {
      fireEvent.pointerDown(target, pointer({ clientX: 0, clientY: 0 }));
      fireEvent.pointerMove(target, pointer({ clientX: 30, clientY: 20 }));
      fireEvent.pointerUp(target, pointer({ clientX: 30, clientY: 20 }));
    };
    press(getByTestId('body'));
    expect(at(container, 'a')).toBe('translate(0px, 0px)');
    press(getByTestId('grip'));
    expect(at(container, 'a')).toBe('translate(30px, 20px)');
  });

  it('lets a press elsewhere on the node pan the canvas instead', () => {
    const { container, getByTestId } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={{ grip: Grip }} nodesDraggable />,
    );
    const body = getByTestId('body');
    fireEvent.pointerDown(body, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(body, pointer({ clientX: 30, clientY: 20 }));
    expect(must<HTMLElement>(container, '.flowinger-viewport').style.transform).toBe(
      'translate(30px, 20px) scale(1)',
    );
  });
});

describe('controlled flow: selection', () => {
  it('reports a click as select changes and selects nothing until they are applied', () => {
    const onNodesChange = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={three()} onNodesChange={onNodesChange} elementsSelectable />,
    );
    fireEvent.click(el(container, 'a'));
    expect(onNodesChange).toHaveBeenCalledWith([{ type: 'select', id: 'a', selected: true }]);
    expect(selectedIds(container)).toEqual([]);
  });

  it('selects once the caller applies the change, and moves it on the next click', () => {
    const onSelectionChange = vi.fn();
    const { container } = render(<Controlled elementsSelectable onSelectionChange={onSelectionChange} />);
    fireEvent.click(el(container, 'a'));
    expect(selectedIds(container)).toEqual(['a']);
    expect(el(container, 'a').getAttribute('aria-current')).toBe('true');
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect((onSelectionChange.mock.calls[0]?.[0] as { nodes: Node[] }).nodes.map((n) => n.id)).toEqual(['a']);

    fireEvent.click(el(container, 'b'));
    expect(selectedIds(container)).toEqual(['b']);
    expect(onSelectionChange).toHaveBeenCalledTimes(2);
    fireEvent.click(el(container, 'c'), { shiftKey: true });
    expect(selectedIds(container)).toEqual(['b', 'c']);
  });

  it('takes the selection from `selected` on the nodes, and announces it once', () => {
    const onSelectionChange = vi.fn();
    const nodes = three().map((n) => (n.id === 'b' ? { ...n, selected: true } : n));
    const { container, rerender } = render(
      <FlowingerCanvas nodes={nodes} onNodesChange={() => {}} elementsSelectable onSelectionChange={onSelectionChange} />,
    );
    expect(selectedIds(container)).toEqual(['b']);
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect((onSelectionChange.mock.calls[0]?.[0] as { nodes: Node[] }).nodes.map((n) => n.id)).toEqual(['b']);

    // A re-render with the same selection says nothing more; a different one does.
    rerender(
      <FlowingerCanvas nodes={[...nodes]} onNodesChange={() => {}} elementsSelectable onSelectionChange={onSelectionChange} />,
    );
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    rerender(
      <FlowingerCanvas
        nodes={three().map((n) => (n.id === 'c' ? { ...n, selected: true } : n))}
        onNodesChange={() => {}}
        elementsSelectable
        onSelectionChange={onSelectionChange}
      />,
    );
    expect(selectedIds(container)).toEqual(['c']);
    expect(onSelectionChange).toHaveBeenCalledTimes(2);
  });

  it('still selects on its own when the nodes are not controlled', () => {
    const { container } = render(<FlowingerCanvas nodes={three()} elementsSelectable />);
    fireEvent.click(el(container, 'a'));
    expect(selectedIds(container)).toEqual(['a']);
  });

  it('clears a controlled selection with a click on the pane', () => {
    const nodes = three().map((n) => (n.id === 'a' ? { ...n, selected: true } : n));
    const onNodesChange = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} onNodesChange={onNodesChange} elementsSelectable />,
    );
    fireEvent.click(container.firstElementChild as Element);
    expect(onNodesChange).toHaveBeenCalledWith([{ type: 'select', id: 'a', selected: false }]);
  });
});

describe('defaultNodes: the canvas owns the state', () => {
  it('renders without a nodes prop, drags, and selects', () => {
    const onNodesChange = vi.fn();
    const { container } = render(
      <FlowingerCanvas defaultNodes={three()} onNodesChange={onNodesChange} nodesDraggable elementsSelectable />,
    );
    drag(container, 'a', 30, 20);
    expect(at(container, 'a')).toBe('translate(30px, 20px)');
    expect(onNodesChange).toHaveBeenCalled(); // still told, though it owns nothing
    fireEvent.click(el(container, 'b'));
    expect(selectedIds(container)).toEqual(['b']);
  });

  it('starts from defaultNodes only: a later change to the prop is not adopted', () => {
    const { container, rerender } = render(<FlowingerCanvas defaultNodes={three()} />);
    rerender(<FlowingerCanvas defaultNodes={[{ id: 'z', position: { x: 0, y: 0 }, data: {} }]} />);
    expect(container.querySelector('[data-id="z"]')).toBeNull();
    expect(container.querySelector('[data-id="a"]')).not.toBeNull();
  });
});

describe('controlled flow: measuring', () => {
  const stubSize = () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40);
  };

  it('reports every node’s size once — including the first measurement, taken before the callback is registered', () => {
    stubSize();
    const onNodesChange = vi.fn();
    render(<FlowingerCanvas nodes={three()} onNodesChange={onNodesChange} />);
    const dims = (onNodesChange.mock.calls as NodeChange[][][]).flat(2).filter((c) => c.type === 'dimensions');
    expect(dims).toEqual(
      ['a', 'b', 'c'].map((id) => ({ type: 'dimensions', id, dimensions: { width: 100, height: 40 } })),
    );
  });

  it('writes the size back as `measured` and then stops: no change loop', () => {
    stubSize();
    const onChange = vi.fn();
    let latest: Node[] = [];
    function Probe() {
      const [nodes, , onNodesChange] = useNodesState(three());
      latest = nodes;
      return (
        <FlowingerCanvas
          nodes={nodes}
          onNodesChange={(c) => {
            onChange(c);
            onNodesChange(c);
          }}
        />
      );
    }
    render(<Probe />);
    expect(latest.map((n) => n.measured)).toEqual(Array(3).fill({ width: 100, height: 40 }));
    // One report per node, in however many batches — and nothing after they were applied.
    expect((onChange.mock.calls as NodeChange[][][]).flat(2)).toHaveLength(3);
  });

  it('does not repeat itself to a caller that ignores the changes', () => {
    stubSize();
    const onNodesChange = vi.fn();
    const { rerender } = render(<FlowingerCanvas nodes={three()} onNodesChange={onNodesChange} />);
    const heard = (onNodesChange.mock.calls as NodeChange[][][]).flat(2).length;
    expect(heard).toBe(3);
    // A fresh array of the same nodes: the sizes are the same and were already reported.
    rerender(<FlowingerCanvas nodes={three()} onNodesChange={onNodesChange} />);
    expect((onNodesChange.mock.calls as NodeChange[][][]).flat(2)).toHaveLength(heard);
  });

  it('does not report a size the node already carries', () => {
    stubSize();
    const onNodesChange = vi.fn();
    const nodes = three().map((n) => ({ ...n, measured: { width: 100, height: 40 } }));
    render(<FlowingerCanvas nodes={nodes} onNodesChange={onNodesChange} />);
    expect(onNodesChange).not.toHaveBeenCalled();
  });

  it('does not report sizes to an uncontrolled canvas', () => {
    stubSize();
    const nodes = three();
    render(<FlowingerCanvas nodes={nodes} />);
    expect(nodes.every((n) => n.measured === undefined)).toBe(true);
  });
});

describe('useNodesInitialized', () => {
  function Probe({ nodes }: { nodes: Node[] }) {
    return (
      <FlowingerCanvas nodes={nodes}>
        <Flag />
      </FlowingerCanvas>
    );
  }
  function Flag() {
    return <output data-testid="flag">{String(useNodesInitialized())}</output>;
  }

  it('is false until the nodes have a size, then true', () => {
    const { container, rerender } = render(<Probe nodes={three()} />);
    expect(must(container, '[data-testid="flag"]').textContent).toBe('false'); // jsdom measures nothing
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40);
    // A new node is measured as it mounts; the others are measured again on resize, so re-mount the lot.
    rerender(<Probe nodes={three().map((n) => ({ ...n, id: `${n.id}2` }))} />);
    expect(must(container, '[data-testid="flag"]').textContent).toBe('true');
  });

  it('is false for an empty diagram', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    const { container } = render(<Probe nodes={[]} />);
    expect(must(container, '[data-testid="flag"]').textContent).toBe('false');
  });

  it('is false outside a canvas', () => {
    const { container } = render(<Flag />);
    expect(must(container, '[data-testid="flag"]').textContent).toBe('false');
  });

  it('counts a hidden node as initialized without a size', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40);
    // `hidden` nodes are not drawn at all (checkpoint 2), but must not hold `initialized` back.
    const nodes = three().map((n) => (n.id === 'c' ? { ...n, hidden: true } : n));
    const { container } = render(<Probe nodes={nodes} />);
    expect(must(container, '[data-testid="flag"]').textContent).toBe('true');
    act(() => {});
  });
});
