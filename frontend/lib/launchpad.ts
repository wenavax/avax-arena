import { parseAbi } from 'viem';
import { avalanche, avalancheFuji } from 'viem/chains';

/* ---------------------------------------------------------------------------
 * Frostbite Launchpad — pump.fun-style bonding-curve token launcher
 * Factory (Avalanche mainnet): deployed 2026-07-06, owner = Gnosis Safe.
 * Pools have NO on-chain quote views — quoteBuy/quoteSell below replicate
 * CurveMath exactly in bigint (all divisions floor, identical results).
 *
 * Chain-flex: NEXT_PUBLIC_LAUNCHPAD_CHAIN=fuji points the whole launchpad
 * (pages + indexer API) at the Fuji TEST factory (launchFee 0, graduation
 * 0.08 AVAX) for rehearsals. Production default is mainnet.
 * ------------------------------------------------------------------------- */

const IS_FUJI = process.env.NEXT_PUBLIC_LAUNCHPAD_CHAIN === 'fuji';

export const LAUNCHPAD_CHAIN_ID = (IS_FUJI ? 43113 : 43114) as 43113 | 43114;
export const LAUNCHPAD_VIEM_CHAIN = IS_FUJI ? avalancheFuji : avalanche;
export const LAUNCHPAD_EXPLORER = IS_FUJI ? 'https://testnet.snowtrace.io' : 'https://snowtrace.io';
export const LAUNCHPAD_RPC = IS_FUJI
  ? 'https://api.avax-test.network/ext/bc/C/rpc'
  : process.env.NEXT_PUBLIC_MAINNET_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc';

export const LAUNCHPAD_FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_LAUNCHPAD_FACTORY_ADDRESS ||
  (IS_FUJI
    ? '0x483d6D484A55bAf20E8f662C5e685B1Ee32415C7' // Fuji TEST factory (fee 0, grad 0.08)
    : '0x7b9E30ADc9a3Acf1FFC5e61eb53267003F8317b4')) as `0x${string}`;

// Factory CREATE block — indexer scans TokenLaunched from here.
export const LAUNCHPAD_DEPLOY_BLOCK = IS_FUJI ? 56791300n : 89637163n;

export const LAUNCHPAD_FACTORY_ABI = parseAbi([
  // Writes
  'function createToken(string name, string symbol, string metadataURI) external payable returns (address token, address pool)',
  // Views
  'function launchCount() external view returns (uint256)',
  'function launches(uint256 id) external view returns (address token, address pool, address creator)',
  'function config() external view returns (uint256 launchFee, uint16 tradingFeeBps, uint256 graduationThreshold, uint256 vAvax0, uint256 y0, uint256 totalSupply, uint256 curveSupply, uint256 lpReserve, address treasury, address joeRouter)',
  'function paused() external view returns (bool)',
  // Events
  'event TokenLaunched(uint256 indexed id, address indexed token, address indexed pool, address creator, string metadataURI)',
]);

export const BONDING_POOL_ABI = parseAbi([
  // Writes
  'function buy(uint256 minTokensOut, uint256 deadline) external payable returns (uint256 out)',
  'function sell(uint256 tokenIn, uint256 minAvaxOut, uint256 deadline) external returns (uint256 net)',
  // Views
  'function token() external view returns (address)',
  'function state() external view returns (uint8)', // 0 = Trading, 1 = Graduated
  'function vAvax0() external view returns (uint256)',
  'function y0() external view returns (uint256)',
  'function realAvax() external view returns (uint256)',
  'function tokensSold() external view returns (uint256)',
  'function curveSupply() external view returns (uint256)',
  'function lpReserve() external view returns (uint256)',
  'function graduationThreshold() external view returns (uint256)',
  'function tradingFeeBps() external view returns (uint16)',
  'function joeRouter() external view returns (address)',
  // Events (avaxIn / avaxOut are net of fee; reserveAfter = realAvax after trade)
  'event Buy(address indexed buyer, uint256 avaxIn, uint256 fee, uint256 tokensOut, uint256 reserveAfter)',
  'event Sell(address indexed seller, uint256 tokensIn, uint256 fee, uint256 avaxOut, uint256 reserveAfter)',
  'event Graduated(uint256 avaxToLp, uint256 tokensToLp)',
]);

export const POOL_STATE_TRADING = 0;
export const POOL_STATE_GRADUATED = 1;

export interface CurveParams {
  vAvax0: bigint;
  y0: bigint;
  realAvax: bigint;
  feeBps: bigint;
}

const BPS = 10_000n;

