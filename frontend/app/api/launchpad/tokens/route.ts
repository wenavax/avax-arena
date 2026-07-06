import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem, erc20Abi } from 'viem';
import getDb from '@/lib/db';
import {
  LAUNCHPAD_FACTORY_ADDRESS,
  LAUNCHPAD_DEPLOY_BLOCK,
  LAUNCHPAD_VIEM_CHAIN,
  LAUNCHPAD_RPC,
  LAUNCHPAD_CHAIN_ID,
} from '@/lib/launchpad';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/launchpad/tokens            → launches + 24h volume stats (indexer sync runs inline)
 * GET /api/launchpad/tokens?pool=0x…   → full trade history for one pool (price-chart data)
 *
 * Incremental SQLite indexer over factory TokenLaunched + per-pool Buy/Sell
 * events. metadataURI lives only in events; trade history powers the real
 * price chart and trending sort. Chain-aware (mainnet default, Fuji rehearsal).
 */

const TOKEN_LAUNCHED = parseAbiItem(
  'event TokenLaunched(uint256 indexed id, address indexed token, address indexed pool, address creator, string metadataURI)'
);
const BUY_EVENT = parseAbiItem(
  'event Buy(address indexed buyer, uint256 avaxIn, uint256 fee, uint256 tokensOut, uint256 reserveAfter)'
);
const SELL_EVENT = parseAbiItem(
  'event Sell(address indexed seller, uint256 tokensIn, uint256 fee, uint256 avaxOut, uint256 reserveAfter)'
);
const GRADUATED_EVENT = parseAbiItem('event Graduated(uint256 avaxToLp, uint256 tokensToLp)');
const STATE_ABI = parseAbiItem('function state() view returns (uint8)');

const CHUNK = 2000n; // public RPC getLogs range limit is 2048 blocks
const MAX_CHUNKS_PER_REQUEST = 30;
const MAX_BLOCK_TS_LOOKUPS_PER_CHUNK = 15;

function ensureTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS launchpad_tokens (
      id       INTEGER PRIMARY KEY,
      token    TEXT NOT NULL,
      pool     TEXT NOT NULL,
      creator  TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '',
      block    INTEGER NOT NULL,
      ts       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_launchpad_tokens_pool ON launchpad_tokens(pool);
    CREATE TABLE IF NOT EXISTS launchpad_sync (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS launchpad_trades (
      chain         INTEGER NOT NULL,
      pool          TEXT NOT NULL,
      kind          TEXT NOT NULL,            -- 'buy' | 'sell'
      account       TEXT NOT NULL,
      avax          TEXT NOT NULL,            -- wei (net of fee), string
      avax_f        REAL NOT NULL,            -- AVAX float, for SQL aggregation
      tokens        TEXT NOT NULL,            -- wei, string
      reserve_after TEXT NOT NULL,            -- realAvax after trade (price basis)
      block         INTEGER NOT NULL,
      ts            INTEGER NOT NULL,
      tx            TEXT NOT NULL,
      logi          INTEGER NOT NULL,
      UNIQUE(chain, tx, logi)
    );
    CREATE INDEX IF NOT EXISTS idx_launchpad_trades_pool ON launchpad_trades(chain, pool, block);
  `);
  // Older deployments miss these columns — add idempotently.
  for (const col of [
    `chain INTEGER NOT NULL DEFAULT 43114`,
    `graduated INTEGER NOT NULL DEFAULT 0`,
    `name TEXT NOT NULL DEFAULT ''`,
    `symbol TEXT NOT NULL DEFAULT ''`,
  ]) {
    try {
      db.exec(`ALTER TABLE launchpad_tokens ADD COLUMN ${col}`);
    } catch {
      /* column already exists */
    }
  }
  return db;
}

async function sync(db: ReturnType<typeof getDb>): Promise<{ synced: boolean; syncError: string | null }> {
  let synced = true;
  let syncError: string | null = null;
  try {
    const client = createPublicClient({ chain: LAUNCHPAD_VIEM_CHAIN, transport: http(LAUNCHPAD_RPC, { timeout: 15_000 }) });

    const cursorKey = `cursor_${LAUNCHPAD_CHAIN_ID}`;
    let cursorRow = db.prepare(`SELECT value FROM launchpad_sync WHERE key = ?`).get(cursorKey) as
      | { value: string }
      | undefined;
    if (!cursorRow && LAUNCHPAD_CHAIN_ID === 43114) {
      // adopt the pre-chain-column cursor from v1
      cursorRow = db.prepare(`SELECT value FROM launchpad_sync WHERE key = 'cursor'`).get() as
        | { value: string }
        | undefined;
    }
    let from = cursorRow ? BigInt(cursorRow.value) + 1n : LAUNCHPAD_DEPLOY_BLOCK;
    const latest = await client.getBlockNumber();

    const upsertToken = db.prepare(`
      INSERT INTO launchpad_tokens (id, token, pool, creator, metadata, block, ts, chain)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET metadata = excluded.metadata, chain = excluded.chain
    `);
    const insertTrade = db.prepare(`
      INSERT OR IGNORE INTO launchpad_trades
        (chain, pool, kind, account, avax, avax_f, tokens, reserve_after, block, ts, tx, logi)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const setCursor = db.prepare(`
      INSERT INTO launchpad_sync (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const setTokenInfo = db.prepare(`UPDATE launchpad_tokens SET name = ?, symbol = ? WHERE chain = ? AND id = ?`);
    const setGraduated = db.prepare(`UPDATE launchpad_tokens SET graduated = 1 WHERE chain = ? AND lower(pool) = ?`);

    const poolSet = new Set<string>(
      (db.prepare(`SELECT pool FROM launchpad_tokens WHERE chain = ?`).all(LAUNCHPAD_CHAIN_ID) as { pool: string }[]).map(
        (r) => r.pool.toLowerCase()
      )
    );

    let chunks = 0;
    while (from <= latest && chunks < MAX_CHUNKS_PER_REQUEST) {
      const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
      const now = Math.floor(Date.now() / 1000);

      // 1) new launches in this range
      const tlLogs = await client.getLogs({
        address: LAUNCHPAD_FACTORY_ADDRESS,
        event: TOKEN_LAUNCHED,
        fromBlock: from,
        toBlock: to,
      });
      for (const log of tlLogs) {
        const { id, token, pool, creator, metadataURI } = log.args;
        if (id === undefined || !token || !pool || !creator) continue;
        upsertToken.run(Number(id), token, pool, creator, metadataURI ?? '', Number(log.blockNumber ?? 0n), now, LAUNCHPAD_CHAIN_ID);
        poolSet.add(pool.toLowerCase());
        try {
          const [nm, sym] = await Promise.all([
            client.readContract({ address: token, abi: erc20Abi, functionName: 'name' }),
            client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
          ]);
          setTokenInfo.run(nm, sym, LAUNCHPAD_CHAIN_ID, Number(id));
        } catch {
          /* backfill doldurur */
        }
      }

      // 2) trades on all known pools in the same range (incl. pools launched in this chunk)
      if (poolSet.size > 0) {
        const tradeLogs = await client.getLogs({
          address: [...poolSet] as `0x${string}`[],
          events: [BUY_EVENT, SELL_EVENT, GRADUATED_EVENT],
          fromBlock: from,
          toBlock: to,
        });
        // resolve real timestamps for the (few) blocks that contain trades
        const tsByBlock = new Map<string, number>();
        const uniqueBlocks = [...new Set(tradeLogs.map((l) => (l.blockNumber ?? 0n).toString()))].slice(
          0,
          MAX_BLOCK_TS_LOOKUPS_PER_CHUNK
        );
        await Promise.all(
          uniqueBlocks.map(async (bn) => {
            try {
              const b = await client.getBlock({ blockNumber: BigInt(bn) });
              tsByBlock.set(bn, Number(b.timestamp));
            } catch {
              /* fallback below */
            }
          })
        );
        for (const log of tradeLogs) {
          if (log.eventName === 'Graduated') {
            setGraduated.run(LAUNCHPAD_CHAIN_ID, log.address.toLowerCase());
            continue;
          }
          const bn = (log.blockNumber ?? 0n).toString();
          const ts = tsByBlock.get(bn) ?? now;
          const a = log.args as Record<string, bigint | string>;
          if (log.eventName === 'Buy') {
            const avax = (a.avaxIn as bigint) ?? 0n;
            insertTrade.run(
              LAUNCHPAD_CHAIN_ID, log.address.toLowerCase(), 'buy', a.buyer as string,
              avax.toString(), Number(avax) / 1e18, ((a.tokensOut as bigint) ?? 0n).toString(),
              ((a.reserveAfter as bigint) ?? 0n).toString(), Number(log.blockNumber ?? 0n), ts,
              log.transactionHash, Number(log.logIndex ?? 0)
            );
          } else {
            const avax = (a.avaxOut as bigint) ?? 0n;
            insertTrade.run(
              LAUNCHPAD_CHAIN_ID, log.address.toLowerCase(), 'sell', a.seller as string,
              avax.toString(), Number(avax) / 1e18, ((a.tokensIn as bigint) ?? 0n).toString(),
              ((a.reserveAfter as bigint) ?? 0n).toString(), Number(log.blockNumber ?? 0n), ts,
              log.transactionHash, Number(log.logIndex ?? 0)
            );
          }
        }
      }

      setCursor.run(cursorKey, to.toString());
      from = to + 1n;
      chunks++;
    }
    synced = from > latest;

    // Backfill: bu kod deploy edilmeden ONCE launch/graduate olmus satirlar
    const stale = db
      .prepare(`SELECT id, token, pool, name, graduated FROM launchpad_tokens WHERE chain = ? AND (name = '' OR graduated = 0) LIMIT 6`)
      .all(LAUNCHPAD_CHAIN_ID) as { id: number; token: string; pool: string; name: string; graduated: number }[];
    for (const row of stale) {
      try {
        if (!row.name) {
          const [nm, sym] = await Promise.all([
            client.readContract({ address: row.token as `0x${string}`, abi: erc20Abi, functionName: 'name' }),
            client.readContract({ address: row.token as `0x${string}`, abi: erc20Abi, functionName: 'symbol' }),
          ]);
          setTokenInfo.run(nm, sym, LAUNCHPAD_CHAIN_ID, row.id);
        }
        if (!row.graduated) {
          const st = await client.readContract({ address: row.pool as `0x${string}`, abi: [STATE_ABI], functionName: 'state' });
          if (Number(st) === 1) setGraduated.run(LAUNCHPAD_CHAIN_ID, row.pool.toLowerCase());
        }
      } catch {
        /* sonraki istekte tekrar denenir */
      }
    }
  } catch (err) {
    synced = false;
    syncError = err instanceof Error ? err.message.slice(0, 120) : 'sync failed';
  }
  return { synced, syncError };
}

export async function GET(req: NextRequest) {
  const db = ensureTables();
  const { synced, syncError } = await sync(db);

  const pool = req.nextUrl.searchParams.get('pool');
  if (pool && /^0x[0-9a-fA-F]{40}$/.test(pool)) {
    const trades = db
      .prepare(
        `SELECT kind, account, avax, tokens, reserve_after AS reserveAfter, block, ts, tx
         FROM launchpad_trades WHERE chain = ? AND pool = ? ORDER BY block ASC, logi ASC LIMIT 2000`
      )
      .all(LAUNCHPAD_CHAIN_ID, pool.toLowerCase());
    return NextResponse.json({ trades, synced, ...(syncError ? { syncError } : {}) });
  }

  const rows = db
    .prepare(`SELECT * FROM launchpad_tokens WHERE chain = ? ORDER BY id DESC`)
    .all(LAUNCHPAD_CHAIN_ID) as Record<string, unknown>[];
  const dayAgo = Math.floor(Date.now() / 1000) - 86_400;
  const volRows = db
    .prepare(
      `SELECT pool, SUM(avax_f) AS vol24h, COUNT(*) AS trades24h
       FROM launchpad_trades WHERE chain = ? AND ts >= ? GROUP BY pool`
    )
    .all(LAUNCHPAD_CHAIN_ID, dayAgo) as { pool: string; vol24h: number; trades24h: number }[];
  const volByPool = new Map(volRows.map((v) => [v.pool, v]));
  const tokens = rows.map((r) => {
    const v = volByPool.get(String(r.pool).toLowerCase());
    return { ...r, vol24h: v?.vol24h ?? 0, trades24h: v?.trades24h ?? 0 };
  });
  return NextResponse.json({ tokens, synced, ...(syncError ? { syncError } : {}) });
}
