/**
 * Adventures resolver — off-chain accrual hesaplar, FrostbiteAdventures.settle
 * ile zincire yazar (EXPEDITIONS_PHASE1 blueprint'i, Adventures uyarlaması).
 *
 * Güven modeli: resolver YALNIZCA canlılık + adil bölüşümden sorumlu. Kontrat
 * her settle'ı üç sınırla doğrular (zoneRate×elapsed, emissionCap, poolBalance)
 * — sızan anahtar havuzu aşamaz, cap'i aşamaz, pozisyon uyduramaz.
 *
 * Accrual (P0 engine.ts'in 1× zaman eşdeğeri, DEMO_SPEED YOK):
 *   weight = advLevel × Σ(zonePrimaryStats) × rarityMult × affinityMult
 *   amount_i = zoneRate × elapsed_i × weight_i / Σ_zone weight   (cap'e clamp)
 * wisdom = advLevel × (rarity+1). Idle finds P1'de zincire taşınmadı (bilinçli).
 *
 * Env: RPC_URL, ADVENTURES_ADDRESS, PRIVATE_KEY, RESOLVER_INTERVAL_SEC (öntanım 3600)
 * Çalıştırma: node server/adventures-resolver.mjs        (tek geçiş: --once)
 */
import { ethers } from 'ethers';

const RPC_URL = process.env.RPC_URL ?? 'https://api.avax-test.network/ext/bc/C/rpc';
const ADDR = process.env.ADVENTURES_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const INTERVAL = Number(process.env.RESOLVER_INTERVAL_SEC ?? 3600);
if (!ADDR || !PRIVATE_KEY) { console.error('ADVENTURES_ADDRESS ve PRIVATE_KEY gerekli'); process.exit(1); }

const ABI = [
  'function nextPositionId() view returns (uint256)',
  'function positions(uint256) view returns (address player, uint32 tokenId, uint8 zoneId, uint8 status, uint64 stakedAt, uint64 lastSettledAt, uint64 closedAt, bytes32 seed)',
  'function zones(uint8) view returns (uint128 ratePerSec, uint16 minLevel, uint16 minAtk, uint16 minDef, uint16 minSpd, uint16 minWisdom, uint8 favoredElement, bool enabled)',
  'function advLevel(uint256) view returns (uint32)',
  'function settledSinceLevel(uint256) view returns (uint256)',
  'function emissionCap(uint32) view returns (uint256)',
  'function zoneBudgetRemaining(uint8) view returns (uint256)',
  'function poolBalance() view returns (uint256)',
  'function heroes() view returns (address)',
  'function settleBatch(uint256[] positionIds, uint256[] amounts, bytes32 resultHash)',
];
const HEROES_ABI = ['function getHero(uint256) view returns ((uint8 element,uint8 rarity,uint16 level,uint32 xp,uint16 atk,uint16 def,uint16 spd,uint16 baseAtk,uint16 baseDef,uint16 baseSpd))'];

// P0 zones.ts — zincirde tutulmayan bölüşüm bilgisi (contract sadece gate+rate tutar)
const ZONE_PRIMARY = [['atk'], ['spd'], ['def'], ['atk', 'wisdom'], ['spd', 'def', 'wisdom'], ['atk', 'def', 'spd', 'wisdom']];
const RARITY_MULT_BPS = [10000n, 11500n, 13500n, 16000n, 20000n]; // common..legendary
const AFFINITY_MULT_BPS = 13500n;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const adventures = new ethers.Contract(ADDR, ABI, wallet);

function weightOf(hero, lvl, zoneId, favoredElement) {
  const wisdom = BigInt(lvl) * (BigInt(hero.rarity) + 1n);
  let statSum = 0n;
  for (const s of ZONE_PRIMARY[zoneId]) statSum += s === 'wisdom' ? wisdom : BigInt(hero[s]);
  const affinity = Number(hero.element) === Number(favoredElement) ? AFFINITY_MULT_BPS : 10000n;
  return BigInt(lvl) * statSum * RARITY_MULT_BPS[Number(hero.rarity)] * affinity; // bps^2 ölçek — orana girdiği için sadeleşir
}

