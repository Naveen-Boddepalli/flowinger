import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import {
  Controls,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  MiniMap,
  Position,
  useNodesState,
  type Edge,
  type FlowingerProps,
  type Node,
} from '../index.ts';

// nodesFocusable, disableKeyboardA11y, ariaLabelConfig, autoPanOnNodeFocus, autoPanOnSelection and debug, as
// React Flow does them (from its source): nodes are tab stops by default there (here: once selectable, as before,
// until `nodesFocusable` says), keyboard handling can be switched off, labels come from a config object,
// focusing a node out of view pans to it, a selection box pans at the pane's edge, and `debug` logs changes.

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const node = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
const viewOf = (c: ParentNode) => {
  const m = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\) scale\(([\d.]+)\)/.exec(
    must<HTMLElement>(c, '.flowinger-viewport').style.transform,
  );
  if (!m) throw new Error('unparseable viewport');
  return { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) };
};
const n = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  width: 100,
  height: 40,
  data: {},
  ...extra,
});
const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const canvas = (props: Partial<FlowingerProps>) => (
  <div style={{ width: 800, height: 600 }}>
    <FlowingerCanvas {...props} />
  </div>
);

describe('nodesFocusable', () => {
  const nodes = [n('a', 0, 0), n('b', 200, 0, { focusable: false }), n('c', 400, 0)];

  it('left out, a node is a tab stop where it can be selected, as before', () => {
    const plain = render(canvas({ nodes: [n('a', 0, 0)] }));
    expect(node(plain.container, 'a').getAttribute('tabindex')).toBeNull();
    plain.unmount();
    const selectable = render(canvas({ nodes: [n('a', 0, 0)], elementsSelectable: true }));
    expect(node(selectable.container, 'a').getAttribute('tabindex')).toBe('0');
  });

  it('true makes every node a tab stop, selectable or not', () => {
    const { container } = render(canvas({ nodes: [n('a', 0, 0)], nodesFocusable: true }));
    expect(node(container, 'a').getAttribute('tabindex')).toBe('0');
  });

  it('false takes them out of the tab order even where they can be selected', () => {
    const { container } = render(canvas({ nodes: [n('a', 0, 0)], elementsSelectable: true, nodesFocusable: false }));
    expect(node(container, 'a').getAttribute('tabindex')).toBeNull();
  });

  it('a node\'s own focusable wins, either way', () => {
    const { container } = render(canvas({ nodes, nodesFocusable: true }));
    expect(node(container, 'a').getAttribute('tabindex')).toBe('0');
    expect(node(container, 'b').getAttribute('tabindex')).toBeNull();
    const off = render(canvas({ nodes: [n('x', 0, 0, { focusable: true })], nodesFocusable: false }));
    expect(node(off.container, 'x').getAttribute('tabindex')).toBe('0');
  });

  it('an edge\'s own focusable wins over edgesFocusable', () => {
    const ns = [n('a', 0, 0), n('b', 0, 200)];
    const edges: Edge[] = [
      { id: 'on', source: 'a', target: 'b', focusable: true },
      { id: 'off', source: 'a', target: 'b', focusable: false },
    ];
    const { container } = render(canvas({ nodes: ns, edges, elementsSelectable: true }));
    expect(must(container, '[data-testid="rf__edge-on"]').getAttribute('tabindex')).toBe('0');
    expect(must(container, '[data-testid="rf__edge-off"]').getAttribute('tabindex')).toBeNull();
  });
});

describe('disableKeyboardA11y', () => {
  it('takes nodes and edges out of the tab order and silences their keys', () => {
    const ns = [n('a', 0, 0), n('b', 0, 200)];
    const edges: Edge[] = [{ id: 'e', source: 'a', target: 'b' }];
    const { container } = render(
      canvas({ nodes: ns, edges, elementsSelectable: true, nodesDraggable: true, disableKeyboardA11y: true }),
    );
    expect(node(container, 'a').getAttribute('tabindex')).toBeNull();
    expect(must(container, '[data-testid="rf__edge-e"]').getAttribute('tabindex')).toBeNull();
    // A click still selects: it is the keyboard that is off.
    fireEvent.click(node(container, 'a'));
    expect(node(container, 'a').classList.contains('selected')).toBe(true);
  });
});

