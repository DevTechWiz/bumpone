import { describe, it, expect } from 'vitest';
import {
  sortBoard,
  rankOf,
  quoteTopUp,
  buildQuote,
  recomputeRank,
  MIN_INCREMENT,
  MIN_TOP_UP,
  QUOTE_VALIDITY_MIN,
  type Profile,
} from '../lib/board';

describe('BumpOne Board & Ranking Engine', () => {
  const mockProfiles: Profile[] = [
    {
      id: 'p1',
      seq: 1,
      name: 'Alpha Project',
      handle: 'alpha',
      category: 'Tech',
      active_value: 100,
      imageUrl: '',
      linkUrl: 'https://alpha.example',
      peak_rank: 1,
      times_bumped: 1,
      times_climbed: 1,
      views: 10,
      shares: 2,
      joined_days_ago: 5,
      last_bump_at: Date.now(),
      journey: [1],
      reactions: { fire: 0, eyes: 0, heart: 0, laugh: 0 },
    },
    {
      id: 'p2',
      seq: 2,
      name: 'Beta Project',
      handle: 'beta',
      category: 'Tech',
      active_value: 80,
      imageUrl: '',
      linkUrl: 'https://beta.example',
      peak_rank: 2,
      times_bumped: 1,
      times_climbed: 1,
      views: 8,
      shares: 1,
      joined_days_ago: 4,
      last_bump_at: Date.now(),
      journey: [2],
      reactions: { fire: 0, eyes: 0, heart: 0, laugh: 0 },
    },
    {
      id: 'p3',
      seq: 3,
      name: 'Gamma Project',
      handle: 'gamma',
      category: 'AI',
      active_value: 80, // Tied with p2, but arrived later (seq 3 > seq 2)
      imageUrl: '',
      linkUrl: 'https://gamma.example',
      peak_rank: 3,
      times_bumped: 1,
      times_climbed: 1,
      views: 5,
      shares: 0,
      joined_days_ago: 3,
      last_bump_at: Date.now(),
      journey: [3],
      reactions: { fire: 0, eyes: 0, heart: 0, laugh: 0 },
    },
  ];

  it('sorts board by active_value DESC and breaks ties by earliest sequence (seq ASC)', () => {
    const sorted = sortBoard(mockProfiles);
    expect(sorted[0].id).toBe('p1'); // 100
    expect(sorted[1].id).toBe('p2'); // 80, seq 2
    expect(sorted[2].id).toBe('p3'); // 80, seq 3
  });

  it('determines rankOf correctly with and without category filtering', () => {
    expect(rankOf(mockProfiles, 'p1')).toBe(1);
    expect(rankOf(mockProfiles, 'p2')).toBe(2);
    expect(rankOf(mockProfiles, 'p3')).toBe(3);

    // Filter by AI category
    expect(rankOf(mockProfiles, 'p3', 'AI')).toBe(1);
    expect(rankOf(mockProfiles, 'p1', 'AI')).toBeNull();
  });

  it('calculates quote top-up with $10 minimum entry and $10 minimum increment', () => {
    // Current value 0, target value 100 -> needs 100 - 0 + 10 = 110
    expect(quoteTopUp(0, 100)).toBe(110);

    // Current value 80, target value 100 -> needs 100 - 80 + 10 = 30
    expect(quoteTopUp(80, 100)).toBe(30);

    // Current value 95, target value 100 -> 100 - 95 + 10 = 15
    expect(quoteTopUp(95, 100)).toBe(15);

    // If current value is already higher or equal, minimum top-up is enforced ($10)
    expect(quoteTopUp(120, 100)).toBe(MIN_TOP_UP);
  });

  it('builds an informational quote with exactly 10-minute validity', () => {
    const quote = buildQuote(50, 100, 1);
    expect(quote.current_value).toBe(50);
    expect(quote.target_value).toBe(100);
    expect(quote.quoted_top_up).toBe(60); // 100 - 50 + 10
    expect(quote.resulting_value).toBe(110);
    expect(quote.expected_rank).toBe(1);
    expect(quote.expires_at).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
    expect(quote.expires_at).toBeLessThanOrEqual(Date.now() + QUOTE_VALIDITY_MIN * 60 * 1000 + 1000);
  });

  it('recomputes resulting rank at confirmation without reserving ranks', () => {
    // New entrant with 120 beats all existing (100, 80, 80)
    expect(recomputeRank(mockProfiles, 120, 99)).toBe(1);

    // New entrant with 90 lands between 100 and 80 -> Rank 2
    expect(recomputeRank(mockProfiles, 90, 99)).toBe(2);

    // New entrant with 80 (tied with p2 & p3, but newer seq 99) lands after them -> Rank 4
    expect(recomputeRank(mockProfiles, 80, 99)).toBe(4);

    // New entrant with 50 lands at the bottom -> Rank 4
    expect(recomputeRank(mockProfiles, 50, 99)).toBe(4);
  });
});
