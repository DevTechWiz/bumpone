import { securityLog } from './securityLogger';

type Entry = { count: number; resetAt: number };

/**
 * Distributed + Process-Local Rate Limiter (SEC-007, Phase 8)
 *
 * Architecture:
 * 1. Cloudflare WAF Layer (Edge / Zone):
 *    Enforces the distributed per-IP flood ceiling before requests reach Workers.
 *    Configured declaratively in `cloudflare/waf-rulesets.json`.
 *
 * 2. Distributed Store Layer (Optional / Upstash Redis REST):
 *    When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set,
 *    `allowRequestDistributed` provides an atomic cross-isolate sliding window.
 *
 * 3. Process-Local Isolate Cache Layer (Fail-Safe Fallback):
 *    If no distributed store is configured or during network timeouts,
 *    falls back to the bounded in-memory sliding window limiter.
 *
 * All rate limit breaches emit structured security logs.
 */

const windows = new Map<string, Entry>();

export const MAX_RATE_LIMIT_KEYS = 10_000;

function sweep(now: number): void {
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key);
  }
  if (windows.size < MAX_RATE_LIMIT_KEYS) return;
  // Still at/over cap with all-live windows: evict oldest-inserted keys
  // (Map preserves insertion order) down to half the cap.
  const target = MAX_RATE_LIMIT_KEYS / 2;
  for (const key of windows.keys()) {
    if (windows.size <= target) break;
    windows.delete(key);
  }
}

export function allowRequest(key: string, max: number, windowMs: number): boolean {
  if (process.env.NODE_ENV === 'development') return true;

  const now = Date.now();
  if (windows.size >= MAX_RATE_LIMIT_KEYS) sweep(now);

  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) {
    securityLog.rateLimit('process_rate_limit_exceeded', key, undefined, max, windowMs);
    return false;
  }
  entry.count += 1;
  return true;
}

/**
 * Asynchronous distributed rate-limiting check.
 * Queries Upstash Redis REST if configured; gracefully falls back to local window on error or unset.
 */
export async function allowRequestDistributed(
  key: string,
  max: number,
  windowMs: number
): Promise<boolean> {
  if (process.env.NODE_ENV === 'development') return true;

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    try {
      const redisKey = `ratelimit:${key}`;
      const res = await fetch(`${redisUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['PEXPIRE', redisKey, windowMs, 'NX'],
        ]),
        // 1.5s timeout so edge requests are never hung
        signal: AbortSignal.timeout(1500),
      });

      if (res.ok) {
        const data = (await res.json()) as Array<{ result?: number }>;
        const currentCount = Number(data[0]?.result || 0);
        if (currentCount > max) {
          securityLog.rateLimit('distributed_rate_limit_exceeded', key, undefined, max, windowMs);
          return false;
        }
        return true;
      }
    } catch {
      // Network timeout or Redis outage: fail-safe fallback to local isolate window
    }
  }

  return allowRequest(key, max, windowMs);
}

/** Test helper: clear all windows (module state persists across tests in a file). */
export function resetRateLimits(): void {
  windows.clear();
}

/** Current key count — used by tests to assert bounded growth. */
export function rateLimitKeyCount(): number {
  return windows.size;
}
