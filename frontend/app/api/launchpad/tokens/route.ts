import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { avalanche } from 'viem/chains';
import getDb from '@/lib/db';
import { LAUNCHPAD_FACTORY_ADDRESS, LAUNCHPAD_DEPLOY_BLOCK } from '@/lib/launchpad';
import { ACTIVE_RPC_URL } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/launchpad/tokens
 * Incremental TokenLaunched indexer: scans factory logs from the last-synced
 * block (SQLite cursor), upserts launches (id/token/pool/creator/metadataURI),
 * returns all rows newest-first. metadataURI only exists in the event — this
 * cache is the only way the UI can show launch descriptions.
 */

const TOKEN_LAUNCHED = parseAbiItem(
  'event TokenLaunched(uint256 indexed id, address indexed token, address indexed pool, address creator, string metadataURI)'
);

const CHUNK = 2000n; // public RPC getLogs range limit is 2048 blocks
const MAX_CHUNKS_PER_REQUEST = 30; // cap work per request; cursor resumes next call

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
  `);
  return db;
}

export async function GET() {
  const db = ensureTables();

  let synced = true;
  let syncError: string | null = null;

  try {
    const client = createPublicClient({ chain: avalanche, transport: http(ACTIVE_RPC_URL, { timeout: 15_000 }) });

    const cursorRow = db.prepare(`SELECT value FROM launchpad_sync WHERE key = 'cursor'`).get() as
      | { value: string }
      | undefined;
    let from = cursorRow ? BigInt(cursorRow.value) + 1n : LAUNCHPAD_DEPLOY_BLOCK;
    const latest = await client.getBlockNumber();

    const upsert = db.prepare(`
      INSERT INTO launchpad_tokens (id, token, pool, creator, metadata, block, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET metadata = excluded.metadata
    `);
    const setCursor = db.prepare(`
      INSERT INTO launchpad_sync (key, value) VALUES ('cursor', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    let chunks = 0;
    while (from <= latest && chunks < MAX_CHUNKS_PER_REQUEST) {
      const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
      const logs = await client.getLogs({
        address: LAUNCHPAD_FACTORY_ADDRESS,
        event: TOKEN_LAUNCHED,
        fromBlock: from,
        toBlock: to,
      });
      const now = Math.floor(Date.now() / 1000);
      for (const log of logs) {
        const { id, token, pool, creator, metadataURI } = log.args;
        if (id === undefined || !token || !pool || !creator) continue;
        upsert.run(Number(id), token, pool, creator, metadataURI ?? '', Number(log.blockNumber ?? 0n), now);
      }
      setCursor.run(to.toString());
      from = to + 1n;
      chunks++;
    }
    synced = from > latest;
  } catch (err) {
    // Serve whatever is cached; the next request resumes from the cursor.
    synced = false;
    syncError = err instanceof Error ? err.message.slice(0, 120) : 'sync failed';
  }

  const rows = db.prepare(`SELECT * FROM launchpad_tokens ORDER BY id DESC`).all();
  return NextResponse.json({ tokens: rows, synced, ...(syncError ? { syncError } : {}) });
}
