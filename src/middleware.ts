import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Hardened Content-Security-Policy & Browser Security Headers (SEC-011, SEC-013, Phase 8)
 *
 * Policy invariants:
 * - default-src 'self': restricts subresources to the same origin by default.
 * - script-src 'self' 'unsafe-inline' https://accounts.google.com:
 *   Constrained to same origin, Next.js prerendered build-time bootstrap scripts,
 *   and Google Identity Services. No 'unsafe-eval', no wildcards.
 * - frame-src 'self' https://accounts.google.com: allows Google One Tap iframe, blocks framing of arbitrary origins.
 * - media-src 'self' data: blob:: allows Web Audio API and sound effects.
 * - connect-src: same origin + verified Supabase URL & wss websockets + Google Identity.
 * - frame-ancestors 'none': clickjacking defense.
 * - object-src 'none', base-uri 'self', form-action 'self'.
 */
export function buildContentSecurityPolicy(): string | null {
  if (process.env.NODE_ENV !== 'production') return null;

  const connectSources = ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co', 'https://accounts.google.com'];
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      const origin = new URL(supabaseUrl).origin;
      if (!connectSources.includes(origin)) connectSources.push(origin);
    }
  } catch {
    /* placeholder URL: the *.supabase.co entries already cover the default */
  }

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://accounts.google.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "media-src 'self' data: blob:",
    `connect-src ${connectSources.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function applySecurityHeaders(res: NextResponse, csp: string | null): NextResponse {
  if (csp) {
    res.headers.set('Content-Security-Policy', csp);
  }
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=()');
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  return res;
}

export async function middleware(request: NextRequest) {
  const csp = buildContentSecurityPolicy();

  let supabaseResponse = NextResponse.next({
    request,
  });

  const withHeaders = (res: NextResponse): NextResponse => applySecurityHeaders(res, csp);

  const { pathname } = request.nextUrl;

  // SEO & crawler endpoints bypass: avoid Supabase auth overhead on search engine crawls
  if (pathname === '/sitemap.xml' || pathname === '/robots.txt') {
    return withHeaders(supabaseResponse);
  }

  const isAdminApi = pathname === '/api/admin' || pathname.startsWith('/api/admin/');
  const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isConfigured = Boolean(
    supabaseUrl && supabaseAnonKey &&
    !supabaseUrl.includes('placeholder') && !supabaseUrl.includes('your-project')
  );

  // SEC-017: admin endpoints fail closed when Supabase is unconfigured.
  if (!isConfigured) {
    if (isAdminApi) {
      return withHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
      );
    }
    if (isAdminPage) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return withHeaders(supabaseResponse);
  }

  let user: { id: string } | null = null;

  try {
    const supabase = createServerClient(supabaseUrl!, supabaseAnonKey!, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
              path: '/',
            })
          );
        },
      },
    });

    // Refresh auth token if expired and resolve the session user
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      user = { id: data.user.id };
    }
  } catch (error) {
    // Session resolution failed: stay unauthenticated (admin paths below fail closed)
    console.error('Middleware session refresh error:', error);
  }

  if ((isAdminApi || isAdminPage) && !user) {
    if (isAdminApi) {
      return withHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
      );
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  return withHeaders(supabaseResponse);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (Next.js assets)
     * - favicon.ico, sitemap.xml, robots.txt (crawler & metadata files)
     * - static image/media files (.svg, .png, .jpg, .webp, etc.)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
