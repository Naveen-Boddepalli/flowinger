import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  Background,
  BaseEdge,
  FlowingerCanvas,
  FlowingerProvider,
  Controls,
  MiniMap,
  Handle,
  MarkerType,
  Position,
  getBezierPath,
  getStraightPath,
  getSmoothStepPath,
  useFlowinger,
  useStore,
  useViewport,
  type Edge,
  type EdgeProps,
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

    /**
     * A 6-unit top handle pushed 30% along the node, everything drawn at `scale` ×
     * its layout size — the handle included, as at that zoom it really would be.
     */
    function mockLayout(scale: number) {
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        if (this.dataset.id) return rect(500, 300, 100 * scale, 40 * scale);
        if (this.dataset.handleid) return rect(500 + 30 * scale - 3 * scale, 300 - 3 * scale, 6 * scale, 6 * scale);
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

    it('attaches to where a handle is actually drawn, at its outer edge, not its side midpoint', () => {
      mockLayout(1);
      const { container } = render(
        <FlowingerCanvas nodes={nodes} edges={edges} nodeTypes={{ offset: OffsetNode }} />,
      );
      // 30 along a's top edge, and out past the 6-unit dot's top: node (100, 50)
      // + (30, 0), then 3 units outward — as React Flow does.
      expect(edgeD(container)).toMatch(/^M 130\.00 47\.00 C/);
    });

    it('centres an edge on a node’s true fractional width, not its rounded one', () => {
      // A node 142.703 wide: offsetWidth reports 143, so an edge to its middle
      // would land 0.15 off. (A handle-less node, so the side's midpoint is used.)
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(143);
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(43);
      const real = window.getComputedStyle.bind(window);
      vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) =>
        el instanceof HTMLElement && el.dataset.id
          ? ({ width: '142.703px', height: '42.7px' } as CSSStyleDeclaration)
          : real(el, pseudo),
      );
      const plain: Node[] = [
        { id: 'a', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', position: { x: 0, y: 200 }, data: {} },
      ];
      const { container } = render(
        <FlowingerCanvas nodes={plain} edges={[{ id: 'e', source: 'a', target: 'b' }]} />,
      );
      expect(edgeD(container)).toMatch(/^M 71\.35 42\.70 C/); // 142.703 / 2, and 42.7 tall
    });

    it('takes the viewport zoom out of what it measures — the handle’s size included', () => {
      mockLayout(2); // everything is twice the layout size, as at zoom 2
      const { container } = render(
        <FlowingerCanvas nodes={nodes} edges={edges} nodeTypes={{ offset: OffsetNode }} />,
      );
      expect(edgeD(container)).toMatch(/^M 130\.00 47\.00 C/); // the same, at any zoom
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

describe('Flowinger translateExtent', () => {
  const world: [[number, number], [number, number]] = [[0, 0], [1000, 800]];

  it('keeps a mouse pan inside the extent, however far the pointer goes', () => {
    const { container } = render(<FlowingerCanvas nodes={[]} translateExtent={world} />);
    const pane = must(container, '.flowinger');
    sized(pane, 800, 600);

    fireEvent.pointerDown(pane, pointer({ clientX: 400, clientY: 300 }));
    fireEvent.pointerMove(pane, pointer({ clientX: 900, clientY: 900 })); // wants +500, +600
    expect(viewportOf(container)).toEqual({ x: 0, y: 0, zoom: 1 });
    fireEvent.pointerMove(pane, pointer({ clientX: -900, clientY: -900 })); // wants −1300, −1200
    expect(viewportOf(container)).toEqual({ x: -200, y: -200, zoom: 1 });
  });

  it('keeps keyboard panning and wheel zoom inside it too', () => {
    const { container } = render(
      <FlowingerCanvas nodes={[]} translateExtent={world} keyboardNavigation />,
    );
    const pane = must(container, '.flowinger');
    sized(pane, 800, 600);

    fireEvent.keyDown(pane, { key: 'ArrowLeft' }); // would move x to +50
    expect(viewportOf(container).x).toBe(0);

    fireEvent.wheel(pane, { deltaY: 10000, clientX: 0, clientY: 0 }); // zoom out hard
    const vp = viewportOf(container);
    // Zoomed out far enough that the world is smaller than the pane: centred.
    expect(vp.x).toBeCloseTo((800 - 1000 * vp.zoom) / 2);
    expect(vp.y).toBeCloseTo((600 - 800 * vp.zoom) / 2);
  });

  it('applies a changed extent to a view already outside it', () => {
    const { container, rerender } = render(<FlowingerCanvas nodes={[]} />);
    sized(must(container, '.flowinger'), 800, 600);
    // Pan it well outside where the extent will allow.
    const pane = must(container, '.flowinger');
    fireEvent.pointerDown(pane, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(pane, pointer({ clientX: 300, clientY: 0 }));
    fireEvent.pointerUp(pane, pointer({ clientX: 300, clientY: 0 }));
    expect(viewportOf(container).x).toBe(300);

    rerender(<FlowingerCanvas nodes={[]} translateExtent={world} />);
    expect(viewportOf(container).x).toBe(0);
  });
});

describe('Flowinger edge markers and labels', () => {
  const nodes: Node[] = [
    { id: 'a', position: { x: 0, y: 0 }, data: {}, width: 100, height: 40 },
    { id: 'b', position: { x: 0, y: 200 }, data: {}, width: 100, height: 40 },
    { id: 'c', position: { x: 300, y: 200 }, data: {}, width: 100, height: 40 },
  ];
  const edge = (over: Partial<Edge> = {}): Edge => ({ id: 'e', source: 'a', target: 'b', ...over });
  const pathOf = (container: ParentNode, id = 'e') =>
    must(container, `[data-testid="edge-${id}"] path`);
  /** The <marker> a path's `marker-end` / `marker-start` points at. */
  const markerOf = (container: ParentNode, attr: 'marker-end' | 'marker-start', id = 'e') => {
    const ref = pathOf(container, id).getAttribute(attr) ?? '';
    const match = /^url\(#(.+)\)$/.exec(ref);
    if (!match?.[1]) throw new Error(`no marker reference on ${id}: "${ref}"`);
    return must(container, `marker[id="${match[1]}"]`);
  };

  it('draws a closed arrowhead in the edge’s own stroke colour', () => {
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        edges={[edge({ markerEnd: MarkerType.ArrowClosed, style: { stroke: '#10b981' } })]}
      />,
    );
    const marker = markerOf(container, 'marker-end');
    const head = must(marker, 'polyline');
    expect(head.getAttribute('fill')).toBe('#10b981');
    expect(head.getAttribute('stroke')).toBe('#10b981');
    // Sized in graph units, so it does not fatten with the stroke; facing outward at the start.
    expect(marker.getAttribute('markerUnits')).toBe('userSpaceOnUse');
    expect(marker.getAttribute('orient')).toBe('auto-start-reverse');
  });

  it('draws an open arrowhead unfilled', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes} edges={[edge({ markerEnd: 'arrow' })]} />,
    );
    const head = must(markerOf(container, 'marker-end'), 'polyline');
    expect(head.getAttribute('fill')).toBe('none');
    expect(head.getAttribute('stroke')).toContain('var(--flowinger-edge');
  });

  it('takes an explicit colour and size over the defaults', () => {
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        edges={[
          edge({
            markerEnd: { type: 'arrowclosed', color: 'crimson', width: 20, height: 18 },
            style: { stroke: '#10b981' },
          }),
        ]}
      />,
    );
    const marker = markerOf(container, 'marker-end');
    expect(marker.getAttribute('markerWidth')).toBe('20');
    expect(marker.getAttribute('markerHeight')).toBe('18');
    expect(must(marker, 'polyline').getAttribute('fill')).toBe('crimson');
  });

  it('shares one marker between edges that ask for the same arrowhead', () => {
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        edges={[
          edge({ id: 'e1', markerEnd: 'arrowclosed' }),
          edge({ id: 'e2', target: 'c', markerEnd: 'arrowclosed' }),
          edge({ id: 'e3', target: 'c', markerEnd: 'arrow' }),
        ]}
      />,
    );
    expect(container.querySelectorAll('marker')).toHaveLength(2); // closed once, open once
    expect(pathOf(container, 'e1').getAttribute('marker-end')).toBe(
      pathOf(container, 'e2').getAttribute('marker-end'),
    );
    expect(pathOf(container, 'e3').getAttribute('marker-end')).not.toBe(
      pathOf(container, 'e1').getAttribute('marker-end'),
    );
  });

  it('can put an arrowhead at the start as well as the end', () => {
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        edges={[edge({ markerStart: 'arrowclosed', markerEnd: 'arrowclosed' })]}
      />,
    );
    // Same look at both ends: one shared definition, referenced twice.
    expect(container.querySelectorAll('marker')).toHaveLength(1);
    expect(pathOf(container).getAttribute('marker-start')).toBe(
      pathOf(container).getAttribute('marker-end'),
    );
    expect(markerOf(container, 'marker-start')).toBeTruthy();
  });

  it('renders no <defs> when no edge has a marker', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} edges={[edge()]} />);
    expect(container.querySelector('defs')).toBeNull();
    expect(pathOf(container).hasAttribute('marker-end')).toBe(false);
  });

  it('keeps marker ids unique across canvases on the same page', () => {
    const a = render(<FlowingerCanvas nodes={nodes} edges={[edge({ markerEnd: 'arrow' })]} />);
    const b = render(<FlowingerCanvas nodes={nodes} edges={[edge({ markerEnd: 'arrow' })]} />);
    const idA = markerOf(a.container, 'marker-end').id;
    const idB = markerOf(b.container, 'marker-end').id;
    expect(idA).not.toBe(idB);
    expect(idA).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('draws a label at the middle of the edge', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes} edges={[edge({ label: 'joins' })]} />,
    );
    // a's bottom-middle is (50, 40); b's top-middle is (50, 200).
    const text = must(container, '[data-testid="edge-e"] text');
    expect(text.textContent).toBe('joins');
    expect(text.getAttribute('x')).toBe('50');
    expect(text.getAttribute('y')).toBe('120');
    expect(text.getAttribute('text-anchor')).toBe('middle');
  });

  it('puts the label mid-way along straight edges too, and draws none without one', () => {
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        edges={[edge({ id: 'with', type: 'straight', label: 'x' }), edge({ id: 'without' })]}
      />,
    );
    expect(container.querySelectorAll('text')).toHaveLength(1);
    expect(must(container, '[data-testid="edge-with"] text').getAttribute('y')).toBe('120');
  });

  it('follows a dragged node', () => {
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        edges={[edge({ label: 'joins' })]}
        nodesDraggable
      />,
    );
    const b = must(container, '[data-id="b"]');
    fireEvent.pointerDown(b, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(b, pointer({ clientX: 0, clientY: 100 })); // b moves down 100
    const text = must(container, '[data-testid="edge-e"] text');
    expect(text.getAttribute('y')).toBe('170'); // midway between 40 and 300
  });

  it('defaults an edge’s stroke from --flowinger-edge, not a host app’s token', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} edges={[edge()]} />);
    expect(pathOf(container).getAttribute('stroke')).toBe('var(--flowinger-edge, #b1b1b7)');
  });
});

