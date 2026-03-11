import { NextRequest, NextResponse } from 'next/server';
import { FROSTBITE_WARRIOR_ABI } from '@/lib/contracts';
import { CONTRACT_ADDRESSES } from '@/lib/constants';
import { getWarriorName, getWarriorDescription } from '@/lib/warrior-prompts';
import { imageCache } from '@/lib/image-cache';
import { createActiveClient } from '@/lib/chain';

const client = createActiveClient();

interface WarriorData {
  attack: number;
  defense: number;
  speed: number;
  element: number;
  specialPower: number;
  level: number;
  experience: bigint;
  battleWins: bigint;
  battleLosses: bigint;
  powerScore: bigint;
}

const ELEMENT_NAMES = ['Fire', 'Water', 'Wind', 'Ice', 'Earth', 'Thunder', 'Shadow', 'Light'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const { tokenId: tokenIdStr } = await params;
  const tokenId = parseInt(tokenIdStr, 10);

  if (isNaN(tokenId) || tokenId < 0) {
    return NextResponse.json({ error: 'Invalid token ID' }, { status: 400 });
  }

  try {
    const raw = await client.readContract({
      address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
      abi: FROSTBITE_WARRIOR_ABI,
      functionName: 'getWarrior',
      args: [BigInt(tokenId)],
    }) as Record<string, unknown>;

    const warrior: WarriorData = {
      attack: Number(raw.attack ?? raw[0] ?? 0),
      defense: Number(raw.defense ?? raw[1] ?? 0),
      speed: Number(raw.speed ?? raw[2] ?? 0),
      element: Number(raw.element ?? raw[3] ?? 0),
      specialPower: Number(raw.specialPower ?? raw[4] ?? 0),
      level: Number(raw.level ?? raw[5] ?? 0),
      experience: BigInt(String(raw.experience ?? raw[6] ?? 0)),
      battleWins: BigInt(String(raw.battleWins ?? raw[7] ?? 0)),
      battleLosses: BigInt(String(raw.battleLosses ?? raw[8] ?? 0)),
      powerScore: BigInt(String(raw.powerScore ?? raw[9] ?? 0)),
    };

    const baseUrl = request.nextUrl.origin;
    const cachedImage = imageCache.get(tokenId);
    const imageUrl = cachedImage
      ? cachedImage
      : `${baseUrl}/api/metadata/${tokenId}/image`;

    const metadata = {
      name: getWarriorName(tokenId, warrior.element),
      description: getWarriorDescription({
        ...warrior,
        tokenId,
      }),
      image: imageUrl,
      external_url: `${baseUrl}/marketplace/${tokenId}`,
      attributes: [
        { trait_type: 'Element', value: ELEMENT_NAMES[warrior.element] ?? 'Unknown' },
        { trait_type: 'Attack', value: warrior.attack, max_value: 100 },
        { trait_type: 'Defense', value: warrior.defense, max_value: 100 },
        { trait_type: 'Speed', value: warrior.speed, max_value: 100 },
        { trait_type: 'Special Power', value: warrior.specialPower, max_value: 50 },
        { trait_type: 'Level', value: warrior.level },
        { trait_type: 'Power Score', value: Number(warrior.powerScore) },
        { trait_type: 'Battle Wins', value: Number(warrior.battleWins) },
        { trait_type: 'Battle Losses', value: Number(warrior.battleLosses) },
        { display_type: 'number', trait_type: 'Experience', value: Number(warrior.experience) },
      ],
    };

    return NextResponse.json(metadata, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('TokenDoesNotExist') || message.includes('revert') || message.includes('0xceea21b6')) {
      return NextResponse.json({ error: 'Token does not exist' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to fetch warrior data' }, { status: 500 });
  }
}
