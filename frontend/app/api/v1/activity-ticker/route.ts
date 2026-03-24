import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem, formatEther, type Log } from 'viem';
import { avalanche } from 'viem/chains';

export const dynamic = 'force-dynamic';

const WARRIOR_ADDRESS = (process.env.NEXT_PUBLIC_ARENA_WARRIOR_ADDRESS || '0x0') as `0x${string}`;
const BATTLE_ADDRESS = (process.env.NEXT_PUBLIC_BATTLE_ENGINE_ADDRESS || '0x0') as `0x${string}`;
const TEAM_BATTLE_ADDRESS = (process.env.NEXT_PUBLIC_TEAM_BATTLE_ENGINE_ADDRESS || '0x0') as `0x${string}`;
const MARKETPLACE_ADDRESS = (process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS || '0x0') as `0x${string}`;
const QUEST_ADDRESS = (process.env.NEXT_PUBLIC_QUEST_ENGINE_ADDRESS || '0x0') as `0x${string}`;

const client = createPublicClient({
  chain: avalanche,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL_1 || 'https://api.avax.network/ext/bc/C/rpc'),
});

interface TickerEvent {
  type: 'mint' | 'battle' | 'team_battle' | 'sale' | 'quest' | 'merge' | 'info';
  message: string;
  txHash?: string;
  blockNumber?: number;
}

// Cache to avoid hammering RPC
let cachedEvents: TickerEvent[] = [];
let lastFetch = 0;
const CACHE_TTL = 60_000; // 60 seconds

const CHUNK_SIZE = 2000n;
const NUM_CHUNKS = 3; // 3 × 2000 = 6000 blocks (~50 min)

function shortenAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// Fetch logs in chunks to respect RPC 2048 block limit
async function getLogsChunked(params: { address: `0x${string}`; event: ReturnType<typeof parseAbiItem>; latestBlock: bigint }) {
  const results: Log[] = [];
  const promises = [];

  for (let i = 0; i < NUM_CHUNKS; i++) {
    const toBlock = params.latestBlock - (BigInt(i) * CHUNK_SIZE);
    const fromBlock = toBlock - CHUNK_SIZE + 1n;
    if (fromBlock < 0n) continue;

    promises.push(
      client.getLogs({
        address: params.address,
        event: params.event as any,
        fromBlock,
        toBlock,
      }).catch(() => [] as Log[])
    );
  }

  const chunks = await Promise.all(promises);
  for (const chunk of chunks) {
    results.push(...chunk);
  }
  return results;
}

