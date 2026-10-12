import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import {
  FlowingerCanvas,
  getNodesBounds,
  allFeatures,
  type Node,
} from '../index.ts';
import { createFlowingerStore, DEFAULT_ENGINE_OPTIONS } from '../store.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Milestone 3 runtime features', () => {
  describe('nodeOrigin and node.origin geometric calculation', () => {
    it('applies default canvas nodeOrigin to node bounds calculation', () => {
      const nodes: Node[] = [
        { id: '1', position: { x: 100, y: 100 }, width: 100, height: 60, data: {} },
      ];

      // Origin [0, 0] (default)
      const boundsDefault = getNodesBounds(nodes);
      expect(boundsDefault).toEqual({ x: 100, y: 100, width: 100, height: 60 });

      // Origin [0.5, 0.5] (center-anchored)
      const boundsCentered = getNodesBounds(nodes, { nodeOrigin: [0.5, 0.5] });
      expect(boundsCentered).toEqual({ x: 50, y: 70, width: 100, height: 60 });

      // Origin [1, 1] (bottom-right anchored)
      const boundsBottomRight = getNodesBounds(nodes, { nodeOrigin: [1, 1] });
      expect(boundsBottomRight).toEqual({ x: 0, y: 40, width: 100, height: 60 });
    });

    it('respects per-node origin property over canvas default', () => {
      const nodes: Node[] = [
        { id: '1', position: { x: 100, y: 100 }, width: 100, height: 50, origin: [1, 0], data: {} },
        { id: '2', position: { x: 300, y: 200 }, width: 80, height: 40, data: {} },
      ];

      // Node 1 has origin [1, 0] -> x: 100 - 100 = 0, y: 100, w: 100, h: 50
      // Node 2 falls back to options.nodeOrigin [0.5, 0.5] -> x: 300 - 40 = 260, y: 200 - 20 = 180, w: 80, h: 40
      const bounds = getNodesBounds(nodes, { nodeOrigin: [0.5, 0.5] });
      expect(bounds).toEqual({
        x: 0,
        y: 100,
        width: 340, // max X is 260 + 80 = 340, min X is 0 => width 340
        height: 120, // max Y is 180 + 40 = 220, min Y is 100 => height 120
      });
    });

    it('calculates store.getNodeRect taking nodeOrigin into account', () => {
      const store = createFlowingerStore();
      store.use(allFeatures);
      const viewport = document.createElement('div');
      const container = document.createElement('div');
      store.attach(viewport, container);

      store.setOptions({
        ...DEFAULT_ENGINE_OPTIONS,
        nodeOrigin: [0.5, 0.5],
      });

      store.setNodes([
        { id: 'n1', position: { x: 200, y: 100 }, width: 80, height: 40, data: {} },
        { id: 'n2', position: { x: 200, y: 100 }, width: 80, height: 40, origin: [0, 0], data: {} },
      ]);

      const rectN1 = store.getNodeRect('n1');
      // Origin [0.5, 0.5] -> 200 - 40 = 160, 100 - 20 = 80
      expect(rectN1).toEqual({ x: 160, y: 80, width: 80, height: 40 });

      const rectN2 = store.getNodeRect('n2');
      // Node 2 has explicit origin [0, 0]
      expect(rectN2).toEqual({ x: 200, y: 100, width: 80, height: 40 });
    });

    it('renders DOM node with origin-adjusted transform translate', () => {
      const nodes: Node[] = [
        { id: 'n1', position: { x: 200, y: 150 }, width: 100, height: 50, data: {} },
      ];

      const { container } = render(
        <FlowingerCanvas
          nodes={nodes}
          nodeOrigin={[0.5, 0.5]}
        />,
      );

      const nodeEl = container.querySelector('[data-id="n1"]') as HTMLElement;
      expect(nodeEl).not.toBeNull();
      // x: 200 - 50 = 150, y: 150 - 25 = 125
      expect(nodeEl.style.transform).toBe('translate(150px, 125px)');
    });
  });

  describe('panActivationKeyCode', () => {
    it('activates pan mode when pan activation key is pressed', () => {
      const { container } = render(
        <FlowingerCanvas
          nodes={[{ id: '1', position: { x: 0, y: 0 }, data: {} }]}
          panOnDrag={false}
          panActivationKeyCode="Space"
        />,
      );

      const wrapper = container.querySelector('.flowinger') as HTMLElement;
      expect(wrapper.style.cursor).toBe('');

      // Press Space
      act(() => {
        fireEvent.keyDown(document, { key: ' ', code: 'Space' });
      });

      expect(wrapper.style.cursor).toBe('grab');

      // Release Space
      act(() => {
        fireEvent.keyUp(document, { key: ' ', code: 'Space' });
      });

      expect(wrapper.style.cursor).toBe('');
    });
  });

  describe('nodeDragThreshold', () => {
    it('suppresses drag threshold until movement exceeds configured distance', () => {
      const onNodeDragStart = vi.fn();
      const onNodeDrag = vi.fn();

      const nodes: Node[] = [
        { id: '1', position: { x: 0, y: 0 }, width: 100, height: 50, data: {} },
      ];

      const { container } = render(
        <FlowingerCanvas
          nodes={nodes}
          nodesDraggable={true}
          nodeDragThreshold={15}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
        />,
      );

      const nodeEl = container.querySelector('[data-id="1"]') as HTMLElement;
      expect(nodeEl).not.toBeNull();

      // Start pointer down at (10, 10)
      fireEvent.pointerDown(nodeEl, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });

      // Move 5px (below threshold 15)
      fireEvent.pointerMove(nodeEl, { clientX: 15, clientY: 10, pointerId: 1 });
      expect(onNodeDragStart).not.toHaveBeenCalled();
      expect(onNodeDrag).not.toHaveBeenCalled();

      // Move to 30px (distance = 20px > threshold 15)
      fireEvent.pointerMove(nodeEl, { clientX: 30, clientY: 10, pointerId: 1 });
      expect(onNodeDragStart).toHaveBeenCalledTimes(1);
      expect(onNodeDrag).toHaveBeenCalled();

      fireEvent.pointerUp(nodeEl, { pointerId: 1 });
    });
  });
});
