import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import {
  FlowingerCanvas,
  FlowingerProvider,
  Panel,
  SelectionMode,
  type Edge,
  type Node,
} from '../index.ts';

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const node = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
const pane = (c: ParentNode) => c.firstElementChild as HTMLElement;
const viewportOf = (c: ParentNode) => must<HTMLElement>(c, '.flowinger-viewport').style.transform;
const selectedIds = (c: ParentNode) =>
  ['a', 'b', 'c', 'd'].filter((id) => c.querySelector(`[data-id="${id}"]`)?.classList.contains('selected'));

const box = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  width: 100,
  height: 40,
  data: {},
  ...extra,
});
// a: 0–100, b: 200–300, c: 400–500, each 40 high, in a row at y 0.
const row = (): Node[] => [box('a', 0, 0), box('b', 200, 0), box('c', 400, 0)];

/** Drags on the bare pane from one point to another, in as many moves as given. */
function sweep(
  c: ParentNode,
  from: [number, number],
  to: [number, number],
  mods: Record<string, boolean | number> = {},
) {
  fireEvent.pointerDown(pane(c), pointer({ clientX: from[0], clientY: from[1], ...mods }));
  fireEvent.pointerMove(pane(c), pointer({ clientX: to[0], clientY: to[1], ...mods }));
}
const release = (c: ParentNode, at: [number, number], mods: Record<string, boolean | number> = {}) =>
  fireEvent.pointerUp(pane(c), pointer({ clientX: at[0], clientY: at[1], ...mods }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('selection box', () => {
  it('is drawn with Shift held: selects what is wholly inside, shows the box, and is gone on release', () => {
    const onSelectionStart = vi.fn();
    const onSelectionEnd = vi.fn();
    const { container } = render(
      <FlowingerCanvas
        nodes={row()}
        elementsSelectable
        onSelectionStart={onSelectionStart}
        onSelectionEnd={onSelectionEnd}
      />,
    );
    sweep(container, [320, 60], [-10, -10], { shiftKey: true });
    expect(selectedIds(container)).toEqual(['a', 'b']);
    const shown = must<HTMLElement>(container, '.flowinger-selection');
    expect(shown.style.left).toBe('-10px');
    expect(shown.style.top).toBe('-10px');
    expect(shown.style.width).toBe('330px');
    expect(shown.style.height).toBe('70px');
    expect(onSelectionStart).toHaveBeenCalledTimes(1);
    expect(onSelectionEnd).not.toHaveBeenCalled();

    release(container, [-10, -10], { shiftKey: true });
    expect(container.querySelector('.flowinger-selection')).toBeNull();
    expect(selectedIds(container)).toEqual(['a', 'b']);
    expect(onSelectionEnd).toHaveBeenCalledTimes(1);
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1)'); // it did not pan
  });

  it('follows the pointer: shrinking the box gives nodes back', () => {
    const { container } = render(<FlowingerCanvas nodes={row()} elementsSelectable />);
    fireEvent.pointerDown(pane(container), pointer({ clientX: 0, clientY: 60, shiftKey: true }));
    fireEvent.pointerMove(pane(container), pointer({ clientX: 320, clientY: -5, shiftKey: true }));
    expect(selectedIds(container)).toEqual(['a', 'b']);
    fireEvent.pointerMove(pane(container), pointer({ clientX: 120, clientY: -5, shiftKey: true }));
    expect(selectedIds(container)).toEqual(['a']);
  });

  it('does not clear what it selected with the click that ends it', () => {
    const onPaneClick = vi.fn();
    const { container } = render(<FlowingerCanvas nodes={row()} elementsSelectable onPaneClick={onPaneClick} />);
    sweep(container, [320, 60], [-10, -10], { shiftKey: true });
    release(container, [-10, -10], { shiftKey: true });
    fireEvent.click(pane(container));
    expect(selectedIds(container)).toEqual(['a', 'b']);
    expect(onPaneClick).not.toHaveBeenCalled();
    fireEvent.click(pane(container)); // a real click clears
    expect(selectedIds(container)).toEqual([]);
  });

  it('needs the drag to pass the threshold, so a Shift-click is still a click', () => {
    const { container } = render(<FlowingerCanvas nodes={row()} elementsSelectable />);
    sweep(container, [10, 10], [11, 11], { shiftKey: true });
    expect(container.querySelector('.flowinger-selection')).toBeNull();
    release(container, [11, 11], { shiftKey: true });
    expect(selectedIds(container)).toEqual([]);
  });

  it('takes the nodes it touches in partial mode, and only whole ones in full mode', () => {
    const full = render(<FlowingerCanvas nodes={row()} elementsSelectable />);
    sweep(full.container, [450, 60], [350, -10], { shiftKey: true }); // grazes c's left half
    expect(selectedIds(full.container)).toEqual([]);
    full.unmount();

    const partial = render(
      <FlowingerCanvas nodes={row()} elementsSelectable selectionMode={SelectionMode.Partial} />,
    );
    sweep(partial.container, [450, 60], [350, -10], { shiftKey: true });
    expect(selectedIds(partial.container)).toEqual(['c']);
  });

  it('is what a plain drag does with selectionOnDrag — and it no longer pans', () => {
    const { container } = render(<FlowingerCanvas nodes={row()} elementsSelectable selectionOnDrag />);
    sweep(container, [320, 60], [-10, -10]);
    expect(selectedIds(container)).toEqual(['a', 'b']);
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1)');
  });

  it('pans on a plain drag when selectionOnDrag is off', () => {
    const { container } = render(<FlowingerCanvas nodes={row()} elementsSelectable />);
    sweep(container, [100, 100], [160, 130]);
    expect(viewportOf(container)).toBe('translate(60px, 30px) scale(1)');
    expect(selectedIds(container)).toEqual([]);
  });

  it('leaves the other mouse buttons to panning with selectionOnDrag', () => {
    const { container } = render(
      <FlowingerCanvas nodes={row()} elementsSelectable selectionOnDrag panOnDrag={[1]} />,
    );
    fireEvent.pointerDown(pane(container), pointer({ clientX: 100, clientY: 100, button: 1 }));
    fireEvent.pointerMove(pane(container), pointer({ clientX: 140, clientY: 100, button: 1 }));
    expect(viewportOf(container)).toBe('translate(40px, 0px) scale(1)');
    expect(container.querySelector('.flowinger-selection')).toBeNull();
  });

  it('adds to the selection when Ctrl or ⌘ was held at the start', () => {
    const { container } = render(<FlowingerCanvas nodes={row()} elementsSelectable selectionOnDrag />);
    fireEvent.click(node(container, 'c'));
    sweep(container, [150, 60], [-10, -10], { ctrlKey: true });
    expect(selectedIds(container)).toEqual(['a', 'c']);
    release(container, [-10, -10], { ctrlKey: true });
    sweep(container, [150, 60], [-10, -10]); // without it, the selection is replaced
    expect(selectedIds(container)).toEqual(['a']);
  });

  it('selects the edges that lie wholly inside as well, and not the ones that leave', () => {
    const edges: Edge[] = [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'bc', source: 'b', target: 'c' },
    ];
    const { container } = render(<FlowingerCanvas nodes={row()} edges={edges} elementsSelectable selectionOnDrag />);
    sweep(container, [320, 60], [-10, -10]);
    const g = (id: string) => must(container, `[data-testid="rf__edge-${id}"]`);
    expect(g('ab').classList.contains('selected')).toBe(true);
    expect(g('bc').classList.contains('selected')).toBe(false);
  });

  it('works in pane pixels, whatever the viewport', () => {
    const { container } = render(
      <FlowingerProvider initialViewport={{ x: 100, y: 0, zoom: 2 }}>
        {/* d sits below the box on screen (y 100–180) but would be inside it if heights were not scaled. */}
        <FlowingerCanvas nodes={[...row(), box('d', 0, 50)]} elementsSelectable />
      </FlowingerProvider>,
    );
    // At zoom 2 with the pane shifted 100, a fills screen x 100–300 and b 500–700; c starts at 900.
    sweep(container, [90, -5], [710, 90], { shiftKey: true });
    expect(selectedIds(container)).toEqual(['a', 'b']);
  });

  it('is off without elementsSelectable', () => {
    const { container } = render(<FlowingerCanvas nodes={row()} selectionOnDrag />);
    sweep(container, [320, 60], [-10, -10], { shiftKey: true });
    expect(container.querySelector('.flowinger-selection')).toBeNull();
    expect(selectedIds(container)).toEqual([]);
  });

  it('skips hidden nodes and nodes that opt out of selection', () => {
    const nodes = [box('a', 0, 0, { selectable: false }), box('b', 200, 0, { hidden: true }), box('c', 400, 0)];
    const onSelectionChange = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} elementsSelectable selectionOnDrag onSelectionChange={onSelectionChange} />,
    );
    sweep(container, [520, 60], [-10, -10]);
    expect(selectedIds(container)).toEqual(['c']);
    // A hidden node has no element to look at, so ask what was reported.
    const heard = onSelectionChange.mock.calls.at(-1)?.[0] as { nodes: Node[] };
    expect(heard.nodes.map((n) => n.id)).toEqual(['c']);
  });

  it('starts only on the bare pane: a press on a node is the node’s', () => {
    const { container } = render(<FlowingerCanvas nodes={row()} elementsSelectable selectionOnDrag />);
    fireEvent.pointerDown(node(container, 'a'), pointer({ clientX: 50, clientY: 20, shiftKey: true }));
    fireEvent.pointerMove(node(container, 'a'), pointer({ clientX: 150, clientY: 80, shiftKey: true }));
    expect(container.querySelector('.flowinger-selection')).toBeNull();
  });

  it('reports the selection as changes in a controlled flow', () => {
    const onNodesChange = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={row()} onNodesChange={onNodesChange} elementsSelectable selectionOnDrag />,
    );
    onNodesChange.mockClear();
    sweep(container, [150, 60], [-10, -10]);
    expect(onNodesChange).toHaveBeenCalledWith([{ type: 'select', id: 'a', selected: true }]);
  });

  it('leaves the canvas focused, so the delete key reaches it', () => {
    const { container } = render(<FlowingerCanvas nodes={row()} elementsSelectable selectionOnDrag />);
    sweep(container, [150, 60], [-10, -10]);
    release(container, [-10, -10]);
    expect(document.activeElement).toBe(pane(container));
  });
});

