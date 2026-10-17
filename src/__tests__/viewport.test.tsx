import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { getViewportForBounds as reactFlowsFit } from '@xyflow/react';
import { FlowingerContext } from '../context.ts';
import { DEFAULT_ENGINE_OPTIONS, createFlowingerStore } from '../store.ts';
import {
  FlowingerCanvas,
  FlowingerCore,
  FlowingerProvider,
  getViewportForBounds,
  useOnViewportChange,
  viewportForBounds,
  type FlowingerInstance,
  type FlowingerProps,
  type Node,
  type Padding,
  type Viewport,
} from '../index.ts';

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const pane = (c: ParentNode) => must<HTMLElement>(c, '.flowinger');
const viewportOf = (c: ParentNode) => must<HTMLElement>(c, '.flowinger-viewport').style.transform;
const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

const nodes: Node[] = [{ id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} }];

afterEach(() => {
  vi.useRealTimers();
});

/** A canvas that hands back its instance, and records what the view does as `start`, `move` and `end`. */
function watched(props: FlowingerProps = {}) {
  const log: string[] = [];
  const calls: { name: string; event: unknown; viewport: Viewport }[] = [];
  const note = (name: string) => (event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    log.push(name);
    calls.push({ name, event, viewport });
  };
  let instance: FlowingerInstance | undefined;
  const view = render(
    <div style={{ width: 600, height: 400 }}>
      <FlowingerCore
        nodes={nodes}
        onInit={(i) => {
          instance = i;
        }}
        onMoveStart={note('start')}
        onMove={note('move')}
        onMoveEnd={note('end')}
        {...props}
      />
    </div>,
  );
  return {
    ...view,
    log,
    calls,
    instance: () => {
      if (!instance) throw new Error('no instance yet');
      return instance;
    },
  };
}

describe('defaultViewport', () => {
  it('is where the view starts, already in the first render', () => {
    const { container } = render(
      <div style={{ width: 600, height: 400 }}>
        <FlowingerCore nodes={nodes} defaultViewport={{ x: 30, y: 40, zoom: 1.5 }} />
      </div>,
    );
    expect(viewportOf(container)).toBe('translate(30px, 40px) scale(1.5)');
  });

  it('is the whole canvas too', () => {
    const { container } = render(
      <div style={{ width: 600, height: 400 }}>
        <FlowingerCanvas nodes={nodes} defaultViewport={{ x: -20, y: 5, zoom: 0.5 }} />
      </div>,
    );
    expect(viewportOf(container)).toBe('translate(-20px, 5px) scale(0.5)');
  });

  it('moves a caller\'s provider there when the canvas mounts', () => {
    const { container } = render(
      <FlowingerProvider>
        <div style={{ width: 600, height: 400 }}>
          <FlowingerCore nodes={nodes} defaultViewport={{ x: 12, y: 34, zoom: 2 }} />
        </div>
      </FlowingerProvider>,
    );
    expect(viewportOf(container)).toBe('translate(12px, 34px) scale(2)');
  });

  it('is where it starts, not where it is kept: a later value does not pull the view back', () => {
    const { container, rerender, instance } = watched({ defaultViewport: { x: 10, y: 10, zoom: 1 } });
    act(() => {
      void instance().setViewport({ x: 100, y: 100, zoom: 1 });
    });
    rerender(
      <div style={{ width: 600, height: 400 }}>
        <FlowingerCore nodes={nodes} defaultViewport={{ x: 999, y: 999, zoom: 1 }} />
      </div>,
    );
    expect(viewportOf(container)).toBe('translate(100px, 100px) scale(1)');
  });

  it('is in the server\'s markup: the first paint is framed, before any effect has run', () => {
    const html = renderToString(<FlowingerCore nodes={nodes} defaultViewport={{ x: 30, y: 40, zoom: 1.5 }} />);
    expect(html).toContain('translate(30px, 40px) scale(1.5)');
  });

  it.each([
    ['x', { x: 50, y: 0, zoom: 1 }],
    ['y', { x: 0, y: 50, zoom: 1 }],
    ['zoom', { x: 0, y: 0, zoom: 2 }],
  ])('moves a caller\'s provider that differs from it in %s alone', (_axis, want) => {
    const { container } = render(
      <FlowingerProvider>
        <div style={{ width: 600, height: 400 }}>
          <FlowingerCore nodes={nodes} defaultViewport={want} />
        </div>
      </FlowingerProvider>,
    );
    expect(viewportOf(container)).toBe(`translate(${String(want.x)}px, ${String(want.y)}px) scale(${String(want.zoom)})`);
  });

  it('does not move a provider that is there already, so nothing stirs for it', () => {
    const at = { x: 30, y: 40, zoom: 1.5 };
    const store = createFlowingerStore(at);
    const set = vi.spyOn(store.instance, 'setViewport');
    render(
      <FlowingerContext.Provider value={store}>
        <div style={{ width: 600, height: 400 }}>
          <FlowingerCore nodes={nodes} defaultViewport={at} />
        </div>
      </FlowingerContext.Provider>,
    );
    expect(set).not.toHaveBeenCalled();
  });

  it('does not report itself as a move', () => {
    const { log } = watched({ defaultViewport: { x: 10, y: 10, zoom: 1 } });
    expect(log).toEqual([]);
  });
});

