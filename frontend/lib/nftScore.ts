/* ---------------------------------------------------------------------------
 * NFT Wallet Score — Avalanche koleksiyon-bazlı cüzdan puanlama.
 *
 * Tier tablosu ELLE KÜRATÖRLÜ (tasarım kararı: Avalanche'ta sıfır-satışlı sahte
 * floor'lar var, otomatik floor→tier manipüle edilir). Referans verisi:
 * Salvor.io 7g hacim sıralaması (2026-07-07 snapshot'ı, scripts/data-salvor-
 * snapshot-20260707.json + scripts/salvor-reference.py ile tazelenir) +
 * docs/superpowers/specs/2026-07-07-avax-nft-wallet-scoring.md araştırması.
 *
 * Formül: Score = FrostBonus(×1.2) × DiversityBonus(≤×1.25)
 *                 × Σ [λ_likidite × W_tier × min(adet, 20)^0.7]
 * ------------------------------------------------------------------------- */

export type NftTier = 'FROST' | 'S' | 'A' | 'B' | 'C';

export interface ScoredCollection {
  address: string; // lowercase
  name: string;
  tier: NftTier;
  weight: number; // W_tier (FROST'ta koleksiyona özel)
  lambda: number; // likidite çarpanı (şüpheli/illikit koleksiyonlarda düşük)
  erc1155?: boolean;
  floorAvax?: number; // güncel floor (Salvor snapshot 2026-07-07); floor çarpanının temeli
  mintPriceAvax?: number; // orijinal mint fiyatı (biliniyorsa); mint-bonusunu ölçekler
}

export const TIER_WEIGHTS: Record<Exclude<NftTier, 'FROST'>, number> = { S: 30, A: 12, B: 5, C: 1 };

