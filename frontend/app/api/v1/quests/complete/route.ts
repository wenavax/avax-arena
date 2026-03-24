import { NextRequest, NextResponse } from 'next/server';
import {
  completeQuestRun,
  abandonQuestRun,
  getActiveQuestByToken,
} from '@/lib/db-queries';
import {
  getOrCreateProgression,
  getTierQuests,
  completeTierQuest,
  abandonTierQuest,
  generateQuest,
  syncTierWithChain,
} from '@/lib/quest-progression';

export const dynamic = 'force-dynamic';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenId, walletAddress, won, xpGained, txHash, abandoned } = body;

    if (tokenId === undefined || !walletAddress) {
      return NextResponse.json(
        { error: 'tokenId and walletAddress are required' },
        { status: 400, headers: sec() }
      );
    }

    // Find the active tier quest for this token
    const progression = getOrCreateProgression(walletAddress);
    const tierQuests = getTierQuests(walletAddress, progression.current_tier);
    const activeTierQuest = tierQuests.find(
      (q) => q.token_id === tokenId && q.status === 'active'
    );

    // Generate quest data for lore
    const quest = activeTierQuest
      ? generateQuest(walletAddress, activeTierQuest.tier, activeTierQuest.slot as 0 | 1)
      : null;

    // Handle abandon
    if (abandoned) {
      // Abandon in tier system
      if (activeTierQuest) {
        abandonTierQuest(walletAddress, activeTierQuest.tier, activeTierQuest.slot);
      }
      // Abandon in quest_runs (backward compat)
      abandonQuestRun(tokenId, walletAddress);

      return NextResponse.json({
        success: true,
        result: 'abandoned',
        xpGained: 0,
        questName: quest?.name ?? 'Quest',
        enemyName: quest?.enemy_name ?? 'Unknown',
      }, { headers: sec() });
    }

    const result = won ? 'success' : 'failure';
    const xp = xpGained ?? (quest ? (won ? quest.win_xp : quest.loss_xp) : 0);

    // Complete in tier system
    let tierAdvanced = false;
    let newTier = progression.current_tier;
    let newQuests: { quest: ReturnType<typeof generateQuest>; slot: number }[] | undefined;

    if (activeTierQuest) {
      const advanceResult = completeTierQuest(
        walletAddress,
        activeTierQuest.tier,
        activeTierQuest.slot,
        result,
        xp,
        txHash
      );
      tierAdvanced = advanceResult.tierAdvanced;
      newTier = advanceResult.newTier;

      if (advanceResult.newQuests) {
        newQuests = advanceResult.newQuests.map((q, i) => ({ quest: q, slot: i }));
      }
    }

    // Complete in quest_runs (backward compat)
    const activeRun = getActiveQuestByToken(tokenId);
    if (activeRun) {
      completeQuestRun({
        questId: activeRun.quest_id,
        tokenId,
        walletAddress,
        result,
        xpGained: xp,
        txHashComplete: txHash,
      });
    }

    return NextResponse.json({
      success: true,
      result,
      xpGained: xp,
      lore: quest ? (won ? quest.lore_success : quest.lore_failure) : '',
      questName: quest?.name ?? 'Quest',
      enemyName: quest?.enemy_name ?? 'Unknown',
      tierAdvanced,
      newTier,
      newQuests,
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/quests/complete]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: sec() });
  }
}
