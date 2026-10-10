import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { FlowingerCanvas, FlowingerCore, eventsFeature, type Edge, type FlowingerProps, type Node } from '../index.ts';

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const pane = (c: ParentNode) => must<HTMLElement>(c, '.flowinger');
const node = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
const edgeEl = (c: ParentNode, id: string) => must<SVGGElement>(c, `[data-testid="rf__edge-${id}"]`);

const nodes: Node[] = [
  { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
  { id: 'b', position: { x: 200, y: 0 }, width: 100, height: 40, data: {} },
];
const edges: Edge[] = [{ id: 'a-b', source: 'a', target: 'b' }];

const canvas = (props: FlowingerProps = {}) => (
  <div style={{ width: 600, height: 400 }}>
    <FlowingerCore nodes={nodes} edges={edges} features={[eventsFeature]} {...props} />
  </div>
);

/** The same canvas without the feature. */
const bare = (props: FlowingerProps = {}) => canvas({ features: [], ...props });

describe('without the events feature', () => {
  it('a core hears nothing of them, and says so once, in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onNodeDoubleClick = vi.fn();
    const onPaneContextMenu = vi.fn();
    const { container } = render(bare({ onNodeDoubleClick, onPaneContextMenu }));
    fireEvent.doubleClick(node(container, 'a'));
    fireEvent.contextMenu(pane(container));
    expect(onNodeDoubleClick).not.toHaveBeenCalled();
    expect(onPaneContextMenu).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('onNodeDoubleClick, onPaneContextMenu');
    expect(String(warn.mock.calls[0]?.[0])).toContain('"events"');
    warn.mockRestore();
  });

  it('a click on an edge is still heard, and takes the pointer: that one is the core\'s', () => {
    const onEdgeClick = vi.fn();
    const { container } = render(bare({ onEdgeClick }));
    const g = edgeEl(container, 'a-b');
    fireEvent.click(g);
    expect(onEdgeClick).toHaveBeenCalledTimes(1);
    expect(g.style.pointerEvents).toBe('stroke');
    expect(container.querySelector('.react-flow__edge-interaction')).not.toBeNull();
  });

  it('the whole canvas has the feature', () => {
    const onEdgeMouseEnter = vi.fn();
    const { container } = render(
      <div style={{ width: 600, height: 400 }}>
        <FlowingerCanvas nodes={nodes} edges={edges} onEdgeMouseEnter={onEdgeMouseEnter} />
      </div>,
    );
    fireEvent.mouseEnter(edgeEl(container, 'a-b'));
    expect(onEdgeMouseEnter).toHaveBeenCalledTimes(1);
  });
});

