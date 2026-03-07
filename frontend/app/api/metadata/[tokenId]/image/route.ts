import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { FROSTBITE_WARRIOR_ABI } from '@/lib/contracts';
import { CONTRACT_ADDRESSES, FUJI_RPC_URL } from '@/lib/constants';
import { imageCache } from '@/lib/image-cache';
import { generateWarriorSVG, generateFallbackSVG } from '@/lib/warrior-generator';

const client = createPublicClient({
  chain: avalancheFuji,
  transport: http(FUJI_RPC_URL),
});

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
      // Fall through to procedural generation
    }
  }

  // Try to fetch warrior stats from chain for procedural generation
  try {
    const raw = await client.readContract({
      address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
      abi: FROSTBITE_WARRIOR_ABI,
      functionName: 'getWarrior',
      args: [BigInt(tokenId)],
    }) as Record<string, unknown>;

    const svg = generateWarriorSVG({
      tokenId,
      attack: Number(raw.attack ?? raw[0] ?? 0),
      defense: Number(raw.defense ?? raw[1] ?? 0),
      speed: Number(raw.speed ?? raw[2] ?? 0),
      element: Number(raw.element ?? raw[3] ?? 0),
      specialPower: Number(raw.specialPower ?? raw[4] ?? 0),
      level: Number(raw.level ?? raw[5] ?? 0),
      powerScore: Number(raw.powerScore ?? raw[9] ?? 0),
    });

    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    // Chain unreachable — fallback with element query param
    const element = parseInt(request.nextUrl.searchParams.get('element') ?? '0', 10);
    const svg = generateFallbackSVG(tokenId, element);

    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=60',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
}
