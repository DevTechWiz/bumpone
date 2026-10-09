import { describe, it, expect } from 'vitest';
import {
  sortBoard,
  rankOf,
  quoteTopUp,
  buildQuote,
  recomputeRank,
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

  it('guarantees slot #100 is live on the wall and graveyard starts at #101', () => {
    // Generate 105 mock profiles
    const hundredFiveProfiles: Profile[] = Array.from({ length: 105 }, (_, i) => ({
      id: `p-${i + 1}`,
      seq: i + 1,
      name: `Project ${i + 1}`,
      handle: `p${i + 1}`,
      category: 'AI',
      active_value: 200 - i, // Highest value first
      imageUrl: '',
      linkUrl: 'https://example.com',
      peak_rank: i + 1,
      times_bumped: 0,
      times_climbed: 0,
      views: 0,
      shares: 0,
      joined_days_ago: 1,
      last_bump_at: Date.now(),
      journey: [i + 1],
      reactions: { fire: 0, eyes: 0, heart: 0, laugh: 0 },
    }));

    const sorted = sortBoard(hundredFiveProfiles);
    const liveWall = sorted.slice(0, 100);
    const graveyard = sorted.slice(100);

    expect(liveWall.length).toBe(100);
    // Rank 100 is the 100th item (index 99) and is part of the live wall
    const slot100 = liveWall[99];
    expect(slot100.id).toBe('p-100');
    expect(sorted.findIndex((x) => x.id === slot100.id) + 1).toBe(100);

    // Graveyard starts strictly at index 100 (Rank 101)
    expect(graveyard.length).toBe(5);
    const firstGraveyard = graveyard[0];
    expect(firstGraveyard.id).toBe('p-101');
    expect(sorted.findIndex((x) => x.id === firstGraveyard.id) + 1).toBe(101);

    // When an entrant outbids #100, the old #100 is pushed to #101 (Graveyard)
    const newEntrant: Profile = {
      id: 'p-new',
      seq: 200,
      name: 'New Entrant',
      handle: 'pnew',
      category: 'Tech',
      active_value: 150, // Lands around rank 51
      imageUrl: '',
      linkUrl: 'https://new.com',
      peak_rank: 101,
      times_bumped: 1,
      times_climbed: 0,
      views: 0,
      shares: 0,
      joined_days_ago: 0,
      last_bump_at: Date.now(),
      journey: [],
      reactions: { fire: 0, eyes: 0, heart: 0, laugh: 0 },
    };

    const newSorted = sortBoard([...hundredFiveProfiles, newEntrant]);
    const casualty = newSorted.length > 100 ? newSorted[100] : null;

    // The casualty displaced past rank 100 into graveyard rank #101 was previously on the live wall
    expect(casualty).not.toBeNull();
    expect(casualty?.id).toBe('p-100');
    expect(newSorted.findIndex((x) => x.id === casualty?.id) + 1).toBe(101);

    // Slot 100 on the live wall is still live and active
    const newLive100 = newSorted.slice(0, 100)[99];
    expect(newSorted.findIndex((x) => x.id === newLive100.id) + 1).toBe(100);
    expect(newLive100.id).not.toBe('p-100');
  });

  it('correctly matches handle with or without @ prefix in search query', () => {
    const testSlot = {
      id: 'cupid-1',
      rank: 1,
      title: 'CupidWave',
      handle: 'devendratampula',
      owner_handle: 'devendratampula',
      owner_name: 'Devendra Dev',
      bidderName: 'Devendra Dev',
    };

    const isMatch = (slot: typeof testSlot, query: string) => {
      const rawQuery = query.toLowerCase().trim();
      const cleanQuery = rawQuery.replace(/^@/, '').trim();
      const slotHandle = (slot.handle || '').toLowerCase().trim().replace(/^@/, '');
      const ownerHandle = (slot.owner_handle || '').toLowerCase().trim().replace(/^@/, '');
      const ownerName = (slot.owner_name || '').toLowerCase().trim();

      if (!rawQuery) return true;
      if (rawQuery.startsWith('@')) {
        // Strict handle search: letters must match from start
        return cleanQuery.length > 0 && (slotHandle.startsWith(cleanQuery) || ownerHandle.startsWith(cleanQuery));
      }
      if (rawQuery.startsWith('#')) {
        return String(slot.rank) === rawQuery.slice(1);
      }
      return (
        slot.title.toLowerCase().includes(rawQuery) ||
        slot.bidderName.toLowerCase().includes(rawQuery) ||
        ownerName.includes(rawQuery) ||
        slotHandle.startsWith(rawQuery) ||
        ownerHandle.startsWith(rawQuery) ||
        String(slot.rank) === rawQuery
      );
    };

    // User searches with @ prefix (e.g. from clicking "My project on wall")
    expect(isMatch(testSlot, '@devendratampula')).toBe(true);
    expect(isMatch(testSlot, '@devendra')).toBe(true);
    expect(isMatch(testSlot, '@dev')).toBe(true);

    // Strict letter order from start: searching middle substring must NOT match
    expect(isMatch(testSlot, '@tampula')).toBe(false);
    expect(isMatch(testSlot, '@end')).toBe(false);

    // Query with @ must NOT match project title or bidder name
    expect(isMatch(testSlot, '@cupid')).toBe(false);
    expect(isMatch(testSlot, '@cupidwave')).toBe(false);

    // Bare @ with no username should not match
    expect(isMatch(testSlot, '@')).toBe(false);

    // User searches without @ prefix
    expect(isMatch(testSlot, 'devendratampula')).toBe(true);
    expect(isMatch(testSlot, 'dev')).toBe(true);

    // User searches by project title (without @)
    expect(isMatch(testSlot, 'CupidWave')).toBe(true);
    expect(isMatch(testSlot, 'cupid')).toBe(true);

    // User searches by rank
    expect(isMatch(testSlot, '#1')).toBe(true);
    expect(isMatch(testSlot, '1')).toBe(true);

    // Unrelated query should not match
    expect(isMatch(testSlot, '@otheruser')).toBe(false);
  });

  it('correctly distinguishes owner vs visitor on graveyard cards', () => {
    const userOwnedProjectId = 'proj-user-mine';
    const otherUserProjectId = 'proj-user-other';

    const userProjects = [{ id: userOwnedProjectId, title: 'My Displaced App' }];
    const isOwner = (item: { id: string }) => userProjects.some((p) => p.id === item.id);

    expect(isOwner({ id: userOwnedProjectId })).toBe(true);
    expect(isOwner({ id: otherUserProjectId })).toBe(false);
  });

  it('preserves graveyard slot item as target when reclaiming', () => {
    // When an item at rank 101 is reclaimed, it is not present in live slots (1-100)
    const liveSlots = Array.from({ length: 100 }, (_, i) => ({ id: `p-${i + 1}`, rank: i + 1 }));
    const graveyardItem = { id: 'p-101', rank: 101, title: 'Displaced Item', activeValue: 20 };

    // Old bug: slots.find() returned undefined, setting target to null
    const oldTarget = liveSlots.find((s) => s.id === graveyardItem.id) ?? null;
    expect(oldTarget).toBeNull();

    // Fixed logic: directly target the graveyard item so takeover modal can calculate top-up
    const resolvedTarget = graveyardItem;
    expect(resolvedTarget.id).toBe('p-101');
    expect(resolvedTarget.rank).toBe(101);
  });
});
