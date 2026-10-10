import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import {
  FlowingerCanvas,
  FlowingerCore,
  useReactFlow,
  type FlowingerInstance,
  type Node,
  type Viewport,
} from '../index.ts';

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const pointer = (extra: Record<string, number>) => ({ pointerId: 1, button: 0, ...extra });
/** The viewport element's transform, as the browser holds it. */
const shown = (container: ParentNode) => must<HTMLElement>(container, '.flowinger-viewport').style.transform;

const nodes: Node[] = [{ id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} }];
const at = (x: number, y: number, zoom: number): Viewport => ({ x, y, zoom });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a controlled `viewport`', () => {
  it('is drawn as given, from the first paint', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes} viewport={at(40, 30, 1.5)} onViewportChange={() => {}} />,
    );
    expect(shown(container)).toBe('translate(40px, 30px) scale(1.5)');
  });

  it('moves the view when the prop changes, and reports nothing for it', () => {
    const onViewportChange = vi.fn();
    const { container, rerender } = render(
      <FlowingerCanvas nodes={nodes} viewport={at(0, 0, 1)} onViewportChange={onViewportChange} />,
    );
    rerender(<FlowingerCanvas nodes={nodes} viewport={at(-120, 60, 2)} onViewportChange={onViewportChange} />);
    expect(shown(container)).toBe('translate(-120px, 60px) scale(2)');
    expect(onViewportChange).not.toHaveBeenCalled();
  });

  it('asks for a wheel zoom, and holds still until the owner applies it', () => {
    const onViewportChange = vi.fn();
    const { container, rerender } = render(
      <FlowingerCanvas nodes={nodes} viewport={at(0, 0, 1)} onViewportChange={onViewportChange} />,
    );
    fireEvent.wheel(must(container, '.flowinger'), { deltaY: -100, clientX: 200, clientY: 100 });

    expect(shown(container)).toBe('translate(0px, 0px) scale(1)'); // not moved by itself
    expect(onViewportChange).toHaveBeenCalledTimes(1);
    const asked = onViewportChange.mock.calls[0]![0] as Viewport;
    expect(asked.zoom).toBeCloseTo(2 ** 0.2);
    // About the cursor: the graph point under it stays under it.
    expect((200 - asked.x) / asked.zoom).toBeCloseTo(200);
    expect((100 - asked.y) / asked.zoom).toBeCloseTo(100);

    rerender(<FlowingerCanvas nodes={nodes} viewport={asked} onViewportChange={onViewportChange} />);
    expect(shown(container)).toBe(`translate(${String(asked.x)}px, ${String(asked.y)}px) scale(${String(asked.zoom)})`);
    expect(onViewportChange).toHaveBeenCalledTimes(1); // applying it was not another request
  });

  it('asks for a pan, move by move', () => {
    const onViewportChange = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} viewport={at(10, 10, 1)} onViewportChange={onViewportChange} />,
    );
    const pane = must(container, '.flowinger');
    fireEvent.pointerDown(pane, pointer({ clientX: 100, clientY: 100 }));
    fireEvent.pointerMove(pane, pointer({ clientX: 140, clientY: 125 }));
    expect(shown(container)).toBe('translate(10px, 10px) scale(1)');
    expect(onViewportChange).toHaveBeenLastCalledWith({ x: 50, y: 35, zoom: 1 });
  });

  it('asks for what the instance does too — a zoom button, setViewport, fitView', async () => {
    let flow: FlowingerInstance | undefined;
    const onViewportChange = vi.fn();
    render(
      <FlowingerCanvas
        nodes={nodes}
        viewport={at(0, 0, 1)}
        onViewportChange={onViewportChange}
        onInit={(i) => {
          flow = i;
        }}
      />,
    );
    await act(async () => {
      await flow?.setViewport({ x: 5, y: 6, zoom: 1.25 });
    });
    expect(onViewportChange).toHaveBeenLastCalledWith({ x: 5, y: 6, zoom: 1.25 });
    expect(flow?.getViewport()).toEqual(at(0, 0, 1));
  });

  it('is not moved by an owner that declines: a second wheel tick asks from the held view, not the first ask', () => {
    const onViewportChange = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} viewport={at(0, 0, 1)} onViewportChange={onViewportChange} />,
    );
    const pane = must(container, '.flowinger');
    fireEvent.wheel(pane, { deltaY: -100, clientX: 0, clientY: 0 });
    fireEvent.wheel(pane, { deltaY: -100, clientX: 0, clientY: 0 });
    // Both are asked of the view as it is held. Had the first been remembered, the second would be 2**0.4.
    expect(onViewportChange).toHaveBeenCalledTimes(2);
    expect((onViewportChange.mock.calls[1]![0] as Viewport).zoom).toBeCloseTo(2 ** 0.2);
    expect(shown(container)).toBe('translate(0px, 0px) scale(1)');
  });

  it('works as a state: pan, zoom and the zoom buttons all land, with the owner applying what is asked', () => {
    let flow: FlowingerInstance | undefined;
    function Owned() {
      const [viewport, setViewport] = useState<Viewport>(at(0, 0, 1));
      return (
        <FlowingerCanvas
          nodes={nodes}
          viewport={viewport}
          onViewportChange={setViewport}
          onInit={(i) => {
            flow = i;
          }}
        />
      );
    }
    const { container } = render(<Owned />);
    const pane = must(container, '.flowinger');
    fireEvent.pointerDown(pane, pointer({ clientX: 100, clientY: 100 }));
    fireEvent.pointerMove(pane, pointer({ clientX: 160, clientY: 120 }));
    fireEvent.pointerUp(pane, pointer({ clientX: 160, clientY: 120 }));
    expect(shown(container)).toBe('translate(60px, 20px) scale(1)');
    expect(flow?.getViewport()).toEqual(at(60, 20, 1));

    fireEvent.wheel(pane, { deltaY: -100, clientX: 60, clientY: 20 });
    expect(flow?.getViewport().zoom).toBeCloseTo(2 ** 0.2);
    expect(shown(container)).toContain('scale(1.1486');

    // A second tick builds on the view the first one made — the owner's, not the one before it.
    fireEvent.wheel(pane, { deltaY: -100, clientX: 60, clientY: 20 });
    expect(flow?.getViewport().zoom).toBeCloseTo(2 ** 0.4);
  });

  it('wins over `defaultViewport`', () => {
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        defaultViewport={at(500, 500, 1)}
        viewport={at(7, 8, 1)}
        onViewportChange={() => {}}
      />,
    );
    expect(shown(container)).toBe('translate(7px, 8px) scale(1)');
  });

  it('is also what an inner canvas (no provider of its own to start from) shows', () => {
    const { container } = render(
      <FlowingerCore nodes={nodes} viewport={at(3, 4, 0.5)} onViewportChange={() => {}} />,
    );
    expect(shown(container)).toBe('translate(3px, 4px) scale(0.5)');
  });

  it('warns, in development, when it is given with no way to be moved', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<FlowingerCanvas nodes={nodes} viewport={at(0, 0, 1)} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('`viewport` is given without `onViewportChange`'));

    warn.mockClear();
    render(<FlowingerCanvas nodes={nodes} viewport={at(0, 0, 1)} onViewportChange={() => {}} />);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('`onViewportChange` without a `viewport`', () => {
  it('reports each move after it has been made', () => {
    const onViewportChange = vi.fn();
    const seen: string[] = [];
    onViewportChange.mockImplementation(() => {
      seen.push('reported');
    });
    const { container } = render(<FlowingerCanvas nodes={nodes} onViewportChange={onViewportChange} />);
    fireEvent.wheel(must(container, '.flowinger'), { deltaY: -100, clientX: 200, clientY: 100 });

    expect(onViewportChange).toHaveBeenCalledTimes(1);
    const reported = onViewportChange.mock.calls[0]![0] as Viewport;
    expect(shown(container)).toBe(
      `translate(${String(reported.x)}px, ${String(reported.y)}px) scale(${String(reported.zoom)})`,
    );
  });

  it('hears a call to the instance as well, and a view that is moved from a component inside', () => {
    const onViewportChange = vi.fn();
    function Zoomer() {
      const { zoomIn } = useReactFlow();
      return <button onClick={() => void zoomIn()}>in</button>;
    }
    const { container, getByText } = render(
      <FlowingerCanvas nodes={nodes} onViewportChange={onViewportChange}>
        <Zoomer />
      </FlowingerCanvas>,
    );
    fireEvent.click(getByText('in'));
    expect(onViewportChange).toHaveBeenCalledTimes(1);
    expect((onViewportChange.mock.calls[0]![0] as Viewport).zoom).toBeCloseTo(1.25);
    expect(shown(container)).toContain('scale(1.25)');
  });
});

