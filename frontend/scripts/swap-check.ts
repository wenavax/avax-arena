import { createPublicClient, http, parseAbi, parseEther, formatUnits } from 'viem';
import { avalanche } from 'viem/chains';

const pub = createPublicClient({ chain: avalanche, transport: http('https://api.avax.network/ext/bc/C/rpc') });
const QUOTER = '0x64b57F4249aA99a812212cee7DAEFEDC40B203cD';
const WRAPPER = '0xBe32e2C373C0F01FDA018772252C477fcf8aeFEb';
const WAVAX = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7';
const USDC = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E';
const FSB = '0x96D9fB6BD38f1E0D9b1A9a9f763595F928B56214';
const TREASURY = '0x301b013280317a75f808A3C0D23e82e9027A6b77'; // 42 AVAX'lı EOA — sadece eth_call 'from'
const QUOTER_ABI = parseAbi(['function findBestPathFromAmountIn(address[] route, uint128 amountIn) view returns ((address[] route, address[] pairs, uint256[] binSteps, uint8[] versions, uint128[] amounts, uint128[] virtualAmountsWithoutSlippage, uint128[] fees))']);
const WRAPPER_ABI = parseAbi(['function swapExactNATIVEForTokens(uint256 amountOutMin, (uint256[] pairBinSteps, uint8[] versions, address[] tokenPath) path, address to, uint256 deadline) payable returns (uint256 amountOut)']);

async function checkRoute(label: string, out: `0x${string}`, decimals: number) {
  const amountIn = parseEther('0.1');
  const q = await pub.readContract({ address: QUOTER, abi: QUOTER_ABI, functionName: 'findBestPathFromAmountIn', args: [[WAVAX, out], amountIn] });
  const quoted = q.amounts[q.amounts.length - 1];
  console.log(`[quote] ${label}: 0.1 AVAX -> ${formatUnits(quoted, decimals)} (binSteps=${q.binSteps.join(',')}, versions=${q.versions.join(',')})`);
  if (quoted === 0n) { console.log(`  !! ${label} quote SIFIR — likidite yok?`); return; }
  // wrapper uzerinden simulasyon (eth_call, tx yok)
  const sim = await pub.simulateContract({
    address: WRAPPER, abi: WRAPPER_ABI, functionName: 'swapExactNATIVEForTokens',
    args: [0n, { pairBinSteps: q.binSteps, versions: q.versions, tokenPath: q.route }, TREASURY, BigInt(Math.floor(Date.now() / 1000) + 300)],
    value: amountIn, account: TREASURY,
  });
  const eff = Number(formatUnits(sim.result, decimals)) / Number(formatUnits(quoted, decimals));
  console.log(`  [sim] wrapper amountOut = ${formatUnits(sim.result, decimals)} (quote'un %${(eff * 100).toFixed(2)}'i — %0.05 wrapper fee bekleniyor) ${eff > 0.99 ? '✓' : '⚠️'}`);
}

async function main() {
  await checkRoute('AVAX->USDC', USDC, 6);
  await checkRoute('AVAX->FSB', FSB, 18);
  // wrapper sahibi/fee (getter isimleri tahmin, hata non-fatal)
  for (const fn of ['owner() returns (address)', 'feeBps() returns (uint256)', 'FEE_BPS() returns (uint256)', 'treasury() returns (address)']) {
    try {
      const r = await pub.readContract({ address: WRAPPER, abi: parseAbi([`function ${fn} view` as any]) as any, functionName: fn.split('(')[0] as any });
      console.log(`[wrapper] ${fn.split('(')[0]} = ${r}`);
    } catch { /* getter yok */ }
  }
}
main().catch((e) => { console.error('HATA:', e?.shortMessage || e?.message); process.exit(1); });
