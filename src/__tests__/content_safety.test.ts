import { describe, it, expect, vi } from 'vitest';

// Mirrors api_abuse.test.ts mock layout (route modules import these).
vi.mock('../lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { safeExternalUrl } from '../lib/urls';
import { stripControlChars } from '../lib/textSanitize';
import { readImageDimensions } from '../lib/imageDimensions';
import { messageSchema, ReportSchema } from '../lib/contentSchemas';

// ---------------------------------------------------------------------------
// safeExternalUrl — read-time guard on destination_url (SEC-001, Phase 4)
// ---------------------------------------------------------------------------
describe('safeExternalUrl', () => {
  it('accepts absolute https URLs', () => {
    expect(safeExternalUrl('https://example.com')).toBe('https://example.com/');
    expect(safeExternalUrl('https://example.com/path?q=1#f')).toBe(
      'https://example.com/path?q=1#f'
    );
    expect(safeExternalUrl('HTTPS://EXAMPLE.COM')).toBe('https://example.com/');
  });

  it('rejects every non-https scheme', () => {
    expect(safeExternalUrl('http://example.com')).toBe('');
    expect(safeExternalUrl('javascript:alert(1)')).toBe('');
    expect(safeExternalUrl('JaVaScRiPt:alert(1)')).toBe('');
    expect(safeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeExternalUrl('vbscript:msgbox(1)')).toBe('');
    expect(safeExternalUrl('file:///etc/passwd')).toBe('');
  });

  it('rejects relative references and garbage', () => {
    expect(safeExternalUrl('/path')).toBe('');
    expect(safeExternalUrl('//evil.com')).toBe('');
    // WHATWG URL normalizes `https:/\evil.com` to a plain https URL — which
    // is acceptable; the point is it can never become a script scheme.
    expect(safeExternalUrl('https:/\\evil.com')).toBe('https://evil.com/');
    expect(safeExternalUrl('not a url')).toBe('');
    expect(safeExternalUrl('')).toBe('');
  });

  it('rejects non-string values', () => {
    expect(safeExternalUrl(123)).toBe('');
    expect(safeExternalUrl(null)).toBe('');
    expect(safeExternalUrl(undefined)).toBe('');
    expect(safeExternalUrl({ href: 'https://x.com' })).toBe('');
  });
});

// ---------------------------------------------------------------------------
// stripControlChars — chat/report input hygiene (Phase 4)
// ---------------------------------------------------------------------------
describe('stripControlChars', () => {
  it('strips C0 control characters except tab/newline', () => {
    expect(stripControlChars('a\u0000b\u0007c\u007Fd')).toBe('abcd');
    expect(stripControlChars('\u001b[31mred\u001b[0m')).toBe('[31mred[0m');
    expect(stripControlChars('keep\tthis\nand\nthat')).toBe('keep\tthis\nand\nthat');
    expect(stripControlChars('a\u000Db')).toBe('ab'); // CR removed
  });

  it('strips invisible/bidi-format characters (Trojan Source)', () => {
    expect(stripControlChars('\u202Eevil')).toBe('evil');
    expect(stripControlChars('a\u200Bb')).toBe('ab');
    expect(stripControlChars('\uFEFFx')).toBe('x');
    expect(stripControlChars('a\u2066b\u2069c')).toBe('abc');
  });

  it('keeps normal text, emoji and CJK', () => {
    expect(stripControlChars('hello world 🚀 日本語')).toBe('hello world 🚀 日本語');
  });

  it('is idempotent', () => {
    const dirty = 'a\u0000b\u202Ec\u001b[0m';
    const once = stripControlChars(dirty);
    expect(stripControlChars(once)).toBe(once);
  });
});

// ---------------------------------------------------------------------------
// readImageDimensions — header-only dimension bounds (upload fallback)
// ---------------------------------------------------------------------------
function pngHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

function jpegHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(16);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  b[3] = 0xc0; // SOF0
  b.writeUInt16BE(17, 4);
  b[6] = 8; // precision
  b.writeUInt16BE(height, 7);
  b.writeUInt16BE(width, 9);
  return b;
}

function webpVp8x(width: number, height: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.write('WEBP', 8, 'ascii');
  b.write('VP8X', 12, 'ascii');
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b;
}

function webpVp8(width: number, height: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.write('WEBP', 8, 'ascii');
  b.write('VP8 ', 12, 'ascii');
  b.writeUInt32LE(20, 16);
  b[23] = 0x9d;
  b[24] = 0x01;
  b[25] = 0x2a;
  b.writeUInt16LE(width, 26);
  b.writeUInt16LE(height, 28);
  return b;
}

