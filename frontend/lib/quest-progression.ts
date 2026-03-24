/* ---------------------------------------------------------------------------
 * Progressive Quest System — Per-Wallet Tier-Based Unlocks
 *
 * Each wallet progresses through tiers independently. Each tier = 2 quest slots.
 * Complete both → advance to next tier. Difficulty scales with tier.
 *
 * Uses deterministic RNG (FNV-1a + Mulberry32) so the same wallet+tier+slot
 * always generates the same quest (resumable across sessions).
 * ------------------------------------------------------------------------- */

import { ZONE_SEEDS, ZONE_QUEST_DATA, DIFF_PARAMS, ACTIONS_BY_DIFF, DIFF_INDEX } from '@/data/quest-seed';
import { fnv1a, mulberry32 } from '@/lib/daily-rotation';
import getDb from './db';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Boss';

export interface GeneratedQuest {
  chain_quest_id: number;
  zone_id: number;
  zone_name: string;
  zone_element: string;
  difficulty: Difficulty;
  duration_secs: number;
  win_xp: number;
  loss_xp: number;
  min_level: number;
  min_power_score: number;
  base_difficulty: number;
  name: string;
  description: string;
  lore_intro: string;
  lore_success: string;
  lore_failure: string;
  enemy_name: string;
}

export interface WalletProgression {
  wallet_address: string;
  current_tier: number;
  total_completed: number;
  total_won: number;
  total_xp: number;
  created_at: string;
  updated_at: string;
}

export interface TierQuest {
  id: number;
  wallet_address: string;
  tier: number;
  slot: number;
  chain_quest_id: number;
  zone_id: number;
  difficulty: string;
  status: string;
  result: string | null;
  token_id: number | null;
  xp_gained: number;
  started_at: string | null;
  completed_at: string | null;
  tx_hash_start: string | null;
  tx_hash_complete: string | null;
}

/* ---------------------------------------------------------------------------
 * Tier → Difficulty Mapping
 *
 * Tier 0-4:   Easy / Easy
 * Tier 5-7:   Easy / Medium     (transition)
 * Tier 8-14:  Medium / Medium
 * Tier 15-17: Medium / Hard     (transition)
 * Tier 18-24: Hard / Hard
 * Tier 25-27: Hard / Boss       (transition)
 * Tier 28+:   Boss / Boss
 * ------------------------------------------------------------------------- */

const ENEMY_PREFIXES = ['Elite', 'Veteran', 'Ancient', 'Mythic', 'Legendary'];

/**
 * On-chain quest durations indexed by chainQuestId (zoneId * 4 + diffIndex).
 * Must match the values in the deploy script / QuestEngine contract.
 */
const CHAIN_QUEST_DURATIONS: Record<number, number> = {
  // Zone 0: Inferno Caldera (Fire)
  0: 300, 1: 7200, 2: 21600, 3: 64800,
  // Zone 1: Abyssal Depths (Water)
  4: 420, 5: 5400, 6: 18000, 7: 72000,
  // Zone 2: Stormhowl Peaks (Wind)
  8: 540, 9: 3600, 10: 14400, 11: 57600,
  // Zone 3: Glacial Expanse (Ice)
  12: 600, 13: 7200, 14: 28800, 15: 86400,
  // Zone 4: Ironroot Badlands (Earth)
  16: 720, 17: 5400, 18: 21600, 19: 64800,
  // Zone 5: Voltspire Heights (Thunder)
  20: 840, 21: 3600, 22: 18000, 23: 57600,
  // Zone 6: Umbral Wastes (Shadow)
  24: 900, 25: 7200, 26: 21600, 27: 72000,
  // Zone 7: Solaris Citadel (Light)
  28: 300, 29: 5400, 30: 14400, 31: 86400,
};

export function getTierDifficulties(tier: number): [Difficulty, Difficulty] {
  if (tier < 5)  return ['Easy', 'Easy'];
  if (tier < 8)  return ['Easy', 'Medium'];
  if (tier < 15) return ['Medium', 'Medium'];
  if (tier < 18) return ['Medium', 'Hard'];
  if (tier < 25) return ['Hard', 'Hard'];
  if (tier < 28) return ['Hard', 'Boss'];
  return ['Boss', 'Boss'];
}

/* ---------------------------------------------------------------------------
 * Procedural Quest Generation (deterministic per wallet+tier+slot)
 * ------------------------------------------------------------------------- */

