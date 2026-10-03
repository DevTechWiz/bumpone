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
