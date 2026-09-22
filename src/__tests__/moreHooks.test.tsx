import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import {
  FlowingerCanvas,
  FlowingerCore,
  FlowingerProvider,
  Handle,
  Position,
  useConnection,
  useHandleConnections,
  type ConnectionState,
  type Edge,
  type Node,
} from '../index.ts';

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
describe('the canvas\'s own id and domAttributes', () => {
  const nodes: Node[] = [{ id: 'a', position: { x: 0, y: 0 }, data: {} }];

  it('sets id on the canvas\'s own element', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={nodes} id="the-canvas" />
      </div>,
    );
    expect(must(container, '.react-flow').id).toBe('the-canvas');
  });

  it('adds an attribute flowinger has no prop for, through domAttributes', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={nodes} domAttributes={{ title: 'a diagram', lang: 'en' }} />
      </div>,
    );
    const pane = must(container, '.react-flow');
    expect(pane.getAttribute('title')).toBe('a diagram');
    expect(pane.getAttribute('lang')).toBe('en');
  });

  it('takes a data-* attribute too, with a cast — HTMLAttributes does not declare it by name', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={nodes} domAttributes={{ 'data-testid': 'diagram' } as never} />
      </div>,
    );
    expect(must(container, '.react-flow').getAttribute('data-testid')).toBe('diagram');
  });

  it('does not let domAttributes replace the engine\'s own className, or its click/key handling', () => {
    const onPaneClick = vi.fn();
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore
          nodes={nodes}
          onPaneClick={onPaneClick}
          domAttributes={{ 'data-testid': 'diagram' } as never}
        />
      </div>,
    );
    const pane = must(container, '.react-flow');
    expect(pane.classList.contains('react-flow')).toBe(true);
    fireEvent.click(pane);
    expect(onPaneClick).toHaveBeenCalledTimes(1);
  });

  it('domAttributes wins over the engine\'s own attributes it does not exclude, e.g. aria-label', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={nodes} keyboardNavigation domAttributes={{ 'aria-label': 'Custom name' }} />
      </div>,
    );
    // keyboardNavigation sets aria-label to ariaLabel ("Diagram"); domAttributes overrides that, last.
    expect(must(container, '.react-flow').getAttribute('aria-label')).toBe('Custom name');
  });

  it('is the whole canvas too', () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas nodes={nodes} id="whole" domAttributes={{ title: 'x' }} />
      </div>,
    );
    const pane = must(container, '.react-flow');
    expect(pane.id).toBe('whole');
    expect(pane.getAttribute('title')).toBe('x');
  });
});

describe('useHandleConnections', () => {
  const nodes: Node[] = [
    { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
    { id: 'b', position: { x: 200, y: 0 }, width: 100, height: 40, data: {} },
    { id: 'c', position: { x: 400, y: 0 }, width: 100, height: 40, data: {} },
  ];
  const edges: Edge[] = [
    { id: 'ab', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in' },
    { id: 'ac', source: 'a', target: 'c' },
  ];

  it('is useNodeConnections narrowed to one handle: matches it field for field', () => {
    let viaHandle: unknown;
    function ByHandle() {
      viaHandle = useHandleConnections({ type: 'source', id: 'out', nodeId: 'a' });
      return null;
    }
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={nodes} edges={edges}>
          <ByHandle />
        </FlowingerCore>
      </div>,
    );
    expect(viaHandle).toEqual([
      { edgeId: 'ab', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in' },
    ]);
  });

  it('reads null and an explicit id the same way (React Flow\'s own reading: neither narrows alone)', () => {
    let seen: unknown;
    function Reader() {
      seen = useHandleConnections({ type: 'source', nodeId: 'a' });
      return null;
    }
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={nodes} edges={edges}>
          <Reader />
        </FlowingerCore>
      </div>,
    );
    // Both edges leave 'a' as a source; asking for the type alone (no id) finds both.
    expect((seen as { edgeId: string }[]).map((c) => c.edgeId).sort()).toEqual(['ab', 'ac']);
  });

  it('reports what appeared and what went', () => {
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    function Reader() {
      useHandleConnections({ type: 'target', id: 'in', nodeId: 'b', onConnect, onDisconnect });
      return null;
    }
    const { rerender } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={nodes} edges={[]}>
          <Reader />
        </FlowingerCore>
      </div>,
    );
    expect(onConnect).not.toHaveBeenCalled();
    rerender(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={nodes} edges={[edges[0]!]}>
          <Reader />
        </FlowingerCore>
      </div>,
    );
    expect(onConnect).toHaveBeenCalledTimes(1);
    rerender(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={nodes} edges={[]}>
          <Reader />
        </FlowingerCore>
      </div>,
    );
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });
});

