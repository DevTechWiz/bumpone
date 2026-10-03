type Entry = { count: number; resetAt: number };
const windows = new Map<string, Entry>();

/** Process-local limiter. Deploy behind Cloudflare/WAF; replace with Redis before multi-region scaling. */
export function allowRequest(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}
