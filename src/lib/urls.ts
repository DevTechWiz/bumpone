/**
 * URL normalization utility for BumpOne.
 * Ensures entered links are trimmed and cleanly prefixed with https://.
 */
export function normalizeUrl(input: string): string {
  let val = input.trim();
  if (!val) return '';
  if (/^http:\/\//i.test(val)) {
    val = val.replace(/^http:\/\//i, 'https://');
  } else if (!/^https:\/\//i.test(val)) {
    val = `https://${val}`;
  }
  return val;
}

/**
 * Read-time URL guard (SEC-001, Phase 4): accepts only absolute https URLs.
 * Applied wherever destination_url leaves the database, so a row that ever
 * bypassed the write-path CHECK (legacy data, manual edits) can still never
 * surface as `javascript:`, `data:`, `http:` or a relative reference.
 * Returns '' for anything not accepted; callers already treat '' as "no link".
 */
export function safeExternalUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}
