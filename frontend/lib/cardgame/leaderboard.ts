/**
 * CAR(D) GAME — global leaderboard. SERVER ONLY.
 *
 * Public Fuji RPCs cap eth_getLogs at ~2048 blocks, so a leaderboard can't
 * sweep the chain per request. Instead MatchSettled events are indexed
 * incrementally into SQLite (the site's launchpad-indexer pattern): each API
 * hit advances the scan by a bounded number of chunks and serves aggregates
 * from the table — converges in a few requests, then stays one chunk behind
 * head at most.
 *
 * House bots are excluded from the board (they seat EVERY staked match and
 * would bury the humans).
 */
import 'server-only';
import { parseAbiItem, type Address } from 'viem';
import getDb from '@/lib/db';
import { pub, houseAddresses } from './server';
import { CARDGAME_ESCROW } from './escrow';

// Deploy block of escrow 0x3872…efe9 (creation-tx receipt 0xfb45b1…96b9).
const FIRST_BLOCK = 56_977_501n;
const CHUNK = 1_990n;              // under the ~2048-block getLogs cap
const MAX_CHUNKS_PER_CALL = 12;    // bounded work per API hit
// Current escrow economics (1 AVAX entry): payout per finishing place.
const PAYOUT_AVAX = [2, 1, 0.5, 0.3];

const settledEv = parseAbiItem('event MatchSettled(bytes32 indexed matchId, address[4] ranking)');

export interface BoardRow {
  address: string; races: number; wins: number; podiums: number; won: number; rank: number;
}

function db() {
  const d = getDb();
  d.exec(`CREATE TABLE IF NOT EXISTS cardgame_settles (
    match_id TEXT PRIMARY KEY,
    block INTEGER NOT NULL,
    p1 TEXT NOT NULL, p2 TEXT NOT NULL, p3 TEXT NOT NULL, p4 TEXT NOT NULL
  )`);
  d.exec(`CREATE TABLE IF NOT EXISTS cardgame_scan (key TEXT PRIMARY KEY, value INTEGER NOT NULL)`);
  return d;
}

/** Advance the settle index by up to MAX_CHUNKS_PER_CALL chunks. */
export async function advanceScan(): Promise<{ scannedTo: number; head: number; complete: boolean }> {
  const d = db();
  const head = await pub.getBlockNumber();
  const row = d.prepare(`SELECT value FROM cardgame_scan WHERE key='settles_to'`).get() as { value: number } | undefined;
  let from = row ? BigInt(row.value) + 1n : FIRST_BLOCK;
  if (from < FIRST_BLOCK) from = FIRST_BLOCK;

  const ins = d.prepare(`INSERT OR IGNORE INTO cardgame_settles (match_id, block, p1, p2, p3, p4) VALUES (?,?,?,?,?,?)`);
  const setTo = d.prepare(`INSERT INTO cardgame_scan (key, value) VALUES ('settles_to', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`);

  let chunks = 0;
  while (from <= head && chunks < MAX_CHUNKS_PER_CALL) {
    const to = from + CHUNK > head ? head : from + CHUNK;
    const logs = await pub.getLogs({ address: CARDGAME_ESCROW, event: settledEv, fromBlock: from, toBlock: to });
    for (const l of logs) {
      const r = (l.args.ranking ?? []) as readonly Address[];
      if (r.length === 4) ins.run(l.args.matchId, Number(l.blockNumber), ...r.map((a) => a.toLowerCase()));
    }
    setTo.run(Number(to));
    from = to + 1n;
    chunks += 1;
  }
  return { scannedTo: Number(from - 1n), head: Number(head), complete: from > head };
}

/** Aggregate the indexed settles into a ranked board (bots excluded). */
export function boardRows(limit = 20, me?: string): { rows: BoardRow[]; me: BoardRow | null; matches: number } {
  const rows = db().prepare(`SELECT p1, p2, p3, p4 FROM cardgame_settles`).all() as
    Array<{ p1: string; p2: string; p3: string; p4: string }>;
  const exclude = new Set(houseAddresses().map((a) => a.toLowerCase()));
  const agg = new Map<string, { races: number; wins: number; podiums: number; won: number }>();
  for (const m of rows) {
    [m.p1, m.p2, m.p3, m.p4].forEach((addr, place) => {
      if (exclude.has(addr)) return;
      const a = agg.get(addr) ?? { races: 0, wins: 0, podiums: 0, won: 0 };
      a.races += 1;
      if (place === 0) a.wins += 1;
      if (place <= 2) a.podiums += 1;
      a.won += PAYOUT_AVAX[place];
      agg.set(addr, a);
    });
  }
  const sorted = [...agg.entries()]
    .map(([address, a]) => ({ address, ...a, won: +a.won.toFixed(1), rank: 0 }))
    .sort((a, b) => b.wins - a.wins || b.won - a.won || a.races - b.races);
  sorted.forEach((r, i) => { r.rank = i + 1; });
  const meRow = me ? sorted.find((r) => r.address === me.toLowerCase()) ?? null : null;
  return { rows: sorted.slice(0, limit), me: meRow, matches: rows.length };
}
