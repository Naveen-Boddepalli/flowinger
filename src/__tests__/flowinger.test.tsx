import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  FlowingerCanvas,
  FlowingerProvider,
  Controls,
  Handle,
  Position,
  getBezierPath,
  getStraightPath,
  getSmoothStepPath,
  useFlowinger,
  useStore,
  useViewport,
  type Edge,
  type FlowingerInstance,
  type Node,
  type NodeProps,
} from '../index.ts';

const renders: Record<string, number> = {};

function TestNode({ id, data }: NodeProps) {
  // An effect with no deps runs once per commit — a render count that React's
  // purity rules allow, and the one a re-render regression would move.
  useEffect(() => {
    renders[id] = (renders[id] ?? 0) + 1;
  });
  return (
    <div data-testid={`custom-node-${id}`}>
      <Handle id="in" type="target" position={Position.Top} />
      <span>{String(data.label)}</span>
      <button type="button" onClick={() => (data.onPress as (() => void) | undefined)?.()}>
        press {id}
      </button>
      <Handle id="out" type="source" position={Position.Bottom} />
    </div>
  );
}

const testNodeTypes = { test: TestNode };

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}

/** Reads the viewport transform back into numbers. */
function viewportOf(container: ParentNode) {
  const t = must<HTMLElement>(container, '.flowinger-viewport').style.transform;
  const num = '(-?[\\d.]+(?:e[-+]?\\d+)?)'; // float noise can print as 5.7e-14, which is valid CSS
  const m = new RegExp(`translate\\(${num}px, ${num}px\\) scale\\(${num}\\)`).exec(t);
  if (!m) throw new Error(`unparseable transform: ${t}`);
  return { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) };
}

const sized = (el: Element, width: number, height: number) => {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: height });
};

const pointer = (extra: Record<string, number>) => ({ pointerId: 1, button: 0, ...extra });

