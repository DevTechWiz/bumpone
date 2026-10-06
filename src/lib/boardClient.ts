'use client';

import { type Profile } from './board';
import { sessionGetJSON, sessionSetJSON } from './storage';

export interface BoardClientResponse {
  profiles: Profile[];
  total: number;
  sort?: string;
  category?: string;
  purchasesPaused?: boolean;
}

interface ClientCacheEntry {
  data: BoardClientResponse;
  timestamp: number;
  etag?: string;
}

// Client-side in-memory cache (survives component remounts within the tab session)
const clientCache = new Map<string, ClientCacheEntry>();

// In-flight request deduplicator: multiple components requesting the same params share 1 network call
const inFlightRequests = new Map<string, Promise<BoardClientResponse>>();

// 10-second client cache TTL (zero network requests during rapid tab/filter interactions)
const CLIENT_CACHE_TTL_MS = 10000;
const SESSION_CACHE_KEY = 'bumped_board_cache';

export function isDocumentVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

export function invalidateClientBoardCache() {
  clientCache.clear();
  inFlightRequests.clear();
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(SESSION_CACHE_KEY);
    } catch {}
  }
}

export async function fetchBoardClient(options?: {
  sort?: string;
  category?: string;
  limit?: number;
  forceFresh?: boolean;
}): Promise<BoardClientResponse> {
  const sort = options?.sort || 'power';
  const category = options?.category || 'All';
  const limit = options?.limit || 120;
  const forceFresh = Boolean(options?.forceFresh);

  const cacheKey = `${sort}:${category}:${limit}`;
  const now = Date.now();

  // 1. Check in-memory client cache
  const cached = clientCache.get(cacheKey);
  if (!forceFresh && cached && now - cached.timestamp < CLIENT_CACHE_TTL_MS) {
    return cached.data;
  }

  // 2. Check sessionStorage fallback (instant 0ms hydration for cold component mounts)
  if (!forceFresh && !cached && typeof window !== 'undefined' && category === 'All' && sort === 'power') {
    const sessionData = sessionGetJSON<Profile[]>(SESSION_CACHE_KEY);
    if (sessionData && Array.isArray(sessionData) && sessionData.length > 0) {
      const response: BoardClientResponse = {
        profiles: sessionData,
        total: sessionData.length,
        sort,
        category,
        purchasesPaused: false,
      };
      clientCache.set(cacheKey, { data: response, timestamp: now - (CLIENT_CACHE_TTL_MS / 2) });
      return response;
    }
  }

  // 3. Check in-flight promise deduplication: join existing request if already querying
  const existingPromise = inFlightRequests.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  // 4. Construct URL with query parameters
  const queryParams = new URLSearchParams();
  queryParams.set('limit', String(limit));
  if (sort && sort !== 'power') queryParams.set('sort', sort);
  if (category && category !== 'All') queryParams.set('category', category);

  const requestUrl = `/api/board?${queryParams.toString()}`;
  const requestHeaders: Record<string, string> = {};
  if (cached?.etag) {
    requestHeaders['If-None-Match'] = cached.etag;
  }

  const networkPromise = (async () => {
    try {
      const res = await fetch(requestUrl, {
        headers: requestHeaders,
        cache: 'no-cache', // Bypass browser local cache to let our ETag logic handle it
      });

      // 304 Not Modified: reuse existing cached payload without re-downloading bytes
      if (res.status === 304 && cached) {
        cached.timestamp = Date.now();
        return cached.data;
      }

      if (res.ok) {
        const data: BoardClientResponse = await res.json();
        const etag = res.headers.get('ETag') || undefined;

        if (data && Array.isArray(data.profiles)) {
          const entry: ClientCacheEntry = {
            data,
            timestamp: Date.now(),
            etag,
          };
          clientCache.set(cacheKey, entry);

          // Mirror top default board to sessionStorage
          if (category === 'All' && sort === 'power' && typeof window !== 'undefined') {
            try {
              sessionSetJSON(SESSION_CACHE_KEY, data.profiles);
            } catch {}
          }
          return data;
        }
      }

      // Fallback to stale cache if request failed
      if (cached) return cached.data;
      return { profiles: [], total: 0, sort, category, purchasesPaused: false };
    } catch (err) {
      if (cached) return cached.data;
      throw err;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, networkPromise);
  return networkPromise;
}
