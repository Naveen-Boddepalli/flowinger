import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import * as ReactFlowLib from '@xyflow/react';
import {
  FlowingerCanvas,
  FlowingerCore,
  BaseEdge,
  BezierEdge,
  Position,
  SmoothStepEdge,
  StepEdge,
  StraightEdge,
  edgeLabelsFeature,
  editingFeature,
  getBezierEdgeCenter,
  getBezierPath,
  getEdgeCenter,
  getSmoothStepPath,
  getStraightPath,
  isEdge,
  isNode,
  type Edge,
  type EdgeProps,
  type FlowingerInstance,
  type Node,
} from '../index.ts';
import { pathFor } from '../paths.ts';

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  return el;
}
const edgeEl = (c: ParentNode, id: string) => must<SVGGElement>(c, `[data-testid="rf__edge-${id}"]`);
const nums = (d: string) => (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);

const nodes: Node[] = [
  { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
  { id: 'b', position: { x: 300, y: 200 }, width: 100, height: 40, data: {} },
];
const withEdge = (edge: Partial<Edge>, props: Record<string, unknown> = {}) =>
  render(
    <div style={{ width: 800, height: 600 }}>
      <FlowingerCore nodes={nodes} edges={[{ id: 'e', source: 'a', target: 'b', ...edge }]} {...props} />
    </div>,
  );

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];
const POINTS: [number, number, number, number][] = [
  [0, 0, 200, 100],
  [200, 100, 0, 0],
  [0, 0, 0, 150],
  [50, 50, 60, 55],
  [-30, 20, 400, -80],
];

describe('the path functions, against React Flow\'s', () => {
  it('draw the same bezier, and put its label on the curve where theirs is — for every pair of sides', () => {
    for (const [sx, sy, tx, ty] of POINTS) {
      for (const sp of SIDES) {
        for (const tp of SIDES) {
          const args = { sourceX: sx, sourceY: sy, sourcePosition: sp, targetX: tx, targetY: ty, targetPosition: tp };
          const ours = getBezierPath(args);
          const theirs = ReactFlowLib.getBezierPath(args as never);
          const where = JSON.stringify(args);
          const a = nums(ours[0]);
          const b = nums(theirs[0]);
          expect(a.length, where).toBe(b.length);
          a.forEach((v, i) => {
            expect(Math.abs(v - (b[i] ?? NaN)), `${where} number ${String(i)}`).toBeLessThan(0.01);
          });
          expect(ours).toHaveLength(5);
          expect(ours[1], `label x ${where}`).toBeCloseTo(theirs[1], 9);
          expect(ours[2], `label y ${where}`).toBeCloseTo(theirs[2], 9);
          expect(ours[3], `offset x ${where}`).toBeCloseTo(theirs[3], 9);
          expect(ours[4], `offset y ${where}`).toBeCloseTo(theirs[4], 9);
        }
      }
    }
  });

  it('bend the same with a curvature', () => {
    for (const curvature of [0, 0.1, 0.5, 1]) {
      const args = { sourceX: 0, sourceY: 0, sourcePosition: Position.Right, targetX: -120, targetY: 90, targetPosition: Position.Left, curvature };
      const a = nums(getBezierPath(args)[0]);
      const b = nums(ReactFlowLib.getBezierPath(args as never)[0]);
      a.forEach((v, i) => {
        expect(Math.abs(v - (b[i] ?? NaN)), `curvature ${String(curvature)}`).toBeLessThan(0.01);
      });
    }
  });

  it('give the straight line\'s middle and offsets as theirs do', () => {
    for (const [sx, sy, tx, ty] of POINTS) {
      const args = { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty };
      const ours = getStraightPath(args);
      const theirs = ReactFlowLib.getStraightPath(args);
      expect(ours.slice(1)).toEqual(theirs.slice(1));
    }
  });

  it('getEdgeCenter and getBezierEdgeCenter are React Flow\'s numbers', () => {
    for (const [sx, sy, tx, ty] of POINTS) {
      const args = { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty };
      expect(getEdgeCenter(args)).toEqual(ReactFlowLib.getEdgeCenter(args));
      const withControls = { ...args, sourceControlX: sx + 30, sourceControlY: sy, targetControlX: tx - 30, targetControlY: ty + 10 };
      expect(getBezierEdgeCenter(withControls)).toEqual(ReactFlowLib.getBezierEdgeCenter(withControls));
    }
  });

  it('a smooth-step path says where its label goes, and how far from the source', () => {
    const [, labelX, labelY, offsetX, offsetY] = getSmoothStepPath({
      sourceX: 10,
      sourceY: 20,
      sourcePosition: Position.Bottom,
      targetX: 110,
      targetY: 220,
      targetPosition: Position.Top,
    });
    expect([labelX, labelY]).toEqual([60, 120]);
    expect([offsetX, offsetY]).toEqual([50, 100]);
  });
});