describe('onMoveStart, onMove and onMoveEnd', () => {
  it('a call that sets the view is a whole move: start, move, end — with no event', () => {
    const { log, calls, instance } = watched();
    act(() => {
      void instance().setViewport({ x: 10, y: 20, zoom: 1 });
    });
    expect(log).toEqual(['start', 'move', 'end']);
    expect(calls.map((c) => c.event)).toEqual([null, null, null]);
    // Start says where it was; move and end, where it is.
    expect(calls[0]?.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(calls[1]?.viewport).toEqual({ x: 10, y: 20, zoom: 1 });
    expect(calls[2]?.viewport).toEqual({ x: 10, y: 20, zoom: 1 });
  });

  it('two calls are two moves', () => {
    const { log, instance } = watched();
    act(() => {
      void instance().setViewport({ x: 10, y: 0, zoom: 1 });
      void instance().setViewport({ x: 20, y: 0, zoom: 1 });
    });
    expect(log).toEqual(['start', 'move', 'end', 'start', 'move', 'end']);
  });

  it('a pan is one move, ended when the pointer goes up — and it carries the pointer', () => {
    const { container, log, calls } = watched();
    const p = pane(container);
    fireEvent.pointerDown(p, pointer({ clientX: 100, clientY: 100 }));
    expect(log).toEqual([]);
    fireEvent.pointerMove(p, pointer({ clientX: 110, clientY: 100 }));
    fireEvent.pointerMove(p, pointer({ clientX: 120, clientY: 100 }));
    fireEvent.pointerMove(p, pointer({ clientX: 130, clientY: 100 }));
    expect(log).toEqual(['start', 'move', 'move', 'move']);
    fireEvent.pointerUp(p, pointer({ clientX: 130, clientY: 100 }));
    expect(log).toEqual(['start', 'move', 'move', 'move', 'end']);
    expect(calls.every((c) => c.event !== null)).toBe(true);
    // The move that is going on, and the pointer that let go.
    expect((calls[1]?.event as Event).type).toBe('pointermove');
    expect((calls[calls.length - 1]?.event as Event).type).toBe('pointerup');
    expect(calls[calls.length - 1]?.viewport.x).toBe(30);
  });

  it('a pinch is one move too, carrying the pointer that let go', () => {
    const { container, log, calls } = watched();
    const p = pane(container);
    fireEvent.pointerDown(p, pointer({ pointerId: 1, clientX: 100, clientY: 100 }));
    fireEvent.pointerDown(p, pointer({ pointerId: 2, clientX: 200, clientY: 100 }));
    expect(log).toEqual([]);
    fireEvent.pointerMove(p, pointer({ pointerId: 2, clientX: 250, clientY: 100 }));
    fireEvent.pointerMove(p, pointer({ pointerId: 2, clientX: 300, clientY: 100 }));
    expect(log).toEqual(['start', 'move', 'move']);
    expect((calls[1]?.event as Event).type).toBe('pointermove');
    fireEvent.pointerUp(p, pointer({ pointerId: 2, clientX: 300, clientY: 100 }));
    expect(log).toEqual(['start', 'move', 'move', 'end']);
    expect((calls[calls.length - 1]?.event as Event).type).toBe('pointerup');
    // One finger left is not a pinch: nothing more is reported.
    fireEvent.pointerMove(p, pointer({ pointerId: 1, clientX: 150, clientY: 100 }));
    expect(log).toHaveLength(4);
  });

  it('a press that goes nowhere moves nothing', () => {
    const { container, log } = watched();
    const p = pane(container);
    fireEvent.pointerDown(p, pointer({ clientX: 100, clientY: 100 }));
    fireEvent.pointerMove(p, pointer({ clientX: 101, clientY: 100 }));
    fireEvent.pointerUp(p, pointer({ clientX: 101, clientY: 100 }));
    expect(log).toEqual([]);
  });

  it('a second pan is a second move', () => {
    const { container, log } = watched();
    const p = pane(container);
    for (const y of [100, 200]) {
      fireEvent.pointerDown(p, pointer({ clientX: 0, clientY: y }));
      fireEvent.pointerMove(p, pointer({ clientX: 20, clientY: y }));
      fireEvent.pointerUp(p, pointer({ clientX: 20, clientY: y }));
    }
    expect(log.filter((l) => l === 'start')).toHaveLength(2);
    expect(log.filter((l) => l === 'end')).toHaveLength(2);
  });

  it('a run of wheel ticks is one move, ended when the wheel has been still for 150 ms', () => {
    vi.useFakeTimers();
    const { container, log, calls } = watched();
    const p = pane(container);
    fireEvent.wheel(p, { deltaY: -100, clientX: 300, clientY: 200 });
    vi.advanceTimersByTime(100);
    fireEvent.wheel(p, { deltaY: -100, clientX: 300, clientY: 200 });
    vi.advanceTimersByTime(100);
    fireEvent.wheel(p, { deltaY: -100, clientX: 300, clientY: 200 });
    // 100 ms after the last tick: still one move, not yet over.
    vi.advanceTimersByTime(100);
    expect(log).toEqual(['start', 'move', 'move', 'move']);
    vi.advanceTimersByTime(60);
    expect(log).toEqual(['start', 'move', 'move', 'move', 'end']);
    expect(calls[1]?.event).toBeInstanceOf(WheelEvent);
  });

  it('a wheel that does nothing (zoom is at its limit) starts no move', () => {
    vi.useFakeTimers();
    const { container, log } = watched({ minZoom: 1, maxZoom: 1 });
    fireEvent.wheel(pane(container), { deltaY: 100, clientX: 300, clientY: 200 });
    vi.advanceTimersByTime(500);
    expect(log).toEqual([]);
  });

  it('a tween is one move, from its first frame to where it lands', () => {
    vi.useFakeTimers();
    const { log, instance } = watched();
    act(() => {
      void instance().setViewport({ x: 100, y: 0, zoom: 1 }, { duration: 100 });
    });
    // Nothing has moved yet.
    expect(log).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(log[0]).toBe('start');
    expect(log[log.length - 1]).toBe('end');
    expect(log.filter((l) => l === 'start')).toHaveLength(1);
    expect(log.filter((l) => l === 'end')).toHaveLength(1);
    expect(log.indexOf('end')).toBe(log.length - 1);
    expect(instance().getViewport().x).toBe(100);
  });

  it('a tween that a call cuts short ends once, with the call', () => {
    vi.useFakeTimers();
    const { log, instance } = watched();
    act(() => {
      void instance().setViewport({ x: 100, y: 0, zoom: 1 }, { duration: 100 });
      vi.advanceTimersByTime(50);
    });
    act(() => {
      void instance().setViewport({ x: 5, y: 0, zoom: 1 });
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(log.filter((l) => l === 'end')).toHaveLength(1);
    expect(log[log.length - 1]).toBe('end');
    expect(instance().getViewport().x).toBe(5);
  });

  it('a tween that begins within a wheel run holds the move open until it lands, past the wheel\'s quiet', () => {
    vi.useFakeTimers();
    const { container, log, instance } = watched();
    fireEvent.wheel(pane(container), { deltaY: -100, clientX: 300, clientY: 200 });
    act(() => {
      void instance().setViewport({ x: 100, y: 0, zoom: 1 }, { duration: 1000 });
    });
    // The wheel has been quiet for 150 ms, and the tween is still going: not over.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(log).not.toContain('end');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(log.filter((l) => l === 'end')).toHaveLength(1);
    expect(log[log.length - 1]).toBe('end');
  });

  it('leaves no timer behind when the canvas goes with a wheel move still open', () => {
    vi.useFakeTimers();
    const { container, unmount } = watched();
    fireEvent.wheel(pane(container), { deltaY: -100, clientX: 300, clientY: 200 });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('takes the canvas down mid-pan, and says the move is over', () => {
    const { container, unmount, log } = watched();
    const p = pane(container);
    fireEvent.pointerDown(p, pointer({ clientX: 100, clientY: 100 }));
    fireEvent.pointerMove(p, pointer({ clientX: 140, clientY: 100 }));
    expect(log).toEqual(['start', 'move']);
    unmount();
    expect(log).toEqual(['start', 'move', 'end']);
  });

  it('takes the latest handlers, not the ones the canvas mounted with', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, instance } = watched({ onMove: first });
    rerender(
      <div style={{ width: 600, height: 400 }}>
        <FlowingerCore nodes={nodes} onMove={second} />
      </div>,
    );
    act(() => {
      void instance().setViewport({ x: 1, y: 1, zoom: 1 });
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('useOnViewportChange', () => {
  function Listener({ log, tag = '' }: { log: string[]; tag?: string }) {
    useOnViewportChange({
      onStart: (vp) => log.push(`${tag}start ${String(vp.x)}`),
      onChange: (vp) => log.push(`${tag}change ${String(vp.x)}`),
      onEnd: (vp) => log.push(`${tag}end ${String(vp.x)}`),
    });
    return null;
  }

  it('hears the same moves, with the viewport and no event', () => {
    const log: string[] = [];
    let instance: FlowingerInstance | undefined;
    render(
      <FlowingerProvider>
        <Listener log={log} />
        <div style={{ width: 600, height: 400 }}>
          <FlowingerCore nodes={nodes} onInit={(i) => (instance = i)} />
        </div>
      </FlowingerProvider>,
    );
    act(() => {
      void instance?.setViewport({ x: 7, y: 0, zoom: 1 });
    });
    expect(log).toEqual(['start 0', 'change 7', 'end 7']);
  });

  it('is heard alongside the canvas\'s own props, and by each listener', () => {
    const log: string[] = [];
    const onMove = vi.fn();
    let instance: FlowingerInstance | undefined;
    render(
      <FlowingerProvider>
        <Listener log={log} tag="a:" />
        <Listener log={log} tag="b:" />
        <div style={{ width: 600, height: 400 }}>
          <FlowingerCore nodes={nodes} onMove={onMove} onInit={(i) => (instance = i)} />
        </div>
      </FlowingerProvider>,
    );
    act(() => {
      void instance?.setViewport({ x: 3, y: 0, zoom: 1 });
    });
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(log.filter((l) => l.startsWith('a:'))).toEqual(['a:start 0', 'a:change 3', 'a:end 3']);
    expect(log.filter((l) => l.startsWith('b:'))).toEqual(['b:start 0', 'b:change 3', 'b:end 3']);
  });

  it('stops hearing when the component goes', () => {
    const log: string[] = [];
    let instance: FlowingerInstance | undefined;
    const tree = (listening: boolean) => (
      <FlowingerProvider>
        {listening && <Listener log={log} />}
        <div style={{ width: 600, height: 400 }}>
          <FlowingerCore nodes={nodes} onInit={(i) => (instance = i)} />
        </div>
      </FlowingerProvider>
    );
    const { rerender } = render(tree(true));
    rerender(tree(false));
    act(() => {
      void instance?.setViewport({ x: 9, y: 0, zoom: 1 });
    });
    expect(log).toEqual([]);
  });

  it('uses the handler it has now', () => {
    const first: string[] = [];
    const second: string[] = [];
    let instance: FlowingerInstance | undefined;
    const tree = (log: string[]) => (
      <FlowingerProvider>
        <Listener log={log} />
        <div style={{ width: 600, height: 400 }}>
          <FlowingerCore nodes={nodes} onInit={(i) => (instance = i)} />
        </div>
      </FlowingerProvider>
    );
    const { rerender } = render(tree(first));
    rerender(tree(second));
    act(() => {
      void instance?.setViewport({ x: 4, y: 0, zoom: 1 });
    });
    expect(first).toEqual([]);
    expect(second).toEqual(['start 0', 'change 4', 'end 4']);
  });
});

describe('nowheel', () => {
  const wheelOn = (target: Element) =>
    // `fireEvent` says whether the event went uncancelled.
    fireEvent.wheel(target, { deltaY: -100, clientX: 300, clientY: 200 });

  const Scroller = () => (
    <div className="nowheel" data-testid="scroller">
      <span data-testid="inside">lots of text</span>
    </div>
  );

  it('lets the wheel through to what scrolls for itself, and does not zoom', () => {
    const { container, getByTestId } = render(
      <div style={{ width: 600, height: 400 }}>
        <FlowingerCore
          nodes={[{ id: 'a', type: 'scroller', position: { x: 0, y: 0 }, data: {} }]}
          nodeTypes={{ scroller: Scroller }}
        />
      </div>,
    );
    const before = viewportOf(container);
    expect(wheelOn(getByTestId('scroller'))).toBe(true);
    // Also from a child of it, which is where a real wheel lands.
    expect(wheelOn(getByTestId('inside'))).toBe(true);
    expect(viewportOf(container)).toBe(before);
  });

  it('zooms as before everywhere else', () => {
    const { container } = render(
      <div style={{ width: 600, height: 400 }}>
        <FlowingerCore nodes={nodes} />
      </div>,
    );
    const before = viewportOf(container);
    expect(wheelOn(pane(container))).toBe(false);
    expect(viewportOf(container)).not.toBe(before);
  });

  it('holds for panning by the wheel as well', () => {
    const { container, getByTestId } = render(
      <div style={{ width: 600, height: 400 }}>
        <FlowingerCore
          panOnScroll
          nodes={[{ id: 'a', type: 'scroller', position: { x: 0, y: 0 }, data: {} }]}
          nodeTypes={{ scroller: Scroller }}
        />
      </div>,
    );
    const before = viewportOf(container);
    expect(wheelOn(getByTestId('scroller'))).toBe(true);
    expect(viewportOf(container)).toBe(before);
  });
});

describe('getViewportForBounds', () => {
  const boundsList = [
    { x: 0, y: 0, width: 100, height: 40 },
    { x: -250, y: 80, width: 900, height: 600 },
    { x: 10, y: 10, width: 5, height: 500 },
    { x: 1000, y: -1000, width: 333, height: 777 },
  ];
  const panes: [number, number][] = [
    [800, 600],
    [1024, 768],
    [375, 812],
    [1920, 400],
  ];

  it('is React Flow\'s own, for the padding they share: same view, over a grid of inputs', () => {
    for (const bounds of boundsList) {
      for (const [w, h] of panes) {
        for (const padding of [0, 0.1, 0.25, 0.5]) {
          const ours = getViewportForBounds(bounds, w, h, 0.05, 2, padding);
          const theirs = reactFlowsFit(bounds, w, h, 0.05, 2, padding);
          expect(ours.zoom, `zoom ${JSON.stringify({ bounds, w, h, padding })}`).toBeCloseTo(theirs.zoom, 9);
          expect(ours.x, `x ${JSON.stringify({ bounds, w, h, padding })}`).toBeCloseTo(theirs.x, 6);
          expect(ours.y, `y ${JSON.stringify({ bounds, w, h, padding })}`).toBeCloseTo(theirs.y, 6);
        }
      }
    }
  });

  it('is React Flow\'s exactly on a case where left and right underflow by different amounts', () => {
    const bounds = { x: 41, y: 10, width: 85, height: 80 };
    const ours = getViewportForBounds(bounds, 200, 600, 0.05, 2, 0.33);
    const theirs = reactFlowsFit(bounds, 200, 600, 0.05, 2, 0.33);
    expect(ours.x).toBeCloseTo(theirs.x, 9);
    expect(ours.y).toBeCloseTo(theirs.y, 9);
    expect(ours.zoom).toBeCloseTo(theirs.zoom, 9);
  });

  it('respects the zoom limits as they do', () => {
    const tiny = { x: 0, y: 0, width: 2, height: 2 };
    expect(getViewportForBounds(tiny, 800, 600, 0.05, 2, 0.1).zoom).toBe(2);
    expect(reactFlowsFit(tiny, 800, 600, 0.05, 2, 0.1).zoom).toBe(2);
    const huge = { x: 0, y: 0, width: 1e6, height: 1e6 };
    expect(getViewportForBounds(huge, 800, 600, 0.5, 2, 0.1).zoom).toBe(0.5);
    expect(reactFlowsFit(huge, 800, 600, 0.5, 2, 0.1).zoom).toBe(0.5);
  });

  it('leaves no margin when given no padding, unlike viewportForBounds, which leaves 40 px', () => {
    const bounds = { x: 0, y: 0, width: 800, height: 600 };
    expect(getViewportForBounds(bounds, 800, 600, 0.05, 2).zoom).toBe(1);
    expect(reactFlowsFit(bounds, 800, 600, 0.05, 2, 0).zoom).toBe(1);
  });

  // The forms of a margin that mean the same in React Flow 12 and 13 — and in flowinger 1.x and 2.0.
  const unitPaddings: Padding[] = [
    '20px',
    '5%',
    '0px',
    '12.5%',
    { top: '10px', bottom: '30px', x: '5%' },
    { left: '50px', right: '2%', y: '25px' },
    { top: '40px' },
    { x: 0.1, y: '15px' },
  ];

  it("is React Flow's own for margins in pixels, in percent and per side", () => {
    for (const bounds of boundsList) {
      for (const [w, h] of panes) {
        for (const padding of unitPaddings) {
          const ours = getViewportForBounds(bounds, w, h, 0.05, 2, padding);
          const theirs = reactFlowsFit(bounds, w, h, 0.05, 2, padding);
          const at = JSON.stringify({ bounds, w, h, padding });
          expect(ours.zoom, `zoom ${at}`).toBeCloseTo(theirs.zoom, 9);
          expect(ours.x, `x ${at}`).toBeCloseTo(theirs.x, 6);
          expect(ours.y, `y ${at}`).toBeCloseTo(theirs.y, 6);
        }
      }
    }
  });

  it('is what viewportForBounds gives for a margin with a unit, and what a fit uses', async () => {
    const bounds = { x: -250, y: 80, width: 900, height: 600 };
    expect(viewportForBounds(bounds, 800, 600, 0.05, 2, '5%')).toEqual(getViewportForBounds(bounds, 800, 600, 0.05, 2, '5%'));
    const store = createFlowingerStore();
    const pane = document.createElement('div');
    Object.defineProperty(pane, 'clientWidth', { value: 800 });
    Object.defineProperty(pane, 'clientHeight', { value: 600 });
    store.attach(document.createElement('div'), pane);
    store.setOptions(DEFAULT_ENGINE_OPTIONS);
    store.setNodes([{ id: 'a', position: { x: 0, y: 0 }, width: 4000, height: 40, data: {} }]);
    await store.instance.fitView({ duration: 0, padding: '50px' });
    // 50 px a side: (800 - 100) / 4000.
    expect(store.instance.getViewport().zoom).toBeCloseTo(700 / 4000, 9);
    await store.instance.fitView({ duration: 0, padding: { left: '100px', right: '0px' } });
    expect(store.instance.getViewport().zoom).toBeCloseTo(700 / 4000, 9);
    expect(store.instance.getViewport().x).toBeCloseTo(100, 6);
  });
});
