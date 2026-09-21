import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import {
  FlowingerCanvas,
  Handle,
  Position,
  type ConnectionLineProps,
  type FlowingerInstance,
  type Node,
} from '../index.ts';

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const node = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
const view = (c: ParentNode) => {
  const m = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\) scale\(([\d.]+)\)/.exec(
    must<HTMLElement>(c, '.flowinger-viewport').style.transform,
  );
  if (!m) throw new Error('unparseable viewport');
  return { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) };
};
const nodeAt = (c: ParentNode, id: string) => {
  const m = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\)/.exec(node(c, id).style.transform);
  if (!m) throw new Error('unparseable node');
  return { x: Number(m[1]), y: Number(m[2]) };
};
/** Lets `n` animation frames go by. */
const frames = (n: number) => {
  act(() => {
    vi.advanceTimersByTime(n * 16.7);
  });
};

const box = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  width: 100,
  height: 40,
  data: {},
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers();
  // An 800 × 600 pane, whose top-left is the page's.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Presses on `a` and drags it to (x, y) — one move, so the drag is under way. */
function dragTo(c: ParentNode, x: number, y: number, from: [number, number] = [150, 120]) {
  const a = node(c, 'a');
  fireEvent.pointerDown(a, pointer({ clientX: from[0], clientY: from[1] }));
  fireEvent.pointerMove(a, pointer({ clientX: x, clientY: y }));
}

describe('a node dragged in graph space', () => {
  it('stays under the pointer when the view moves during the drag', () => {
    let instance: FlowingerInstance | undefined;
    const { container } = render(
      <FlowingerCanvas
        nodes={[box('a', 100, 100)]}
        nodesDraggable
        autoPanOnNodeDrag={false}
        onInit={(i) => {
          instance = i;
        }}
      />,
    );
    dragTo(container, 250, 220);
    expect(nodeAt(container, 'a')).toEqual({ x: 200, y: 200 }); // +100, +100
    // The view slides 60 px right under the held pointer (a wheel, a programmatic move…).
    act(() => {
      void instance?.setViewport({ x: 60, y: 0, zoom: 1 });
    });
    fireEvent.pointerMove(node(container, 'a'), pointer({ clientX: 250, clientY: 220 }));
    // The pointer has not moved on screen, but it is 60 further left in the graph: so is the node.
    expect(nodeAt(container, 'a')).toEqual({ x: 140, y: 200 });
  });
});

