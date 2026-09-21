import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import {
  FlowingerCanvas,
  FlowingerCore,
  FlowingerProvider,
  Handle,
  NodeResizer,
  Position,
  allFeatures,
  boxSelectFeature,
  connectFeature,
  cullingFeature,
  deleteFeature,
  dragFeature,
  editingFeature,
  reconnectFeature,
  useNodesState,
  useReactFlow,
  type EngineContext,
  type Feature,
  type FlowingerInstance,
  type FlowingerProps,
  type Node,
  type NodeChange,
} from '../index.ts';
import { resolveFeatures } from '../features.ts';
import { createFlowingerStore } from '../store.ts';

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const pane = (c: ParentNode) => must<HTMLElement>(c, '.flowinger');
const node = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
const at = (c: ParentNode, id: string) => node(c, id).style.transform;
const viewportOf = (c: ParentNode) => must<HTMLElement>(c, '.flowinger-viewport').style.transform;

const box = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  width: 100,
  height: 40,
  data: {},
  ...extra,
});
const pair = (): Node[] => [box('a', 0, 0), box('b', 200, 0)];

/** A canvas that applies its own changes, with the features (and props) it is given. */
function Controlled({
  features,
  initial = pair(),
  onChange,
  ...props
}: FlowingerProps & { initial?: Node[]; onChange?: (c: NodeChange[]) => void }) {
  const [nodes, , onNodesChange] = useNodesState(initial);
  return (
    <FlowingerCore
      {...props}
      {...(features ? { features } : {})}
      nodes={nodes}
      onNodesChange={(c) => {
        onChange?.(c);
        onNodesChange(c);
      }}
    />
  );
}

const named = (list: readonly Feature[]) => list.map((f) => f.name);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolving features', () => {
  const plain = (name: string, needs: Feature[] = []): Feature => ({ name, needs });

  it('puts what a feature needs before it, and lists each once', () => {
    const a = plain('a');
    const b = plain('b', [a]);
    const c = plain('c', [a, b]);
    expect(named(resolveFeatures([c, b]))).toEqual(['a', 'b', 'c']);
  });

  it('keeps the order it was given, apart from that', () => {
    expect(named(resolveFeatures([plain('z'), plain('m'), plain('a')]))).toEqual(['z', 'm', 'a']);
  });

  it('knows a feature by its name, so two of one name are one', () => {
    expect(named(resolveFeatures([plain('x'), plain('x')]))).toEqual(['x']);
  });

  it('does not loop when two features need each other', () => {
    const a = { name: 'a', needs: [] as Feature[] };
    const b = { name: 'b', needs: [a] };
    a.needs.push(b);
    expect(named(resolveFeatures([a]))).toEqual(['b', 'a']);
  });

  it('brings in what the built-in features build on', () => {
    expect(named(resolveFeatures([reconnectFeature]))).toEqual(['autoPan', 'connect', 'reconnect']);
    expect(named(resolveFeatures([dragFeature]))).toEqual(['autoPan', 'drag']);
    expect(named(resolveFeatures(allFeatures))).toHaveLength(new Set(named(allFeatures)).size + 1); // + autoPan
  });
});

