import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  FlowingerCanvas,
  FlowingerProvider,
  MiniMap,
  type Node,
} from '../index.ts';
import { FlowingerContext } from '../context.ts';
import { createFlowingerStore } from '../store.ts';

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Background', () => {
  it('has no colour of its own by default, so what is behind the canvas shows', () => {
    const { container } = render(
      <FlowingerProvider>
        <Background />
      </FlowingerProvider>,
    );
    expect(must<SVGSVGElement>(container, '.react-flow__background').style.backgroundColor).toBe('');
  });

  it('takes bgColor', () => {
    const { container } = render(
      <FlowingerProvider>
        <Background bgColor="#102030" />
      </FlowingerProvider>,
    );
    expect(must<SVGSVGElement>(container, '.react-flow__background').style.backgroundColor).toBe('rgb(16, 32, 48)');
  });

  it('lets the caller\'s style win over bgColor', () => {
    const { container } = render(
      <FlowingerProvider>
        <Background bgColor="red" style={{ backgroundColor: 'blue' }} />
      </FlowingerProvider>,
    );
    expect(must<SVGSVGElement>(container, '.react-flow__background').style.backgroundColor).toBe('blue');
  });

  it.each([
    [BackgroundVariant.Dots, 'circle'],
    [BackgroundVariant.Lines, 'path'],
    [BackgroundVariant.Cross, 'path'],
  ])('puts patternClassName on each mark of the %s pattern', (variant, tag) => {
    const { container } = render(
      <FlowingerProvider>
        <Background variant={variant} patternClassName="mark" />
      </FlowingerProvider>,
    );
    const mark = must(container, `pattern ${tag}`);
    expect(mark.getAttribute('class')).toBe('mark');
    expect(container.querySelectorAll('pattern .mark')).toHaveLength(1);
  });

  it('has no class on its marks unless asked', () => {
    const { container } = render(
      <FlowingerProvider>
        <Background />
      </FlowingerProvider>,
    );
    expect(must(container, 'pattern circle').hasAttribute('class')).toBe(false);
  });
});

