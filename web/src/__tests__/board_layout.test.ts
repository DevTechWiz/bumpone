import { describe, it, expect } from 'vitest';
import { computeBoardLayout } from '../lib/boardLayout';

describe('BumpOne Board Arena Geometry Layout', () => {
  it('computes layout with 100 slots for landscape viewport', () => {
    const layout = computeBoardLayout(1920, 1080, 100);
    expect(layout.width).toBe(1920);
    expect(layout.height).toBe(1080);
    expect(Object.keys(layout.slots).length).toBe(100);

    const king = layout.slots[1];
    expect(king).toBeDefined();
    expect(king.rank).toBe(1);
    expect(king.batch).toBe(1);
    expect(king.batchName).toBe('KING');
    expect(king.area).toBeGreaterThan(0);
  });

  it('computes layout with 100 slots for portrait / mobile viewport', () => {
    const layout = computeBoardLayout(400, 800, 100);
    expect(layout.width).toBe(400);
    expect(layout.height).toBe(800);
    expect(Object.keys(layout.slots).length).toBe(100);
    expect(layout.slots[1].rank).toBe(1);
    expect(layout.slots[100].rank).toBe(100);
  });

  it('ensures King #1 has larger area than perimeter slots', () => {
    const layout = computeBoardLayout(1200, 800, 100);
    const kingArea = layout.slots[1].area;
    const midArea = layout.slots[50].area;
    const brinkArea = layout.slots[100].area;

    expect(kingArea).toBeGreaterThan(midArea);
    expect(midArea).toBeGreaterThanOrEqual(brinkArea);
  });

  it('handles edge cases gracefully (zero or negative dimensions)', () => {
    const zeroLayout = computeBoardLayout(0, 0, 100);
    expect(Object.keys(zeroLayout.slots).length).toBe(0);

    const negativeLayout = computeBoardLayout(-100, -100, 100);
    expect(Object.keys(negativeLayout.slots).length).toBe(0);
  });
});
