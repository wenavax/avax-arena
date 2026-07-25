/**
 * CAR(D) GAME — MatchEscrow (Fuji testnet) client bindings.
 * Deployed: 0x3872DAb4eB43170b4b5Be08a9796f75f3802efe9 (chainId 43113, 1 AVAX entry).
 * NOTE: the retired 0.01 AVAX contract 0xb25Eec9D2C2b4FA5AB099677233A86BD9Aa6EE50
 * is a DIFFERENT economics tier — do not use it as a fallback.
 * At mainnet cutover, update this fallback + CARDGAME_CHAIN_ID in the same commit
 * as the 43114 address is finalized (don't rely on the env var alone).
 */
import { parseAbi } from 'viem';

export const CARDGAME_ESCROW = (process.env.NEXT_PUBLIC_CARDGAME_ESCROW ||
  '0x3872DAb4eB43170b4b5Be08a9796f75f3802efe9') as `0x${string}`;

export const CARDGAME_CHAIN_ID = 43113; // Avalanche Fuji

export const ESCROW_ABI = parseAbi([
  'function entryFee() view returns (uint256)',
  'function joinMatch(bytes32 matchId) payable',
  'function withdrawPayout()',
  'function getStatus(bytes32 matchId) view returns (uint8)',
  'function paidCount(bytes32 matchId) view returns (uint8)',
  'function hasPaid(bytes32 matchId, address p) view returns (bool)',
  'function pendingPayouts(address) view returns (uint256)',
  'function getPlayers(bytes32 matchId) view returns (address[4])',
  'function matchPayout(bytes32 matchId) view returns (address treasury, uint256 platformFee, uint256[4] rewards)',
  'event PlayerJoined(bytes32 indexed matchId, address indexed player, uint8 paidCount)',
  'event MatchLocked(bytes32 indexed matchId)',
  'event MatchSettled(bytes32 indexed matchId, address[4] ranking)',
]);

export type MatchStatus = 'None' | 'Open' | 'Locked' | 'Settled' | 'Cancelled';
export const STATUS: MatchStatus[] = ['None', 'Open', 'Locked', 'Settled', 'Cancelled'];
