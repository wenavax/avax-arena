import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const STATIC_PAGES = new Set(['/privacy', '/terms', '/docs']);

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Maintenance mode — set MAINTENANCE_MODE=1 in env to enable
  if (process.env.MAINTENANCE_MODE === '1') {
    // Allow static assets and API health checks
    if (path.startsWith('/_next/') || path === '/favicon.ico') {
      return NextResponse.next();
    }
    // Return maintenance page for everything else
    return new NextResponse(
      `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Frostbite — Maintenance</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0c12;color:#fff;font-family:system-ui,-apple-system,sans-serif}
.c{text-align:center;padding:2rem}.icon{font-size:3rem;margin-bottom:1rem}h1{font-size:1.5rem;font-weight:700;margin-bottom:.5rem;background:linear-gradient(135deg,#00f0ff,#ff2020);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
p{color:rgba(255,255,255,.4);font-size:.9rem;max-width:24rem;margin:0 auto}</style></head>
<body><div class="c"><div class="icon">&#9731;</div><h1>Under Maintenance</h1><p>Frostbite Arena is currently being updated. We'll be back shortly.</p></div></body></html>`,
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '300' } }
    );
  }

  const response = NextResponse.next();

  // Capture referral code from URL and store in cookie
  const refCode = request.nextUrl.searchParams.get('ref');
  if (refCode && !request.cookies.get('ref_code')) {
    response.cookies.set('ref_code', refCode, {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
      sameSite: 'lax',
    });
  }

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