describe('isNode and isEdge, against React Flow\'s', () => {
  const samples: unknown[] = [
    { id: 'n', position: { x: 0, y: 0 }, data: {} },
    { id: 'e', source: 'a', target: 'b' },
    { id: 'x' },
    { source: 'a', target: 'b' },
    { id: 'odd', position: { x: 0, y: 0 }, source: 'a' },
    { id: 'odd2', position: { x: 0, y: 0 }, target: 'b' },
  ];
  it('agree on every sample', () => {
    for (const sample of samples) {
      expect(isNode(sample), JSON.stringify(sample)).toBe(ReactFlowLib.isNode(sample as never));
      expect(isEdge(sample), JSON.stringify(sample)).toBe(ReactFlowLib.isEdge(sample as never));
    }
  });
  it('are false for what is not an object', () => {
    for (const v of [null, undefined, 3, 'a']) {
      expect(isNode(v)).toBe(false);
      expect(isEdge(v)).toBe(false);
    }
  });
});

describe('the built-in edges as components', () => {
  const props = (over: Partial<EdgeProps> = {}): EdgeProps => ({
    id: 'e',
    source: 'a',
    target: 'b',
    sourceX: 0,
    sourceY: 0,
    targetX: 200,
    targetY: 100,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    sourceHandleId: null,
    targetHandleId: null,
    ...over,
  });
  const drawn = (Edge: (p: EdgeProps) => React.ReactNode, p: EdgeProps) => {
    const { container } = render(
      <svg>
        <Edge {...p} />
      </svg>,
    );
    return must<SVGPathElement>(container, '.react-flow__edge-path').getAttribute('d') ?? '';
  };

  it('BezierEdge draws getBezierPath, bent by pathOptions.curvature', () => {
    // Curvature only matters where the target is behind the source (below a bottom-facing source).
    const behind = { targetX: 200, targetY: -100 };
    const want = (curvature?: number) =>
      getBezierPath({ sourceX: 0, sourceY: 0, sourcePosition: Position.Bottom, ...behind, targetPosition: Position.Top, ...(curvature === undefined ? {} : { curvature }) })[0];
    expect(drawn(BezierEdge, props(behind))).toBe(want());
    expect(drawn(BezierEdge, props({ ...behind, pathOptions: { curvature: 0.8 } }))).toBe(want(0.8));
    expect(want(0.8)).not.toBe(want());
  });

  it('StraightEdge draws a line', () => {
    expect(drawn(StraightEdge, props())).toBe('M 0.00 0.00 L 200.00 100.00');
  });

  it('SmoothStepEdge rounds its corners, by pathOptions.borderRadius; StepEdge does not', () => {
    expect(drawn(SmoothStepEdge, props())).toContain('Q');
    expect(drawn(SmoothStepEdge, props({ pathOptions: { borderRadius: 0 } }))).not.toContain('Q');
    expect(drawn(StepEdge, props())).not.toContain('Q');
    expect(drawn(StepEdge, props({ pathOptions: { borderRadius: 20 } }))).not.toContain('Q');
    const round = (r: number) => drawn(SmoothStepEdge, props({ pathOptions: { borderRadius: r } }));
    expect(round(20)).not.toBe(round(5));
  });

  it('hand the label, the markers, the style and the hit width on to BaseEdge', () => {
    const { container } = render(
      <svg>
        <BezierEdge
          {...props({
            label: 'hello',
            labelStyle: { fill: 'red' },
            markerEnd: 'url(#m)',
            style: { stroke: 'blue' },
            interactionWidth: 33,
          })}
        />
      </svg>,
    );
    const path = must<SVGPathElement>(container, '.react-flow__edge-path');
    expect(path.getAttribute('marker-end')).toBe('url(#m)');
    expect(path.style.stroke).toBe('blue');
    expect(must(container, '.react-flow__edge-interaction').getAttribute('stroke-width')).toBe('33');
    expect(must<SVGTextElement>(container, '.react-flow__edge-text').style.fill).toBe('red');
  });

  it('can be an edgeTypes entry, so a canvas draws an edge with one', () => {
    const { container } = withEdge({ type: 'mine', pathOptions: { curvature: 1 } }, { edgeTypes: { mine: StepEdge } });
    expect(must(container, '[data-testid="rf__edge-e"] .react-flow__edge-path').getAttribute('d')).not.toContain('C');
  });
});