export async function GET() {
  const now = Date.now();
  if (cachedEvents.length > 0 && now - lastFetch < CACHE_TTL) {
    return NextResponse.json(cachedEvents);
  }

  try {
    const latestBlock = await client.getBlockNumber();
    const events: TickerEvent[] = [];

    const mintEvent = parseAbiItem('event WarriorMinted(address indexed owner, uint256 indexed tokenId, uint8 attack, uint8 defense, uint8 speed, uint8 element, uint8 specialPower, uint256 powerScore)');
    const battleEvent = parseAbiItem('event BattleResolved(uint256 indexed battleId, address indexed winner, address indexed loser, uint256 payout)');
    const teamBattleEvent = parseAbiItem('event TeamBattleResolved(uint256 indexed battleId, address indexed winner, address indexed loser, uint8 score1, uint8 score2, uint256 payout)');
    const saleEvent = parseAbiItem('event ItemSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price)');
    const questEvent = parseAbiItem('event QuestCompleted(uint256 indexed questId, uint256 indexed tokenId, address indexed player, bool won, uint256 xpGained)');
    const mergeEvent = parseAbiItem('event WarriorsMerged(address indexed owner, uint256 indexed resultTokenId, uint256 burnedTokenId1, uint256 burnedTokenId2, uint8 attack, uint8 defense, uint8 speed, uint8 element, uint8 specialPower, uint16 level, uint256 powerScore)');

    // Fetch all event types in parallel, each chunked
    const [mintLogs, battleLogs, teamBattleLogs, saleLogs, questLogs, mergeLogs] = await Promise.all([
      getLogsChunked({ address: WARRIOR_ADDRESS, event: mintEvent, latestBlock }),
      getLogsChunked({ address: BATTLE_ADDRESS, event: battleEvent, latestBlock }),
      getLogsChunked({ address: TEAM_BATTLE_ADDRESS, event: teamBattleEvent, latestBlock }),
      getLogsChunked({ address: MARKETPLACE_ADDRESS, event: saleEvent, latestBlock }),
      getLogsChunked({ address: QUEST_ADDRESS, event: questEvent, latestBlock }),
      getLogsChunked({ address: WARRIOR_ADDRESS, event: mergeEvent, latestBlock }),
    ]);

    // Parse mint events
    for (const log of mintLogs) {
      const args = (log as any).args;
      const tokenId = Number(args?.tokenId ?? 0);
      const owner = args?.owner as string;
      events.push({
        type: 'mint',
        message: `${shortenAddr(owner)} minted Warrior #${tokenId}`,
        txHash: log.transactionHash ?? undefined,
        blockNumber: Number(log.blockNumber ?? 0),
      });
    }

    // Parse battle events
    for (const log of battleLogs) {
      const args = (log as any).args;
      const winner = args?.winner as string;
      const payout = args?.payout as bigint;
      const payoutStr = parseFloat(formatEther(payout)).toFixed(3);
      events.push({
        type: 'battle',
        message: `${shortenAddr(winner)} won a 1v1 battle — ${payoutStr} AVAX`,
        txHash: log.transactionHash ?? undefined,
        blockNumber: Number(log.blockNumber ?? 0),
      });
    }

    // Parse team battle events
    for (const log of teamBattleLogs) {
      const args = (log as any).args;
      const winner = args?.winner as string;
      const payout = args?.payout as bigint;
      const payoutStr = parseFloat(formatEther(payout)).toFixed(3);
      events.push({
        type: 'team_battle',
        message: `${shortenAddr(winner)} won a 3v3 battle — ${payoutStr} AVAX`,
        txHash: log.transactionHash ?? undefined,
        blockNumber: Number(log.blockNumber ?? 0),
      });
    }

    // Parse sale events
    for (const log of saleLogs) {
      const args = (log as any).args;
      const tokenId = Number(args?.tokenId ?? 0);
      const buyer = args?.buyer as string;
      const price = args?.price as bigint;
      const priceStr = parseFloat(formatEther(price)).toFixed(3);
      events.push({
        type: 'sale',
        message: `Warrior #${tokenId} sold to ${shortenAddr(buyer)} for ${priceStr} AVAX`,
        txHash: log.transactionHash ?? undefined,
        blockNumber: Number(log.blockNumber ?? 0),
      });
    }

    // Parse quest completion events
    for (const log of questLogs) {
      const args = (log as any).args;
      const tokenId = Number(args?.tokenId ?? 0);
      const won = args?.won as boolean;
      const xp = Number(args?.xpGained ?? 0);
      events.push({
        type: 'quest',
        message: won
          ? `Warrior #${tokenId} conquered a dungeon — +${xp} XP`
          : `Warrior #${tokenId} fell in the dungeon — +${xp} XP`,
        txHash: log.transactionHash ?? undefined,
        blockNumber: Number(log.blockNumber ?? 0),
      });
    }

    // Parse merge events
    for (const log of mergeLogs) {
      const args = (log as any).args;
      const resultId = Number(args?.resultTokenId ?? 0);
      const burned1 = Number(args?.burnedTokenId1 ?? 0);
      const burned2 = Number(args?.burnedTokenId2 ?? 0);
      const pwr = Number(args?.powerScore ?? 0);
      events.push({
        type: 'merge',
        message: `Warriors #${burned1} + #${burned2} fused into #${resultId} — PWR ${pwr}`,
        txHash: log.transactionHash ?? undefined,
        blockNumber: Number(log.blockNumber ?? 0),
      });
    }

    // Sort by block number (newest first), limit to 30
    events.sort((a, b) => (b.blockNumber ?? 0) - (a.blockNumber ?? 0));
    const result = events.slice(0, 30);

    cachedEvents = result;
    lastFetch = now;

    return NextResponse.json({ events: result, latestBlock: Number(latestBlock), serverTime: Date.now() });
  } catch (err) {
    console.error('[activity-ticker] Error:', err);
    return NextResponse.json(cachedEvents);
  }
}
