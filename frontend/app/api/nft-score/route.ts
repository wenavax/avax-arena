import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { computeWalletScore, type WalletScore } from '@/lib/nftScore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/nft-score?wallet=0x…   → cüzdanın NFT skoru (10 dk SQLite cache)
 * GET /api/nft-score?leaderboard=1 → cache'lenmiş en yüksek 50 skor
 *
 * Varlık sayımı: Routescan keyless API (erc721-holdings + erc1155-holdings,
 * 2 rps limiti — cache bu yüzden agresif). Skor: lib/nftScore (küratörlü tier).
 */

const ROUTESCAN = 'https://api.routescan.io/v2/network/mainnet/evm/43114/address';
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_PAGES = 8; // 8×100 = 800 NFT/tip — makul tavan

function ensureTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS nft_scores (
      wallet     TEXT PRIMARY KEY,
      score      INTEGER NOT NULL,
      badge      TEXT NOT NULL,
      total_nfts INTEGER NOT NULL,
      payload    TEXT NOT NULL,
      ts         INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_nft_scores_score ON nft_scores(score DESC);
  `);
  return db;
}

async function fetchHoldings(wallet: string, kind: 'erc721-holdings' | 'erc1155-holdings'): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let url: string | null = `${ROUTESCAN}/${wallet}/${kind}?limit=100`;
  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      if (page === 0) throw new Error(`Routescan ${kind} ${res.status}`);
      break; // sayfalama ortasında kırılırsa eldekiyle devam
    }
    const d = (await res.json()) as {
      items?: { tokenAddress?: string; tokenQuantity?: string }[];
      link?: { next?: string; nextToken?: string };
    };
    for (const it of d.items ?? []) {
      const addr = (it.tokenAddress ?? '').toLowerCase();
      if (!addr) continue;
      const qty = kind === 'erc1155-holdings' ? Math.max(1, Number(it.tokenQuantity ?? 1) || 1) : 1;
      counts[addr] = (counts[addr] ?? 0) + qty;
    }
    const next = d.link?.next ?? d.link?.nextToken ?? null;
    url = next ? (next.startsWith('http') ? next : `${ROUTESCAN}/${wallet}/${kind}?limit=100&next=${encodeURIComponent(next)}`) : null;
  }
  return counts;
}

export async function GET(req: NextRequest) {
  const db = ensureTables();

  if (req.nextUrl.searchParams.get('leaderboard')) {
    const rows = db
      .prepare(`SELECT wallet, score, badge, total_nfts AS totalNfts, ts FROM nft_scores ORDER BY score DESC LIMIT 50`)
      .all();
    return NextResponse.json({ leaderboard: rows });
  }

  const wallet = (req.nextUrl.searchParams.get('wallet') || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
    return NextResponse.json({ error: 'geçerli bir cüzdan adresi ver (?wallet=0x…)' }, { status: 400 });
  }

  const cached = db.prepare(`SELECT payload, ts FROM nft_scores WHERE wallet = ?`).get(wallet) as
    | { payload: string; ts: number }
    | undefined;
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json({ ...(JSON.parse(cached.payload) as WalletScore), cached: true });
  }

  try {
    const [erc721, erc1155] = await Promise.all([
      fetchHoldings(wallet, 'erc721-holdings'),
      fetchHoldings(wallet, 'erc1155-holdings').catch(() => ({}) as Record<string, number>),
    ]);
    const counts: Record<string, number> = { ...erc721 };
    for (const [a, n] of Object.entries(erc1155)) counts[a] = (counts[a] ?? 0) + n;

    const result = computeWalletScore(wallet, counts);
    db.prepare(
      `INSERT INTO nft_scores (wallet, score, badge, total_nfts, payload, ts) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(wallet) DO UPDATE SET score = excluded.score, badge = excluded.badge,
         total_nfts = excluded.total_nfts, payload = excluded.payload, ts = excluded.ts`
    ).run(wallet, result.score, result.badge, result.totalNfts, JSON.stringify(result), Date.now());

    return NextResponse.json(result);
  } catch (err) {
    // Routescan geçici hata verirse bayat cache'i servis et
    if (cached) return NextResponse.json({ ...(JSON.parse(cached.payload) as WalletScore), cached: true, stale: true });
    return NextResponse.json(
      { error: err instanceof Error ? err.message.slice(0, 120) : 'skor hesaplanamadı' },
      { status: 502 }
    );
  }
}
