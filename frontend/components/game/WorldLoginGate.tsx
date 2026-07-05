'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { HERO_CONTRACT, HERO_ABI, ITEM_CONTRACT, ITEM_ABI } from '@/lib/game/nft/contracts';

declare global {
  interface Window {
    __frostbiteHero?: {
      tokenId: number;
      element: number;
      rarity: number;
      level: number;
      xp: number;
      atk: number;
      def: number;
      spd: number;
    };
    __frostbiteWallet?: {
      address: string;
      authenticated: boolean;
    };
    __frostbiteItems?: Array<{
      tokenId: number;
      category: number; // 0=Weapon,1=Armor,2=Helmet,3=Shield,4=Ring
      element: number;
      rarity: number;
      atk: number;
      def: number;
      spd: number;
    }>;
  }
}

const PhaserGame = dynamic(
  () => import('@/lib/game/PhaserGame').then(m => m.PhaserGame),
  {
    ssr: false,
    loading: () => (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#0a0e1a' }}>
        <p style={{ fontFamily: 'monospace', color: '#00e5ff', fontSize: 18, animation: 'pulse 1.5s infinite' }}>
          Loading Frostbite World...
        </p>
      </div>
    ),
  }
);

const ELEMENT_NAMES = ['Fire', 'Water', 'Wind', 'Ice', 'Earth', 'Thunder', 'Shadow', 'Light'];
const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
const RARITY_COLORS = ['#aaaaaa', '#44bb44', '#4488ff', '#aa44ff', '#ffaa00'];

