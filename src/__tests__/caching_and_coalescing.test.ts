import { describe, it, expect, beforeEach } from 'vitest';
import {
  boardMemoryCache,
  getInFlightFetch,
  setInFlightFetch,
  clearInFlightFetch,
  invalidateBoardCache,
  CACHE_TTL_MS,
  type BoardCacheEntry,
} from '../lib/boardCache';

describe('Server Board Cache & Thundering Herd Coalescing', () => {
  beforeEach(() => {
    invalidateBoardCache();
  });

  it('stores and retrieves cache entries with ETags', () => {
    const entry: BoardCacheEntry = {
      rawJson: JSON.stringify({ profiles: [], total: 0 }),
      data: { profiles: [], total: 0 },
      timestamp: Date.now(),
      etag: 'W/"100-test-etag"',
    };

    boardMemoryCache.set('power:All:120', entry);
    const retrieved = boardMemoryCache.get('power:All:120');

    expect(retrieved).toBeDefined();
    expect(retrieved?.etag).toBe('W/"100-test-etag"');
    expect(Date.now() - retrieved!.timestamp).toBeLessThan(CACHE_TTL_MS);
  });

  it('coalesces concurrent in-flight fetches to prevent database stampede', async () => {
    let executionCount = 0;

    const mockFetch = async () => {
      executionCount++;
      return {
        rawJson: '{"profiles":[]}',
        data: { profiles: [] },
        timestamp: Date.now(),
        etag: 'W/"coalesced-etag"',
      };
    };

    // First request initiates the fetch
    const p1 = mockFetch();
    setInFlightFetch('key-1', p1);

    // Concurrent request checks in-flight map
    const inFlight = getInFlightFetch('key-1');
    expect(inFlight).toBeDefined();

    // Both await the same promise
    const [res1, res2] = await Promise.all([p1, inFlight!]);

    expect(executionCount).toBe(1); // Exactly 1 database query executed!
    expect(res1.etag).toBe('W/"coalesced-etag"');
    expect(res2.etag).toBe('W/"coalesced-etag"');

    clearInFlightFetch('key-1');
    expect(getInFlightFetch('key-1')).toBeUndefined();
  });

  it('invalidates cache completely on mutation events', () => {
    boardMemoryCache.set('key-a', {
      rawJson: '{}',
      data: {},
      timestamp: Date.now(),
      etag: 'W/"a"',
    });

    invalidateBoardCache();
    expect(boardMemoryCache.size).toBe(0);
    expect(getInFlightFetch('key-a')).toBeUndefined();
  });
});
