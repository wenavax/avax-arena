// ─── Pluggable economy ───
// The game core is TOKEN-FREE. All currency concerns go through this interface,
// so the loop never references FSB/AVAX directly. Default = FreeEconomy (soft,
// off-chain "Frost Shards", no token, no contract). An on-chain FSB/AVAX adapter
// can be dropped in later as an optional "Ranked / Staked" mode WITHOUT touching
// engine, run, or combat logic.
import type { Rarity } from './types';

export interface EconomyProvider {
  id: string;
  /** Reward currency label shown in UI ("Frost Shards", "FSB", "AVAX"). */
  rewardLabel: string;
  /** Whether costs/rewards settle on-chain (false = pure off-chain soft currency). */
  isOnChain: boolean;
  /** Cost to start a run (0 = free). */
  entryCost: number;
  /** Cost to draft/reroll a provision of a rarity (0 = free pick, the default). */
  provisionCost(rarity: Rarity): number;
  /** Soft reward granted for clearing a floor. */
  rewardForFloor(floor: number, elite: boolean): number;
}

/** DEFAULT — no token. Relics are free picks; reward is soft off-chain "Frost Shards". */
export const FreeEconomy: EconomyProvider = {
  id: 'free',
  rewardLabel: 'Frost Shards',
  isOnChain: false,
  entryCost: 0,
  provisionCost: () => 0,
  rewardForFloor: (floor, elite) => Math.round(8 * floor * (elite ? 1.6 : 1)),
};

/**
 * OPTIONAL on-chain adapter — wired in Phase 1 (ExpeditionEscrow.sol). Provisions
 * cost FSB (burned = sink), reward is FSB (from the buyback-funded prize pool).
 * Kept here as the seam; the core game never depends on it.
 * NOTE: on-chain settlement is handled by the escrow contract + resolver; these
 * numbers are only the UI-facing costs/curve.
 */
const FSB_PROVISION_COST: Record<Rarity, number> = {
  common: 5, uncommon: 12, rare: 30, epic: 75, legendary: 180,
};
export const FsbEconomy: EconomyProvider = {
  id: 'fsb',
  rewardLabel: 'FSB',
  isOnChain: true,
  entryCost: 25,
  provisionCost: (rarity) => FSB_PROVISION_COST[rarity],
  rewardForFloor: (floor, elite) => Math.round(8 * floor * (elite ? 1.6 : 1)),
};

export const ECONOMIES: Record<string, EconomyProvider> = {
  free: FreeEconomy,
  fsb: FsbEconomy,
};
