import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { resetUpgradeWarnings } from '../devWarnings.ts';
import { DEFAULT_ENGINE_OPTIONS, createFlowingerStore } from '../store.ts';
import {
  FlowingerCanvas,
  FlowingerCore,
  ReactFlow,
  edgePathsFeature,
  getViewportForBounds,
  reactFlow12Defaults,
  reactFlowDefaults,
  type Edge,
  type Node,
} from '../index.ts';
import { REACT_FLOW_12_MARGIN } from '../reactFlowDefaults.ts';

// What 1.1 says in development about what 2.0 changes — once a page each.

const nodes: Node[] = [
  { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
  { id: 'b', position: { x: 200, y: 100 }, width: 100, height: 40, data: {} },
];
let warn: ReturnType<typeof vi.spyOn>;
const said = (): string[] => warn.mock.calls.map((c: unknown[]) => String(c[0]));
const about = (word: string): string[] => said().filter((s) => s.includes(word));

beforeEach(() => {
  resetUpgradeWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(process.env, 'JEST_WORKER_ID');
});

function sizedStore() {
  const store = createFlowingerStore();
  const pane = document.createElement('div');
  Object.defineProperty(pane, 'clientWidth', { value: 800 });
  Object.defineProperty(pane, 'clientHeight', { value: 600 });
  store.attach(document.createElement('div'), pane);
  store.setOptions(DEFAULT_ENGINE_OPTIONS);
  store.setNodes(nodes);
  return store;
}

describe('a number as a margin', () => {
  it('is said once, for a fit given one — a bare number, or one side of an object', async () => {
    const store = sizedStore();
    await store.instance.fitView({ duration: 0, padding: 0.2 });
    await store.instance.fitView({ duration: 0, padding: { top: 0.1 } });
    expect(about('pixels in 2.0')).toHaveLength(1);
    expect(about('pixels in 2.0')[0]).toMatch(/'5%' of the pane, or '20px'/);
    resetUpgradeWarnings();
    await store.instance.fitView({ duration: 0, padding: { top: 0.1 } });
    expect(about('pixels in 2.0')).toHaveLength(2);
  });

  it('is not said for a margin with a unit, for zero, or for a canvas left to its own margin', async () => {
    const store = sizedStore();
    await store.instance.fitView({ duration: 0, padding: '5%' });
    await store.instance.fitView({ duration: 0, padding: { x: '20px', y: 0 } });
    await store.instance.fitView({ duration: 0 });
    getViewportForBounds({ x: 0, y: 0, width: 10, height: 10 }, 800, 600, 0.1, 2, 0);
    render(<ReactFlow nodes={nodes} fitView fitViewOptions={{ padding: '5%' }} />);
    render(<FlowingerCanvas nodes={nodes} fitView />);
    expect(about('pixels in 2.0')).toEqual([]);
  });
});

describe("<ReactFlow>'s margin", () => {
  it("is said once for a <ReactFlow> that fits itself with the margin it has by default", () => {
    render(<ReactFlow nodes={nodes} fitView />);
    render(<ReactFlow nodes={nodes} fitView />);
    expect(about("'5%' a side")).toHaveLength(1);
    expect(about("'5%' a side")[0]).toMatch(/reactFlow12Defaults/);
  });

  it('is not said where the margin is given, where it does not fit itself, or on a <FlowingerCanvas>', () => {
    render(<ReactFlow nodes={nodes} fitView fitViewOptions={{ padding: '8%' }} />);
    render(<ReactFlow nodes={nodes} />);
    render(<FlowingerCanvas nodes={nodes} fitView />);
    render(<ReactFlow {...reactFlow12Defaults} nodes={nodes} fitView />);
    expect(about("'5%' a side")).toEqual([]);
  });
});

describe('reactFlow12Defaults', () => {
  it("is reactFlowDefaults with React Flow 12's margin written with a unit", () => {
    const { fitViewOptions, ...rest } = reactFlow12Defaults;
    const { fitViewOptions: twelve, ...same } = reactFlowDefaults;
    expect(rest).toEqual(same);
    expect(twelve).toEqual({ padding: 0.1 });
    expect(fitViewOptions).toEqual({ padding: REACT_FLOW_12_MARGIN });
  });

  it("gives the view React Flow 12's 0.1 gives, to the pixel, on panes of every size", () => {
    const bounds = { x: -250, y: 80, width: 900, height: 600 };
    for (const [w, h] of [
      [800, 600],
      [1024, 768],
      [375, 812],
      [1920, 400],
      [1100, 2200],
      [333, 777],
    ] as const) {
      expect(getViewportForBounds(bounds, w, h, 0.05, 2, REACT_FLOW_12_MARGIN)).toEqual(
        getViewportForBounds(bounds, w, h, 0.05, 2, 0.1),
      );
    }
  });
});

describe('the edge paths', () => {
  const edges = (type: string): Edge[] => [{ id: 'e', source: 'a', target: 'b', type }];

  it('are said once for a <FlowingerCore> drawing a straight, smoothstep or step edge without edgePathsFeature', () => {
    render(<FlowingerCore nodes={nodes} edges={edges('smoothstep')} />);
    render(<FlowingerCore nodes={nodes} edges={edges('step')} />);
    expect(about('edgePathsFeature')).toHaveLength(1);
    expect(about('edgePathsFeature')[0]).toMatch(/draws a 'smoothstep' edge as a bezier/);
  });

  it('are not said with the feature, on a <FlowingerCanvas>, or for a bezier', () => {
    render(<FlowingerCore nodes={nodes} edges={edges('step')} features={[edgePathsFeature]} />);
    render(<FlowingerCanvas nodes={nodes} edges={edges('straight')} />);
    render(<FlowingerCore nodes={nodes} edges={edges('default')} />);
    render(<FlowingerCore nodes={nodes} edges={[{ id: 'e', source: 'a', target: 'b' }]} />);
    expect(about('edgePathsFeature')).toEqual([]);
  });
});

describe('Jest', () => {
  it('is told nothing outside Jest', () => {
    render(<FlowingerCore nodes={nodes} />);
    expect(about('ES modules only')).toEqual([]);
  });

  it('is told, once, where it loads flowinger through require', () => {
    process.env.JEST_WORKER_ID = '1';
    render(<FlowingerCore nodes={nodes} />);
    render(<FlowingerCore nodes={nodes} />);
    // Only where the module is CommonJS (`__filename` is defined), which is what 2.0 stops shipping.
    const expected = typeof __filename === 'undefined' ? 0 : 1;
    expect(about('ES modules only')).toHaveLength(expected);
  });
});
