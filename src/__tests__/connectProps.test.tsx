import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import {
  FlowingerCanvas,
  FlowingerCore,
  Handle,
  Position,
  connectFeature,
  type Connection,
  type Edge,
  type FlowingerProps,
  type HandleProps,
  type Node,
  type NodeTypes,
} from '../index.ts';

// connectionDragThreshold, connectionRadius, reconnectRadius and connectOnClick, as React Flow's XYHandle and
// Handle do them (read from its source): a press must travel before it is a connection, a drop snaps to the
// nearest handle within a radius in graph units, and two clicks on handles make one.

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const handle = (c: ParentNode, node: string, id: string) =>
  must<HTMLElement>(c, `[data-id="${node}"] [data-handleid="${id}"]`);

/** jsdom has no hit-testing: say what is under the pointer. */
const pointerOver = (el: Element | null) =>
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => el });
afterEach(() => {
  Reflect.deleteProperty(document, 'elementFromPoint');
});
const press = (el: Element, x: number, y: number) => fireEvent.pointerDown(el, pointer({ clientX: x, clientY: y }));
const move = (x: number, y: number) => fireEvent.pointerMove(window, pointer({ clientX: x, clientY: y }));
const release = (x: number, y: number) => fireEvent.pointerUp(window, pointer({ clientX: x, clientY: y }));

