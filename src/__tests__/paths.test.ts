import { describe, expect, it } from 'vitest';
import { getBezierPath, getSmoothStepPath, getStraightPath } from '../paths.ts';
import { Position } from '../types.ts';

describe('paths', () => {
  describe('getStraightPath', () => {
    it('creates a straight line between two points', () => {
      const [path, labelX, labelY] = getStraightPath({
        sourceX: 10,
        sourceY: 20,
        targetX: 100,
        targetY: 200,
      });
      expect(path).toBe('M 10.00 20.00 L 100.00 200.00');
      expect(labelX).toBe(55);
      expect(labelY).toBe(110);
    });
  });

  describe('getBezierPath', () => {
    it('generates a vertical cubic bezier path from bottom to top', () => {
      const [path, labelX, labelY] = getBezierPath({
        sourceX: 50,
        sourceY: 100,
        sourcePosition: Position.Bottom,
        targetX: 150,
        targetY: 300,
        targetPosition: Position.Top,
      });

      expect(path.startsWith('M 50.00 100.00 C')).toBe(true);
      expect(path.endsWith('150.00 300.00')).toBe(true);
      expect(labelX).toBe(100);
      expect(labelY).toBe(200);
    });

    it('generates a horizontal cubic bezier path from right to left', () => {
      const [path, labelX, labelY] = getBezierPath({
        sourceX: 200,
        sourceY: 100,
        sourcePosition: Position.Right,
        targetX: 400,
        targetY: 100,
        targetPosition: Position.Left,
      });

      expect(path.startsWith('M 200.00 100.00 C')).toBe(true);
      expect(path.endsWith('400.00 100.00')).toBe(true);
      expect(labelX).toBe(300);
      expect(labelY).toBe(100);
    });
  });

  describe('getSmoothStepPath', () => {
    const vertical = {
      sourceX: 10,
      sourceY: 20,
      sourcePosition: Position.Bottom,
      targetX: 50,
      targetY: 100,
      targetPosition: Position.Top,
    };
    const horizontal = {
      sourceX: 0,
      sourceY: 50,
      sourcePosition: Position.Right,
      targetX: 100,
      targetY: 150,
      targetPosition: Position.Left,
    };

    it('leaves square corners with a radius of 0', () => {
      const [path, labelX, labelY] = getSmoothStepPath({ ...vertical, borderRadius: 0 });
      expect(path).toBe('M 10.00 20.00 L 10.00 60.00 L 50.00 60.00 L 50.00 100.00');
      expect(labelX).toBe(30);
      expect(labelY).toBe(60);
      expect(getSmoothStepPath({ ...horizontal, borderRadius: 0 })[0]).toBe(
        'M 0.00 50.00 L 50.00 50.00 L 50.00 150.00 L 100.00 150.00',
      );
    });

    it('rounds each corner by 5 by default, with a curve whose control point is the corner', () => {
      expect(getSmoothStepPath(vertical)[0]).toBe(
        'M 10.00 20.00 L 10.00 55.00 Q 10.00 60.00 15.00 60.00 L 45.00 60.00 Q 50.00 60.00 50.00 65.00 L 50.00 100.00',
      );
      expect(getSmoothStepPath(horizontal)[0]).toBe(
        'M 0.00 50.00 L 45.00 50.00 Q 50.00 50.00 50.00 55.00 L 50.00 145.00 Q 50.00 150.00 55.00 150.00 L 100.00 150.00',
      );
    });

    it('takes its radius from borderRadius, and never more than half of a side', () => {
      // Sides of 40: a radius of 100 is cut to 20.
      expect(getSmoothStepPath({ ...vertical, borderRadius: 100 })[0]).toBe(
        'M 10.00 20.00 L 10.00 40.00 Q 10.00 60.00 30.00 60.00 L 30.00 60.00 Q 50.00 60.00 50.00 80.00 L 50.00 100.00',
      );
      expect(getSmoothStepPath({ ...vertical, borderRadius: 8 })[0]).toContain('L 10.00 52.00 Q 10.00 60.00 18.00 60.00');
    });

    it('draws a straight run, without a NaN, when the ends line up', () => {
      const [path] = getSmoothStepPath({ ...vertical, targetX: 10 });
      expect(path).not.toContain('NaN');
      expect(path).toBe('M 10.00 20.00 L 10.00 60.00 L 10.00 60.00 L 10.00 100.00');
    });
  });
});
