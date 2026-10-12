import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { FlowingerCanvas, FlowingerProvider, useReactFlow, type FlowingerInstance } from '../index.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('viewportInitialized', () => {
  it('is false until a canvas has mounted, and true after — read live from the one instance', () => {
    let flow: FlowingerInstance | undefined;
    function Grab() {
      flow = useReactFlow();
      return null;
    }
    const seenBefore = { value: undefined as boolean | undefined };
    const { rerender } = render(
      <FlowingerProvider>
        <Grab />
      </FlowingerProvider>,
    );
    seenBefore.value = flow?.viewportInitialized;
    expect(seenBefore.value).toBe(false);

    const instance = flow;
    rerender(
      <FlowingerProvider>
        <Grab />
        <FlowingerCanvas nodes={[{ id: 'a', position: { x: 0, y: 0 }, data: {} }]} />
      </FlowingerProvider>,
    );
    // The same object, now reading true: nothing was rebuilt, so nothing re-rendered on its account.
    expect(flow).toBe(instance);
    expect(flow?.viewportInitialized).toBe(true);
  });
});

describe('a move takes an ease', () => {
  function mount() {
    // jsdom lays nothing out; give the pane a size, or there is nowhere to move the view in.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    vi.useFakeTimers();
    let flow: FlowingerInstance | undefined;
    function Grab() {
      flow = useReactFlow();
      return null;
    }
    render(
      <FlowingerProvider>
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCanvas nodes={[{ id: 'a', position: { x: 500, y: 500 }, width: 100, height: 40, data: {} }]}>
            <Grab />
          </FlowingerCanvas>
        </div>
      </FlowingerProvider>,
    );
    return () => flow as FlowingerInstance;
  }
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 50) act(() => vi.advanceTimersByTime(50));
  };

  it('setCenter hands t to it', () => {
    const flow = mount();
    const ts: number[] = [];
    act(() => {
      void flow().setCenter(0, 0, { duration: 200, ease: (t) => (ts.push(t), t) });
    });
    run(300);
    expect(ts.length).toBeGreaterThan(0);
  });

  it('fitView does too', () => {
    const flow = mount();
    const ts: number[] = [];
    act(() => {
      void flow().fitView({ duration: 200, ease: (t) => (ts.push(t), t) });
    });
    run(300);
    expect(ts.length).toBeGreaterThan(0);
  });
});