describe('the store and its features', () => {
  it('installs a feature once, however often, and by whatever object, it is named', () => {
    const install = vi.fn(() => ({ n: 1 }));
    const feature: Feature<{ n: number }> = { name: 'x', install };
    const store = createFlowingerStore();
    store.use([feature]);
    store.use([feature, { name: 'x', install }]);
    expect(install).toHaveBeenCalledTimes(1);
    expect(store.api(feature)).toEqual({ n: 1 });
  });

  it('installs what a feature needs first', () => {
    const order: string[] = [];
    const base: Feature = { name: 'base', install: () => order.push('base') };
    const top: Feature = { name: 'top', needs: [base], install: () => order.push('top') };
    createFlowingerStore().use([top]);
    expect(order).toEqual(['base', 'top']);
  });

  it('says which feature is missing when its methods are asked for', () => {
    expect(() => createFlowingerStore().api(dragFeature)).toThrow('the "drag" feature is not enabled');
  });

  it('hands a feature the store as it is now, not as it was when it was installed', () => {
    let ctx: EngineContext | undefined;
    const store = createFlowingerStore();
    store.use([{ name: 'spy', install: (c) => (ctx = c) }]);
    const nodes = pair();
    store.setNodes(nodes);
    expect(ctx?.nodes).toBe(nodes);
    expect(ctx?.nodeById.get('b')).toBe(nodes[1]);
    store.setBounds(0.5, 3);
    void store.instance.setViewport({ x: 5, y: 6, zoom: 2 });
    expect(ctx?.viewport).toEqual({ x: 5, y: 6, zoom: 2 });
  });

  it('tells a feature when the view or the layout changes, and when the canvas goes', () => {
    let ctx: EngineContext | undefined;
    const changed = vi.fn();
    const detached = vi.fn();
    const store = createFlowingerStore();
    store.use([
      {
        name: 'spy',
        install: (c) => {
          ctx = c;
          c.on('change', changed);
          c.on('detach', detached);
        },
      },
    ]);
    void store.instance.setViewport({ x: 1, y: 1, zoom: 1 });
    expect(changed).toHaveBeenCalledTimes(1);
    store.setNodes(pair());
    expect(changed.mock.calls.length).toBeGreaterThan(1);
    const before = changed.mock.calls.length;
    ctx?.changed();
    expect(changed).toHaveBeenCalledTimes(before + 1);
    expect(detached).not.toHaveBeenCalled();
    store.attach(document.createElement('div'), document.createElement('div'));
    store.detach();
    expect(detached).toHaveBeenCalledTimes(1);
  });
});

describe('instance methods a feature supplies', () => {
  it('work when taken off the instance before the canvas rendered, once the canvas has', async () => {
    let taken: Pick<FlowingerInstance, 'setNodes' | 'deleteElements'> | undefined;
    function Early() {
      const { setNodes, deleteElements } = useReactFlow(); // destructured while rendering, ahead of the canvas
      taken = { setNodes, deleteElements };
      return null;
    }
    function App() {
      const [nodes, , onNodesChange] = useNodesState([box('a', 0, 0)]);
      return (
        <FlowingerProvider>
          <Early />
          <FlowingerCanvas nodes={nodes} onNodesChange={onNodesChange} />
        </FlowingerProvider>
      );
    }
    const { container } = render(<App />);
    act(() => {
      taken?.setNodes((current) => [...current, box('b', 100, 0)]);
    });
    expect(node(container, 'b')).toBeInTheDocument();
    await act(async () => {
      await taken?.deleteElements({ nodes: [{ id: 'a' }] });
    });
    expect(container.querySelector('[data-id="a"]')).toBeNull();
  });

  it('say which feature to pass when the canvas was not given it', () => {
    let rf: FlowingerInstance | undefined;
    function Grab() {
      rf = useReactFlow();
      return null;
    }
    render(
      <FlowingerProvider>
        <Grab />
        <FlowingerCore nodes={pair()} />
      </FlowingerProvider>,
    );
    expect(() => rf?.setNodes([])).toThrow('setNodes needs the "editing" feature');
    expect(() => rf?.updateNodeData('a', {})).toThrow('updateNodeData needs the "editing" feature');
    expect(() => rf?.getIntersectingNodes({ id: 'a' })).toThrow('needs the "editing" feature');
    expect(() => void rf?.deleteElements({})).toThrow('deleteElements needs the "delete" feature');
    // What the core does needs no feature.
    expect(rf?.getNodes().map((n) => n.id)).toEqual(['a', 'b']);
    expect(() => rf?.getViewport()).not.toThrow();
  });

  it('work on a core canvas that was given them', () => {
    let rf: FlowingerInstance | undefined;
    function Grab() {
      rf = useReactFlow();
      return null;
    }
    const changes: NodeChange[][] = [];
    render(
      <FlowingerProvider>
        <Grab />
        <FlowingerCore nodes={pair()} features={[editingFeature]} onNodesChange={(c) => changes.push(c)} />
      </FlowingerProvider>,
    );
    rf?.addNodes(box('c', 0, 100));
    expect(changes.at(-1)).toEqual([{ type: 'add', item: expect.objectContaining({ id: 'c' }) }]);
  });
});