export function WorldLoginGate() {
  const { login, logout, authenticated, ready, user } = usePrivy();
  const { wallets } = useWallets();
  const [enterGame, setEnterGame] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [selectedTokenIdx, setSelectedTokenIdx] = useState(0);
  const [heroReady, setHeroReady] = useState(false);

  // Get wallet address when authenticated
  useEffect(() => {
    if (authenticated && wallets.length > 0) {
      const addr = wallets[0].address;
      setWalletAddress(addr);
      window.__frostbiteWallet = { address: addr, authenticated: true };
    } else {
      setWalletAddress(null);
      window.__frostbiteWallet = undefined;
    }
  }, [authenticated, wallets]);

  // Check NFT balance
  const { data: heroBalance, isLoading: nftLoading } = useReadContract({
    address: HERO_CONTRACT,
    abi: HERO_ABI,
    functionName: 'balanceOf',
    args: walletAddress ? [walletAddress as `0x${string}`] : undefined,
    chainId: 43114,
    query: { enabled: !!walletAddress },
  });

  const hasNFT = heroBalance ? Number(heroBalance) > 0 : false;

  // Get total supply
  const { data: totalSupply } = useReadContract({
    address: HERO_CONTRACT,
    abi: HERO_ABI,
    functionName: 'totalSupply',
    chainId: 43114,
    query: { enabled: hasNFT },
  });

  // Batch ownerOf calls
  const ownerOfContracts = useMemo(() => {
    if (!totalSupply || !hasNFT) return [];
    const count = Number(totalSupply);
    return Array.from({ length: count }, (_, i) => ({
      address: HERO_CONTRACT as `0x${string}`,
      abi: HERO_ABI,
      functionName: 'ownerOf' as const,
      args: [BigInt(i + 1)] as const,
      chainId: 43114 as const,
    }));
  }, [totalSupply, hasNFT]);

  const { data: ownerResults, isLoading: ownersLoading } = useReadContracts({
    contracts: ownerOfContracts,
    query: { enabled: ownerOfContracts.length > 0 },
  });

  // Find owned token IDs (memoized)
  const ownedTokenIds = useMemo(() => {
    if (!ownerResults || !walletAddress) return [];
    const lowerWallet = walletAddress.toLowerCase();
    const ids: number[] = [];
    ownerResults.forEach((result, index) => {
      if (result.status === 'success' && typeof result.result === 'string') {
        if (result.result.toLowerCase() === lowerWallet) {
          ids.push(index + 1);
        }
      }
    });
    return ids;
  }, [ownerResults, walletAddress]);

  // Batch getHero calls for owned tokens
  const heroContracts = useMemo(() => {
    if (ownedTokenIds.length === 0) return [];
    return ownedTokenIds.map(tokenId => ({
      address: HERO_CONTRACT as `0x${string}`,
      abi: HERO_ABI,
      functionName: 'getHero' as const,
      args: [BigInt(tokenId)] as const,
      chainId: 43114 as const,
    }));
  }, [ownedTokenIds]);

  const { data: heroResults, isLoading: heroesLoading } = useReadContracts({
    contracts: heroContracts,
    query: { enabled: heroContracts.length > 0 },
  });

  // Parse hero data for all owned tokens
  const heroes = useMemo(() => {
    if (!heroResults || ownedTokenIds.length === 0) return [];
    return ownedTokenIds.map((tokenId, i) => {
      const result = heroResults[i];
      if (result?.status !== 'success' || !result.result) return null;
      const d = result.result as any;
      return {
        tokenId,
        element: Number(d.element),
        rarity: Number(d.rarity),
        level: Number(d.level),
        xp: Number(d.xp),
        atk: Number(d.atk),
        def: Number(d.def),
        spd: Number(d.spd),
      };
    }).filter(Boolean) as NonNullable<typeof window.__frostbiteHero>[];
  }, [heroResults, ownedTokenIds]);

  // Set window global when hero is selected
  const selectedHero = heroes[selectedTokenIdx] || heroes[0] || null;
  useEffect(() => {
    if (selectedHero) {
      window.__frostbiteHero = { ...selectedHero };
      setHeroReady(true);
      console.log('[NFT Gate] Hero ready:', selectedHero);
    } else {
      window.__frostbiteHero = undefined;
      setHeroReady(false);
    }
  }, [selectedHero?.tokenId, selectedHero?.atk]);

  // ─── Item NFT Loading (ERC-1155) ───
  const { data: itemNextTokenId } = useReadContract({
    address: ITEM_CONTRACT,
    abi: ITEM_ABI,
    functionName: 'nextTokenId',
    chainId: 43114,
    query: { enabled: !!walletAddress && hasNFT },
  });

  // Batch balanceOf for all item tokenIds
  const itemBalanceContracts = useMemo(() => {
    if (!itemNextTokenId || !walletAddress) return [];
    const count = Math.min(Number(itemNextTokenId) - 1, 500); // cap at 500
    if (count <= 0) return [];
    const accounts = Array(count).fill(walletAddress as `0x${string}`);
    const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));
    return [{
      address: ITEM_CONTRACT as `0x${string}`,
      abi: ITEM_ABI,
      functionName: 'balanceOfBatch' as const,
      args: [accounts, ids] as const,
      chainId: 43114 as const,
    }];
  }, [itemNextTokenId, walletAddress]);

  const { data: itemBalanceResults } = useReadContracts({
    contracts: itemBalanceContracts,
    query: { enabled: itemBalanceContracts.length > 0 },
  });

  // Find owned item token IDs
  const ownedItemIds = useMemo(() => {
    if (!itemBalanceResults?.[0] || itemBalanceResults[0].status !== 'success') return [];
    const balances = itemBalanceResults[0].result as bigint[];
    const ids: number[] = [];
    balances.forEach((bal, i) => {
      if (bal > 0n) ids.push(i + 1);
    });
    return ids;
  }, [itemBalanceResults]);

  // Batch getItem for owned items
  const itemDataContracts = useMemo(() => {
    if (ownedItemIds.length === 0) return [];
    return ownedItemIds.map(tokenId => ({
      address: ITEM_CONTRACT as `0x${string}`,
      abi: ITEM_ABI,
      functionName: 'getItem' as const,
      args: [BigInt(tokenId)] as const,
      chainId: 43114 as const,
    }));
  }, [ownedItemIds]);

  const { data: itemDataResults } = useReadContracts({
    contracts: itemDataContracts,
    query: { enabled: itemDataContracts.length > 0 },
  });

  // Parse and set items global
  useEffect(() => {
    if (!itemDataResults || ownedItemIds.length === 0) {
      window.__frostbiteItems = undefined;
      return;
    }
    const items = ownedItemIds.map((tokenId, i) => {
      const result = itemDataResults[i];
      if (result?.status !== 'success' || !result.result) return null;
      const d = result.result as any;
      return {
        tokenId,
        category: Number(d.category),
        element: Number(d.element),
        rarity: Number(d.rarity),
        atk: Number(d.atk),
        def: Number(d.def),
        spd: Number(d.spd),
      };
    }).filter(Boolean) as NonNullable<typeof window.__frostbiteItems>[number][];
    window.__frostbiteItems = items.length > 0 ? items : undefined;
    console.log('[NFT Gate] Items loaded:', items.length, items);
  }, [itemDataResults, ownedItemIds.length]);

  // Debug
  useEffect(() => {
    if (walletAddress) {
      console.log('[NFT Gate] Wallet:', walletAddress, 'Heroes:', heroes.length, 'Items:', ownedItemIds.length);
    }
  }, [walletAddress, heroes.length, ownedItemIds.length]);

  const handleEnterWithWallet = useCallback(() => {
    if (!heroReady) return;
    setEnterGame(true);
  }, [heroReady]);

  if (enterGame) {
    return <PhaserGame />;
  }

  if (!ready) {
    return (
      <div style={styles.container}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Initializing...</p>
      </div>
    );
  }

  const isLoadingHeroes = nftLoading || ownersLoading || heroesLoading;

  return (
    <div style={styles.container}>
      <div style={styles.gridBg} />

      <div style={styles.logoSection}>
        <h1 style={styles.title}>FROSTBITE</h1>
        <p style={styles.subtitle}>NFT Battle Arena on Avalanche</p>
        <div style={styles.divider}>
          <span style={styles.diamond}>&#9670;</span>
        </div>
      </div>

      <div style={styles.authSection}>
        {authenticated && walletAddress ? (
          <>
            <div style={styles.walletInfo}>
              <div style={styles.connectedDot} />
              <span style={styles.connectedText}>Connected</span>
              <span style={styles.addressText}>
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </span>
            </div>

            {user?.email && (
              <p style={styles.emailText}>{user.email.address}</p>
            )}
            {user?.google && (
              <p style={styles.emailText}>{user.google.email}</p>
            )}

            {isLoadingHeroes ? (
              <p style={{ color: '#4488aa', fontSize: 14 }}>Loading heroes...</p>
            ) : hasNFT && heroes.length > 0 ? (
              <>
                <div style={{
                  padding: '8px 16px', background: 'rgba(68,221,102,0.1)',
                  border: '1px solid rgba(68,221,102,0.3)', borderRadius: 8,
                  color: '#44dd66', fontSize: 13, fontWeight: 600,
                }}>
                  {heroes.length} Hero NFT{heroes.length > 1 ? 's' : ''} found
                </div>

                {/* Hero selector */}
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {heroes.map((hero, idx) => {
                    const isSelected = idx === selectedTokenIdx;
                    return (
                      <button
                        key={hero.tokenId}
                        onClick={() => setSelectedTokenIdx(idx)}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          background: isSelected ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.03)',
                          border: isSelected ? '2px solid rgba(0,229,255,0.5)' : '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 10,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'all 0.15s',
                          boxShadow: isSelected ? '0 0 16px rgba(0,229,255,0.25)' : 'none',
                          transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                        }}
                      >
                        <span style={{
                          color: isSelected ? '#00e5ff' : '#8899aa',
                          fontSize: 14,
                          fontWeight: isSelected ? 700 : 500,
                        }}>
                          Hero #{hero.tokenId}
                        </span>
                        <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                          <span style={{ color: RARITY_COLORS[hero.rarity] }}>
                            {RARITY_NAMES[hero.rarity]}
                          </span>
                          <span style={{ color: '#88aacc' }}>
                            {ELEMENT_NAMES[hero.element]}
                          </span>
                          <span style={{ color: '#667788' }}>
                            Lv.{hero.level}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Selected hero stats */}
                {selectedHero && (
                  <div style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'rgba(0,229,255,0.05)',
                    border: '1px solid rgba(0,229,255,0.15)',
                    borderRadius: 10,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 8,
                    textAlign: 'center',
                  }}>
                    <div>
                      <p style={{ color: '#cc4444', fontSize: 11, margin: 0 }}>ATK</p>
                      <p style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, margin: '2px 0 0' }}>{selectedHero.atk}</p>
                    </div>
                    <div>
                      <p style={{ color: '#4488cc', fontSize: 11, margin: 0 }}>DEF</p>
                      <p style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, margin: '2px 0 0' }}>{selectedHero.def}</p>
                    </div>
                    <div>
                      <p style={{ color: '#44cc44', fontSize: 11, margin: 0 }}>SPD</p>
                      <p style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, margin: '2px 0 0' }}>{selectedHero.spd}</p>
                    </div>
                  </div>
                )}

                <button
                  style={{
                    ...styles.primaryBtn,
                    opacity: heroReady ? 1 : 0.5,
                    cursor: heroReady ? 'pointer' : 'not-allowed',
                  }}
                  onClick={handleEnterWithWallet}
                  disabled={!heroReady}
                >
                  Enter World
                </button>

                <a href="/world/mint" style={{
                  width: '100%',
                  padding: '10px 24px',
                  fontSize: 13,
                  color: '#00e5ff',
                  background: 'rgba(0,229,255,0.06)',
                  border: '1px solid rgba(0,229,255,0.2)',
                  borderRadius: 10,
                  cursor: 'pointer',
                  textAlign: 'center' as const,
                  textDecoration: 'none',
                  display: 'block',
                }}>
                  Mint More Heroes & Items
                </a>
              </>
            ) : hasNFT ? (
              <p style={{ color: '#4488aa', fontSize: 14 }}>Scanning for your heroes...</p>
            ) : (
              <>
                <div style={{
                  padding: '12px 20px', background: 'rgba(204,68,68,0.1)',
                  border: '1px solid rgba(204,68,68,0.3)', borderRadius: 8,
                  textAlign: 'center' as const,
                }}>
                  <p style={{ color: '#cc4444', fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>
                    No Hero NFT Found
                  </p>
                  <p style={{ color: '#886666', fontSize: 12, margin: 0 }}>
                    You need a Frostbite Hero NFT to enter the World
                  </p>
                  <p style={{ color: '#554444', fontSize: 10, margin: '4px 0 0' }}>
                    Wallet: {walletAddress?.slice(0, 10)}...{walletAddress?.slice(-6)}
                  </p>
                </div>
                <a href="/world/mint" style={{
                  ...styles.primaryBtn,
                  display: 'block',
                  textAlign: 'center' as const,
                  textDecoration: 'none',
                  background: 'linear-gradient(135deg, #cc6600, #ff8822)',
                  boxShadow: '0 4px 20px rgba(204,102,0,0.3)',
                }}>
                  Mint Your Hero — 1 AVAX
                </a>
              </>
            )}

            <button style={styles.secondaryBtn} onClick={logout}>
              Disconnect
            </button>
          </>
        ) : (
          <>
            <p style={styles.description}>
              Connect with email, Google, Twitter, or your wallet.
              You need a Frostbite Hero NFT to enter the World.
            </p>

            <button style={styles.primaryBtn} onClick={login}>
              Connect Wallet
            </button>

            <a href="/world/mint" style={{
              ...styles.guestBtn,
              display: 'block',
              textAlign: 'center' as const,
              textDecoration: 'none',
              color: '#00e5ff',
              border: '1px solid rgba(0,229,255,0.2)',
            }}>
              Mint Hero NFT
            </a>
          </>
        )}

        {/* Always-visible entry to the idle-staking demo (no wallet required).
            <Link> so the /avalanche basePath is applied (a plain <a> is not basePath-aware). */}
        <Link href="/world/adventures" style={{
          width: '100%',
          marginTop: 4,
          padding: '12px 24px',
          fontSize: 13,
          fontWeight: 700,
          color: '#c9b8ff',
          background: 'linear-gradient(135deg, rgba(120,90,220,0.18), rgba(0,229,255,0.10))',
          border: '1px solid rgba(150,120,255,0.35)',
          borderRadius: 10,
          cursor: 'pointer',
          textAlign: 'center' as const,
          textDecoration: 'none',
          display: 'block',
        }}>
          ❄ Adventures — Idle Staking · Play Demo
        </Link>
      </div>

      <div style={styles.footer}>
        <p style={styles.footerText}>Powered by Avalanche C-Chain</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    background: 'linear-gradient(180deg, #0a0e1a 0%, #0d1525 50%, #0a0e1a 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Arial, sans-serif',
    position: 'relative',
    overflow: 'auto',
    WebkitOverflowScrolling: 'touch',
    padding: '20px 0',
  },
  gridBg: {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'linear-gradient(rgba(0,229,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.06) 1px, transparent 1px)',
    backgroundSize: '40px 40px',
    pointerEvents: 'none' as const,
  },
  logoSection: { textAlign: 'center' as const, marginBottom: 40 },
  title: {
    fontSize: 56, fontWeight: 900, color: '#ffffff', letterSpacing: 8, margin: 0,
    textShadow: '0 0 40px rgba(0,229,255,0.4), 0 0 20px rgba(0,229,255,0.2), 0 2px 6px rgba(0,0,0,0.8)',
  },
  subtitle: { fontSize: 16, color: '#00e5ff', letterSpacing: 4, marginTop: 8, textTransform: 'uppercase' as const },
  divider: { marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 },
  diamond: { color: '#00e5ff', fontSize: 12, opacity: 0.6 },
  authSection: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 16, maxWidth: 380, width: '90%' },
  description: { color: '#8899aa', fontSize: 14, textAlign: 'center' as const, lineHeight: 1.6, margin: '0 0 8px 0' },
  walletInfo: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
    background: 'rgba(0,229,255,0.08)', borderRadius: 12, border: '1px solid rgba(0,229,255,0.2)',
  },
  connectedDot: { width: 8, height: 8, borderRadius: '50%', background: '#44dd66', boxShadow: '0 0 8px #44dd66' },
  connectedText: { color: '#44dd66', fontSize: 13, fontWeight: 600 },
  addressText: { color: '#aabbcc', fontSize: 14, fontFamily: 'monospace' },
  emailText: { color: '#6688aa', fontSize: 13, margin: 0 },
  primaryBtn: {
    width: '100%', padding: '14px 24px', fontSize: 16, fontWeight: 700, color: '#ffffff',
    background: 'linear-gradient(135deg, #0088cc 0%, #00bbff 100%)', border: 'none', borderRadius: 12,
    cursor: 'pointer', letterSpacing: 1, transition: 'transform 0.15s, box-shadow 0.15s',
    boxShadow: '0 4px 24px rgba(0,136,204,0.4), 0 0 16px rgba(0,229,255,0.15)',
  },
  secondaryBtn: {
    width: '100%', padding: '10px 24px', fontSize: 13, color: '#8899aa',
    background: 'transparent', border: '1px solid rgba(136,153,170,0.3)', borderRadius: 10, cursor: 'pointer',
  },
  guestBtn: {
    width: '100%', padding: '12px 24px', fontSize: 14, color: '#667788',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, cursor: 'pointer',
  },
  footer: { position: 'absolute' as const, bottom: 20 },
  footerText: { color: '#334455', fontSize: 12 },
  spinner: {
    width: 32, height: 32, border: '3px solid rgba(0,229,255,0.2)',
    borderTopColor: '#00e5ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
  loadingText: { color: '#4488aa', fontSize: 14, marginTop: 16 },
};
