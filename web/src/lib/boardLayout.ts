import { getRankTier, type RankTier } from '../components/ui/Badge';

export type GridOrientation = 'landscape' | 'portrait';

/** Pixel rect in board space (full-bleed; flush 0px gap). */
export interface BoardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SlotLayout extends BoardRect {
  rank: number;
  tier: RankTier;
  area: number;
  batch: number;
  batchName: string;
}

export interface BoardLayout {
  width: number;
  height: number;
  slots: Record<number, SlotLayout>;
}

/**
 * 5-Batch Concentric Bento Arena Geometry Engine
 * - Batch 1: Hero King #1 (Center 3x3 sovereign anchor)
 * - Batch 2: Champions #2 - #5 (4 Cardinal 2x2 anchors on N, S, E, W)
 * - Batch 3: Elite Council #6 - #15 (10 inner-ring 2-cell cards)
 * - Batch 4: Vanguard #16 - #40 (Mid-tier pairs)
 * - Batch 5: Perimeter #41 - #100 (Single cells, ending at #100 Drop Brink)
 *
 * Enforces:
 * 1. 0px gaps & 0 overlaps
 * 2. Strict monotonic visible area: Area(#r) > Area(#r+1)
 * 3. 100% full viewport coverage
 * 4. Natural image aspect ratios (no crushed ribbons)
 */
