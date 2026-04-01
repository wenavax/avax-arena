import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem, formatEther } from 'viem';
import { avalanche } from 'viem/chains';
import { recordBattleResult, migrateExistingPoints, checkAndArchivePreviousMonth } from '@/lib/db-queries';

export const dynamic = 'force-dynamic';

const BATTLE_ADDRESS = (process.env.NEXT_PUBLIC_BATTLE_ENGINE_ADDRESS || '0x0') as `0x${string}`;
const TEAM_BATTLE_ADDRESS = (process.env.NEXT_PUBLIC_TEAM_BATTLE_ENGINE_ADDRESS || '0x0') as `0x${string}`;

const client = createPublicClient({
  chain: avalanche,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL_1 || 'https://api.avax.network/ext/bc/C/rpc'),
});

let lastSyncedBlock = 0n;
let migrated = false;

const CHUNK_SIZE = 2000n;

async function getLogsChunked(address: `0x${string}`, event: ReturnType<typeof parseAbiItem>, fromBlock: bigint, toBlock: bigint) {
  const results: any[] = [];
  let from = fromBlock;
  while (from <= toBlock) {
    const to = from + CHUNK_SIZE - 1n > toBlock ? toBlock : from + CHUNK_SIZE - 1n;
    try {
      const logs = await client.getLogs({ address, event: event as any, fromBlock: from, toBlock: to });
      results.push(...logs);
    } catch { /* skip chunk */ }
    from = to + 1n;
  }
  return results;
}

export async function POST() {
  try {
    // One-time migration of existing points to new system
    if (!migrated) {
      migrateExistingPoints();
      checkAndArchivePreviousMonth();
      migrated = true;
    }

    const latestBlock = await client.getBlockNumber();
    const fromBlock = lastSyncedBlock > 0n
      ? lastSyncedBlock + 1n
      : (latestBlock > 10000n ? latestBlock - 10000n : 0n);

    if (fromBlock >= latestBlock) {
      return NextResponse.json({ synced: 0, message: 'Already up to date' });
    }

    const battleEvent = parseAbiItem('event BattleResolved(uint256 indexed battleId, address indexed winner, address indexed loser, uint256 payout)');
    const teamBattleEvent = parseAbiItem('event TeamBattleResolved(uint256 indexed battleId, address indexed winner, address indexed loser, uint8 score1, uint8 score2, uint256 payout)');

    const [battleLogs, teamLogs] = await Promise.all([
      getLogsChunked(BATTLE_ADDRESS, battleEvent, fromBlock, latestBlock),
      getLogsChunked(TEAM_BATTLE_ADDRESS, teamBattleEvent, fromBlock, latestBlock),
    ]);

    let synced = 0;

    for (const log of battleLogs) {
      const args = log.args as { winner?: string; loser?: string; payout?: bigint };
      if (!args.winner || !args.loser || !args.payout) continue;
      recordBattleResult(args.winner, args.loser, formatEther(args.payout), false);
      synced++;
    }

    for (const log of teamLogs) {
      const args = log.args as { winner?: string; loser?: string; payout?: bigint };
      if (!args.winner || !args.loser || !args.payout) continue;
      recordBattleResult(args.winner, args.loser, formatEther(args.payout), true);
      synced++;
    }

    lastSyncedBlock = latestBlock;

    return NextResponse.json({ synced, fromBlock: Number(fromBlock), toBlock: Number(latestBlock) });
  } catch (err) {
    console.error('[leaderboard/sync]', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
