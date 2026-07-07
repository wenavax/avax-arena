import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { computeWalletScore, COLLECTION_BY_ADDRESS, type WalletScore, type HoldingInfo } from '@/lib/nftScore';

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
const ROUTESCAN_ETH = 'https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api';
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_PAGES = 8; // 8×100 = 800 NFT/tip — makul tavan
const ZERO = '0x0000000000000000000000000000000000000000';
const DAY = 86_400;

/** Bir puanlı koleksiyon için: cüzdanın hâlâ tuttuğu token'ların ortalama edinme
 *  yaşı + orijinal-mint oranı (from 0x0). tokennfttx tüm transfer'leri verir;
 *  her tokenId için son kayıt to==wallet ise elde sayılır. */
async function fetchAcquisition(wallet: string, collection: string): Promise<{ avgAgeDays?: number; minterRatio?: number }> {
  const url = `${ROUTESCAN_ETH}?module=account&action=tokennfttx&contractaddress=${collection}&address=${wallet}&page=1&offset=1000&sort=asc`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return {};
  const d = (await res.json()) as { status?: string; result?: unknown };
  if (d.status !== '1' || !Array.isArray(d.result)) return {};
  const w = wallet.toLowerCase();
  // her tokenId için son transfer'i tut (asc sıralı → sonuncusu geçerli durum)
  const last = new Map<string, { ts: number; from: string; to: string }>();
  for (const t of d.result as { tokenID?: string; timeStamp?: string; from?: string; to?: string }[]) {
    if (!t.tokenID) continue;
    last.set(t.tokenID, { ts: Number(t.timeStamp ?? 0), from: (t.from ?? '').toLowerCase(), to: (t.to ?? '').toLowerCase() });
  }
  const now = Math.floor(Date.now() / 1000);
  let ageSum = 0;
  let held = 0;
  let minted = 0;
  for (const rec of last.values()) {
    if (rec.to !== w) continue; // token cüzdandan çıkmış — elde değil
    held++;
    ageSum += Math.max(0, (now - rec.ts) / DAY);
    if (rec.from === ZERO) minted++;
  }
  if (held === 0) return {};
  return { avgAgeDays: ageSum / held, minterRatio: minted / held };
}

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

    // Yalnız PUANLI koleksiyonlar için holding-age + mint oranı çek (rate-limit dostu).
    const scoredAddrs = Object.keys(counts).filter((a) => COLLECTION_BY_ADDRESS[a.toLowerCase()]);
    const holdings: Record<string, HoldingInfo> = {};
    for (const addr of scoredAddrs) {
      let acq: { avgAgeDays?: number; minterRatio?: number } = {};
      try {
        acq = await fetchAcquisition(wallet, addr);
      } catch {
        /* age/mint alınamazsa nötr çarpanla devam */
      }
      holdings[addr] = { count: counts[addr], ...acq };
    }

    const result = computeWalletScore(wallet, holdings);
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
