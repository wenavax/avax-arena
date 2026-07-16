'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { drawHero, generateHeroTraits, heroToDataURL, ELEMENTS, ELEMENT_LABELS, ELEMENT_ICONS, Element } from '@/lib/game/nft/heroGenerator';
import { drawItem, generateItemTraits, itemToDataURL, ITEM_CATEGORIES, CATEGORY_LABELS, CATEGORY_ICONS, ItemCategory } from '@/lib/game/nft/itemGenerator';
import { HERO_CONTRACT, ITEM_CONTRACT, HERO_ABI, ITEM_ABI, MINT_PRICE_HERO, MINT_PRICE_ITEM, AVALANCHE_CHAIN_ID } from '@/lib/game/nft/contracts';
import { useWriteContract, useReadContract, useAccount, useSwitchChain } from 'wagmi';
import { parseEther } from 'viem';
import { avalanche } from 'viem/chains';

const RARITY_COLORS: Record<string, string> = {
  common: '#888888',
  uncommon: '#44cc44',
  rare: '#4488ff',
  epic: '#cc44ff',
  legendary: '#ffaa00',
};

export default function MintPage() {
  const [selectedElement, setSelectedElement] = useState<Element>('fire');
  const [selectedCategory, setSelectedCategory] = useState<ItemCategory>('weapon');
  const [heroSeed, setHeroSeed] = useState(Date.now());
  const [itemSeed, setItemSeed] = useState(Date.now() + 1000);
  const heroCanvasRef = useRef<HTMLCanvasElement>(null);
  const itemCanvasRef = useRef<HTMLCanvasElement>(null);
  const [heroTraits, setHeroTraits] = useState<ReturnType<typeof generateHeroTraits> | null>(null);
  const [itemTraits, setItemTraits] = useState<ReturnType<typeof generateItemTraits> | null>(null);
  const [mintQty, setMintQty] = useState(1);
  const [mintStatus, setMintStatus] = useState('');

  // Wagmi hooks
  const { address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  // Read on-chain data
  const { data: heroSupply } = useReadContract({
    address: HERO_CONTRACT,
    abi: HERO_ABI,
    functionName: 'totalSupply',
  });
  const { data: heroBalance } = useReadContract({
    address: HERO_CONTRACT,
    abi: HERO_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  });

  const categoryIndex = ITEM_CATEGORIES.indexOf(selectedCategory);
  const { data: itemCategorySupply } = useReadContract({
    address: ITEM_CONTRACT,
    abi: ITEM_ABI,
    functionName: 'getCategorySupply',
    args: [categoryIndex],
  });

  // Mint hero
  const mintHero = async () => {
    if (!isConnected) { setMintStatus('Connect wallet first'); return; }
    try {
      setMintStatus('Switching chain...');
      await switchChainAsync?.({ chainId: AVALANCHE_CHAIN_ID });
      setMintStatus('Confirm transaction...');
      const elementIndex = ELEMENTS.indexOf(selectedElement);
      const tx = await writeContractAsync({
        address: HERO_CONTRACT,
        abi: HERO_ABI,
        functionName: 'mint',
        args: [elementIndex, BigInt(mintQty)],
        value: parseEther(MINT_PRICE_HERO) * BigInt(mintQty),
      });
      setMintStatus(`Minted! TX: ${String(tx).slice(0, 10)}...`);
    } catch (e: any) {
      setMintStatus(`Error: ${e.shortMessage || e.message || 'Failed'}`);
    }
  };

  // Mint item
  const mintItem = async () => {
    if (!isConnected) { setMintStatus('Connect wallet first'); return; }
    try {
      setMintStatus('Switching chain...');
      await switchChainAsync?.({ chainId: AVALANCHE_CHAIN_ID });
      setMintStatus('Confirm transaction...');
      const catIdx = ITEM_CATEGORIES.indexOf(selectedCategory);
      const elemIdx = ELEMENTS.indexOf(selectedElement);
      const tx = await writeContractAsync({
        address: ITEM_CONTRACT,
        abi: ITEM_ABI,
        functionName: 'mint',
        args: [catIdx, elemIdx, BigInt(mintQty)],
        value: parseEther(MINT_PRICE_ITEM) * BigInt(mintQty),
      });
      setMintStatus(`Minted! TX: ${String(tx).slice(0, 10)}...`);
    } catch (e: any) {
      setMintStatus(`Error: ${e.shortMessage || e.message || 'Failed'}`);
    }
  };

  // Preview hero
  useEffect(() => {
    if (!heroCanvasRef.current) return;
    const traits = generateHeroTraits(heroSeed, selectedElement);
    setHeroTraits(traits);
    const canvas = heroCanvasRef.current;
    drawHero(canvas, traits);
  }, [heroSeed, selectedElement]);

  // Preview item
  useEffect(() => {
    if (!itemCanvasRef.current) return;
    const traits = generateItemTraits(itemSeed, selectedCategory, selectedElement);
    setItemTraits(traits);
    const canvas = itemCanvasRef.current;
    drawItem(canvas, traits);
  }, [itemSeed, selectedCategory, selectedElement]);

  const randomizeHero = useCallback(() => setHeroSeed(Date.now()), []);
  const randomizeItem = useCallback(() => setItemSeed(Date.now()), []);

  // Generate item previews for all categories
  const [itemPreviews, setItemPreviews] = useState<Record<string, string>>({});
  useEffect(() => {
    const previews: Record<string, string> = {};
    for (const cat of ITEM_CATEGORIES) {
      const traits = generateItemTraits(itemSeed + ITEM_CATEGORIES.indexOf(cat) * 777, cat, selectedElement);
      previews[cat] = itemToDataURL(traits, 3);
    }
    setItemPreviews(previews);
  }, [itemSeed, selectedElement]);

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
          <span style={{ fontSize: 28, fontWeight: 'bold', color: '#00e5ff', fontFamily: '"Press Start 2P", monospace' }}>
            FROSTBITE
          </span>
          <span style={{ fontSize: 14, color: '#556677' }}>Avalanche World</span>
        </div>
        <a href="/world" style={{
          padding: '10px 24px', background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)',
          borderRadius: 8, color: '#00e5ff', textDecoration: 'none', fontSize: 14, fontWeight: 600,
        }}>
          Enter World
        </a>
      </header>

      {/* ── Hero Banner ── */}
      <section style={{
        textAlign: 'center', padding: '48px 24px 24px',
      }}>
        <h1 style={{
          fontSize: 42, fontWeight: 800, margin: 0,
          background: 'linear-gradient(90deg, #00e5ff, #ff6622, #ffdd00, #44cc44, #8866cc)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          fontFamily: '"Press Start 2P", monospace', letterSpacing: 2,
        }}>
          HEROES
        </h1>
        <p style={{ color: '#667788', fontSize: 16, marginTop: 8 }}>
          5,000 Unique Elemental Warriors — Your key to Avalanche World
        </p>
      </section>

      {/* ── Hero Mint Section ── */}
      <section style={{
        maxWidth: 900, margin: '0 auto', padding: '0 24px 48px',
        display: 'flex', gap: 40, flexWrap: 'wrap', justifyContent: 'center',
      }}>
        {/* Hero Preview */}
        <div style={{
          background: 'rgba(20,26,40,0.8)', borderRadius: 16, padding: 24,
          border: '1px solid rgba(0,229,255,0.15)', textAlign: 'center', minWidth: 280,
        }}>
          <canvas
            ref={heroCanvasRef}
            width={64} height={64}
            style={{
              width: 256, height: 256, imageRendering: 'pixelated',
              borderRadius: 12, border: `2px solid ${heroTraits ? RARITY_COLORS[heroTraits.rarity] : '#333'}`,
            }}
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
            {heroTraits && (
              <>
                <span style={{
                  padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                  background: RARITY_COLORS[heroTraits.rarity], color: '#fff',
                }}>
                  {heroTraits.rarity.toUpperCase()}
                </span>
                <span style={{ fontSize: 13, color: '#889' }}>
                  {ELEMENT_ICONS[heroTraits.element]} {ELEMENT_LABELS[heroTraits.element]}
                </span>
              </>
            )}
          </div>
          <button onClick={randomizeHero} style={{
            marginTop: 12, padding: '8px 20px', background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#889',
            cursor: 'pointer', fontSize: 12,
          }}>
            🎲 Randomize Preview
          </button>
        </div>

        {/* Mint Controls */}
        <div style={{ flex: 1, minWidth: 300 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
            Mint Your Hero
          </h2>
          <p style={{ color: '#667788', fontSize: 14, marginBottom: 24 }}>
            Choose your element. Your hero&apos;s rarity, appearance, and base stats are determined at mint.
          </p>

          {/* Element Selector */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, color: '#556677', fontWeight: 600, display: 'block', marginBottom: 8 }}>
              SELECT ELEMENT
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ELEMENTS.map(el => (
                <button
                  key={el}
                  onClick={() => setSelectedElement(el)}
                  style={{
                    padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                    background: selectedElement === el ? 'rgba(0,229,255,0.15)' : 'rgba(20,26,40,0.8)',
                    border: selectedElement === el ? '2px solid #00e5ff' : '1px solid rgba(255,255,255,0.08)',
                    color: selectedElement === el ? '#00e5ff' : '#889',
                    fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
                  }}
                >
                  {ELEMENT_ICONS[el]} {ELEMENT_LABELS[el]}
                </button>
              ))}
            </div>
          </div>

          {/* Stats Preview */}
          <div style={{
            background: 'rgba(20,26,40,0.6)', borderRadius: 10, padding: 16,
            marginBottom: 24, border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ fontSize: 11, color: '#556677', marginBottom: 8, fontWeight: 600 }}>BASE STATS (varies by rarity)</div>
            <div style={{ display: 'flex', gap: 24 }}>
              <StatBar label="ATK" value={getBaseStats(selectedElement).atk} max={20} color="#ff6644" />
              <StatBar label="DEF" value={getBaseStats(selectedElement).def} max={20} color="#4488dd" />
              <StatBar label="SPD" value={getBaseStats(selectedElement).spd} max={20} color="#ddaa22" />
            </div>
          </div>

          {/* Price + Mint Button */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(0,229,255,0.08), rgba(0,100,200,0.08))',
            borderRadius: 12, padding: 20, border: '1px solid rgba(0,229,255,0.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 14, color: '#889' }}>Price</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>1 AVAX</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 14, color: '#889' }}>Minted</span>
              <span style={{ fontSize: 16, color: '#00e5ff' }}>{heroSupply?.toString() || '0'} / 5,000</span>
            </div>
            {/* Quantity selector */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, justifyContent: 'center' }}>
              {[1, 2, 3, 5].map(q => (
                <button key={q} onClick={() => setMintQty(q)} style={{
                  padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
                  background: mintQty === q ? 'rgba(0,229,255,0.2)' : 'rgba(255,255,255,0.05)',
                  border: mintQty === q ? '1px solid #00e5ff' : '1px solid rgba(255,255,255,0.1)',
                  color: mintQty === q ? '#00e5ff' : '#889', fontSize: 14, fontWeight: 700,
                }}>
                  {q}x
                </button>
              ))}
            </div>
            <button onClick={mintHero} style={{
              width: '100%', padding: '16px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #00aacc, #0077aa)', color: '#fff',
              fontSize: 18, fontWeight: 800, cursor: 'pointer', letterSpacing: 1,
              boxShadow: '0 4px 20px rgba(0,229,255,0.2)',
            }}>
              MINT {mintQty} HERO{mintQty > 1 ? 'ES' : ''} — {mintQty} AVAX
            </button>
            {mintStatus && (
              <p style={{ fontSize: 12, color: mintStatus.startsWith('Error') ? '#ff4444' : '#44dd66', marginTop: 8, textAlign: 'center' }}>
                {mintStatus}
              </p>
            )}
            <p style={{ fontSize: 11, color: '#556677', marginTop: 8, textAlign: 'center' }}>
              {isConnected ? `Connected: ${address?.slice(0, 6)}...${address?.slice(-4)}` : 'Connect wallet to mint'} • Avalanche C-Chain
            </p>
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div style={{
        maxWidth: 900, margin: '0 auto', padding: '0 24px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }} />

      {/* ── Items Section ── */}
      <section style={{
        maxWidth: 900, margin: '0 auto', padding: '48px 24px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h2 style={{
            fontSize: 32, fontWeight: 800, margin: 0, color: '#fff',
            fontFamily: '"Press Start 2P", monospace',
          }}>
            ITEMS
          </h2>
          <p style={{ color: '#667788', fontSize: 14, marginTop: 8 }}>
            5 categories, 5,000 each — Equip your hero, upgrade by burning
          </p>
        </div>

        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
          {ITEM_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => { setSelectedCategory(cat); randomizeItem(); }}
              style={{
                padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
                background: selectedCategory === cat ? 'rgba(0,229,255,0.15)' : 'rgba(20,26,40,0.8)',
                border: selectedCategory === cat ? '2px solid #00e5ff' : '1px solid rgba(255,255,255,0.08)',
                color: selectedCategory === cat ? '#00e5ff' : '#889',
                fontSize: 14, fontWeight: 600, transition: 'all 0.15s',
              }}
            >
              {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Item Preview Grid */}
        <div style={{
          display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 32, flexWrap: 'wrap',
        }}>
          {ITEM_CATEGORIES.map(cat => (
            <div key={cat} onClick={() => { setSelectedCategory(cat); randomizeItem(); }} style={{
              cursor: 'pointer', textAlign: 'center',
              opacity: selectedCategory === cat ? 1 : 0.5,
              transform: selectedCategory === cat ? 'scale(1.1)' : 'scale(1)',
              transition: 'all 0.2s',
            }}>
              {itemPreviews[cat] && (
                <img src={itemPreviews[cat]} alt={cat} style={{
                  width: 96, height: 96, imageRendering: 'pixelated',
                  borderRadius: 8, border: `1px solid ${selectedCategory === cat ? '#00e5ff' : 'rgba(255,255,255,0.1)'}`,
                }} />
              )}
              <div style={{ fontSize: 10, color: '#667', marginTop: 4 }}>{CATEGORY_LABELS[cat]}</div>
            </div>
          ))}
        </div>

        {/* Selected Item Detail + Mint */}
        <div style={{
          display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap',
        }}>
          <div style={{
            background: 'rgba(20,26,40,0.8)', borderRadius: 16, padding: 24,
            border: '1px solid rgba(0,229,255,0.15)', textAlign: 'center',
          }}>
            <canvas
              ref={itemCanvasRef}
              width={64} height={64}
              style={{
                width: 192, height: 192, imageRendering: 'pixelated',
                borderRadius: 12, border: `2px solid ${itemTraits ? RARITY_COLORS[itemTraits.rarity] : '#333'}`,
              }}
            />
            {itemTraits && (
              <div style={{ marginTop: 8 }}>
                <span style={{
                  padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                  background: RARITY_COLORS[itemTraits.rarity], color: '#fff',
                }}>
                  {itemTraits.rarity.toUpperCase()}
                </span>
              </div>
            )}
            <button onClick={randomizeItem} style={{
              marginTop: 10, padding: '6px 16px', background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#889',
              cursor: 'pointer', fontSize: 11,
            }}>
              🎲 Randomize
            </button>
          </div>

          <div style={{ flex: 1, minWidth: 260, maxWidth: 400 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
              {CATEGORY_ICONS[selectedCategory]} {CATEGORY_LABELS[selectedCategory]}
            </h3>
            <p style={{ color: '#667788', fontSize: 13, marginBottom: 16 }}>
              Equip items to boost your hero. Burn 2 same-rarity items to upgrade to the next tier.
            </p>

            <div style={{
              background: 'linear-gradient(135deg, rgba(0,229,255,0.08), rgba(0,100,200,0.08))',
              borderRadius: 12, padding: 16, border: '1px solid rgba(0,229,255,0.2)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: '#889' }}>Price</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>0.2 AVAX</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: '#889' }}>Minted</span>
                <span style={{ fontSize: 14, color: '#00e5ff' }}>{itemCategorySupply?.toString() || '0'} / 5,000</span>
              </div>
              <button onClick={mintItem} style={{
                width: '100%', padding: '14px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #336699, #224477)', color: '#fff',
                fontSize: 16, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(0,100,200,0.2)',
              }}>
                MINT {CATEGORY_LABELS[selectedCategory].toUpperCase()} — {(0.2 * mintQty).toFixed(1)} AVAX
              </button>
              {mintStatus && (
                <p style={{ fontSize: 11, color: mintStatus.startsWith('Error') ? '#ff4444' : '#44dd66', marginTop: 6, textAlign: 'center' }}>
                  {mintStatus}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Upgrade Section ── */}
      <section style={{
        maxWidth: 900, margin: '0 auto', padding: '48px 24px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>
            🔥 UPGRADE
          </h2>
          <p style={{ color: '#667788', fontSize: 14 }}>
            Burn 2 same-rarity items to forge a higher tier
          </p>
        </div>

        <div style={{
          display: 'flex', gap: 24, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap',
        }}>
          {/* Slot 1 */}
          <div style={{
            width: 120, height: 120, borderRadius: 12, border: '2px dashed rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(20,26,40,0.5)', color: '#445', fontSize: 13,
          }}>
            Item 1
          </div>

          <span style={{ fontSize: 28, color: '#445' }}>+</span>

          {/* Slot 2 */}
          <div style={{
            width: 120, height: 120, borderRadius: 12, border: '2px dashed rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(20,26,40,0.5)', color: '#445', fontSize: 13,
          }}>
            Item 2
          </div>

          <span style={{ fontSize: 28, color: '#445' }}>=</span>

          {/* Result */}
          <div style={{
            width: 120, height: 120, borderRadius: 12, border: '2px solid rgba(204,68,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(40,20,60,0.3)', color: '#cc44ff', fontSize: 13, fontWeight: 700,
          }}>
            Upgraded!
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button disabled style={{
            padding: '12px 32px', borderRadius: 10, border: 'none',
            background: 'rgba(100,50,150,0.3)', color: '#887',
            fontSize: 14, fontWeight: 700, cursor: 'not-allowed',
          }}>
            SELECT ITEMS TO UPGRADE
          </button>
        </div>
      </section>

      {/* ── Stats Footer ── */}
      <footer style={{
        maxWidth: 900, margin: '0 auto', padding: '32px 24px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 24,
        marginBottom: 32,
      }}>
        <FooterStat label="Heroes Minted" value={`${heroSupply?.toString() || '0'} / 5,000`} />
        <FooterStat label="Your Heroes" value={heroBalance?.toString() || '0'} />
        <FooterStat label={`${CATEGORY_LABELS[selectedCategory]} Minted`} value={`${itemCategorySupply?.toString() || '0'} / 5,000`} />
        <FooterStat label="Chain" value="Avalanche" />
      </footer>
    </div>
  );
}

// ── Stat bar component ──
function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#889', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, color, fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{
          height: '100%', borderRadius: 3, background: color,
          width: `${(value / max) * 100}%`, transition: 'width 0.3s',
        }} />
      </div>
    </div>
  );
}

// ── Footer stat ──
function FooterStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#556677' }}>{label}</div>
    </div>
  );
}

// ── Base stats by element ──
function getBaseStats(element: Element) {
  const stats: Record<Element, { atk: number; def: number; spd: number }> = {
    fire:    { atk: 12, def: 6, spd: 8 },
    water:   { atk: 8, def: 10, spd: 8 },
    wind:    { atk: 8, def: 6, spd: 12 },
    ice:     { atk: 10, def: 8, spd: 8 },
    earth:   { atk: 6, def: 12, spd: 8 },
    thunder: { atk: 10, def: 6, spd: 10 },
    shadow:  { atk: 12, def: 4, spd: 10 },
    light:   { atk: 8, def: 8, spd: 10 },
  };
  return stats[element];
}