function Ports(props: { out?: Partial<HandleProps>; into?: Partial<HandleProps> }) {
  return (
    <div>
      <Handle id="in" type="target" position={Position.Top} {...props.into} />
      <Handle id="out" type="source" position={Position.Bottom} {...props.out} />
    </div>
  );
}
// Unmeasured (jsdom), so handles sit at the middle of their side: a.out (50, 40), b.in (50, 200).
const nodes: Node[] = [
  { id: 'a', type: 'ports', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
  { id: 'b', type: 'ports', position: { x: 0, y: 200 }, width: 100, height: 40, data: {} },
];
const A_TO_B: Connection = { source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' };

const plain: NodeTypes = { ports: () => <Ports /> };

function mount(props: Partial<FlowingerProps> = {}, types: NodeTypes = plain) {
  const calls = {
    onConnect: vi.fn(),
    onConnectStart: vi.fn(),
    onConnectEnd: vi.fn(),
    onClickConnectStart: vi.fn(),
    onClickConnectEnd: vi.fn(),
  };
  const view = render(
    <div style={{ width: 800, height: 600 }}>
      <FlowingerCanvas nodes={nodes} nodeTypes={types} nodesConnectable {...calls} {...props} />
    </div>,
  );
  return { ...view, ...calls };
}

describe('connectionDragThreshold', () => {
  it('by default (1 px) a press on a handle with no move is not a connection', () => {
    const r = mount();
    press(handle(r.container, 'a', 'out'), 50, 40);
    release(50, 40);
    expect(r.onConnectStart).not.toHaveBeenCalled();
    expect(r.onConnectEnd).not.toHaveBeenCalled();
  });

  it('starts once the pointer has moved further than it, reporting the press that began it', () => {
    const r = mount({ connectionDragThreshold: 10 });
    press(handle(r.container, 'a', 'out'), 50, 40);
    move(55, 40);
    expect(r.onConnectStart).not.toHaveBeenCalled();
    expect(r.container.querySelector('.react-flow__connection-path')).toBeNull();
    move(70, 40);
    expect(r.onConnectStart).toHaveBeenCalledTimes(1);
    expect(r.onConnectStart.mock.calls[0]?.[1]).toEqual({ nodeId: 'a', handleId: 'out', handleType: 'source' });
    expect(r.container.querySelector('.react-flow__connection-path')).not.toBeNull();
  });

  it('0 starts it at the press', () => {
    const r = mount({ connectionDragThreshold: 0 });
    press(handle(r.container, 'a', 'out'), 50, 40);
    expect(r.onConnectStart).toHaveBeenCalledTimes(1);
  });

  it('a drag that never started makes no connection and no end', () => {
    const r = mount({ connectionDragThreshold: 10 });
    pointerOver(handle(r.container, 'b', 'in'));
    press(handle(r.container, 'a', 'out'), 50, 40);
    move(52, 40);
    release(52, 40);
    expect(r.onConnect).not.toHaveBeenCalled();
    expect(r.onConnectEnd).not.toHaveBeenCalled();
  });
});

describe('connectionRadius', () => {
  const dropAt = (r: ReturnType<typeof mount>, x: number, y: number) => {
    pointerOver(null); // not over a handle: only the radius can find one
    press(handle(r.container, 'a', 'out'), 50, 40);
    move(50, 100);
    move(x, y);
    release(x, y);
  };

  it('snaps a drop to the nearest handle within 20 graph units by default', () => {
    const r = mount();
    dropAt(r, 50, 185); // b.in is at (50, 200): 15 away
    expect(r.onConnect).toHaveBeenCalledWith(A_TO_B);
  });

  it('does not reach one further away than that', () => {
    const r = mount();
    dropAt(r, 50, 170); // 30 away
    expect(r.onConnect).not.toHaveBeenCalled();
    expect(r.onConnectEnd.mock.calls[0]?.[1]).toMatchObject({ connection: null, isValid: null });
  });

  it('takes its reach from the prop', () => {
    const near = mount({ connectionRadius: 5 });
    dropAt(near, 50, 190); // 10 away
    expect(near.onConnect).not.toHaveBeenCalled();
    near.unmount();
    const wide = mount({ connectionRadius: 50 });
    dropAt(wide, 50, 160); // 40 away
    expect(wide.onConnect).toHaveBeenCalledWith(A_TO_B);
  });

  it('is in graph units, so it shrinks on screen as the canvas is zoomed out', () => {
    const r = mount({ defaultViewport: { x: 0, y: 0, zoom: 0.5 } });
    // 15 graph units from b.in at zoom 0.5 is 7.5 px.
    pointerOver(null);
    press(handle(r.container, 'a', 'out'), 25, 20);
    move(25, 50);
    move(25, 92.5);
    release(25, 92.5);
    expect(r.onConnect).toHaveBeenCalledWith(A_TO_B);
  });

  it('the line follows the handle it will snap to', () => {
    const r = mount();
    pointerOver(null);
    press(handle(r.container, 'a', 'out'), 50, 40);
    move(50, 100);
    move(50, 188);
    const d = r.container.querySelector('.react-flow__connection-path')?.getAttribute('d') ?? '';
    expect(d).toMatch(/50(\.00)?[ ,]+200(\.00)?\s*$/); // ends on the handle, not the pointer
  });

  it('a handle that cannot end a connection is not snapped to', () => {
    const types = { ports: () => <Ports into={{ isConnectableEnd: false }} /> };
    const r = mount({}, types);
    dropAt(r, 50, 190);
    expect(r.onConnect).not.toHaveBeenCalled();
  });
});

describe('reconnectRadius', () => {
  function reconnectWith(props: Partial<FlowingerProps>, dropY: number) {
    const onReconnect = vi.fn();
    const edge: Edge = {
      id: 'e',
      source: 'a',
      target: 'b',
      sourceHandle: 'out',
      targetHandle: 'in',
      selected: true,
    };
    const c: Node = { id: 'c', type: 'ports', position: { x: 300, y: 200 }, width: 100, height: 40, data: {} };
    const view = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas
          nodes={[...nodes, c]}
          edges={[edge]}
          nodeTypes={plain}
          nodesConnectable
          elementsSelectable
          onEdgesChange={() => {}}
          onReconnect={onReconnect}
          {...props}
        />
      </div>,
    );
    pointerOver(null);
    const anchor = must<HTMLElement>(view.container, '.flowinger-reconnect-anchor[data-end="target"]');
    fireEvent.pointerDown(anchor, pointer({ clientX: 50, clientY: 200 }));
    fireEvent.pointerMove(window, pointer({ clientX: 200, clientY: 150 }));
    // c.in is at (350, 200).
    fireEvent.pointerMove(window, pointer({ clientX: 350, clientY: dropY }));
    fireEvent.pointerUp(window, pointer({ clientX: 350, clientY: dropY }));
    return onReconnect;
  }

  it('is 10 graph units by default', () => {
    expect(reconnectWith({}, 192)).toHaveBeenCalledTimes(1);
    expect(reconnectWith({}, 180)).not.toHaveBeenCalled();
  });

  it('takes its reach from the prop, and is not the connection radius', () => {
    expect(reconnectWith({ reconnectRadius: 30 }, 175)).toHaveBeenCalledTimes(1);
    expect(reconnectWith({ connectionRadius: 100 }, 180)).not.toHaveBeenCalled();
  });
});

describe('connectOnClick', () => {
  it('two clicks on handles make a connection, and say so', () => {
    const r = mount();
    const out = handle(r.container, 'a', 'out');
    fireEvent.click(out);
    expect(r.onClickConnectStart).toHaveBeenCalledTimes(1);
    expect(r.onClickConnectStart.mock.calls[0]?.[1]).toEqual({ nodeId: 'a', handleId: 'out', handleType: 'source' });
    expect(out.classList.contains('clickconnecting')).toBe(true);
    expect(r.onConnect).not.toHaveBeenCalled();

    fireEvent.click(handle(r.container, 'b', 'in'));
    expect(r.onConnect).toHaveBeenCalledWith(A_TO_B);
    expect(r.onClickConnectEnd).toHaveBeenCalledTimes(1);
    expect(r.onClickConnectEnd.mock.calls[0]?.[1]).toEqual({ connection: A_TO_B, isValid: true });
    expect(out.classList.contains('clickconnecting')).toBe(false);
  });

  it('the second click may be on the handle that cannot start one, and the first from either end', () => {
    const r = mount();
    fireEvent.click(handle(r.container, 'b', 'in')); // a target first
    fireEvent.click(handle(r.container, 'a', 'out'));
    expect(r.onConnect).toHaveBeenCalledWith(A_TO_B); // still source → target
  });

  it('a refused pair makes no connection, and still ends', () => {
    const r = mount({ isValidConnection: () => false });
    fireEvent.click(handle(r.container, 'a', 'out'));
    fireEvent.click(handle(r.container, 'b', 'in'));
    expect(r.onConnect).not.toHaveBeenCalled();
    expect(r.onClickConnectEnd.mock.calls[0]?.[1]).toEqual({ connection: A_TO_B, isValid: false });
    // Over: the next click begins again.
    fireEvent.click(handle(r.container, 'a', 'out'));
    expect(r.onClickConnectStart).toHaveBeenCalledTimes(2);
  });

  it('two of a kind (strict mode) is not a connection', () => {
    const r = mount();
    fireEvent.click(handle(r.container, 'a', 'out'));
    fireEvent.click(handle(r.container, 'a', 'out'));
    expect(r.onConnect).not.toHaveBeenCalled();
    expect(r.onClickConnectEnd.mock.calls[0]?.[1]).toMatchObject({ isValid: false });
  });

  it('off, a click on a handle does nothing', () => {
    const r = mount({ connectOnClick: false });
    fireEvent.click(handle(r.container, 'a', 'out'));
    fireEvent.click(handle(r.container, 'b', 'in'));
    expect(r.onClickConnectStart).not.toHaveBeenCalled();
    expect(r.onConnect).not.toHaveBeenCalled();
  });

  it('a handle that may not start one cannot begin it, but can end it', () => {
    const types = { ports: () => <Ports out={{ isConnectableStart: false }} /> };
    const r = mount({}, types);
    fireEvent.click(handle(r.container, 'a', 'out'));
    expect(r.onClickConnectStart).not.toHaveBeenCalled();
    fireEvent.click(handle(r.container, 'b', 'in'));
    fireEvent.click(handle(r.container, 'a', 'out'));
    expect(r.onConnect).toHaveBeenCalledWith(A_TO_B);
  });

  it('is not begun by the click that ends a drag from the same handle', () => {
    const r = mount();
    const out = handle(r.container, 'a', 'out');
    pointerOver(out);
    press(out, 50, 40);
    move(50, 120);
    move(50, 42);
    release(50, 42);
    fireEvent.click(out);
    expect(r.onClickConnectStart).not.toHaveBeenCalled();
  });

  it('needs nodesConnectable, as a drag does', () => {
    const r = mount({ nodesConnectable: false });
    fireEvent.click(handle(r.container, 'a', 'out'));
    expect(r.onClickConnectStart).not.toHaveBeenCalled();
  });

  it('is asked for by a FlowingerCore with the feature, and warned about without', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<FlowingerCore nodes={nodes} nodeTypes={plain} onClickConnectStart={() => {}} />);
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/onClickConnectStart.*connect/);
    warn.mockRestore();
    const fine = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <FlowingerCore
        nodes={nodes}
        nodeTypes={plain}
        features={[connectFeature]}
        nodesConnectable
        onClickConnectStart={() => {}}
      />,
    );
    expect(fine.mock.calls.map((c) => String(c[0])).join('\n')).not.toMatch(/onClickConnectStart/);
  });
});