describe('a core canvas with no features', () => {
  it('shows nodes, and edges between them, and pans and zooms', () => {
    const { container } = render(
      <FlowingerCore nodes={pair()} edges={[{ id: 'ab', source: 'a', target: 'b' }]} />,
    );
    expect(at(container, 'b')).toBe('translate(200px, 0px)');
    expect(container.querySelector('[data-testid="edge-ab"] path')).not.toBeNull();

    fireEvent.pointerDown(pane(container), pointer({ clientX: 100, clientY: 100 }));
    fireEvent.pointerMove(pane(container), pointer({ clientX: 140, clientY: 125 }));
    fireEvent.pointerUp(pane(container), pointer({ clientX: 140, clientY: 125 }));
    expect(viewportOf(container)).toBe('translate(40px, 25px) scale(1)');
  });

  it('does not drag a node that is asked to be draggable — the press pans instead', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<Controlled nodesDraggable />);
    const a = node(container, 'a');
    fireEvent.pointerDown(a, pointer({ clientX: 10, clientY: 10 }));
    fireEvent.pointerMove(a, pointer({ clientX: 60, clientY: 40 }));
    fireEvent.pointerUp(a, pointer({ clientX: 60, clientY: 40 }));
    expect(at(container, 'a')).toBe('translate(0px, 0px)');
    expect(a.classList.contains('dragging')).toBe(false);
  });

  it('draws handles that only draw, though nodes are asked to be connectable', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const types = { p: () => <Handle id="out" type="source" position={Position.Bottom} /> };
    const { container } = render(
      <FlowingerCore nodes={[box('a', 0, 0, { type: 'p' })]} nodeTypes={types} nodesConnectable />,
    );
    const handle = must<HTMLElement>(container, '[data-handleid="out"]');
    expect(handle.hasAttribute('data-connectable')).toBe(false);
    expect(handle.style.pointerEvents).toBe('none');
  });

  it('selects on a click and says so — selection is not a feature', () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <FlowingerCore nodes={pair()} elementsSelectable onSelectionChange={onSelectionChange} />,
    );
    fireEvent.click(node(container, 'a'));
    expect(node(container, 'a').classList.contains('selected')).toBe(true);
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange.mock.calls[0]?.[0].nodes.map((n: Node) => n.id)).toEqual(['a']);
  });

  it('leaves the delete key alone', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const changes: NodeChange[] = [];
    const { container } = render(
      <Controlled elementsSelectable onChange={(c) => changes.push(...c)} deleteKeyCode="Backspace" />,
    );
    fireEvent.click(node(container, 'a'));
    const backspace = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    act(() => {
      node(container, 'a').dispatchEvent(backspace);
    });
    expect(backspace.defaultPrevented).toBe(false);
    expect(changes.some((c) => c.type === 'remove')).toBe(false);
    expect(container.querySelector('[data-id="a"]')).not.toBeNull();
  });

  it('draws no selection box, though Shift is held — the press pans', () => {
    const { container } = render(<Controlled elementsSelectable />);
    fireEvent.pointerDown(pane(container), pointer({ clientX: 100, clientY: 100, shiftKey: true }));
    fireEvent.pointerMove(pane(container), pointer({ clientX: 160, clientY: 150, shiftKey: true }));
    expect(container.querySelector('.flowinger-selection')).toBeNull();
    expect(viewportOf(container)).toBe('translate(60px, 50px) scale(1)');
  });

  it('carries a resizer without being told to — the resizer brings what it needs', () => {
    const types = {
      r: () => (
        <div>
          <NodeResizer />
        </div>
      ),
    };
    const { container } = render(<Controlled initial={[box('a', 50, 50, { type: 'r' })]} nodeTypes={types} />);
    const control = must<HTMLElement>(container, '.flowinger-resize-control.bottom-right');
    fireEvent.pointerDown(control, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(control, pointer({ clientX: 20, clientY: 10 }));
    fireEvent.pointerUp(control, pointer({ clientX: 20, clientY: 10 }));
    expect([node(container, 'a').style.width, node(container, 'a').style.height]).toEqual(['120px', '50px']);
  });

  it('server-renders and hydrates like the whole canvas', () => {
    // (A server render with no document at all is in ssrLean.test.tsx.)
    const { container } = render(<FlowingerCore nodes={pair()} />);
    expect(container.querySelectorAll('.flowinger-node')).toHaveLength(2);
  });
});