describe('README quickstart', () => {
  // The example from README.md, verbatim in shape. If the README's API drifts
  // from the library's, this is what should fail.
  function Step({ data }: NodeProps) {
    return (
      <div className="step">
        <Handle id="in" type="target" position={Position.Top} />
        {String(data.label)}
        <Handle id="out" type="source" position={Position.Bottom} />
      </div>
    );
  }
  const nodeTypes = { step: Step };
  const nodes: Node[] = [
    { id: 'a', type: 'step', position: { x: 0, y: 0 }, data: { label: 'Scan' } },
    { id: 'b', type: 'step', position: { x: 0, y: 120 }, data: { label: 'Filter' } },
  ];
  const edges: Edge[] = [
    { id: 'a-b', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in', markerEnd: 'arrowclosed' },
  ];

  it('renders the nodes, the edge with its arrowhead, the background and the controls', () => {
    const { container } = render(
      <div style={{ position: 'relative', height: 400 }}>
        <FlowingerProvider>
          <FlowingerCanvas nodes={nodes} edges={edges} nodeTypes={nodeTypes}>
            <Background />
          </FlowingerCanvas>
          <Controls style={{ position: 'absolute', right: 12, bottom: 12 }} />
        </FlowingerProvider>
      </div>,
    );
    expect(screen.getByText('Scan')).toBeInTheDocument();
    expect(screen.getByText('Filter')).toBeInTheDocument();
    expect(must(container, '[data-testid="edge-a-b"] path').getAttribute('marker-end')).toMatch(/^url\(#/);
    expect(container.querySelector('.flowinger-background')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(must<HTMLElement>(container, '.react-flow__controls').style.position).toBe('absolute');
  });
});

describe('Flowinger custom edges', () => {
  const nodes: Node[] = [
    { id: 'a', position: { x: 0, y: 0 }, data: {}, width: 100, height: 40 },
    { id: 'b', position: { x: 0, y: 200 }, data: {}, width: 100, height: 40 },
  ];
  const commits: Record<string, number> = {};

  /** Writes what it was given into the DOM, so a test can read it back. */
  function Probe(p: EdgeProps) {
    useEffect(() => {
      commits[p.id] = (commits[p.id] ?? 0) + 1;
    });
    const seen = {
      id: p.id, source: p.source, target: p.target,
      sx: p.sourceX, sy: p.sourceY, tx: p.targetX, ty: p.targetY,
      sp: p.sourcePosition, tp: p.targetPosition,
      sh: p.sourceHandleId, th: p.targetHandleId,
      label: p.label, data: p.data, markerEnd: p.markerEnd,
    };
    return <g data-testid={`probe-${p.id}`} data-seen={JSON.stringify(seen)} />;
  }
  const seenBy = (container: ParentNode, id = 'e') =>
    JSON.parse(must(container, `[data-testid="probe-${id}"]`).getAttribute('data-seen') ?? '{}') as Record<string, unknown>;
  const custom = (over: Partial<Edge> = {}): Edge => ({ id: 'e', source: 'a', target: 'b', type: 'probe', ...over });
  const types = { probe: Probe };

  afterEach(() => {
    for (const key of Object.keys(commits)) delete commits[key];
  });

  it('hands the component where each end attaches, and which way it leaves', () => {
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        edgeTypes={types}
        edges={[custom({ data: { weight: 3 }, label: 'joins' })]}
      />,
    );
    // a's bottom-middle and b's top-middle: no handles, b sits below a.
    expect(seenBy(container)).toMatchObject({
      id: 'e', source: 'a', target: 'b',
      sx: 50, sy: 40, tx: 50, ty: 200,
      sp: 'bottom', tp: 'top',
      sh: null, th: null,
      label: 'joins', data: { weight: 3 },
    });
  });

  it('wraps it like a built-in edge, so the same class hooks and test ids apply', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes} edgeTypes={types} edges={[custom({ className: 'mine' })]} />,
    );
    const wrapper = must(container, '[data-testid="edge-e"]');
    expect(wrapper.classList.contains('react-flow__edge')).toBe(true);
    expect(wrapper.classList.contains('mine')).toBe(true);
    expect(wrapper.querySelector('[data-testid="probe-e"]')).not.toBeNull();
  });

  it('lets a component reuse the default drawing through BaseEdge and the path helpers', () => {
    function Curvy({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label }: EdgeProps) {
      const [path, labelX, labelY] = getBezierPath({
        sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.5,
      });
      return <BaseEdge path={path} label={label} labelX={labelX} labelY={labelY} />;
    }
    const { container } = render(
      <FlowingerCanvas nodes={nodes} edgeTypes={{ curvy: Curvy }} edges={[custom({ type: 'curvy', label: 'hi' })]} />,
    );
    expect(must(container, '.react-flow__edge-path').getAttribute('d')).toMatch(/^M 50\.00 40\.00 C/);
    expect(must(container, '.react-flow__edge-text').textContent).toBe('hi');
  });

  it('passes marker references that point at real definitions', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes} edgeTypes={types} edges={[custom({ markerEnd: 'arrowclosed' })]} />,
    );
    const ref = String(seenBy(container).markerEnd);
    const id = /^url\(#(.+)\)$/.exec(ref)?.[1];
    expect(id).toBeTruthy();
    expect(container.querySelector(`marker[id="${String(id)}"]`)).not.toBeNull();
  });

  it('attaches at a registered handle, like a built-in edge', () => {
    function Ported() {
      return (
        <div>
          <Handle id="west" type="source" position={Position.Left} />
          <Handle id="east" type="target" position={Position.Right} />
        </div>
      );
    }
    const ported: Node[] = nodes.map((n) => ({ ...n, type: 'ported' }));
    const { container } = render(
      <FlowingerCanvas
        nodes={ported}
        nodeTypes={{ ported: Ported }}
        edgeTypes={types}
        edges={[custom({ sourceHandle: 'west', targetHandle: 'east' })]}
      />,
    );
    expect(seenBy(container)).toMatchObject({
      sx: 0, sy: 20, sp: 'left', tx: 100, ty: 220, tp: 'right', sh: 'west', th: 'east',
    });
  });

  it('follows a dragged node', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes} edgeTypes={types} edges={[custom()]} nodesDraggable />,
    );
    const b = must(container, '[data-id="b"]');
    fireEvent.pointerDown(b, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(b, pointer({ clientX: 0, clientY: 100 }));
    expect(seenBy(container)).toMatchObject({ ty: 300 });
  });

  it('is not re-rendered when a node it is not attached to moves', () => {
    const three: Node[] = [...nodes, { id: 'c', position: { x: 400, y: 0 }, data: {}, width: 100, height: 40 }];
    const edges = [custom()]; // one array, kept: only the geometry changes
    const { container } = render(
      <FlowingerCanvas nodes={three} edgeTypes={types} edges={edges} nodesDraggable />,
    );
    const before = commits.e;
    const c = must(container, '[data-id="c"]');
    fireEvent.pointerDown(c, pointer({ clientX: 0, clientY: 0 }));
    for (let i = 1; i <= 5; i++) fireEvent.pointerMove(c, pointer({ clientX: i * 10, clientY: i * 10 }));
    expect(commits.e).toBe(before);
  });

  it('draws a built-in edge for a type nobody registered', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes} edgeTypes={types} edges={[custom({ type: 'nope' })]} />,
    );
    expect(container.querySelector('[data-testid="probe-e"]')).toBeNull();
    expect(must(container, '.react-flow__edge-path').getAttribute('d')).toMatch(/^M 50\.00 40\.00 C/);
  });

  it('lets a registered type replace a built-in one of the same name', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes} edgeTypes={{ straight: Probe }} edges={[custom({ type: 'straight' })]} />,
    );
    expect(container.querySelector('[data-testid="probe-e"]')).not.toBeNull();
    expect(container.querySelector('.react-flow__edge-path')).toBeNull();
  });
});

