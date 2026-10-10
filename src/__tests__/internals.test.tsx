import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import * as ReactFlowLib from '@xyflow/react';
import {
  FlowingerCanvas,
  FlowingerCore,
  FlowingerProvider,
  useInternalNode,
  useStoreApi,
  type Edge,
  type FlowingerInstance,
  type Node,
} from '../index.ts';

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const node = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
const edgeEl = (c: ParentNode, id: string) => must<SVGGElement>(c, `[data-testid="rf__edge-${id}"]`);

const nodes: Node[] = [
  { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
  { id: 'b', position: { x: 300, y: 0 }, width: 100, height: 40, data: {} },
];
const edges: Edge[] = [{ id: 'e', source: 'a', target: 'b' }];

describe('a node\'s ariaLabel, ariaRole and domAttributes', () => {
  it('is nothing by default: no role, no aria-label', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={nodes} />
      </div>,
    );
    const a = node(container, 'a');
    expect(a.hasAttribute('role')).toBe(false);
    expect(a.hasAttribute('aria-label')).toBe(false);
  });

  it('gives the node a role of "group" once it is a tab stop, and ariaLabel as its label', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={[{ ...nodes[0]!, ariaLabel: 'Scan' }]} elementsSelectable />
      </div>,
    );
    const a = node(container, 'a');
    expect(a.getAttribute('role')).toBe('group');
    expect(a.getAttribute('aria-label')).toBe('Scan');
  });

  it('lets ariaRole override the default role', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={[{ ...nodes[0]!, ariaRole: 'img' }]} elementsSelectable />
      </div>,
    );
    expect(node(container, 'a').getAttribute('role')).toBe('img');
  });

  it('adds an attribute flowinger has no prop for, through domAttributes', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={[{ ...nodes[0]!, domAttributes: { title: 'a scan', lang: 'en' } }]} />
      </div>,
    );
    const a = node(container, 'a');
    expect(a.getAttribute('title')).toBe('a scan');
    expect(a.getAttribute('lang')).toBe('en');
  });

  it('domAttributes wins over the engine\'s own attributes it does not exclude, e.g. tabIndex', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={[{ ...nodes[0]!, domAttributes: { tabIndex: 7 } }]} elementsSelectable />
      </div>,
    );
    // Selectable makes it a tab stop at 0; domAttributes overrides that, last.
    expect(node(container, 'a').getAttribute('tabindex')).toBe('7');
  });

  it('does not let domAttributes replace the engine\'s own id, style or className', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore
          nodes={[{ ...nodes[0]!, className: 'mine', domAttributes: { title: 'x' } as never }]}
        />
      </div>,
    );
    const a = node(container, 'a');
    expect(a.getAttribute('data-id')).toBe('a');
    expect(a.classList.contains('mine')).toBe(true);
    expect(a.getAttribute('title')).toBe('x');
  });
});

describe('an edge\'s ariaLabel, ariaRole and domAttributes', () => {
  it('keeps its own default: a button once selectable and focusable, "Edge from a to b"', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={nodes} edges={edges} elementsSelectable />
      </div>,
    );
    const e = edgeEl(container, 'e');
    expect(e.getAttribute('role')).toBe('button');
    expect(e.getAttribute('aria-label')).toBe('Edge from a to b');
  });

  it('lets ariaLabel and ariaRole override that default', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas
          nodes={nodes}
          edges={[{ ...edges[0]!, ariaLabel: 'the join', ariaRole: 'img' }]}
          elementsSelectable
        />
      </div>,
    );
    const e = edgeEl(container, 'e');
    expect(e.getAttribute('role')).toBe('img');
    expect(e.getAttribute('aria-label')).toBe('the join');
  });

  it('has neither role nor aria-label when it cannot be selected', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={nodes} edges={edges} />
      </div>,
    );
    const e = edgeEl(container, 'e');
    expect(e.hasAttribute('role')).toBe(false);
    expect(e.hasAttribute('aria-label')).toBe(false);
  });

  it('adds an attribute flowinger has no prop for, through domAttributes', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={nodes} edges={[{ ...edges[0]!, domAttributes: { 'aria-hidden': true } }]} />
      </div>,
    );
    expect(edgeEl(container, 'e').getAttribute('aria-hidden')).toBe('true');
  });
});

