import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Controls, FlowingerCanvas, ReactFlow, getViewportForBounds, reactFlow12Defaults, reactFlowDefaults, type Node } from '../index.ts';
import { REACT_FLOW_12_MARGIN, REACT_FLOW_MARGIN } from '../reactFlowDefaults.ts';
import { DEFAULT_ENGINE_OPTIONS, createFlowingerStore } from '../store.ts';

const nodes = (): Node[] => [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }];

/**
 * The code `import '@xyflow/react'` loads, as its `exports` names it — not a path written down here: 13's package
 * still carries an older build under `dist/esm/` that nothing loads. Where that code is minified (13 ships it so,
 * with its TypeScript source beside it), the source.
 */
function reactFlowCode(dir: string): string {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { exports: Record<string, unknown> };
  let entry: unknown = pkg.exports['.'];
  while (entry !== null && typeof entry === 'object') {
    const conditions = entry as Record<string, unknown>;
    entry = conditions.node ?? conditions.import ?? conditions.default;
  }
  const code = readFileSync(join(dir, String(entry)), 'utf8');
  const src = join(dir, 'src');
  if (code.split('\n').length > 100 || !existsSync(src)) return code;
  return readdirSync(src, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => readFileSync(join(src, file), 'utf8'))
    .join('\n');
}

// React Flow's own source is the oracle: each value is what its `ReactFlow` (or, where the component leaves a
// prop undefined, its store) starts with.
const reactFlowSource = reactFlowCode(resolve('node_modules/@xyflow/react'));
// Each prop: what React Flow's source says, and the value that is (in jsdom, whose user agent names no Mac).
const SAID_BY_REACT_FLOW: Record<keyof typeof reactFlowDefaults, [said: string, value: unknown]> = {
  nodesDraggable: ['nodesDraggable: true,', true],
  nodesConnectable: ['nodesConnectable: true,', true],
  elementsSelectable: ['elementsSelectable = true', true],
  nodesFocusable: ['nodesFocusable: true,', true],
  minZoom: ['minZoom = 0.5', 0.5],
  nodeDragThreshold: ['nodeDragThreshold: 1,', 1],
  paneClickDistance: ['paneClickDistance = 1', 1],
  nodeClickDistance: ['nodeClickDistance = 0', 0],
  multiSelectionKeyCode: ["multiSelectionKeyCode = isMacOs() ? 'Meta' : 'Control'", 'Control'],
  zoomActivationKeyCode: ["zoomActivationKeyCode = isMacOs() ? 'Meta' : 'Control'", 'Control'],
  panActivationKeyCode: ["panActivationKeyCode = 'Space'", 'Space'],
  // React Flow 13's margin is a constant of its system package, read below.
  fitViewOptions: ['fitViewOptions?.padding ?? defaultFitViewPadding', { padding: '5%' }],
};

// Where React Flow keeps its fit margin: `defaultFitViewPadding`, in the system package installed beside it.
const systemSource = reactFlowCode(join(realpathSync(resolve('node_modules/@xyflow/react')), '..', 'system'));

describe('reactFlowDefaults', () => {
  it("is React Flow's own default for each prop, as its source says", () => {
    for (const [name, [said, value]] of Object.entries(SAID_BY_REACT_FLOW)) {
      expect(reactFlowSource.includes(said), `${name}: React Flow's source no longer says ${said}`).toBe(true);
      expect(reactFlowDefaults[name as keyof typeof reactFlowDefaults], name).toEqual(value);
    }
    expect(Object.keys(reactFlowDefaults).sort()).toEqual(Object.keys(SAID_BY_REACT_FLOW).sort());
    expect(systemSource).toMatch(/defaultFitViewPadding = ["']5%["']/);
    expect(REACT_FLOW_MARGIN).toBe('5%');
  });

  it('turns on what a React Flow canvas has on, spread under a FlowingerCanvas', () => {
    const { unmount } = render(<FlowingerCanvas defaultNodes={nodes()} />);
    expect(screen.getByTestId('rf__node-a')).not.toHaveAttribute('tabindex');
    unmount();

    render(<FlowingerCanvas {...reactFlowDefaults} defaultNodes={nodes()} />);
    const node = screen.getByTestId('rf__node-a');
    expect(node).toHaveAttribute('tabindex', '0');
    fireEvent.click(node);
    expect(node).toHaveClass('selected');
  });
});

describe('<ReactFlow>', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has React Flow's defaults, where <FlowingerCanvas> keeps flowinger's", () => {
    const { unmount } = render(<FlowingerCanvas defaultNodes={nodes()} />);
    expect(screen.getByTestId('rf__node-a')).not.toHaveAttribute('tabindex');
    unmount();

    render(<ReactFlow defaultNodes={nodes()} />);
    const node = screen.getByTestId('rf__node-a');
    expect(node).toHaveAttribute('tabindex', '0');
    fireEvent.click(node);
    expect(node).toHaveClass('selected');
  });

  it('lets a prop it is given win — and gives the default to one given as undefined, as React Flow does', () => {
    const { unmount } = render(<ReactFlow defaultNodes={nodes()} elementsSelectable={false} nodesFocusable={false} />);
    const off = screen.getByTestId('rf__node-a');
    expect(off).not.toHaveAttribute('tabindex');
    fireEvent.click(off);
    expect(off).not.toHaveClass('selected');
    unmount();

    render(<ReactFlow defaultNodes={nodes()} nodesFocusable={undefined} />);
    expect(screen.getByTestId('rf__node-a')).toHaveAttribute('tabindex', '0');
  });

  it("shows Controls' lock, as React Flow does — and not under a FlowingerCanvas, or when told not to", () => {
    const lock = () => screen.queryByRole('button', { name: 'Toggle interactivity' });
    const { unmount } = render(
      <ReactFlow defaultNodes={nodes()}>
        <Controls />
      </ReactFlow>,
    );
    expect(lock()).not.toBeNull();
    unmount();

    const canvas = render(
      <FlowingerCanvas defaultNodes={nodes()}>
        <Controls />
      </FlowingerCanvas>,
    );
    expect(lock()).toBeNull();
    canvas.unmount();

    render(
      <ReactFlow defaultNodes={nodes()}>
        <Controls showInteractive={false} />
      </ReactFlow>,
    );
    expect(lock()).toBeNull();
  });

  it('says nothing about defaults any more: 1.0 is when they changed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<ReactFlow defaultNodes={nodes()} fitView />);
    expect(warn.mock.calls.map((c) => String(c[0])).filter((s) => s.includes('defaults'))).toEqual([]);
  });
});

