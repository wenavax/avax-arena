/**
 * Fuji rehearsal — full launchpad lifecycle against the Fuji TEST factory,
 * asserting that the UI's quote math (lib/launchpad quoteBuy/quoteSell)
 * matches on-chain results EXACTLY (to the wei).
 *
 * Trick: every trade sends minOut = quote EXACTLY. If our math over-estimates
 * by 1 wei the contract reverts Slippage(); if it under-estimates, the
 * post-trade event assert fails. Either direction of error is caught.
 *
 * Run: NEXT_PUBLIC_LAUNCHPAD_CHAIN=fuji PRIVATE_KEY=... npx tsx scripts/fuji-rehearsal.ts
 */
import { createPublicClient, createWalletClient, http, parseEther, formatEther, parseEventLogs, erc20Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';
import {
  LAUNCHPAD_FACTORY_ADDRESS, LAUNCHPAD_FACTORY_ABI, BONDING_POOL_ABI,
  quoteBuy, quoteSell,
} from '../lib/launchpad';

const RPC = 'https://api.avax-test.network/ext/bc/C/rpc';
const pk = process.env.PRIVATE_KEY;
if (!pk) { console.error('PRIVATE_KEY env eksik'); process.exit(1); }
if (process.env.NEXT_PUBLIC_LAUNCHPAD_CHAIN !== 'fuji') { console.error('NEXT_PUBLIC_LAUNCHPAD_CHAIN=fuji ile çalıştır'); process.exit(1); }

const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`);
const pub = createPublicClient({ chain: avalancheFuji, transport: http(RPC) });
const wal = createWalletClient({ chain: avalancheFuji, transport: http(RPC), account });

let passed = 0;
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}${detail ? ` (${detail})` : ''}`); }
  else { console.error(`  ✗ FAIL: ${name}${detail ? ` (${detail})` : ''}`); process.exit(1); }
}

async function poolParams(pool: `0x${string}`) {
  const [vAvax0, y0, realAvax, feeBps, tokensSold, curveSupply, threshold] = await Promise.all([
    pub.readContract({ address: pool, abi: BONDING_POOL_ABI, functionName: 'vAvax0' }),
    pub.readContract({ address: pool, abi: BONDING_POOL_ABI, functionName: 'y0' }),
    pub.readContract({ address: pool, abi: BONDING_POOL_ABI, functionName: 'realAvax' }),
    pub.readContract({ address: pool, abi: BONDING_POOL_ABI, functionName: 'tradingFeeBps' }),
    pub.readContract({ address: pool, abi: BONDING_POOL_ABI, functionName: 'tokensSold' }),
    pub.readContract({ address: pool, abi: BONDING_POOL_ABI, functionName: 'curveSupply' }),
    pub.readContract({ address: pool, abi: BONDING_POOL_ABI, functionName: 'graduationThreshold' }),
  ]);
  return { vAvax0, y0, realAvax, feeBps: BigInt(feeBps), tokensSold, curveSupply, threshold };
}

