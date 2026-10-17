import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { FlowingerCanvas, Handle, Position, type Connection, type FlowingerProps, type Node, type NodeTypes } from '../index.ts';

// A finger is not a 10 px dot, and a graph fitted to a phone draws the dot at half that: a touch that lands near a
// handle is on it — for a drag, for a tap (`connectOnClick`), and for where a dragged line is dropped. A mouse
// still has to hit it.

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}

/** jsdom has no hit-testing: nothing is under the pointer, so a drop finds its handle by distance alone. */
Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
afterEach(() => {
  fireEvent.pointerUp(window, { pointerId: 1 });
  fireEvent.pointerUp(window, { pointerId: 2 });
});

const finger = (x: number, y: number, pointerId = 1) => ({
  pointerId,
  pointerType: 'touch',
  isPrimary: pointerId === 1,
  button: 0,
  clientX: x,
  clientY: y,
});
const mouse = (x: number, y: number) => ({ pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, clientX: x, clientY: y });

function Ports() {
  return (
    <div>
      <Handle id="in" type="target" position={Position.Top} />
      <Handle id="out" type="source" position={Position.Bottom} />
      <button type="button" className="nodrag">
        x
      </button>
    </div>
  );
}
const types: NodeTypes = { ports: Ports, box: () => <div /> };
// Unmeasured (jsdom), at zoom 1 with the pane at the page's corner: a.out is at (50, 40), b.in at (50, 200).
const nodes: Node[] = [
  { id: 'a', type: 'ports', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
  { id: 'b', type: 'ports', position: { x: 0, y: 200 }, width: 100, height: 40, data: {} },
];
const A_TO_B: Connection = { source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' };

function mount(props: Partial<FlowingerProps> = {}, list: Node[] = nodes) {
  const calls = { onConnect: vi.fn(), onConnectStart: vi.fn(), onClickConnectStart: vi.fn(), onNodesChange: vi.fn() };
  const view = render(
    <div style={{ width: 800, height: 600 }}>
      <FlowingerCanvas nodes={list} nodeTypes={types} nodesConnectable nodesDraggable {...calls} {...props} />
    </div>,
  );
  const pane = must<HTMLElement>(view.container, '.react-flow');
  const node = (id: string) => must<HTMLElement>(view.container, `[data-id="${id}"]`);
  return { ...view, ...calls, pane, node };
}

/** A finger pressed at `from`, dragged to `to`, and lifted — all on `el`, as a touch's events are (and so on the window). */
function drag(el: Element, from: [number, number], to: [number, number], input = finger) {
  fireEvent.pointerDown(el, input(...from));
  fireEvent.pointerMove(el, input(from[0], from[1] + 5));
  fireEvent.pointerMove(el, input(...to));
  fireEvent.pointerUp(el, input(...to));
}

describe('a finger near a handle is on it', () => {
  it('on the bare pane, 12 px from a handle: a drag connects, dropped 10 px from the other', () => {
    const r = mount();
    drag(r.pane, [50, 52], [50, 190]);
    expect(r.onConnectStart).toHaveBeenCalledOnce();
    expect(r.onConnect).toHaveBeenCalledWith(A_TO_B);
  });

  it('a mouse there pans: it still has to hit the handle', () => {
    const r = mount();
    drag(r.pane, [50, 52], [50, 190], mouse);
    expect(r.onConnectStart).not.toHaveBeenCalled();
    expect(r.onConnect).not.toHaveBeenCalled();
  });

  it('beyond its reach, a finger on the pane pans', () => {
    const r = mount();
    drag(r.pane, [50, 70], [50, 190]);
    expect(r.onConnectStart).not.toHaveBeenCalled();
  });

  it('on its node, near the handle: a drag connects', () => {
    const r = mount();
    drag(r.node('a'), [50, 32], [50, 190]);
    expect(r.onConnect).toHaveBeenCalledWith(A_TO_B);
  });

  it("on its node's middle the node is dragged, however small the node is on screen", () => {
    // a.out is 20 graph units from a's centre: inside a, the reach stops halfway, at 10.
    const r = mount();
    drag(r.node('a'), [50, 20], [80, 120]);
    expect(r.onConnectStart).not.toHaveBeenCalled();
    expect(r.onNodesChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'a', type: 'position' })]),
    );
  });

  it('on something a node keeps for itself (a button, `nodrag`), it is that thing’s', () => {
    const r = mount();
    const button = must<HTMLElement>(r.node('a'), 'button');
    drag(button, [50, 36], [50, 190]);
    expect(r.onConnectStart).not.toHaveBeenCalled();
  });

  it("on a group, near the handle of a node inside it: that node's handle", () => {
    // c is inside g, at (50, 350) on the canvas: c.out is at (100, 390), and the finger lands on g, below it.
    const r = mount({}, [
      ...nodes,
      { id: 'g', type: 'box', position: { x: 0, y: 300 }, width: 300, height: 200, data: {} },
      { id: 'c', type: 'ports', parentId: 'g', position: { x: 50, y: 50 }, width: 100, height: 40, data: {} },
    ]);
    drag(r.node('g'), [100, 402], [50, 190]);
    expect(r.onConnect).toHaveBeenCalledWith({ source: 'c', sourceHandle: 'out', target: 'b', targetHandle: 'in' });
  });

  it('two taps near two handles connect them (`connectOnClick`)', () => {
    const r = mount();
    const tap = (x: number, y: number) => {
      fireEvent.pointerDown(r.pane, finger(x, y));
      fireEvent.pointerUp(window, finger(x, y));
      fireEvent.click(r.pane, { clientX: x, clientY: y });
    };
    tap(50, 52);
    expect(r.onClickConnectStart).toHaveBeenCalledOnce();
    tap(50, 188);
    expect(r.onConnect).toHaveBeenCalledWith(A_TO_B);
  });

  it('a second finger makes it a pinch: the connection is dropped, and nothing is connected', () => {
    const r = mount();
    fireEvent.pointerDown(r.pane, finger(50, 52));
    fireEvent.pointerMove(window, finger(50, 60));
    fireEvent.pointerDown(r.pane, finger(300, 300, 2));
    fireEvent.pointerMove(r.pane, finger(320, 320, 2));
    fireEvent.pointerMove(window, finger(50, 190));
    fireEvent.pointerUp(window, finger(50, 190));
    expect(r.onConnect).not.toHaveBeenCalled();
  });
});
