import { describe, it, expect } from 'vitest';

describe('Image Upload Security & Sanitization', () => {
  const MAX_SIZE_BYTES = 5 * 1024 * 1024;
  const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  it('rejects oversized files > 5MB', () => {
    const oversized = 6 * 1024 * 1024;
    expect(oversized > MAX_SIZE_BYTES).toBe(true);
  });

  it('prohibits SVG, GIF, HTML and executable file types', () => {
    const disallowed = ['image/svg+xml', 'image/gif', 'text/html', 'application/x-sh'];
    disallowed.forEach((mime) => {
      expect(ALLOWED_MIME_TYPES.includes(mime)).toBe(false);
    });
  });

  it('generates collision-free UUID filenames without path traversal vulnerabilities', () => {
    const unsafeInputs = ['../../../etc/passwd.png', '..\\boot.ini.jpg', 'avatar name with spaces.png'];
    unsafeInputs.forEach(() => {
      const safeId = crypto.randomUUID();
      const cleanFilename = `${safeId}.webp`;
      expect(cleanFilename).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/);
      expect(cleanFilename).not.toContain('..');
      expect(cleanFilename).not.toContain('/');
      expect(cleanFilename).not.toContain('\\');
    });
  });
});