describe('Controls', () => {
  const inStore = (ui: React.ReactNode) => {
    const store = createFlowingerStore();
    const view = render(<FlowingerContext.Provider value={store}>{ui}</FlowingerContext.Provider>);
    return { store, ...view };
  };
  const label = (c: ParentNode, name: string) => c.querySelector(`[aria-label="${name}"]`);

  it('shows zoom and fit by default; showFit and showFitView each turn the fit button off', () => {
    const on = inStore(<Controls />);
    expect(label(on.container, 'Zoom in')).not.toBeNull();
    expect(label(on.container, 'Fit view')).not.toBeNull();
    const noFit = inStore(<Controls showFit={false} />);
    expect(label(noFit.container, 'Fit view')).toBeNull();
    const noFitView = inStore(<Controls showFitView={false} />);
    expect(label(noFitView.container, 'Fit view')).toBeNull();
    expect(label(noFitView.container, 'Zoom in')).not.toBeNull();
  });

  it('lets showFitView, the name React Flow has, say so outright', () => {
    const { container } = inStore(<Controls showFit={false} showFitView />);
    expect(label(container, 'Fit view')).not.toBeNull();
  });

  it('turns the zoom buttons off with showZoom, leaving the fit button', () => {
    const { container } = inStore(<Controls showZoom={false} />);
    expect(label(container, 'Zoom in')).toBeNull();
    expect(label(container, 'Zoom out')).toBeNull();
    expect(label(container, 'Fit view')).not.toBeNull();
  });

  /** Controls read the instance's methods when they draw, so the spies go on before they do. */
  function withSpies(ui: () => React.ReactNode) {
    const store = createFlowingerStore();
    const done = () => Promise.resolve(true);
    const spies = {
      fitView: vi.spyOn(store.instance, 'fitView').mockImplementation(done),
      zoomIn: vi.spyOn(store.instance, 'zoomIn').mockImplementation(done),
      zoomOut: vi.spyOn(store.instance, 'zoomOut').mockImplementation(done),
    };
    const view = render(<FlowingerContext.Provider value={store}>{ui()}</FlowingerContext.Provider>);
    return { ...view, ...spies };
  }

  it('does what the button says, then calls onZoomIn, onZoomOut and onFitView', () => {
    const order: string[] = [];
    const on = {
      onZoomIn: vi.fn(() => order.push('onZoomIn')),
      onZoomOut: vi.fn(() => order.push('onZoomOut')),
      onFitView: vi.fn(() => order.push('onFitView')),
    };
    const s = withSpies(() => <Controls {...on} />);
    s.zoomIn.mockImplementation(() => {
      order.push('zoomIn');
      return Promise.resolve(true);
    });
    fireEvent.click(must(s.container, '[aria-label="Zoom in"]'));
    expect(order).toEqual(['zoomIn', 'onZoomIn']);
    expect(on.onZoomOut).not.toHaveBeenCalled();
    expect(on.onFitView).not.toHaveBeenCalled();
    fireEvent.click(must(s.container, '[aria-label="Zoom out"]'));
    expect(s.zoomOut).toHaveBeenCalledTimes(1);
    expect(on.onZoomOut).toHaveBeenCalledTimes(1);
    fireEvent.click(must(s.container, '[aria-label="Fit view"]'));
    expect(s.fitView).toHaveBeenCalledTimes(1);
    expect(on.onFitView).toHaveBeenCalledTimes(1);
    expect(on.onZoomIn).toHaveBeenCalledTimes(1);
  });

  it('fits with a 300 ms animation, unless fitViewOptions says otherwise', () => {
    const plain = withSpies(() => <Controls />);
    fireEvent.click(must(plain.container, '[aria-label="Fit view"]'));
    expect(plain.fitView).toHaveBeenCalledWith({ duration: 300 });

    const shaped = withSpies(() => <Controls fitViewOptions={{ padding: 0.4, duration: 0 }} />);
    fireEvent.click(must(shaped.container, '[aria-label="Fit view"]'));
    expect(shaped.fitView).toHaveBeenCalledWith({ duration: 0, padding: 0.4 });
  });

  it('is pinned to the canvas when given a position, and where it is put when not', () => {
    const free = inStore(<Controls />);
    expect(free.container.querySelector('.react-flow__panel')).toBeNull();
    const pinned = inStore(<Controls position="bottom-left" />);
    const panel = must(pinned.container, '.react-flow__panel');
    expect(panel.classList.contains('bottom-left')).toBe(true);
    expect(panel.querySelector('.react-flow__controls')).not.toBeNull();
  });

  it('holds buttons of your own, drawn like the rest', () => {
    const onClick = vi.fn();
    const { container } = inStore(
      <Controls>
        <ControlButton onClick={onClick} aria-label="Lock" title="lock">
          L
        </ControlButton>
      </Controls>,
    );
    const button = must<HTMLButtonElement>(container, '.react-flow__controls-button');
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Lock');
    expect(button.style.minWidth).toBe('24px');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    // After the built-in buttons.
    const all = [...container.querySelectorAll('.react-flow__controls button')];
    expect(all[all.length - 1]).toBe(button);
  });

  it('lets a ControlButton\'s own type and style win', () => {
    const { container } = inStore(
      <Controls>
        <ControlButton type="submit" style={{ minWidth: 50 }} className="mine" />
      </Controls>,
    );
    const button = must<HTMLButtonElement>(container, '.react-flow__controls-button');
    expect(button.type).toBe('submit');
    expect(button.style.minWidth).toBe('50px');
    expect(button.classList.contains('mine')).toBe(true);
  });
});

