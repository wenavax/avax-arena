// ─── Frostbite Achievement System ───

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'combat' | 'exploration' | 'economy' | 'progression';
  reward: { xp?: number; gold?: number; item?: string };
  check: (stats: AchievementStats) => boolean;
}

export interface AchievementStats {
  totalKills: number;
  bossKills: number;
  critCount: number;
  dodgeCount: number;
  perfectWins: number;
  zonesVisited: Set<string>;
  chestsOpened: number;
  totalGoldEarned: number;
  currentGold: number;
  itemsCollected: number;
  equipSlotsFilled: number;
  level: number;
  questsCompleted: number;
  dailyStreak: number;
  pvpWins: number;
  battleRoyaleWins: number;
  shopPurchases: number;
  itemsUpgraded: number;
  deaths: number;
  skeletonKills: number;
  spiderKills: number;
  ghostKills: number;
  dragonKills: number;
}

// ─── Achievement Definitions (30) ───

export const ACHIEVEMENTS: Achievement[] = [
  // ── Combat (10) ──
  {
    id: 'first_blood', title: 'First Blood', description: 'Kill your first monster',
    icon: '⚔️', category: 'combat', reward: { xp: 20, gold: 10 },
    check: (s) => s.totalKills >= 1,
  },
  {
    id: 'slayer_10', title: 'Monster Slayer', description: 'Kill 10 monsters',
    icon: '🗡️', category: 'combat', reward: { xp: 50, gold: 30 },
    check: (s) => s.totalKills >= 10,
  },
  {
    id: 'slayer_100', title: 'Centurion', description: 'Kill 100 monsters',
    icon: '💀', category: 'combat', reward: { xp: 200, gold: 100 },
    check: (s) => s.totalKills >= 100,
  },
  {
    id: 'dragon_slayer', title: 'Dragon Slayer', description: 'Defeat a dragon or boss',
    icon: '🐉', category: 'combat', reward: { xp: 150, gold: 80 },
    check: (s) => s.bossKills >= 1,
  },
  {
    id: 'crit_king', title: 'Critical King', description: 'Land 10 critical hits',
    icon: '💥', category: 'combat', reward: { xp: 60, gold: 25 },
    check: (s) => s.critCount >= 10,
  },
  {
    id: 'untouchable', title: 'Untouchable', description: 'Win a battle without taking damage',
    icon: '🛡️', category: 'combat', reward: { xp: 100, gold: 50 },
    check: (s) => s.perfectWins >= 1,
  },
  {
    id: 'pvp_victor', title: 'PvP Victor', description: 'Win a PvP battle',
    icon: '🏆', category: 'combat', reward: { xp: 80, gold: 40 },
    check: (s) => s.pvpWins >= 1,
  },
  {
    id: 'battle_royale_champ', title: 'Battle Royale Champion', description: 'Win a Battle Royale',
    icon: '👑', category: 'combat', reward: { xp: 200, gold: 100 },
    check: (s) => s.battleRoyaleWins >= 1,
  },
  {
    id: 'skeleton_hunter', title: 'Skeleton Hunter', description: 'Kill 20 skeletons',
    icon: '💀', category: 'combat', reward: { xp: 40, gold: 20 },
    check: (s) => s.skeletonKills >= 20,
  },
  {
    id: 'spider_bane', title: 'Spider Bane', description: 'Kill 15 spiders',
    icon: '🕷️', category: 'combat', reward: { xp: 40, gold: 20 },
    check: (s) => s.spiderKills >= 15,
  },

  // ── Exploration (6) ──
  {
    id: 'explorer', title: 'World Explorer', description: 'Visit all 5 zones',
    icon: '🗺️', category: 'exploration', reward: { xp: 100, gold: 50 },
    check: (s) => s.zonesVisited.size >= 5,
  },
  {
    id: 'treasure_hunter', title: 'Treasure Hunter', description: 'Open 5 chests',
    icon: '🎁', category: 'exploration', reward: { xp: 60, gold: 40 },
    check: (s) => s.chestsOpened >= 5,
  },
  {
    id: 'ice_explorer', title: 'Ice Explorer', description: 'Enter the Ice Cavern',
    icon: '❄️', category: 'exploration', reward: { xp: 30 },
    check: (s) => s.zonesVisited.has('IceCave'),
  },
  {
    id: 'volcano_explorer', title: 'Volcano Explorer', description: 'Enter the Volcano',
    icon: '🌋', category: 'exploration', reward: { xp: 30 },
    check: (s) => s.zonesVisited.has('Volcano'),
  },
  {
    id: 'deep_diver', title: 'Deep Diver', description: 'Defeat the Crystal Wyrm',
    icon: '💎', category: 'exploration', reward: { xp: 150, gold: 80 },
    check: (s) => s.dragonKills >= 1, // crystal_wyrm counted via dragonKills
  },
  {
    id: 'inferno_conqueror', title: 'Inferno Conqueror', description: 'Defeat the Infernal Dragon',
    icon: '🔥', category: 'exploration', reward: { xp: 200, gold: 100 },
    check: (s) => s.bossKills >= 2, // second boss
  },

  // ── Economy (7) ──
  {
    id: 'first_purchase', title: 'First Purchase', description: 'Buy an item from the shop',
    icon: '🛒', category: 'economy', reward: { xp: 10 },
    check: (s) => s.shopPurchases >= 1,
  },
  {
    id: 'rich', title: 'Getting Rich', description: 'Accumulate 1000 gold',
    icon: '💰', category: 'economy', reward: { xp: 50 },
    check: (s) => s.totalGoldEarned >= 1000,
  },
  {
    id: 'wealthy', title: 'Wealthy Adventurer', description: 'Accumulate 5000 gold',
    icon: '💎', category: 'economy', reward: { xp: 150 },
    check: (s) => s.totalGoldEarned >= 5000,
  },
  {
    id: 'collector', title: 'Collector', description: 'Collect 10 different items',
    icon: '📦', category: 'economy', reward: { xp: 40, gold: 20 },
    check: (s) => s.itemsCollected >= 10,
  },
  {
    id: 'full_set', title: 'Fully Equipped', description: 'Fill all 4 equipment slots',
    icon: '🎽', category: 'economy', reward: { xp: 80, gold: 40 },
    check: (s) => s.equipSlotsFilled >= 4,
  },
  {
    id: 'upgrader', title: 'Upgrader', description: 'Upgrade an item',
    icon: '⬆️', category: 'economy', reward: { xp: 30 },
    check: (s) => s.itemsUpgraded >= 1,
  },
  {
    id: 'merchant', title: 'Loyal Customer', description: 'Buy 10 items from the shop',
    icon: '🏪', category: 'economy', reward: { xp: 60, gold: 30 },
    check: (s) => s.shopPurchases >= 10,
  },

  // ── Progression (7) ──
  {
    id: 'level_5', title: 'Apprentice', description: 'Reach level 5',
    icon: '⭐', category: 'progression', reward: { xp: 30, gold: 20 },
    check: (s) => s.level >= 5,
  },
  {
    id: 'level_10', title: 'Journeyman', description: 'Reach level 10',
    icon: '⭐', category: 'progression', reward: { xp: 60, gold: 40 },
    check: (s) => s.level >= 10,
  },
  {
    id: 'level_20', title: 'Veteran', description: 'Reach level 20',
    icon: '⭐', category: 'progression', reward: { xp: 120, gold: 80 },
    check: (s) => s.level >= 20,
  },
  {
    id: 'level_30', title: 'Elite Warrior', description: 'Reach level 30',
    icon: '🌟', category: 'progression', reward: { xp: 200, gold: 120 },
    check: (s) => s.level >= 30,
  },
  {
    id: 'level_50', title: 'Legendary Hero', description: 'Reach level 50',
    icon: '🌟', category: 'progression', reward: { xp: 500, gold: 250 },
    check: (s) => s.level >= 50,
  },
  {
    id: 'quest_master', title: 'Quest Master', description: 'Complete all 8 story quests',
    icon: '📜', category: 'progression', reward: { xp: 300, gold: 150 },
    check: (s) => s.questsCompleted >= 8,
  },
  {
    id: 'daily_warrior', title: 'Daily Warrior', description: 'Maintain a 7-day login streak',
    icon: '🔥', category: 'progression', reward: { xp: 100, gold: 50 },
    check: (s) => s.dailyStreak >= 7,
  },
];