async function main() {
  console.log(`Fuji provası — factory ${LAUNCHPAD_FACTORY_ADDRESS}, hesap ${account.address}`);
  const bal0 = await pub.getBalance({ address: account.address });
  console.log(`Bakiye: ${formatEther(bal0)} AVAX`);

  // Guard: sadece fee'siz TEST factory'de koş (yanlışlıkla harcama yok)
  const cfg = await pub.readContract({ address: LAUNCHPAD_FACTORY_ADDRESS, abi: LAUNCHPAD_FACTORY_ABI, functionName: 'config' });
  ok('test factory (launchFee=0)', cfg[0] === 0n, `launchFee=${formatEther(cfg[0])}`);

  // ── 1) LAUNCH ──
  console.log('\n[1] createToken…');
  const launchHash = await wal.writeContract({
    address: LAUNCHPAD_FACTORY_ADDRESS, abi: LAUNCHPAD_FACTORY_ABI, functionName: 'createToken',
    args: ['UI Rehearsal', 'UIRH', 'Quote-math verification run (UI rehearsal)'], value: 0n,
  });
  const launchRcpt = await pub.waitForTransactionReceipt({ hash: launchHash });
  ok('launch tx success', launchRcpt.status === 'success');
  const tl = parseEventLogs({ abi: LAUNCHPAD_FACTORY_ABI, logs: launchRcpt.logs, eventName: 'TokenLaunched' })[0];
  const pool = (tl!.args as { pool: `0x${string}` }).pool;
  const token = (tl!.args as { token: `0x${string}` }).token;
  ok('TokenLaunched decoded', !!pool && !!token, `pool=${pool}`);

  // ── 2) BUY 0.02 — quote birebir mi? ──
  console.log('\n[2] buy 0.02 AVAX (minOut = quote, sıfır tolerans)…');
  let p = await poolParams(pool);
  const buyIn = parseEther('0.02');
  const q1 = quoteBuy(buyIn, p);
  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 300);
  const buyHash = await wal.writeContract({
    address: pool, abi: BONDING_POOL_ABI, functionName: 'buy', args: [q1.tokensOut, deadline()], value: buyIn,
  });
  const buyRcpt = await pub.waitForTransactionReceipt({ hash: buyHash });
  ok('buy tx success (Slippage revert etmedi → quote ≤ gerçek)', buyRcpt.status === 'success');
  const buyEv = parseEventLogs({ abi: BONDING_POOL_ABI, logs: buyRcpt.logs, eventName: 'Buy' })[0];
  const bArgs = buyEv!.args as { tokensOut: bigint; fee: bigint; avaxIn: bigint };
  ok('tokensOut == quote (wei-exact)', bArgs.tokensOut === q1.tokensOut, `${bArgs.tokensOut} vs ${q1.tokensOut}`);
  ok('fee == quote fee', bArgs.fee === q1.fee);
  const tokBal = await pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
  ok('balanceOf == tokensOut', tokBal === q1.tokensOut);

  // ── 3) SELL yarısı — quote birebir mi? ──
  console.log('\n[3] sell (yarısı, minOut = quote)…');
  p = await poolParams(pool);
  const sellIn = tokBal / 2n;
  const q2 = quoteSell(sellIn, p);
  const aprHash = await wal.writeContract({ address: token, abi: erc20Abi, functionName: 'approve', args: [pool, sellIn] });
  await pub.waitForTransactionReceipt({ hash: aprHash });
  const sellHash = await wal.writeContract({
    address: pool, abi: BONDING_POOL_ABI, functionName: 'sell', args: [sellIn, q2.net, deadline()],
  });
  const sellRcpt = await pub.waitForTransactionReceipt({ hash: sellHash });
  ok('sell tx success', sellRcpt.status === 'success');
  const sellEv = parseEventLogs({ abi: BONDING_POOL_ABI, logs: sellRcpt.logs, eventName: 'Sell' })[0];
  const sArgs = sellEv!.args as { avaxOut: bigint; fee: bigint };
  ok('avaxOut(net) == quote (wei-exact)', sArgs.avaxOut === q2.net, `${sArgs.avaxOut} vs ${q2.net}`);
  ok('sell fee == quote fee', sArgs.fee === q2.fee);

  // ── 4) GRADUATION BUY ──
  console.log('\n[4] graduation buy (0.08 AVAX)…');
  p = await poolParams(pool);
  const gradIn = parseEther('0.08');
  const q3 = quoteBuy(gradIn, p);
  ok('bu buy eşiği geçiyor', p.realAvax + (gradIn - q3.fee) >= p.threshold, `real=${formatEther(p.realAvax)} → hedef ${formatEther(p.threshold)}`);
  const gradHash = await wal.writeContract({
    address: pool, abi: BONDING_POOL_ABI, functionName: 'buy', args: [q3.tokensOut, deadline()], value: gradIn,
  });
  const gradRcpt = await pub.waitForTransactionReceipt({ hash: gradHash });
  ok('graduation buy success', gradRcpt.status === 'success');
  const gradEv = parseEventLogs({ abi: BONDING_POOL_ABI, logs: gradRcpt.logs, eventName: 'Graduated' });
  ok('Graduated event yayınlandı', gradEv.length === 1);
  const state = await pub.readContract({ address: pool, abi: BONDING_POOL_ABI, functionName: 'state' });
  ok('state == Graduated(1)', Number(state) === 1);

  // ── 5) TJ pair var mı? ──
  const router = await pub.readContract({ address: pool, abi: BONDING_POOL_ABI, functionName: 'joeRouter' });
  const routerAbi = [
    { type: 'function', name: 'WAVAX', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
    { type: 'function', name: 'factory', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  ] as const;
  const wavax = await pub.readContract({ address: router, abi: routerAbi, functionName: 'WAVAX' });
  const jf = await pub.readContract({ address: router, abi: routerAbi, functionName: 'factory' });
  const pair = await pub.readContract({
    address: jf,
    abi: [{ type: 'function', name: 'getPair', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'address' }], stateMutability: 'view' }] as const,
    functionName: 'getPair', args: [token, wavax],
  });
  ok('TJ pair oluştu', pair !== '0x0000000000000000000000000000000000000000', pair as string);

  const bal1 = await pub.getBalance({ address: account.address });
  console.log(`\nSONUÇ: ${passed} assert PASS · maliyet ${formatEther(bal0 - bal1)} AVAX · token=${token} pool=${pool}`);
}

main().catch((e) => { console.error('HATA:', e?.shortMessage || e?.message || e); process.exit(1); });