export function generateQuest(wallet: string, tier: number, slot: 0 | 1): GeneratedQuest {
  const seed = fnv1a(`${wallet.toLowerCase()}:${tier}:${slot}:v1`);
  const rng = mulberry32(seed);

  const diffs = getTierDifficulties(tier);
  const difficulty = diffs[slot];
  const diffIndex = DIFF_INDEX[difficulty];
  const params = DIFF_PARAMS[difficulty];

  // Zone selection: deterministic but varies across tiers
  const baseZone = (tier * 2 + slot) % 8;
  const rngOffset = Math.floor(rng() * 8);
  const zoneId = (baseZone + rngOffset) % 8;

  const zone = ZONE_SEEDS[zoneId];
  const zoneData = ZONE_QUEST_DATA[zoneId];
  const chainQuestId = zoneId * 4 + diffIndex;

  // Pick enemy
  const enemies = zoneData.enemies[difficulty];
  const enemyIdx = Math.floor(rng() * enemies.length);
  let enemyName = enemies[enemyIdx];

  // Add prefix for tier 5+
  if (tier >= 5) {
    const prefixIdx = Math.min(Math.floor((tier - 5) / 5), ENEMY_PREFIXES.length - 1);
    enemyName = `${ENEMY_PREFIXES[prefixIdx]} ${enemyName}`;
  }

  // Pick target and action
  const targetIdx = Math.floor(rng() * zoneData.targets.length);
  const target = zoneData.targets[targetIdx];

  const actions = ACTIONS_BY_DIFF[difficulty];
  const actionIdx = Math.floor(rng() * actions.length);
  const action = actions[actionIdx];

  const name = difficulty === 'Boss'
    ? `${action} ${enemyName}`
    : `${action} ${target}`;

  const description = difficulty === 'Boss'
    ? `Face the legendary ${enemyName} in an epic battle at the heart of ${zone.name}.`
    : `${action} operation in ${target}. Defeat ${enemyName} forces threatening the area.`;

  // Pick lore templates
  const introIdx = Math.floor(rng() * zoneData.intros.length);
  const successIdx = Math.floor(rng() * zoneData.successes.length);
  const failureIdx = Math.floor(rng() * zoneData.failures.length);

  // Use on-chain duration (source of truth), fallback to DIFF_PARAMS
  const chainDuration = CHAIN_QUEST_DURATIONS[chainQuestId];
  const durationSecs = chainDuration ?? params.durations[0];

  return {
    chain_quest_id: chainQuestId,
    zone_id: zoneId,
    zone_name: zone.name,
    zone_element: zone.element,
    difficulty,
    duration_secs: durationSecs,
    win_xp: params.winXp,
    loss_xp: params.lossXp,
    min_level: params.minLevel,
    min_power_score: params.minPowerScore,
    base_difficulty: params.baseDifficulty,
    name,
    description,
    lore_intro: zoneData.intros[introIdx].replace('{enemy}', enemyName),
    lore_success: zoneData.successes[successIdx].replace('{enemy}', enemyName),
    lore_failure: zoneData.failures[failureIdx].replace('{enemy}', enemyName),
    enemy_name: enemyName,
  };
}

/* ---------------------------------------------------------------------------
 * DB CRUD — Wallet Progression
 * ------------------------------------------------------------------------- */

export function getOrCreateProgression(wallet: string): WalletProgression {
  const db = getDb();
  const addr = wallet.toLowerCase();

  let row = db.prepare('SELECT * FROM wallet_progression WHERE wallet_address = ?').get(addr) as WalletProgression | undefined;

  if (!row) {
    db.prepare('INSERT INTO wallet_progression (wallet_address) VALUES (?)').run(addr);
    row = db.prepare('SELECT * FROM wallet_progression WHERE wallet_address = ?').get(addr) as WalletProgression;
  }

  return row;
}

/**
 * Sync DB tier with on-chain tier. If on-chain tier is ahead,
 * fast-forward the DB and ensure tier quest slots exist.
 */
export function syncTierWithChain(wallet: string, chainTier: number): void {
  const db = getDb();
  const addr = wallet.toLowerCase();
  const prog = getOrCreateProgression(wallet);

  if (chainTier > prog.current_tier) {
    // Mark any active quests in old tiers as abandoned
    db.prepare(`
      UPDATE tier_quests
      SET status = 'available', token_id = NULL, started_at = NULL, tx_hash_start = NULL
      WHERE wallet_address = ? AND status = 'active'
    `).run(addr);

    // Advance DB tier to match on-chain
    db.prepare(`
      UPDATE wallet_progression
      SET current_tier = ?, updated_at = datetime('now')
      WHERE wallet_address = ?
    `).run(chainTier, addr);

    // Ensure quest slots exist for new tier
    ensureTierQuests(wallet, chainTier);
  }
}

/* ---------------------------------------------------------------------------
 * DB CRUD — Tier Quests
 * ------------------------------------------------------------------------- */

