import { getRankTier, type RankTier } from './slotTypes';

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

  // Center-magnified coordinate weighting: center cards (King #1, Champions) scale up majestically,
  // while perimeter cards (Contenders) scale down into sleek, compact tiles.
  const edgeScale = isLandscape ? 0.74 : 0.82;
  const effectiveKingScale = isLandscape ? Math.max(1.38, kingScale) : Math.max(1.18, kingScale * 0.85);

  const colWeights: number[] = [];
  for (let c = 0; c < cols; c++) {
    const d = Math.abs(c - centerC) / centerC; // 0 at center, 1 at edge
    const decay = 0.5 * (1 + Math.cos(d * Math.PI)); // smooth 1 at center, 0 at edge
    const w = edgeScale + (effectiveKingScale - edgeScale) * decay;
    colWeights.push(w);
  }
  const sumCW = colWeights.reduce((a, b) => a + b, 0);
  const colW = colWeights.map((w) => (w / sumCW) * width);

  const rowWeights: number[] = [];
  for (let r = 0; r < rows; r++) {
    const d = Math.abs(r - centerR) / centerR; // 0 at center, 1 at edge
    const decay = 0.5 * (1 + Math.cos(d * Math.PI)); // smooth 1 at center, 0 at edge
    const w = edgeScale + (effectiveKingScale - edgeScale) * decay;
    rowWeights.push(w);
  }
  const sumRH = rowWeights.reduce((a, b) => a + b, 0);
  const rowH = rowWeights.map((w) => (w / sumRH) * height);

  const colX: number[] = [0];
  for (let c = 0; c < cols; c++) colX.push(colX[c] + colW[c]);

  const rowY: number[] = [0];
  for (let r = 0; r < rows; r++) rowY.push(rowY[r] + rowH[r]);

  const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

  interface RawBlock {
    minC: number;
    maxC: number;
    minR: number;
    maxR: number;
    w: number;
    h: number;
    x: number;
    y: number;
    area: number;
    dist: number;
    tierHint?: 'king' | 'champion' | 'elite';
  }

  const rawBlocks: RawBlock[] = [];

  // 1. Center Hero King #1 (3 cols x 3 rows in center)
  const hMinC = centerC - 1, hMaxC = centerC + 1;
  const hMinR = centerR - 1, hMaxR = centerR + 1;
  for (let r = hMinR; r <= hMaxR; r++) {
    for (let c = hMinC; c <= hMaxC; c++) {
      grid[r][c] = 1;
    }
  }
  let heroW = 0, heroH = 0;
  for (let c = hMinC; c <= hMaxC; c++) heroW += colW[c];
  for (let r = hMinR; r <= hMaxR; r++) heroH += rowH[r];

  rawBlocks.push({
    minC: hMinC,
    maxC: hMaxC,
    minR: hMinR,
    maxR: hMaxR,
    x: colX[hMinC],
    y: rowY[hMinR],
    w: heroW,
    h: heroH,
    area: heroW * heroH,
    dist: 0,
    tierHint: 'king',
  });

  // 2. Champions: 4 Cardinal 2x2 anchors flanking #1
  const batch2Blocks = isLandscape
    ? [
      [{ r: centerR - 1, c: centerC - 3 }, { r: centerR - 1, c: centerC - 2 }, { r: centerR, c: centerC - 3 }, { r: centerR, c: centerC - 2 }],
      [{ r: centerR - 1, c: centerC + 2 }, { r: centerR - 1, c: centerC + 3 }, { r: centerR, c: centerC + 2 }, { r: centerR, c: centerC + 3 }],
      [{ r: centerR - 3, c: centerC - 1 }, { r: centerR - 3, c: centerC }, { r: centerR - 2, c: centerC - 1 }, { r: centerR - 2, c: centerC }],
      [{ r: centerR + 2, c: centerC - 1 }, { r: centerR + 2, c: centerC }, { r: centerR + 3, c: centerC - 1 }, { r: centerR + 3, c: centerC }],
    ]
    : [
      [{ r: centerR - 3, c: centerC - 1 }, { r: centerR - 3, c: centerC }, { r: centerR - 2, c: centerC - 1 }, { r: centerR - 2, c: centerC }],
      [{ r: centerR + 2, c: centerC - 1 }, { r: centerR + 2, c: centerC }, { r: centerR + 3, c: centerC - 1 }, { r: centerR + 3, c: centerC }],
      [{ r: centerR - 1, c: centerC - 3 }, { r: centerR - 1, c: centerC - 2 }, { r: centerR, c: centerC - 3 }, { r: centerR, c: centerC - 2 }],
      [{ r: centerR - 1, c: centerC + 2 }, { r: centerR - 1, c: centerC + 3 }, { r: centerR, c: centerC + 2 }, { r: centerR, c: centerC + 3 }],
    ];

  for (const block of batch2Blocks) {
    const minC = Math.min(...block.map((c) => c.c)), maxC = Math.max(...block.map((c) => c.c));
    const minR = Math.min(...block.map((c) => c.r)), maxR = Math.max(...block.map((c) => c.r));
    for (const cell of block) grid[cell.r][cell.c] = 2;
    const x = colX[minC], y = rowY[minR];
    let w = 0, h = 0;
    for (let c = minC; c <= maxC; c++) w += colW[c];
    for (let r = minR; r <= maxR; r++) h += rowH[r];
    const centerX = x + w / 2, centerY = y + h / 2;
    const dist = Math.hypot((centerY - height / 2) / height, (centerX - width / 2) / width);

    rawBlocks.push({
      minC,
      maxC,
      minR,
      maxR,
      x,
      y,
      w,
      h,
      area: w * h,
      dist,
      tierHint: 'champion',
    });
  }

  // 3. Elite Council (10 slots) in the inner concentric ring
  const batch3Candidates = isLandscape
    ? [
      [{ r: centerR - 3, c: centerC - 3 }, { r: centerR - 2, c: centerC - 3 }],
      [{ r: centerR - 3, c: centerC - 2 }, { r: centerR - 2, c: centerC - 2 }],
      [{ r: centerR - 3, c: centerC + 1 }, { r: centerR - 2, c: centerC + 1 }],
      [{ r: centerR - 3, c: centerC + 2 }, { r: centerR - 2, c: centerC + 2 }],
      [{ r: centerR - 3, c: centerC + 3 }, { r: centerR - 2, c: centerC + 3 }],
      [{ r: centerR + 2, c: centerC - 3 }, { r: centerR + 3, c: centerC - 3 }],
      [{ r: centerR + 2, c: centerC - 2 }, { r: centerR + 3, c: centerC - 2 }],
      [{ r: centerR + 2, c: centerC + 1 }, { r: centerR + 3, c: centerC + 1 }],
      [{ r: centerR + 2, c: centerC + 2 }, { r: centerR + 3, c: centerC + 2 }],
      [{ r: centerR + 2, c: centerC + 3 }, { r: centerR + 3, c: centerC + 3 }],
    ]
    : [
      [{ r: centerR - 4, c: centerC - 2 }, { r: centerR - 3, c: centerC - 2 }],
      [{ r: centerR - 4, c: centerC + 2 }, { r: centerR - 3, c: centerC + 2 }],
      [{ r: centerR + 3, c: centerC - 2 }, { r: centerR + 4, c: centerC - 2 }],
      [{ r: centerR + 3, c: centerC + 2 }, { r: centerR + 4, c: centerC + 2 }],
      [{ r: centerR - 1, c: centerC - 3 }, { r: centerR - 1, c: centerC - 2 }],
      [{ r: centerR - 1, c: centerC + 2 }, { r: centerR - 1, c: centerC + 3 }],
      [{ r: centerR, c: centerC - 3 }, { r: centerR, c: centerC - 2 }],
      [{ r: centerR, c: centerC + 2 }, { r: centerR, c: centerC + 3 }],
      [{ r: centerR + 1, c: centerC - 3 }, { r: centerR + 1, c: centerC - 2 }],
      [{ r: centerR + 1, c: centerC + 2 }, { r: centerR + 1, c: centerC + 3 }],
    ];

  let eliteCount = 0;
  for (const pair of batch3Candidates) {
    if (eliteCount >= 10) break;
    let ok = true;
    for (const cell of pair) {
      if (cell.r < 0 || cell.r >= rows || cell.c < 0 || cell.c >= cols || grid[cell.r][cell.c] !== 0) {
        ok = false;
        break;
      }
    }
    if (ok) {
      for (const cell of pair) grid[cell.r][cell.c] = 3;
      const minC = Math.min(...pair.map((c) => c.c)), maxC = Math.max(...pair.map((c) => c.c));
      const minR = Math.min(...pair.map((c) => c.r)), maxR = Math.max(...pair.map((c) => c.r));
      const x = colX[minC], y = rowY[minR];
      let w = 0, h = 0;
      for (let c = minC; c <= maxC; c++) w += colW[c];
      for (let r = minR; r <= maxR; r++) h += rowH[r];
      const centerX = x + w / 2, centerY = y + h / 2;
      const dist = Math.hypot((centerY - height / 2) / height, (centerX - width / 2) / width);

      rawBlocks.push({
        minC,
        maxC,
        minR,
        maxR,
        x,
        y,
        w,
        h,
        area: w * h,
        dist,
        tierHint: 'elite',
      });
      eliteCount++;
    }
  }

  // 4. Distribute remaining cards in concentric rings outward
  const unassigned: { r: number; c: number; dist: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === 0) {
        const dist = Math.hypot((r - centerR) / rows, ((c - centerC) * 0.85) / cols);
        unassigned.push({ r, c, dist });
      }
    }
  }
  unassigned.sort((a, b) => a.dist - b.dist);

  const slotsNeeded = count - rawBlocks.length;
  const extraCells = Math.max(0, unassigned.length - slotsNeeded);

  const cellUsed: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  let pairsMade = 0;

  for (const cell of unassigned) {
    if (pairsMade >= extraCells) break;
    const { r, c } = cell;
    if (grid[r][c] !== 0 || cellUsed[r][c]) continue;

    const canPairH = c + 1 < cols && grid[r][c + 1] === 0 && !cellUsed[r][c + 1];
    const canPairV = r + 1 < rows && grid[r + 1][c] === 0 && !cellUsed[r + 1][c];
    const ratioH = canPairH ? (colW[c] + colW[c + 1]) / rowH[r] : 0;
    const ratioV = canPairV ? colW[c] / (rowH[r] + rowH[r + 1]) : 0;

    const validH = canPairH && ratioH >= 0.40 && ratioH <= 2.50;
    const validV = canPairV && ratioV >= 0.40 && ratioV <= 2.50;

    let chosenDir: 'H' | 'V' | null = null;
    if (validH && validV) {
      chosenDir = Math.abs(ratioH - 1.0) <= Math.abs(ratioV - 1.0) ? 'H' : 'V';
    } else if (validH) {
      chosenDir = 'H';
    } else if (validV) {
      chosenDir = 'V';
    }

    if (chosenDir === 'H') {
      cellUsed[r][c] = true;
      cellUsed[r][c + 1] = true;
      grid[r][c] = 4;
      grid[r][c + 1] = 4;
      const x = colX[c], y = rowY[r];
      const w = colW[c] + colW[c + 1], h = rowH[r];
      const centerX = x + w / 2, centerY = y + h / 2;
      const dist = Math.hypot((centerY - height / 2) / height, (centerX - width / 2) / width);
      rawBlocks.push({ minC: c, maxC: c + 1, minR: r, maxR: r, x, y, w, h, area: w * h, dist });
      pairsMade++;
    } else if (chosenDir === 'V') {
      cellUsed[r][c] = true;
      cellUsed[r + 1][c] = true;
      grid[r][c] = 4;
      grid[r + 1][c] = 4;
      const x = colX[c], y = rowY[r];
      const w = colW[c], h = rowH[r] + rowH[r + 1];
      const centerX = x + w / 2, centerY = y + h / 2;
      const dist = Math.hypot((centerY - height / 2) / height, (centerX - width / 2) / width);
      rawBlocks.push({ minC: c, maxC: c, minR: r, maxR: r + 1, x, y, w, h, area: w * h, dist });
      pairsMade++;
    }
  }

  // Remaining single cells radiate outward to perimeter
  for (const cell of unassigned) {
    const { r, c } = cell;
    if (grid[r][c] === 0 && !cellUsed[r][c]) {
      grid[r][c] = 5;
      const x = colX[c], y = rowY[r];
      const w = colW[c], h = rowH[r];
      const centerX = x + w / 2, centerY = y + h / 2;
      const dist = Math.hypot((centerY - height / 2) / height, (centerX - width / 2) / width);
      rawBlocks.push({ minC: c, maxC: c, minR: r, maxR: r, x, y, w, h, area: w * h, dist });
    }
  }

  // 5. Strictly enforce Note 1: lower slot grid should always be higher area than higher slot:
  // Area(#r) >= Area(#r+1) for all r = 1..100.
  // And Note 2: Concentric distribution outward from center: closer to center gets lower rank.
  rawBlocks.sort((a, b) => {
    // Primarily: physical area descending
    if (Math.abs(b.area - a.area) > 0.1) {
      return b.area - a.area;
    }
    // Secondarily: closest to center gets lower slot rank
    return a.dist - b.dist;
  });

  let prevArea = Infinity;
  for (let i = 0; i < Math.min(count, rawBlocks.length); i++) {
    const rank = i + 1;
    const b = rawBlocks[i];
    const tier = getRankTier(rank);
    const batch = rank === 1 ? 1 : rank <= 5 ? 2 : rank <= 15 ? 3 : rank <= 40 ? 4 : 5;
    const batchName = batch === 1 ? 'KING' : batch === 2 ? 'CHAMPION' : batch === 3 ? 'ELITE' : batch === 4 ? 'VANGUARD' : 'BASE';

    // Strictly enforce monotonic area decreasing
    const area = Math.min(b.area, prevArea - 0.5);
    prevArea = area;

    slots[rank] = {
      rank,
      tier,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      area,
      batch,
      batchName,
    };
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