describe("the view defaults <ReactFlow> gives its store", () => {
  /** A store on a 1000 × 600 pane with one 100 × 40 node at the origin. */
  const sized = () => {
    const store = createFlowingerStore();
    const pane = document.createElement('div');
    Object.defineProperty(pane, 'clientWidth', { value: 1000 });
    Object.defineProperty(pane, 'clientHeight', { value: 600 });
    store.attach(document.createElement('div'), pane);
    store.setOptions(DEFAULT_ENGINE_OPTIONS);
    store.setNodes([{ id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} }]);
    return store;
  };

  it("fit with React Flow 13's '5%' margin when a fit names none, and flowinger's 40 px otherwise", async () => {
    const flowinger = sized();
    await flowinger.instance.fitView({ duration: 0 });
    const reactFlow = sized();
    reactFlow.setViewDefaults({ fitViewPadding: REACT_FLOW_MARGIN });
    await reactFlow.instance.fitView({ duration: 0 });
    // A 100-wide node in 800 px fits at the zoom limit either way; a node far wider than the pane is decided by
    // the margin.
    const big = (store: ReturnType<typeof sized>) => {
      store.setNodes([{ id: 'a', position: { x: 0, y: 0 }, width: 4000, height: 40, data: {} }]);
      return store.instance.fitView({ duration: 0 }).then(() => store.instance.getViewport().zoom);
    };
    // 40 px a side: (1000 - 80) / 4000 = 0.23. 5% of 1000 a side, 50 px: (1000 - 100) / 4000 = 0.225.
    expect(await big(flowinger)).toBeCloseTo(0.23, 9);
    expect(await big(reactFlow)).toBeCloseTo(0.225, 9);
  });

  it('are forgotten by a canvas rendered without <ReactFlow>', () => {
    const store = sized();
    store.setViewDefaults({ fitViewPadding: '5%', interpolate: 'smooth', showInteractive: true });
    store.setViewDefaults(null);
    expect(store.getViewDefaults()).toEqual({});
  });
});

describe('reactFlow12Defaults', () => {
  it("is reactFlowDefaults with React Flow 12's margin, written with a unit", () => {
    const { fitViewOptions, ...rest } = reactFlow12Defaults;
    const { fitViewOptions: thirteen, ...same } = reactFlowDefaults;
    expect(rest).toEqual(same);
    expect(thirteen).toEqual({ padding: '5%' });
    expect(fitViewOptions).toEqual({ padding: REACT_FLOW_12_MARGIN });
  });

  it("gives the view React Flow 12's padding: 0.1 gave, to the pixel, on panes of every size", () => {
    const bounds = { x: -250, y: 80, width: 900, height: 600 };
    // React Flow 12: floor((size - size / 1.1) / 2) pixels a side — a number, which is pixels now.
    const twelve = (size: number) => Math.floor((size - size / 1.1) * 0.5);
    for (const [w, h] of [
      [800, 600],
      [1024, 768],
      [375, 812],
      [1920, 400],
      [1100, 2200],
      [333, 777],
    ] as const) {
      expect(getViewportForBounds(bounds, w, h, 0.05, 2, REACT_FLOW_12_MARGIN)).toEqual(
        getViewportForBounds(bounds, w, h, 0.05, 2, { x: twelve(w), y: twelve(h) }),
      );
    }
  });
});
