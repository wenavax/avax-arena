export const ELEMENTS = [
  { id: 0, name: 'Fire', emoji: '🔥', color: 'from-red-500 to-orange-600', glowColor: 'rgba(255, 68, 0, 0.3)', bgGradient: 'from-red-500/10 to-orange-600/5' },
  { id: 1, name: 'Water', emoji: '💧', color: 'from-blue-500 to-cyan-600', glowColor: 'rgba(0, 150, 255, 0.3)', bgGradient: 'from-blue-500/10 to-cyan-600/5' },
  { id: 2, name: 'Wind', emoji: '🌪️', color: 'from-green-500 to-emerald-600', glowColor: 'rgba(0, 255, 136, 0.3)', bgGradient: 'from-green-500/10 to-emerald-600/5' },
  { id: 3, name: 'Ice', emoji: '❄️', color: 'from-cyan-400 to-blue-500', glowColor: 'rgba(0, 240, 255, 0.3)', bgGradient: 'from-cyan-400/10 to-blue-500/5' },
  { id: 4, name: 'Earth', emoji: '🌍', color: 'from-amber-600 to-yellow-700', glowColor: 'rgba(180, 120, 0, 0.3)', bgGradient: 'from-amber-600/10 to-yellow-700/5' },
  { id: 5, name: 'Thunder', emoji: '⚡', color: 'from-yellow-400 to-purple-600', glowColor: 'rgba(255, 215, 0, 0.3)', bgGradient: 'from-yellow-400/10 to-purple-600/5' },
  { id: 6, name: 'Shadow', emoji: '🌑', color: 'from-fuchsia-400 to-purple-400', glowColor: 'rgba(192, 38, 211, 0.3)', bgGradient: 'from-purple-500/10 to-fuchsia-500/5' },
  { id: 7, name: 'Light', emoji: '✨', color: 'from-orange-400 to-amber-400', glowColor: 'rgba(251, 191, 36, 0.3)', bgGradient: 'from-orange-400/10 to-amber-400/5' },
] as const;

export type Element = (typeof ELEMENTS)[number];

export const ELEMENT_ADVANTAGES: Record<number, number> = {
  0: 2, // Fire beats Wind
  2: 3, // Wind beats Ice
  3: 1, // Ice beats Water
  1: 0, // Water beats Fire
  4: 5, // Earth beats Thunder
  5: 6, // Thunder beats Shadow
  6: 7, // Shadow beats Light
  7: 4, // Light beats Earth
};

export const MINT_PRICE = '0.01'; // AVAX
export const MERGE_PRICE = '0.005'; // AVAX
export const MIN_BATTLE_STAKE = '0.005'; // AVAX
export const MIN_TEAM_BATTLE_STAKE = '0.01'; // AVAX
export const PLATFORM_FEE_PERCENT = 2.5;

export const CONTRACT_ADDRESSES = {
  frostbiteWarrior: process.env.NEXT_PUBLIC_ARENA_WARRIOR_ADDRESS || '0x0000000000000000000000000000000000000000',
  battleEngine: process.env.NEXT_PUBLIC_BATTLE_ENGINE_ADDRESS || '0x0000000000000000000000000000000000000000',
  frostbiteToken: process.env.NEXT_PUBLIC_ARENA_TOKEN_ADDRESS || '0x0000000000000000000000000000000000000000',
  tournament: process.env.NEXT_PUBLIC_TOURNAMENT_ADDRESS || '0x0000000000000000000000000000000000000000',
  leaderboard: process.env.NEXT_PUBLIC_LEADERBOARD_ADDRESS || '0x0000000000000000000000000000000000000000',
  rewardVault: process.env.NEXT_PUBLIC_REWARD_VAULT_ADDRESS || '0x0000000000000000000000000000000000000000',
  marketplace: process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS || '0x0000000000000000000000000000000000000000',
  teamBattleEngine: process.env.NEXT_PUBLIC_TEAM_BATTLE_ENGINE_ADDRESS || '0x0000000000000000000000000000000000000000',
  questEngine: process.env.NEXT_PUBLIC_QUEST_ENGINE_ADDRESS || '0x0000000000000000000000000000000000000000',
  batchMinter: process.env.NEXT_PUBLIC_BATCH_MINTER_ADDRESS || '0x0000000000000000000000000000000000000000',
  erc6551Registry: '0x000000006551c19487814612e58FE06813775758',
  frostbiteAccount: process.env.NEXT_PUBLIC_FROSTBITE_ACCOUNT_ADDRESS || '0x0000000000000000000000000000000000000000',
  frostbiteAccountV2: process.env.NEXT_PUBLIC_FROSTBITE_ACCOUNT_V2_ADDRESS || '0x0000000000000000000000000000000000000000',
  frostbiteAccountV3: process.env.NEXT_PUBLIC_FROSTBITE_ACCOUNT_V3_ADDRESS || '0x0000000000000000000000000000000000000000',
  identityRegistry: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS || '0x0000000000000000000000000000000000000000',
  reputationRegistry: process.env.NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS || '0x0000000000000000000000000000000000000000',
} as const;

export const AVALANCHE_CHAIN_ID = 43114;
export const IS_MAINNET = true;
export const ACTIVE_CHAIN_ID = AVALANCHE_CHAIN_ID;
export const ACTIVE_NETWORK_NAME = 'Avalanche C-Chain';
export const EXPLORER_URL = 'https://snowtrace.io';

export const ACTIVE_RPC_URLS = [
  process.env.NEXT_PUBLIC_MAINNET_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
  'https://rpc.ankr.com/avalanche',
  'https://avalanche-c-chain-rpc.publicnode.com',
];

export const ACTIVE_RPC_URL = ACTIVE_RPC_URLS[0];