describe('pathOptions on an edge', () => {
  const s = { x: 0, y: 0 };
  const t = { x: 200, y: 100 };
  it('bend a bezier by its curvature — where the target is behind the source', () => {
    const behind = { x: -120, y: 90 };
    const plain = pathFor('bezier', s, Position.Right, behind, Position.Left).d;
    const bent = pathFor('bezier', s, Position.Right, behind, Position.Left, { curvature: 2 }).d;
    expect(bent).not.toBe(plain);
    expect(pathFor('bezier', s, Position.Right, behind, Position.Left, {}).d).toBe(plain);
    expect(pathFor('bezier', s, Position.Right, behind, Position.Left, { borderRadius: 30 }).d).toBe(plain);
  });
  it('round a smoothstep by its borderRadius, and leave a step square', () => {
    const plain = pathFor('smoothstep', s, Position.Right, t, Position.Left).d;
    expect(pathFor('smoothstep', s, Position.Right, t, Position.Left, { borderRadius: 0 }).d).not.toContain('Q');
    expect(plain).toContain('Q');
    expect(pathFor('smoothstep', s, Position.Right, t, Position.Left, { curvature: 3 }).d).toBe(plain);
    expect(pathFor('step', s, Position.Right, t, Position.Left, { borderRadius: 30 }).d).not.toContain('Q');
  });
  it('reach the drawn edge', () => {
    const plain = withEdge({ type: 'smoothstep' });
    const square = withEdge({ type: 'smoothstep', pathOptions: { borderRadius: 0 } });
    expect(must(plain.container, '.react-flow__edge-path').getAttribute('d')).toContain('Q');
    expect(must(square.container, '.react-flow__edge-path').getAttribute('d')).not.toContain('Q');
  });
});

describe('what a custom edge is told', () => {
  const seen: EdgeProps[] = [];
  const Spy = (p: EdgeProps) => {
    seen.push(p);
    return null;
  };
  afterEach(() => {
    seen.length = 0;
  });

  it('carries the fields of the edge: animated, deletable, the label\'s look, the hit width, the path options', () => {
    withEdge(
      {
        type: 'spy',
        animated: true,
        deletable: false,
        interactionWidth: 44,
        label: 'L',
        labelStyle: { fill: 'green' },
        labelShowBg: true,
        labelBgStyle: { fill: 'black' },
        labelBgPadding: [3, 5],
        labelBgBorderRadius: 9,
        pathOptions: { curvature: 0.7 },
      },
      { edgeTypes: { spy: Spy } },
    );
    const p = seen[seen.length - 1];
    expect(p).toMatchObject({
      animated: true,
      deletable: false,
      interactionWidth: 44,
      label: 'L',
      labelStyle: { fill: 'green' },
      labelShowBg: true,
      labelBgStyle: { fill: 'black' },
      labelBgPadding: [3, 5],
      labelBgBorderRadius: 9,
      pathOptions: { curvature: 0.7 },
    });
  });

  it('says an edge can be deleted unless it says not, and whether it can be selected', () => {
    withEdge({ type: 'spy' }, { edgeTypes: { spy: Spy } });
    expect(seen[seen.length - 1]?.deletable).toBe(true);
    // A bare core has no selection feature: nothing can be selected.
    expect(seen[seen.length - 1]?.selectable).toBe(false);
    seen.length = 0;
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas
          nodes={nodes}
          edges={[{ id: 'e', source: 'a', target: 'b', type: 'spy' }]}
          edgeTypes={{ spy: Spy }}
          elementsSelectable
        />
      </div>,
    );
    expect(seen[seen.length - 1]?.selectable).toBe(true);
  });
});

