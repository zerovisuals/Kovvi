import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/server/auth/session';

/**
 * Next 16 renamed `middleware` to `proxy`. It runs on the Node runtime and
 * cannot be configured to run on the edge.
 *
 * This does ONE thing: send a visitor with no session cookie to sign-in before
 * rendering an app route, and send a signed-in visitor away from the auth
 * pages. It is a convenience, not a security boundary.
 *
 * Authorization deliberately lives elsewhere — in `server/auth/guards.ts` and
 * the repository layer. The proxy cannot see what a page will load, only the
 * URL, and a cookie's PRESENCE says nothing about whether it is valid. Treating
 * it as the gate would mean a forged cookie reached pages that assumed someone
 * else had already checked.
 */

const APP_PREFIXES = [
  '/today',
  '/discover',
  '/runs',
  '/shortlist',
  '/opportunities',
  '/outreach',
  '/conversations',
  '/pipeline',
  '/settings',
  '/onboarding',
];

const AUTH_PATHS = ['/sign-in', '/sign-up'];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (APP_PREFIXES.some((prefix) => pathname.startsWith(prefix)) && !hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    // Preserve where they were going, so signing in does not lose their place.
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (AUTH_PATHS.includes(pathname) && hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/today';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets and the icon; they never need a session decision.
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico).*)'],
};