// ─── Storage ───

const SAVE_KEY = 'frostbite_achievements';

export interface AchievementSave {
  unlocked: string[];
  stats: Record<string, number>;
  unlockedAt: Record<string, number>;
}

function loadSave(): AchievementSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return {
        unlocked: d.unlocked ?? [],
        stats: d.stats ?? {},
        unlockedAt: d.unlockedAt ?? {},
      };
    }
  } catch { /* ignore */ }
  return { unlocked: [], stats: {}, unlockedAt: {} };
}

function saveToDisk(save: AchievementSave): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch { /* ignore */ }
}

export function getAchievementState(): AchievementSave {
  return loadSave();
}

export function incrementStat(stat: string, amount = 1): void {
  const save = loadSave();
  save.stats[stat] = (save.stats[stat] || 0) + amount;
  saveToDisk(save);
}

export function getStat(stat: string): number {
  const save = loadSave();
  return save.stats[stat] || 0;
}

export function isUnlocked(id: string): boolean {
  const save = loadSave();
  return save.unlocked.includes(id);
}

export function getUnlockedCount(): number {
  return loadSave().unlocked.length;
}

export function getTotalCount(): number {
  return ACHIEVEMENTS.length;
}

/**
 * Build AchievementStats from current persisted stats + live PlayerState data.
 * Call this with the live PlayerState values for fields that are derived at runtime.
 */
