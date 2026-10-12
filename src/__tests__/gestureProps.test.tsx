import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { FlowingerCanvas, FlowingerCore, type FlowingerProps, type Node, type NodeProps } from '../index.ts';

// The gesture props that were accepted and ignored: what they say is now what happens. Each is compared
// with React Flow's own behaviour, read from its source (`@xyflow/system`'s XYPanZoom and XYDrag).

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const pane = (c: ParentNode) => must<HTMLElement>(c, '.flowinger');
const viewportOf = (c: ParentNode) => must<HTMLElement>(c, '.flowinger-viewport').style.transform;
const zoomOf = (c: ParentNode) => Number(/scale\(([-\d.e]+)\)/.exec(viewportOf(c))?.[1]);
const translateOf = (c: ParentNode) => {
  const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(viewportOf(c));
  return { x: Number(m?.[1]), y: Number(m?.[2]) };
};
const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

const nodes: Node[] = [
  { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
  { id: 'b', position: { x: 300, y: 100 }, width: 100, height: 40, data: {} },
];

afterEach(() => {
  vi.restoreAllMocks();
});

const wheel = (el: Element, extra: Record<string, number | boolean>) =>
  // `fireEvent` says whether the event went uncancelled: false means preventDefault was called.
  fireEvent.wheel(el, { deltaMode: 0, clientX: 300, clientY: 200, ...extra });

describe('zoomActivationKeyCode', () => {
  it('makes the held key zoom the wheel even where zoomOnScroll is off', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes} zoomOnScroll={false} zoomActivationKeyCode="Shift" />,
    );
    // Without the key: the page has the wheel.
    expect(wheel(pane(container), { deltaY: -100 })).toBe(true);
    expect(zoomOf(container)).toBe(1);
    // With it: the canvas does.
    expect(wheel(pane(container), { deltaY: -100, shiftKey: true })).toBe(false);
    expect(zoomOf(container)).toBeGreaterThan(1);
  });

  it('turns a panning wheel into a zooming one while it is held', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} panOnScroll zoomActivationKeyCode="Alt" />);
    wheel(pane(container), { deltaY: 40 });
    expect(zoomOf(container)).toBe(1);
    expect(translateOf(container).y).toBeLessThan(0); // panned
    wheel(pane(container), { deltaY: -100, altKey: true });
    expect(zoomOf(container)).toBeGreaterThan(1);
  });

  it('with a key given, Control no longer chooses between panning and zooming', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} panOnScroll zoomActivationKeyCode="Alt" />);
    // Control + wheel is a trackpad pinch: that still zooms (zoomOnPinch), as in React Flow.
    wheel(pane(container), { deltaY: -100, ctrlKey: true });
    expect(zoomOf(container)).toBeGreaterThan(1);
  });

  it('takes a plain key too, tracked while it is down', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} zoomOnScroll={false} zoomActivationKeyCode="z" />);
    expect(wheel(pane(container), { deltaY: -100 })).toBe(true);
    act(() => {
      fireEvent.keyDown(window, { key: 'z', code: 'KeyZ' });
    });
    expect(wheel(pane(container), { deltaY: -100 })).toBe(false);
    expect(zoomOf(container)).toBeGreaterThan(1);
    const zoomed = zoomOf(container);
    act(() => {
      fireEvent.keyUp(window, { key: 'z', code: 'KeyZ' });
    });
    expect(wheel(pane(container), { deltaY: -100 })).toBe(true);
    expect(zoomOf(container)).toBe(zoomed);
  });

  it('is not needed for the old behaviour: with no key given, zoomOnScroll off still means no zoom', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} zoomOnScroll={false} />);
    expect(wheel(pane(container), { deltaY: -100, ctrlKey: true })).toBe(true);
    expect(zoomOf(container)).toBe(1);
  });
});