afterEach(() => {
  for (const key of Object.keys(renders)) delete renders[key];
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Flowinger Engine', () => {
  describe('Path Generators', () => {
    it('generates straight path coordinates', () => {
      const [path, lx, ly] = getStraightPath({
        sourceX: 0,
        sourceY: 0,
        targetX: 100,
        targetY: 100,
      });
      expect(path).toBe('M 0.00 0.00 L 100.00 100.00');
      expect(lx).toBe(50);
      expect(ly).toBe(50);
    });

    it('generates smooth cubic bezier path coordinates', () => {
      const [path, lx, ly] = getBezierPath({
        sourceX: 50,
        sourceY: 50,
        sourcePosition: Position.Bottom,
        targetX: 50,
        targetY: 150,
        targetPosition: Position.Top,
      });
      expect(path).toContain('M 50.00 50.00 C');
      expect(path).toContain('50.00 150.00');
      expect(lx).toBe(50);
      expect(ly).toBe(100);
    });

    it('generates smooth step path coordinates', () => {
      const [path, lx, ly] = getSmoothStepPath({
        sourceX: 10,
        sourceY: 10,
        sourcePosition: Position.Bottom,
        targetX: 30,
        targetY: 50,
        targetPosition: Position.Top,
      });
      expect(path).toBe('M 10.00 10.00 L 10.00 30.00 L 30.00 30.00 L 30.00 50.00');
      expect(lx).toBe(20);
      expect(ly).toBe(30);
    });
  });

  describe('Canvas & Nodes Rendering', () => {
    const nodes: Node[] = [
      { id: 'node-1', type: 'test', position: { x: 100, y: 50 }, data: { label: 'Root Node' } },
      { id: 'node-2', type: 'test', position: { x: 100, y: 200 }, data: { label: 'Child Node' } },
    ];

    const edges: Edge[] = [
      {
        id: 'e1-2',
        source: 'node-1',
        target: 'node-2',
        sourceHandle: 'out',
        targetHandle: 'in',
        className: 'is-active',
      },
    ];

    it('renders nodes with their transformed coordinates and content', () => {
      const { container } = render(
        <FlowingerCanvas nodes={nodes} edges={edges} nodeTypes={testNodeTypes} />,
      );

      expect(screen.getByText('Root Node')).toBeInTheDocument();
      expect(screen.getByText('Child Node')).toBeInTheDocument();
      expect(screen.getByTestId('custom-node-node-1')).toBeInTheDocument();
      expect(must<HTMLElement>(container, '[data-id="node-2"]').style.transform).toBe(
        'translate(100px, 200px)',
      );
    });

    it('renders SVG edges with appropriate classes and bezier paths', () => {
      const { container } = render(
        <FlowingerCanvas nodes={nodes} edges={edges} nodeTypes={testNodeTypes} />,
      );

      const edgeEl = must(container, '[data-testid="edge-e1-2"]');
      expect(edgeEl.classList.contains('is-active')).toBe(true);
      expect(must(edgeEl, 'path').getAttribute('d')).toContain('M');
    });

    it('keeps the react-flow__* class names stylesheets and browser tests select on', () => {
      const { container } = render(
        <FlowingerCanvas nodes={nodes} edges={edges} nodeTypes={testNodeTypes} />,
      );
      for (const selector of [
        '.react-flow',
        '.react-flow__viewport',
        '.react-flow__node',
        '.react-flow__edge',
        '.react-flow__edge-path',
      ]) {
        expect(container.querySelector(selector), selector).not.toBeNull();
      }
    });

    it('starts at the identity transform, which marks a viewport that has never moved', () => {
      const { container } = render(<FlowingerCanvas nodes={nodes} nodeTypes={testNodeTypes} />);
      expect(must<HTMLElement>(container, '.flowinger-viewport').style.transform).toBe(
        'translate(0px, 0px) scale(1)',
      );
    });

    it('anchors an edge to the measured node size, not the declared one', () => {
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40);
      const { container } = render(
        <FlowingerCanvas nodes={nodes} edges={edges} nodeTypes={testNodeTypes} />,
      );
      // node-1 sits at (100, 50): bottom-centre is (150, 90). node-2's top-centre is (150, 200).
      const d = must(container, '[data-testid="edge-e1-2"] path').getAttribute('d');
      expect(d).toMatch(/^M 150\.00 90\.00 C/);
      expect(d).toMatch(/150\.00 200\.00$/);
    });

    it('draws an edge with no stroke of its own visibly by default', () => {
      const { container } = render(
        <FlowingerCanvas nodes={nodes} edges={edges} nodeTypes={testNodeTypes} />,
      );
      expect(must(container, '.react-flow__edge-path').getAttribute('stroke')).toBeTruthy();
    });
  });

  describe('viewport state', () => {
    function ViewportProbe() {
      const viewport = useViewport();
      const { setViewport, zoomIn, zoomOut } = useFlowinger();
      return (
        <div>
          <span data-testid="vp-zoom">{viewport.zoom}</span>
          <span data-testid="vp-x">{viewport.x}</span>
          <span data-testid="vp-y">{viewport.y}</span>
          <button onClick={() => { setViewport({ x: 50, y: 75, zoom: 1.5 }); }}>Set</button>
          <button onClick={() => { zoomIn(); }}>In</button>
          <button onClick={() => { zoomOut(); }}>Out</button>
        </div>
      );
    }

    it('provides the initial viewport, and follows changes made through the controls', () => {
      render(
        <FlowingerProvider initialViewport={{ x: 10, y: 20, zoom: 1 }}>
          <ViewportProbe />
        </FlowingerProvider>,
      );
      expect(screen.getByTestId('vp-zoom').textContent).toBe('1');
      expect(screen.getByTestId('vp-x').textContent).toBe('10');
      expect(screen.getByTestId('vp-y').textContent).toBe('20');

      fireEvent.click(screen.getByText('Set'));
      expect(screen.getByTestId('vp-zoom').textContent).toBe('1.5');
      expect(screen.getByTestId('vp-x').textContent).toBe('50');

      fireEvent.click(screen.getByText('In'));
      expect(Number(screen.getByTestId('vp-zoom').textContent)).toBeCloseTo(1.875);
      fireEvent.click(screen.getByText('Out'));
      expect(Number(screen.getByTestId('vp-zoom').textContent)).toBeCloseTo(1.5);
    });

    it('throws a useful error for a hook used outside any provider', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => render(<ViewportProbe />)).toThrow(/FlowingerProvider/);
    });
  });

  describe('panZoom identity (the runaway-render regression)', () => {
    it('is null until a canvas mounts, then one stable object for good', () => {
      const seen = new Set<FlowingerInstance | null>();
      function Watch() {
        seen.add(useStore((s) => s.panZoom));
        return null;
      }
      function Move() {
        const { setViewport } = useFlowinger();
        return (
          <button onClick={() => { setViewport({ x: Math.random() * 100, y: 1, zoom: 1 }); }}>
            move
          </button>
        );
      }

      render(
        <FlowingerProvider>
          <Watch />
          <Move />
          <FlowingerCanvas nodes={[]} />
        </FlowingerProvider>,
      );
      for (let i = 0; i < 5; i++) fireEvent.click(screen.getByText('move'));

      const real = [...seen].filter((s) => s !== null);
      expect(seen.has(null)).toBe(true); // rendered once before the canvas attached
      expect(real).toHaveLength(1); // …and never a second, different instance
    });

    it('does not re-render forever when an effect drives the viewport off panZoom', async () => {
      // A framing effect keyed on panZoom has exactly this shape. When panZoom was
      // rebuilt on every provider render, this looped without end.
      let renderCount = 0;
      function Framer() {
        useEffect(() => {
          renderCount += 1;
        });
        const panZoom = useStore((s) => s.panZoom);
        useEffect(() => {
          panZoom?.setViewport({ x: 10, y: 20, zoom: 1 });
        }, [panZoom]);
        return null;
      }

      render(
        <FlowingerProvider>
          <Framer />
          <FlowingerCanvas nodes={[]} />
        </FlowingerProvider>,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });
      expect(renderCount).toBeLessThan(5);
    });
  });

  describe('panning', () => {
    const nodes: Node[] = [
      { id: 'a', type: 'test', position: { x: 0, y: 0 }, data: { label: 'A' } },
    ];

    it('pans the viewport with a pointer drag on the canvas', () => {
      const { container } = render(<FlowingerCanvas nodes={nodes} nodeTypes={testNodeTypes} />);
      const pane = must(container, '.flowinger');
      fireEvent.pointerDown(pane, pointer({ clientX: 100, clientY: 100 }));
      fireEvent.pointerMove(pane, pointer({ clientX: 140, clientY: 125 }));
      expect(viewportOf(container)).toEqual({ x: 40, y: 25, zoom: 1 });
      fireEvent.pointerMove(pane, pointer({ clientX: 90, clientY: 100 }));
      expect(viewportOf(container)).toEqual({ x: -10, y: 0, zoom: 1 });
      fireEvent.pointerUp(pane, pointer({ clientX: 90, clientY: 100 }));
      fireEvent.pointerMove(pane, pointer({ clientX: 300, clientY: 300 }));
      expect(viewportOf(container)).toEqual({ x: -10, y: 0, zoom: 1 }); // released: no longer follows
    });

    it('treats a press that barely moves as a click, not a pan', () => {
      const { container } = render(<FlowingerCanvas nodes={nodes} nodeTypes={testNodeTypes} />);
      const pane = must(container, '.flowinger');
      fireEvent.pointerDown(pane, pointer({ clientX: 100, clientY: 100 }));
      fireEvent.pointerMove(pane, pointer({ clientX: 101, clientY: 101 }));
      expect(viewportOf(container)).toEqual({ x: 0, y: 0, zoom: 1 });
    });

    it('pans when the press starts on a node that is not draggable', () => {
      const { container } = render(<FlowingerCanvas nodes={nodes} nodeTypes={testNodeTypes} />);
      const nodeEl = must(container, '[data-id="a"]');
      fireEvent.pointerDown(nodeEl, pointer({ clientX: 10, clientY: 10 }));
      fireEvent.pointerMove(nodeEl, pointer({ clientX: 60, clientY: 10 }));
      expect(viewportOf(container).x).toBe(50);
    });

    it('leaves a press on a button inside a node to the button', () => {
      const onPress = vi.fn();
      const withButton: Node[] = [
        { id: 'a', type: 'test', position: { x: 0, y: 0 }, data: { label: 'A', onPress } },
      ];
      const { container } = render(<FlowingerCanvas nodes={withButton} nodeTypes={testNodeTypes} />);
      const button = screen.getByText('press a');
      fireEvent.pointerDown(button, pointer({ clientX: 10, clientY: 10 }));
      fireEvent.pointerMove(button, pointer({ clientX: 90, clientY: 90 }));
      fireEvent.click(button);
      expect(viewportOf(container)).toEqual({ x: 0, y: 0, zoom: 1 });
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('honours panOnDrag={false} and a button list', () => {
      const off = render(
        <FlowingerCanvas nodes={nodes} nodeTypes={testNodeTypes} panOnDrag={false} />,
      );
      const pane = must(off.container, '.flowinger');
      fireEvent.pointerDown(pane, pointer({ clientX: 0, clientY: 0 }));
      fireEvent.pointerMove(pane, pointer({ clientX: 50, clientY: 50 }));
      expect(viewportOf(off.container).x).toBe(0);
      off.unmount();

      const middleOnly = render(
        <FlowingerCanvas nodes={nodes} nodeTypes={testNodeTypes} panOnDrag={[1]} />,
      );
      const pane2 = must(middleOnly.container, '.flowinger');
      fireEvent.pointerDown(pane2, pointer({ button: 0, clientX: 0, clientY: 0 }));
      fireEvent.pointerMove(pane2, pointer({ clientX: 50, clientY: 50 }));
      expect(viewportOf(middleOnly.container).x).toBe(0);
      fireEvent.pointerUp(pane2, pointer({ clientX: 50, clientY: 50 }));
      fireEvent.pointerDown(pane2, pointer({ button: 1, clientX: 0, clientY: 0 }));
      fireEvent.pointerMove(pane2, pointer({ clientX: 50, clientY: 50 }));
      expect(viewportOf(middleOnly.container).x).toBe(50);
    });
  });

  describe('wheel zoom', () => {
    it('zooms about the cursor, keeping the point under it fixed, and stops the page scrolling', () => {
      const { container } = render(<FlowingerCanvas nodes={[]} />);
      const pane = must(container, '.flowinger');
      const notPrevented = fireEvent.wheel(pane, { deltaY: -100, clientX: 200, clientY: 100 });
      expect(notPrevented).toBe(false); // preventDefault was called

      const vp = viewportOf(container);
      expect(vp.zoom).toBeCloseTo(2 ** 0.2);
      expect((200 - vp.x) / vp.zoom).toBeCloseTo(200);
      expect((100 - vp.y) / vp.zoom).toBeCloseTo(100);
    });

    it('zooms out on a positive delta and respects minZoom / maxZoom', () => {
      const { container } = render(<FlowingerCanvas nodes={[]} minZoom={0.5} maxZoom={1.2} />);
      const pane = must(container, '.flowinger');
      fireEvent.wheel(pane, { deltaY: -10000, clientX: 0, clientY: 0 });
      expect(viewportOf(container).zoom).toBe(1.2);
      fireEvent.wheel(pane, { deltaY: 10000, clientX: 0, clientY: 0 });
      expect(viewportOf(container).zoom).toBe(0.5);
    });

    it('normalises line-mode wheels (Firefox) to pixels', () => {
      const pixels = render(<FlowingerCanvas nodes={[]} />);
      fireEvent.wheel(must(pixels.container, '.flowinger'), { deltaY: -100, deltaMode: 0 });
      const byPixels = viewportOf(pixels.container).zoom;
      pixels.unmount();

      const lines = render(<FlowingerCanvas nodes={[]} />);
      fireEvent.wheel(must(lines.container, '.flowinger'), { deltaY: -5, deltaMode: 1 });
      expect(viewportOf(lines.container).zoom).toBeCloseTo(byPixels); // 5 lines × 20px = 100px
    });

    it('leaves the page to scroll when zoomOnScroll is off', () => {
      const { container } = render(<FlowingerCanvas nodes={[]} zoomOnScroll={false} />);
      const notPrevented = fireEvent.wheel(must(container, '.flowinger'), { deltaY: -100 });
      expect(notPrevented).toBe(true);
      expect(viewportOf(container).zoom).toBe(1);
    });
  });

  describe('dragging nodes', () => {
    const nodes: Node[] = [
      { id: 'node-1', type: 'test', position: { x: 100, y: 50 }, data: { label: 'One' } },
      { id: 'node-2', type: 'test', position: { x: 100, y: 200 }, data: { label: 'Two' } },
    ];
    const edges: Edge[] = [
      { id: 'e', source: 'node-1', target: 'node-2', sourceHandle: 'out', targetHandle: 'in' },
    ];

    it('moves the node, its edge, and reports both ends of the drag', () => {
      const onNodeDrag = vi.fn();
      const onNodeDragStop = vi.fn();
      const { container } = render(
        <FlowingerCanvas
          nodes={nodes}
          edges={edges}
          nodeTypes={testNodeTypes}
          nodesDraggable
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
        />,
      );
      const one = must<HTMLElement>(container, '[data-id="node-1"]');
      const edgeBefore = must(container, '.react-flow__edge-path').getAttribute('d');

      fireEvent.pointerDown(one, pointer({ clientX: 0, clientY: 0 }));
      fireEvent.pointerMove(one, pointer({ clientX: 30, clientY: 20 }));
      expect(one.style.transform).toBe('translate(130px, 70px)');
      expect(must(container, '.react-flow__edge-path').getAttribute('d')).not.toBe(edgeBefore);
      expect(onNodeDrag).toHaveBeenCalledTimes(1);
      expect(onNodeDrag.mock.calls[0]?.[1]).toMatchObject({ id: 'node-1', position: { x: 130, y: 70 } });
      expect(one.classList.contains('dragging')).toBe(true);

      fireEvent.pointerUp(one, pointer({ clientX: 30, clientY: 20 }));
      expect(one.classList.contains('dragging')).toBe(false);
      expect(one.style.transform).toBe('translate(130px, 70px)'); // stays where it was dropped
      expect(onNodeDragStop.mock.calls[0]?.[1]).toMatchObject({ position: { x: 130, y: 70 } });
      // The parent's `nodes` array was never touched.
      expect(nodes[0]?.position).toEqual({ x: 100, y: 50 });
    });

    it('does not pan the canvas while a node is being dragged', () => {
      const { container } = render(
        <FlowingerCanvas nodes={nodes} nodeTypes={testNodeTypes} nodesDraggable />,
      );
      const one = must(container, '[data-id="node-1"]');
      fireEvent.pointerDown(one, pointer({ clientX: 0, clientY: 0 }));
      fireEvent.pointerMove(one, pointer({ clientX: 60, clientY: 60 }));
      expect(viewportOf(container)).toEqual({ x: 0, y: 0, zoom: 1 });
    });

    it('scales the drag by the zoom, so the node tracks the cursor', () => {
      const { container } = render(
        <FlowingerProvider initialViewport={{ x: 0, y: 0, zoom: 2 }}>
          <FlowingerCanvas nodes={nodes} nodeTypes={testNodeTypes} nodesDraggable />
        </FlowingerProvider>,
      );
      const one = must<HTMLElement>(container, '[data-id="node-1"]');
      fireEvent.pointerDown(one, pointer({ clientX: 0, clientY: 0 }));
      fireEvent.pointerMove(one, pointer({ clientX: 40, clientY: 20 }));
      // 40 screen px at 2× is 20 graph units.
      expect(one.style.transform).toBe('translate(120px, 60px)');
    });

    it('re-renders the dragged node and not its neighbour', () => {
      const { container } = render(
        <FlowingerCanvas nodes={nodes} edges={edges} nodeTypes={testNodeTypes} nodesDraggable />,
      );
      const one = must(container, '[data-id="node-1"]');
      const twoBefore = renders['node-2'];
      const oneBefore = renders['node-1'];

      fireEvent.pointerDown(one, pointer({ clientX: 0, clientY: 0 }));
      for (let i = 1; i <= 10; i++) {
        fireEvent.pointerMove(one, pointer({ clientX: i * 5, clientY: i * 5 }));
      }
      fireEvent.pointerUp(one, pointer({ clientX: 50, clientY: 50 }));

      expect(renders['node-1']).toBeGreaterThan(oneBefore ?? 0);
      expect(renders['node-2']).toBe(twoBefore);
    });

    it('does not start a drag from a press that stays put, so a click still lands', () => {
      const onPress = vi.fn();
      const withButton: Node[] = [
        { id: 'node-1', type: 'test', position: { x: 0, y: 0 }, data: { label: 'One', onPress } },
      ];
      const { container } = render(
        <FlowingerCanvas nodes={withButton} nodeTypes={testNodeTypes} nodesDraggable />,
      );
      const one = must<HTMLElement>(container, '[data-id="node-1"]');
      fireEvent.pointerDown(one, pointer({ clientX: 5, clientY: 5 }));
      fireEvent.pointerUp(one, pointer({ clientX: 5, clientY: 5 }));
      fireEvent.click(screen.getByText('press node-1'));
      expect(one.style.transform).toBe('translate(0px, 0px)');
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('lets node.draggable override the canvas-wide setting, both ways', () => {
      const mixed: Node[] = [
        { id: 'pinned', type: 'test', position: { x: 0, y: 0 }, data: { label: 'P' }, draggable: false },
        { id: 'free', type: 'test', position: { x: 0, y: 100 }, data: { label: 'F' }, draggable: true },
      ];
      const { container } = render(
        <FlowingerCanvas nodes={mixed} nodeTypes={testNodeTypes} nodesDraggable />,
      );
      const pinned = must<HTMLElement>(container, '[data-id="pinned"]');
      fireEvent.pointerDown(pinned, pointer({ clientX: 0, clientY: 0 }));
      fireEvent.pointerMove(pinned, pointer({ clientX: 50, clientY: 50 }));
      expect(pinned.style.transform).toBe('translate(0px, 0px)');

      // …and where nodesDraggable is off, a node can still opt in.
      const optIn = render(<FlowingerCanvas nodes={mixed} nodeTypes={testNodeTypes} />);
      const free = must<HTMLElement>(optIn.container, '[data-id="free"]');
      fireEvent.pointerDown(free, pointer({ clientX: 0, clientY: 0 }));
      fireEvent.pointerMove(free, pointer({ clientX: 10, clientY: 10 }));
      expect(free.style.transform).toBe('translate(10px, 110px)');
    });

    it('lets a fresh layout from the parent win over an earlier drag', () => {
      const { container, rerender } = render(
        <FlowingerCanvas nodes={nodes} nodeTypes={testNodeTypes} nodesDraggable />,
      );
      const one = must<HTMLElement>(container, '[data-id="node-1"]');
      fireEvent.pointerDown(one, pointer({ clientX: 0, clientY: 0 }));
      fireEvent.pointerMove(one, pointer({ clientX: 30, clientY: 30 }));
      fireEvent.pointerUp(one, pointer({ clientX: 30, clientY: 30 }));
      expect(one.style.transform).toBe('translate(130px, 80px)');

      const relaid: Node[] = [
        { ...nodes[0]!, position: { x: 500, y: 500 } },
        nodes[1]!,
      ];
      rerender(<FlowingerCanvas nodes={relaid} nodeTypes={testNodeTypes} nodesDraggable />);
      expect(one.style.transform).toBe('translate(500px, 500px)');
    });

    it('keeps a drag across a re-render that leaves the positions alone', () => {
      const { container, rerender } = render(
        <FlowingerCanvas nodes={nodes} nodeTypes={testNodeTypes} nodesDraggable />,
      );
      const one = must<HTMLElement>(container, '[data-id="node-1"]');
      fireEvent.pointerDown(one, pointer({ clientX: 0, clientY: 0 }));
      fireEvent.pointerMove(one, pointer({ clientX: 30, clientY: 30 }));
      fireEvent.pointerUp(one, pointer({ clientX: 30, clientY: 30 }));

      // A parent that rebuilds its array each render, with the same positions.
      rerender(
        <FlowingerCanvas nodes={nodes.map((n) => ({ ...n }))} nodeTypes={testNodeTypes} nodesDraggable />,
      );
      expect(one.style.transform).toBe('translate(130px, 80px)');
    });
  });

  describe('fitView', () => {
    it('frames the nodes even when the provider is not the canvas (the toolbar case)', () => {
      function Toolbar() {
        const { fitView } = useFlowinger();
        return <button onClick={() => { fitView(); }}>fit</button>;
      }
      const nodes: Node[] = [
        { id: 'a', position: { x: 0, y: 0 }, data: {}, width: 100, height: 50 },
        { id: 'b', position: { x: 300, y: 150 }, data: {}, width: 100, height: 50 },
      ];
      const { container } = render(
        <FlowingerProvider>
          <Toolbar />
          <FlowingerCanvas nodes={nodes} />
        </FlowingerProvider>,
      );
      sized(must(container, '.flowinger'), 800, 600);

      fireEvent.click(screen.getByText('fit'));
      const vp = viewportOf(container);
      expect(vp.zoom).toBeCloseTo(1.8);
      expect(vp.x).toBeCloseTo(40);
      expect(vp.y).toBeCloseTo(120);
    });

    it('calls onInit once, with the instance', () => {
      const onInit = vi.fn();
      const { rerender } = render(<FlowingerCanvas nodes={[]} onInit={onInit} />);
      rerender(<FlowingerCanvas nodes={[]} onInit={onInit} />);
      expect(onInit).toHaveBeenCalledTimes(1);
      const instance = onInit.mock.calls[0]?.[0] as FlowingerInstance;
      expect(typeof instance.fitView).toBe('function');
    });
  });
});

describe('Flowinger handles', () => {
  /** A node with two handles whose ids mean nothing to the legacy alias table. */
  function PortNode({ data }: NodeProps) {
    const withPorts = (data as { ports?: boolean }).ports !== false;
    return (
      <div>
        {withPorts && (
          <>
            <Handle id="west" type="source" position={Position.Left} />
            <Handle id="east" type="target" position={Position.Right} />
          </>
        )}
      </div>
    );
  }
  const types = { port: PortNode };
  const nodesWith = (ports = true): Node[] => [
    { id: 'a', type: 'port', position: { x: 0, y: 0 }, width: 100, height: 40, data: { ports } },
    { id: 'b', type: 'port', position: { x: 300, y: 200 }, width: 100, height: 40, data: { ports } },
  ];
  const edgeD = (container: ParentNode) =>
    must(container, '.react-flow__edge-path').getAttribute('d') ?? '';

  it('attaches to the side a registered handle declares, whatever its id is called', () => {
    const edges: Edge[] = [
      { id: 'e', source: 'a', target: 'b', sourceHandle: 'west', targetHandle: 'east' },
    ];
    const { container } = render(
      <FlowingerCanvas nodes={nodesWith()} edges={edges} nodeTypes={types} />,
    );
    // a's left-middle is (0, 20); b's right-middle is (400, 220). With the
    // alias table alone, "west" was unknown and this ran bottom-to-top instead.
    const d = edgeD(container);
    expect(d).toMatch(/^M 0\.00 20\.00 C/);
    expect(d).toMatch(/400\.00 220\.00$/);
  });

  it('uses the first handle of the right type when the edge names none', () => {
    const { container } = render(
      <FlowingerCanvas
        nodes={nodesWith()}
        edges={[{ id: 'e', source: 'a', target: 'b' }]}
        nodeTypes={types}
      />,
    );
    const d = edgeD(container);
    expect(d).toMatch(/^M 0\.00 20\.00 C/);
    expect(d).toMatch(/400\.00 220\.00$/);
  });

  it('does not match a handle of the wrong type, and falls back to guessing', () => {
    // "east" is a target handle; asking for it as a source finds nothing.
    const { container } = render(
      <FlowingerCanvas
        nodes={nodesWith()}
        edges={[{ id: 'e', source: 'a', target: 'b', sourceHandle: 'east', targetHandle: 'east' }]}
        nodeTypes={types}
      />,
    );
    // Source falls back to the direction default (bottom-middle: (50, 40)).
    expect(edgeD(container)).toMatch(/^M 50\.00 40\.00 C/);
    // …while the target, a real target handle, still resolves.
    expect(edgeD(container)).toMatch(/400\.00 220\.00$/);
  });

  it('forgets a handle when it unmounts', () => {
    const edge: Edge[] = [{ id: 'e', source: 'a', target: 'b', sourceHandle: 'west', targetHandle: 'east' }];
    const { container, rerender } = render(
      <FlowingerCanvas nodes={nodesWith(true)} edges={edge} nodeTypes={types} />,
    );
    expect(edgeD(container)).toMatch(/^M 0\.00 20\.00 C/);

    rerender(<FlowingerCanvas nodes={nodesWith(false)} edges={edge} nodeTypes={types} />);
    // No handles left: "west"/"east" are unknown again, so it guesses (bottom → top).
    expect(edgeD(container)).toMatch(/^M 50\.00 40\.00 C/);
    expect(edgeD(container)).toMatch(/350\.00 200\.00$/);
  });

  describe('measured anchors', () => {
    const rect = (left: number, top: number, width: number, height: number) => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    });

    /** A top handle pushed 30% along the node, drawn at `scale` × its layout size. */
    function mockLayout(scale: number) {
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        if (this.dataset.id) return rect(500, 300, 100 * scale, 40 * scale);
        if (this.dataset.handleid) return rect(500 + 30 * scale - 3, 300 - 3, 6, 6);
        return rect(0, 0, 0, 0);
      });
    }

    function OffsetNode() {
      return <Handle id="p" type="source" position={Position.Top} style={{ left: '30%' }} />;
    }
    const nodes: Node[] = [
      { id: 'a', type: 'offset', position: { x: 100, y: 50 }, data: {} },
      { id: 'b', type: 'offset', position: { x: 400, y: 300 }, data: {} },
    ];
    const edges: Edge[] = [{ id: 'e', source: 'a', target: 'b', sourceHandle: 'p' }];

    it('attaches to where a handle is actually drawn, not its side midpoint', () => {
      mockLayout(1);
      const { container } = render(
        <FlowingerCanvas nodes={nodes} edges={edges} nodeTypes={{ offset: OffsetNode }} />,
      );
      // 30px along a's top edge: node (100, 50) + anchor (30, 0).
      expect(edgeD(container)).toMatch(/^M 130\.00 50\.00 C/);
    });

    it('takes the viewport zoom out of what it measures', () => {
      mockLayout(2); // rects are twice the layout size, as at zoom 2
      const { container } = render(
        <FlowingerCanvas nodes={nodes} edges={edges} nodeTypes={{ offset: OffsetNode }} />,
      );
      expect(edgeD(container)).toMatch(/^M 130\.00 50\.00 C/);
    });
  });
});