export function ensureTierQuests(wallet: string, tier: number): void {
  const db = getDb();
  const addr = wallet.toLowerCase();

  const existing = db.prepare(
    'SELECT COUNT(*) as cnt FROM tier_quests WHERE wallet_address = ? AND tier = ?'
  ).get(addr, tier) as { cnt: number };

  if (existing.cnt >= 2) return;

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO tier_quests (wallet_address, tier, slot, chain_quest_id, zone_id, difficulty)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const slot of [0, 1] as const) {
    const quest = generateQuest(wallet, tier, slot);
    insertStmt.run(addr, tier, slot, quest.chain_quest_id, quest.zone_id, quest.difficulty);
  }
}

export function getTierQuests(wallet: string, tier: number): TierQuest[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM tier_quests WHERE wallet_address = ? AND tier = ? ORDER BY slot'
  ).all(wallet.toLowerCase(), tier) as TierQuest[];
}

export function startTierQuest(
  wallet: string,
  tier: number,
  slot: number,
  tokenId: number,
  txHash?: string
): TierQuest {
  const db = getDb();
  const addr = wallet.toLowerCase();

  db.prepare(`
    UPDATE tier_quests
    SET status = 'active', token_id = ?, started_at = datetime('now'), tx_hash_start = ?
    WHERE wallet_address = ? AND tier = ? AND slot = ? AND status = 'available'
  `).run(tokenId, txHash ?? null, addr, tier, slot);

  return db.prepare(
    'SELECT * FROM tier_quests WHERE wallet_address = ? AND tier = ? AND slot = ?'
  ).get(addr, tier, slot) as TierQuest;
}

export function completeTierQuest(
  wallet: string,
  tier: number,
  slot: number,
  result: 'success' | 'failure',
  xpGained: number,
  txHash?: string
): { tierAdvanced: boolean; newTier: number; newQuests?: GeneratedQuest[] } {
  const db = getDb();
  const addr = wallet.toLowerCase();

  // Update the tier quest
  db.prepare(`
    UPDATE tier_quests
    SET status = 'completed', result = ?, xp_gained = ?, completed_at = datetime('now'), tx_hash_complete = ?
    WHERE wallet_address = ? AND tier = ? AND slot = ? AND status = 'active'
  `).run(result, xpGained, txHash ?? null, addr, tier, slot);

  // Update progression stats
  db.prepare(`
    UPDATE wallet_progression
    SET total_completed = total_completed + 1,
        total_won = total_won + CASE WHEN ? = 'success' THEN 1 ELSE 0 END,
        total_xp = total_xp + ?,
        updated_at = datetime('now')
    WHERE wallet_address = ?
  `).run(result, xpGained, addr);

  // Check if both quests in this tier are completed
  const completed = db.prepare(
    "SELECT COUNT(*) as cnt FROM tier_quests WHERE wallet_address = ? AND tier = ? AND status = 'completed'"
  ).get(addr, tier) as { cnt: number };

  if (completed.cnt >= 2) {
    // Advance to next tier
    const newTier = tier + 1;
    db.prepare(`
      UPDATE wallet_progression
      SET current_tier = ?, updated_at = datetime('now')
      WHERE wallet_address = ?
    `).run(newTier, addr);

    // Generate new tier quests
    ensureTierQuests(wallet, newTier);

    const newQuests = [
      generateQuest(wallet, newTier, 0),
      generateQuest(wallet, newTier, 1),
    ];

    return { tierAdvanced: true, newTier, newQuests };
  }

  return { tierAdvanced: false, newTier: tier };
}

export function abandonTierQuest(wallet: string, tier: number, slot: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE tier_quests
    SET status = 'available', token_id = NULL, started_at = NULL, tx_hash_start = NULL
    WHERE wallet_address = ? AND tier = ? AND slot = ? AND status = 'active'
  `).run(wallet.toLowerCase(), tier, slot);
}

/** Get recent tier history (last N completed tiers) */
export function getTierHistory(wallet: string, limit = 10): { tier: number; slot0_result: string | null; slot1_result: string | null }[] {
  const db = getDb();
  const addr = wallet.toLowerCase();
  const prog = db.prepare('SELECT current_tier FROM wallet_progression WHERE wallet_address = ?').get(addr) as { current_tier: number } | undefined;
  if (!prog) return [];

  const history: { tier: number; slot0_result: string | null; slot1_result: string | null }[] = [];
  const startTier = Math.max(0, prog.current_tier - limit);

  for (let t = prog.current_tier - 1; t >= startTier; t--) {
    const quests = db.prepare(
      'SELECT slot, result FROM tier_quests WHERE wallet_address = ? AND tier = ? ORDER BY slot'
    ).all(addr, t) as { slot: number; result: string | null }[];

    if (quests.length === 0) break;
    history.push({
      tier: t,
      slot0_result: quests.find(q => q.slot === 0)?.result ?? null,
      slot1_result: quests.find(q => q.slot === 1)?.result ?? null,
    });
  }

  return history;
}