describe('useConnection', () => {
  function Ports() {
    return (
      <div>
        <Handle id="in" type="target" position={Position.Top} />
        <Handle id="out" type="source" position={Position.Bottom} />
      </div>
    );
  }
  const types = { ports: Ports };
  const nodes: Node[] = [
    { id: 'a', type: 'ports', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
    { id: 'b', type: 'ports', position: { x: 0, y: 200 }, width: 100, height: 40, data: {} },
  ];
  const handle = (c: ParentNode, n: string, id: string) =>
    must<HTMLElement>(c, `[data-id="${n}"] [data-handleid="${id}"]`);
  const pointerOver = (el: Element | null) =>
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => el });
  afterEach(() => {
    Reflect.deleteProperty(document, 'elementFromPoint');
  });
  const press = (el: Element, x: number, y: number) => fireEvent.pointerDown(el, pointer({ clientX: x, clientY: y }));
  const move = (x: number, y: number) => fireEvent.pointerMove(window, pointer({ clientX: x, clientY: y }));
  const release = (x: number, y: number) => fireEvent.pointerUp(window, pointer({ clientX: x, clientY: y }));

  function watch() {
    const seen: ConnectionState[] = [];
    function Reader() {
      seen.push(useConnection());
      return null;
    }
    return { seen, Reader };
  }

  /** The canvas, with `Reader` mounted inside it — inside the same provider. */
  const canvas = (Reader: () => null, Canvas: typeof FlowingerCanvas | typeof FlowingerCore = FlowingerCanvas) => (
    <div style={{ width: 800, height: 600 }}>
      <Canvas nodes={nodes} nodeTypes={types} nodesConnectable>
        <Reader />
      </Canvas>
    </div>
  );

  it('is no connection before a drag starts', () => {
    const { seen, Reader } = watch();
    render(canvas(Reader));
    const last = seen[seen.length - 1]!;
    expect(last.inProgress).toBe(false);
    expect(last).toMatchObject({ isValid: null, from: null, to: null, fromNode: null, toNode: null });
  });

  it('reports the drag: fromNode/fromHandle, where the pointer is, and isValid null over nothing', () => {
    pointerOver(null);
    const { seen, Reader } = watch();
    const { container } = render(canvas(Reader));
    press(handle(container, 'a', 'out'), 50, 40);
    const during = seen[seen.length - 1]!;
    expect(during.inProgress).toBe(true);
    if (!during.inProgress) throw new Error('unreachable');
    expect(during.fromNode.id).toBe('a');
    expect(during.fromHandle).toEqual({ nodeId: 'a', id: 'out', type: 'source' });
    expect(during.from).toEqual({ x: 50, y: 40 });
    expect(during.isValid).toBeNull();
    expect(during.toNode).toBeNull();
    expect(during.toHandle).toBeNull();
    move(300, 120);
    const moved = seen[seen.length - 1]!;
    if (!moved.inProgress) throw new Error('unreachable');
    expect(moved.to).toEqual({ x: 300, y: 120 });
    release(300, 120);
    expect(seen[seen.length - 1]!.inProgress).toBe(false);
  });

  it('reports the hovered handle and node once over one, valid or not', () => {
    const { seen, Reader } = watch();
    const { container } = render(canvas(Reader));
    pointerOver(handle(container, 'b', 'in'));
    press(handle(container, 'a', 'out'), 50, 40);
    move(50, 200);
    const over = seen[seen.length - 1]!;
    if (!over.inProgress) throw new Error('unreachable');
    expect(over.toNode?.id).toBe('b');
    expect(over.toHandle).toEqual({ nodeId: 'b', id: 'in', type: 'target' });
    expect(over.isValid).toBe(true);
    release(50, 200);
  });

  it('says isValid: false over an incompatible handle, still naming it', () => {
    const { seen, Reader } = watch();
    const { container } = render(canvas(Reader));
    // Two source handles: strict mode refuses source-to-source.
    pointerOver(handle(container, 'b', 'out'));
    press(handle(container, 'a', 'out'), 50, 40);
    move(50, 240);
    const over = seen[seen.length - 1]!;
    if (!over.inProgress) throw new Error('unreachable');
    expect(over.toHandle).toEqual({ nodeId: 'b', id: 'out', type: 'source' });
    expect(over.isValid).toBe(false);
    release(50, 240);
  });

  it('a selector narrows what is returned', () => {
    const validity: (boolean | null)[] = [];
    function Reader() {
      validity.push(useConnection((c) => c.isValid));
      return null;
    }
    const { container } = render(canvas(Reader));
    press(handle(container, 'a', 'out'), 50, 40);
    expect(validity[validity.length - 1]).toBeNull();
    release(50, 40);
  });

  it('is no connection on a core without the connect feature, even while a handle is pressed', () => {
    const { seen, Reader } = watch();
    const { container } = render(canvas(Reader, FlowingerCore));
    // No connectFeature: a handle takes no pointer events at all, so a press starts nothing.
    expect(handle(container, 'a', 'out').style.pointerEvents).toBe('none');
    press(handle(container, 'a', 'out'), 50, 40);
    expect(seen[seen.length - 1]!.inProgress).toBe(false);
  });

  it('drops back to no connection once the dragged-from node is gone and the pointer moves again', () => {
    // Removing the node alone does not touch `subscribeConnection` — nothing here watches the node list
    // on its own — so this only resolves on the next thing that does move the connection: the pointer.
    const { seen, Reader } = watch();
    const { container, rerender } = render(canvas(Reader));
    press(handle(container, 'a', 'out'), 50, 40);
    expect(seen[seen.length - 1]!.inProgress).toBe(true);
    act(() => {
      rerender(
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCanvas nodes={[nodes[1]!]} nodeTypes={types} nodesConnectable>
            <Reader />
          </FlowingerCanvas>
        </div>,
      );
    });
    move(60, 50);
    expect(seen[seen.length - 1]!.inProgress).toBe(false);
  });

  it('applies a selector on the very first (server) snapshot too', () => {
    function Reader() {
      const isValid = useConnection((c) => c.isValid);
      return <span>{String(isValid)}</span>;
    }
    const html = renderToString(
      <FlowingerProvider>
        <Reader />
      </FlowingerProvider>,
    );
    expect(html).toContain('null');
    expect(html).not.toContain('[object Object]');
  });
});