describe('auto-pan while dragging a node', () => {
  it('pans towards the edge the pointer is at, and keeps the node under the pointer', () => {
    const { container } = render(<FlowingerCanvas nodes={[box('a', 100, 100)]} nodesDraggable />);
    dragTo(container, 20, 120); // 20 px from the left edge
    expect(view(container).x).toBe(0);
    frames(10);
    const { x } = view(container);
    expect(x).toBeGreaterThan(50); // content slides right, revealing what is to the left
    // The node's place on screen is fixed: where the pointer put it (100 + (20 - 150) = -30).
    expect(nodeAt(container, 'a').x + x).toBeCloseTo(-30, 5);
  });

  it('pans the other three ways too', () => {
    const cases: [number, number, 'x' | 'y', 1 | -1][] = [
      [780, 300, 'x', -1], // right
      [400, 10, 'y', 1], // top
      [400, 590, 'y', -1], // bottom
    ];
    for (const [px, py, axis, sign] of cases) {
      const { container, unmount } = render(<FlowingerCanvas nodes={[box('a', 100, 100)]} nodesDraggable />);
      dragTo(container, px, py);
      frames(6);
      expect(Math.sign(view(container)[axis])).toBe(sign);
      unmount();
    }
  });

  it('does nothing with the pointer away from the edges — no pan, and no work each frame', () => {
    const onNodeDrag = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={[box('a', 100, 100)]} nodesDraggable onNodeDrag={onNodeDrag} />,
    );
    dragTo(container, 400, 300);
    const started = onNodeDrag.mock.calls.length;
    frames(20);
    expect(view(container)).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(onNodeDrag.mock.calls.length).toBe(started);
  });

  it('goes faster the nearer the edge, at autoPanSpeed at most, and full speed outside the pane', () => {
    const speedAt = (px: number, speed?: number) => {
      const { container, unmount } = render(
        <FlowingerCanvas nodes={[box('a', 100, 100)]} nodesDraggable autoPanSpeed={speed ?? 15} />,
      );
      dragTo(container, px, 300);
      frames(1);
      const x = view(container).x;
      unmount();
      return x;
    };
    const near = speedAt(5);
    const far = speedAt(35);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(speedAt(0)).toBeCloseTo(15, 5); // at the edge: the whole speed
    expect(speedAt(-50)).toBeCloseTo(15, 5); // beyond it: no faster
    expect(speedAt(0, 30)).toBeCloseTo(30, 5); // autoPanSpeed sets it
  });

  it('is off with autoPanOnNodeDrag={false}', () => {
    const { container } = render(
      <FlowingerCanvas nodes={[box('a', 100, 100)]} nodesDraggable autoPanOnNodeDrag={false} />,
    );
    dragTo(container, 5, 120);
    frames(10);
    expect(view(container).x).toBe(0);
  });

  it('keeps reporting the drag while the pointer stands still at the edge', () => {
    const onNodeDrag = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={[box('a', 100, 100)]} nodesDraggable onNodeDrag={onNodeDrag} />,
    );
    dragTo(container, 5, 120);
    const started = onNodeDrag.mock.calls.length;
    frames(5);
    expect(onNodeDrag.mock.calls.length).toBeGreaterThan(started + 3);
    const [, moved] = onNodeDrag.mock.calls.at(-1) as [unknown, Node];
    expect(moved.position.x).toBeLessThan(0); // the node has gone on across the graph
  });

  it('stops when the drag ends', () => {
    const { container } = render(<FlowingerCanvas nodes={[box('a', 100, 100)]} nodesDraggable />);
    dragTo(container, 5, 120);
    frames(3);
    fireEvent.pointerUp(node(container, 'a'), pointer({ clientX: 5, clientY: 120 }));
    const settled = view(container);
    frames(10);
    expect(view(container)).toEqual(settled);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops when the node goes away mid-drag', () => {
    const { container, unmount } = render(<FlowingerCanvas nodes={[box('a', 100, 100)]} nodesDraggable />);
    dragTo(container, 5, 120);
    frames(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start for a press that never became a drag', () => {
    const { container } = render(<FlowingerCanvas nodes={[box('a', 100, 100)]} nodesDraggable />);
    fireEvent.pointerDown(node(container, 'a'), pointer({ clientX: 5, clientY: 120 }));
    frames(10);
    expect(view(container).x).toBe(0);
  });

  it('respects translateExtent: the view does not leave it', () => {
    const { container } = render(
      <FlowingerCanvas
        nodes={[box('a', 100, 100)]}
        nodesDraggable
        translateExtent={[
          [0, 0],
          [800, 600],
        ]}
      />,
    );
    dragTo(container, 5, 120);
    frames(20);
    expect(view(container).x).toBe(0); // already at the extent's left edge
  });

  it('carries a whole selection', () => {
    const { container } = render(
      <FlowingerCanvas nodes={[box('a', 100, 100), box('b', 300, 100)]} nodesDraggable elementsSelectable />,
    );
    fireEvent.click(node(container, 'a'));
    fireEvent.click(node(container, 'b'), { shiftKey: true });
    dragTo(container, 5, 120);
    frames(6);
    const vx = view(container).x;
    expect(nodeAt(container, 'b').x - nodeAt(container, 'a').x).toBe(200); // still 200 apart
    expect(nodeAt(container, 'a').x + vx).toBeCloseTo(100 + (5 - 150), 5);
  });
});