describe('getInternalNode and useInternalNode, against React Flow\'s', () => {
  const graph: Node[] = [
    { id: 'p', position: { x: 50, y: 60 }, width: 300, height: 200, data: {} },
    { id: 'c', position: { x: 10, y: 10 }, width: 80, height: 30, data: {}, parentId: 'p' },
  ];

  it('positionAbsolute is React Flow\'s: its own position plus every ancestor\'s', () => {
    let instance: FlowingerInstance | undefined;
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={graph} onInit={(i) => (instance = i)} />
      </div>,
    );
    expect(instance?.getInternalNode('p')?.internals.positionAbsolute).toEqual({ x: 50, y: 60 });
    expect(instance?.getInternalNode('c')?.internals.positionAbsolute).toEqual({ x: 60, y: 70 });

    let rf: ReactFlowLib.ReactFlowInstance | undefined;
    const Grab = () => {
      rf = ReactFlowLib.useReactFlow();
      return null;
    };
    render(
      <ReactFlowLib.ReactFlowProvider>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlowLib.ReactFlow nodes={graph as never} defaultEdges={[]}>
            <Grab />
          </ReactFlowLib.ReactFlow>
        </div>
      </ReactFlowLib.ReactFlowProvider>,
    );
    expect(rf?.getInternalNode('p')?.internals.positionAbsolute).toEqual(
      instance?.getInternalNode('p')?.internals.positionAbsolute,
    );
    expect(rf?.getInternalNode('c')?.internals.positionAbsolute).toEqual(
      instance?.getInternalNode('c')?.internals.positionAbsolute,
    );
  });

  it('is undefined for a node that is not there', () => {
    let instance: FlowingerInstance | undefined;
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={graph} onInit={(i) => (instance = i)} />
      </div>,
    );
    expect(instance?.getInternalNode('nope')).toBeUndefined();
  });

  it('z is 1 + depth by default, and the node\'s own zIndex otherwise', () => {
    let instance: FlowingerInstance | undefined;
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore
          nodes={[...graph, { id: 'z', position: { x: 0, y: 0 }, data: {}, zIndex: 42 }]}
          onInit={(i) => (instance = i)}
        />
      </div>,
    );
    expect(instance?.getInternalNode('p')?.internals.z).toBe(1);
    expect(instance?.getInternalNode('c')?.internals.z).toBe(2);
    expect(instance?.getInternalNode('z')?.internals.z).toBe(42);
  });

  it('agrees with what is actually drawn: the same z as the node\'s own zIndex style', () => {
    let instance: FlowingerInstance | undefined;
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={graph} onInit={(i) => (instance = i)} />
      </div>,
    );
    expect(node(container, 'c').style.zIndex).toBe(String(instance?.getInternalNode('c')?.internals.z));
  });

  it('is the resolved snapshot, not the raw node: a drag\'s position, an uncontrolled selection', () => {
    let instance: FlowingerInstance | undefined;
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={graph} elementsSelectable onInit={(i) => (instance = i)} />
      </div>,
    );
    expect(instance?.getInternalNode('p')?.selected).toBe(false);
    fireEvent.click(node(container, 'p'));
    expect(instance?.getInternalNode('p')?.selected).toBe(true);
  });

  it('useInternalNode moves when a controlled position changes', () => {
    function Reader({ seen }: { seen: (n: ReturnType<typeof useInternalNode>) => void }) {
      seen(useInternalNode('p'));
      return null;
    }
    const seenValues: (ReturnType<typeof useInternalNode>)[] = [];
    const view = render(
      <FlowingerProvider>
        <Reader seen={(n) => seenValues.push(n)} />
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCore nodes={graph} onNodesChange={() => {}} />
        </div>
      </FlowingerProvider>,
    );
    expect(seenValues[seenValues.length - 1]?.internals.positionAbsolute).toEqual({ x: 50, y: 60 });
    view.rerender(
      <FlowingerProvider>
        <Reader seen={(n) => seenValues.push(n)} />
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCore
            nodes={[{ ...graph[0]!, position: { x: 5, y: 5 } }, graph[1]!]}
            onNodesChange={() => {}}
          />
        </div>
      </FlowingerProvider>,
    );
    expect(seenValues[seenValues.length - 1]?.internals.positionAbsolute).toEqual({ x: 5, y: 5 });
  });

  it('useInternalNode reacts to an uncontrolled selection alone (no move, no geometry bump)', () => {
    function Reader({ seen }: { seen: (n: ReturnType<typeof useInternalNode>) => void }) {
      seen(useInternalNode('p'));
      return null;
    }
    const seenValues: (ReturnType<typeof useInternalNode>)[] = [];
    const { container } = render(
      <FlowingerProvider>
        <Reader seen={(n) => seenValues.push(n)} />
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCanvas nodes={graph} elementsSelectable />
        </div>
      </FlowingerProvider>,
    );
    expect(seenValues[seenValues.length - 1]?.selected).toBe(false);
    fireEvent.click(node(container, 'p'));
    expect(seenValues[seenValues.length - 1]?.selected).toBe(true);
  });

  it('is undefined outside any provider, and for a node that is not there', () => {
    function Reader({ seen }: { seen: (n: ReturnType<typeof useInternalNode>) => void }) {
      seen(useInternalNode('nope'));
      return null;
    }
    const seenValues: (ReturnType<typeof useInternalNode>)[] = [];
    render(<Reader seen={(n) => seenValues.push(n)} />);
    expect(seenValues[0]).toBeUndefined();
  });
});

