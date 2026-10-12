import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  FlowingerCanvas,
  getSimpleBezierPath,
  SimpleBezierEdge,
  EdgeText,
  EdgeToolbar,
  experimental_useOnNodesChangeMiddleware,
  experimental_useOnEdgesChangeMiddleware,
  Position,
} from '../index.ts';
import { useFlowingerStore } from '../context.ts';

describe('Parity Milestone 2 components and utilities', () => {
  describe('getSimpleBezierPath', () => {
    it('computes simple bezier path and center for horizontal layout', () => {
      const [path, labelX, labelY, offsetX, offsetY] = getSimpleBezierPath({
        sourceX: 0,
        sourceY: 100,
        sourcePosition: Position.Right,
        targetX: 200,
        targetY: 100,
        targetPosition: Position.Left,
      });

      expect(path).toContain('M 0.00 100.00 C 100.00 100.00, 100.00 100.00, 200.00 100.00');
      expect(labelX).toBe(100);
      expect(labelY).toBe(100);
      expect(offsetX).toBe(100);
      expect(offsetY).toBe(0);
    });

    it('computes simple bezier path and center for vertical layout', () => {
      const [path, labelX, labelY, offsetX, offsetY] = getSimpleBezierPath({
        sourceX: 100,
        sourceY: 0,
        sourcePosition: Position.Bottom,
        targetX: 100,
        targetY: 200,
        targetPosition: Position.Top,
      });

      expect(path).toContain('M 100.00 0.00 C 100.00 100.00, 100.00 100.00, 100.00 200.00');
      expect(labelX).toBe(100);
      expect(labelY).toBe(100);
      expect(offsetX).toBe(0);
      expect(offsetY).toBe(100);
    });
  });

  describe('SimpleBezierEdge', () => {
    it('renders SVG path with simple bezier coordinates', () => {
      const { container } = render(
        <svg>
          <SimpleBezierEdge
            id="e1"
            source="n1"
            target="n2"
            sourceX={0}
            sourceY={0}
            targetX={100}
            targetY={100}
            sourcePosition={Position.Bottom}
            targetPosition={Position.Top}
            sourceHandleId={null}
            targetHandleId={null}
          />
        </svg>,
      );

      const path = container.querySelector('path.react-flow__edge-path');
      expect(path).toBeTruthy();
      expect(path?.getAttribute('d')).toContain('M 0.00 0.00 C 0.00 50.00, 100.00 50.00, 100.00 100.00');
    });
  });

  describe('EdgeText', () => {
    it('renders label inside svg text element', () => {
      const { container } = render(
        <svg>
          <EdgeText x={50} y={50} label="Hello Edge" labelShowBg />
        </svg>,
      );

      const text = screen.getByText('Hello Edge');
      expect(text).toBeTruthy();
      expect(text.classList.contains('react-flow__edge-text')).toBe(true);
      expect(container.querySelector('.react-flow__edge-textbg')).toBeTruthy();
    });

    it('returns null when no label is provided', () => {
      const { container } = render(
        <svg>
          <EdgeText x={50} y={50} />
        </svg>,
      );

      expect(container.querySelector('.react-flow__edge-textwrapper')).toBeNull();
    });
  });

  describe('EdgeToolbar', () => {
    it('renders toolbar content when edge is selected or isVisible is true', () => {
      render(
        <FlowingerCanvas
          nodes={[{ id: '1', position: { x: 0, y: 0 }, data: {} }]}
          edges={[{ id: 'e1', source: '1', target: '1' }]}
        >
          <EdgeToolbar edgeId="e1" x={100} y={100} isVisible>
            <div data-testid="edge-toolbar-content">Toolbar Actions</div>
          </EdgeToolbar>
        </FlowingerCanvas>,
      );

      expect(screen.getByTestId('edge-toolbar-content')).toBeTruthy();
      expect(screen.getByText('Toolbar Actions')).toBeTruthy();
    });

    it('does not render toolbar when isVisible is false and edge is not selected', () => {
      render(
        <FlowingerCanvas
          nodes={[{ id: '1', position: { x: 0, y: 0 }, data: {} }]}
          edges={[{ id: 'e1', source: '1', target: '1' }]}
        >
          <EdgeToolbar edgeId="e1" x={100} y={100} isVisible={false}>
            <div data-testid="edge-toolbar-content">Hidden</div>
          </EdgeToolbar>
        </FlowingerCanvas>,
      );

      expect(screen.queryByTestId('edge-toolbar-content')).toBeNull();
    });
  });

  describe('middlewares', () => {
    it('applies experimental_useOnNodesChangeMiddleware to transform node changes', () => {
      const onNodesChange = vi.fn();

      function Consumer() {
        experimental_useOnNodesChangeMiddleware((changes) => {
          return changes.filter((c) => c.type !== 'remove');
        });
        const store = useFlowingerStore();

        return (
          <button
            onClick={() => {
              store.emitNodeChanges([
                {
                  type: 'position',
                  id: 'n1',
                  position: { x: 99, y: 99 },
                },
              ]);
            }}
          >
            Trigger
          </button>
        );
      }

      render(
        <FlowingerCanvas
          nodes={[{ id: 'n1', position: { x: 0, y: 0 }, data: {} }]}
          onNodesChange={onNodesChange}
        >
          <Consumer />
        </FlowingerCanvas>,
      );

      act(() => {
        screen.getByRole('button', { name: 'Trigger' }).click();
      });

      expect(onNodesChange).toHaveBeenCalledTimes(1);
      expect(onNodesChange).toHaveBeenCalledWith([
        {
          type: 'position',
          id: 'n1',
          position: { x: 99, y: 99 },
        },
      ]);
    });

    it('applies experimental_useOnEdgesChangeMiddleware to filter or transform edge changes', () => {
      const onEdgesChange = vi.fn();

      function Consumer() {
        experimental_useOnEdgesChangeMiddleware((changes) => {
          return changes.filter((c) => c.type !== 'remove');
        });
        const store = useFlowingerStore();

        return (
          <button
            onClick={() => {
              store.emitEdgeChanges([
                { type: 'remove', id: 'e1' },
                { type: 'select', id: 'e2', selected: true },
              ]);
            }}
          >
            Trigger
          </button>
        );
      }

      render(
        <FlowingerCanvas
          edges={[{ id: 'e1', source: '1', target: '2' }]}
          onEdgesChange={onEdgesChange}
        >
          <Consumer />
        </FlowingerCanvas>,
      );

      act(() => {
        screen.getByRole('button', { name: 'Trigger' }).click();
      });

      expect(onEdgesChange).toHaveBeenCalledTimes(1);
      // 'remove' was filtered out by middleware!
      expect(onEdgesChange).toHaveBeenCalledWith([{ type: 'select', id: 'e2', selected: true }]);
    });
  });
});
