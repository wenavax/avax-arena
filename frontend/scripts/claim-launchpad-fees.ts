/**
 * Frostbite Launchpad — trading-fee claim helper.
 *
 * Enumerates every pool via factory.launchCount()/launches(i), reads each
 * pool's pendingFees, prints a table, and (optionally) triggers withdrawFees().
 *
 * IMPORTANT — how fees actually work (BondingCurvePool.sol):
 *   - withdrawFees() is PERMISSIONLESS: anyone may call it, and the funds
 *     ALWAYS go to the pool's snapshotted `treasury` address regardless of
 *     who the caller is. The caller only pays gas — there is no way to
 *     redirect fees. (Launch fees never touch the pool/factory balance at
 *     all: createToken forwards them to treasury in the same tx.)
 *   - Fees keep accruing in `pendingFees` and remain claimable forever,
 *     including AFTER graduation (withdrawFees has no state check).
 *
 * Usage:
 *   READ-ONLY table (mainnet):   npx tsx scripts/claim-launchpad-fees.ts
 *   READ-ONLY table (Fuji):      NEXT_PUBLIC_LAUNCHPAD_CHAIN=fuji npx tsx scripts/claim-launchpad-fees.ts
 *   CLAIM (send withdrawFees):   CLAIM=1 PRIVATE_KEY=0x... npx tsx scripts/claim-launchpad-fees.ts
 *     (add NEXT_PUBLIC_LAUNCHPAD_CHAIN=fuji for testnet)
 *
 * Claim policy: only pools with pendingFees > 0.001 AVAX are claimed, so gas
 * is never wasted on dust.
 */
import { createPublicClient, createWalletClient, http, formatEther, parseEther, parseAbi, erc20Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  LAUNCHPAD_FACTORY_ADDRESS,
  LAUNCHPAD_FACTORY_ABI,
  LAUNCHPAD_RPC,
  LAUNCHPAD_VIEM_CHAIN,
  POOL_STATE_GRADUATED,
} from '../lib/launchpad';

// Fee-related pool functions are not part of the UI ABI (lib/launchpad), so
// they are supplemented here. Source of truth: launchpad/src/BondingCurvePool.sol.
const POOL_FEES_ABI = parseAbi([
  'function pendingFees() external view returns (uint256)',
  'function treasury() external view returns (address)',
  'function state() external view returns (uint8)',
  'function token() external view returns (address)',
  'function withdrawFees() external', // permissionless; pays out to treasury, never to caller
]);

/** Pools below this pending-fee amount are skipped when claiming (dust guard). */
const CLAIM_THRESHOLD = parseEther('0.001');

const pub = createPublicClient({ chain: LAUNCHPAD_VIEM_CHAIN, transport: http(LAUNCHPAD_RPC) });

interface PoolRow {
  id: number;
  symbol: string;
  pool: `0x${string}`;
  state: string;
  treasury: `0x${string}`;
  pendingFees: bigint;
}

async function readPool(id: number): Promise<PoolRow> {
  const [, pool] = await pub.readContract({
    address: LAUNCHPAD_FACTORY_ADDRESS,
    abi: LAUNCHPAD_FACTORY_ABI,
    functionName: 'launches',
    args: [BigInt(id)],
  });
  const [pendingFees, treasury, state, token] = await Promise.all([
    pub.readContract({ address: pool, abi: POOL_FEES_ABI, functionName: 'pendingFees' }),
    pub.readContract({ address: pool, abi: POOL_FEES_ABI, functionName: 'treasury' }),
    pub.readContract({ address: pool, abi: POOL_FEES_ABI, functionName: 'state' }),
    pub.readContract({ address: pool, abi: POOL_FEES_ABI, functionName: 'token' }),
  ]);
  const symbol = await pub
    .readContract({ address: token, abi: erc20Abi, functionName: 'symbol' })
    .catch(() => '???');
  return {
    id,
    symbol,
    pool,
    state: state === POOL_STATE_GRADUATED ? 'Graduated' : 'Trading',
    treasury,
    pendingFees,
  };
}

async function main() {
  console.log(`Frostbite Launchpad fee claim — ${LAUNCHPAD_VIEM_CHAIN.name} (chainId ${LAUNCHPAD_VIEM_CHAIN.id})`);
  console.log(`Factory: ${LAUNCHPAD_FACTORY_ADDRESS}\n`);

  const count = await pub.readContract({
    address: LAUNCHPAD_FACTORY_ADDRESS,
    abi: LAUNCHPAD_FACTORY_ABI,
    functionName: 'launchCount',
  });
  if (count === 0n) {
    console.log('Hiç launch yok — tablo boş.');
    return;
  }

  const rows: PoolRow[] = [];
  for (let i = 0; i < Number(count); i++) rows.push(await readPool(i));

  console.table(
    rows.map((r) => ({
      id: r.id,
      symbol: r.symbol,
      pool: r.pool,
      state: r.state,
      'pendingFees (AVAX)': formatEther(r.pendingFees),
      treasury: r.treasury,
      claimable: r.pendingFees > CLAIM_THRESHOLD ? 'YES' : '—',
    })),
  );

  const total = rows.reduce((s, r) => s + r.pendingFees, 0n);
  const claimable = rows.filter((r) => r.pendingFees > CLAIM_THRESHOLD);
  console.log(`Toplam bekleyen fee: ${formatEther(total)} AVAX`);
  console.log(`Eşik üstü (> ${formatEther(CLAIM_THRESHOLD)} AVAX) havuz: ${claimable.length}\n`);

  if (process.env.CLAIM !== '1') {
    console.log('READ-ONLY mod. Claim için: CLAIM=1 PRIVATE_KEY=0x... npx tsx scripts/claim-launchpad-fees.ts');
    return;
  }

  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.error('CLAIM=1 verildi ama PRIVATE_KEY env eksik.');
    process.exit(1);
  }
  if (claimable.length === 0) {
    console.log('Eşik üstü fee biriken havuz yok — gönderilecek tx yok.');
    return;
  }

  // Reminder: the sender here is just a gas payer. withdrawFees() routes the
  // AVAX to the pool's treasury no matter which key signs this transaction.
  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`);
  const wal = createWalletClient({ chain: LAUNCHPAD_VIEM_CHAIN, transport: http(LAUNCHPAD_RPC), account });
  console.log(`Claim gönderen (sadece gas öder): ${account.address}\n`);

  for (const r of claimable) {
    console.log(`withdrawFees → pool #${r.id} ${r.symbol} (${formatEther(r.pendingFees)} AVAX → ${r.treasury})…`);
    const hash = await wal.writeContract({
      address: r.pool,
      abi: POOL_FEES_ABI,
      functionName: 'withdrawFees',
    });
    const rcpt = await pub.waitForTransactionReceipt({ hash });
    console.log(`  ${rcpt.status === 'success' ? '✓' : '✗'} tx ${hash} (block ${rcpt.blockNumber})`);
    if (rcpt.status !== 'success') process.exit(1);
  }
  console.log('\nTüm claim işlemleri tamamlandı.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