describe('auto-pan timing', () => {
  it('scales each step by the time since the last frame, up to three frames’ worth', async () => {
    const { createFlowingerStore, DEFAULT_ENGINE_OPTIONS } = await import('../store.ts');
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const store = createFlowingerStore();
    const container = document.createElement('div');
    store.attach(document.createElement('div'), container);
    store.setOptions({ ...DEFAULT_ENGINE_OPTIONS, autoPanSpeed: 10 });
    const onPan = vi.fn();
    store.beginAutoPan('node', () => ({ x: 0, y: 300 }), onPan); // at the left edge: full speed
    const frame = (at: number) => {
      const cb = queue.shift();
      cb?.(at);
    };
    const x = () => store.getViewport().x;
    const F = 1000 / 60; // one frame at 60 Hz
    frame(1000);
    expect(x()).toBeCloseTo(10, 6); // the first frame counts as one
    frame(1000 + F);
    expect(x()).toBeCloseTo(20, 6); // a normal frame: one more
    frame(1000 + 4 * F);
    expect(x()).toBeCloseTo(50, 6); // three frames' time since the last: three times as far
    frame(1000 + 40 * F);
    expect(x()).toBeCloseTo(80, 6); // a long stall is capped at three
    expect(onPan).toHaveBeenCalledTimes(4);
  });
});

describe('auto-pan while dragging a connection', () => {
  function Ports() {
    return (
      <div>
        <Handle id="out" type="source" position={Position.Bottom} />
      </div>
    );
  }
  const nodes: Node[] = [{ ...box('a', 100, 100), type: 'ports' }];
  const ui = (extra: Record<string, unknown> = {}) => {
    const seen: ConnectionLineProps[] = [];
    function Line(props: ConnectionLineProps) {
      seen.push(props);
      return null;
    }
    return { seen, element: <FlowingerCanvas nodes={nodes} nodeTypes={{ ports: Ports }} nodesConnectable connectionLineComponent={Line} {...extra} /> };
  };
  const press = (c: ParentNode, x: number, y: number) => {
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
    fireEvent.pointerDown(must(c, '[data-handleid="out"]'), pointer({ clientX: 150, clientY: 140 }));
    fireEvent.pointerMove(window, pointer({ clientX: x, clientY: y }));
  };
  afterEach(() => {
    Reflect.deleteProperty(document, 'elementFromPoint');
  });

  it('pans the view, and carries the line’s free end across the graph with it', () => {
    const { seen, element } = ui();
    const { container } = render(element);
    press(container, 795, 300);
    const before = seen.at(-1)?.toX ?? 0;
    expect(before).toBe(795);
    frames(8);
    expect(view(container).x).toBeLessThan(-50);
    // The pointer has not moved on screen, but the graph under it has.
    expect(seen.at(-1)?.toX).toBeCloseTo(795 - view(container).x, 5);
    expect(seen.at(-1)?.toX).toBeGreaterThan(before + 50);
    expect(seen.at(-1)?.fromX).toBe(150); // the start is where it was, in the graph
  });

  it('stops on release, and is off with autoPanOnConnect={false}', () => {
    const on = ui();
    const first = render(on.element);
    press(first.container, 795, 300);
    frames(3);
    fireEvent.pointerUp(window, pointer({ clientX: 795, clientY: 300 }));
    const settled = view(first.container);
    frames(10);
    expect(view(first.container)).toEqual(settled);
    expect(vi.getTimerCount()).toBe(0);
    first.unmount();

    const off = ui({ autoPanOnConnect: false });
    const second = render(off.element);
    press(second.container, 795, 300);
    frames(10);
    expect(view(second.container).x).toBe(0);
  });

  it('is not started by a node drag setting, and a node drag is not stopped by this one', () => {
    const { container } = render(
      <FlowingerCanvas nodes={[box('a', 100, 100)]} nodesDraggable autoPanOnConnect={false} />,
    );
    dragTo(container, 5, 120);
    frames(5);
    expect(view(container).x).toBeGreaterThan(0);
  });
});
