'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useReadContract, useWriteContract, useSwitchChain, usePublicClient } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import {
  heroToDataURL, generateHeroTraits,
  ELEMENTS, ELEMENT_LABELS, ELEMENT_ICONS,
} from '@/lib/game/nft/heroGenerator';
import {
  itemToDataURL, generateItemTraits,
  ITEM_CATEGORIES, CATEGORY_LABELS, CATEGORY_ICONS,
} from '@/lib/game/nft/itemGenerator';
import { HERO_CONTRACT, ITEM_CONTRACT, AVALANCHE_CHAIN_ID } from '@/lib/game/nft/contracts';

// ─── Contract addresses ───
const MARKETPLACE_ADDRESS = '0xF7bd584a0558311a501F8313754e61C039545fa5' as const;

// ─── ABIs ───
const MARKETPLACE_ABI = [
  { inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'price', type: 'uint256' }], name: 'listHero', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'amount', type: 'uint256' }, { name: 'price', type: 'uint256' }], name: 'listItem', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'listingId', type: 'uint256' }, { name: 'maxPrice', type: 'uint256' }], name: 'buyListing', outputs: [], stateMutability: 'payable', type: 'function' },
  { inputs: [{ name: 'listingId', type: 'uint256' }], name: 'cancelListing', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'getActiveListingCount', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], name: 'getActiveListings', outputs: [{ name: '', type: 'uint256[]' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'listingId', type: 'uint256' }], name: 'getListing', outputs: [{ components: [
    { name: 'nftType', type: 'uint8' }, { name: 'seller', type: 'address' }, { name: 'tokenId', type: 'uint256' },
    { name: 'amount', type: 'uint256' }, { name: 'price', type: 'uint256' }, { name: 'active', type: 'bool' },
  ], name: '', type: 'tuple' }], stateMutability: 'view', type: 'function' },
] as const;