describe('an edge\'s label', () => {
  const box = { x: 40, y: 10, width: 60, height: 12 };
  // jsdom lays nothing out and has no `getBBox`; a browser measures the text.
  const withBBox = (measure: () => typeof box) => {
    (SVGElement.prototype as unknown as { getBBox: () => typeof box }).getBBox = measure;
  };
  afterEach(() => {
    delete (SVGElement.prototype as unknown as { getBBox?: unknown }).getBBox;
  });

  it('is drawn with a halo, and takes labelStyle over its own look', () => {
    const { container } = withEdge({ label: 'hi', labelStyle: { fill: 'red', fontSize: 20 } });
    const text = must<SVGTextElement>(container, '.react-flow__edge-text');
    expect(text.textContent).toBe('hi');
    expect(text.style.fill).toBe('red');
    expect(text.style.fontSize).toBe('20px');
    // What labelStyle leaves alone keeps its default — the halo that keeps it readable.
    expect(text.style.strokeWidth).toBe('4');
    expect(container.querySelector('.react-flow__edge-textbg')).toBeNull();
  });

  const boxed = { features: [edgeLabelsFeature] };

  it('gets a box behind it, as big as the text plus its padding, when labelShowBg is on', () => {
    withBBox(() => box);
    const { container } = withEdge({ label: 'hi', labelShowBg: true }, boxed);
    const rect = must<SVGRectElement>(container, '.react-flow__edge-textbg');
    // The default padding is [2, 4]: two either side, four above and below.
    expect(rect.getAttribute('x')).toBe('38');
    expect(rect.getAttribute('y')).toBe('6');
    expect(rect.getAttribute('width')).toBe('64');
    expect(rect.getAttribute('height')).toBe('20');
    expect(rect.getAttribute('rx')).toBe('2');
    expect(rect.getAttribute('ry')).toBe('2');
    // The box replaces the halo.
    const text = must<SVGTextElement>(container, '.react-flow__edge-text');
    expect(text.style.strokeWidth).toBe('');
  });

  it('follows labelBgPadding, labelBgBorderRadius and labelBgStyle', () => {
    withBBox(() => box);
    const { container } = withEdge(
      {
        label: 'hi',
        labelShowBg: true,
        labelBgPadding: [10, 1],
        labelBgBorderRadius: 7,
        labelBgStyle: { fill: 'gold' },
      },
      boxed,
    );
    const rect = must<SVGRectElement>(container, '.react-flow__edge-textbg');
    expect(rect.getAttribute('x')).toBe('30');
    expect(rect.getAttribute('y')).toBe('9');
    expect(rect.getAttribute('width')).toBe('80');
    expect(rect.getAttribute('height')).toBe('14');
    expect(rect.getAttribute('rx')).toBe('7');
    expect(rect.style.fill).toBe('gold');
  });

  it('has no box unless asked for one', () => {
    withBBox(() => box);
    const { container } = withEdge({ label: 'hi' }, boxed);
    expect(container.querySelector('.react-flow__edge-textbg')).toBeNull();
  });

  it('still shows its text where nothing can measure it', () => {
    const { container } = withEdge({ label: 'hi', labelShowBg: true }, boxed);
    expect(container.querySelector('.react-flow__edge-textbg')).toBeNull();
    expect(must(container, '.react-flow__edge-text').textContent).toBe('hi');
  });

  it('is a feature\'s: without edgeLabels a core keeps the halo and draws no box', () => {
    withBBox(() => box);
    const { container } = withEdge({ label: 'hi', labelShowBg: true });
    expect(container.querySelector('.react-flow__edge-textbg')).toBeNull();
    expect(must<SVGTextElement>(container, '.react-flow__edge-text').style.strokeWidth).toBe('4');
  });

  it('is measured again when the label changes', () => {
    let width = 60;
    withBBox(() => ({ ...box, width }));
    const view = withEdge({ label: 'hi', labelShowBg: true }, boxed);
    expect(must(view.container, '.react-flow__edge-textbg').getAttribute('width')).toBe('64');
    width = 100;
    view.rerender(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore
          nodes={nodes}
          edges={[{ id: 'e', source: 'a', target: 'b', label: 'a longer one', labelShowBg: true }]}
          {...boxed}
        />
      </div>,
    );
    expect(must(view.container, '.react-flow__edge-textbg').getAttribute('width')).toBe('104');
  });

  it('is measured again when labelStyle changes: a bigger font can widen the box', () => {
    let w = 60;
    withBBox(() => ({ ...box, width: w }));
    const view = withEdge({ label: 'hi', labelShowBg: true }, boxed);
    expect(must(view.container, '.react-flow__edge-textbg').getAttribute('width')).toBe('64');
    w = 90;
    view.rerender(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore
          nodes={nodes}
          edges={[{ id: 'e', source: 'a', target: 'b', label: 'hi', labelShowBg: true, labelStyle: { fontSize: 20 } }]}
          {...boxed}
        />
      </div>,
    );
    expect(must(view.container, '.react-flow__edge-textbg').getAttribute('width')).toBe('94');
  });

  it('is drawn by BaseEdge inside a custom edge, given the same props', () => {
    withBBox(() => box);
    const Mine = ({ label }: EdgeProps) => (
      <BaseEdge path="M0 0 L10 10" label={label} labelX={5} labelY={5} labelShowBg labelBgPadding={[1, 1]} />
    );
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas
          nodes={nodes}
          edges={[{ id: 'e', source: 'a', target: 'b', type: 'mine', label: 'x' }]}
          edgeTypes={{ mine: Mine }}
        />
      </div>,
    );
    expect(must(container, '.react-flow__edge-textbg').getAttribute('width')).toBe('62');
  });
});