describe('Flowinger selection', () => {
  const commits: Record<string, number> = {};
  function SelNode({ id, selected, data }: NodeProps) {
    useEffect(() => {
      commits[id] = (commits[id] ?? 0) + 1;
    });
    return (
      <div data-testid={`sel-${id}`} data-selected={String(selected)}>
        <span>{String(data.label)}</span>
        <button type="button">inner {id}</button>
      </div>
    );
  }
  const types = { sel: SelNode };
  const nodes: Node[] = ['a', 'b', 'c'].map((id, i) => ({
    id,
    type: 'sel',
    position: { x: i * 200, y: 0 },
    data: { label: id.toUpperCase() },
  }));
  const el = (c: ParentNode, id: string) => must<HTMLElement>(c, `[data-id="${id}"]`);
  const selectedIds = (c: ParentNode) => ['a', 'b', 'c'].filter((id) => el(c, id).classList.contains('selected'));
  const lastSelection = (fn: ReturnType<typeof vi.fn>) =>
    (fn.mock.calls.at(-1)?.[0] as { nodes: Node[] } | undefined)?.nodes.map((n) => n.id);

  afterEach(() => {
    for (const key of Object.keys(commits)) delete commits[key];
  });

  it('is off by default: a click reports but selects nothing, and nodes stay out of the tab order', () => {
    const onNodeClick = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} onNodeClick={onNodeClick} />,
    );
    fireEvent.click(el(container, 'a'));
    expect(selectedIds(container)).toEqual([]);
    expect(onNodeClick).toHaveBeenCalledTimes(1);
    expect(onNodeClick.mock.calls[0]?.[1]).toMatchObject({ id: 'a' });
    expect(el(container, 'a').hasAttribute('tabindex')).toBe(false);
  });

  it('selects on click, tells the node and the caller, and marks it for assistive tech', () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} elementsSelectable onSelectionChange={onSelectionChange} />,
    );
    fireEvent.click(el(container, 'a'));
    expect(selectedIds(container)).toEqual(['a']);
    expect(screen.getByTestId('sel-a').dataset.selected).toBe('true');
    expect(screen.getByTestId('sel-b').dataset.selected).toBe('false');
    expect(el(container, 'a').getAttribute('aria-current')).toBe('true');
    expect(el(container, 'b').hasAttribute('aria-current')).toBe(false);
    expect(lastSelection(onSelectionChange)).toEqual(['a']);
  });

  it('replaces the selection on a plain click, and adds or removes with Shift, Ctrl or ⌘', () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} elementsSelectable onSelectionChange={onSelectionChange} />,
    );
    fireEvent.click(el(container, 'a'));
    fireEvent.click(el(container, 'b'));
    expect(selectedIds(container)).toEqual(['b']);

    fireEvent.click(el(container, 'a'), { shiftKey: true });
    expect(selectedIds(container)).toEqual(['a', 'b']);
    fireEvent.click(el(container, 'c'), { ctrlKey: true });
    expect(selectedIds(container)).toEqual(['a', 'b', 'c']);
    fireEvent.click(el(container, 'b'), { metaKey: true }); // toggles off
    expect(selectedIds(container)).toEqual(['a', 'c']);
    expect(lastSelection(onSelectionChange)).toEqual(['a', 'c']);
  });

  it('says nothing when a click changes nothing', () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} elementsSelectable onSelectionChange={onSelectionChange} />,
    );
    fireEvent.click(el(container, 'a'));
    fireEvent.click(el(container, 'a')); // already the whole selection
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
  });

  it('clears on a click on the bare canvas, and reports it', () => {
    const onPaneClick = vi.fn();
    const onSelectionChange = vi.fn();
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        nodeTypes={types}
        elementsSelectable
        onPaneClick={onPaneClick}
        onSelectionChange={onSelectionChange}
      />,
    );
    fireEvent.click(el(container, 'a'));
    fireEvent.click(must(container, '.flowinger'));
    expect(selectedIds(container)).toEqual([]);
    expect(lastSelection(onSelectionChange)).toEqual([]);
    expect(onPaneClick).toHaveBeenCalledTimes(1);
  });

  it('does not deselect when the click that ends a pan lands on the canvas', () => {
    const onPaneClick = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} elementsSelectable onPaneClick={onPaneClick} />,
    );
    fireEvent.click(el(container, 'a'));
    const pane = must(container, '.flowinger');

    fireEvent.pointerDown(pane, pointer({ clientX: 100, clientY: 100 }));
    fireEvent.pointerMove(pane, pointer({ clientX: 160, clientY: 100 })); // a real pan
    fireEvent.pointerUp(pane, pointer({ clientX: 160, clientY: 100 }));
    fireEvent.click(pane); // pointer capture sends the pan's click here
    expect(selectedIds(container)).toEqual(['a']);
    expect(onPaneClick).not.toHaveBeenCalled();

    // …and the very next, deliberate, click on the canvas still clears.
    fireEvent.pointerDown(pane, pointer({ clientX: 100, clientY: 100 }));
    fireEvent.pointerUp(pane, pointer({ clientX: 100, clientY: 100 }));
    fireEvent.click(pane);
    expect(selectedIds(container)).toEqual([]);
    expect(onPaneClick).toHaveBeenCalledTimes(1);
  });

  it('leaves a click on a control inside a node to the control', () => {
    const onNodeClick = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} elementsSelectable onNodeClick={onNodeClick} />,
    );
    fireEvent.click(screen.getByText('inner a'));
    expect(selectedIds(container)).toEqual([]);
    expect(onNodeClick).toHaveBeenCalledTimes(1); // the node still hears about it
  });

  it('honours a node’s own selectable: false', () => {
    const mixed = nodes.map((n) => (n.id === 'b' ? { ...n, selectable: false } : n));
    const { container } = render(<FlowingerCanvas nodes={mixed} nodeTypes={types} elementsSelectable />);
    fireEvent.click(el(container, 'b'));
    expect(selectedIds(container)).toEqual([]);
    expect(el(container, 'b').hasAttribute('tabindex')).toBe(false);
    expect(el(container, 'a').getAttribute('tabindex')).toBe('0');
  });

  it('selects from the keyboard with Enter or Space, only when the node itself has focus', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} nodeTypes={types} elementsSelectable />);
    expect(fireEvent.keyDown(el(container, 'a'), { key: 'Enter' })).toBe(false); // consumed
    expect(selectedIds(container)).toEqual(['a']);
    fireEvent.keyDown(el(container, 'b'), { key: ' ', shiftKey: true }); // Shift adds
    expect(selectedIds(container)).toEqual(['a', 'b']);
    expect(fireEvent.keyDown(el(container, 'c'), { key: 'a' })).toBe(true); // other keys untouched

    // Enter on the button inside a node is the button's.
    fireEvent.keyDown(screen.getByText('inner c'), { key: 'Enter' });
    expect(selectedIds(container)).toEqual(['a', 'b']);
  });

  it('drops the selection on Escape, but only consumes the key when there is one', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} elementsSelectable keyboardNavigation />,
    );
    const pane = must(container, '.flowinger');
    expect(fireEvent.keyDown(pane, { key: 'Escape' })).toBe(true); // nothing to drop: not ours

    fireEvent.click(el(container, 'a'));
    expect(fireEvent.keyDown(pane, { key: 'Escape' })).toBe(false);
    expect(selectedIds(container)).toEqual([]);
  });

  it('re-renders only the nodes whose selection changed', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} nodeTypes={types} elementsSelectable />);
    const before = { ...commits };

    fireEvent.click(el(container, 'a'));
    expect(commits.a).toBeGreaterThan(before.a ?? 0);
    expect(commits.b).toBe(before.b);
    expect(commits.c).toBe(before.c);

    const afterA = { ...commits };
    fireEvent.click(el(container, 'b')); // a is deselected, b selected; c is untouched
    expect(commits.a).toBeGreaterThan(afterA.a ?? 0);
    expect(commits.b).toBeGreaterThan(afterA.b ?? 0);
    expect(commits.c).toBe(afterA.c);
  });

  it('forgets a selected node that leaves the graph, and says so', () => {
    const onSelectionChange = vi.fn();
    const { container, rerender } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} elementsSelectable onSelectionChange={onSelectionChange} />,
    );
    fireEvent.click(el(container, 'a'));
    fireEvent.click(el(container, 'b'), { shiftKey: true });

    rerender(
      <FlowingerCanvas
        nodes={nodes.filter((n) => n.id !== 'a')}
        nodeTypes={types}
        elementsSelectable
        onSelectionChange={onSelectionChange}
      />,
    );
    expect(lastSelection(onSelectionChange)).toEqual(['b']);
  });

  it('shows the selection on the default node view too', () => {
    const plain: Node[] = [{ id: 'p', position: { x: 0, y: 0 }, data: { label: 'plain' } }];
    const { container } = render(<FlowingerCanvas nodes={plain} elementsSelectable />);
    const view = must<HTMLElement>(container, '[data-id="p"] > div');
    expect(view.getAttribute('style')).not.toContain('--flowinger-selected');
    fireEvent.click(el(container, 'p'));
    expect(must<HTMLElement>(container, '[data-id="p"] > div').getAttribute('style')).toContain(
      'var(--flowinger-selected, #38bdf8)',
    );
  });
});

