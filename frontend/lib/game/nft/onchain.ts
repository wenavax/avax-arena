// ─── On-Chain Integration for Avalanche World ───
// Handles: PlayerProgress save/load, Hero XP sync, Leaderboard updates

export const PROGRESS_CONTRACT = '0xDe4e38AE428ef4FA74FFe4ae5b9890B6eA6d0DFc' as const;
export const HERO_CONTRACT = '0x8b43A80A8EeBC2bf27EAa934B870AF1742f1e523' as const;
export const LEADERBOARD_CONTRACT = '0x9E61443C983cDd72e77946C2e4631eAe7bC6Da46' as const;

export const PROGRESS_ABI = [
  {
    inputs: [
      { name: 'level', type: 'uint16' }, { name: 'zone', type: 'uint8' },
      { name: 'xp', type: 'uint32' }, { name: 'gold', type: 'uint32' },
      { name: 'questFlags', type: 'uint16' }, { name: 'weaponTier', type: 'uint8' },
      { name: 'armorTier', type: 'uint8' }, { name: 'accessoryTier', type: 'uint8' },
      { name: 'ringTier', type: 'uint8' }, { name: 'totalKills', type: 'uint32' },
      { name: 'bossKills', type: 'uint16' }, { name: 'heroTokenId', type: 'uint16' },
    ],
    name: 'saveProgress', outputs: [], stateMutability: 'nonpayable', type: 'function',
  },
  {
    inputs: [{ name: 'player', type: 'address' }],
    name: 'loadProgress',
    outputs: [{
      components: [
        { name: 'level', type: 'uint16' }, { name: 'zone', type: 'uint8' },
        { name: 'xp', type: 'uint32' }, { name: 'gold', type: 'uint32' },
        { name: 'questFlags', type: 'uint16' }, { name: 'weaponTier', type: 'uint8' },
        { name: 'armorTier', type: 'uint8' }, { name: 'accessoryTier', type: 'uint8' },
        { name: 'ringTier', type: 'uint8' }, { name: 'totalKills', type: 'uint32' },
        { name: 'bossKills', type: 'uint16' }, { name: 'lastSave', type: 'uint40' },
        { name: 'heroTokenId', type: 'uint16' },
      ],
      name: '', type: 'tuple',
    }],
    stateMutability: 'view', type: 'function',
  },
  {
    inputs: [{ name: 'player', type: 'address' }],
    name: 'hasProgress', outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view', type: 'function',
  },
] as const;

export const HERO_XP_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'amount', type: 'uint32' }],
    name: 'addXp', outputs: [], stateMutability: 'nonpayable', type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'statChoice', type: 'uint8' }],
    name: 'levelUp', outputs: [], stateMutability: 'nonpayable', type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getHero',
    outputs: [{
      components: [
        { name: 'element', type: 'uint8' }, { name: 'rarity', type: 'uint8' },
        { name: 'level', type: 'uint16' }, { name: 'xp', type: 'uint32' },
        { name: 'atk', type: 'uint16' }, { name: 'def', type: 'uint16' },
        { name: 'spd', type: 'uint16' }, { name: 'baseAtk', type: 'uint16' },
        { name: 'baseDef', type: 'uint16' }, { name: 'baseSpd', type: 'uint16' },
      ],
      name: '', type: 'tuple',
    }],
    stateMutability: 'view', type: 'function',
  },
] as const;

export const LEADERBOARD_ABI = [
  {
    inputs: [{ name: 'wallet', type: 'address' }, { name: 'score', type: 'uint256' }],
    name: 'updateScore', outputs: [], stateMutability: 'nonpayable', type: 'function',
  },
] as const;

// ── Zone index mapping ──
export const ZONE_INDEX: Record<string, number> = {
  Town: 0, IsoTownScene: 0,
  Forest: 1, IsoForestScene: 1,
  Dungeon: 2, IsoDungeonScene: 2,
  IceCave: 3, IsoIceCaveScene: 3,
  Volcano: 4, IsoVolcanoScene: 4,
};

// ── Quest flags bitmask ──
export function questsToBitmask(quests: { id: string; turnedIn: boolean }[]): number {
  const questIds = [
    'skeleton_hunt', 'dungeon_boss', 'spider_infestation', 'ghost_hunters',
    'dragon_revenge', 'ancient_artifact', 'supply_run', 'market_research',
  ];
  let mask = 0;
  for (let i = 0; i < questIds.length; i++) {
    const q = quests.find(x => x.id === questIds[i]);
    if (q?.turnedIn) mask |= (1 << i);
  }
  return mask;
}

// ── Equipment tier from item stats ──
export function equipTier(item: { stat?: { atk?: number; def?: number; spd?: number } } | null): number {
  if (!item) return 0;
  const total = (item.stat?.atk || 0) + (item.stat?.def || 0) + (item.stat?.spd || 0);
  if (total >= 16) return 5;
  if (total >= 11) return 4;
  if (total >= 7) return 3;
  if (total >= 4) return 2;
  if (total >= 1) return 1;
  return 0;
}
