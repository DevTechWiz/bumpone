import { NextRequest, NextResponse } from 'next/server';

/**
 * Phase 3 (SEC-008/SEC-021): cheap request guards that run BEFORE any
 * database or external-API work.
 */

/**
 * Best-effort client IP for rate-limit keys and report fingerprints.
 * Prefers `CF-Connecting-IP` (set by Cloudflare, not client-spoofable at the
 * Worker) and only falls back to the first `x-forwarded-for` hop when the
 * request did not pass through Cloudflare (e.g. direct Worker invocation).
 */
export function clientIp(request: NextRequest): string {
  const cf = request.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}

export type JsonReadResult =
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse };

function reject(status: number, error: string): JsonReadResult {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

/**
 * Read a JSON body with a hard byte cap (SEC-008).
 *
 * - Rejects on the declared `content-length` before reading anything.
 * - Also caps the actual stream so chunked/absent `content-length` cannot
 *   buffer unbounded data (Cloudflare's edge body limit remains the outer
 *   backstop for oversized uploads).
 * - Enforces a JSON content type when one is declared.
 * - Malformed JSON yields 400 (not an unhandled 500).
 */
export async function readJsonWithLimit(
  request: NextRequest,
  maxBytes: number
): Promise<JsonReadResult> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return reject(413, 'Request body too large');
  }

  const contentType = request.headers.get('content-type');
  if (contentType && !contentType.toLowerCase().includes('application/json')) {
    return reject(415, 'Unsupported media type');
  }

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            /* stream already errored */
          }
          return reject(413, 'Request body too large');
        }
        chunks.push(value);
      }
    }
  }

  const text = new TextDecoder().decode(concat(chunks, total));
  if (!text) return reject(400, 'Invalid JSON body');
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return reject(400, 'Invalid JSON body');
  }
}

/**
 * Declared-size pre-check for non-JSON bodies (multipart uploads). Browsers
 * always send `content-length` for multipart; a chunked multipart request
 * without it falls through to the in-route part-size checks (documented
 * residual: Cloudflare edge limits the total body size platform-side).
 */
export function bodyTooLarge(request: NextRequest, maxBytes: number): boolean {
  const declared = Number(request.headers.get('content-length'));
  return Number.isFinite(declared) && declared > maxBytes;
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 0) return new Uint8Array(0);
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Shared response header for user-specific JSON (never cache into a shared cache). */
export const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

/**
 * Correlation id for 500 responses (contract 24: "Unexpected server failure:
 * 500, with a request ID but no sensitive detail"). The id is echoed to the
 * client and printed with the server-side log line so support can correlate.
 */
export function newRequestId(): string {
  return crypto.randomUUID();
}