describe('panOnScrollMode', () => {
  const panned = (mode: 'free' | 'vertical' | 'horizontal', extra: Record<string, number | boolean>) => {
    const { container } = render(<FlowingerCanvas nodes={nodes} panOnScroll panOnScrollMode={mode} />);
    wheel(pane(container), extra);
    return translateOf(container);
  };

  it('is free by default: both axes', () => {
    expect(panned('free', { deltaX: 20, deltaY: 100 })).toEqual({ x: -10, y: -50 });
  });

  it('vertical keeps only the vertical part of the wheel', () => {
    expect(panned('vertical', { deltaX: 20, deltaY: 100 })).toEqual({ x: 0, y: -50 });
  });

  it('horizontal keeps only the horizontal part', () => {
    expect(panned('horizontal', { deltaX: 20, deltaY: 100 })).toEqual({ x: -10, y: 0 });
  });

  it('Shift turns a vertical wheel sideways, as in React Flow, except in vertical mode', () => {
    expect(panned('free', { deltaX: 0, deltaY: 100, shiftKey: true })).toEqual({ x: -50, y: 0 });
    expect(panned('horizontal', { deltaX: 0, deltaY: 100, shiftKey: true })).toEqual({ x: -50, y: 0 });
    expect(panned('vertical', { deltaX: 0, deltaY: 100, shiftKey: true })).toEqual({ x: 0, y: -50 });
  });
});

describe('preventScrolling', () => {
  it('is on by default: the wheel over the canvas is the canvas\'s', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} />);
    expect(wheel(pane(container), { deltaY: -100 })).toBe(false);
    expect(zoomOf(container)).toBeGreaterThan(1);
  });

  it('off, a plain wheel is left to the page and does not zoom', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} preventScrolling={false} />);
    expect(wheel(pane(container), { deltaY: -100 })).toBe(true);
    expect(zoomOf(container)).toBe(1);
  });

  it('off, a pinch (Control + wheel) still zooms', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} preventScrolling={false} />);
    expect(wheel(pane(container), { deltaY: -100, ctrlKey: true })).toBe(false);
    expect(zoomOf(container)).toBeGreaterThan(1);
  });

  it('is about zooming: a wheel that pans is still the canvas\'s', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} panOnScroll preventScrolling={false} />);
    expect(wheel(pane(container), { deltaY: 100 })).toBe(false);
    expect(translateOf(container).y).toBeLessThan(0);
  });
});

describe('noWheelClassName, noPanClassName, noDragClassName', () => {
  function Content({ data }: NodeProps) {
    return (
      <div>
        <span data-testid="inner" className={String(data.cls)}>
          text
        </span>
      </div>
    );
  }
  const inNode = (cls: string, extra: Partial<FlowingerProps> = {}, id = 'a') =>
    render(
      <div style={{ width: 600, height: 400 }}>
        <FlowingerCanvas
          nodes={[{ id, type: 'c', position: { x: 0, y: 0 }, width: 100, height: 40, data: { cls } }]}
          nodeTypes={{ c: Content }}
          nodesDraggable
          {...extra}
        />
      </div>,
    );

  it('noWheelClassName: the wheel goes through an element with your class, and `nowheel` still works', () => {
    const own = inNode('quiet', { noWheelClassName: 'quiet' });
    expect(wheel(must(own.container, '[data-testid="inner"]'), { deltaY: -100 })).toBe(true);
    expect(zoomOf(own.container)).toBe(1);
    own.unmount();
    const builtIn = inNode('nowheel', { noWheelClassName: 'quiet' });
    expect(wheel(must(builtIn.container, '[data-testid="inner"]'), { deltaY: -100 })).toBe(true);
  });

  it('noPanClassName: a press on it does not pan the canvas', () => {
    const { container } = inNode('stay', { noPanClassName: 'stay', nodesDraggable: false });
    const inner = must(container, '[data-testid="inner"]');
    // Not draggable here, so the only thing it could do is pan.
    const before = viewportOf(container);
    fireEvent.pointerDown(pane(container), pointer({ clientX: 300, clientY: 300 }));
    fireEvent.pointerMove(pane(container), pointer({ clientX: 340, clientY: 330 }));
    fireEvent.pointerUp(pane(container), pointer({ clientX: 340, clientY: 330 }));
    expect(viewportOf(container)).not.toBe(before); // the bare pane still pans

    const during = viewportOf(container);
    fireEvent.pointerDown(inner, pointer({ clientX: 10, clientY: 10 }));
    fireEvent.pointerMove(inner, pointer({ clientX: 60, clientY: 60 }));
    fireEvent.pointerUp(inner, pointer({ clientX: 60, clientY: 60 }));
    expect(viewportOf(container)).toBe(during);
  });

  it('noDragClassName: a press on it does not drag the node', () => {
    const onNodeDragStart = vi.fn();
    const { container } = inNode('keep', { noDragClassName: 'keep', onNodeDragStart });
    const inner = must(container, '[data-testid="inner"]');
    fireEvent.pointerDown(inner, pointer({ clientX: 10, clientY: 10 }));
    fireEvent.pointerMove(inner, pointer({ clientX: 60, clientY: 60 }));
    fireEvent.pointerUp(inner, pointer({ clientX: 60, clientY: 60 }));
    expect(onNodeDragStart).not.toHaveBeenCalled();

    // A press on the node itself still drags.
    const node = must(container, '[data-id="a"]');
    fireEvent.pointerDown(node, pointer({ clientX: 10, clientY: 10 }));
    fireEvent.pointerMove(node, pointer({ clientX: 60, clientY: 60 }));
    fireEvent.pointerUp(node, pointer({ clientX: 60, clientY: 60 }));
    expect(onNodeDragStart).toHaveBeenCalledTimes(1);
  });

  it('noDragClassName and `nodrag` both work', () => {
    const onNodeDragStart = vi.fn();
    const { container } = inNode('nodrag', { noDragClassName: 'keep', onNodeDragStart });
    const inner = must(container, '[data-testid="inner"]');
    fireEvent.pointerDown(inner, pointer({ clientX: 10, clientY: 10 }));
    fireEvent.pointerMove(inner, pointer({ clientX: 60, clientY: 60 }));
    fireEvent.pointerUp(inner, pointer({ clientX: 60, clientY: 60 }));
    expect(onNodeDragStart).not.toHaveBeenCalled();
  });
});

