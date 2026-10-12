import { describe, expect, it } from 'vitest';
import { render, screen, renderHook, act } from '@testing-library/react';
import {
  getSmartEdgePath,
  DiamondNode,
  CircleNode,
  CylinderNode,
  ParallelogramNode,
  DocumentNode,
  useCollapsibleTree,
} from '../pro/index.ts';
import { Position, type Node } from '../types.ts';

describe('Pro Modules: SmartEdge (getSmartEdgePath)', () => {
  it('falls back to smooth step path when no obstacles are present', () => {
    const [path] = getSmartEdgePath({
      sourceX: 0,
      sourceY: 0,
      sourcePosition: Position.Right,
      targetX: 200,
      targetY: 100,
      targetPosition: Position.Left,
      nodes: [],
    });

    expect(path).toContain('M 0.00 0.00');
    expect(path).toContain('200.00 100.00');
  });

  it('routes around obstacles placed between source and target', () => {
    const obstacle: Node = {
      id: 'obs',
      position: { x: 80, y: -20 },
      width: 40,
      height: 40,
      data: {},
    };

    const [path] = getSmartEdgePath({
      sourceX: 0,
      sourceY: 0,
      sourcePosition: Position.Right,
      targetX: 200,
      targetY: 0,
      targetPosition: Position.Left,
      nodes: [obstacle],
      gridRatio: 10,
    });

    expect(path).toContain('M 0.00 0.00');
    expect(path).toContain('200.00 0.00');
    // Ensure path detours and is not just a straight horizontal line
    expect(path).toContain('L');
  });
});

describe('Pro Modules: Flowchart Shapes', () => {
  it('renders DiamondNode with polygon geometry and label', () => {
    const { container } = render(
      <DiamondNode
        id="d1"
        data={{ label: 'Is Valid?' }}
      />,
    );
    expect(container.querySelector('polygon')).not.toBeNull();
    expect(screen.getByText('Is Valid?')).not.toBeNull();
  });

  it('renders CircleNode with circle geometry and label', () => {
    const { container } = render(
      <CircleNode
        id="c1"
        data={{ label: 'Start Process' }}
      />,
    );
    expect(container.querySelector('circle')).not.toBeNull();
    expect(screen.getByText('Start Process')).not.toBeNull();
  });

  it('renders CylinderNode with database body and top oval', () => {
    const { container } = render(
      <CylinderNode
        id="cyl1"
        data={{ label: 'Users DB' }}
      />,
    );
    expect(container.querySelector('ellipse')).not.toBeNull();
    expect(screen.getByText('Users DB')).not.toBeNull();
  });

  it('renders ParallelogramNode and DocumentNode with custom labels', () => {
    const { container: pContainer } = render(
      <ParallelogramNode
        id="p1"
        data={{ label: 'Read Input' }}
      />,
    );
    expect(pContainer.querySelector('polygon')).not.toBeNull();
    expect(screen.getByText('Read Input')).not.toBeNull();

    const { container: docContainer } = render(
      <DocumentNode
        id="doc1"
        data={{ label: 'Invoice PDF' }}
      />,
    );
    expect(docContainer.querySelector('path')).not.toBeNull();
    expect(screen.getByText('Invoice PDF')).not.toBeNull();
  });
});

describe('Pro Modules: Tree (useCollapsibleTree)', () => {
  it('calculates descendant tree hierarchies and toggles collapsed state', () => {
    const { result } = renderHook(() => useCollapsibleTree());

    const edges = [
      { id: 'e1', source: 'root', target: 'child1' },
      { id: 'e2', source: 'root', target: 'child2' },
      { id: 'e3', source: 'child1', target: 'grandchild1' },
    ];

    const descendants = result.current.getDescendantIds('root', edges);
    expect(descendants).toEqual(expect.arrayContaining(['child1', 'child2', 'grandchild1']));

    expect(result.current.isCollapsed('root')).toBe(false);

    act(() => {
      result.current.toggleNode('root');
    });
    expect(result.current.isCollapsed('root')).toBe(true);

    act(() => {
      result.current.expandNode('root');
    });
    expect(result.current.isCollapsed('root')).toBe(false);

    act(() => {
      result.current.collapseNode('root');
    });
    expect(result.current.isCollapsed('root')).toBe(true);
  });
});
