import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Controls, FlowingerCanvas, ReactFlow, reactFlowDefaults, type Node } from '../index.ts';
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
  fitViewOptions: ['fitViewOptions?.padding ?? 0.1', { padding: 0.1 }],
};

describe('reactFlowDefaults', () => {
  it("is React Flow's own default for each prop, as its source says", () => {
    for (const [name, [said, value]] of Object.entries(SAID_BY_REACT_FLOW)) {
      expect(reactFlowSource.includes(said), `${name}: React Flow's source no longer says ${said}`).toBe(true);
      expect(reactFlowDefaults[name as keyof typeof reactFlowDefaults], name).toEqual(value);
    }
    expect(Object.keys(reactFlowDefaults).sort()).toEqual(Object.keys(SAID_BY_REACT_FLOW).sort());
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
  /** A store on an 800 × 600 pane with one 100 × 40 node at the origin. */
  const sized = () => {
    const store = createFlowingerStore();
    const pane = document.createElement('div');
    Object.defineProperty(pane, 'clientWidth', { value: 800 });
    Object.defineProperty(pane, 'clientHeight', { value: 600 });
    store.attach(document.createElement('div'), pane);
    store.setOptions(DEFAULT_ENGINE_OPTIONS);
    store.setNodes([{ id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} }]);
    return store;
  };

  it("fit with React Flow's 0.1 margin when a fit names none, and flowinger's 40 px otherwise", async () => {
    const flowinger = sized();
    await flowinger.instance.fitView({ duration: 0 });
    const reactFlow = sized();
    reactFlow.setViewDefaults({ fitViewPadding: 0.1 });
    await reactFlow.instance.fitView({ duration: 0 });
    // A 100-wide node in 800 px fits at the zoom limit either way; a node far wider than the pane is decided by
    // the margin.
    const big = (store: ReturnType<typeof sized>) => {
      store.setNodes([{ id: 'a', position: { x: 0, y: 0 }, width: 4000, height: 40, data: {} }]);
      return store.instance.fitView({ duration: 0 }).then(() => store.instance.getViewport().zoom);
    };
    // 40 px a side: (800 - 80) / 4000 = 0.18. A 0.1 ratio, React Flow's formula: 800 / (4000 × 1.1) ≈ 0.1818.
    expect(await big(flowinger)).toBeCloseTo(0.18, 3);
    expect(await big(reactFlow)).toBeCloseTo(800 / (4000 * 1.1), 3);
  });

  it('are forgotten by a canvas rendered without <ReactFlow>', () => {
    const store = sized();
    store.setViewDefaults({ fitViewPadding: 0.1, interpolate: 'smooth', showInteractive: true });
    store.setViewDefaults(null);
    expect(store.getViewDefaults()).toEqual({});
  });
});