describe('paneClickDistance and nodeClickDistance', () => {
  /** A press at one point, let go at another, then the click the browser would send. */
  const press = (el: Element, from: [number, number], to: [number, number]) => {
    fireEvent.pointerDown(el, pointer({ clientX: from[0], clientY: from[1] }));
    fireEvent.pointerMove(el, pointer({ clientX: to[0], clientY: to[1] }));
    fireEvent.pointerUp(el, pointer({ clientX: to[0], clientY: to[1] }));
    fireEvent.click(el, { clientX: to[0], clientY: to[1] });
  };

  it('paneClickDistance: a press that moved further than that is not a click on the pane', () => {
    const onPaneClick = vi.fn();
    const { container } = render(<FlowingerCanvas nodes={nodes} onPaneClick={onPaneClick} paneClickDistance={0} />);
    press(pane(container), [300, 300], [301, 300]); // a pixel: under the pan threshold, but not nothing
    expect(onPaneClick).not.toHaveBeenCalled();
    press(pane(container), [300, 300], [300, 300]);
    expect(onPaneClick).toHaveBeenCalledTimes(1);
  });

  it('paneClickDistance: up to that far is still a click', () => {
    const onPaneClick = vi.fn();
    const { container } = render(<FlowingerCanvas nodes={nodes} onPaneClick={onPaneClick} paneClickDistance={2} />);
    press(pane(container), [300, 300], [301, 300]);
    expect(onPaneClick).toHaveBeenCalledTimes(1);
  });

  it('paneClickDistance: without it, a small move is a click as before', () => {
    const onPaneClick = vi.fn();
    const { container } = render(<FlowingerCanvas nodes={nodes} onPaneClick={onPaneClick} />);
    press(pane(container), [300, 300], [301, 300]);
    expect(onPaneClick).toHaveBeenCalledTimes(1);
  });

  it('nodeClickDistance: a press that moved further than that is not a click on the node', () => {
    const onNodeClick = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodesDraggable onNodeClick={onNodeClick} nodeClickDistance={0} />,
    );
    const a = must(container, '[data-id="a"]');
    press(a, [10, 10], [11, 10]);
    expect(onNodeClick).not.toHaveBeenCalled();
    press(a, [10, 10], [10, 10]);
    expect(onNodeClick).toHaveBeenCalledTimes(1);
  });

  it('nodeClickDistance: without it, a small move is a click as before', () => {
    const onNodeClick = vi.fn();
    const { container } = render(<FlowingerCanvas nodes={nodes} nodesDraggable onNodeClick={onNodeClick} />);
    press(must(container, '[data-id="a"]'), [10, 10], [11, 10]);
    expect(onNodeClick).toHaveBeenCalledTimes(1);
  });
});

