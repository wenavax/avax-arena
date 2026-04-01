/* ---------------------------------------------------------------------------
 * Quest System Types — Shared across frontend components and hooks
 * ------------------------------------------------------------------------- */

export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Boss';
export type QuestStatus = 'available' | 'active' | 'completed';
export type QuestResult = 'success' | 'failure' | null;

/* ---- Generated quest (from deterministic RNG) ---- */

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

/* ---- Per-wallet progression ---- */

export interface QuestProgression {
  currentTier: number;
  totalCompleted: number;
  totalWon: number;
  totalXp: number;
}

/* ---- Current tier quest slot ---- */

export interface CurrentQuest {
  slot: number;
  status: QuestStatus;
  result: QuestResult;
  tokenId: number | null;
  xpGained: number;
  startedAt: string | null;
  completedAt: string | null;
  quest: GeneratedQuest;
}

/* ---- Tier history entry ---- */

export interface TierHistoryEntry {
  tier: number;
  slot0_result: string | null;
  slot1_result: string | null;
}

/* ---- Zone (from DB) ---- */

export interface QuestZone {
  id: number;
  name: string;
  element: string;
  description: string;
  lore: string;
}

/* ---- API Response: GET /api/v1/quests ---- */

export interface QuestDataResponse {
  zones: QuestZone[];
  progression: QuestProgression | null;
  currentQuests: CurrentQuest[];
  history: TierHistoryEntry[];
}

/* ---- API Response: POST /api/v1/quests/start ---- */

export interface QuestStartResponse {
  success: boolean;
  chainQuestId: number;
  quest: {
    name: string;
    loreIntro: string;
    enemyName: string;
    endsAt: string;
    durationSecs: number;
  };
}

/* ---- API Response: POST /api/v1/quests/complete ---- */

export interface QuestCompleteResponse {
  success: boolean;
  result: 'success' | 'failure' | 'abandoned';
  xpGained: number;
  lore: string;
  questName: string;
  enemyName: string;
  tierAdvanced: boolean;
  newTier: number;
  newQuests?: {
    quest: GeneratedQuest;
    slot: number;
  }[];
}

/* ---- On-chain types (from QuestEngine contract reads) ---- */

export interface OnChainProgression {
  tier: bigint;
  questsCompleted: bigint;
  questsWon: bigint;
  totalXP: bigint;
  tierProgress: bigint;
}

export interface OnChainActiveQuest {
  questId: bigint;
  tokenId: bigint;
  player: string;
  startedAt: bigint;
  endsAt: bigint;
  completed: boolean;
  won: boolean;
}

/* ---- Zone element config (for UI styling) ---- */

export interface ZoneElementConfig {
  gradient: string;
  glowColor: string;
  bgGradient: string;
  icon: string;
  color: string;
}

export const ZONE_ELEMENT_STYLES: Record<string, ZoneElementConfig> = {
  Fire: {
    gradient: 'from-red-500 to-orange-600',
    glowColor: 'rgba(255, 68, 0, 0.4)',
    bgGradient: 'from-red-500/20 to-orange-600/5',
    icon: '🔥',
    color: '#ff4400',
  },
  Water: {
    gradient: 'from-blue-500 to-cyan-600',
    glowColor: 'rgba(0, 150, 255, 0.4)',
    bgGradient: 'from-blue-500/20 to-cyan-600/5',
    icon: '💧',
    color: '#00aaff',
  },
  Wind: {
    gradient: 'from-green-500 to-emerald-600',
    glowColor: 'rgba(0, 255, 136, 0.4)',
    bgGradient: 'from-green-500/20 to-emerald-600/5',
    icon: '🌪️',
    color: '#00ff88',
  },
  Ice: {
    gradient: 'from-cyan-400 to-blue-500',
    glowColor: 'rgba(0, 240, 255, 0.4)',
    bgGradient: 'from-cyan-400/20 to-blue-500/5',
    icon: '❄️',
    color: '#00f0ff',
  },
  Earth: {
    gradient: 'from-amber-600 to-yellow-700',
    glowColor: 'rgba(180, 120, 0, 0.4)',
    bgGradient: 'from-amber-600/20 to-yellow-700/5',
    icon: '🌍',
    color: '#b47800',
  },
  Thunder: {
    gradient: 'from-yellow-400 to-purple-600',
    glowColor: 'rgba(255, 215, 0, 0.4)',
    bgGradient: 'from-yellow-400/20 to-purple-600/5',
    icon: '⚡',
    color: '#ffd700',
  },
  Shadow: {
    gradient: 'from-fuchsia-500 to-purple-600',
    glowColor: 'rgba(192, 38, 211, 0.4)',
    bgGradient: 'from-fuchsia-500/20 to-purple-600/5',
    icon: '🌑',
    color: '#c026d3',
  },
  Light: {
    gradient: 'from-orange-400 to-amber-400',
    glowColor: 'rgba(251, 191, 36, 0.4)',
    bgGradient: 'from-orange-400/20 to-amber-400/5',
    icon: '✨',
    color: '#fbbf24',
  },
};

/* ---- Difficulty config (for UI styling) ---- */

export interface DifficultyConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}

export const DIFFICULTY_STYLES: Record<Difficulty, DifficultyConfig> = {
  Easy: {
    label: 'Easy',
    color: '#00ff88',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    textColor: 'text-green-400',
  },
  Medium: {
    label: 'Medium',
    color: '#ffaa00',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-400',
  },
  Hard: {
    label: 'Hard',
    color: '#ff4444',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    textColor: 'text-red-400',
  },
  Boss: {
    label: 'Boss',
    color: '#c026d3',
    bgColor: 'bg-fuchsia-500/10',
    borderColor: 'border-fuchsia-500/30',
    textColor: 'text-fuchsia-400',
  },
};
