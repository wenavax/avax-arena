import { NextRequest, NextResponse } from 'next/server';
import { getQuestZones } from '@/lib/db-queries';
import {
  getOrCreateProgression,
  ensureTierQuests,
  getTierQuests,
  generateQuest,
  getTierHistory,
} from '@/lib/quest-progression';

export const dynamic = 'force-dynamic';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const wallet = searchParams.get('wallet');

    const zones = getQuestZones();

    if (!wallet) {
      // No wallet → return zone info only
      return NextResponse.json({
        zones,
        progression: null,
        currentQuests: [],
      }, { headers: sec() });
    }

    // Get or create wallet progression
    const progression = getOrCreateProgression(wallet);

    // Ensure current tier quests exist (lazy init)
    ensureTierQuests(wallet, progression.current_tier);

    // Get current tier quests from DB
    const tierQuests = getTierQuests(wallet, progression.current_tier);

    // Generate full quest data for each slot
    const currentQuests = tierQuests.map((tq) => {
      const quest = generateQuest(wallet, tq.tier, tq.slot as 0 | 1);
      return {
        slot: tq.slot,
        status: tq.status,
        result: tq.result,
        tokenId: tq.token_id,
        xpGained: tq.xp_gained,
        startedAt: tq.started_at,
        completedAt: tq.completed_at,
        quest,
      };
    });

    // Get tier history for the timeline
    const history = getTierHistory(wallet, 10);

    return NextResponse.json({
      progression: {
        currentTier: progression.current_tier,
        totalCompleted: progression.total_completed,
        totalWon: progression.total_won,
        totalXp: progression.total_xp,
      },
      currentQuests,
      history,
      zones,
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/quests]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: sec() });
  }
}