// floorAvax: Salvor 2026-07-07 snapshot (floor.all); mintPriceAvax: bilinen orijinal mint fiyatı.
export const SCORED_COLLECTIONS: ScoredCollection[] = [
  // — FROST: Frostbite'ın kendi koleksiyonları (özel ağırlıklar) —
  { address: '0x8b43a80a8eebc2bf27eaa934b870af1742f1e523', name: 'Frostbite Heroes', tier: 'FROST', weight: 40, lambda: 1, mintPriceAvax: 1 },
  { address: '0x958d7b064224453bb5134279777e5d907b405de2', name: 'Arena Warriors', tier: 'FROST', weight: 15, lambda: 1, mintPriceAvax: 0.01 },
  { address: '0xa121ad68f54347215c67ad9a254c8dbbd653d5e6', name: 'Frostbite Items', tier: 'FROST', weight: 6, lambda: 1, erc1155: true, mintPriceAvax: 0.2 },
  // — S: mavi-çipler (Salvor tüm-zaman hacim >100K AVAX veya floor>10 + canlı market) —
  { address: '0x54c800d2331e10467143911aabca092d68bf4166', name: 'Dokyo', tier: 'S', weight: 30, lambda: 1, floorAvax: 0.99 },
  { address: '0x8927985b358692815e18f2138964679dca5d3b79', name: 'chikn', tier: 'S', weight: 30, lambda: 1, floorAvax: 3.3 },
  { address: '0xce4fee23ab35d0d9a4b6b644881ddd8adebeb300', name: 'The Salvors', tier: 'S', weight: 30, lambda: 1, floorAvax: 2.15 },
  { address: '0x204b3ee3f9bdcde258ba3f74de76ea8eedf0a36a', name: 'NoChillio', tier: 'S', weight: 30, lambda: 1, floorAvax: 16 },
  // — A: aktif market, 1–3 AVAX bandı —
  { address: '0xb449701a5ebb1d660cb1d206a94f151f5a544a81', name: 'Smol Joes S2', tier: 'A', weight: 12, lambda: 1, floorAvax: 3.6 },
  { address: '0x4245a1bd84eb5f3ebc115c2edf57e50667f98b0b', name: 'Hoppers Game', tier: 'A', weight: 12, lambda: 1, floorAvax: 1.7 },
  { address: '0x3025c5c2aa6eb7364555aac0074292195701bbd6', name: 'MadSkullz', tier: 'A', weight: 12, lambda: 1, floorAvax: 1.0 },
  { address: '0xbacd77ac0c456798e05de15999cb212129d90b70', name: 'Woofy', tier: 'A', weight: 12, lambda: 1, floorAvax: 2.78 },
  { address: '0x9b216c723f77a97abed00780865c070ad6e3dfb6', name: 'DQN', tier: 'A', weight: 12, lambda: 1, floorAvax: 2.93 },
  { address: '0xa695ea0c90d89a1463a53fa7a02168bc46fbbf7e', name: 'Castle Crush', tier: 'A', weight: 12, lambda: 0.9, floorAvax: 0.25 },
  // — B: canlı ama küçük —
  { address: '0xf3513f263994a3536cc0a684209013d6808fe443', name: 'Lil Burn', tier: 'B', weight: 5, lambda: 0.8, floorAvax: 3.3 },
  { address: '0xbc3323468319cf1a2a9ca71a6f4034b7cb5f8126', name: 'Wolfi Land', tier: 'B', weight: 5, lambda: 0.8, floorAvax: 2.79 },
  { address: '0x94c69e082c455156715408f2b4bbed0e61a741c0', name: 'OMNIA', tier: 'B', weight: 5, lambda: 0.8, floorAvax: 2.75 },
  { address: '0x55c5ed6abd2bc8d7454af09fdcddeae963999296', name: 'BOMB OFF!', tier: 'B', weight: 5, lambda: 0.8, floorAvax: 2.26 },
  { address: '0xc25fa7015e334cbce3e52ed6c6a031e40e91b9e0', name: 'Head Duck', tier: 'B', weight: 5, lambda: 0.8, floorAvax: 4.44 },
  { address: '0x3f4be5a356e66cae7e4944b12cd5a63b969a9540', name: 'The Face 1966', tier: 'B', weight: 5, lambda: 0.8, floorAvax: 0.69 },
  { address: '0x8d57da692ff6112d71a0b3c10247897f21ccb4aa', name: 'Mini Salvors', tier: 'B', weight: 5, lambda: 0.8, floorAvax: 0.59 },
  { address: '0x9a25044945b976cabbac9e7bbf096da526061f2f', name: "Cayden's Avax Army", tier: 'B', weight: 5, lambda: 0.8, floorAvax: 0.32 },
  // — C: heritage / illikit (yüksek görünen floor'lara puan şişirtmiyoruz) —
  { address: '0xc70df87e1d98f6a531c8e324c9bcec6fc82b5e8d', name: 'Smol Joes OG', tier: 'C', weight: 1, lambda: 0.5 },
  { address: '0x4eaacd1c1b90e534b86525d290e8b6488cd3cb32', name: 'ASO', tier: 'C', weight: 1, lambda: 0.5, floorAvax: 1.0 },
  { address: '0x3ad949720bf1c6fb6288195671b95cf3b6b6771e', name: 'TIME', tier: 'C', weight: 1, lambda: 0.5, floorAvax: 0.34 },
  { address: '0x5a9d3312b071db1b0a6942895df91dbe1622d52e', name: 'Coin Mascots', tier: 'C', weight: 1, lambda: 0.5 },
  // giraffe: 7g floor 40→222 sıçraması (wash şüphesi) → düşük λ + floor çarpanı kapalı
  { address: '0x7b14377212a1c1f34c479df3621167ed647014f5', name: 'giraffe', tier: 'C', weight: 1, lambda: 0.3 },
];

export const COLLECTION_BY_ADDRESS: Record<string, ScoredCollection> = Object.fromEntries(
  SCORED_COLLECTIONS.map((c) => [c.address, c])
);

/* --------------------------- geliştirilmiş çarpanlar ---------------------- */

/** Floor çarpanı: güncel floor'u ödüllendirir ama küratörlü tier'ı DEĞİŞTİRMEZ.
 *  Log-ölçekli + tavanlı → sahte yüksek floor'lar puanı patlatamaz. Floor yoksa nötr. */
export function floorMult(col: ScoredCollection): number {
  if (!col.floorAvax || col.floorAvax <= 0) return 1;
  const m = 0.9 + 0.28 * Math.log(1 + col.floorAvax);
  return Math.max(0.75, Math.min(1.6, m));
}

/** Holding-age çarpanı: uzun tutan sadık cüzdan ödüllendirilir; taze/paper-hand hafif cezalı (anti-abuse). */
export function ageMult(avgAgeDays: number | undefined): number {
  if (avgAgeDays === undefined) return 1;
  if (avgAgeDays < 7) return 0.85;
  if (avgAgeDays < 90) return 1.0;
  if (avgAgeDays < 365) return 1.15;
  return 1.3;
}

