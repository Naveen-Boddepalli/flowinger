import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import {
  FlowingerCanvas,
  FlowingerProvider,
  useEdgesState,
  type Edge,
  type EdgeProps,
  type Node,
} from '../index.ts';
import { EditableEdge, HexagonNode, getEditableEdgePath, shapeNodeTypes } from '../pro/index.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const pointer = (extra: Record<string, number | boolean>) => ({ pointerId: 1, button: 0, ...extra });
function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}

describe('getEditableEdgePath', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 200, y: 100 };

  it('runs straight from the source through each waypoint to the target', () => {
    const [d] = getEditableEdgePath({ from, points: [{ x: 100, y: 0 }, { x: 100, y: 100 }], to });
    expect(d).toBe('M 0 0 L 100 0 L 100 100 L 200 100');
  });

  it('is one straight run with no waypoints', () => {
    const [d, x, y] = getEditableEdgePath({ from, points: [], to });
    expect(d).toBe('M 0 0 L 200 100');
    expect([x, y]).toEqual([100, 50]);
  });

  it('rounds a corner by up to the radius, and not further than half a run', () => {
    const [d] = getEditableEdgePath({ from, points: [{ x: 100, y: 0 }], to: { x: 100, y: 8 }, borderRadius: 20 });
    // The second run is 8 long: its corner is rounded by 4, not 20.
    expect(d).toContain('Q 100 0 100 4');
  });

  it('puts the label halfway along, by length', () => {
    const [, x, y] = getEditableEdgePath({ from, points: [{ x: 300, y: 0 }], to: { x: 300, y: 100 } });
    // 300 across and 100 down: halfway is 200 along the first run.
    expect([x, y]).toEqual([200, 0]);
  });
});

describe('EditableEdge', () => {
  const nodes: Node[] = [
    { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
    { id: 'b', position: { x: 400, y: 300 }, width: 100, height: 40, data: {} },
  ];
  const seen: { edges: Edge[] } = { edges: [] };

  function Editor({ points }: { points?: { x: number; y: number }[] }) {
    const [edges, , onEdgesChange] = useEdgesState<Edge>([
      {
        id: 'e',
        source: 'a',
        target: 'b',
        type: 'editable',
        ...(points ? { data: { points } } : {}),
      },
    ]);
    seen.edges = edges;
    return (
      <FlowingerProvider>
        <div style={{ width: 800, height: 600 }}>
          <FlowingerCanvas
            nodes={nodes}
            edges={edges}
            edgeTypes={{ editable: EditableEdge }}
            onEdgesChange={onEdgesChange}
            elementsSelectable
          />
        </div>
      </FlowingerProvider>
    );
  }
  const pointsOf = () => (seen.edges[0]?.data?.points ?? []) as { x: number; y: number }[];
  const edgeEl = (c: ParentNode) => must<SVGGElement>(c, '[data-testid="rf__edge-e"]');
  const select = (c: ParentNode) => fireEvent.click(edgeEl(c));
  const dots = (c: ParentNode) => c.querySelectorAll('.flowinger-edge-point');
  const mids = (c: ParentNode) => c.querySelectorAll('.flowinger-edge-midpoint');
  const dragTo = (el: Element, at: [number, number], to: [number, number]) => {
    fireEvent.pointerDown(el, pointer({ clientX: at[0], clientY: at[1] }));
    fireEvent.pointerMove(window, pointer({ clientX: to[0], clientY: to[1] }));
    fireEvent.pointerUp(window, pointer({ clientX: to[0], clientY: to[1] }));
  };

  it('draws the edge through its waypoints', () => {
    const { container } = render(<Editor points={[{ x: 250, y: 20 }]} />);
    const d = must(container, '.react-flow__edge-path').getAttribute('d') ?? '';
    expect(d).toContain('250 20');
  });

  it('shows its points and the places to add one only while it is selected', () => {
    const { container } = render(<Editor points={[{ x: 250, y: 20 }]} />);
    expect(dots(container)).toHaveLength(0);
    select(container);
    expect(dots(container)).toHaveLength(1);
    // One between each pair of ends: source–point, point–target.
    expect(mids(container)).toHaveLength(2);
  });

  it('moves a waypoint with a drag, writing it to the edge\'s data', () => {
    const { container } = render(<Editor points={[{ x: 250, y: 20 }]} />);
    select(container);
    dragTo(dots(container)[0] as Element, [250, 20], [300, 60]);
    expect(pointsOf()).toEqual([{ x: 300, y: 60 }]);
    expect(must(container, '.react-flow__edge-path').getAttribute('d')).toContain('300 60');
  });

  it('adds a waypoint by dragging the place between two ends, and keeps dragging it', () => {
    const { container } = render(<Editor />);
    select(container);
    expect(dots(container)).toHaveLength(0);
    expect(mids(container)).toHaveLength(1);
    dragTo(mids(container)[0] as Element, [250, 170], [260, 40]);
    expect(pointsOf()).toEqual([{ x: 260, y: 40 }]);
    expect(dots(container)).toHaveLength(1);
  });

  it('adds it in order: between the waypoints it falls between', () => {
    const { container } = render(<Editor points={[{ x: 100, y: 200 }, { x: 300, y: 200 }]} />);
    select(container);
    // Mids: source–p0, p0–p1, p1–target. The middle one is the second.
    dragTo(mids(container)[1] as Element, [200, 200], [200, 260]);
    expect(pointsOf()).toEqual([{ x: 100, y: 200 }, { x: 200, y: 260 }, { x: 300, y: 200 }]);
  });

  it('removes a waypoint with a double click', () => {
    const { container } = render(<Editor points={[{ x: 100, y: 200 }, { x: 300, y: 200 }]} />);
    select(container);
    fireEvent.doubleClick(dots(container)[0] as Element);
    expect(pointsOf()).toEqual([{ x: 300, y: 200 }]);
  });

  it('does not pan the canvas, or start a drag of anything, from a press on a point', () => {
    const { container } = render(<Editor points={[{ x: 250, y: 20 }]} />);
    select(container);
    const before = must<HTMLElement>(container, '.flowinger-viewport').style.transform;
    dragTo(dots(container)[0] as Element, [250, 20], [320, 90]);
    expect(must<HTMLElement>(container, '.flowinger-viewport').style.transform).toBe(before);
  });

  it('takes the points it is given in the edge\'s data, whatever else is there', () => {
    function Probe(props: EdgeProps) {
      return <EditableEdge {...props} />;
    }
    const { container } = render(
      <FlowingerCanvas
        nodes={nodes}
        edges={[{ id: 'e', source: 'a', target: 'b', type: 'p', data: { label: 'x', points: [{ x: 10, y: 10 }] } }]}
        edgeTypes={{ p: Probe }}
      />,
    );
    expect(must(container, '.react-flow__edge-path').getAttribute('d')).toContain('10 10');
  });
});

describe('HexagonNode', () => {
  it('draws a six-sided shape with its label, and is among the shape node types', () => {
    const { container, getByText } = render(
      <FlowingerCanvas
        nodes={[{ id: 'h', type: 'hexagon', position: { x: 0, y: 0 }, data: { label: 'Prepare' } }]}
        nodeTypes={{ hexagon: HexagonNode }}
      />,
    );
    expect(getByText('Prepare')).toBeTruthy();
    const points = container.querySelector('polygon')?.getAttribute('points')?.trim().split(/\s+/) ?? [];
    expect(points).toHaveLength(6);
    expect(shapeNodeTypes.hexagon).toBe(HexagonNode);
  });
});