describe('MiniMap', () => {
  const nodes: Node[] = [
    { id: 'a', type: 'x', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
    { id: 'b', position: { x: 300, y: 100 }, width: 100, height: 40, data: {} },
  ];
  const draw = (mini: React.ReactNode) => {
    // jsdom lays nothing out: give the canvas a size, or there is no view to cut out of the mask.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    return render(
      <FlowingerProvider>
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCanvas nodes={nodes} />
        </div>
        {mini}
      </FlowingerProvider>,
    );
  };
  const rects = (c: ParentNode) => [...c.querySelectorAll<SVGRectElement>('.flowinger-minimap-node')];

  it('draws every node as a plain, unoutlined rectangle by default', () => {
    const { container } = draw(<MiniMap />);
    expect(rects(container)).toHaveLength(2);
    for (const r of rects(container)) {
      expect(r.hasAttribute('stroke')).toBe(false);
      expect(r.getAttribute('rx')).toBe('2');
      expect(r.getAttribute('class')).toBe('flowinger-minimap-node');
    }
  });

  it('outlines nodes by nodeStrokeColor — one colour or a function of the node — at nodeStrokeWidth', () => {
    const one = draw(<MiniMap nodeStrokeColor="red" nodeStrokeWidth={3} />);
    for (const r of rects(one.container)) {
      expect(r.getAttribute('stroke')).toBe('red');
      expect(r.getAttribute('stroke-width')).toBe('3');
    }
    const some = draw(<MiniMap nodeStrokeColor={(n) => (n.id === 'a' ? 'blue' : 'green')} />);
    expect(rects(some.container).map((r) => r.getAttribute('stroke'))).toEqual(['blue', 'green']);
    // Two is the width when it is not said.
    expect(rects(some.container)[0]?.getAttribute('stroke-width')).toBe('2');
  });

  it('classes nodes by nodeClassName — a name or a function of the node', () => {
    const one = draw(<MiniMap nodeClassName="all" />);
    for (const r of rects(one.container)) expect(r.classList.contains('all')).toBe(true);
    const some = draw(<MiniMap nodeClassName={(n) => (n.type === 'x' ? 'typed' : '')} />);
    const [a, b] = rects(some.container);
    expect(a?.getAttribute('class')).toBe('flowinger-minimap-node typed');
    expect(b?.getAttribute('class')).toBe('flowinger-minimap-node');
  });

  it('rounds nodes by nodeBorderRadius', () => {
    const { container } = draw(<MiniMap nodeBorderRadius={9} />);
    for (const r of rects(container)) expect(r.getAttribute('rx')).toBe('9');
  });

  it('paints its background by bgColor', () => {
    const plain = draw(<MiniMap />);
    expect(must<SVGSVGElement>(plain.container, '.react-flow__minimap').style.background).toContain('--flowinger-surface');
    const coloured = draw(<MiniMap bgColor="#010203" />);
    expect(must<SVGSVGElement>(coloured.container, '.react-flow__minimap').style.background).toBe('rgb(1, 2, 3)');
  });

  it('outlines the view by maskStrokeColor and maskStrokeWidth, and not unless asked', () => {
    const plain = draw(<MiniMap />);
    expect(must(plain.container, '.flowinger-minimap-mask').hasAttribute('stroke')).toBe(false);
    const outlined = draw(<MiniMap maskStrokeColor="orange" maskStrokeWidth={4} />);
    const mask = must(outlined.container, '.flowinger-minimap-mask');
    expect(mask.getAttribute('stroke')).toBe('orange');
    expect(mask.getAttribute('stroke-width')).toBe('4');
  });

  it('is pinned to the canvas when given a position, and where it is put when not', () => {
    expect(draw(<MiniMap />).container.querySelector('.react-flow__panel')).toBeNull();
    const pinned = draw(<MiniMap position="top-right" />);
    const panel = must(pinned.container, '.react-flow__panel');
    expect(panel.classList.contains('top-right')).toBe(true);
    expect(panel.querySelector('.react-flow__minimap')).not.toBeNull();
  });
});

describe('proOptions and attributionPosition', () => {
  it('are accepted, and do nothing: there is no attribution to hide', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas
          nodes={[{ id: 'a', position: { x: 0, y: 0 }, data: {} }]}
          proOptions={{ hideAttribution: true }}
          attributionPosition="bottom-left"
        />
      </div>,
    );
    expect(container.querySelector('.react-flow__attribution')).toBeNull();
    expect(container.innerHTML).not.toContain('proOptions');
    expect(warn).not.toHaveBeenCalled();
  });
});