/** Mint çarpanı: cüzdan o koleksiyonu ORİJİNAL mint'lediyse (from 0x0) bonus,
 *  koleksiyonun mint fiyatıyla ölçekli (pahalı mint'e katılmak = daha güçlü sinyal). */
export function mintMult(minterRatio: number | undefined, col: ScoredCollection): number {
  if (!minterRatio || minterRatio <= 0) return 1;
  const priceBoost = Math.min(col.mintPriceAvax ?? 0, 2) * 0.05;
  return 1 + minterRatio * (0.15 + priceBoost);
}

export interface HoldingInfo {
  count: number;
  avgAgeDays?: number; // tutulan token'ların ortalama edinme yaşı (gün)
  minterRatio?: number; // orijinal mint'lenen token oranı (0..1)
}

export interface CollectionBreakdown {
  address: string;
  name: string;
  tier: NftTier;
  count: number;
  points: number;
  avgAgeDays?: number;
  minterRatio?: number;
  floorAvax?: number;
}

export interface WalletScore {
  wallet: string;
  score: number;
  basePoints: number;
  frostBonus: boolean;
  diversityMult: number;
  badge: string;
  breakdown: CollectionBreakdown[];
  totalNfts: number;
  computedAt: number;
}

export const BADGES: { min: number; label: string; icon: string }[] = [
  { min: 500, label: 'Frost Legend', icon: '👑' },
  { min: 300, label: 'Frost Lord', icon: '🏔' },
  { min: 150, label: 'Gold', icon: '🥇' },
  { min: 50, label: 'Silver', icon: '🥈' },
  { min: 10, label: 'Bronze', icon: '🥉' },
  { min: 0, label: 'Snowflake', icon: '❄' },
];

export function badgeFor(score: number) {
  return BADGES.find((b) => score >= b.min) ?? BADGES[BADGES.length - 1];
}

/** holdings: lowercase kontrat adresi → adet (number) veya {count, avgAgeDays, minterRatio}.
 *  Puan = λ × W_tier × floorMult × ageMult × mintMult × min(adet,20)^0.7 */
export function computeWalletScore(
  wallet: string,
  holdings: Record<string, number | HoldingInfo>
): WalletScore {
  const breakdown: CollectionBreakdown[] = [];
  let basePoints = 0;
  let frostHeld = false;
  let totalNfts = 0;

  for (const [addr, raw] of Object.entries(holdings)) {
    const col = COLLECTION_BY_ADDRESS[addr.toLowerCase()];
    const info: HoldingInfo = typeof raw === 'number' ? { count: raw } : raw;
    if (!col || info.count <= 0) continue;
    // azalan getiri: adet^0.7, 20 tavan (balina tek koleksiyonla skoru domine edemesin)
    const effective = Math.min(info.count, 20) ** 0.7;
    const fMult = floorMult(col);
    const aMult = ageMult(info.avgAgeDays);
    const mMult = mintMult(info.minterRatio, col);
    const points = col.lambda * col.weight * fMult * aMult * mMult * effective;
    basePoints += points;
    totalNfts += info.count;
    if (col.tier === 'FROST') frostHeld = true;
    breakdown.push({
      address: col.address,
      name: col.name,
      tier: col.tier,
      count: info.count,
      points: Math.round(points * 10) / 10,
      avgAgeDays: info.avgAgeDays !== undefined ? Math.round(info.avgAgeDays) : undefined,
      minterRatio: info.minterRatio,
      floorAvax: col.floorAvax,
    });
  }

  breakdown.sort((a, b) => b.points - a.points);
  const distinct = breakdown.length;
  const diversityMult = 1 + Math.min(distinct, 10) * 0.025; // ≤ ×1.25
  const frostMult = frostHeld ? 1.2 : 1;
  const score = Math.round(basePoints * diversityMult * frostMult);

  return {
    wallet: wallet.toLowerCase(),
    score,
    basePoints: Math.round(basePoints * 10) / 10,
    frostBonus: frostHeld,
    diversityMult: Math.round(diversityMult * 1000) / 1000,
    badge: badgeFor(score).label,
    breakdown,
    totalNfts,
    computedAt: Date.now(),
  };
}
