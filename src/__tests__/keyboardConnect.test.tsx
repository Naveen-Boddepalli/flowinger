import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { FlowingerCanvas, Handle, Position, type FlowingerProps, type Node, type NodeTypes } from '../index.ts';

// Connecting from the keyboard: a connectable handle is a button, Enter (or Space) on one begins a connection and
// on another ends it, Escape lets go — each said in the live region — and a node's handles are tab stops only
// while focus is inside the node, so the tab order goes node by node.

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}

function Ports({ data }: { data: { label: string } }) {
  return (
    <div>
      <Handle id="in" type="target" position={Position.Top} />
      {data.label}
      <Handle id="out" type="source" position={Position.Bottom} />
    </div>
  );
}
const types: NodeTypes = { ports: Ports };
const nodes: Node[] = [
  { id: 'a', type: 'ports', position: { x: 0, y: 0 }, width: 100, height: 40, data: { label: 'Scan' } },
  { id: 'b', type: 'ports', position: { x: 0, y: 200 }, width: 100, height: 40, data: { label: 'Sort' } },
];

function mount(props: Partial<FlowingerProps> = {}) {
  const calls = { onConnect: vi.fn(), onClickConnectStart: vi.fn(), onClickConnectEnd: vi.fn() };
  const view = render(
    <div style={{ width: 800, height: 600 }}>
      <FlowingerCanvas nodes={nodes} nodeTypes={types} nodesConnectable elementsSelectable {...calls} {...props} />
    </div>,
  );
  const handle = (node: string, id: string) => must<HTMLElement>(view.container, `[data-id="${node}"] [data-handleid="${id}"]`);
  const node = (id: string) => must<HTMLElement>(view.container, `[data-id="${id}"]`);
  const said = () => view.container.querySelector('[aria-live]')?.textContent;
  return { ...view, ...calls, handle, node, said };
}

const press = (el: Element, key = 'Enter') => fireEvent.keyDown(el, { key });

