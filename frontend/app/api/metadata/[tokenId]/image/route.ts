import { NextRequest, NextResponse } from 'next/server';
import { imageCache } from '@/lib/image-cache';

const ELEMENT_COLORS: Record<number, { primary: string; secondary: string; bg: string }> = {
  0: { primary: '#FF4400', secondary: '#FF8800', bg: '#1A0500' },
  1: { primary: '#0096FF', secondary: '#00D4FF', bg: '#000A1A' },
  2: { primary: '#00FF88', secondary: '#88FFCC', bg: '#001A0A' },
  3: { primary: '#00F0FF', secondary: '#AAE0FF', bg: '#000A1A' },
  4: { primary: '#B47800', secondary: '#DDAA44', bg: '#1A0F00' },
  5: { primary: '#FFD700', secondary: '#AA00FF', bg: '#0A0A1A' },
  6: { primary: '#6400AA', secondary: '#CC0044', bg: '#0A001A' },
  7: { primary: '#FFE066', secondary: '#FFFFFF', bg: '#1A1A0A' },
};

const ELEMENT_NAMES = ['Fire', 'Water', 'Wind', 'Ice', 'Earth', 'Thunder', 'Shadow', 'Light'];
const ELEMENT_EMOJIS = ['🔥', '💧', '🌪️', '❄️', '🌍', '⚡', '🌑', '✨'];

/**
 * Generate a fallback SVG warrior card when no AI image is available.
 */
function generateFallbackSvg(tokenId: number, element: number): string {
  const colors = ELEMENT_COLORS[element] ?? ELEMENT_COLORS[0];
  const elementName = ELEMENT_NAMES[element] ?? 'Unknown';
  const emoji = ELEMENT_EMOJIS[element] ?? '⚔️';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="${colors.bg}" stop-opacity="1"/>
      <stop offset="100%" stop-color="#0a0a0f" stop-opacity="1"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="40%">
      <stop offset="0%" stop-color="${colors.primary}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${colors.primary}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="border" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${colors.primary}"/>
      <stop offset="50%" stop-color="${colors.secondary}"/>
      <stop offset="100%" stop-color="${colors.primary}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)" rx="40"/>
  <rect x="8" y="8" width="1008" height="1008" fill="none" stroke="url(#border)" stroke-width="4" rx="36" opacity="0.8"/>
  <rect width="1024" height="1024" fill="url(#glow)" rx="40"/>
  <text x="512" y="340" text-anchor="middle" font-family="system-ui,sans-serif" font-size="200" fill="${colors.primary}" opacity="0.9">⚔️</text>
  <text x="512" y="520" text-anchor="middle" font-family="system-ui,sans-serif" font-size="72" fill="${colors.primary}" opacity="0.8">${emoji} ${elementName}</text>
  <text x="512" y="620" text-anchor="middle" font-family="system-ui,sans-serif" font-size="48" fill="white" opacity="0.5">Frostbite Warrior</text>
  <text x="512" y="700" text-anchor="middle" font-family="system-ui,sans-serif" font-size="96" fill="white" font-weight="bold" opacity="0.9">#${tokenId}</text>
  <text x="512" y="800" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" fill="${colors.secondary}" opacity="0.4">FROSTBITE</text>
  <line x1="200" y1="850" x2="824" y2="850" stroke="${colors.primary}" stroke-width="1" opacity="0.2"/>
  <text x="512" y="900" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" fill="white" opacity="0.25">Generating AI artwork...</text>
</svg>`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const { tokenId: tokenIdStr } = await params;
  const tokenId = parseInt(tokenIdStr, 10);

  if (isNaN(tokenId) || tokenId < 0) {
    return new NextResponse('Invalid token ID', { status: 400 });
  }

  // Check if we have a cached Layer.ai image URL
  const cachedUrl = imageCache.get(tokenId);
  if (cachedUrl) {
    // Proxy the image from Layer.ai
    try {
      const imgResponse = await fetch(cachedUrl);
      if (imgResponse.ok) {
        const contentType = imgResponse.headers.get('content-type') ?? 'image/png';
        const buffer = await imgResponse.arrayBuffer();
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400, immutable',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
    } catch {
      // Fall through to SVG fallback
    }
  }

  // Parse element from query param or default to 0
  const element = parseInt(request.nextUrl.searchParams.get('element') ?? '0', 10);

  // Return fallback SVG
  const svg = generateFallbackSvg(tokenId, element);
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