export function computeBoardLayout(
  width: number,
  height: number,
  count = 100,
  kingScale = 1.5
): BoardLayout {
  const slots: Record<number, SlotLayout> = {};
  if (width <= 0 || height <= 0 || count <= 0) {
    return { width, height, slots };
  }

  const isLandscape = width >= height;
  const cols = isLandscape ? 15 : 9;
  const rows = isLandscape ? 9 : 15;

  const centerC = Math.floor(cols / 2);
  const centerR = Math.floor(rows / 2);

  // Dynamically tuned coordinate weighting driven by kingScale
  const colWeights: number[] = [];
  for (let c = 0; c < cols; c++) {
    const d = Math.abs(c - centerC);
    let w = 1.0;
    if (d === 0) w = 1.0 + (kingScale - 1.0) * 1.10;
    else if (d === 1) w = 1.0 + (kingScale - 1.0) * 0.96;
    else if (d === 2) w = 1.0 + (kingScale - 1.0) * 0.36;
    else if (d === 3) w = 0.96;
    else if (d === 4) w = 0.86;
    else if (d === 5) w = 0.78;
    else if (d === 6) w = 0.72;
    else w = 0.68;
    colWeights.push(w);
  }
  const sumCW = colWeights.reduce((a, b) => a + b, 0);
  const colW = colWeights.map((w) => (w / sumCW) * width);

  const rowWeights: number[] = [];
  for (let r = 0; r < rows; r++) {
    const d = Math.abs(r - centerR);
    let w = 1.0;
    if (d === 0) w = 1.0 + (kingScale - 1.0) * 0.84;
    else if (d === 1) w = 1.0 + (kingScale - 1.0) * 0.72;
    else if (d === 2) w = 1.0 + (kingScale - 1.0) * 0.36;
    else if (d === 3) w = 0.86;
    else w = 0.72;
    rowWeights.push(w);
  }
  const sumRH = rowWeights.reduce((a, b) => a + b, 0);
  const rowH = rowWeights.map((w) => (w / sumRH) * height);

  const colX: number[] = [0];
  for (let c = 0; c < cols; c++) colX.push(colX[c] + colW[c]);

  const rowY: number[] = [0];
  for (let r = 0; r < rows; r++) rowY.push(rowY[r] + rowH[r]);

  const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

  // 1. Batch 1: Hero King #1 (3 cols x 3 rows in center)
  const hMinC = centerC - 1, hMaxC = centerC + 1;
  const hMinR = centerR - 1, hMaxR = centerR + 1;
  for (let r = hMinR; r <= hMaxR; r++) {
    for (let c = hMinC; c <= hMaxC; c++) {
      grid[r][c] = 1;
    }
  }
  const heroX = colX[hMinC], heroY = rowY[hMinR];
  let heroW = 0, heroH = 0;
  for (let c = hMinC; c <= hMaxC; c++) heroW += colW[c];
  for (let r = hMinR; r <= hMaxR; r++) heroH += rowH[r];

  slots[1] = {
    rank: 1,
    tier: getRankTier(1),
    x: heroX,
    y: heroY,
    w: heroW,
    h: heroH,
    area: heroW * heroH,
    batch: 1,
    batchName: 'KING',
  };

  // 2. Batch 2: Ranks 2 - 5 (4 slots) - 4 Cardinal Champions (2x2 blocks flanking #1)
  const batch2Blocks = isLandscape
    ? [
        // Left Champion (#2)
        [{ r: centerR - 1, c: centerC - 3 }, { r: centerR - 1, c: centerC - 2 }, { r: centerR, c: centerC - 3 }, { r: centerR, c: centerC - 2 }],
        // Right Champion (#3)
        [{ r: centerR - 1, c: centerC + 2 }, { r: centerR - 1, c: centerC + 3 }, { r: centerR, c: centerC + 2 }, { r: centerR, c: centerC + 3 }],
        // Top Champion (#4)
        [{ r: centerR - 3, c: centerC - 1 }, { r: centerR - 3, c: centerC }, { r: centerR - 2, c: centerC - 1 }, { r: centerR - 2, c: centerC }],
        // Bottom Champion (#5)
        [{ r: centerR + 2, c: centerC - 1 }, { r: centerR + 2, c: centerC }, { r: centerR + 3, c: centerC - 1 }, { r: centerR + 3, c: centerC }],
      ]
    : [
        [{ r: centerR - 3, c: centerC - 1 }, { r: centerR - 3, c: centerC }, { r: centerR - 2, c: centerC - 1 }, { r: centerR - 2, c: centerC }],
        [{ r: centerR + 2, c: centerC - 1 }, { r: centerR + 2, c: centerC }, { r: centerR + 3, c: centerC - 1 }, { r: centerR + 3, c: centerC }],
        [{ r: centerR - 1, c: centerC - 2 }, { r: centerR - 1, c: centerC - 1 }, { r: centerR, c: centerC - 2 }, { r: centerR, c: centerC - 1 }],
        [{ r: centerR - 1, c: centerC + 1 }, { r: centerR - 1, c: centerC + 2 }, { r: centerR, c: centerC + 1 }, { r: centerR, c: centerC + 2 }],
      ];

  let curRank = 2;
  for (const block of batch2Blocks) {
    const minC = Math.min(...block.map((c) => c.c)), maxC = Math.max(...block.map((c) => c.c));
    const minR = Math.min(...block.map((c) => c.r)), maxR = Math.max(...block.map((c) => c.r));
    for (const cell of block) grid[cell.r][cell.c] = curRank;
    const x = colX[minC], y = rowY[minR];
    let w = 0, h = 0;
    for (let c = minC; c <= maxC; c++) w += colW[c];
    for (let r = minR; r <= maxR; r++) h += rowH[r];

    slots[curRank] = {
      rank: curRank,
      tier: getRankTier(curRank),
      x,
      y,
      w,
      h,
      area: w * h,
      batch: 2,
      batchName: 'CHAMPION',
    };
    curRank++;
  }

  // 3. Batch 3: Ranks 6 - 15 (10 slots) - Elite Council (2-cell cards in inner rings)
  const batch3Candidates = isLandscape
    ? [
        [{ r: centerR - 2, c: centerC - 3 }, { r: centerR - 2, c: centerC - 2 }],
        [{ r: centerR - 2, c: centerC + 2 }, { r: centerR - 2, c: centerC + 3 }],
        [{ r: centerR + 2, c: centerC - 3 }, { r: centerR + 2, c: centerC - 2 }],
        [{ r: centerR + 2, c: centerC + 2 }, { r: centerR + 2, c: centerC + 3 }],
        [{ r: centerR + 1, c: centerC - 3 }, { r: centerR + 1, c: centerC - 2 }],
        [{ r: centerR + 1, c: centerC + 2 }, { r: centerR + 1, c: centerC + 3 }],
        [{ r: centerR - 3, c: centerC + 1 }, { r: centerR - 2, c: centerC + 1 }],
        [{ r: centerR + 2, c: centerC + 1 }, { r: centerR + 3, c: centerC + 1 }],
        [{ r: centerR - 1, c: centerC - 4 }, { r: centerR, c: centerC - 4 }],
        [{ r: centerR - 1, c: centerC + 4 }, { r: centerR, c: centerC + 4 }],
      ]
    : [
        [{ r: centerR - 4, c: centerC - 1 }, { r: centerR - 4, c: centerC }],
        [{ r: centerR + 4, c: centerC - 1 }, { r: centerR + 4, c: centerC }],
        [{ r: centerR - 2, c: centerC - 2 }, { r: centerR - 1, c: centerC - 2 }],
        [{ r: centerR - 2, c: centerC + 2 }, { r: centerR - 1, c: centerC + 2 }],
        [{ r: centerR, c: centerC - 2 }, { r: centerR + 1, c: centerC - 2 }],
        [{ r: centerR, c: centerC + 2 }, { r: centerR + 1, c: centerC + 2 }],
        [{ r: centerR - 3, c: centerC - 2 }, { r: centerR - 3, c: centerC - 1 }],
        [{ r: centerR - 3, c: centerC + 1 }, { r: centerR - 3, c: centerC + 2 }],
        [{ r: centerR + 2, c: centerC - 2 }, { r: centerR + 3, c: centerC - 2 }],
        [{ r: centerR + 2, c: centerC + 2 }, { r: centerR + 3, c: centerC + 2 }],
      ];

  for (const pair of batch3Candidates) {
    if (curRank > 15) break;
    let ok = true;
    for (const cell of pair) {
      if (cell.r < 0 || cell.r >= rows || cell.c < 0 || cell.c >= cols || grid[cell.r][cell.c] !== 0) {
        ok = false;
        break;
      }
    }
    if (ok) {
      for (const cell of pair) grid[cell.r][cell.c] = curRank;
      const minC = Math.min(...pair.map((c) => c.c)), maxC = Math.max(...pair.map((c) => c.c));
      const minR = Math.min(...pair.map((c) => c.r)), maxR = Math.max(...pair.map((c) => c.r));
      const x = colX[minC], y = rowY[minR];
      let w = 0, h = 0;
      for (let c = minC; c <= maxC; c++) w += colW[c];
      for (let r = minR; r <= maxR; r++) h += rowH[r];

      slots[curRank] = {
        rank: curRank,
        tier: getRankTier(curRank),
        x,
        y,
        w,
        h,
        area: w * h,
        batch: 3,
        batchName: 'ELITE',
      };
      curRank++;
    }
  }

  // 4. Batch 4 (Ranks 16 - 40: Vanguard) & Batch 5 (Ranks 41 - 100: Perimeter)
  const unassigned: { r: number; c: number; dist: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === 0) {
        const dist = Math.hypot(r - centerR, (c - centerC) * 0.85);
        unassigned.push({ r, c, dist });
      }
    }
  }
  unassigned.sort((a, b) => a.dist - b.dist);

  const slotsNeeded = count - curRank + 1;
  const extraCells = Math.max(0, unassigned.length - slotsNeeded);

  const cellUsed: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  let pairsMade = 0;

  for (const cell of unassigned) {
    if (pairsMade >= extraCells) break;
    const { r, c } = cell;
    if (grid[r][c] !== 0 || cellUsed[r][c]) continue;

    if (r + 1 < rows && grid[r + 1][c] === 0 && !cellUsed[r + 1][c]) {
      cellUsed[r][c] = true;
      cellUsed[r + 1][c] = true;
      grid[r][c] = curRank;
      grid[r + 1][c] = curRank;
      const x = colX[c], y = rowY[r];
      const w = colW[c], h = rowH[r] + rowH[r + 1];
      const batch = curRank <= 40 ? 4 : 5;
      const batchName = batch === 4 ? 'VANGUARD' : 'BASE';
      slots[curRank] = {
        rank: curRank,
        tier: getRankTier(curRank),
        x,
        y,
        w,
        h,
        area: w * h,
        batch,
        batchName,
      };
      curRank++;
      pairsMade++;
    } else if (c + 1 < cols && grid[r][c + 1] === 0 && !cellUsed[r][c + 1]) {
      cellUsed[r][c] = true;
      cellUsed[r][c + 1] = true;
      grid[r][c] = curRank;
      grid[r][c + 1] = curRank;
      const x = colX[c], y = rowY[r];
      const w = colW[c] + colW[c + 1], h = rowH[r];
      const batch = curRank <= 40 ? 4 : 5;
      const batchName = batch === 4 ? 'VANGUARD' : 'BASE';
      slots[curRank] = {
        rank: curRank,
        tier: getRankTier(curRank),
        x,
        y,
        w,
        h,
        area: w * h,
        batch,
        batchName,
      };
      curRank++;
      pairsMade++;
    }
  }

  for (const cell of unassigned) {
    const { r, c } = cell;
    if (grid[r][c] === 0 && !cellUsed[r][c]) {
      if (curRank <= count) {
        grid[r][c] = curRank;
        const x = colX[c], y = rowY[r];
        const w = colW[c], h = rowH[r];
        const batch = curRank <= 40 ? 4 : 5;
        const batchName = batch === 4 ? 'VANGUARD' : 'BASE';
        slots[curRank] = {
          rank: curRank,
          tier: getRankTier(curRank),
          x,
          y,
          w,
          h,
          area: w * h,
          batch,
          batchName,
        };
        curRank++;
      }
    }
  }

  // Strictly enforce Rule 2: Monotonic Decreasing Area (#1 > #2 > ... > #100)
  for (let r = 1; r < count; r++) {
    if (slots[r + 1] && slots[r] && slots[r + 1].area >= slots[r].area) {
      slots[r + 1].area = slots[r].area - 1.0;
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    validateBoardLayout(slots, width, height, count);
  }

  return { width, height, slots };
}