describe('events on nodes', () => {
  it('reports a double click, a right click and the pointer coming, moving and going — with the node', () => {
    const on = {
      onNodeDoubleClick: vi.fn(),
      onNodeContextMenu: vi.fn(),
      onNodeMouseEnter: vi.fn(),
      onNodeMouseMove: vi.fn(),
      onNodeMouseLeave: vi.fn(),
    };
    const { container } = render(canvas(on));
    const a = node(container, 'a');
    fireEvent.doubleClick(a);
    fireEvent.contextMenu(a);
    fireEvent.mouseEnter(a);
    fireEvent.mouseMove(a);
    fireEvent.mouseLeave(a);
    for (const fn of Object.values(on)) {
      expect(fn).toHaveBeenCalledTimes(1);
      // The event first, then the node the caller gave.
      expect(fn.mock.calls[0]?.[1]).toBe(nodes[0]);
    }
  });

  it('says which node: another node is another call', () => {
    const onNodeDoubleClick = vi.fn();
    const { container } = render(canvas({ onNodeDoubleClick }));
    fireEvent.doubleClick(node(container, 'b'));
    expect(onNodeDoubleClick).toHaveBeenCalledTimes(1);
    expect(onNodeDoubleClick.mock.calls[0]?.[1]).toBe(nodes[1]);
  });

  it('takes the latest handler, not the one the canvas mounted with', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { container, rerender } = render(canvas({ onNodeContextMenu: first }));
    rerender(canvas({ onNodeContextMenu: second }));
    fireEvent.contextMenu(node(container, 'a'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('is the same on the whole canvas', () => {
    const onNodeDoubleClick = vi.fn();
    const { container } = render(
      <div style={{ width: 600, height: 400 }}>
        <FlowingerCanvas nodes={nodes} edges={edges} onNodeDoubleClick={onNodeDoubleClick} />
      </div>,
    );
    fireEvent.doubleClick(node(container, 'a'));
    expect(onNodeDoubleClick).toHaveBeenCalledTimes(1);
  });
});

describe('events on edges', () => {
  it('reports a double click, a right click and the pointer coming, moving and going — with the edge', () => {
    const on = {
      onEdgeDoubleClick: vi.fn(),
      onEdgeContextMenu: vi.fn(),
      onEdgeMouseEnter: vi.fn(),
      onEdgeMouseMove: vi.fn(),
      onEdgeMouseLeave: vi.fn(),
    };
    const { container } = render(canvas(on));
    const g = edgeEl(container, 'a-b');
    fireEvent.doubleClick(g);
    fireEvent.contextMenu(g);
    fireEvent.mouseEnter(g);
    fireEvent.mouseMove(g);
    fireEvent.mouseLeave(g);
    for (const fn of Object.values(on)) {
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn.mock.calls[0]?.[1]).toBe(edges[0]);
    }
  });

  it('is inert when nothing can be done with it: not selectable, and nothing listening', () => {
    const { container } = render(canvas());
    const g = edgeEl(container, 'a-b');
    expect(g.style.pointerEvents).toBe('');
    expect(container.querySelector('.react-flow__edge-interaction')).toBeNull();
  });

  it.each([
    'onEdgeClick',
    'onEdgeDoubleClick',
    'onEdgeContextMenu',
    'onEdgeMouseEnter',
    'onEdgeMouseMove',
    'onEdgeMouseLeave',
  ] as const)('takes the pointer, unselectable as it is, once %s is given — with a fat strip to hit', (name) => {
    const { container } = render(canvas({ [name]: vi.fn() }));
    const g = edgeEl(container, 'a-b');
    expect(g.style.pointerEvents).toBe('stroke');
    // The pointer cursor says "you can select this", which it cannot be.
    expect(g.style.cursor).toBe('');
    const strip = must<SVGPathElement>(container, '.react-flow__edge-interaction');
    expect(strip.getAttribute('stroke-width')).toBe('20');
  });

  it('keeps the pointer cursor for an edge that can be selected', () => {
    const { container } = render(
      <div style={{ width: 600, height: 400 }}>
        <FlowingerCanvas nodes={nodes} edges={edges} elementsSelectable />
      </div>,
    );
    const g = edgeEl(container, 'a-b');
    expect(g.style.pointerEvents).toBe('stroke');
    expect(g.style.cursor).toBe('pointer');
  });

  it('does not make an edge selectable by listening to it: a core with no selection feature has none', () => {
    const { container } = render(canvas({ elementsSelectable: true, onEdgeMouseEnter: vi.fn() }));
    const g = edgeEl(container, 'a-b');
    expect(g.style.cursor).toBe('');
    expect(g.getAttribute('tabindex')).toBeNull();
  });
});

describe('events on the pane', () => {
  it('reports the pointer coming onto the canvas, moving over it and leaving', () => {
    const on = { onPaneMouseEnter: vi.fn(), onPaneMouseMove: vi.fn(), onPaneMouseLeave: vi.fn() };
    const { container } = render(canvas(on));
    fireEvent.pointerEnter(pane(container));
    fireEvent.pointerMove(pane(container), { pointerId: 1 });
    fireEvent.pointerLeave(pane(container));
    expect(on.onPaneMouseEnter).toHaveBeenCalledTimes(1);
    expect(on.onPaneMouseMove).toHaveBeenCalledTimes(1);
    expect(on.onPaneMouseLeave).toHaveBeenCalledTimes(1);
  });

  it('hears the pointer move over a node too, as React Flow does: the node is in the pane', () => {
    const onPaneMouseMove = vi.fn();
    const { container } = render(canvas({ onPaneMouseMove }));
    fireEvent.pointerMove(node(container, 'a'), { pointerId: 1 });
    expect(onPaneMouseMove).toHaveBeenCalledTimes(1);
  });

  it('reports a right click on the bare canvas', () => {
    const onPaneContextMenu = vi.fn();
    const { container } = render(canvas({ onPaneContextMenu }));
    fireEvent.contextMenu(pane(container));
    expect(onPaneContextMenu).toHaveBeenCalledTimes(1);
  });

  it('leaves a right click on a node to the node', () => {
    const onPaneContextMenu = vi.fn();
    const onNodeContextMenu = vi.fn();
    const { container } = render(canvas({ onPaneContextMenu, onNodeContextMenu }));
    fireEvent.contextMenu(node(container, 'a'));
    expect(onNodeContextMenu).toHaveBeenCalledTimes(1);
    expect(onPaneContextMenu).not.toHaveBeenCalled();
  });

  it('holds back the browser menu, and the callback, while the right button pans', () => {
    const onPaneContextMenu = vi.fn();
    const { container } = render(canvas({ onPaneContextMenu, panOnDrag: [1, 2] }));
    // `fireEvent` returns false when the event was cancelled.
    const proceeded = fireEvent.contextMenu(pane(container));
    expect(proceeded).toBe(false);
    expect(onPaneContextMenu).not.toHaveBeenCalled();
  });

  it('lets the menu through when the right button does not pan', () => {
    const { container } = render(canvas({ onPaneContextMenu: vi.fn(), panOnDrag: [0] }));
    expect(fireEvent.contextMenu(pane(container))).toBe(true);
    // With no listener at all the menu is the browser's.
    const bare = render(canvas());
    expect(fireEvent.contextMenu(pane(bare.container))).toBe(true);
  });

  it('reports the wheel over the bare canvas, and not over a node', () => {
    const onPaneScroll = vi.fn();
    const { container } = render(canvas({ onPaneScroll }));
    fireEvent.wheel(pane(container), { deltaY: 10 });
    expect(onPaneScroll).toHaveBeenCalledTimes(1);
    fireEvent.wheel(node(container, 'a'), { deltaY: 10 });
    expect(onPaneScroll).toHaveBeenCalledTimes(1);
  });

  it('reports the wheel even where zooming is off', () => {
    const onPaneScroll = vi.fn();
    const { container } = render(canvas({ onPaneScroll, zoomOnScroll: false }));
    fireEvent.wheel(pane(container), { deltaY: 10 });
    expect(onPaneScroll).toHaveBeenCalledTimes(1);
  });
});
