import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import {
  FlowingerCanvas,
  FlowingerCore,
  Handle,
  Position,
  connectFeature,
  type Connection,
  type HandleProps,
  type Node,
} from '../index.ts';

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const handle = (c: ParentNode, node: string, id: string) =>
  must<HTMLElement>(c, `[data-id="${node}"] [data-handleid="${id}"]`);
const line = (c: ParentNode) => c.querySelector('.react-flow__connection-path');

/** jsdom has no hit-testing: say what is under the pointer. */
const pointerOver = (el: Element | null) =>
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => el });
afterEach(() => {
  Reflect.deleteProperty(document, 'elementFromPoint');
});
const press = (el: Element, x: number, y: number) => fireEvent.pointerDown(el, pointer({ clientX: x, clientY: y }));
const move = (x: number, y: number) => fireEvent.pointerMove(window, pointer({ clientX: x, clientY: y }));
const release = (x: number, y: number) => fireEvent.pointerUp(window, pointer({ clientX: x, clientY: y }));

/** Two nodes: `a` with an output, `b` with an input — each given the props its test wants. */
function graph(out: Partial<HandleProps> = {}, into: Partial<HandleProps> = {}) {
  const A = () => <Handle id="out" type="source" position={Position.Bottom} {...out} />;
  const B = () => <Handle id="in" type="target" position={Position.Top} {...into} />;
  const nodes: Node[] = [
    { id: 'a', type: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
    { id: 'b', type: 'b', position: { x: 0, y: 200 }, width: 100, height: 40, data: {} },
  ];
  return { nodes, nodeTypes: { a: A, b: B } };
}

/** A drag from a's output to b's input, and what the canvas made of it. */
function connect(
  { nodes, nodeTypes }: ReturnType<typeof graph>,
  props: Record<string, unknown> = {},
  fromOutput = true,
) {
  const onConnect = vi.fn();
  const onConnectEnd = vi.fn();
  const onConnectStart = vi.fn();
  const view = render(
    <div style={{ width: 800, height: 600 }}>
      <FlowingerCanvas
        nodes={nodes}
        nodeTypes={nodeTypes}
        nodesConnectable
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onConnectStart={onConnectStart}
        {...props}
      />
    </div>,
  );
  const from = fromOutput ? handle(view.container, 'a', 'out') : handle(view.container, 'b', 'in');
  const to = fromOutput ? handle(view.container, 'b', 'in') : handle(view.container, 'a', 'out');
  pointerOver(to);
  press(from, 50, 40);
  move(50, 200);
  const during = line(view.container) !== null;
  release(50, 200);
  return { ...view, onConnect, onConnectEnd, onConnectStart, during, from, to };
}

const A_TO_B: Connection = { source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' };

describe('a handle that may not start a connection', () => {
  it('starts none: no line, no start, no connection', () => {
    const r = connect(graph({ isConnectableStart: false }));
    expect(r.onConnectStart).not.toHaveBeenCalled();
    expect(r.during).toBe(false);
    expect(r.onConnect).not.toHaveBeenCalled();
  });

  it('is not drawn as one that can: no crosshair — though it still catches a drop', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas {...graph({ isConnectableStart: false })} nodesConnectable />
      </div>,
    );
    const h = handle(container, 'a', 'out');
    expect(h.style.cursor).toBe('');
    expect(h.style.pointerEvents).toBe('all');
    expect(h.getAttribute('data-connectable')).toBe('true');
  });

  it('is still a place a connection can end, dragged out of the other handle', () => {
    // b's input is dragged onto a's output, which may not start one.
    const r = connect(graph({ isConnectableStart: false }), {}, false);
    expect(r.onConnect).toHaveBeenCalledWith(A_TO_B);
  });

  it('is the default the other way: a handle that says true, or nothing, starts one', () => {
    expect(connect(graph({ isConnectableStart: true })).onConnect).toHaveBeenCalledWith(A_TO_B);
  });
});

describe('a handle that may not end a connection', () => {
  it('is not there as far as a drop goes: nothing is made, and the drop says it found no handle', () => {
    const r = connect(graph({}, { isConnectableEnd: false }));
    expect(r.onConnect).not.toHaveBeenCalled();
    expect(r.onConnectEnd).toHaveBeenCalledTimes(1);
    expect(r.onConnectEnd.mock.calls[0]?.[1]).toEqual({ connection: null, isValid: null });
  });

  it('still starts one', () => {
    // b's input, which may not end one, is dragged onto a's output.
    const r = connect(graph({}, { isConnectableEnd: false }), {}, false);
    expect(r.onConnectStart).toHaveBeenCalledTimes(1);
    expect(r.onConnect).toHaveBeenCalledWith(A_TO_B);
  });

  it('does not snap the line to it', () => {
    const r = connect(graph({}, { isConnectableEnd: false }));
    expect(r.during).toBe(true);
  });
});

