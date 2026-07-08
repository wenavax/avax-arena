/**
 * CAR(D) GAME — MatchEscrow (Fuji testnet) client bindings.
 * Deployed: 0xb25Eec9D2C2b4FA5AB099677233A86BD9Aa6EE50 (chainId 43113).
 */
import { parseAbi } from 'viem';

export const CARDGAME_ESCROW = (process.env.NEXT_PUBLIC_CARDGAME_ESCROW ||
  '0xb25Eec9D2C2b4FA5AB099677233A86BD9Aa6EE50') as `0x${string}`;

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
