import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const STATIC_PAGES = new Set(['/privacy', '/terms', '/docs']);

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const path = request.nextUrl.pathname;

  if (!path.startsWith('/_next/') && !path.startsWith('/api/')) {
    if (STATIC_PAGES.has(path)) {
      response.headers.set('Cache-Control', 'public, max-age=3600');
    } else {
      response.headers.set('Cache-Control', 'no-store');
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