describe('selectNodesOnDrag', () => {
  const drag = (el: Element) => {
    fireEvent.pointerDown(el, pointer({ clientX: 10, clientY: 10 }));
    fireEvent.pointerMove(el, pointer({ clientX: 60, clientY: 60 }));
    fireEvent.pointerUp(el, pointer({ clientX: 60, clientY: 60 }));
  };
  const selected = (c: ParentNode) =>
    [...c.querySelectorAll('.flowinger-node.selected')].map((el) => el.getAttribute('data-id'));

  it('on (the default), dragging an unselected node selects it', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} nodesDraggable elementsSelectable />);
    drag(must(container, '[data-id="a"]'));
    expect(selected(container)).toEqual(['a']);
  });

  it('off, dragging an unselected node moves it without selecting it, and drops what was selected', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodesDraggable elementsSelectable selectNodesOnDrag={false} />,
    );
    fireEvent.click(must(container, '[data-id="b"]'));
    expect(selected(container)).toEqual(['b']);
    drag(must(container, '[data-id="a"]'));
    expect(selected(container)).toEqual([]);
    expect(must<HTMLElement>(container, '[data-id="a"]').style.transform).toBe('translate(50px, 50px)');
  });

  it('off, dragging a selected node still moves it, and the selection with it', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodesDraggable elementsSelectable selectNodesOnDrag={false} />,
    );
    fireEvent.click(must(container, '[data-id="a"]'));
    drag(must(container, '[data-id="a"]'));
    expect(selected(container)).toEqual(['a']);
    expect(must<HTMLElement>(container, '[data-id="a"]').style.transform).toBe('translate(50px, 50px)');
  });

  it('off, a click still selects', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodesDraggable elementsSelectable selectNodesOnDrag={false} />,
    );
    fireEvent.click(must(container, '[data-id="a"]'));
    expect(selected(container)).toEqual(['a']);
  });
});

describe('multiSelectionKeyCode', () => {
  const selected = (c: ParentNode) =>
    [...c.querySelectorAll('.flowinger-node.selected')].map((el) => el.getAttribute('data-id')).sort();
  const clickWith = (c: ParentNode, id: string, mods: Record<string, boolean> = {}) =>
    fireEvent.click(must(c, `[data-id="${id}"]`), mods);

  it('by default Shift, Control and ⌘ all add to the selection', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} elementsSelectable />);
    clickWith(container, 'a');
    clickWith(container, 'b', { shiftKey: true });
    expect(selected(container)).toEqual(['a', 'b']);
  });

  it('given a key, only that key adds', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} elementsSelectable multiSelectionKeyCode="Alt" />);
    clickWith(container, 'a');
    clickWith(container, 'b', { shiftKey: true });
    expect(selected(container)).toEqual(['b']); // Shift is not the key: it replaces
    clickWith(container, 'a', { altKey: true });
    expect(selected(container)).toEqual(['a', 'b']);
  });

  it('null: no key adds', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} elementsSelectable multiSelectionKeyCode={null} />);
    clickWith(container, 'a');
    clickWith(container, 'b', { shiftKey: true, ctrlKey: true });
    expect(selected(container)).toEqual(['b']);
  });
});

describe('selectionKeyCode', () => {
  const sweep = (c: ParentNode, mods: Record<string, boolean>) => {
    fireEvent.pointerDown(pane(c), pointer({ clientX: 290, clientY: 90, ...mods }));
    fireEvent.pointerMove(pane(c), pointer({ clientX: 420, clientY: 160, ...mods }));
    fireEvent.pointerUp(pane(c), pointer({ clientX: 420, clientY: 160, ...mods }));
  };
  const selected = (c: ParentNode) =>
    [...c.querySelectorAll('.flowinger-node.selected')].map((el) => el.getAttribute('data-id'));

  it('Shift draws the box by default', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} elementsSelectable />);
    sweep(container, { shiftKey: true });
    expect(selected(container)).toEqual(['b']);
  });

  it('given a key, that key draws it and Shift pans instead', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} elementsSelectable selectionKeyCode="Alt" />);
    sweep(container, { altKey: true });
    expect(selected(container)).toEqual(['b']);
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1)'); // a box does not pan
    sweep(container, { shiftKey: true });
    expect(viewportOf(container)).not.toBe('translate(0px, 0px) scale(1)'); // Shift is just a pan now
  });

  it('null: no key draws a box (selectionOnDrag still does)', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} elementsSelectable selectionKeyCode={null} />);
    sweep(container, { shiftKey: true });
    expect(selected(container)).toEqual([]);
  });
});

describe('keys the core does not need', () => {
  it('a FlowingerCore ignores the selection key codes it has no feature for, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<FlowingerCore nodes={nodes} selectionKeyCode="Alt" />);
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toContain('selectionKeyCode');
  });
});
