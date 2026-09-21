export interface CellCoordinate {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  tier: 'king' | 'elite' | 'lord' | 'contender' | 'bubble';
}

export type GridOrientation = 'landscape' | 'portrait';

/**
 * Concentric Grid Layout Architecture:
 * Strict position-based scaling with no stretched dominoes (no awkward 2x1 cards).
 * 
 * - Sovereign King #1: 4x4 Citadel at center (Area: 16)
 * - Inner Orbit Elites #2..#13: 2x2 Square Blocks (Area: 4 each, 12 slots = 48 units)
 * - All Remaining Ranks #14..#100: Uniform 1x1 Square Units arranged radially by distance from center
 *   (87 slots x 1 unit = 87 units)
 * Total Units: 16 + 48 + 87 = 151 units in a clean, balanced grid with 0 stretched widths!
 * 
 * Landscape: 14 cols x 11 rows = 154 units (Center King at rows 4..7, cols 6..9)
 * All cards maintain natural square aspect ratios; scaling is purely driven by hierarchical position.
 */
function buildLandscape16x12(): Record<number, CellCoordinate> {
  const W = 16;
  const H = 12;
  const grid = Array.from({ length: H }, () => Array(W).fill(0));
  const layout: Record<number, CellCoordinate> = {};

  // 1. King (Rank 1): 4x4 in dead center
  const kr = 4, kc = 6;
  layout[1] = { row: kr + 1, col: kc + 1, rowSpan: 4, colSpan: 4, tier: 'king' };
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      grid[kr + r][kc + c] = 1;
    }
  }

  // 2. Inner Elites (Ranks 2..13): 12 slots of 2x2 surrounding King
  const elites = [
    { rank: 2, r: 2, c: 6 },
    { rank: 3, r: 2, c: 8 },
    { rank: 4, r: 4, c: 10 },
    { rank: 5, r: 6, c: 10 },
    { rank: 6, r: 8, c: 8 },
    { rank: 7, r: 8, c: 6 },
    { rank: 8, r: 6, c: 4 },
    { rank: 9, r: 4, c: 4 },
    { rank: 10, r: 2, c: 4 },
    { rank: 11, r: 2, c: 10 },
    { rank: 12, r: 8, c: 10 },
    { rank: 13, r: 8, c: 4 },
  ];

  elites.forEach((e) => {
    layout[e.rank] = { row: e.r + 1, col: e.c + 1, rowSpan: 2, colSpan: 2, tier: 'elite' };
    for (let dr = 0; dr < 2; dr++) {
      for (let dc = 0; dc < 2; dc++) {
        grid[e.r + dr][e.c + dc] = e.rank;
      }
    }
  });

  // Center coordinate for radial distance calculation
  const centerR = 5.5, centerC = 7.5;
  function cellDist(r: number, c: number) {
    return Math.hypot((r - centerR) * 1.3, c - centerC);
  }

  // 3. Ranks 14..100: Clean uniform 1x1 cells scaled radially by distance from center
  // NO stretched 2x1 domino cards. Every card has natural square proportion.
  const singleCells: { r: number; c: number; dist: number }[] = [];
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (grid[r][c] === 0) {
        singleCells.push({ r, c, dist: cellDist(r, c) });
      }
    }
  }
  singleCells.sort((a, b) => a.dist - b.dist);

  singleCells.forEach((sc, idx) => {
    const rank = 14 + idx;
    if (rank > 100) return; // Grid capacity check
    const tier: 'lord' | 'contender' | 'bubble' =
      rank === 100 ? 'bubble' : rank <= 50 ? 'lord' : 'contender';
    layout[rank] = {
      row: sc.r + 1,
      col: sc.c + 1,
      rowSpan: 1,
      colSpan: 1,
      tier,
    };
    grid[sc.r][sc.c] = rank;
  });

  return layout;
}

/**
 * Portrait layout: 12 columns x 16 rows = 192 unit cells
 * Uniform square proportions; King (4x4), Elites (2x2), Remaining 1x1
 */
function buildPortrait12x16(): Record<number, CellCoordinate> {
  const W = 12;
  const H = 16;
  const grid = Array.from({ length: H }, () => Array(W).fill(0));
  const layout: Record<number, CellCoordinate> = {};

  // 1. King (Rank 1): 4x4 in dead center
  const kr = 6, kc = 4;
  layout[1] = { row: kr + 1, col: kc + 1, rowSpan: 4, colSpan: 4, tier: 'king' };
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      grid[kr + r][kc + c] = 1;
    }
  }

  // 2. Inner Elites (Ranks 2..13): 12 slots of 2x2
  const elites = [
    { rank: 2, r: 4, c: 4 },
    { rank: 3, r: 4, c: 6 },
    { rank: 4, r: 6, c: 8 },
    { rank: 5, r: 8, c: 8 },
    { rank: 6, r: 10, c: 6 },
    { rank: 7, r: 10, c: 4 },
    { rank: 8, r: 8, c: 2 },
    { rank: 9, r: 6, c: 2 },
    { rank: 10, r: 4, c: 2 },
    { rank: 11, r: 4, c: 8 },
    { rank: 12, r: 10, c: 8 },
    { rank: 13, r: 10, c: 2 },
  ];

  elites.forEach((e) => {
    layout[e.rank] = { row: e.r + 1, col: e.c + 1, rowSpan: 2, colSpan: 2, tier: 'elite' };
    for (let dr = 0; dr < 2; dr++) {
      for (let dc = 0; dc < 2; dc++) {
        grid[e.r + dr][e.c + dc] = e.rank;
      }
    }
  });

  const centerR = 7.5, centerC = 5.5;
  function cellDist(r: number, c: number) {
    return Math.hypot((r - centerR) * (12 / 16), c - centerC);
  }

  // 3. Ranks 14..100: Clean uniform 1x1 cells scaled radially by distance from center
  const singleCells: { r: number; c: number; dist: number }[] = [];
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (grid[r][c] === 0) {
        singleCells.push({ r, c, dist: cellDist(r, c) });
      }
    }
  }
  singleCells.sort((a, b) => a.dist - b.dist);

  singleCells.forEach((sc, idx) => {
    const rank = 14 + idx;
    if (rank > 100) return;
    const tier: 'lord' | 'contender' | 'bubble' =
      rank === 100 ? 'bubble' : rank <= 50 ? 'lord' : 'contender';
    layout[rank] = {
      row: sc.r + 1,
      col: sc.c + 1,
      rowSpan: 1,
      colSpan: 1,
      tier,
    };
    grid[sc.r][sc.c] = rank;
  });

  return layout;
}

export const LANDSCAPE_GRID_LAYOUT = buildLandscape16x12();
export const PORTRAIT_GRID_LAYOUT = buildPortrait12x16();

export function getSlotCoordinate(rank: number, orientation: GridOrientation = 'landscape'): CellCoordinate {
  const layout = orientation === 'landscape' ? LANDSCAPE_GRID_LAYOUT : PORTRAIT_GRID_LAYOUT;
  return layout[rank] || { row: 1, col: 1, rowSpan: 1, colSpan: 1, tier: 'contender' };
}
