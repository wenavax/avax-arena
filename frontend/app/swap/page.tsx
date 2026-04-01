'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import {
  ArrowUpDown,
  Loader2,
  Settings,
  ChevronDown,
  Search,
  X,
  Check,
  AlertTriangle,
  ExternalLink,
  Zap,
  Info,
} from 'lucide-react';
import {
  useAccount,
  useSwitchChain,
  useWriteContract,
  useBalance,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { usePublicClient } from 'wagmi';
import { parseUnits, formatUnits, type Address, type Hex, erc20Abi, parseAbi } from 'viem';
import { ACTIVE_CHAIN_ID, EXPLORER_URL } from '@/lib/constants';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------------------
 * Trader Joe V2.2 Liquidity Book Constants & ABIs
 * ------------------------------------------------------------------------- */

const FROSTBITE_SWAP_ROUTER = '0xBe32e2C373C0F01FDA018772252C477fcf8aeFEb' as const;
const LB_ROUTER_ADDRESS = FROSTBITE_SWAP_ROUTER; // Fee-collecting wrapper over LBRouter V2.1
const LB_QUOTER_ADDRESS = '0x64b57F4249aA99a812212cee7DAEFEDC40B203cD' as const;
const WAVAX_ADDRESS = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7' as const;

const LB_QUOTER_ABI = parseAbi([
  'function findBestPathFromAmountIn(address[] calldata route, uint128 amountIn) external view returns ((address[] route, address[] pairs, uint256[] binSteps, uint8[] versions, uint128[] amounts, uint128[] virtualAmountsWithoutSlippage, uint128[] fees) quote)',
]);

const LB_ROUTER_ABI = parseAbi([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (uint256[] pairBinSteps, uint8[] versions, address[] tokenPath) path, address to, uint256 deadline) external returns (uint256 amountOut)',
  'function swapExactNATIVEForTokens(uint256 amountOutMin, (uint256[] pairBinSteps, uint8[] versions, address[] tokenPath) path, address to, uint256 deadline) external payable returns (uint256 amountOut)',
  'function swapExactTokensForNATIVE(uint256 amountIn, uint256 amountOutMinNATIVE, (uint256[] pairBinSteps, uint8[] versions, address[] tokenPath) path, address to, uint256 deadline) external returns (uint256 amountOut)',
]);

/* ---------------------------------------------------------------------------
 * Token List
 * ------------------------------------------------------------------------- */

interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logo: string;
  popular?: boolean;
  isNative?: boolean;
}