describe('Flowinger connecting', () => {
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
    { id: 'c', type: 'ports', position: { x: 300, y: 200 }, width: 100, height: 40, data: {} },
  ];
  const handle = (c: ParentNode, node: string, id: string) =>
    must<HTMLElement>(c, `[data-id="${node}"] [data-handleid="${id}"]`);
  const line = (c: ParentNode) => c.querySelector('.react-flow__connection-path');
  const lineD = (c: ParentNode) => must(c, '.react-flow__connection-path').getAttribute('d') ?? '';

  /** jsdom has no hit-testing: say what is under the pointer. */
  const pointerOver = (el: Element | null) =>
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => el });
  afterEach(() => {
    Reflect.deleteProperty(document, 'elementFromPoint');
  });

  const press = (el: Element, x: number, y: number) =>
    fireEvent.pointerDown(el, pointer({ clientX: x, clientY: y }));
  const move = (x: number, y: number) => fireEvent.pointerMove(window, pointer({ clientX: x, clientY: y }));
  const release = (x: number, y: number) => fireEvent.pointerUp(window, pointer({ clientX: x, clientY: y }));

  it('is off by default: handles take no pointer events and nothing starts', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} nodeTypes={types} />);
    expect(handle(container, 'a', 'out').style.pointerEvents).toBe('none');
    press(handle(container, 'a', 'out'), 50, 40);
    move(200, 100);
    expect(line(container)).toBeNull();
  });

  it('turns handles into hit targets when enabled: bigger, crosshair, pointer events on', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} nodeTypes={types} nodesConnectable />);
    const h = handle(container, 'a', 'out');
    expect(h.style.pointerEvents).toBe('all');
    expect(h.style.cursor).toBe('crosshair');
    expect(h.style.width).toBe('10px');
    expect(h.getAttribute('data-connectable')).toBe('true');
  });

  it('draws a line from the handle to the pointer while dragging, and removes it on release', () => {
    pointerOver(null);
    const { container } = render(<FlowingerCanvas nodes={nodes} nodeTypes={types} nodesConnectable />);
    press(handle(container, 'a', 'out'), 50, 40);
    expect(line(container)).not.toBeNull();
    move(300, 120);
    // a's bottom-middle is (50, 40); the pointer is at (300, 120).
    expect(lineD(container)).toMatch(/^M 50\.00 40\.00 C/);
    expect(lineD(container)).toMatch(/300\.00 120\.00$/);
    release(300, 120);
    expect(line(container)).toBeNull();
  });

  it('reports a drop on a compatible handle as a source → target connection', () => {
    const onConnect = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} nodesConnectable onConnect={onConnect} />,
    );
    const target = handle(container, 'b', 'in');
    pointerOver(target);
    press(handle(container, 'a', 'out'), 50, 40);
    move(50, 200);
    release(50, 200);
    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onConnect).toHaveBeenCalledWith({ source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' });
    expect(line(container)).toBeNull();
  });

  it('gives the same connection when the drag starts at the target end', () => {
    const onConnect = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} nodesConnectable onConnect={onConnect} />,
    );
    pointerOver(handle(container, 'a', 'out'));
    press(handle(container, 'b', 'in'), 50, 200);
    release(50, 40);
    expect(onConnect).toHaveBeenCalledWith({ source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' });
  });

  it('connects nothing when dropped on empty canvas, or on a handle of the same type', () => {
    const onConnect = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} nodesConnectable onConnect={onConnect} />,
    );
    pointerOver(null);
    press(handle(container, 'a', 'out'), 50, 40);
    release(500, 500);

    pointerOver(handle(container, 'b', 'out')); // source onto source
    press(handle(container, 'a', 'out'), 50, 40);
    release(50, 240);
    expect(onConnect).not.toHaveBeenCalled();
    expect(line(container)).toBeNull();
  });

  it('lets isValidConnection veto, handing it the normalised connection', () => {
    const onConnect = vi.fn();
    const isValidConnection = vi.fn(() => false);
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        nodeTypes={types}
        nodesConnectable
        onConnect={onConnect}
        isValidConnection={isValidConnection}
      />,
    );
    pointerOver(handle(container, 'b', 'in'));
    press(handle(container, 'a', 'out'), 50, 40);
    move(60, 210);
    release(60, 210);
    expect(isValidConnection).toHaveBeenCalledWith({ source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' });
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('snaps the line to a handle that would make a valid connection, and not to one that would not', () => {
    const allow = { current: true };
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        nodeTypes={types}
        nodesConnectable
        isValidConnection={() => allow.current}
      />,
    );
    pointerOver(handle(container, 'b', 'in'));
    press(handle(container, 'a', 'out'), 50, 40);
    move(63, 212); // near b's top-middle (50, 200), but not on it
    expect(lineD(container)).toMatch(/50\.00 200\.00$/); // snapped

    allow.current = false;
    move(63, 212);
    expect(lineD(container)).toMatch(/63\.00 212\.00$/); // follows the pointer instead
  });

  it('cancels on Escape and on pointercancel', () => {
    const onConnect = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} nodesConnectable onConnect={onConnect} />,
    );
    pointerOver(handle(container, 'b', 'in'));
    press(handle(container, 'a', 'out'), 50, 40);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(line(container)).toBeNull();
    release(50, 200); // the gesture is over: this does nothing
    expect(onConnect).not.toHaveBeenCalled();

    press(handle(container, 'a', 'out'), 50, 40);
    fireEvent.pointerCancel(window, pointer({ clientX: 50, clientY: 40 }));
    expect(line(container)).toBeNull();
  });

  it('honours a handle’s own isConnectable={false}, as a start and as a target', () => {
    function Locked() {
      return (
        <div>
          <Handle id="in" type="target" position={Position.Top} isConnectable={false} />
          <Handle id="out" type="source" position={Position.Bottom} isConnectable={false} />
        </div>
      );
    }
    const mixed: Node[] = [
      { ...nodes[0]!, type: 'locked' },
      { ...nodes[1]!, type: 'ports' },
    ];
    const onConnect = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={mixed} nodeTypes={{ ports: Ports, locked: Locked }} nodesConnectable onConnect={onConnect} />,
    );
    expect(handle(container, 'a', 'out').style.pointerEvents).toBe('none');

    press(handle(container, 'a', 'out'), 50, 40); // cannot start here
    expect(line(container)).toBeNull();

    // …and cannot be dropped onto, even if the browser reported it under the pointer.
    pointerOver(handle(container, 'a', 'in'));
    press(handle(container, 'b', 'out'), 50, 240);
    release(50, 0);
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('does not drag the node or pan the canvas from a handle', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} nodesConnectable nodesDraggable />,
    );
    pointerOver(null);
    const h = handle(container, 'a', 'out');
    press(h, 50, 40);
    // Moves happen *over* the handle in a browser, so they bubble through the
    // node and the canvas — which is where a drag or a pan would pick them up.
    fireEvent.pointerMove(h, pointer({ clientX: 300, clientY: 300 }));
    expect(line(container)).not.toBeNull(); // the connection is following…
    expect(must<HTMLElement>(container, '[data-id="a"]').style.transform).toBe('translate(0px, 0px)');
    expect(viewportOf(container)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('only starts on the primary button', () => {
    const { container } = render(<FlowingerCanvas nodes={nodes} nodeTypes={types} nodesConnectable />);
    fireEvent.pointerDown(handle(container, 'a', 'out'), { pointerId: 1, button: 2, clientX: 50, clientY: 40 });
    expect(line(container)).toBeNull();
  });

  it('follows the pointer in graph space, through the current pan and zoom', () => {
    pointerOver(null);
    const { container } = render(
      <FlowingerProvider initialViewport={{ x: 10, y: 20, zoom: 2 }}>
        <FlowingerCanvas nodes={nodes} nodeTypes={types} nodesConnectable />
      </FlowingerProvider>,
    );
    press(handle(container, 'a', 'out'), 60, 100);
    move(310, 220); // screen (310, 220) is graph ((310 − 10) / 2, (220 − 20) / 2)
    expect(lineD(container)).toMatch(/150\.00 100\.00$/);
  });

  it('lets go of the window when the canvas unmounts mid-drag', () => {
    const onConnect = vi.fn();
    pointerOver(null);
    const { container, unmount } = render(
      <FlowingerCanvas nodes={nodes} nodeTypes={types} nodesConnectable onConnect={onConnect} />,
    );
    press(handle(container, 'a', 'out'), 50, 40);
    unmount();
    expect(() => {
      move(100, 100);
      release(100, 100);
    }).not.toThrow();
    expect(onConnect).not.toHaveBeenCalled();
  });
});