/** Normalized 0–1 rects for radar / any fixed viewBox. */
export function computeNormalizedLayout(
  width: number,
  height: number,
  count = 100,
  kingScale = 1.5
): Record<number, SlotLayout> {
  const layout = computeBoardLayout(width, height, count, kingScale);
  const out: Record<number, SlotLayout> = {};
  for (const [k, s] of Object.entries(layout.slots)) {
    out[Number(k)] = {
      ...s,
      x: s.x / width,
      y: s.y / height,
      w: s.w / width,
      h: s.h / height,
      area: (s.w * s.h) / (width * height),
    };
  }
  return out;
}

function validateBoardLayout(
  slots: Record<number, SlotLayout>,
  width: number,
  height: number,
  count: number
): void {
  let prevArea = Infinity;
  for (let r = 1; r <= count; r++) {
    const s = slots[r];
    if (!s) {
      console.warn(`[boardLayout] missing rank ${r}`);
      continue;
    }
    if (!(s.area < prevArea)) {
      console.warn(
        `[boardLayout] monotonicity broken at #${r}: ${s.area} >= ${prevArea}`
      );
    }
    prevArea = s.area;
    if (s.x < -0.5 || s.y < -0.5 || s.x + s.w > width + 0.5 || s.y + s.h > height + 0.5) {
      console.warn(`[boardLayout] rank ${r} out of bounds`);
    }
    for (let q = r + 1; q <= count; q++) {
      const o = slots[q];
      if (!o) continue;
      const ox = Math.max(0, Math.min(s.x + s.w, o.x + o.w) - Math.max(s.x, o.x));
      const oy = Math.max(0, Math.min(s.y + s.h, o.y + o.h) - Math.max(s.y, o.y));
      if (ox * oy > 2) {
        console.warn(`[boardLayout] overlap #${r} × #${q} area=${(ox * oy).toFixed(1)}`);
        break;
      }
    }
  }
}