describe('Flowinger default styling', () => {
  const nodes: Node[] = [{ id: 'plain', position: { x: 0, y: 0 }, data: { label: 'Hello' } }];

  it('draws the default node from CSS variables with fallbacks, and no utility classes', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} />);
    const view = must<HTMLElement>(container, '[data-id="plain"] > div');
    const style = view.getAttribute('style') ?? '';
    expect(style).toContain('var(--flowinger-surface, #1e293b)');
    expect(style).toContain('var(--flowinger-border, #334155)');
    expect(view.className).toBe(''); // nothing for a stylesheet to have to supply
    expect(screen.getByText('plain')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('draws Controls with inline styles only, at the 24px WCAG minimum target', () => {
    render(
      <FlowingerProvider>
        <Controls />
      </FlowingerProvider>,
    );
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    expect(zoomIn.className).toBe('');
    expect(zoomIn.style.minWidth).toBe('24px');
    expect(zoomIn.style.height).toBe('24px');
    const group = must(document.body, '.react-flow__controls');
    expect(group.className).toBe('flowinger-controls react-flow__controls');
    expect(group.getAttribute('style')).toContain('var(--flowinger-surface, #1e293b)');
  });

  it('lets a caller add a class and override the container style', () => {
    render(
      <FlowingerProvider>
        <Controls className="mine" style={{ position: 'absolute' }} />
      </FlowingerProvider>,
    );
    const group = must<HTMLElement>(document.body, '.react-flow__controls');
    expect(group.classList.contains('mine')).toBe(true);
    expect(group.style.position).toBe('absolute');
  });

  it('wires the buttons to zoom and fit', () => {
    const nodes2: Node[] = [
      { id: 'a', position: { x: 0, y: 0 }, data: {}, width: 100, height: 50 },
      { id: 'b', position: { x: 300, y: 150 }, data: {}, width: 100, height: 50 },
    ];
    const { container } = render(
      <FlowingerProvider>
        <FlowingerCanvas nodes={nodes2} />
        <Controls />
      </FlowingerProvider>,
    );
    sized(must(container, '.flowinger'), 800, 600);

    // The buttons animate (200–300ms), so let each move land before reading it.
    vi.useFakeTimers();
    const settle = () => act(() => { vi.advanceTimersByTime(600); });

    fireEvent.click(screen.getByRole('button', { name: 'Fit view' }));
    settle();
    // Bounds are 400 × 200 in an 800 × 600 pane: (800 − 80) / 400 = 1.8.
    expect(viewportOf(container).zoom).toBeCloseTo(1.8);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    settle();
    expect(viewportOf(container).zoom).toBeCloseTo(1.8 / 1.25);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    settle();
    expect(viewportOf(container).zoom).toBeCloseTo(1.8);
  });

  it('hides the groups it is told to', () => {
    render(
      <FlowingerProvider>
        <Controls showFit={false} />
      </FlowingerProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Fit view' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument();
  });
});

describe('Flowinger touch pinch', () => {
  const finger = (id: number, x: number, y = 100) => ({
    pointerId: id,
    button: 0,
    clientX: x,
    clientY: y,
    pointerType: 'touch',
  });

  it('zooms with two fingers, keeping the point under their midpoint fixed', () => {
    const { container } = render(<FlowingerCanvas nodes={[]} />);
    const pane = must(container, '.flowinger');
    fireEvent.pointerDown(pane, finger(1, 100));
    fireEvent.pointerDown(pane, finger(2, 200)); // spread 100, midpoint (150, 100)
    fireEvent.pointerMove(pane, finger(2, 300)); // spread 200, midpoint (200, 100)
    // ×2 (the default maximum), and the point that was at (150, 100) now sits
    // under (200, 100): x = 200 − 150·2, y = 100 − 100·2.
    expect(viewportOf(container)).toEqual({ x: -100, y: -100, zoom: 2 });
  });

  it('pinches out to zoom out, down to minZoom', () => {
    const { container } = render(<FlowingerCanvas nodes={[]} minZoom={0.5} />);
    const pane = must(container, '.flowinger');
    fireEvent.pointerDown(pane, finger(1, 0));
    fireEvent.pointerDown(pane, finger(2, 200));
    fireEvent.pointerMove(pane, finger(2, 20)); // spread 200 → 20: wants ×0.1
    expect(viewportOf(container).zoom).toBe(0.5);
  });

  it('turns an in-progress single-finger pan into a pinch', () => {
    const { container } = render(<FlowingerCanvas nodes={[]} />);
    const pane = must(container, '.flowinger');
    fireEvent.pointerDown(pane, finger(1, 100));
    fireEvent.pointerMove(pane, finger(1, 140)); // panning: x = 40
    expect(viewportOf(container).x).toBe(40);

    fireEvent.pointerDown(pane, finger(2, 240)); // spread 100, midpoint (190, 100)
    fireEvent.pointerMove(pane, finger(2, 340)); // spread 200 → a zoom, not a pan
    expect(viewportOf(container).zoom).toBeGreaterThan(1);
  });

  it('does not resume as a pan when one finger lifts', () => {
    const { container } = render(<FlowingerCanvas nodes={[]} />);
    const pane = must(container, '.flowinger');
    fireEvent.pointerDown(pane, finger(1, 100));
    fireEvent.pointerDown(pane, finger(2, 200));
    fireEvent.pointerMove(pane, finger(2, 300));
    fireEvent.pointerUp(pane, finger(2, 300));
    const settled = viewportOf(container);

    fireEvent.pointerMove(pane, finger(1, 500)); // the lone finger wanders
    expect(viewportOf(container)).toEqual(settled);
  });

  it('lets a fresh single touch pan once the pinch is over', () => {
    const { container } = render(<FlowingerCanvas nodes={[]} />);
    const pane = must(container, '.flowinger');
    fireEvent.pointerDown(pane, finger(1, 100));
    fireEvent.pointerDown(pane, finger(2, 200));
    fireEvent.pointerMove(pane, finger(2, 300));
    fireEvent.pointerUp(pane, finger(2, 300));
    fireEvent.pointerUp(pane, finger(1, 100));
    expect(viewportOf(container)).toEqual({ x: -100, y: -100, zoom: 2 });

    // A stale pinch would swallow this move.
    fireEvent.pointerDown(pane, finger(3, 100));
    fireEvent.pointerMove(pane, finger(3, 140));
    expect(viewportOf(container)).toEqual({ x: -60, y: -100, zoom: 2 });
  });

  it('is switched off by zoomOnPinch={false}', () => {
    const { container } = render(<FlowingerCanvas nodes={[]} zoomOnPinch={false} />);
    const pane = must(container, '.flowinger');
    fireEvent.pointerDown(pane, finger(1, 100));
    fireEvent.pointerDown(pane, finger(2, 200));
    fireEvent.pointerMove(pane, finger(2, 400));
    expect(viewportOf(container).zoom).toBe(1);
  });
});

describe('Flowinger keyboard navigation', () => {
  const key = (k: string, extra: Record<string, boolean> = {}) => ({ key: k, ...extra });
  const nodes: Node[] = [
    { id: 'a', type: 'test', position: { x: 0, y: 0 }, data: { label: 'A' } },
  ];

  it('adds no tab stop or role unless asked to', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} nodeTypes={testNodeTypes} />);
    const pane = must(container, '.flowinger');
    expect(pane.hasAttribute('tabindex')).toBe(false);
    expect(pane.hasAttribute('role')).toBe(false);
    expect(pane.hasAttribute('aria-label')).toBe(false);
  });

  it('becomes a focusable, named group when asked to', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} keyboardNavigation />);
    const pane = must(container, '.flowinger');
    expect(pane.getAttribute('tabindex')).toBe('0');
    expect(pane.getAttribute('role')).toBe('group');
    expect(pane.getAttribute('aria-label')).toBe('Diagram');

    const named = render(<FlowingerCanvas nodes={nodes} keyboardNavigation ariaLabel="Query plan" />);
    expect(must(named.container, '.flowinger').getAttribute('aria-label')).toBe('Query plan');
  });

  it('pans with the arrow keys the way they scroll a page, and larger with Shift', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} keyboardNavigation />);
    const pane = must(container, '.flowinger');

    fireEvent.keyDown(pane, key('ArrowRight')); // look right: content slides left
    expect(viewportOf(container)).toEqual({ x: -50, y: 0, zoom: 1 });
    fireEvent.keyDown(pane, key('ArrowDown'));
    expect(viewportOf(container)).toEqual({ x: -50, y: -50, zoom: 1 });
    fireEvent.keyDown(pane, key('ArrowLeft'));
    fireEvent.keyDown(pane, key('ArrowUp'));
    expect(viewportOf(container)).toEqual({ x: 0, y: 0, zoom: 1 });

    fireEvent.keyDown(pane, key('ArrowRight', { shiftKey: true }));
    expect(viewportOf(container).x).toBe(-200);
  });

  it('zooms with + and −, and fits with 0', () => {
    const fitNodes: Node[] = [
      { id: 'a', position: { x: 0, y: 0 }, data: {}, width: 100, height: 50 },
      { id: 'b', position: { x: 300, y: 150 }, data: {}, width: 100, height: 50 },
    ];
    const { container } = render(<FlowingerCanvas nodes={fitNodes} keyboardNavigation maxZoom={4} />);
    const pane = must(container, '.flowinger');
    sized(pane, 800, 600);

    fireEvent.keyDown(pane, key('0'));
    expect(viewportOf(container).zoom).toBeCloseTo(1.8);
    fireEvent.keyDown(pane, key('-'));
    expect(viewportOf(container).zoom).toBeCloseTo(1.8 / 1.25);
    fireEvent.keyDown(pane, key('='));
    fireEvent.keyDown(pane, key('+'));
    expect(viewportOf(container).zoom).toBeCloseTo((1.8 / 1.25) * 1.25 * 1.25);
  });

  it('consumes the keys it handles and leaves every other key alone', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} keyboardNavigation />);
    const pane = must(container, '.flowinger');
    expect(fireEvent.keyDown(pane, key('ArrowLeft'))).toBe(false); // preventDefault called
    expect(fireEvent.keyDown(pane, key('a'))).toBe(true);
    expect(fireEvent.keyDown(pane, key('Tab'))).toBe(true); // focus must be able to leave
  });

  it('ignores modified keys, so browser shortcuts still work', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} keyboardNavigation />);
    const pane = must(container, '.flowinger');
    fireEvent.keyDown(pane, key('ArrowRight', { ctrlKey: true }));
    fireEvent.keyDown(pane, key('=', { metaKey: true })); // ⌘= is the browser's own zoom
    fireEvent.keyDown(pane, key('ArrowRight', { altKey: true }));
    expect(viewportOf(container)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('leaves keys pressed inside a node to that node', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={testNodeTypes} keyboardNavigation />,
    );
    const inside = screen.getByText('press a');
    fireEvent.keyDown(inside, key('ArrowRight'));
    expect(viewportOf(container)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('does nothing when the prop is off, even if the canvas somehow receives the key', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} />);
    fireEvent.keyDown(must(container, '.flowinger'), key('ArrowRight'));
    expect(viewportOf(container)).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});