async function runOnce() {
  const heroesAddr = await adventures.heroes();
  const heroes = new ethers.Contract(heroesAddr, HEROES_ABI, provider);
  const nextId = await adventures.nextPositionId();
  const now = BigInt((await provider.getBlock('latest')).timestamp);

  // Aktif + grace içindeki Closed pozisyonları topla
  const byZone = new Map();
  for (let id = 1n; id < nextId; id++) {
    const p = await adventures.positions(id);
    const status = Number(p.status);
    if (status === 0) continue;
    const tEnd = status === 1 ? now : BigInt(p.closedAt);
    const elapsed = tEnd - BigInt(p.lastSettledAt);
    if (elapsed <= 0n) continue;
    if (status === 2 && now > BigInt(p.closedAt) + 7n * 86400n) continue; // grace dışı
    const zoneId = Number(p.zoneId);
    const hero = await heroes.getHero(p.tokenId);
    const lvl = Number(await adventures.advLevel(p.tokenId));
    const zone = await adventures.zones(zoneId);
    const w = weightOf(hero, lvl, zoneId, zone.favoredElement);
    if (!byZone.has(zoneId)) byZone.set(zoneId, { zone, items: [] });
    byZone.get(zoneId).items.push({ id, p, elapsed, w, tokenId: p.tokenId, lvl });
  }

  const ids = [];
  const amounts = [];
  let pool = await adventures.poolBalance();

  for (const [zoneId, { zone, items }] of byZone) {
    // Cap dolu pozisyonlar paydadan çıkar (P0 boosting semantiği)
    const capState = await Promise.all(items.map(async (it) => {
      const used = await adventures.settledSinceLevel(it.tokenId);
      const cap = await adventures.emissionCap(it.lvl);
      return { ...it, capLeft: cap > used ? cap - used : 0n };
    }));
    const totalW = capState.filter((it) => it.capLeft > 0n).reduce((s, it) => s + it.w, 0n);
    let zoneBudgetLeft = await adventures.zoneBudgetRemaining(zoneId);
    for (const it of capState) {
      let amt = 0n;
      if (it.capLeft > 0n && totalW > 0n) {
        amt = (BigInt(zone.ratePerSec) * it.elapsed * it.w) / totalW;
        if (amt > it.capLeft) amt = it.capLeft;               // emission cap clamp
        const rateBound = BigInt(zone.ratePerSec) * it.elapsed;
        if (amt > rateBound) amt = rateBound;                  // tekil sınır (güvence)
        if (amt > zoneBudgetLeft) amt = zoneBudgetLeft;        // bölge tüm-zamanlar bütçesi
        if (amt > pool) amt = pool;                            // havuz clamp
      }
      zoneBudgetLeft -= amt;
      pool -= amt;
      ids.push(it.id);
      amounts.push(amt); // 0 => checkpoint (lastSettledAt ilerler, cap-locked konumlar için)
      console.log(`  zone${zoneId} pos#${it.id} elapsed=${it.elapsed}s amount=${ethers.formatEther(amt)} FSB${amt === 0n ? ' (checkpoint)' : ''}`);
    }
  }

  if (ids.length === 0) { console.log('Settle edilecek pozisyon yok.'); return; }
  const resultHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ t: now.toString(), ids: ids.map(String), amounts: amounts.map(String) })));
  const txr = await (await adventures.settleBatch(ids, amounts, resultHash)).wait();
  console.log(`settleBatch: ${ids.length} pozisyon, tx ${txr.hash}`);
}

const once = process.argv.includes('--once');
console.log(`Adventures resolver — ${ADDR} @ ${RPC_URL} (${once ? 'tek geçiş' : `her ${INTERVAL}s`})`);
await runOnce();
if (!once) setInterval(() => runOnce().catch((e) => console.error('resolver hata:', e.message)), INTERVAL * 1000);