/** BUY quote — avaxInTotal is msg.value; the 1% fee comes off the top first. */
export function quoteBuy(avaxInTotal: bigint, p: CurveParams): { tokensOut: bigint; fee: bigint } {
  if (avaxInTotal <= 0n) return { tokensOut: 0n, fee: 0n };
  const fee = (avaxInTotal * p.feeBps) / BPS;
  const avaxIn = avaxInTotal - fee;
  const x = p.vAvax0 + p.realAvax;
  const yCur = (p.vAvax0 * p.y0) / x;
  const yNew = (p.vAvax0 * p.y0) / (x + avaxIn);
  return { tokensOut: yCur - yNew, fee };
}

/** SELL quote — fee is taken from the gross AVAX proceeds; net is what the user receives. */
export function quoteSell(tokenIn: bigint, p: CurveParams): { net: bigint; fee: bigint; gross: bigint } {
  if (tokenIn <= 0n) return { net: 0n, fee: 0n, gross: 0n };
  const x = p.vAvax0 + p.realAvax;
  const yCur = (p.vAvax0 * p.y0) / x;
  const yNew = yCur + tokenIn;
  const xNew = (p.vAvax0 * p.y0) / yNew;
  let gross = x - xNew;
  if (gross > p.realAvax) gross = p.realAvax; // pool clamps to real reserves
  const fee = (gross * p.feeBps) / BPS;
  return { net: gross - fee, fee, gross };
}

/** Spot price in AVAX per token (float, display only): (vAvax0+realAvax)^2 / (vAvax0*y0) */
export function spotPrice(vAvax0: bigint, y0: bigint, realAvax: bigint): number {
  const x = Number(vAvax0 + realAvax) / 1e18;
  const k = (Number(vAvax0) / 1e18) * (Number(y0) / 1e18);
  if (k === 0) return 0;
  return (x * x) / k;
}

/** AVAX raised at which the curve fully exhausts (sell-out cap). */
export function curveExhaustionAvax(vAvax0: bigint, y0: bigint, curveSupply: bigint): bigint {
  const denom = y0 - curveSupply;
  if (denom <= 0n) return 0n;
  return (vAvax0 * curveSupply) / denom;
}

export function graduationProgressPct(realAvax: bigint, threshold: bigint): number {
  if (threshold <= 0n) return 0;
  const pct = Number((realAvax * 10_000n) / threshold) / 100;
  return Math.min(pct, 100);
}

/* ----------------------------- Display helpers ---------------------------- */

/** Compact number: 1234567 -> "1.23M" */
export function formatCompact(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs < 0.0001) return '<0.0001';
  if (abs < 1) return n.toFixed(4);
  if (abs < 1000) return n.toLocaleString('en-US', { maximumFractionDigits: digits });
  const units = ['', 'K', 'M', 'B', 'T'];
  const i = Math.min(Math.floor(Math.log10(abs) / 3), units.length - 1);
  return (n / Math.pow(10, i * 3)).toFixed(digits) + units[i];
}

/** Price with adaptive precision for very small AVAX prices. */
export function formatPrice(p: number): string {
  if (!isFinite(p) || p <= 0) return '—';
  if (p >= 0.01) return p.toFixed(4);
  const exp = Math.floor(Math.log10(p));
  return p.toFixed(Math.min(2 - exp, 12));
}

export function shortAddr(a?: string): string {
  if (!a) return '—';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Deterministic gradient for a token avatar, derived from its address. */
export function tokenGradient(address: string): { from: string; to: string; angle: number } {
  let h1 = 0;
  let h2 = 0;
  const a = (address || '0x0').toLowerCase();
  for (let i = 2; i < a.length; i++) {
    const c = a.charCodeAt(i);
    if (i % 2 === 0) h1 = (h1 * 31 + c) % 360;
    else h2 = (h2 * 37 + c) % 360;
  }
  return {
    from: `hsl(${h1} 80% 55%)`,
    to: `hsl(${(h2 + 120) % 360} 85% 45%)`,
    angle: (h1 + h2) % 360,
  };
}

export function traderJoeUrl(token: string): string {
  return `https://lfj.gg/avalanche/trade?outputCurrency=${token}`;
}

/** Metadata row served by /api/launchpad/tokens */
export interface LaunchMeta {
  id: number;
  token: string;
  pool: string;
  creator: string;
  metadata: string;
  block: number;
  ts: number;
  vol24h?: number;    // AVAX volume, last 24h (indexed trades)
  trades24h?: number;
}

/** Indexed trade row served by /api/launchpad/tokens?pool=… */
export interface IndexedTrade {
  kind: 'buy' | 'sell';
  account: string;
  avax: string;          // wei string (net of fee)
  tokens: string;        // wei string
  reserveAfter: string;  // realAvax after the trade — price basis for charts
  block: number;
  ts: number;
  tx: string;
}