describe('panOnScroll', () => {
  const wheel = (c: ParentNode, extra: Record<string, number | boolean>) =>
    fireEvent.wheel(pane(c), { deltaMode: 0, ...extra });

  it('pans with the wheel, half a unit per unit by default, in both axes', () => {
    const { container } = render(<FlowingerCanvas nodes={row()} panOnScroll />);
    wheel(container, { deltaX: 20, deltaY: 100 });
    expect(viewportOf(container)).toBe('translate(-10px, -50px) scale(1)');
  });

  it('takes its speed from panOnScrollSpeed', () => {
    const { container } = render(<FlowingerCanvas nodes={row()} panOnScroll panOnScrollSpeed={1} />);
    wheel(container, { deltaX: 0, deltaY: 30 });
    expect(viewportOf(container)).toBe('translate(0px, -30px) scale(1)');
  });

  it('still zooms with Ctrl (a trackpad pinch) or ⌘', () => {
    const { container } = render(<FlowingerCanvas nodes={row()} panOnScroll />);
    wheel(container, { deltaY: -100, ctrlKey: true });
    const zoomed = viewportOf(container);
    expect(zoomed).not.toContain('scale(1)');
    expect(zoomed).toMatch(/scale\(2/); // 2 ** 1, before clamping to maxZoom 2
  });

  it('does not zoom at all when zoomOnScroll is off, and lets the page have the event', () => {
    const { container } = render(<FlowingerCanvas nodes={row()} panOnScroll zoomOnScroll={false} />);
    const notPrevented = wheel(container, { deltaY: -100, ctrlKey: true });
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1)');
    expect(notPrevented).toBe(true);
  });

  it('claims the wheel event so the page does not scroll under it', () => {
    const { container } = render(<FlowingerCanvas nodes={row()} panOnScroll />);
    expect(wheel(container, { deltaY: 10 })).toBe(false); // preventDefault was called
  });

  it('zooms as before when it is off', () => {
    const { container } = render(<FlowingerCanvas nodes={row()} />);
    wheel(container, { deltaY: -100 });
    expect(viewportOf(container)).not.toBe('translate(0px, 0px) scale(1)');
    expect(viewportOf(container)).not.toMatch(/translate\(0px, -/); // zoomed, not panned
  });
});

describe('Panel', () => {
  it('sits where it is told, over the diagram', () => {
    const { getByTestId } = render(
      <FlowingerCanvas nodes={row()}>
        <Panel position="bottom-right">
          <span data-testid="p1">hi</span>
        </Panel>
        <Panel position="top-center">
          <span data-testid="p2">mid</span>
        </Panel>
        <Panel>
          <span data-testid="p3">default</span>
        </Panel>
      </FlowingerCanvas>,
    );
    const at = (id: string) => getByTestId(id).parentElement as HTMLElement;
    expect(at('p1').style.bottom).toBe('0px');
    expect(at('p1').style.right).toBe('0px');
    expect(at('p2').style.left).toBe('50%');
    expect(at('p2').style.transform).toBe('translateX(-50%)');
    expect(at('p3').style.top).toBe('0px');
    expect(at('p3').style.left).toBe('0px');
    expect(at('p1').className).toContain('bottom-right');
    expect(at('p1').style.position).toBe('absolute');
  });

  it('takes a press without panning the canvas, and a click without clearing the selection', () => {
    const onPaneClick = vi.fn();
    const { container, getByTestId } = render(
      <FlowingerCanvas nodes={row()} elementsSelectable onPaneClick={onPaneClick}>
        <Panel>
          <span data-testid="p">legend</span>
        </Panel>
      </FlowingerCanvas>,
    );
    fireEvent.click(node(container, 'a'));
    const target = getByTestId('p');
    fireEvent.pointerDown(target, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(target, pointer({ clientX: 80, clientY: 0 }));
    fireEvent.pointerUp(target, pointer({ clientX: 80, clientY: 0 }));
    fireEvent.click(target);
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1)');
    expect(selectedIds(container)).toEqual(['a']);
    expect(onPaneClick).not.toHaveBeenCalled();
  });

  it('does not start a selection box', () => {
    const { container, getByTestId } = render(
      <FlowingerCanvas nodes={row()} elementsSelectable selectionOnDrag>
        <Panel>
          <span data-testid="p">legend</span>
        </Panel>
      </FlowingerCanvas>,
    );
    fireEvent.pointerDown(getByTestId('p'), pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(getByTestId('p'), pointer({ clientX: 100, clientY: 100 }));
    expect(container.querySelector('.flowinger-selection')).toBeNull();
  });
});