describe('a warning when a prop needs a feature the canvas lacks', () => {
  const warned = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('names the prop and the feature, once per feature', () => {
    const warn = warned();
    render(<FlowingerCore nodes={pair()} nodesDraggable snapToGrid onConnect={() => {}} />);
    const said = warn.mock.calls.map((c) => String(c[0]));
    expect(said).toHaveLength(2);
    expect(said.find((s) => s.includes('"drag"'))).toMatch(/nodesDraggable, snapToGrid do nothing without the "drag" feature/);
    expect(said.find((s) => s.includes('"connect"'))).toMatch(/onConnect does nothing without the "connect" feature — pass connectFeature/);
  });

  it('says nothing about a prop switched off — the way an app that has no use for it writes it', () => {
    const warn = warned();
    render(
      <FlowingerCore nodes={pair()} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} />,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('counts what a feature needs as given', () => {
    const warn = warned();
    render(<FlowingerCore nodes={pair()} features={[reconnectFeature]} onConnect={() => {}} onReconnect={() => {}} autoPanSpeed={20} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('says nothing for the whole canvas, which has every feature', () => {
    const warn = warned();
    render(
      <FlowingerCanvas
        nodes={pair()}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        onConnect={() => {}}
        onReconnect={() => {}}
        selectionOnDrag
        onlyRenderVisibleElements
        deleteKeyCode="Delete"
        autoPanSpeed={5}
      />,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('says the core does not own a graph: defaultNodes needs the whole canvas', () => {
    const warn = warned();
    render(<FlowingerCore defaultNodes={pair()} />);
    expect(String(warn.mock.calls[0]?.[0])).toContain('defaultNodes and defaultEdges need <FlowingerCanvas>');
    warn.mockClear();
    const { container } = render(<FlowingerCanvas defaultNodes={pair()} />);
    expect(warn).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.flowinger-node')).toHaveLength(2);
  });

  it('says nothing when the graph is given as well as a default for it', () => {
    const warn = warned();
    render(<FlowingerCore nodes={pair()} edges={[]} defaultNodes={pair()} defaultEdges={[]} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('says it for defaultEdges on their own, too', () => {
    const warn = warned();
    render(<FlowingerCore nodes={pair()} defaultEdges={[]} />);
    expect(String(warn.mock.calls[0]?.[0])).toContain('defaultNodes and defaultEdges need <FlowingerCanvas>');
  });
});

describe('the whole canvas owning the edges', () => {
  it('applies its own changes to them: a click selects one, and the delete key removes it', async () => {
    const { container } = render(
      <FlowingerCanvas defaultNodes={pair()} defaultEdges={[{ id: 'ab', source: 'a', target: 'b' }]} elementsSelectable />,
    );
    const edge = must<SVGGElement>(container, '[data-testid="edge-ab"]');
    fireEvent.click(must(edge, '.flowinger-edge-interaction'));
    expect(edge.classList.contains('selected')).toBe(true); // an edge's `selected` is state it holds itself
    await act(async () => {
      fireEvent.keyDown(pane(container), { key: 'Backspace' });
    });
    expect(container.querySelector('[data-testid="edge-ab"]')).toBeNull();
    expect(container.querySelectorAll('.flowinger-node')).toHaveLength(2);
  });
});

describe('features given one at a time', () => {
  it('drag: a node follows the pointer, and only with the feature', () => {
    const { container } = render(<Controlled nodesDraggable features={[dragFeature]} />);
    const a = node(container, 'a');
    fireEvent.pointerDown(a, pointer({ clientX: 10, clientY: 10 }));
    fireEvent.pointerMove(a, pointer({ clientX: 60, clientY: 40 }));
    expect(at(container, 'a')).toBe('translate(50px, 30px)');
    expect(a.classList.contains('dragging')).toBe(true);
    fireEvent.pointerUp(a, pointer({ clientX: 60, clientY: 40 }));
    expect(a.classList.contains('dragging')).toBe(false);
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1)'); // the press did not pan
  });

  it('connect: handles take the pointer, and reconnect brings it along', () => {
    const types = { p: () => <Handle id="out" type="source" position={Position.Bottom} /> };
    for (const features of [[connectFeature], [reconnectFeature]]) {
      const { container, unmount } = render(
        <FlowingerCore nodes={[box('a', 0, 0, { type: 'p' })]} nodeTypes={types} nodesConnectable features={features} />,
      );
      const handle = must<HTMLElement>(container, '[data-handleid="out"]');
      expect(handle.getAttribute('data-connectable')).toBe('true');
      expect(handle.style.pointerEvents).toBe('all');
      unmount();
    }
  });

  it('a node opts out of connecting by itself, with the feature on', () => {
    const types = { p: () => <Handle id="out" type="source" position={Position.Bottom} /> };
    const { container } = render(
      <FlowingerCore
        nodes={[box('a', 0, 0, { type: 'p', connectable: false })]}
        nodeTypes={types}
        nodesConnectable
        features={[connectFeature]}
      />,
    );
    expect(must(container, '[data-handleid="out"]').hasAttribute('data-connectable')).toBe(false);
  });

  it('boxSelect: a Shift-drag draws the box and selects what it covers', () => {
    const { container } = render(
      <Controlled elementsSelectable features={[boxSelectFeature]} onChange={() => {}} />,
    );
    fireEvent.pointerDown(pane(container), pointer({ clientX: 0, clientY: 0, shiftKey: true }));
    fireEvent.pointerMove(pane(container), pointer({ clientX: 150, clientY: 100, shiftKey: true }));
    expect(container.querySelector('.flowinger-selection')).not.toBeNull();
    expect(node(container, 'a').classList.contains('selected')).toBe(true);
    expect(node(container, 'b').classList.contains('selected')).toBe(false);
    fireEvent.pointerUp(pane(container), pointer({ clientX: 150, clientY: 100 }));
    expect(container.querySelector('.flowinger-selection')).toBeNull();
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1)');
  });

  it('delete: the key removes the selection', async () => {
    const changes: NodeChange[] = [];
    const { container } = render(
      <Controlled elementsSelectable features={[deleteFeature]} onChange={(c) => changes.push(...c)} />,
    );
    fireEvent.click(node(container, 'a'));
    // Deleting waits for `onBeforeDelete`, if there is one, so the change is a moment behind the key.
    await act(async () => {
      fireEvent.keyDown(node(container, 'a'), { key: 'Backspace' });
    });
    expect(changes).toContainEqual({ type: 'remove', id: 'a' });
  });

  it('culling: is a feature like the rest, and installs on its own', () => {
    const store = createFlowingerStore();
    store.use([cullingFeature]);
    expect(store.api(cullingFeature)).toEqual({});
  });
});

describe('a feature of your own', () => {
  it('reaches every slot, in the order the features were given', () => {
    const seen: string[] = [];
    const key = vi.fn(() => true);
    const mine = (name: string, extra: Partial<Feature> = {}): Feature => ({
      name,
      useNode: ({ node: n }) => {
        seen.push(`${name}:${n.id}`);
        return { style: { opacity: name === 'one' ? 0.5 : 0.25 } };
      },
      Layer: () => <div data-testid={`layer-${name}`} />,
      ...extra,
    });
    const { container } = render(
      <FlowingerCanvas
        nodes={pair()}
        features={[
          mine('one', { useCanvas: () => ({ onKeyDown: key, style: { outline: 'none' }, focusable: true }) }),
          mine('two'),
        ]}
      />,
    );
    expect(seen.slice(0, 4)).toEqual(['one:a', 'two:a', 'one:b', 'two:b']);
    expect(node(container, 'a').style.opacity).toBe('0.25'); // later features lay over earlier
    expect(container.querySelector('[data-testid="layer-one"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="layer-two"]')).not.toBeNull();
    expect(pane(container).getAttribute('tabindex')).toBe('-1'); // focusable, not a tab stop
    fireEvent.keyDown(pane(container), { key: 'x' });
    expect(key).toHaveBeenCalledTimes(1);
  });

  it('installs what it needs, and its methods are there for the slots', () => {
    let seen: unknown;
    const mine: Feature<{ hello: () => string }> = {
      name: 'mine',
      needs: [dragFeature],
      install: () => ({ hello: () => 'hi' }),
      useNode: ({ store }) => {
        seen = store.api(mine).hello();
        return undefined;
      },
    };
    const { container } = render(<Controlled nodesDraggable features={[mine]} />);
    expect(seen).toBe('hi');
    // …and the feature it needs is really there.
    const a = node(container, 'a');
    fireEvent.pointerDown(a, pointer({ clientX: 10, clientY: 10 }));
    fireEvent.pointerMove(a, pointer({ clientX: 30, clientY: 10 }));
    expect(at(container, 'a')).toBe('translate(20px, 0px)');
  });

  it('adds to the whole canvas: FlowingerCanvas keeps all of its own', () => {
    const mine: Feature = { name: 'mine', Layer: () => <div data-testid="mine" /> };
    const { container } = render(<Controlled nodesDraggable features={[...allFeatures, mine]} />);
    expect(container.querySelector('[data-testid="mine"]')).not.toBeNull();
    const a = node(container, 'a');
    fireEvent.pointerDown(a, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(a, pointer({ clientX: 30, clientY: 0 }));
    expect(at(container, 'a')).toBe('translate(30px, 0px)');
  });
});

describe('what a feature adds to the canvas’s own handling', () => {
  it('can take a key, and then the canvas does not act on it', () => {
    const takes = (key: string): Feature => ({
      name: 'keys',
      useCanvas: () => ({ onKeyDown: (e) => e.key === key }),
    });
    const { container } = render(<FlowingerCanvas nodes={pair()} keyboardNavigation features={[takes('ArrowRight')]} />);
    fireEvent.keyDown(pane(container), { key: 'ArrowRight' }); // taken: Right would have panned the view
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1)');
    fireEvent.keyDown(pane(container), { key: 'ArrowLeft' }); // not taken: the canvas pans
    expect(viewportOf(container)).toBe('translate(50px, 0px) scale(1)');
  });

  it('can take a press, and then it is not a pan', () => {
    const takes: Feature = { name: 'press', useCanvas: () => ({ onPointerDown: () => true }) };
    const { container } = render(<FlowingerCanvas nodes={pair()} features={[takes]} />);
    fireEvent.pointerDown(pane(container), pointer({ clientX: 100, clientY: 100 }));
    fireEvent.pointerMove(pane(container), pointer({ clientX: 160, clientY: 140 }));
    expect(viewportOf(container)).toBe('translate(0px, 0px) scale(1)');
  });

  it('lets a press go by that it does not take — and that is a pan', () => {
    const declines: Feature = { name: 'press', useCanvas: () => ({ onPointerDown: () => false }) };
    const { container } = render(<FlowingerCanvas nodes={pair()} features={[declines]} />);
    fireEvent.pointerDown(pane(container), pointer({ clientX: 100, clientY: 100 }));
    fireEvent.pointerMove(pane(container), pointer({ clientX: 160, clientY: 140 }));
    expect(viewportOf(container)).toBe('translate(60px, 40px) scale(1)');
  });

  it('makes the canvas focusable without a tab stop or a focus ring — unless it is a tab stop already', () => {
    const plain = render(<FlowingerCanvas nodes={pair()} elementsSelectable />);
    expect(pane(plain.container).getAttribute('tabindex')).toBe('-1');
    expect(pane(plain.container).style.outline).toBe('none');
    plain.unmount();
    const stop = render(<FlowingerCanvas nodes={pair()} elementsSelectable keyboardNavigation />);
    expect(pane(stop.container).getAttribute('tabindex')).toBe('0');
    expect(pane(stop.container).style.outline).toBe(''); // the browser's own ring stays
  });

  it('lays a feature’s style on the canvas, under the caller’s own', () => {
    const { container } = render(<FlowingerCanvas nodes={pair()} elementsSelectable selectionOnDrag />);
    expect(pane(container).style.cursor).toBe('crosshair');
    const own = render(<FlowingerCanvas nodes={pair()} elementsSelectable selectionOnDrag style={{ cursor: 'help' }} />);
    expect(pane(own.container).style.cursor).toBe('help');
  });
});
