/**
 * Strips characters that should never reach storage from user-provided text:
 * C0 control characters (except tab/newline), DEL, and the Unicode
 * invisible/bidi-format range (zero-width, bidi override, BOM) that enables
 * text-spoofing ("Trojan Source") in rendered chat/report content.
 * Rendering is still escaped by React — this is defense in depth.
 */
export function stripControlChars(value: string): string {
  return value.replace(
    /[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,
    ''
  );
}

/**
 * Sanitizes plain text input by stripping control chars, trimming whitespace,
 * and limiting length.
 */
export function sanitizePlainText(value: string, maxLength?: number): string {
  if (typeof value !== 'string') return '';
  const cleaned = stripControlChars(value).trim();
  return maxLength && maxLength > 0 ? cleaned.slice(0, maxLength) : cleaned;
}