export function buildStats(live: {
  level: number;
  currentGold: number;
  equipSlotsFilled: number;
  questsCompleted: number;
  zonesVisited: Set<string>;
  itemsCollected: number;
}): AchievementStats {
  const s = loadSave().stats;
  return {
    totalKills: s['totalKills'] || 0,
    bossKills: s['bossKills'] || 0,
    critCount: s['critCount'] || 0,
    dodgeCount: s['dodgeCount'] || 0,
    perfectWins: s['perfectWins'] || 0,
    zonesVisited: live.zonesVisited,
    chestsOpened: s['chestsOpened'] || 0,
    totalGoldEarned: s['totalGoldEarned'] || 0,
    currentGold: live.currentGold,
    itemsCollected: live.itemsCollected,
    equipSlotsFilled: live.equipSlotsFilled,
    level: live.level,
    questsCompleted: live.questsCompleted,
    dailyStreak: s['dailyStreak'] || 0,
    pvpWins: s['pvpWins'] || 0,
    battleRoyaleWins: s['battleRoyaleWins'] || 0,
    shopPurchases: s['shopPurchases'] || 0,
    itemsUpgraded: s['itemsUpgraded'] || 0,
    deaths: s['deaths'] || 0,
    skeletonKills: s['skeletonKills'] || 0,
    spiderKills: s['spiderKills'] || 0,
    ghostKills: s['ghostKills'] || 0,
    dragonKills: s['dragonKills'] || 0,
  };
}

/**
 * Check all achievements against current stats.
 * Returns array of newly unlocked achievements.
 */
export function checkAndUnlock(stats: AchievementStats): Achievement[] {
  const save = loadSave();
  const newlyUnlocked: Achievement[] = [];

  for (const ach of ACHIEVEMENTS) {
    if (save.unlocked.includes(ach.id)) continue;
    try {
      if (ach.check(stats)) {
        save.unlocked.push(ach.id);
        save.unlockedAt[ach.id] = Date.now();
        newlyUnlocked.push(ach);
      }
    } catch { /* safety */ }
  }

  if (newlyUnlocked.length > 0) {
    saveToDisk(save);
  }

  return newlyUnlocked;
}
