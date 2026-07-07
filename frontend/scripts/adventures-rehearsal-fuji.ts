/**
 * Adventures Fuji rehearsal — full FrostbiteAdventures lifecycle on Fuji:
 * mint hero → fund pool → stake → real-time accrual → over-bound settle MUST
 * revert → exact settle → withdraw → levelUp burn (cap reset) → XP bridge →
 * unstake → post-close settle within grace. Zero-tolerance asserts throughout.
 *
 * Addresses come from env or adventures/broadcast/Deploy.s.sol/43113/run-latest.json.
 * Run: PRIVATE_KEY=... npx tsx scripts/adventures-rehearsal-fuji.ts
 */
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, formatEther, parseEventLogs } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';

const RPC = 'https://api.avax-test.network/ext/bc/C/rpc';
const pk = process.env.PRIVATE_KEY;
if (!pk) { console.error('PRIVATE_KEY env eksik'); process.exit(1); }

const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`);
const pub = createPublicClient({ chain: avalancheFuji, transport: http(RPC) });
const wal = createWalletClient({ chain: avalancheFuji, transport: http(RPC), account });

let passed = 0;
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}${detail ? ` (${detail})` : ''}`); }
  else { console.error(`  ✗ FAIL: ${name}${detail ? ` (${detail})` : ''}`); process.exit(1); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fromBroadcast(): Record<string, `0x${string}`> {
  const path = new URL('../../adventures/broadcast/Deploy.s.sol/43113/run-latest.json', import.meta.url).pathname;
  const j = JSON.parse(readFileSync(path, 'utf8'));
  const out: Record<string, `0x${string}`> = {};
  for (const tx of j.transactions) {
    if (tx.transactionType === 'CREATE') out[tx.contractName] = tx.contractAddress;
  }
  return out;
}

const deployed = fromBroadcast();
const ADVENTURES = (process.env.ADVENTURES_ADDRESS ?? deployed.FrostbiteAdventures) as `0x${string}`;
const HEROES = (process.env.HEROES_ADDRESS ?? deployed.MockFrostbiteHeroes) as `0x${string}`;
const FSB = (process.env.FSB_ADDRESS ?? deployed.MockFSB) as `0x${string}`;
const DEAD = '0x000000000000000000000000000000000000dEaD' as const;

const advAbi = parseAbi([
  'function stake(uint256 tokenId, uint8 zoneId) returns (uint256)',
  'function unstake(uint256 positionId)',
  'function settle(uint256 positionId, uint256 amount, bytes32 resultHash)',
  'function levelUp(uint256 tokenId)',
  'function withdrawPayout()',
  'function fundPool(uint256 amount)',
  'function setXpPerLevelUp(uint32 xp)',
  'function pendingPayouts(address) view returns (uint256)',
  'function poolBalance() view returns (uint256)',
  'function totalPending() view returns (uint256)',
  'function advLevel(uint256) view returns (uint32)',
  'function settledSinceLevel(uint256) view returns (uint256)',
  'function burnedTotal() view returns (uint256)',
  'function emittedTotal() view returns (uint256)',
  'function costToNextLevel(uint32) view returns (uint256)',
  'function emissionCap(uint32) view returns (uint256)',
  'function canStake(uint256 tokenId, uint8 zoneId) view returns (bool)',
  'function activePositionOf(uint256) view returns (uint256)',
  'function positions(uint256) view returns (address player, uint32 tokenId, uint8 zoneId, uint8 status, uint64 stakedAt, uint64 lastSettledAt, uint64 closedAt, bytes32 seed)',
  'function zones(uint8) view returns (uint128 ratePerSec, uint16 minLevel, uint16 minAtk, uint16 minDef, uint16 minSpd, uint16 minWisdom, uint8 favoredElement, bool enabled)',
  'event Staked(uint256 indexed positionId, address indexed player, uint256 indexed tokenId, uint8 zoneId, bytes32 seed)',
  'event ClaimSettled(uint256 indexed positionId, address indexed player, uint256 amount, bytes32 resultHash)',
]);

const heroesAbi = parseAbi([
  'function mint(address to, uint8 element, uint8 rarity, uint16 level, uint16 atk, uint16 def, uint16 spd) returns (uint256)',
  'function setAuthorized(address addr, bool status)',
  'function getHero(uint256 tokenId) view returns ((uint8 element, uint8 rarity, uint16 level, uint32 xp, uint16 atk, uint16 def, uint16 spd, uint16 baseAtk, uint16 baseDef, uint16 baseSpd))',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function approve(address to, uint256 tokenId)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]);

const fsbAbi = parseAbi([
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);

async function tx(hash: `0x${string}`) {
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  if (rcpt.status !== 'success') { console.error(`  ✗ tx revert: ${hash}`); process.exit(1); }
  return rcpt;
}

async function chainNow(): Promise<bigint> {
  const b = await pub.getBlock();
  return b.timestamp;
}

async function main() {
  console.log(`Adventures Fuji provası\n  Adventures ${ADVENTURES}\n  Heroes     ${HEROES}\n  FSB        ${FSB}\n  Hesap      ${account.address}`);
  console.log(`  AVAX: ${formatEther(await pub.getBalance({ address: account.address }))}`);

  // ── 1) Hero mint (fire, rare, L12 — rime-river gate'lerini de geçer) ──
  console.log('\n[1] Hero mint…');
  const mintRcpt = await tx(await wal.writeContract({ address: HEROES, abi: heroesAbi, functionName: 'mint', args: [account.address, 0, 2, 12, 9, 7, 8] }));
  const transfer = parseEventLogs({ abi: heroesAbi, logs: mintRcpt.logs, eventName: 'Transfer' })[0];
  const tokenId = transfer.args.tokenId as bigint;
  ok('hero mintlendi', tokenId > 0n, `tokenId=${tokenId}`);

  // ── 2) Havuz fonla ──
  console.log('\n[2] fundPool…');
  const poolAmt = parseEther('10000');
  await tx(await wal.writeContract({ address: FSB, abi: fsbAbi, functionName: 'approve', args: [ADVENTURES, poolAmt] }));
  await tx(await wal.writeContract({ address: ADVENTURES, abi: advAbi, functionName: 'fundPool', args: [poolAmt] }));
  ok('poolBalance == 10000 FSB', (await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'poolBalance' })) === poolAmt);

  // ── 3) Gate kontrolleri + stake ──
  console.log('\n[3] stake…');
  ok('canStake(zone0)=true', await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'canStake', args: [tokenId, 0] }));
  ok('canStake(frostlake L20)=false (L12 hero)', !(await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'canStake', args: [tokenId, 5] })));
  await tx(await wal.writeContract({ address: HEROES, abi: heroesAbi, functionName: 'approve', args: [ADVENTURES, tokenId] }));
  const stakeRcpt = await tx(await wal.writeContract({ address: ADVENTURES, abi: advAbi, functionName: 'stake', args: [tokenId, 0] }));
  const staked = parseEventLogs({ abi: advAbi, logs: stakeRcpt.logs, eventName: 'Staked' })[0];
  const positionId = staked.args.positionId as bigint;
  ok('Staked event + positionId', positionId > 0n, `positionId=${positionId}`);
  ok('seed != 0', staked.args.seed !== `0x${'0'.repeat(64)}`);
  ok('custody: ownerOf == adventures', (await pub.readContract({ address: HEROES, abi: heroesAbi, functionName: 'ownerOf', args: [tokenId] })).toLowerCase() === ADVENTURES.toLowerCase());
  ok('advLevel init == 12', (await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'advLevel', args: [tokenId] })) === 12);

  // ── 4) Gerçek zaman accrual + settle sınır testleri ──
  console.log('\n[4] 40 sn accrual bekleniyor…');
  await sleep(40_000);
  const zone0 = await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'zones', args: [0] });
  const rate = zone0[0] as bigint;
  const pos = await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'positions', args: [positionId] });
  const lastSettledAt = pos[5] as bigint;
  const now = await chainNow();
  const elapsed = now - lastSettledAt;
  ok('elapsed >= 40s', elapsed >= 40n, `elapsed=${elapsed}s`);

  // 4a. Sınır ÜSTÜ settle revert etmeli (rate bound) — simulate ile
  const overAmount = rate * (elapsed + 3600n);
  let overReverted = false;
  try {
    await pub.simulateContract({ address: ADVENTURES, abi: advAbi, functionName: 'settle', args: [positionId, overAmount, `0x${'11'.repeat(32)}`], account: account.address });
  } catch { overReverted = true; }
  ok('sınır üstü settle revert (RateBoundExceeded)', overReverted);

  // 4b. Yetkisiz settle revert etmeli
  const stranger = privateKeyToAccount(generatePrivateKey());
  let unauthReverted = false;
  try {
    await pub.simulateContract({ address: ADVENTURES, abi: advAbi, functionName: 'settle', args: [positionId, 1n, `0x${'22'.repeat(32)}`], account: stranger.address });
  } catch { unauthReverted = true; }
  ok('yetkisiz settle revert (NotAuthorized)', unauthReverted);

  // 4c. Geçerli settle: gönderim anındaki elapsed alt sınırıyla (tx sonra
  // yürüdüğünde gerçek elapsed daha büyük olur → sınır içinde kalır)
  const settleAmt = rate * elapsed;
  const settleRcpt = await tx(await wal.writeContract({ address: ADVENTURES, abi: advAbi, functionName: 'settle', args: [positionId, settleAmt, `0x${'33'.repeat(32)}`] }));
  const settledEv = parseEventLogs({ abi: advAbi, logs: settleRcpt.logs, eventName: 'ClaimSettled' })[0];
  ok('ClaimSettled amount birebir', (settledEv.args.amount as bigint) === settleAmt, `${formatEther(settleAmt)} FSB`);
  ok('pendingPayouts birebir', (await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'pendingPayouts', args: [account.address] })) === settleAmt);
  ok('poolBalance düştü', (await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'poolBalance' })) === poolAmt - settleAmt);
  ok('settledSinceLevel == settle', (await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'settledSinceLevel', args: [tokenId] })) === settleAmt);
  ok('emittedTotal == settle', (await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'emittedTotal' })) === settleAmt);

  // ── 5) withdrawPayout ──
  console.log('\n[5] withdrawPayout…');
  const balBefore = await pub.readContract({ address: FSB, abi: fsbAbi, functionName: 'balanceOf', args: [account.address] });
  await tx(await wal.writeContract({ address: ADVENTURES, abi: advAbi, functionName: 'withdrawPayout' }));
  const balAfter = await pub.readContract({ address: FSB, abi: fsbAbi, functionName: 'balanceOf', args: [account.address] });
  ok('FSB delta birebir', balAfter - balBefore === settleAmt);
  ok('totalPending == 0', (await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'totalPending' })) === 0n);

  // ── 6) levelUp burn + cap reset + XP köprüsü ──
  console.log('\n[6] levelUp…');
  await tx(await wal.writeContract({ address: ADVENTURES, abi: advAbi, functionName: 'setXpPerLevelUp', args: [250] }));
  await tx(await wal.writeContract({ address: HEROES, abi: heroesAbi, functionName: 'setAuthorized', args: [ADVENTURES, true] }));
  const cost = await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'costToNextLevel', args: [12] });
  ok('cost(L12) == 745 FSB', cost === parseEther('745'), formatEther(cost));
  const deadBefore = await pub.readContract({ address: FSB, abi: fsbAbi, functionName: 'balanceOf', args: [DEAD] });
  await tx(await wal.writeContract({ address: FSB, abi: fsbAbi, functionName: 'approve', args: [ADVENTURES, cost] }));
  await tx(await wal.writeContract({ address: ADVENTURES, abi: advAbi, functionName: 'levelUp', args: [tokenId] }));
  ok('advLevel == 13', (await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'advLevel', args: [tokenId] })) === 13);
  ok('cap sayacı sıfırlandı', (await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'settledSinceLevel', args: [tokenId] })) === 0n);
  ok('dEaD bakiyesi += cost', (await pub.readContract({ address: FSB, abi: fsbAbi, functionName: 'balanceOf', args: [DEAD] })) - deadBefore === cost);
  ok('burnedTotal == cost', (await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'burnedTotal' })) === cost);
  const heroAfter = await pub.readContract({ address: HEROES, abi: heroesAbi, functionName: 'getHero', args: [tokenId] });
  ok('XP köprüsü: hero.xp == 250', heroAfter.xp === 250);

  // ── 7) unstake + kapanış-sonrası settle (grace içinde) ──
  console.log('\n[7] unstake + Closed settle…');
  await sleep(15_000);
  const posBefore = await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'positions', args: [positionId] });
  await tx(await wal.writeContract({ address: ADVENTURES, abi: advAbi, functionName: 'unstake', args: [positionId] }));
  ok('NFT geri döndü', (await pub.readContract({ address: HEROES, abi: heroesAbi, functionName: 'ownerOf', args: [tokenId] })).toLowerCase() === account.address.toLowerCase());
  const posClosed = await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'positions', args: [positionId] });
  ok('status == Closed(2)', posClosed[3] === 2);
  ok('activePositionOf == 0', (await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'activePositionOf', args: [tokenId] })) === 0n);
  const closedElapsed = (posClosed[6] as bigint) - (posBefore[5] as bigint); // closedAt - lastSettledAt
  ok('kapanışta settle edilmemiş süre var', closedElapsed > 0n, `${closedElapsed}s`);
  const finalAmt = rate * closedElapsed; // Closed: sınır closedAt'e göre — TAM sınır geçmeli
  await tx(await wal.writeContract({ address: ADVENTURES, abi: advAbi, functionName: 'settle', args: [positionId, finalAmt, `0x${'44'.repeat(32)}`] }));
  ok('Closed pozisyon TAM sınırda settle edildi', (await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'pendingPayouts', args: [account.address] })) === finalAmt, `${formatEther(finalAmt)} FSB`);
  // Aynı pozisyonu ikinci kez settle → elapsed 0 → revert
  let doubleReverted = false;
  try {
    await pub.simulateContract({ address: ADVENTURES, abi: advAbi, functionName: 'settle', args: [positionId, 1n, `0x${'55'.repeat(32)}`], account: account.address });
  } catch { doubleReverted = true; }
  ok('çifte settle revert (NothingToSettle)', doubleReverted);
  await tx(await wal.writeContract({ address: ADVENTURES, abi: advAbi, functionName: 'withdrawPayout' }));
  ok('final withdraw OK', (await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'totalPending' })) === 0n);

  // ── 8) Muhasebe kimliği ──
  const contractBal = await pub.readContract({ address: FSB, abi: fsbAbi, functionName: 'balanceOf', args: [ADVENTURES] });
  const poolFinal = await pub.readContract({ address: ADVENTURES, abi: advAbi, functionName: 'poolBalance' });
  ok('kimlik: balanceOf == poolBalance + totalPending', contractBal === poolFinal);

  console.log(`\n★ ${passed}/${passed} assert PASS — tam yaşam döngüsü Fuji'de kanıtlandı.`);
  console.log(`  Kalan AVAX: ${formatEther(await pub.getBalance({ address: account.address }))}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