const HERO_ABI = [
  { inputs: [{ name: 'tokenId', type: 'uint256' }], name: 'getHero', outputs: [{ components: [
    { name: 'element', type: 'uint8' }, { name: 'rarity', type: 'uint8' }, { name: 'level', type: 'uint16' },
    { name: 'xp', type: 'uint32' }, { name: 'atk', type: 'uint16' }, { name: 'def', type: 'uint16' }, { name: 'spd', type: 'uint16' },
    { name: 'baseAtk', type: 'uint16' }, { name: 'baseDef', type: 'uint16' }, { name: 'baseSpd', type: 'uint16' },
  ], name: '', type: 'tuple' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], name: 'approve', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'tokenId', type: 'uint256' }], name: 'getApproved', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalSupply', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

const ITEM_ABI_MARKETPLACE = [
  { inputs: [{ name: 'tokenId', type: 'uint256' }], name: 'getItem', outputs: [{ components: [
    { name: 'category', type: 'uint8' }, { name: 'element', type: 'uint8' }, { name: 'rarity', type: 'uint8' },
    { name: 'atk', type: 'uint16' }, { name: 'def', type: 'uint16' }, { name: 'spd', type: 'uint16' },
  ], name: '', type: 'tuple' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], name: 'setApprovalForAll', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'account', type: 'address' }, { name: 'operator', type: 'address' }], name: 'isApprovedForAll', outputs: [{ name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
] as const;

// ─── Constants ───
const RARITY_NAMES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
const RARITY_COLORS: Record<string, string> = {
  common: '#888888', uncommon: '#44cc44', rare: '#4488ff', epic: '#cc44ff', legendary: '#ffaa00',
};

type Tab = 'heroes' | 'items' | 'my';

interface ListingData {
  listingId: bigint;
  nftType: number;
  seller: string;
  tokenId: bigint;
  amount: bigint;
  price: bigint;
  active: boolean;
}

interface HeroData {
  element: number; rarity: number; level: number; xp: number;
  atk: number; def: number; spd: number;
  baseAtk: number; baseDef: number; baseSpd: number;
}

interface ItemData {
  category: number; element: number; rarity: number;
  atk: number; def: number; spd: number;
}

interface EnrichedListing {
  listing: ListingData;
  heroData?: HeroData;
  itemData?: ItemData;
  imageUrl?: string;
}

// ─── Main Page ───
export default function MarketplacePage() {
  const [tab, setTab] = useState<Tab>('heroes');
  const [listings, setListings] = useState<EnrichedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [listHeroId, setListHeroId] = useState('');
  const [listHeroPrice, setListHeroPrice] = useState('');
  const [listItemId, setListItemId] = useState('');
  const [listItemAmount, setListItemAmount] = useState('1');
  const [listItemPrice, setListItemPrice] = useState('');

  const { address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  // Read listing count
  const { data: listingCount, refetch: refetchCount } = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: 'getActiveListingCount',
  });

  // Read active listing IDs
  const { data: activeListingIds, refetch: refetchIds } = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: 'getActiveListings',
    args: [BigInt(0), listingCount ? BigInt(listingCount) : BigInt(50)],
    query: { enabled: listingCount !== undefined },
  });

  // Fetch listing details + NFT data using wagmi publicClient
  const fetchListings = useCallback(async () => {
    if (!activeListingIds || activeListingIds.length === 0 || !publicClient) {
      setListings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const enriched: EnrichedListing[] = [];
      for (const id of activeListingIds) {
        try {
          const result = await publicClient.readContract({
            address: MARKETPLACE_ADDRESS,
            abi: MARKETPLACE_ABI,
            functionName: 'getListing',
            args: [id],
          }) as { nftType: number; seller: string; tokenId: bigint; amount: bigint; price: bigint; active: boolean };

          if (!result.active) continue;

          const listing: ListingData = {
            listingId: id,
            nftType: Number(result.nftType),
            seller: result.seller,
            tokenId: result.tokenId,
            amount: result.amount,
            price: result.price,
            active: result.active,
          };

          let heroData: HeroData | undefined;
          let itemData: ItemData | undefined;
          let imageUrl: string | undefined;

          if (listing.nftType === 0) {
            const hero = await publicClient.readContract({
              address: HERO_CONTRACT,
              abi: HERO_ABI,
              functionName: 'getHero',
              args: [listing.tokenId],
            }) as any;
            heroData = {
              element: Number(hero.element), rarity: Number(hero.rarity),
              level: Number(hero.level), xp: Number(hero.xp),
              atk: Number(hero.atk), def: Number(hero.def), spd: Number(hero.spd),
              baseAtk: Number(hero.baseAtk), baseDef: Number(hero.baseDef), baseSpd: Number(hero.baseSpd),
            };
            const element = ELEMENTS[heroData.element] || 'fire';
            const traits = generateHeroTraits(Number(listing.tokenId), element);
            traits.rarity = RARITY_NAMES[heroData.rarity] || 'common';
            imageUrl = heroToDataURL(traits, 4);
          } else {
            const item = await publicClient.readContract({
              address: ITEM_CONTRACT as `0x${string}`,
              abi: ITEM_ABI_MARKETPLACE,
              functionName: 'getItem',
              args: [listing.tokenId],
            }) as any;
            itemData = {
              category: Number(item.category), element: Number(item.element),
              rarity: Number(item.rarity),
              atk: Number(item.atk), def: Number(item.def), spd: Number(item.spd),
            };
            const element = ELEMENTS[itemData.element] || 'fire';
            const category = ITEM_CATEGORIES[itemData.category] || 'weapon';
            const traits = generateItemTraits(Number(listing.tokenId), category, element);
            traits.rarity = RARITY_NAMES[itemData.rarity] || 'common';
            imageUrl = itemToDataURL(traits, 4);
          }

          enriched.push({ listing, heroData, itemData, imageUrl });
        } catch {
          // skip individual listing errors
        }
      }
      setListings(enriched);
    } catch (e) {
      console.error('Failed to fetch listings:', e);
    }
    setLoading(false);
  }, [activeListingIds, publicClient]);

  useEffect(() => { fetchListings(); }, [fetchListings]);

  const refreshAll = useCallback(() => {
    refetchCount();
    refetchIds();
    setTimeout(() => fetchListings(), 1000);
  }, [refetchCount, refetchIds, fetchListings]);

  // Filter listings by tab
  const filteredListings = useMemo(() => {
    if (tab === 'heroes') return listings.filter(l => l.listing.nftType === 0);
    if (tab === 'items') return listings.filter(l => l.listing.nftType === 1);
    if (tab === 'my') return listings.filter(l => address && l.listing.seller.toLowerCase() === address.toLowerCase());
    return [];
  }, [listings, tab, address]);

  // ─── Actions ───
  const handleBuy = async (listing: ListingData) => {
    if (!isConnected) { setStatus('Connect wallet first'); return; }
    try {
      setStatus('Switching chain...');
      await switchChainAsync?.({ chainId: AVALANCHE_CHAIN_ID });
      setStatus('Confirm purchase...');
      const tx = await writeContractAsync({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'buyListing',
        args: [listing.listingId, listing.price],
        value: listing.price,
      });
      setStatus(`Purchased! TX: ${String(tx).slice(0, 10)}...`);
      refreshAll();
    } catch (e: any) {
      setStatus(`Error: ${e.shortMessage || e.message || 'Failed'}`);
    }
  };

  const handleCancel = async (listingId: bigint) => {
    if (!isConnected) { setStatus('Connect wallet first'); return; }
    try {
      setStatus('Switching chain...');
      await switchChainAsync?.({ chainId: AVALANCHE_CHAIN_ID });
      setStatus('Confirm cancellation...');
      const tx = await writeContractAsync({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'cancelListing',
        args: [listingId],
      });
      setStatus(`Cancelled! TX: ${String(tx).slice(0, 10)}...`);
      refreshAll();
    } catch (e: any) {
      setStatus(`Error: ${e.shortMessage || e.message || 'Failed'}`);
    }
  };

  const handleListHero = async () => {
    if (!isConnected) { setStatus('Connect wallet first'); return; }
    if (!listHeroId || !listHeroPrice) { setStatus('Enter token ID and price'); return; }
    try {
      setStatus('Switching chain...');
      await switchChainAsync?.({ chainId: AVALANCHE_CHAIN_ID });
      const approved = await publicClient?.readContract({
        address: HERO_CONTRACT,
        abi: HERO_ABI,
        functionName: 'getApproved',
        args: [BigInt(listHeroId)],
      });
      if ((approved as string)?.toLowerCase() !== MARKETPLACE_ADDRESS.toLowerCase()) {
        setStatus('Approving hero...');
        const approveTx = await writeContractAsync({
          address: HERO_CONTRACT,
          abi: HERO_ABI,
          functionName: 'approve',
          args: [MARKETPLACE_ADDRESS, BigInt(listHeroId)],
        });
        // The list tx would be simulated against pre-approval state and revert
        // if we don't wait for the approval to be mined first.
        await publicClient?.waitForTransactionReceipt({ hash: approveTx });
      }
      setStatus('Listing hero...');
      const tx = await writeContractAsync({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'listHero',
        args: [BigInt(listHeroId), parseEther(listHeroPrice)],
      });
      setStatus(`Listed! TX: ${String(tx).slice(0, 10)}...`);
      setListHeroId('');
      setListHeroPrice('');
      refreshAll();
    } catch (e: any) {
      setStatus(`Error: ${e.shortMessage || e.message || 'Failed'}`);
    }
  };

  const handleListItem = async () => {
    if (!isConnected) { setStatus('Connect wallet first'); return; }
    if (!listItemId || !listItemPrice) { setStatus('Enter token ID and price'); return; }
    try {
      setStatus('Switching chain...');
      await switchChainAsync?.({ chainId: AVALANCHE_CHAIN_ID });
      // FrostbiteItems is ERC-1155: there is no approve(address,uint256) —
      // the marketplace checks isApprovedForAll, so we must setApprovalForAll.
      const itemApproved = await publicClient?.readContract({
        address: ITEM_CONTRACT as `0x${string}`,
        abi: ITEM_ABI_MARKETPLACE,
        functionName: 'isApprovedForAll',
        args: [address as `0x${string}`, MARKETPLACE_ADDRESS],
      });
      if (!itemApproved) {
        setStatus('Approving items...');
        const approveTx = await writeContractAsync({
          address: ITEM_CONTRACT as `0x${string}`,
          abi: ITEM_ABI_MARKETPLACE,
          functionName: 'setApprovalForAll',
          args: [MARKETPLACE_ADDRESS, true],
        });
        await publicClient?.waitForTransactionReceipt({ hash: approveTx });
      }
      setStatus('Listing item...');
      const tx = await writeContractAsync({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'listItem',
        args: [BigInt(listItemId), BigInt(listItemAmount || '1'), parseEther(listItemPrice)],
      });
      setStatus(`Listed! TX: ${String(tx).slice(0, 10)}...`);
      setListItemId('');
      setListItemAmount('1');
      setListItemPrice('');
      refreshAll();
    } catch (e: any) {
      setStatus(`Error: ${e.shortMessage || e.message || 'Failed'}`);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #050810 0%, #0a0e1a 30%, #0f1525 100%)',
      color: '#e0e4ee',
      fontFamily: 'Inter, Arial, sans-serif',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      {/* ── Header ── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 32px', borderBottom: '1px solid rgba(0,229,255,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontSize: 22, fontWeight: 'bold', color: '#00e5ff',
            fontFamily: '"Press Start 2P", monospace',
          }}>
            WORLD MARKETPLACE
          </span>
        </div>
        <a href="/world" style={{
          padding: '10px 24px', background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)',
          borderRadius: 8, color: '#00e5ff', textDecoration: 'none', fontSize: 14, fontWeight: 600,
        }}>
          Back to World
        </a>
      </header>

      {/* ── Tab Bar ── */}
      <div style={{
        display: 'flex', gap: 0, justifyContent: 'center', padding: '24px 24px 0',
      }}>
        {([
          { key: 'heroes' as Tab, label: 'Heroes' },
          { key: 'items' as Tab, label: 'Items' },
          { key: 'my' as Tab, label: 'My Listings' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '12px 32px', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              fontFamily: '"Press Start 2P", monospace', letterSpacing: 1,
              background: tab === t.key ? 'rgba(0,229,255,0.12)' : 'transparent',
              border: 'none',
              borderBottom: tab === t.key ? '3px solid #00e5ff' : '3px solid transparent',
              color: tab === t.key ? '#00e5ff' : '#556677',
              transition: 'all 0.2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Status Bar ── */}
      {status && (
        <div style={{
          maxWidth: 960, margin: '16px auto 0', padding: '10px 20px',
          background: status.startsWith('Error') ? 'rgba(255,68,68,0.1)' : 'rgba(0,229,255,0.08)',
          border: `1px solid ${status.startsWith('Error') ? 'rgba(255,68,68,0.3)' : 'rgba(0,229,255,0.2)'}`,
          borderRadius: 8, textAlign: 'center', fontSize: 13,
          color: status.startsWith('Error') ? '#ff6666' : '#44dd66',
        }}>
          {status}
        </div>
      )}

      {/* ── Listing Count ── */}
      <div style={{
        maxWidth: 960, margin: '16px auto 0', padding: '0 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 13, color: '#556677' }}>
          {loading ? 'Loading...' : `${filteredListings.length} listing${filteredListings.length !== 1 ? 's' : ''}`}
        </span>
        <button onClick={refreshAll} style={{
          padding: '6px 16px', background: 'rgba(0,229,255,0.08)',
          border: '1px solid rgba(0,229,255,0.2)', borderRadius: 6,
          color: '#00e5ff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
        }}>
          Refresh
        </button>
      </div>

      {/* ── Listings Grid ── */}
      <section style={{
        maxWidth: 960, margin: '24px auto', padding: '0 24px',
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#556677' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>...</div>
            Loading marketplace listings
          </div>
        ) : filteredListings.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 60,
            background: 'rgba(20,26,40,0.5)', borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>
              {tab === 'heroes' ? '⚔' : tab === 'items' ? '\u{1F4B0}' : '\u{1F4DD}'}
            </div>
            <p style={{ color: '#556677', fontSize: 15 }}>
              {tab === 'heroes' && 'No heroes listed yet'}
              {tab === 'items' && 'No items listed yet'}
              {tab === 'my' && (isConnected ? 'You have no active listings' : 'Connect wallet to see your listings')}
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
          }}>
            {filteredListings.map((item, i) => (
              <ListingCard
                key={`${item.listing.listingId}-${i}`}
                enriched={item}
                isOwner={!!address && item.listing.seller.toLowerCase() === address.toLowerCase()}
                onBuy={() => handleBuy(item.listing)}
                onCancel={() => handleCancel(item.listing.listingId)}
                showCancel={tab === 'my'}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── List NFT Section ── */}
      <section style={{
        maxWidth: 960, margin: '0 auto', padding: '48px 24px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <h2 style={{
          fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 24, textAlign: 'center',
          fontFamily: '"Press Start 2P", monospace',
        }}>
          LIST YOUR NFT
        </h2>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24,
        }}>
          {/* List Hero */}
          <div style={{
            background: 'rgba(20,26,40,0.8)', borderRadius: 16, padding: 24,
            border: '1px solid rgba(0,229,255,0.15)',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#00e5ff', marginBottom: 16 }}>
              List a Hero
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Hero Token ID</label>
              <input
                type="number"
                value={listHeroId}
                onChange={e => setListHeroId(e.target.value)}
                placeholder="e.g. 42"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Price (AVAX)</label>
              <input
                type="text"
                value={listHeroPrice}
                onChange={e => setListHeroPrice(e.target.value)}
                placeholder="e.g. 5.0"
                style={inputStyle}
              />
            </div>
            <button onClick={handleListHero} style={listButtonStyle}>
              APPROVE &amp; LIST HERO
            </button>
          </div>

          {/* List Item */}
          <div style={{
            background: 'rgba(20,26,40,0.8)', borderRadius: 16, padding: 24,
            border: '1px solid rgba(0,229,255,0.15)',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#00e5ff', marginBottom: 16 }}>
              List an Item
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Item Token ID</label>
              <input
                type="number"
                value={listItemId}
                onChange={e => setListItemId(e.target.value)}
                placeholder="e.g. 7"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Amount</label>
              <input
                type="number"
                value={listItemAmount}
                onChange={e => setListItemAmount(e.target.value)}
                placeholder="1"
                min="1"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Price (AVAX)</label>
              <input
                type="text"
                value={listItemPrice}
                onChange={e => setListItemPrice(e.target.value)}
                placeholder="e.g. 1.5"
                style={inputStyle}
              />
            </div>
            <button onClick={handleListItem} style={listButtonStyle}>
              APPROVE &amp; LIST ITEM
            </button>
          </div>
        </div>

        {/* Wallet info */}
        <p style={{ fontSize: 12, color: '#556677', marginTop: 16, textAlign: 'center' }}>
          {isConnected
            ? `Connected: ${address?.slice(0, 6)}...${address?.slice(-4)} | Avalanche C-Chain`
            : 'Connect your wallet to list or buy NFTs'}
        </p>
      </section>
    </div>
  );
}

// ─── Listing Card Component ───
function ListingCard({
  enriched, isOwner, onBuy, onCancel, showCancel,
}: {
  enriched: EnrichedListing;
  isOwner: boolean;
  onBuy: () => void;
  onCancel: () => void;
  showCancel: boolean;
}) {
  const { listing, heroData, itemData, imageUrl } = enriched;
  const isHero = listing.nftType === 0;

  const rarityIndex = isHero ? heroData?.rarity ?? 0 : itemData?.rarity ?? 0;
  const rarityName = RARITY_NAMES[rarityIndex] || 'common';
  const rarityColor = RARITY_COLORS[rarityName];

  const elementIndex = isHero ? heroData?.element ?? 0 : itemData?.element ?? 0;
  const elementName = ELEMENTS[elementIndex] || 'fire';

  return (
    <div style={{
      background: 'rgba(20,26,40,0.8)',
      borderRadius: 14,
      border: `1px solid ${rarityColor}33`,
      overflow: 'hidden',
      transition: 'transform 0.2s, box-shadow 0.2s',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 32px ${rarityColor}22`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Image */}
      <div style={{
        width: '100%', aspectRatio: '1', background: '#0a0e1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: `1px solid ${rarityColor}22`,
      }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${isHero ? 'Hero' : 'Item'} #${listing.tokenId}`}
            style={{ width: '80%', height: '80%', imageRendering: 'pixelated', objectFit: 'contain' }}
          />
        ) : (
          <span style={{ fontSize: 48, opacity: 0.3 }}>{isHero ? '⚔' : '\u{1F4B0}'}</span>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px' }}>
        {/* Title Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
            {isHero ? 'Hero' : 'Item'} #{String(listing.tokenId)}
          </span>
          <span style={{
            padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: rarityColor, color: '#fff',
          }}>
            {rarityName.toUpperCase()}
          </span>
        </div>

        {/* Element + Type */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#889' }}>
            {ELEMENT_ICONS[elementName]} {ELEMENT_LABELS[elementName]}
          </span>
          {!isHero && itemData && (
            <span style={{ fontSize: 12, color: '#889' }}>
              {CATEGORY_ICONS[ITEM_CATEGORIES[itemData.category] || 'weapon']}{' '}
              {CATEGORY_LABELS[ITEM_CATEGORIES[itemData.category] || 'weapon']}
            </span>
          )}
        </div>

        {/* Stats */}
        {isHero && heroData && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <StatChip label="LVL" value={heroData.level} color="#fff" />
            <StatChip label="ATK" value={heroData.atk} color="#ff6644" />
            <StatChip label="DEF" value={heroData.def} color="#4488dd" />
            <StatChip label="SPD" value={heroData.spd} color="#ddaa22" />
          </div>
        )}
        {!isHero && itemData && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <StatChip label="ATK" value={itemData.atk} color="#ff6644" />
            <StatChip label="DEF" value={itemData.def} color="#4488dd" />
            <StatChip label="SPD" value={itemData.spd} color="#ddaa22" />
          </div>
        )}

        {/* Amount (items) */}
        {!isHero && listing.amount > BigInt(1) && (
          <div style={{ fontSize: 11, color: '#889', marginBottom: 8 }}>
            Amount: {String(listing.amount)}
          </div>
        )}

        {/* Price */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.06)',
          marginBottom: 8,
        }}>
          <span style={{ fontSize: 11, color: '#667' }}>Price</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
            {formatEther(listing.price)} <span style={{ fontSize: 11, color: '#00e5ff' }}>AVAX</span>
          </span>
        </div>

        {/* Seller */}
        <div style={{ fontSize: 10, color: '#445', marginBottom: 10 }}>
          Seller: {listing.seller.slice(0, 6)}...{listing.seller.slice(-4)}
        </div>

        {/* Buttons */}
        {showCancel && isOwner ? (
          <button onClick={onCancel} style={{
            width: '100%', padding: '10px', borderRadius: 8, border: 'none',
            background: 'rgba(255,68,68,0.15)', color: '#ff6666',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            transition: 'background 0.2s',
          }}>
            CANCEL LISTING
          </button>
        ) : !isOwner ? (
          <button onClick={onBuy} style={{
            width: '100%', padding: '10px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg, #00aacc, #0077aa)', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,229,255,0.2)',
            transition: 'opacity 0.2s',
          }}>
            BUY NOW
          </button>
        ) : (
          <div style={{
            width: '100%', padding: '10px', borderRadius: 8,
            background: 'rgba(255,255,255,0.03)', textAlign: 'center',
            color: '#445', fontSize: 12,
          }}>
            Your listing
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stat Chip ───
function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      flex: 1, textAlign: 'center', padding: '4px 0',
      background: 'rgba(255,255,255,0.03)', borderRadius: 4,
    }}>
      <div style={{ fontSize: 9, color: '#556', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, color, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

// ─── Shared Styles ───
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: '#556677', fontWeight: 600, display: 'block', marginBottom: 4,
  textTransform: 'uppercase', letterSpacing: 0.5,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: 'rgba(10,14,26,0.8)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#e0e4ee', fontSize: 14, outline: 'none',
  boxSizing: 'border-box',
};

const listButtonStyle: React.CSSProperties = {
  width: '100%', padding: '12px', borderRadius: 10, border: 'none',
  background: 'linear-gradient(135deg, #00aacc, #0077aa)', color: '#fff',
  fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
  boxShadow: '0 4px 16px rgba(0,229,255,0.2)',
};