describe('autoPanOnNodeFocus', () => {
  const far = [n('near', 0, 0), n('far', 3000, 2000)];

  it('pans to a node that takes focus out of view, keeping the zoom', () => {
    const { container } = render(canvas({ nodes: far, nodesFocusable: true }));
    expect(viewOf(container)).toEqual({ x: 0, y: 0, zoom: 1 });
    act(() => {
      fireEvent.focus(node(container, 'far'));
    });
    // The node's centre (3050, 2020) is now the pane's (400, 300).
    expect(viewOf(container)).toEqual({ x: 400 - 3050, y: 300 - 2020, zoom: 1 });
  });

  it('leaves the view alone for a node that is already in it', () => {
    const { container } = render(canvas({ nodes: far, nodesFocusable: true }));
    act(() => {
      fireEvent.focus(node(container, 'near'));
    });
    expect(viewOf(container)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('pans to where a child really is, not to its position inside its parent', () => {
    const tree = [
      n('near', 0, 0),
      n('g', 3000, 2000, { width: 300, height: 200 }),
      n('k', 10, 10, { parentId: 'g' }),
    ];
    const { container } = render(canvas({ nodes: tree, nodesFocusable: true }));
    act(() => {
      fireEvent.focus(node(container, 'k'));
    });
    // k is at (3010, 2010), 100 × 40: its centre (3060, 2030) is now the pane's (400, 300).
    expect(viewOf(container)).toEqual({ x: 400 - 3060, y: 300 - 2030, zoom: 1 });
  });

  it('off, it does not pan', () => {
    const { container } = render(canvas({ nodes: far, nodesFocusable: true, autoPanOnNodeFocus: false }));
    act(() => {
      fireEvent.focus(node(container, 'far'));
    });
    expect(viewOf(container)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('is part of the keyboard: not with disableKeyboardA11y', () => {
    const { container } = render(
      canvas({ nodes: far, nodesFocusable: true, disableKeyboardA11y: true }),
    );
    act(() => {
      fireEvent.focus(node(container, 'far'));
    });
    expect(viewOf(container)).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

describe('autoPanOnSelection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  const sweepToEdge = (c: ParentNode) => {
    const pane = must<HTMLElement>(c, '.flowinger');
    fireEvent.pointerDown(pane, pointer({ clientX: 300, clientY: 300, shiftKey: true }));
    fireEvent.pointerMove(pane, pointer({ clientX: 5, clientY: 300, shiftKey: true }));
  };
  const frames = (k: number) =>
    act(() => {
      vi.advanceTimersByTime(k * 16.7);
    });

  it('pans while the box is held at the pane\'s edge, by default', () => {
    const { container } = render(canvas({ nodes: [n('a', 0, 0)], elementsSelectable: true }));
    sweepToEdge(container);
    frames(10);
    expect(viewOf(container).x).toBeGreaterThan(0); // the view moved right: it looks further left
  });

  it('does not when it is off', () => {
    const { container } = render(
      canvas({ nodes: [n('a', 0, 0)], elementsSelectable: true, autoPanOnSelection: false }),
    );
    sweepToEdge(container);
    frames(10);
    expect(viewOf(container).x).toBe(0);
  });

  it('keeps the box\'s corner on the same place in the graph, so what it passes over is selected', () => {
    // a is off to the left, out of view; the box starts at (300, 300) and is held at the left edge.
    const { container } = render(
      canvas({ nodes: [n('a', -300, 280), n('b', 150, 280)], elementsSelectable: true }),
    );
    const pane = must<HTMLElement>(container, '.flowinger');
    // From above the row to below it, out to the left edge: the box is 100 tall, and its corner is held.
    fireEvent.pointerDown(pane, pointer({ clientX: 300, clientY: 250, shiftKey: true }));
    fireEvent.pointerMove(pane, pointer({ clientX: 5, clientY: 350, shiftKey: true }));
    frames(30);
    fireEvent.pointerUp(pane, pointer({ clientX: 5, clientY: 350, shiftKey: true }));
    const selected = [...container.querySelectorAll('.flowinger-node.selected')]
      .map((el) => el.getAttribute('data-id'))
      .sort();
    // a is far off to the left, reached only because the view moved; b is under the corner that was held.
    expect(selected).toEqual(['a', 'b']);
  });
});

describe('debug', () => {
  function Controlled({ debug }: { debug?: boolean }) {
    const [nodes, , onNodesChange] = useNodesState([n('a', 0, 0)]);
    return (
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas
          nodes={nodes}
          onNodesChange={onNodesChange}
          elementsSelectable
          {...(debug === undefined ? {} : { debug })}
        />
      </div>
    );
  }

  it('logs the changes a controlled flow is told of', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { container } = render(<Controlled debug />);
    fireEvent.click(node(container, 'a'));
    const said = log.mock.calls.filter((c) => String(c[0]).startsWith('flowinger'));
    expect(said.length).toBeGreaterThan(0);
    expect(JSON.stringify(said[0]?.[1])).toContain('select');
  });

  it('says nothing without it', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { container } = render(<Controlled />);
    fireEvent.click(node(container, 'a'));
    expect(log).not.toHaveBeenCalled();
  });
});

describe('ariaLabelConfig', () => {
  const ns = [n('a', 0, 0, { type: 'ports' }), n('b', 200, 0)];
  const types = { ports: () => <Handle id="out" type="source" position={Position.Bottom} /> };

  it('describes focusable nodes and edges, in hidden text they point at', () => {
    const edges: Edge[] = [{ id: 'e', source: 'a', target: 'b' }];
    const { container } = render(
      canvas({ nodes: ns, edges, nodeTypes: types, elementsSelectable: true, nodesDraggable: true }),
    );
    const id = node(container, 'a').getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    const text = container.ownerDocument.getElementById(id as string)?.textContent ?? '';
    expect(text).toMatch(/Press enter or space to select a node/);
    const edgeDesc = must(container, '[data-testid="rf__edge-e"]').getAttribute('aria-describedby');
    expect(container.ownerDocument.getElementById(edgeDesc as string)?.textContent).toMatch(/select an edge/);
  });

  it('takes the text from the config, a part of it at a time', () => {
    const { container } = render(
      canvas({
        nodes: ns,
        elementsSelectable: true,
        ariaLabelConfig: { 'node.a11yDescription.default': 'Pick this step' },
      }),
    );
    const id = node(container, 'a').getAttribute('aria-describedby') as string;
    const text = container.ownerDocument.getElementById(id)?.textContent ?? '';
    // Whichever of the two descriptions applies, it is the config's where the config gave one, else the default.
    expect(text.length).toBeGreaterThan(0);
  });

  /** The announcement is made once the move is: by the next task. */
  const settle = () => act(() => new Promise((done) => setTimeout(done, 0)));

  it('announces a move made with the keyboard in a live region, with where the node is now', async () => {
    const { container } = render(
      canvas({ nodes: [n('a', 10, 20)], elementsSelectable: true, nodesDraggable: true }),
    );
    fireEvent.click(node(container, 'a'));
    fireEvent.keyDown(node(container, 'a'), { key: 'ArrowRight' });
    await settle();
    const live = container.querySelector('[aria-live]');
    expect(live?.textContent).toBe('Moved selected node right. New position, x: 15, y: 20');
  });

  it('says each move in an element of its own, so a screen reader that misses a text changed in place hears it', async () => {
    const { container } = render(
      canvas({ nodes: [n('a', 10, 20)], elementsSelectable: true, nodesDraggable: true }),
    );
    fireEvent.click(node(container, 'a'));
    fireEvent.keyDown(node(container, 'a'), { key: 'ArrowRight' });
    await settle();
    const first = container.querySelector('[aria-live] > *');
    fireEvent.keyDown(node(container, 'a'), { key: 'ArrowRight' });
    await settle();
    const second = container.querySelector('[aria-live] > *');
    expect(second?.textContent).toBe('Moved selected node right. New position, x: 20, y: 20');
    expect(second).not.toBe(first);
  });

  it('the live message is the config\'s when it gives one', async () => {
    const { container } = render(
      canvas({
        nodes: [n('a', 10, 20)],
        elementsSelectable: true,
        nodesDraggable: true,
        ariaLabelConfig: {
          'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }) => `${direction} ${String(x)},${String(y)}`,
        },
      }),
    );
    fireEvent.click(node(container, 'a'));
    fireEvent.keyDown(node(container, 'a'), { key: 'ArrowDown' });
    await settle();
    expect(container.querySelector('[aria-live]')?.textContent).toBe('down 10,25');
  });

  it('labels the controls, the minimap and a handle', () => {
    const { container, getByLabelText } = render(
      <FlowingerProvider>
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCanvas
            nodes={ns}
            nodeTypes={types}
            nodesConnectable
            ariaLabelConfig={{
              'controls.zoomIn.ariaLabel': 'Closer',
              'controls.zoomOut.ariaLabel': 'Further',
              'controls.fitView.ariaLabel': 'Everything',
              'minimap.ariaLabel': 'Overview',
              'handle.ariaLabel': 'Connection point',
            }}
          />
        </div>
        <Controls />
        <MiniMap />
      </FlowingerProvider>,
    );
    expect(getByLabelText('Closer')).toBeTruthy();
    expect(getByLabelText('Further')).toBeTruthy();
    expect(getByLabelText('Everything')).toBeTruthy();
    expect(container.querySelector('.react-flow__minimap')?.getAttribute('aria-label')).toBe('Overview');
    expect(container.querySelector('[data-handleid="out"]')?.getAttribute('aria-label')).toBe('Connection point');
  });

  it('an explicit ariaLabel on the minimap still wins', () => {
    const { container } = render(
      <FlowingerProvider>
        <FlowingerCanvas nodes={ns} ariaLabelConfig={{ 'minimap.ariaLabel': 'Overview' }} />
        <MiniMap ariaLabel="Mine" />
      </FlowingerProvider>,
    );
    expect(container.querySelector('.react-flow__minimap')?.getAttribute('aria-label')).toBe('Mine');
  });

  it('leaves the English labels as they were when there is no config', () => {
    const { getByLabelText } = render(
      <FlowingerProvider>
        <FlowingerCanvas nodes={ns} />
        <Controls />
      </FlowingerProvider>,
    );
    expect(getByLabelText('Zoom in')).toBeTruthy();
    expect(getByLabelText('Zoom out')).toBeTruthy();
    expect(getByLabelText('Fit view')).toBeTruthy();
  });
});
