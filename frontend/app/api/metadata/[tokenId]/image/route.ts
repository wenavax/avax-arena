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

// 16x20 pixel art warrior grids per element (1=primary, 2=secondary, 3=dark accent, 4=highlight/eye)
// Each warrior has a distinct silhouette based on their element
const WARRIOR_SPRITES: Record<number, number[][]> = {
  // Fire — horned helmet, sword right hand, flame accents
  0: [
    [0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,3,3,3,1,0,0,0,0,0,0],
    [0,0,0,0,1,3,4,3,4,3,1,0,0,0,0,0],
    [0,0,0,0,0,3,3,1,3,3,0,0,0,0,0,0],
    [0,0,0,0,0,0,3,3,3,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,1,1,2,1,2,1,1,0,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,2,0,0,1,1,1,1,1,0,0,2,0,0,0],
    [0,2,2,0,0,1,1,1,1,1,0,0,2,2,0,0],
    [0,0,2,0,0,0,1,1,1,0,0,0,2,0,0,0],
    [0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,0],
    [0,0,0,1,1,1,0,0,0,1,1,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  // Water — trident, flowing cape
  1: [
    [0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,1,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,3,3,3,1,0,0,0,0,0,0],
    [0,0,0,0,1,3,4,3,4,3,1,0,0,0,0,0],
    [0,0,0,0,0,3,3,1,3,3,0,0,0,0,0,0],
    [0,0,0,0,0,0,3,3,3,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,1,1,1,2,1,2,1,1,1,0,0,0,0],
    [0,0,2,0,1,1,1,1,1,1,1,0,2,0,0,0],
    [0,2,1,2,0,1,1,1,1,1,0,2,1,2,0,0],
    [0,2,1,2,0,0,1,1,1,0,0,2,1,2,0,0],
    [0,0,2,0,0,0,1,0,1,0,0,0,2,0,0,0],
    [0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,0],
    [0,0,0,0,1,2,0,0,0,2,1,0,0,0,0,0],
    [0,0,0,1,2,2,0,0,0,2,2,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  // Wind — feathered helm, dual daggers
  2: [
    [0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,2,2,1,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,3,3,3,1,0,0,0,0,0,0],
    [0,0,0,0,1,3,4,3,4,3,1,0,0,0,0,0],
    [0,0,0,0,0,3,3,1,3,3,0,0,0,0,0,0],
    [0,0,0,0,0,0,3,3,3,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,2,1,1,1,1,1,1,1,2,0,0,0,0],
    [0,0,2,0,0,1,1,1,1,1,0,0,2,0,0,0],
    [0,2,0,0,0,1,2,1,2,1,0,0,0,2,0,0],
    [2,0,0,0,0,1,1,1,1,1,0,0,0,0,2,0],
    [0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,0],
    [0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0],
    [0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  // Ice — crystal crown, shield + mace
  3: [
    [0,0,0,0,0,2,0,2,0,2,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,1,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,3,3,3,1,0,0,0,0,0,0],
    [0,0,0,0,1,3,4,3,4,3,1,0,0,0,0,0],
    [0,0,0,0,0,3,3,1,3,3,0,0,0,0,0,0],
    [0,0,0,0,0,0,3,3,3,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,1,1,2,1,2,1,1,0,0,0,0,0],
    [0,0,2,1,1,1,1,1,1,1,1,1,2,0,0,0],
    [0,0,2,2,0,1,1,1,1,1,0,2,2,0,0,0],
    [0,0,2,2,0,1,1,1,1,1,0,2,2,0,0,0],
    [0,0,2,2,0,0,1,1,1,0,0,0,2,0,0,0],
    [0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,1,2,1,0,1,2,1,0,0,0,0,0],
    [0,0,0,0,1,2,1,0,1,2,1,0,0,0,0,0],
    [0,0,0,1,1,2,1,0,1,2,1,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  // Earth — heavy armor, tower shield, hammer
  4: [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,0,0,1,3,3,3,1,0,0,0,0,0,0],
    [0,0,0,0,1,3,4,3,4,3,1,0,0,0,0,0],
    [0,0,0,0,0,3,3,1,3,3,0,0,0,0,0,0],
    [0,0,0,0,0,0,3,3,3,0,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,1,1,1,2,1,2,1,1,1,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,2,2,1,1,1,1,1,1,1,2,2,2,0,0],
    [0,0,2,2,0,1,1,1,1,1,0,2,2,2,0,0],
    [0,0,2,2,0,0,1,1,1,0,0,0,2,0,0,0],
    [0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,0,1,1,1,0,0,0,0,0],
    [0,0,0,0,1,1,1,0,1,1,1,0,0,0,0,0],
    [0,0,0,1,1,1,0,0,0,1,1,1,0,0,0,0],
    [0,0,0,1,1,1,0,0,0,1,1,1,0,0,0,0],
    [0,0,1,1,1,1,0,0,0,1,1,1,1,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  // Thunder — lightning bolt crown, electrified hands
  5: [
    [0,0,0,0,0,2,0,0,0,2,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,0,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,2,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,3,3,3,1,0,0,0,0,0,0],
    [0,0,0,0,1,3,4,3,4,3,1,0,0,0,0,0],
    [0,0,0,0,0,3,3,1,3,3,0,0,0,0,0,0],
    [0,0,0,0,0,0,3,3,3,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,1,1,2,1,2,1,1,0,0,0,0,0],
    [0,0,2,1,1,1,1,1,1,1,1,1,2,0,0,0],
    [0,2,2,0,0,1,1,1,1,1,0,0,2,2,0,0],
    [2,2,0,0,0,1,1,1,1,1,0,0,0,2,2,0],
    [0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,2,1,0,0,0,1,2,0,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,0],
    [0,0,0,2,1,1,0,0,0,1,1,2,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  // Shadow — hooded cloak, scythe
  6: [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,1,1,3,3,3,3,3,1,1,0,0,0,0],
    [0,0,0,0,1,3,4,3,4,3,1,0,0,0,0,0],
    [0,0,0,0,0,3,3,2,3,3,0,0,0,0,0,0],
    [0,0,0,0,0,0,3,3,3,0,0,0,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,1,1,0,1,1,1,1,1,0,1,1,0,0,0],
    [0,0,1,0,0,1,1,1,1,1,0,0,1,2,2,0],
    [0,0,1,0,0,1,1,1,1,1,0,0,0,2,0,0],
    [0,0,0,0,0,0,1,1,1,0,0,0,0,2,0,0],
    [0,0,0,0,0,0,1,0,1,0,0,0,0,2,0,0],
    [0,0,0,0,0,1,1,0,1,1,0,0,0,2,0,0],
    [0,0,0,0,0,1,0,0,0,1,0,0,2,0,0,0],
    [0,0,0,0,1,1,0,0,0,1,1,2,0,0,0,0],
    [0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0],
    [0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  // Light — halo, staff, radiant wings
  7: [
    [0,0,0,0,0,2,2,2,2,2,0,0,0,0,0,0],
    [0,0,0,0,2,0,0,0,0,0,2,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,3,3,3,1,0,0,0,0,0,0],
    [0,0,0,0,1,3,4,3,4,3,1,0,0,0,0,0],
    [0,0,0,0,0,3,3,1,3,3,0,0,0,0,0,0],
    [0,0,0,0,0,0,3,3,3,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,2,0,1,1,2,1,2,1,1,0,2,0,0,0],
    [0,2,0,0,1,1,1,1,1,1,1,0,0,2,0,0],
    [2,0,0,0,0,1,1,1,1,1,0,0,0,0,2,0],
    [0,2,0,0,0,1,1,1,1,1,0,0,0,2,0,0],
    [0,0,2,0,0,0,1,1,1,0,0,0,2,0,0,0],
    [0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,0],
    [0,0,0,0,1,2,0,0,0,2,1,0,0,0,0,0],
    [0,0,0,1,1,2,0,0,0,2,1,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
};

/**
 * Render a pixel grid as SVG rect elements.
 */
function renderPixelWarrior(
  grid: number[][],
  colors: { primary: string; secondary: string; bg: string },
  offsetX: number,
  offsetY: number,
  pixelSize: number,
): string {
  const colorMap: Record<number, string> = {
    1: colors.primary,
    2: colors.secondary,
    3: '#1a1a2e',
    4: '#ffffff',
  };

  let rects = '';
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const val = grid[row][col];
      if (val === 0) continue;
      const fill = colorMap[val] ?? colors.primary;
      const x = offsetX + col * pixelSize;
      const y = offsetY + row * pixelSize;
      rects += `<rect x="${x}" y="${y}" width="${pixelSize}" height="${pixelSize}" fill="${fill}"/>`;
    }
  }
  return rects;
}

/**
 * Generate a pixel-art frame border.
 */
function renderPixelBorder(
  color: string,
  secondary: string,
  size: number,
  pixelSize: number,
): string {
  let rects = '';
  const count = Math.floor(size / pixelSize);
  for (let i = 0; i < count; i++) {
    const c = i % 4 === 0 ? secondary : color;
    const o = i % 2 === 0 ? '0.6' : '0.3';
    // Top
    rects += `<rect x="${i * pixelSize}" y="0" width="${pixelSize}" height="${pixelSize}" fill="${c}" opacity="${o}"/>`;
    // Bottom
    rects += `<rect x="${i * pixelSize}" y="${size - pixelSize}" width="${pixelSize}" height="${pixelSize}" fill="${c}" opacity="${o}"/>`;
    // Left
    rects += `<rect x="0" y="${i * pixelSize}" width="${pixelSize}" height="${pixelSize}" fill="${c}" opacity="${o}"/>`;
    // Right
    rects += `<rect x="${size - pixelSize}" y="${i * pixelSize}" width="${pixelSize}" height="${pixelSize}" fill="${c}" opacity="${o}"/>`;
  }
  return rects;
}

/**
 * Generate a fallback pixel-art SVG warrior card.
 */
function generateFallbackSvg(tokenId: number, element: number): string {
  const colors = ELEMENT_COLORS[element] ?? ELEMENT_COLORS[0];
  const elementName = ELEMENT_NAMES[element] ?? 'Unknown';
  const grid = WARRIOR_SPRITES[element] ?? WARRIOR_SPRITES[0];

  const size = 1024;
  const pixelSize = 32;
  const gridCols = grid[0].length;
  const gridRows = grid.length;
  const warriorW = gridCols * pixelSize;
  const warriorH = gridRows * pixelSize;
  const offsetX = Math.floor((size - warriorW) / 2);
  const offsetY = Math.floor((size - warriorH) / 2) - 60;

  const borderPixels = renderPixelBorder(colors.primary, colors.secondary, size, 16);
  const warriorPixels = renderPixelWarrior(grid, colors, offsetX, offsetY, pixelSize);

  // Small background pixel grid pattern
  let bgGrid = '';
  for (let y = 0; y < size; y += 48) {
    for (let x = 0; x < size; x += 48) {
      bgGrid += `<rect x="${x}" y="${y}" width="2" height="2" fill="${colors.primary}" opacity="0.06"/>`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="image-rendering:pixelated">
  <rect width="${size}" height="${size}" fill="${colors.bg}"/>
  <rect width="${size}" height="${size}" fill="#0a0a0f" opacity="0.7"/>
  ${bgGrid}
  ${borderPixels}
  ${warriorPixels}
  <text x="${size / 2}" y="${offsetY + warriorH + 70}" text-anchor="middle" font-family="monospace" font-size="56" fill="${colors.primary}" font-weight="bold" letter-spacing="4">${elementName.toUpperCase()}</text>
  <text x="${size / 2}" y="${offsetY + warriorH + 130}" text-anchor="middle" font-family="monospace" font-size="80" fill="white" font-weight="bold" opacity="0.9">#${tokenId}</text>
  <text x="${size / 2}" y="${size - 40}" text-anchor="middle" font-family="monospace" font-size="24" fill="${colors.secondary}" opacity="0.4" letter-spacing="8">FROSTBITE</text>
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
