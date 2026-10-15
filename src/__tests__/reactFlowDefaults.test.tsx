import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FlowingerCanvas, ReactFlow, reactFlowDefaults, type Node } from '../index.ts';
import { resetReactFlowDefaultsWarning } from '../devWarnings.ts';

const nodes = (): Node[] => [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }];

// React Flow's own source is the oracle: each value is what its `ReactFlow` (or, where the component leaves a
// prop undefined, its store) starts with.
const reactFlowSource = readFileSync(resolve('node_modules/@xyflow/react/dist/esm/index.js'), 'utf8');
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
      expect(reactFlowSource, name).toContain(said);
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

describe('<ReactFlow> before 1.0', () => {
  const warned = () => vi.spyOn(console, 'warn').mockImplementation(() => {});
  const about1 = (warn: ReturnType<typeof warned>) =>
    warn.mock.calls.map((c) => String(c[0])).filter((s) => s.includes('in 1.0'));

  afterEach(() => {
    resetReactFlowDefaultsWarning();
    vi.restoreAllMocks();
  });

  it("says once a page which of React Flow's defaults it leaves out, from what to what", () => {
    const warn = warned();
    render(<ReactFlow defaultNodes={nodes()} />);
    render(<ReactFlow defaultNodes={nodes()} />);
    const said = about1(warn);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('nodesDraggable (false → true)');
    expect(said[0]).toContain('minZoom (0.05 → 0.5)');
    expect(said[0]).toContain('nodeDragThreshold (3 → 1)');
    expect(said[0]).toContain('panActivationKeyCode (none → Space)');
    expect(said[0]).toContain('render <FlowingerCanvas>');
    // The fit's margin is left out of it: this canvas does not fit itself.
    expect(said[0]).not.toContain('fitViewOptions');
  });

  it("names the fit's margin when the canvas fits itself without one", () => {
    const warn = warned();
    render(<ReactFlow defaultNodes={nodes()} fitView />);
    expect(about1(warn)[0]).toContain('fitViewOptions.padding (40 px → 0.1)');
  });

  it('names only what is left out', () => {
    const warn = warned();
    const { minZoom: _left, ...rest } = reactFlowDefaults;
    render(<ReactFlow {...rest} defaultNodes={nodes()} fitView />);
    const said = about1(warn);
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/leaves out minZoom \(0\.05 → 0\.5\)\. /);
  });

  it("says nothing to a canvas that sets them all, or spreads React Flow's", () => {
    const warn = warned();
    render(
      <ReactFlow
        defaultNodes={nodes()}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable={false}
        minZoom={0.05}
        nodeDragThreshold={3}
        paneClickDistance={Infinity}
        nodeClickDistance={Infinity}
        multiSelectionKeyCode={['Shift', 'Control', 'Meta']}
        zoomActivationKeyCode={null}
        panActivationKeyCode={null}
      />,
    );
    render(<ReactFlow {...reactFlowDefaults} defaultNodes={nodes()} fitView />);
    expect(about1(warn)).toHaveLength(0);
  });

  it('says nothing for a FlowingerCanvas, which keeps flowinger’s defaults in 1.0', () => {
    const warn = warned();
    render(<FlowingerCanvas defaultNodes={nodes()} fitView />);
    expect(about1(warn)).toHaveLength(0);
  });
});
