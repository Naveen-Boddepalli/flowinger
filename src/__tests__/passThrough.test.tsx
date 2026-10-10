import { describe, expect, expectTypeOf, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  BaseEdge,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  MiniMap,
  NodeToolbar,
  Panel,
  Position,
  type BaseEdgeProps,
  type EdgeProps,
  type HandleProps,
  type MiniMapProps,
  type NodeProps,
  type NodeToolbarProps,
  type PanelProps,
} from '../index.ts';

// A component's own element takes the attributes a caller adds — `id`, `title`, `aria-*`, `data-*` — and
// never loses its own classes, positioning or handlers to them.

const nodes = [
  { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
  { id: 'b', position: { x: 300, y: 0 }, width: 100, height: 40, data: {} },
];

describe('Panel', () => {
  it('takes attributes of its own, and keeps its classes and its place', () => {
    const { container } = render(
      <FlowingerCanvas nodes={nodes}>
        <Panel position="bottom-right" id="legend" title="Legend" aria-label="Key" data-testid="my-panel" className="mine" />
      </FlowingerCanvas>,
    );
    const el = container.querySelector('#legend') as HTMLElement;
    expect(el.getAttribute('title')).toBe('Legend');
    expect(el.getAttribute('aria-label')).toBe('Key');
    expect(el.getAttribute('data-testid')).toBe('my-panel');
    expect(el.classList.contains('react-flow__panel')).toBe(true);
    expect(el.classList.contains('nopan')).toBe(true);
    expect(el.classList.contains('mine')).toBe(true);
    expect(el.style.position).toBe('absolute');
  });
});

describe('NodeToolbar', () => {
  it('takes attributes of its own, and keeps `nodrag` and `nopan`', () => {
    function Node({ id }: NodeProps) {
      return (
        <div>
          {id}
          <NodeToolbar isVisible id={`toolbar-${id}`} role="toolbar" aria-label="Actions" />
        </div>
      );
    }
    const { container } = render(<FlowingerCanvas nodes={nodes} nodeTypes={{ default: Node }} />);
    const el = container.querySelector('#toolbar-a') as HTMLElement;
    expect(el.getAttribute('role')).toBe('toolbar');
    expect(el.getAttribute('aria-label')).toBe('Actions');
    expect(el.classList.contains('nodrag')).toBe(true);
    expect(el.classList.contains('nopan')).toBe(true);
  });
});

describe('MiniMap', () => {
  it('takes attributes of its own; its role, size and label stay its own', () => {
    const { container } = render(
      <FlowingerProvider>
        <FlowingerCanvas nodes={nodes} />
        <MiniMap id="overview" title="Overview" width={120} height={80} data-extra="1" />
      </FlowingerProvider>,
    );
    const el = container.querySelector('#overview') as SVGSVGElement;
    expect(el.getAttribute('title')).toBe('Overview');
    expect(el.getAttribute('data-extra')).toBe('1');
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('width')).toBe('120');
    expect(el.classList.contains('react-flow__minimap')).toBe(true);
  });

  it('lets a caller name it for tests: its own `data-testid` wins over the stock one', () => {
    const { container } = render(
      <FlowingerProvider>
        <FlowingerCanvas nodes={nodes} />
        <MiniMap data-testid="my-map" />
      </FlowingerProvider>,
    );
    expect(container.querySelector('[data-testid="my-map"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="rf__minimap"]')).toBeNull();
  });
});

describe('Handle', () => {
  it('takes attributes of its own, and its `id` is still the handle\'s id, not a DOM id', () => {
    function Node() {
      return <Handle id="out" type="source" position={Position.Right} title="Output" data-port="1" aria-label="out" />;
    }
    const { container } = render(<FlowingerCanvas nodes={nodes} nodeTypes={{ default: Node }} />);
    const el = container.querySelector('[data-handleid="out"]') as HTMLElement;
    expect(el.getAttribute('title')).toBe('Output');
    expect(el.getAttribute('data-port')).toBe('1');
    expect(el.getAttribute('aria-label')).toBe('out');
    expect(el.hasAttribute('id')).toBe(false);
    expect(el.getAttribute('data-handlepos')).toBe('right');
    expect(el.classList.contains('react-flow__handle')).toBe(true);
  });
});

describe('BaseEdge', () => {
  it('puts attributes of its own on the path, and keeps the path, fill and markers', () => {
    function Edge({ sourceX, sourceY, targetX, targetY }: EdgeProps) {
      return (
        <BaseEdge
          path={`M ${String(sourceX)} ${String(sourceY)} L ${String(targetX)} ${String(targetY)}`}
          markerEnd="url(#m)"
          data-edge="x"
          aria-label="link"
          id="the-path"
        />
      );
    }
    const { container } = render(
      <FlowingerCanvas nodes={nodes} edges={[{ id: 'ab', source: 'a', target: 'b', type: 'mine' }]} edgeTypes={{ mine: Edge }} />,
    );
    const el = container.querySelector('#the-path') as SVGPathElement;
    expect(el.getAttribute('data-edge')).toBe('x');
    expect(el.getAttribute('aria-label')).toBe('link');
    expect(el.getAttribute('fill')).toBe('none');
    expect(el.getAttribute('marker-end')).toBe('url(#m)');
    expect(el.getAttribute('d')).toMatch(/^M /);
    expect(el.classList.contains('react-flow__edge-path')).toBe(true);
  });
});

describe('when the types are got round', () => {
  it('the engine\'s own attributes still win: the path, its fill and its classes', () => {
    const forced = { d: 'M 9 9', fill: 'red', className: 'intruder', 'data-ok': 'yes' } as unknown as Partial<BaseEdgeProps>;
    function Edge() {
      return <BaseEdge path="M 0 0 L 10 10" {...forced} />;
    }
    const { container } = render(
      <FlowingerCanvas nodes={nodes} edges={[{ id: 'ab', source: 'a', target: 'b', type: 'mine' }]} edgeTypes={{ mine: Edge }} />,
    );
    const el = container.querySelector('.react-flow__edge-path') as SVGPathElement;
    expect(el.getAttribute('d')).toBe('M 0 0 L 10 10');
    expect(el.getAttribute('fill')).toBe('none');
    expect(el.classList.contains('intruder')).toBe(false);
    expect(el.getAttribute('data-ok')).toBe('yes'); // what is not the engine's still comes through
  });
});

describe('what a caller cannot pass', () => {
  it('is an event handler, which the engine owns, or what a component sets itself', () => {
    // A handler would replace the canvas's pointer handling; these are compile errors, held by typecheck.
    // @ts-expect-error Panel does not take event handlers
    const panel: PanelProps = { onClick: () => {} };
    // @ts-expect-error nor does NodeToolbar
    const toolbar: NodeToolbarProps = { onPointerDown: () => {} };
    // @ts-expect-error nor MiniMap, whose pointer handling is the pan
    const map: MiniMapProps = { onPointerDown: () => {} };
    // @ts-expect-error nor Handle, which starts a connection from a press
    const handle: HandleProps = { type: 'source', position: Position.Right, onPointerDown: () => {} };
    // @ts-expect-error BaseEdge's path is `path`, not the `d` attribute it writes
    const base: BaseEdgeProps = { path: 'M 0 0', d: 'M 1 1' };
    expect([panel, toolbar, map, handle, base]).toHaveLength(5);

    expectTypeOf<PanelProps>().toHaveProperty('id');
    expectTypeOf<PanelProps>().toHaveProperty('aria-label');
    expectTypeOf<HandleProps['id']>().toEqualTypeOf<string | undefined>();
  });
});
