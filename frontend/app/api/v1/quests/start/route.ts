import { NextRequest, NextResponse } from 'next/server';
import { getActiveQuestByToken, createQuestRun } from '@/lib/db-queries';
import {
  getOrCreateProgression,
  generateQuest,
  startTierQuest,
  getTierQuests,
  syncTierWithChain,
} from '@/lib/quest-progression';

export const dynamic = 'force-dynamic';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wallet, tier, slot, tokenId, txHash } = body;

    if (wallet === undefined || tier === undefined || slot === undefined || tokenId === undefined) {
      return NextResponse.json(
        { error: 'wallet, tier, slot, and tokenId are required' },
        { status: 400, headers: sec() }
      );
    }

    // Sync DB tier with on-chain tier, then validate
    syncTierWithChain(wallet, tier);
    const progression = getOrCreateProgression(wallet);

    // Check slot is valid and available
    const tierQuests = getTierQuests(wallet, tier);
    const slotQuest = tierQuests.find((q) => q.slot === slot);
    if (!slotQuest) {
      return NextResponse.json(
        { error: 'Quest slot not found' },
        { status: 404, headers: sec() }
      );
    }
    if (slotQuest.status !== 'available') {
      return NextResponse.json(
        { error: `Quest slot is ${slotQuest.status}, not available` },
        { status: 400, headers: sec() }
      );
    }

    // Check if warrior is already on a quest
    const existing = getActiveQuestByToken(tokenId);
    if (existing) {
      return NextResponse.json(
        { error: 'Warrior is already on a quest' },
        { status: 400, headers: sec() }
      );
    }

    // Generate full quest data
    const quest = generateQuest(wallet, tier, slot as 0 | 1);

    // Update tier_quests
    startTierQuest(wallet, tier, slot, tokenId, txHash);

    // Also write to quest_runs for backward compatibility
    const endsAt = new Date(Date.now() + quest.duration_secs * 1000).toISOString();
    createQuestRun({
      questId: quest.chain_quest_id,
      tokenId,
      walletAddress: wallet,
      zoneId: quest.zone_id,
      difficulty: quest.difficulty,
      endsAt,
      txHashStart: txHash,
    });

    return NextResponse.json({
      success: true,
      chainQuestId: quest.chain_quest_id,
      quest: {
        name: quest.name,
        loreIntro: quest.lore_intro,
        enemyName: quest.enemy_name,
        endsAt,
        durationSecs: quest.duration_secs,
      },
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/quests/start]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: sec() });
  }
}