describe('interactionWidth', () => {
  it('is the width of the strip along an edge that takes the pointer', () => {
    const { container } = withEdge({ interactionWidth: 44 }, { onEdgeClick: vi.fn() });
    expect(must(container, '.react-flow__edge-interaction').getAttribute('stroke-width')).toBe('44');
  });
  it('is 20 by default for an edge that can be reached', () => {
    const { container } = withEdge({}, { onEdgeClick: vi.fn() });
    expect(must(container, '.react-flow__edge-interaction').getAttribute('stroke-width')).toBe('20');
  });
  it('is no strip at all when it is 0, however the edge can be reached', () => {
    const { container } = withEdge({ interactionWidth: 0 }, { onEdgeClick: vi.fn() });
    expect(container.querySelector('.react-flow__edge-interaction')).toBeNull();
  });
  it('is a strip even for an edge nobody listens to, when it is asked for', () => {
    const { container } = withEdge({ interactionWidth: 12 });
    expect(must(container, '.react-flow__edge-interaction').getAttribute('stroke-width')).toBe('12');
    expect(edgeEl(container, 'e').style.pointerEvents).toBe('');
  });
});

describe('updateEdgeData', () => {
  function canvas() {
    let instance: FlowingerInstance | undefined;
    const view = render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCanvas
          defaultNodes={nodes}
          defaultEdges={[{ id: 'e', source: 'a', target: 'b', data: { weight: 1, tag: 'x' } }]}
          onInit={(i) => (instance = i)}
        />
      </div>,
    );
    return {
      ...view,
      run: (fn: (i: FlowingerInstance) => void) => {
        act(() => {
          if (instance) fn(instance);
        });
      },
      edge: () => instance?.getEdge('e'),
    };
  }

  it('merges into the data', () => {
    const c = canvas();
    c.run((i) => {
      i.updateEdgeData('e', { weight: 5 });
    });
    expect(c.edge()?.data).toEqual({ weight: 5, tag: 'x' });
  });
  it('replaces it, when told to', () => {
    const c = canvas();
    c.run((i) => {
      i.updateEdgeData('e', { weight: 5 }, { replace: true });
    });
    expect(c.edge()?.data).toEqual({ weight: 5 });
  });
  it('takes a function of the edge', () => {
    const c = canvas();
    c.run((i) => {
      i.updateEdgeData('e', (edge) => ({ weight: Number(edge.data?.weight) + 10 }));
    });
    expect(c.edge()?.data).toEqual({ weight: 11, tag: 'x' });
  });
  it('leaves the rest of the edge as it is, and an edge that is not there alone', () => {
    const c = canvas();
    c.run((i) => {
      i.updateEdgeData('e', { weight: 2 });
      i.updateEdgeData('nope', { weight: 2 });
    });
    expect(c.edge()).toMatchObject({ id: 'e', source: 'a', target: 'b' });
  });
  it('needs the editing feature, and says so', () => {
    let instance: FlowingerInstance | undefined;
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={nodes} edges={[]} onInit={(i) => (instance = i)} />
      </div>,
    );
    expect(() => instance?.updateEdgeData('e', {})).toThrow(/editing/);
  });
});