describe('useInternalNode does not loop once a node has been measured', () => {
  it('settles to one snapshot after a real DOM measurement has populated `measured`', async () => {
    // jsdom lays nothing out, but the layout effect still runs and populates a `Size` for the node —
    // `snapshotNode` used to rebuild `measured` as a fresh object every call, so two synchronous reads
    // (React's own stability check) never compared equal, and `useSyncExternalStore` looped forever.
    const seen: (ReturnType<typeof useInternalNode>)[] = [];
    function Reader() {
      seen.push(useInternalNode('a'));
      return null;
    }
    expect(() => {
      render(
        <FlowingerProvider>
          <Reader />
          <div style={{ width: 800, height: 600 }}>
            <FlowingerCore nodes={[{ id: 'a', position: { x: 0, y: 0 }, data: {} }]} />
          </div>
        </FlowingerProvider>,
      );
    }).not.toThrow();
    expect(seen[seen.length - 1]?.id).toBe('a');
  });
});

describe('useStoreApi', () => {
  it('getState() reads without subscribing: it does not change between calls until asked again', () => {
    let api: ReturnType<typeof useStoreApi> | undefined;
    function Grab() {
      api = useStoreApi();
      return null;
    }
    render(
      <FlowingerProvider>
        <Grab />
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCore nodes={nodes} />
        </div>
      </FlowingerProvider>,
    );
    expect(api?.getState().nodes).toHaveLength(2);
    expect(api?.getState().isReady).toBe(true);
  });

  it('subscribe() fires on a state change, and stops once unsubscribed', () => {
    let api: ReturnType<typeof useStoreApi> | undefined;
    let instance: FlowingerInstance | undefined;
    function Grab() {
      api = useStoreApi();
      return null;
    }
    render(
      <FlowingerProvider>
        <Grab />
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCore nodes={nodes} onInit={(i) => (instance = i)} />
        </div>
      </FlowingerProvider>,
    );
    const heard = vi.fn();
    const unsubscribe = api?.subscribe(heard);
    act(() => {
      void instance?.setViewport({ x: 10, y: 0, zoom: 1 });
    });
    expect(heard).toHaveBeenCalled();
    unsubscribe?.();
    heard.mockClear();
    act(() => {
      void instance?.setViewport({ x: 20, y: 0, zoom: 1 });
    });
    expect(heard).not.toHaveBeenCalled();
  });

  it('is the same function across renders, so it can go in a dependency list', () => {
    const seen: ReturnType<typeof useStoreApi>[] = [];
    function Grab() {
      seen.push(useStoreApi());
      return null;
    }
    const { rerender } = render(
      <FlowingerProvider>
        <Grab />
      </FlowingerProvider>,
    );
    rerender(
      <FlowingerProvider>
        <Grab />
      </FlowingerProvider>,
    );
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
  });

  it('throws outside a provider, like the other hooks', () => {
    function Grab() {
      useStoreApi();
      return null;
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Grab />)).toThrow(/FlowingerProvider/);
    spy.mockRestore();
  });
});
