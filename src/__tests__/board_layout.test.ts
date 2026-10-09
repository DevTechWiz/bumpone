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

  it('ensures slots do not have extreme aspect ratios (no 2:6 or 4:1) across multiple viewports', () => {
    const viewports = [
      { w: 1920, h: 1080, name: '1080p Desktop' },
      { w: 1440, h: 900, name: 'Laptop' },
      { w: 1200, h: 800, name: 'Standard Desktop' },
      { w: 800, h: 1000, name: 'Tablet Portrait' },
      { w: 390, h: 844, name: 'Mobile Portrait' },
    ];

    for (const vp of viewports) {
      const layout = computeBoardLayout(vp.w, vp.h, 100);
      expect(Object.keys(layout.slots).length).toBe(100);

      const badSlots: { rank: number; ratio: number; w: number; h: number }[] = [];
      for (let r = 1; r <= 100; r++) {
        const s = layout.slots[r];
        if (!s) continue;
        const ratio = s.w / s.h;
        // Natural card bounds: allow 1:2 (0.45-0.50) to 2:1 (2.0-2.2), strictly forbidding slivers like 2:6 (0.33) or 4:1 (4.00)
        // In mobile portrait (390x844), screen aspect ratio is ~0.46, so slots stay bounded proportionally
        const minRatio = vp.w < vp.h ? 0.35 : 0.42;
        const maxRatio = vp.w < vp.h ? 2.5 : 2.25;
        if (ratio > maxRatio || ratio < minRatio) {
          badSlots.push({ rank: r, ratio: Math.round(ratio * 100) / 100, w: Math.round(s.w), h: Math.round(s.h) });
        }
      }
      expect(badSlots, `Found bad aspect ratio slots in ${vp.name}`).toHaveLength(0);
    }
  });
});