describe('a handle\'s isValidConnection', () => {
  it('vets connections dragged out of it: a refusal stops one', () => {
    const isValidConnection = vi.fn(() => false);
    const r = connect(graph({ isValidConnection }));
    expect(isValidConnection).toHaveBeenCalledWith(A_TO_B);
    expect(r.onConnect).not.toHaveBeenCalled();
    expect(r.onConnectEnd.mock.calls[0]?.[1]).toMatchObject({ isValid: false });
  });

  it('is asked in place of the canvas\'s, not as well: it can allow what the canvas would refuse', () => {
    const onCanvas = vi.fn(() => false);
    const r = connect(graph({ isValidConnection: () => true }), { isValidConnection: onCanvas });
    expect(r.onConnect).toHaveBeenCalledWith(A_TO_B);
    expect(onCanvas).not.toHaveBeenCalled();
  });

  it('leaves the canvas\'s to a handle with none', () => {
    const onCanvas = vi.fn(() => false);
    const r = connect(graph(), { isValidConnection: onCanvas });
    expect(onCanvas).toHaveBeenCalled();
    expect(r.onConnect).not.toHaveBeenCalled();
  });

  it('is the handle the drag began at that is asked, not the one it ended on', () => {
    const atStart = vi.fn(() => true);
    const atEnd = vi.fn(() => false);
    const r = connect(graph({ isValidConnection: atStart }, { isValidConnection: atEnd }));
    expect(atEnd).not.toHaveBeenCalled();
    expect(atStart).toHaveBeenCalled();
    expect(r.onConnect).toHaveBeenCalledTimes(1);
  });

  it('is heard as it now is, not as the handle first rendered it', () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => false);
    const g = graph();
    const Out = ({ check }: { check: () => boolean }) => (
      <Handle id="out" type="source" position={Position.Bottom} isValidConnection={check} />
    );
    const tree = (check: () => boolean) => (
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas
          nodes={g.nodes}
          nodesConnectable
          nodeTypes={{ a: () => <Out check={check} />, b: g.nodeTypes.b }}
        />
      </div>
    );
    const view = render(tree(first));
    view.rerender(tree(second));
    pointerOver(handle(view.container, 'b', 'in'));
    press(handle(view.container, 'a', 'out'), 50, 40);
    release(50, 200);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });
});

describe('a handle\'s onConnect', () => {
  it('hears the connection dragged out of it — after the canvas\'s own onConnect', () => {
    const order: string[] = [];
    const onConnect = vi.fn(() => order.push('handle'));
    const r = connect(graph({ onConnect }), {
      onConnect: () => order.push('canvas'),
    });
    expect(onConnect).toHaveBeenCalledWith(A_TO_B);
    expect(order).toEqual(['canvas', 'handle']);
    expect(r.during).toBe(true);
  });

  it('hears nothing of a connection dragged onto it: only the handle it began at is told', () => {
    const atStart = vi.fn();
    const atEnd = vi.fn();
    connect(graph({ onConnect: atStart }, { onConnect: atEnd }));
    expect(atStart).toHaveBeenCalledTimes(1);
    expect(atEnd).not.toHaveBeenCalled();
  });

  it('hears nothing of a refused connection', () => {
    const onConnect = vi.fn();
    connect(graph({ onConnect }), { isValidConnection: () => false });
    expect(onConnect).not.toHaveBeenCalled();
  });
});

describe('the handle props on a core', () => {
  it('need the connect feature, like the canvas\'s own connection props', () => {
    const onConnect = vi.fn();
    const g = graph({ onConnect });
    const view = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={g.nodes} nodeTypes={g.nodeTypes} nodesConnectable features={[connectFeature]} />
      </div>,
    );
    pointerOver(handle(view.container, 'b', 'in'));
    press(handle(view.container, 'a', 'out'), 50, 40);
    release(50, 200);
    expect(onConnect).toHaveBeenCalledWith(A_TO_B);
  });
});