describe('getNodeConnections and getHandleConnections', () => {
  it('are the editing feature\'s, and say so where it is missing', () => {
    let instance: FlowingerInstance | undefined;
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={nodes} edges={[]} onInit={(i) => (instance = i)} />
      </div>,
    );
    expect(() => instance?.getNodeConnections({ nodeId: 'a' })).toThrow(/editing/);
    expect(() => instance?.getHandleConnections({ type: 'source', nodeId: 'a' })).toThrow(/editing/);
  });

  const graph: Node[] = ['a', 'b', 'c'].map((id, i) => ({
    id,
    position: { x: i * 200, y: 0 },
    width: 100,
    height: 40,
    data: {},
  }));
  const links: Edge[] = [
    { id: 'ab', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in' },
    { id: 'ac', source: 'a', target: 'c' },
    { id: 'ca', source: 'c', target: 'a', sourceHandle: 'out', targetHandle: 'in' },
    { id: 'bc', source: 'b', target: 'c', sourceHandle: 'out', targetHandle: null },
  ];
  const ids = (list: { edgeId: string }[]) => list.map((c) => c.edgeId);

  function ours() {
    let instance: FlowingerInstance | undefined;
    render(
      <div style={{ width: 800, height: 600 }}>
        <FlowingerCore nodes={graph} edges={links} features={[editingFeature]} onInit={(i) => (instance = i)} />
      </div>,
    );
    if (!instance) throw new Error('no instance');
    return instance;
  }

  /** React Flow's own, on the same nodes and edges. */
  function theirs() {
    let instance: ReactFlowLib.ReactFlowInstance | undefined;
    const Grab = () => {
      instance = ReactFlowLib.useReactFlow();
      return null;
    };
    render(
      <ReactFlowLib.ReactFlowProvider>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlowLib.ReactFlow nodes={graph as never} edges={links as never}>
            <Grab />
          </ReactFlowLib.ReactFlow>
        </div>
      </ReactFlowLib.ReactFlowProvider>,
    );
    if (!instance) throw new Error('no React Flow instance');
    return instance;
  }

  const QUERIES: { type?: 'source' | 'target'; nodeId: string; handleId?: string | null }[] = [
    { nodeId: 'a' },
    { nodeId: 'b' },
    { nodeId: 'c' },
    { nodeId: 'a', type: 'source' },
    { nodeId: 'a', type: 'target' },
    { nodeId: 'c', type: 'target' },
    { nodeId: 'a', type: 'source', handleId: 'out' },
    { nodeId: 'a', type: 'source', handleId: null },
    { nodeId: 'b', type: 'target', handleId: 'in' },
    { nodeId: 'c', type: 'target', handleId: null },
    { nodeId: 'c', type: 'target', handleId: 'in' },
    // A handle is asked for by type and id together; an id alone, or an empty one, narrows nothing.
    { nodeId: 'a', handleId: 'out' },
    { nodeId: 'a', handleId: 'in' },
    { nodeId: 'a', type: 'source', handleId: '' },
    { nodeId: 'zzz' },
  ];

  it('answer as React Flow\'s do, for every query: which edges, in which order, in what shape', () => {
    const mine = ours();
    const rf = theirs();
    for (const q of QUERIES) {
      const want = rf.getNodeConnections(q);
      expect(mine.getNodeConnections(q), JSON.stringify(q)).toEqual(want);
    }
  });

  it('the handle form is the same question, for a type', () => {
    const mine = ours();
    const rf = theirs();
    for (const q of [
      { type: 'source' as const, nodeId: 'a', id: 'out' },
      { type: 'target' as const, nodeId: 'a', id: 'in' },
      { type: 'source' as const, nodeId: 'a' },
      { type: 'target' as const, nodeId: 'c', id: null },
    ]) {
      expect(mine.getHandleConnections(q), JSON.stringify(q)).toEqual(rf.getHandleConnections(q));
    }
  });

  it('say what they say (a spot check that the comparison is not comparing empties)', () => {
    const mine = ours();
    expect(ids(mine.getNodeConnections({ nodeId: 'a' }))).toEqual(['ab', 'ac', 'ca']);
    expect(ids(mine.getNodeConnections({ nodeId: 'a', type: 'target' }))).toEqual(['ca']);
    expect(mine.getNodeConnections({ nodeId: 'a', type: 'source', handleId: 'out' })).toEqual([
      { edgeId: 'ab', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in' },
    ]);
    expect(ids(mine.getNodeConnections({ nodeId: 'zzz' }))).toEqual([]);
    // React Flow's reading: no handle id, or no type to go with one, is no narrowing.
    expect(ids(mine.getNodeConnections({ nodeId: 'a', type: 'source', handleId: null }))).toEqual(['ab', 'ac']);
    expect(ids(mine.getNodeConnections({ nodeId: 'a', handleId: 'out' }))).toEqual(['ab', 'ac', 'ca']);
  });
});