const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const AVALANCHE_TOKENS: Token[] = [
  { symbol: 'AVAX', name: 'Avalanche', address: NATIVE_TOKEN_ADDRESS, decimals: 18, logo: '/logo-avax.png', popular: true, isNative: true },
  { symbol: 'WAVAX', name: 'Wrapped AVAX', address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', decimals: 18, logo: '/logo-avax.png', popular: true },
  { symbol: 'USDC', name: 'USD Coin', address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6, logo: '/logo-usdc.png', popular: true },
  { symbol: 'USDT', name: 'Tether', address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6, logo: '/logo-usdt.png', popular: true },
  { symbol: 'FSB', name: 'Frostbite', address: '0x96D9fB6BD38f1E0D9b1A9a9f763595F928B56214', decimals: 18, logo: '/logo.png', popular: true },
  { symbol: 'JOE', name: 'Trader Joe', address: '0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd', decimals: 18, logo: '/logo-joe.png' },
];

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function isNativeToken(address: string) {
  return address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

/** For routing, native AVAX uses WAVAX address */
function routingAddress(token: Token): Address {
  return (isNativeToken(token.address) ? WAVAX_ADDRESS : token.address) as Address;
}

function formatDisplayBalance(balance: string | undefined, decimals: number): string {
  if (!balance) return '0';
  const num = parseFloat(formatUnits(BigInt(balance), decimals));
  if (num < 0.0001 && num > 0) return '<0.0001';
  if (num < 1) return num.toFixed(4);
  return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/* ---------------------------------------------------------------------------
 * Route types
 * ------------------------------------------------------------------------- */

interface Route {
  pairBinSteps: bigint[];
  versions: number[];
  tokenPath: Address[];
  amountOut: bigint;
  fees: bigint[];
}

/* ---------------------------------------------------------------------------
 * Token Logo Component
 * ------------------------------------------------------------------------- */

function TokenLogo({ token, size = 28 }: { token: Token; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const fallbackEmojis: Record<string, string> = {
    AVAX: '\u{1F53A}',
    WAVAX: '\u{1F53A}',
    USDC: '\u{1F4B5}',
    USDT: '\u{1F4B5}',
    JOE: '\u{1F534}',
  };

  if (imgError) {
    return (
      <span className="flex items-center justify-center" style={{ width: size, height: size, fontSize: size * 0.65 }}>
        {fallbackEmojis[token.symbol] || token.symbol[0]}
      </span>
    );
  }

  return (
    <Image
      src={token.logo}
      alt={token.symbol}
      width={size}
      height={size}
      className="rounded-full"
      onError={() => setImgError(true)}
    />
  );
}

/* ---------------------------------------------------------------------------
 * Slippage Settings
 * ------------------------------------------------------------------------- */

const SLIPPAGE_OPTIONS = [50, 100, 300]; // basis points

function SlippageSettings({
  slippageBps,
  setSlippageBps,
  onClose,
}: {
  slippageBps: number;
  setSlippageBps: (v: number) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="absolute right-0 top-12 z-50 w-72 rounded-2xl glass-card p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-white/70">Slippage Tolerance</span>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-2 mb-3">
        {SLIPPAGE_OPTIONS.map((bps) => (
          <button
            key={bps}
            onClick={() => { setSlippageBps(bps); setCustom(''); }}
            className={cn(
              'flex-1 py-2 rounded-xl text-xs font-semibold transition-all',
              slippageBps === bps && !custom
                ? 'bg-frost-primary/20 text-frost-primary border border-frost-primary/30'
                : 'bg-white/[0.04] text-white/50 border border-white/[0.06] hover:bg-white/[0.08]'
            )}
          >
            {bps / 100}%
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder="Custom"
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val > 0 && val <= 50) {
              setSlippageBps(Math.round(val * 100));
            }
          }}
          className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-2 text-xs text-white/80 placeholder-white/20 outline-none focus:border-frost-primary/30 transition-colors"
        />
        <span className="text-xs text-white/30">%</span>
      </div>
      {slippageBps > 500 && (
        <div className="flex items-center gap-1.5 mt-2 text-frost-orange text-[10px]">
          <AlertTriangle className="w-3 h-3" />
          <span>High slippage may result in an unfavorable trade</span>
        </div>
      )}
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Token Selector Modal
 * ------------------------------------------------------------------------- */

function TokenSelectorModal({
  tokens,
  onSelect,
  onClose,
  excludeAddress,
  balances,
}: {
  tokens: Token[];
  onSelect: (t: Token) => void;
  onClose: () => void;
  excludeAddress?: string;
  balances: Record<string, string>;
}) {
  const [search, setSearch] = useState('');

  const popular = tokens.filter((t) => t.popular && t.address !== excludeAddress);
  const filtered = tokens.filter(
    (t) =>
      t.address !== excludeAddress &&
      (t.symbol.toLowerCase().includes(search.toLowerCase()) ||
        t.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-md rounded-2xl glass-card p-0 overflow-hidden"
        style={{ maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <span className="font-pixel text-sm text-white/80">Select Token</span>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <input
              type="text"
              placeholder="Search by name or symbol"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/80 placeholder-white/20 outline-none focus:border-frost-primary/30 transition-colors"
              autoFocus
            />
          </div>
        </div>

        {/* Popular tokens */}
        {!search && popular.length > 0 && (
          <div className="px-4 pb-2">
            <div className="flex flex-wrap gap-2">
              {popular.map((token) => (
                <button
                  key={token.address}
                  onClick={() => { onSelect(token); onClose(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-frost-primary/20 transition-all text-xs"
                >
                  <TokenLogo token={token} size={18} />
                  <span className="text-white/70 font-medium">{token.symbol}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Token list */}
        <div className="px-2 pb-2 overflow-y-auto max-h-[50vh] scrollbar-thin">
          {filtered.map((token) => {
            const bal = balances[token.address.toLowerCase()];
            return (
              <button
                key={token.address}
                onClick={() => { onSelect(token); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.04] transition-colors"
              >
                <TokenLogo token={token} size={36} />
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold text-white/80">{token.symbol}</div>
                  <div className="text-[11px] text-white/30">{token.name}</div>
                </div>
                {bal && (
                  <div className="text-right">
                    <div className="text-xs text-white/50 font-mono">
                      {formatDisplayBalance(bal, token.decimals)}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-8 text-center text-xs text-white/20">No tokens found</div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ===========================================================================
 * Main Swap Page
 * =========================================================================== */

export default function SwapPage() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();

  // Token state
  const [sellToken, setSellToken] = useState<Token>(AVALANCHE_TOKENS[0]); // AVAX
  const [buyToken, setBuyToken] = useState<Token>(AVALANCHE_TOKENS[2]); // USDC
  const [sellAmount, setSellAmount] = useState('');
  const [buyAmount, setBuyAmount] = useState('');

  // Quote state
  const [bestRoute, setBestRoute] = useState<Route | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [rate, setRate] = useState('');

  // UI state
  const [slippageBps, setSlippageBps] = useState(100); // 1%
  const [showSlippage, setShowSlippage] = useState(false);
  const [showSellTokenModal, setShowSellTokenModal] = useState(false);
  const [showBuyTokenModal, setShowBuyTokenModal] = useState(false);

  // Tx state
  const [isApproving, setIsApproving] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [swapSuccess, setSwapSuccess] = useState(false);

  // Token balances
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({});

  // Native balance
  const { data: nativeBalance } = useBalance({ address });

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // wagmi hooks
  const { writeContractAsync } = useWriteContract();
  const { isLoading: isTxPending, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // Watch tx confirmation
  useEffect(() => {
    if (isTxConfirmed && txHash) {
      setIsSwapping(false);
      setSwapSuccess(true);
      setSellAmount('');
      setBuyAmount('');
      setBestRoute(null);
      fetchBalances();
      setTimeout(() => setSwapSuccess(false), 5000);
    }
  }, [isTxConfirmed, txHash]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Fetch token balances ---- */
  const fetchBalances = useCallback(async () => {
    if (!address || !publicClient) return;

    const balMap: Record<string, string> = {};

    // Native AVAX
    if (nativeBalance) {
      balMap[NATIVE_TOKEN_ADDRESS.toLowerCase()] = nativeBalance.value.toString();
    }

    // ERC20 balances
    const erc20Tokens = AVALANCHE_TOKENS.filter((t) => !isNativeToken(t.address));
    const results = await Promise.allSettled(
      erc20Tokens.map((t) =>
        publicClient.readContract({
          address: t.address as Address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address],
        })
      )
    );

    results.forEach((res, i) => {
      if (res.status === 'fulfilled') {
        balMap[erc20Tokens[i].address.toLowerCase()] = (res.value as bigint).toString();
      }
    });

    setTokenBalances(balMap);
  }, [address, publicClient, nativeBalance]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  /* ---- Find best route via LBQuoter on-chain ---- */
  const findBestRoute = useCallback(
    async (tokenA: Address, tokenB: Address, amountIn: bigint): Promise<Route | null> => {
      if (!publicClient) return null;

      // Build candidate routes: direct + via WAVAX
      const routes: Address[][] = [[tokenA, tokenB]];
      const wavaxLower = WAVAX_ADDRESS.toLowerCase();
      if (tokenA.toLowerCase() !== wavaxLower && tokenB.toLowerCase() !== wavaxLower) {
        routes.push([tokenA, WAVAX_ADDRESS, tokenB]);
      }

      let bestRoute: Route | null = null;

      for (const route of routes) {
        try {
          const quote = await publicClient.readContract({
            address: LB_QUOTER_ADDRESS,
            abi: LB_QUOTER_ABI,
            functionName: 'findBestPathFromAmountIn',
            args: [route, amountIn],
          });

          // quote.amounts: [amountIn, ...intermediates, amountOut]
          const amountOut = BigInt(quote.amounts[quote.amounts.length - 1]);
          if (amountOut === 0n) continue;

          if (!bestRoute || amountOut > bestRoute.amountOut) {
            bestRoute = {
              pairBinSteps: quote.binSteps.map((b) => BigInt(b)),
              versions: quote.versions.map((v) => Number(v)),
              tokenPath: quote.route.map((a) => a as Address),
              amountOut,
              fees: quote.fees.map((f) => BigInt(f)),
            };
          }
        } catch (err) {
          console.log('[quoter] Route failed:', route, err);
        }
      }

      return bestRoute;
    },
    [publicClient]
  );

  /* ---- Fetch price quote (on-chain, debounced) ---- */
  const fetchQuote = useCallback(
    async (amount: string) => {
      if (!amount || parseFloat(amount) <= 0 || !publicClient) {
        setBuyAmount('');
        setBestRoute(null);
        setRate('');
        setQuoteError('');
        return;
      }

      try {
        const sellAmountWei = parseUnits(amount, sellToken.decimals);
        const tokenA = routingAddress(sellToken);
        const tokenB = routingAddress(buyToken);

        // Don't allow same token swaps
        if (tokenA.toLowerCase() === tokenB.toLowerCase()) {
          setQuoteError('Cannot swap same token');
          return;
        }

        setQuoteLoading(true);
        setQuoteError('');

        const route = await findBestRoute(tokenA, tokenB, sellAmountWei);

        if (!route || route.amountOut === 0n) {
          setQuoteError('No liquidity found for this pair');
          setBuyAmount('');
          setBestRoute(null);
          setRate('');
          return;
        }

        setBestRoute(route);

        const buyAmountFormatted = formatUnits(route.amountOut, buyToken.decimals);
        setBuyAmount(buyAmountFormatted);

        // Calculate rate
        const sellNum = parseFloat(amount);
        const buyNum = parseFloat(buyAmountFormatted);
        if (sellNum > 0) {
          setRate((buyNum / sellNum).toFixed(buyToken.decimals <= 8 ? 6 : 4));
        }
      } catch (err) {
        console.error('Quote fetch error:', err);
        setQuoteError('Failed to fetch on-chain quote');
      } finally {
        setQuoteLoading(false);
      }
    },
    [sellToken, buyToken, publicClient, findBestRoute]
  );

  // Debounced price fetch on sell amount change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchQuote(sellAmount);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [sellAmount, fetchQuote]);

  /* ---- Flip tokens ---- */
  const flipTokens = () => {
    const prevSell = sellToken;
    const prevBuy = buyToken;
    setSellToken(prevBuy);
    setBuyToken(prevSell);
    setSellAmount(buyAmount);
    setBuyAmount('');
    setBestRoute(null);
    setRate('');
  };

  /* ---- Check & do approval on LBRouter ---- */
  const checkAndApprove = async (): Promise<boolean> => {
    if (isNativeToken(sellToken.address)) return true; // No approval needed for native
    if (!address || !publicClient) return false;

    try {
      const sellAmountWei = parseUnits(sellAmount, sellToken.decimals);

      const allowance = await publicClient.readContract({
        address: sellToken.address as Address,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, LB_ROUTER_ADDRESS],
      });

      if ((allowance as bigint) >= sellAmountWei) return true;

      // Need approval
      setIsApproving(true);

      const approveTxHash = await writeContractAsync({
        address: sellToken.address as Address,
        abi: erc20Abi,
        functionName: 'approve',
        args: [LB_ROUTER_ADDRESS, sellAmountWei],
      });

      // Wait for approval to be mined
      if (publicClient && approveTxHash) {
        await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
      }

      setIsApproving(false);
      return true;
    } catch (err) {
      console.error('Approval error:', err);
      setIsApproving(false);
      return false;
    }
  };

  /* ---- Execute swap via LBRouter ---- */
  const executeSwap = async () => {
    if (!address || !isConnected || !publicClient) return;

    // Switch chain if needed
    if (chainId !== ACTIVE_CHAIN_ID) {
      try {
        await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
      } catch {
        return;
      }
    }

    try {
      setIsSwapping(true);
      setSwapSuccess(false);

      // Re-fetch fresh quote
      const sellAmountWei = parseUnits(sellAmount, sellToken.decimals);
      const tokenA = routingAddress(sellToken);
      const tokenB = routingAddress(buyToken);

      const route = await findBestRoute(tokenA, tokenB, sellAmountWei);

      if (!route || route.amountOut === 0n) {
        setQuoteError('No liquidity found. Try a different amount.');
        setIsSwapping(false);
        return;
      }

      setBestRoute(route);

      // Approval check (for ERC20 sells)
      const approved = await checkAndApprove();
      if (!approved) {
        setIsSwapping(false);
        return;
      }

      // Deadline: current time + 10 minutes
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60);

      // Min amount out with slippage
      const amountOutMin = (route.amountOut * BigInt(10000 - slippageBps)) / 10000n;

      // Path from Quoter — versions and binSteps are already correct
      const swapPath = {
        pairBinSteps: route.pairBinSteps,
        versions: route.versions,
        tokenPath: route.tokenPath.map(t => t as `0x${string}`),
      };

      console.log('[swap] path:', JSON.stringify({
        pairBinSteps: swapPath.pairBinSteps.map(String),
        versions: swapPath.versions,
        tokenPath: swapPath.tokenPath,
      }));
      console.log('[swap] amountOutMin:', amountOutMin.toString());
      console.log('[swap] sellAmount:', sellAmountWei.toString());
      console.log('[swap] to:', address);
      console.log('[swap] deadline:', deadline.toString());

      let hash: Hex;

      const sellIsNative = isNativeToken(sellToken.address);
      const buyIsNative = isNativeToken(buyToken.address);

      if (sellIsNative) {
        hash = await writeContractAsync({
          address: LB_ROUTER_ADDRESS,
          abi: LB_ROUTER_ABI,
          functionName: 'swapExactNATIVEForTokens',
          args: [amountOutMin, swapPath, address as `0x${string}`, deadline],
          value: sellAmountWei,
          gas: 500000n,
        });
      } else if (buyIsNative) {
        hash = await writeContractAsync({
          address: LB_ROUTER_ADDRESS,
          abi: LB_ROUTER_ABI,
          functionName: 'swapExactTokensForNATIVE',
          args: [sellAmountWei, amountOutMin, swapPath, address as `0x${string}`, deadline],
          gas: 500000n,
        });
      } else {
        hash = await writeContractAsync({
          address: LB_ROUTER_ADDRESS,
          abi: LB_ROUTER_ABI,
          functionName: 'swapExactTokensForTokens',
          args: [sellAmountWei, amountOutMin, swapPath, address as `0x${string}`, deadline],
          gas: 500000n,
        });
      }

      setTxHash(hash);
    } catch (err: unknown) {
      console.error('Swap error:', err);
      const errObj = err as { shortMessage?: string; message?: string; details?: string };
      const msg = errObj.shortMessage || errObj.message || 'Swap failed';
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
        // User cancelled — don't show error
      } else if (msg.includes('INSUFFICIENT_OUTPUT_AMOUNT') || msg.includes('amountOutMin')) {
        setQuoteError('Slippage too low. Increase slippage tolerance and try again.');
      } else if (msg.includes('EXPIRED') || msg.includes('deadline')) {
        setQuoteError('Transaction expired. Please try again.');
      } else if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) {
        setQuoteError('Insufficient balance for this swap.');
      } else if (msg.includes('TRANSFER_FROM_FAILED') || msg.includes('allowance')) {
        setQuoteError('Token approval failed. Please approve and try again.');
      } else {
        setQuoteError('Swap failed: ' + msg.slice(0, 120));
      }
      setIsSwapping(false);
    }
  };

  /* ---- Sell token balance ---- */
  const sellBalance = tokenBalances[sellToken.address.toLowerCase()];
  const buyBalance = tokenBalances[buyToken.address.toLowerCase()];
  const sellBalanceNum = sellBalance ? parseFloat(formatUnits(BigInt(sellBalance), sellToken.decimals)) : 0;
  const hasInsufficientBalance = sellAmount ? parseFloat(sellAmount) > sellBalanceNum : false;

  /* ---- Button state ---- */
  const buttonState = useMemo(() => {
    if (!isConnected) return { text: 'Connect Wallet', disabled: true, action: undefined };
    if (chainId !== ACTIVE_CHAIN_ID) return { text: 'Switch to Avalanche', disabled: false, action: () => switchChainAsync({ chainId: ACTIVE_CHAIN_ID }) };
    if (!sellAmount || parseFloat(sellAmount) <= 0) return { text: 'Enter Amount', disabled: true, action: undefined };
    if (hasInsufficientBalance) return { text: `Insufficient ${sellToken.symbol} Balance`, disabled: true, action: undefined };
    if (quoteLoading) return { text: 'Fetching Quote...', disabled: true, action: undefined };
    if (quoteError) return { text: 'Quote Error', disabled: true, action: undefined };
    if (isApproving) return { text: `Approving ${sellToken.symbol}...`, disabled: true, action: undefined };
    if (isSwapping || isTxPending) return { text: 'Swapping...', disabled: true, action: undefined };

    const buyDisplay = buyAmount ? parseFloat(buyAmount).toFixed(4) : '...';
    return {
      text: `Swap ${parseFloat(sellAmount).toFixed(4)} ${sellToken.symbol} for ${buyDisplay} ${buyToken.symbol}`,
      disabled: !bestRoute,
      action: executeSwap,
    };
  }, [isConnected, chainId, sellAmount, hasInsufficientBalance, quoteLoading, quoteError, isApproving, isSwapping, isTxPending, buyAmount, sellToken, buyToken, bestRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Max button ---- */
  const handleMax = () => {
    if (!sellBalance) return;
    let maxAmount = formatUnits(BigInt(sellBalance), sellToken.decimals);
    // For native token, leave some for gas
    if (isNativeToken(sellToken.address)) {
      const bal = parseFloat(maxAmount);
      maxAmount = Math.max(0, bal - 0.05).toString();
    }
    setSellAmount(maxAmount);
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen flex flex-col items-center px-4 py-8 lg:py-12">
      {/* ---- Header ---- */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center mb-8"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="relative h-10 w-10 rounded-xl overflow-hidden ring-1 ring-white/[0.08] shadow-[0_0_15px_rgba(255,32,32,0.1)]">
            <Image src="/avalanche/logo.png" alt="Frostbite" width={40} height={40} className="rounded-xl" />
          </div>
          <h1 className="font-display text-lg tracking-wider">
            <span className="gradient-text">SWAP</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[10px] font-pixel text-white/40">
            <Zap className="w-3 h-3 text-frost-primary" />
            Powered by Trader Joe
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[10px] font-pixel text-white/40">
            <span className="w-1.5 h-1.5 rounded-full bg-frost-red" />
            Avalanche
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[10px] font-pixel text-white/40">
            <Info className="w-3 h-3" />
            On-Chain
          </span>
        </div>
      </motion.div>

      {/* ---- Swap Card ---- */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-md"
      >
        <div className="glass-card rounded-2xl p-4 relative" style={{ transform: 'none' }}>
          {/* Settings */}
          <div className="flex items-center justify-between mb-4 relative">
            <span className="font-pixel text-xs text-white/50">Trade Tokens</span>
            <button
              onClick={() => setShowSlippage(!showSlippage)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] transition-all',
                showSlippage
                  ? 'bg-frost-primary/10 text-frost-primary border border-frost-primary/20'
                  : 'bg-white/[0.04] text-white/40 border border-white/[0.06] hover:bg-white/[0.08]'
              )}
            >
              <Settings className="w-3 h-3" />
              {slippageBps / 100}%
            </button>
            <AnimatePresence>
              {showSlippage && (
                <SlippageSettings
                  slippageBps={slippageBps}
                  setSlippageBps={setSlippageBps}
                  onClose={() => setShowSlippage(false)}
                />
              )}
            </AnimatePresence>
          </div>

          {/* ---- You Pay ---- */}
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 mb-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-white/30 font-pixel">You Pay</span>
              {isConnected && (
                <button
                  onClick={handleMax}
                  className="text-[10px] text-white/30 hover:text-frost-primary transition-colors"
                >
                  Balance: {formatDisplayBalance(sellBalance, sellToken.decimals)}
                  <span className="ml-1 text-frost-primary/60 hover:text-frost-primary font-semibold">MAX</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={sellAmount}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  if (val.split('.').length <= 2) setSellAmount(val);
                }}
                className="flex-1 bg-transparent text-2xl font-semibold text-white/90 outline-none placeholder-white/20 min-w-0"
              />
              <button
                onClick={() => setShowSellTokenModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.1] hover:border-white/[0.15] transition-all flex-shrink-0"
              >
                <TokenLogo token={sellToken} size={24} />
                <span className="text-sm font-semibold text-white/80">{sellToken.symbol}</span>
                <ChevronDown className="w-3.5 h-3.5 text-white/30" />
              </button>
            </div>
          </div>

          {/* ---- Flip Button ---- */}
          <div className="flex justify-center -my-3 relative z-10">
            <motion.button
              whileHover={{ rotate: 180 }}
              transition={{ duration: 0.3 }}
              onClick={flipTokens}
              className="w-10 h-10 rounded-xl bg-frost-surface border-2 border-white/[0.08] flex items-center justify-center text-white/40 hover:text-frost-primary hover:border-frost-primary/30 transition-all shadow-lg"
            >
              <ArrowUpDown className="w-4 h-4" />
            </motion.button>
          </div>

          {/* ---- You Receive ---- */}
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 mt-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-white/30 font-pixel">You Receive</span>
              {isConnected && (
                <span className="text-[10px] text-white/20">
                  Balance: {formatDisplayBalance(buyBalance, buyToken.decimals)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                {quoteLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-frost-primary/50" />
                    <span className="text-sm text-white/20">Fetching price...</span>
                  </div>
                ) : (
                  <div className="text-2xl font-semibold text-white/90 truncate">
                    {buyAmount ? parseFloat(buyAmount).toFixed(buyToken.decimals <= 8 ? 6 : 4) : '0'}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowBuyTokenModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.1] hover:border-white/[0.15] transition-all flex-shrink-0"
              >
                <TokenLogo token={buyToken} size={24} />
                <span className="text-sm font-semibold text-white/80">{buyToken.symbol}</span>
                <ChevronDown className="w-3.5 h-3.5 text-white/30" />
              </button>
            </div>
          </div>

          {/* ---- Rate & Route Info ---- */}
          {rate && !quoteError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-2"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/30">Rate</span>
                <span className="text-white/60 font-mono">
                  1 {sellToken.symbol} = {rate} {buyToken.symbol}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/30">Route</span>
                <span className="text-white/60 font-mono">
                  {bestRoute && bestRoute.tokenPath.length === 2 ? 'Direct' : 'Via WAVAX'}
                  {bestRoute && ` (bin ${bestRoute.pairBinSteps.map(String).join(' → ')})`}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/30">Slippage Tolerance</span>
                <span className="text-white/60 font-mono">{slippageBps / 100}%</span>
              </div>
              {buyAmount && sellAmount && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-white/30">Min. Received</span>
                  <span className="text-white/60 font-mono">
                    {(parseFloat(buyAmount) * (1 - slippageBps / 10000)).toFixed(buyToken.decimals <= 8 ? 6 : 4)} {buyToken.symbol}
                  </span>
                </div>
              )}
            </motion.div>
          )}

          {/* ---- Error ---- */}
          {quoteError && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/10 text-red-400 text-xs"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{quoteError}</span>
            </motion.div>
          )}

          {/* ---- Swap Button ---- */}
          <button
            onClick={buttonState.action}
            disabled={buttonState.disabled}
            className={cn(
              'btn-3d w-full mt-4 py-4 text-sm',
              buttonState.disabled
                ? 'btn-3d-red opacity-40 cursor-not-allowed'
                : 'btn-3d-red'
            )}
          >
            {(isApproving || isSwapping || isTxPending) && (
              <Loader2 className="w-4 h-4 animate-spin" />
            )}
            <span className="truncate">{buttonState.text}</span>
          </button>

          {/* ---- Success Banner ---- */}
          <AnimatePresence>
            {swapSuccess && txHash && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-green-500/5 border border-green-500/10"
              >
                <Check className="w-4 h-4 text-frost-green flex-shrink-0" />
                <span className="text-xs text-frost-green flex-1">Swap successful!</span>
                <a
                  href={`${EXPLORER_URL}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-frost-green/60 hover:text-frost-green transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ---- Disclaimer ---- */}
        <div className="mt-4 text-center text-[10px] text-white/15 max-w-sm mx-auto leading-relaxed">
          Trades are executed directly on Trader Joe Liquidity Book (V2.2) smart contracts on Avalanche.
          No API keys or intermediaries. Always review the rate and slippage before confirming.
        </div>
      </motion.div>

      {/* ---- Token Selector Modals ---- */}
      <AnimatePresence>
        {showSellTokenModal && (
          <TokenSelectorModal
            tokens={AVALANCHE_TOKENS}
            onSelect={(t) => {
              if (t.address === buyToken.address) flipTokens();
              else setSellToken(t);
            }}
            onClose={() => setShowSellTokenModal(false)}
            excludeAddress={buyToken.address}
            balances={tokenBalances}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showBuyTokenModal && (
          <TokenSelectorModal
            tokens={AVALANCHE_TOKENS}
            onSelect={(t) => {
              if (t.address === sellToken.address) flipTokens();
              else setBuyToken(t);
            }}
            onClose={() => setShowBuyTokenModal(false)}
            excludeAddress={sellToken.address}
            balances={tokenBalances}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
