import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const getUserMock = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: getUserMock,
    },
  })),
}));

import { middleware, config, buildContentSecurityPolicy, applySecurityHeaders } from '../middleware';

function makeRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubConfigured() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
}

describe('middleware admin gating (SEC-017)', () => {
  it('fails closed: /api/admin returns 401 when Supabase is unconfigured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const res = await middleware(makeRequest('/api/admin/overview'));
    expect(res.status).toBe(401);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('fails closed: /admin redirects to / when Supabase is unconfigured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'placeholder-key');
    const res = await middleware(makeRequest('/admin'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('returns 401 for /api/admin without a session (configured)', async () => {
    stubConfigured();
    const res = await middleware(makeRequest('/api/admin/emergency'));
    expect(res.status).toBe(401);
  });

  it('redirects /admin without a session (configured)', async () => {
    stubConfigured();
    const res = await middleware(makeRequest('/admin/users'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('allows /api/admin and /admin through with a session', async () => {
    stubConfigured();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const apiRes = await middleware(makeRequest('/api/admin/overview'));
    expect(apiRes.status).toBe(200);
    expect(apiRes.headers.get('x-middleware-next')).toBe('1');

    const pageRes = await middleware(makeRequest('/admin'));
    expect(pageRes.status).toBe(200);
  });

  it('does not gate non-admin paths (anonymous browsing unaffected)', async () => {
    stubConfigured();
    const res = await middleware(makeRequest('/api/board'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('keeps normal pages working when Supabase is unconfigured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const res = await middleware(makeRequest('/'));
    expect(res.status).toBe(200);
  });

  it('exposes a matcher that includes /admin and /api/admin', () => {
    expect(config.matcher.length).toBeGreaterThan(0);
    // The matcher is a broad allowlist with explicit static exclusions;
    // admin paths must NOT be excluded (regex negative lookahead targets only assets).
    expect(config.matcher[0]).toContain('_next/static');
    expect(config.matcher[0]).not.toContain('admin');
  });
});

describe('Content Security Policy & Security Headers (SEC-011, SEC-013)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds hardened production CSP without unsafe-eval', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://prod.supabase.co');

    const csp = buildContentSecurityPolicy();
    expect(csp).toBeTruthy();

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://accounts.google.com");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-src 'self' https://accounts.google.com");
    expect(csp).not.toContain("frame-src 'none'");
    expect(csp).toContain("media-src 'self' data: blob:");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('skips CSP in non-production environments to allow rapid dev iterations', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(buildContentSecurityPolicy()).toBeNull();
  });

  it('attaches nosniff, DENY, and permissions policy security headers', () => {
    const res = NextResponse.next();
    const withHeaders = applySecurityHeaders(res, "default-src 'self'");

    expect(withHeaders.headers.get('Content-Security-Policy')).toBe("default-src 'self'");
    expect(withHeaders.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(withHeaders.headers.get('X-Frame-Options')).toBe('DENY');
    expect(withHeaders.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(withHeaders.headers.get('Permissions-Policy')).toContain('camera=()');
  });

  it('writes session cookies through the real setAll path with secure/lax/path defaults', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    stubConfigured();

    // Drive the actual cookie transformer middleware passes to createServerClient:
    // capture the options, then trigger setAll mid-request like a token refresh.
    getUserMock.mockImplementationOnce(async () => {
      const options = vi.mocked(createServerClient).mock.calls[0][2] as any;
      options.cookies.setAll([
        { name: 'sb-test-auth-token', value: 'token-abc', options: { maxAge: 3600 } },
      ]);
      return { data: { user: null }, error: { message: 'no session' } };
    });

    const res = await middleware(makeRequest('/'));
    expect(res).toBeTruthy();

    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toContain('sb-test-auth-token=token-abc');
    expect(setCookie).toContain('SameSite=lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('Max-Age=3600');
  });
});