describe('a controlled view and animation', () => {
  function owned(onAsk: (v: Viewport) => void = () => {}) {
    let flow: FlowingerInstance | undefined;
    let setFromOutside: ((v: Viewport) => void) | undefined;
    function Owned() {
      const [viewport, setViewport] = useState<Viewport>(at(0, 0, 1));
      setFromOutside = setViewport;
      return (
        <FlowingerCanvas
          nodes={nodes}
          viewport={viewport}
          onViewportChange={(v) => {
            onAsk(v);
            setViewport(v);
          }}
          onInit={(i) => {
            flow = i;
          }}
        />
      );
    }
    const view = render(<Owned />);
    return {
      ...view,
      flow: () => flow!,
      jump: (v: Viewport) => act(() => setFromOutside?.(v)),
    };
  }

  it('follows an animated move to its end, when the owner applies each frame it is asked for', () => {
    vi.useFakeTimers();
    const asks: Viewport[] = [];
    const { container, flow } = owned((v) => asks.push(v));
    act(() => {
      void flow().setViewport(at(100, 0, 1), { duration: 300 });
    });
    for (let ms = 0; ms < 400; ms += 50) act(() => vi.advanceTimersByTime(50));

    // Many frames, not one: applying a frame must not cancel the animation that asked for it.
    expect(asks.length).toBeGreaterThan(3);
    expect(shown(container)).toBe('translate(100px, 0px) scale(1)');
    vi.useRealTimers();
  });

  it('is cut short when the owner moves the view itself part-way', () => {
    vi.useFakeTimers();
    const asks: Viewport[] = [];
    const { container, flow, jump } = owned((v) => asks.push(v));
    act(() => {
      void flow().setViewport(at(100, 0, 1), { duration: 300 });
    });
    act(() => vi.advanceTimersByTime(100));
    jump(at(-500, -500, 1));
    const asksAtJump = asks.length;
    for (let ms = 0; ms < 400; ms += 50) act(() => vi.advanceTimersByTime(50));

    expect(shown(container)).toBe('translate(-500px, -500px) scale(1)');
    expect(asks.length).toBe(asksAtJump); // the animation asked for nothing more
    vi.useRealTimers();
  });
});

describe('a controlled view at mount', () => {
  it('moves and reports nothing when `defaultViewport` is given as well', () => {
    const onViewportChange = vi.fn();
    const onMove = vi.fn();
    render(
      <FlowingerCanvas
        nodes={nodes}
        defaultViewport={at(500, 500, 1)}
        viewport={at(7, 8, 1)}
        onViewportChange={onViewportChange}
        onMove={onMove}
      />,
    );
    expect(onViewportChange).not.toHaveBeenCalled();
    expect(onMove.mock.calls.map((c) => c[1])).not.toContainEqual(at(500, 500, 1));
  });
});