describe('connecting from the keyboard', () => {
  it('makes a connectable handle a named button that says how it is used', () => {
    const r = mount();
    const out = r.handle('a', 'out');
    expect(out.getAttribute('role')).toBe('button');
    expect(out.getAttribute('aria-label')).toBe('source handle out');
    const hint = document.getElementById(out.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toMatch(/Press enter to connect/);
  });

  it("puts a node's handles in the tab order while focus is inside the node, and only then", () => {
    const r = mount();
    expect(r.handle('a', 'out').tabIndex).toBe(-1);
    act(() => {
      r.node('a').focus();
    });
    expect(r.handle('a', 'out').tabIndex).toBe(0);
    expect(r.handle('a', 'in').tabIndex).toBe(0);
    expect(r.handle('b', 'in').tabIndex).toBe(-1);
    // From a node into its handle, focus is still inside; out to the next node, it is not.
    act(() => {
      r.handle('a', 'out').focus();
    });
    expect(r.handle('a', 'out').tabIndex).toBe(0);
    act(() => {
      r.node('b').focus();
    });
    expect(r.handle('a', 'out').tabIndex).toBe(-1);
    expect(r.handle('b', 'in').tabIndex).toBe(0);
  });

  it('Enter on one handle and then on another connects them, and says so', () => {
    const r = mount();
    press(r.handle('a', 'out'));
    expect(r.handle('a', 'out').getAttribute('aria-pressed')).toBe('true');
    expect(r.said()).toBe('Connecting from source handle out of Scan. Press enter on another handle, or escape to cancel.');
    press(r.handle('b', 'in'), ' ');
    expect(r.onConnect).toHaveBeenCalledWith({ source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' });
    expect(r.said()).toBe('Connected source handle out of Scan to target handle in of Sort.');
    expect(r.handle('a', 'out').hasAttribute('aria-pressed')).toBe(false);
    // The click callbacks are given mouse events: a key is not one.
    expect(r.onClickConnectStart).not.toHaveBeenCalled();
    expect(r.onClickConnectEnd).not.toHaveBeenCalled();
  });

  it('says when two handles cannot be connected, and connects nothing', () => {
    const r = mount();
    press(r.handle('a', 'out'));
    press(r.handle('b', 'out')); // source to source, in strict mode
    expect(r.onConnect).not.toHaveBeenCalled();
    expect(r.said()).toBe('source handle out of Scan cannot be connected to source handle out of Sort.');
  });

  it('Escape — on a handle, or anywhere in the canvas — lets go of a connection begun, and so does the same handle again', () => {
    const r = mount();
    press(r.handle('a', 'out'));
    press(r.handle('a', 'out'), 'Escape');
    expect(r.said()).toBe('Connection cancelled.');
    expect(r.handle('a', 'out').hasAttribute('aria-pressed')).toBe(false);
    press(r.handle('b', 'in'));
    expect(r.onConnect).not.toHaveBeenCalled(); // a fresh start, not the end of the one let go

    press(r.handle('b', 'in'), 'Escape');
    press(r.handle('a', 'out'));
    press(r.node('b'), 'Escape');
    expect(r.said()).toBe('Connection cancelled.');

    press(r.handle('a', 'out'));
    press(r.handle('a', 'out'));
    expect(r.said()).toBe('Connection cancelled.');
    expect(r.onConnect).not.toHaveBeenCalled();
  });

  it('works with connectOnClick off — a keyboard cannot drag — while a click then does nothing', () => {
    const r = mount({ connectOnClick: false });
    fireEvent.click(r.handle('a', 'out'));
    expect(r.handle('a', 'out').hasAttribute('aria-pressed')).toBe(false);
    press(r.handle('a', 'out'));
    press(r.handle('b', 'in'));
    expect(r.onConnect).toHaveBeenCalledOnce();
  });

  it('a click connection is said too, and Escape lets go of it', () => {
    const r = mount();
    fireEvent.click(r.handle('a', 'out'));
    expect(r.onClickConnectStart).toHaveBeenCalledOnce();
    expect(r.said()).toMatch(/^Connecting from source handle out of Scan/);
    press(r.node('a'), 'Escape');
    expect(r.said()).toBe('Connection cancelled.');
  });

  it("keeps Enter and Space to itself: the node is not selected, and a held Space is not the canvas's pan key", () => {
    const r = mount({ panActivationKeyCode: 'Space', panOnDrag: false });
    const pane = must<HTMLElement>(r.container, '.react-flow');
    fireEvent.keyDown(r.handle('a', 'out'), { key: ' ', code: 'Space' });
    expect(r.node('a').classList.contains('selected')).toBe(false);
    expect(pane.style.cursor).not.toBe('grab');
    // While the same key pressed on the canvas is the pan key.
    fireEvent.keyDown(pane, { key: ' ', code: 'Space' });
    expect(pane.style.cursor).toBe('grab');
  });

  it("names a node by its ariaLabel, else its data.label, else the text it shows — not its toolbar's buttons run together", () => {
    function Plain() {
      return (
        <div>
          <Handle id="out" type="source" position={Position.Bottom} />
          <span>Hash</span> <span>join</span>
        </div>
      );
    }
    const r = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas
          nodes={[
            { id: 'a', type: 'ports', position: { x: 0, y: 0 }, data: { label: 'Scan' }, ariaLabel: 'Index scan of users' },
            { id: 'b', type: 'plain', position: { x: 0, y: 200 }, data: {} },
          ]}
          nodeTypes={{ ...types, plain: Plain }}
          nodesConnectable
        />
      </div>,
    );
    const said = () => r.container.querySelector('[aria-live]')?.textContent;
    press(must(r.container, '[data-id="a"] [data-handleid="out"]'));
    expect(said()).toMatch(/^Connecting from source handle out of Index scan of users\./);
    press(must(r.container, '[data-id="a"] [data-handleid="out"]'));
    press(must(r.container, '[data-id="b"] [data-handleid="out"]'));
    expect(said()).toMatch(/^Connecting from source handle out of Hash join\./);
  });

  it('takes its words from ariaLabelConfig', () => {
    const r = mount({
      ariaLabelConfig: {
        'handle.ariaLabel': 'Port',
        'connection.ariaLiveMessage.start': ({ from }) => `from ${from}`,
        'connection.ariaLiveMessage.connected': ({ from, to }) => `${from} → ${to}`,
      },
    });
    expect(r.handle('a', 'out').getAttribute('aria-label')).toBe('Port');
    press(r.handle('a', 'out'));
    expect(r.said()).toBe('from Port of Scan');
    press(r.handle('b', 'in'));
    expect(r.said()).toBe('Port of Scan → Port of Sort');
  });

  it('is off with disableKeyboardA11y, and on a handle that cannot connect', () => {
    const off = mount({ disableKeyboardA11y: true });
    expect(off.handle('a', 'out').hasAttribute('role')).toBe(false);
    expect(off.handle('a', 'out').hasAttribute('tabindex')).toBe(false);
    off.unmount();
    const view = mount({ nodesConnectable: false });
    expect(view.handle('a', 'out').hasAttribute('role')).toBe(false);
  });
});