function webpVp8l(width: number, height: number): Buffer {
  const b = Buffer.alloc(25);
  b.write('RIFF', 0, 'ascii');
  b.write('WEBP', 8, 'ascii');
  b.write('VP8L', 12, 'ascii');
  b.writeUInt32LE(10, 16);
  b[20] = 0x2f;
  b.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return b;
}

describe('readImageDimensions', () => {
  it('reads PNG dimensions', () => {
    expect(readImageDimensions(pngHeader(500, 500))).toEqual({ width: 500, height: 500 });
  });

  it('reads PNG dimensions from a decompression-bomb header (route rejects)', () => {
    expect(readImageDimensions(pngHeader(60000, 60000))).toEqual({
      width: 60000,
      height: 60000,
    });
  });

  it('reads JPEG SOF0 dimensions', () => {
    expect(readImageDimensions(jpegHeader(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it('reads all three WebP chunk layouts', () => {
    expect(readImageDimensions(webpVp8x(800, 600))).toEqual({ width: 800, height: 600 });
    expect(readImageDimensions(webpVp8(320, 240))).toEqual({ width: 320, height: 240 });
    expect(readImageDimensions(webpVp8l(100, 100))).toEqual({ width: 100, height: 100 });
  });

  it('returns null for malformed or unsupported input', () => {
    expect(readImageDimensions(Buffer.alloc(4))).toBeNull();
    expect(readImageDimensions(pngHeader(10, 10).subarray(0, 20))).toBeNull(); // truncated
    expect(readImageDimensions(Buffer.from('GIF89a......', 'ascii'))).toBeNull();
    expect(readImageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x00, 0x00]))).toBeNull(); // no SOF
    expect(readImageDimensions(Buffer.alloc(64))).toBeNull(); // zeros
    expect(readImageDimensions(42 as unknown as Buffer)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// messageSchema — malicious chat input (Phase 4)
// ---------------------------------------------------------------------------
describe('messageSchema (war room chat)', () => {
  it('strips escape/null sequences before storing', () => {
    const parsed = messageSchema.safeParse({ text: '\u001b[31mHello\u0000' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.text).toBe('[31mHello');
  });

  it('strips bidi overrides', () => {
    const parsed = messageSchema.safeParse({ text: '\u202EgnihtemS' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.text).toBe('gnihtemS');
  });

  it('rejects control-only messages after stripping (empty)', () => {
    expect(messageSchema.safeParse({ text: '\u0000\u0001\u0007' }).success).toBe(false);
    expect(messageSchema.safeParse({ text: '   ' }).success).toBe(false);
  });

  it('validates length on the cleaned value', () => {
    // 190 real chars + 50 control chars: cleans to 190, passes.
    const inflated = 'a'.repeat(190) + '\u0000'.repeat(50);
    const parsed = messageSchema.safeParse({ text: inflated });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.text).toHaveLength(190);

    expect(messageSchema.safeParse({ text: 'a'.repeat(201) }).success).toBe(false);
    expect(messageSchema.safeParse({ text: 'a'.repeat(200) }).success).toBe(true);
  });

  it('keeps slotTag within 1..100 integer bounds', () => {
    expect(messageSchema.safeParse({ text: 'hi', slotTag: 1 }).success).toBe(true);
    expect(messageSchema.safeParse({ text: 'hi', slotTag: 100 }).success).toBe(true);
    expect(messageSchema.safeParse({ text: 'hi', slotTag: 0 }).success).toBe(false);
    expect(messageSchema.safeParse({ text: 'hi', slotTag: 101 }).success).toBe(false);
    expect(messageSchema.safeParse({ text: 'hi', slotTag: 1.5 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ReportSchema — malicious report input (Phase 4)
// ---------------------------------------------------------------------------
describe('ReportSchema (abuse reports)', () => {
  const base = { projectId: '00000000-0000-0000-0000-000000000000', reason: 'spam' as const };

  it('strips control characters before length validation', () => {
    const parsed = ReportSchema.safeParse({ ...base, details: 'a'.repeat(10) + '\u0000\u0001' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.details).toBe('a'.repeat(10));
  });

  it('rejects details that fall below 10 chars after stripping', () => {
    expect(ReportSchema.safeParse({ ...base, details: 'short\u0000\u0001' }).success).toBe(false);
  });

  it('enforces the 500-char cap', () => {
    expect(ReportSchema.safeParse({ ...base, details: 'a'.repeat(500) }).success).toBe(true);
    expect(ReportSchema.safeParse({ ...base, details: 'a'.repeat(501) }).success).toBe(false);
  });

  it('rejects unknown reasons and missing targets', () => {
    expect(
      ReportSchema.safeParse({ ...base, reason: 'hack' as never, details: 'a'.repeat(10) }).success
    ).toBe(false);
    expect(
      ReportSchema.safeParse({ reason: 'spam', details: 'a'.repeat(10) }).success
    ).toBe(false);
  });
});