describe('Flowinger minimap', () => {
  const nodes: Node[] = [
    { id: 'a', position: { x: 0, y: 0 }, data: {}, width: 100, height: 40 },
    { id: 'b', position: { x: 300, y: 200 }, data: {}, width: 100, height: 40 },
  ];
  /** An 800 × 600 pane. Everything below is worked out from that and the two nodes. */
  const sizePane = () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  };
  const map = (c: ParentNode) => must<SVGSVGElement>(c, '.flowinger-minimap');
  const viewRect = (c: ParentNode) => must(c, '.flowinger-minimap-view');
  const centreOf = (c: ParentNode) => {
    const vp = viewportOf(c);
    return { x: (400 - vp.x) / vp.zoom, y: (300 - vp.y) / vp.zoom }; // what the pane's middle shows
  };
  const tap = (el: Element, x: number, y: number) =>
    fireEvent.pointerDown(el, pointer({ clientX: x, clientY: y }));
  const drag = (el: Element, x: number, y: number) =>
    fireEvent.pointerMove(el, pointer({ clientX: x, clientY: y }));

  function Zoomer() {
    const { zoomIn } = useFlowinger();
    return <button onClick={() => { zoomIn(); }}>zoom</button>;
  }
  const setup = (over: { canvas?: Partial<Parameters<typeof FlowingerCanvas>[0]>; mini?: Partial<Parameters<typeof MiniMap>[0]> } = {}) =>
    render(
      <FlowingerProvider>
        <FlowingerCanvas nodes={nodes} {...over.canvas} />
        <MiniMap width={200} height={150} {...over.mini} />
        <Zoomer />
      </FlowingerProvider>,
    );

  it('draws every node where it is, at its size, in one colour or a function of the node', () => {
    sizePane();
    const { container } = setup();
    const rects = [...container.querySelectorAll('.flowinger-minimap-node')];
    expect(rects).toHaveLength(2);
    expect(rects[0]?.getAttribute('x')).toBe('0');
    expect(rects[0]?.getAttribute('width')).toBe('100');
    expect(rects[1]?.getAttribute('x')).toBe('300');
    expect(rects[1]?.getAttribute('y')).toBe('200');
    expect(rects[0]?.getAttribute('fill')).toContain('--flowinger-text-dim');

    const colored = setup({ mini: { nodeColor: (n) => (n.id === 'a' ? 'red' : 'blue') } });
    const fills = [...colored.container.querySelectorAll('.flowinger-minimap-node')].map((r) => r.getAttribute('fill'));
    expect(fills.slice(-2)).toEqual(['red', 'blue']);
  });

  it('shows the whole graph and the visible region, with the region cut out of the mask', () => {
    sizePane();
    const { container } = setup();
    // The view is (0, 0, 800, 600) and covers both nodes, so it sets the bounds;
    // 5% of the longer side (40) is left around it.
    expect(map(container).getAttribute('viewBox')).toBe('-40 -40 880 680');
    const view = viewRect(container);
    expect([view.getAttribute('x'), view.getAttribute('y'), view.getAttribute('width'), view.getAttribute('height')])
      .toEqual(['0', '0', '800', '600']);
    const mask = must(container, '.flowinger-minimap-mask');
    expect(mask.getAttribute('d')).toBe('M-40,-40h880v680h-880z M0,0h800v600h-800z');
    expect(mask.getAttribute('fill-rule')).toBe('evenodd');
  });

  it('follows the viewport: zooming in shrinks the visible region', () => {
    sizePane();
    const { container } = setup();
    fireEvent.click(screen.getByText('zoom')); // ×1.25 about the pane's middle
    const view = viewRect(container);
    // 800 / 1.25 = 640 wide, 600 / 1.25 = 480 high, still centred on (400, 300).
    expect([view.getAttribute('x'), view.getAttribute('y'), view.getAttribute('width'), view.getAttribute('height')])
      .toEqual(['80', '60', '640', '480']);
  });

  it('moves the view to where you click, and keeps following while you drag', () => {
    sizePane();
    const { container } = setup();
    // The 880 × 680 box fits 200 × 150 at 150 / 680 (the height limits it), and is
    // centred sideways by the letterbox: (200 − 880 · 150/680) / 2 ≈ 2.94.
    const scale = 150 / 680;
    const letterbox = (200 - 880 * scale) / 2;
    const graphAt = (px: number, py: number) => ({ x: (px - letterbox) / scale - 40, y: py / scale - 40 });

    tap(map(container), 150, 75);
    expect(centreOf(container).x).toBeCloseTo(graphAt(150, 75).x, 1);
    expect(centreOf(container).y).toBeCloseTo(graphAt(150, 75).y, 1);

    drag(map(container), 60, 30); // dragging on: the view keeps following
    expect(centreOf(container).x).toBeCloseTo(graphAt(60, 30).x, 1);
    expect(centreOf(container).y).toBeCloseTo(graphAt(60, 30).y, 1);

    fireEvent.pointerUp(map(container), pointer({ clientX: 60, clientY: 30 }));
    const settled = viewportOf(container);
    drag(map(container), 180, 120); // released: further moves do nothing
    expect(viewportOf(container)).toEqual(settled);
  });

  it('holds the map still during a drag, then refits it to the view on release', () => {
    sizePane();
    const { container } = setup();
    const viewBox = () => map(container).getAttribute('viewBox');
    const before = viewBox();

    tap(map(container), 190, 75); // far right: the view moves well past the nodes
    drag(map(container), 195, 75);
    expect(viewBox()).toBe(before); // frozen: the map does not swim under the pointer

    fireEvent.pointerUp(map(container), pointer({ clientX: 195, clientY: 75 }));
    expect(viewBox()).not.toBe(before); // refitted to include where the view now is
    const [bx = 0, by = 0, bw = 0, bh = 0] = (viewBox() ?? '').split(' ').map(Number);
    const view = viewRect(container);
    const vx = Number(view.getAttribute('x'));
    const vy = Number(view.getAttribute('y'));
    expect(vx).toBeGreaterThanOrEqual(bx - 1e-6);
    expect(vy).toBeGreaterThanOrEqual(by - 1e-6);
    expect(vx + Number(view.getAttribute('width'))).toBeLessThanOrEqual(bx + bw + 1e-6);
    expect(vy + Number(view.getAttribute('height'))).toBeLessThanOrEqual(by + bh + 1e-6);
  });

  it('keeps the zoom when it moves the view', () => {
    sizePane();
    const { container } = setup();
    fireEvent.click(screen.getByText('zoom'));
    const zoom = viewportOf(container).zoom;
    tap(map(container), 40, 40);
    expect(viewportOf(container).zoom).toBeCloseTo(zoom);
  });

  it('does nothing on a press when pannable is off', () => {
    sizePane();
    const { container } = setup({ mini: { pannable: false } });
    tap(map(container), 150, 75);
    expect(viewportOf(container)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('is not a pan, a drag or a pane click when it sits inside the canvas', () => {
    sizePane();
    const onPaneClick = vi.fn();
    const { container } = render(
      <FlowingerCanvas nodes={nodes} onPaneClick={onPaneClick}>
        <MiniMap width={200} height={150} />
      </FlowingerCanvas>,
    );
    // The middle of the overview is the middle of the view: pressing there moves nothing.
    tap(map(container), 100, 75);
    // …so if the press had also reached the canvas, this move would pan it.
    fireEvent.pointerMove(must(container, '.flowinger'), pointer({ clientX: 160, clientY: 75 }));
    expect(viewportOf(container)).toEqual({ x: 0, y: 0, zoom: 1 });
    fireEvent.click(map(container));
    expect(onPaneClick).not.toHaveBeenCalled();
  });

  it('follows a dragged node, and a new layout from the parent', () => {
    sizePane();
    const { container, rerender } = render(
      <FlowingerProvider>
        <FlowingerCanvas nodes={nodes} nodesDraggable />
        <MiniMap width={200} height={150} />
      </FlowingerProvider>,
    );
    const b = must(container, '[data-id="b"]');
    fireEvent.pointerDown(b, pointer({ clientX: 0, clientY: 0 }));
    fireEvent.pointerMove(b, pointer({ clientX: 40, clientY: 30 }));
    const rectB = () => [...container.querySelectorAll('.flowinger-minimap-node')][1];
    expect(rectB()?.getAttribute('x')).toBe('340');
    expect(rectB()?.getAttribute('y')).toBe('230');

    // A parent laying the graph out afresh is heard by the overview too.
    rerender(
      <FlowingerProvider>
        <FlowingerCanvas nodes={nodes.map((n) => (n.id === 'b' ? { ...n, position: { x: 500, y: 100 } } : n))} nodesDraggable />
        <MiniMap width={200} height={150} />
      </FlowingerProvider>,
    );
    expect(rectB()?.getAttribute('x')).toBe('500');
    expect(rectB()?.getAttribute('y')).toBe('100');
  });

  it('draws only the nodes while the pane has no size, and an empty box for an empty graph', () => {
    const { container } = render(
      <FlowingerProvider>
        <FlowingerCanvas nodes={nodes} />
        <MiniMap width={200} height={150} />
      </FlowingerProvider>,
    ); // jsdom: the pane measures zero
    expect(container.querySelectorAll('.flowinger-minimap-node')).toHaveLength(2);
    expect(container.querySelector('.flowinger-minimap-view')).toBeNull();
    expect(container.querySelector('.flowinger-minimap-mask')).toBeNull();

    const none = render(
      <FlowingerProvider>
        <FlowingerCanvas nodes={[]} />
        <MiniMap width={200} height={150} />
      </FlowingerProvider>,
    );
    expect(none.container.querySelectorAll('.flowinger-minimap-node')).toHaveLength(0);
    expect(must(none.container, '.flowinger-minimap').getAttribute('viewBox')).toBe('0 0 200 150');
  });

  it('is announced as an image with a name', () => {
    const { container } = setup({ mini: { ariaLabel: 'Query plan overview' } });
    expect(map(container).getAttribute('role')).toBe('img');
    expect(map(container).getAttribute('aria-label')).toBe('Query plan overview');
  });
});

describe('Flowinger background', () => {
  const pattern = (c: ParentNode) => must(c, 'pattern');
  const dot = (c: ParentNode) => must(pattern(c), 'circle');
  const rendered = (ui: React.ReactElement) => render(<FlowingerProvider>{ui}</FlowingerProvider>);

  it('takes a dot’s size as its diameter, as React Flow does', () => {
    const { container } = rendered(<Background size={4} gap={20} color="tomato" />);
    expect(dot(container).getAttribute('r')).toBe('2'); // a 4-wide dot
    expect(dot(container).getAttribute('fill')).toBe('tomato');
    expect(pattern(container).getAttribute('width')).toBe('20');
    // Centred in its cell.
    expect([dot(container).getAttribute('cx'), dot(container).getAttribute('cy')]).toEqual(['10', '10']);
  });

  it('defaults to a 1-wide dot: a migrated size={1} draws the same, not twice as big', () => {
    expect(dot(rendered(<Background />).container).getAttribute('r')).toBe('0.5');
    expect(dot(rendered(<Background size={1} />).container).getAttribute('r')).toBe('0.5');
  });

  it('draws lines with lineWidth, and lets size alone leave them be', () => {
    const { container } = rendered(<Background variant="lines" size={9} lineWidth={3} />);
    const path = must(pattern(container), 'path');
    expect(path.getAttribute('stroke-width')).toBe('3');
    expect(rendered(<Background variant="lines" />).container.querySelector('pattern path')?.getAttribute('stroke-width')).toBe('1');
  });

  it('draws a cross whose arms are `size` long, 6 by default', () => {
    const custom = rendered(<Background variant="cross" size={8} gap={20} lineWidth={2} />);
    // Centred on (10, 10): 4 either way.
    expect(must(pattern(custom.container), 'path').getAttribute('d')).toBe('M 6 10 H 14 M 10 6 V 14');
    expect(must(pattern(custom.container), 'path').getAttribute('stroke-width')).toBe('2');
    const plain = rendered(<Background variant="cross" gap={20} />);
    expect(must(pattern(plain.container), 'path').getAttribute('d')).toBe('M 7 10 H 13 M 10 7 V 13');
  });

  it('follows the viewport, so the pattern pans and zooms with the graph', () => {
    function Zoomer() {
      const { zoomIn } = useFlowinger();
      return <button onClick={() => { zoomIn(); }}>zoom</button>;
    }
    const { container } = render(
      <FlowingerProvider initialViewport={{ x: 5, y: 6, zoom: 1 }}>
        <Background />
        <Zoomer />
      </FlowingerProvider>,
    );
    expect(pattern(container).getAttribute('patternTransform')).toBe('translate(5, 6) scale(1)');
    fireEvent.click(screen.getByText('zoom')); // ×1.25 (the default maximum is 2, so start below it)
    expect(pattern(container).getAttribute('patternTransform')).toContain('scale(1.25)');
  });

  it('gives each background its own id, made of characters that are safe in url()', () => {
    const a = rendered(<Background />);
    const b = rendered(<Background />);
    const idA = pattern(a.container).id;
    expect(idA).not.toBe(pattern(b.container).id);
    expect(idA).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(must(a.container, 'rect').getAttribute('fill')).toBe(`url(#${idA})`);
  });
});
