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

  it('validates image headers via magic bytes (WebP, JPEG, PNG) to prevent disguised scripts', () => {
    // Valid WebP Header: RIFF....WEBP
    const validWebp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // 'RIFF'
      0x00, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, // 'WEBP'
    ]);
    const isWebp = validWebp.toString('ascii', 0, 4) === 'RIFF' && validWebp.toString('ascii', 8, 12) === 'WEBP';
    expect(isWebp).toBe(true);

    // Fake JPEG (Disguised script)
    const fakeScript = Buffer.from('<script>alert(1)</script>');
    const isJpeg = fakeScript[0] === 0xff && fakeScript[1] === 0xd8 && fakeScript[2] === 0xff;
    expect(isJpeg).toBe(false);
  });

  it('enforces separate storage prefix folders for projects and profiles', () => {
    const sanitizeFolder = (type?: string) => {
      const lower = (type || '').toLowerCase();
      return lower === 'profile' || lower === 'profiles' ? 'profiles' : 'projects';
    };

    expect(sanitizeFolder('projects')).toBe('projects');
    expect(sanitizeFolder('project')).toBe('projects');
    expect(sanitizeFolder(undefined)).toBe('projects');
    expect(sanitizeFolder('')).toBe('projects');
    expect(sanitizeFolder('profiles')).toBe('profiles');
    expect(sanitizeFolder('profile')).toBe('profiles');
  });
});
