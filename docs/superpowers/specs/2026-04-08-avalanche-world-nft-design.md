# Avalanche World NFT System — Design Spec

> Date: 2026-04-08
> Status: Approved
> Platform: Avalanche C-Chain

---

## Overview

Hero + Item NFT system for Avalanche World. Heroes are the entry ticket to the game world; items provide stat boosts and can be upgraded via burn mechanics.

## Hero NFT (FrostbiteHeroes — ERC-721)

### Collection
- **Supply**: 5,000
- **Price**: 1 AVAX per mint
- **Standard**: ERC-721

### Trait System

**Main trait — Element** (8 types, ~625 each):
Fire, Water, Wind, Ice, Earth, Thunder, Shadow, Light

**Pixel art layers (64x64):**

| Layer | Variants | Notes |
|-------|----------|-------|
| Background | 8 | Element-themed (lava, ocean, forest, ice cave, etc.) |
| Body | 6 | Skin tones |
| Armor | 10 | Element-colored armor sets |
| Head/Hair | 12 | Hair styles + colors |
| Eyes | 6 | Normal, glowing, elemental |
| Weapon | 8 | Default element weapon |
| Aura/Effect | 5 | None, Spark, Flame, Frost, Glow |
| Accessory | 6 | Cape, scarf, shoulder pad, none, etc. |

**Rarity distribution:**

| Rarity | % | Count | Base Stat Bonus |
|--------|---|-------|-----------------|
| Common | 55% | 2,750 | +0 |
| Uncommon | 25% | 1,250 | +2 |
| Rare | 12% | 600 | +5 |
| Epic | 5% | 250 | +10 |
| Legendary | 3% | 150 | +20 |

### Dynamic Stats (On-Chain)

**Base stats** (determined at mint by element):

| Element | ATK | DEF | SPD |
|---------|-----|-----|-----|
| Fire | 12 | 6 | 8 |
| Water | 8 | 10 | 8 |
| Wind | 8 | 6 | 12 |
| Ice | 10 | 8 | 8 |
| Earth | 6 | 12 | 8 |
| Thunder | 10 | 6 | 10 |
| Shadow | 12 | 4 | 10 |
| Light | 8 | 8 | 10 |

Rarity bonus added to all three stats at mint.

**XP & Level System:**
- Max level: 69
- XP per level: `100 + (level * 20)` (level 1→100, level 69→1480)
- Each level up: player chooses +1 ATK, +1 DEF, or +1 SPD (on-chain tx)
- Total stat gain from levels: +69

**XP Sources:**

| Activity | XP |
|----------|-----|
| PvE monster kill | +1 |
| PvE boss kill | +5 |
| PvP win | +3 |
| PvP loss | +1 |
| Quest complete | +2 to +10 |

**On-chain functions:**
- `addXp(tokenId, amount)` — authorized callers only (game server)
- `levelUp(tokenId, stat)` — owner only, stat = 0 (ATK), 1 (DEF), 2 (SPD)
- `getStats(tokenId)` — returns base + level + rarity bonuses

---

## Item NFTs (FrostbiteItems — ERC-1155)

### Collections (5 categories, 5,000 each)

| Category | ID | Primary Stat | Price |
|----------|----|-------------|-------|
| Weapon | 0 | +ATK | 0.2 AVAX |
| Armor | 1 | +DEF | 0.2 AVAX |
| Helmet | 2 | +DEF, +SPD | 0.2 AVAX |
| Shield | 3 | +DEF | 0.2 AVAX |
| Ring | 4 | +ATK, +SPD | 0.2 AVAX |

Total supply: 25,000 items across all categories.

### Item Rarity & Stats

| Rarity | % | Count/cat | Stat Range |
|--------|---|-----------|------------|
| Common | 50% | 2,500 | +1 to +3 |
| Uncommon | 25% | 1,250 | +4 to +6 |
| Rare | 15% | 750 | +7 to +10 |
| Epic | 7% | 350 | +11 to +15 |
| Legendary | 3% | 150 | +16 to +20 |

### Element Synergy
When item element matches hero element: **+25% stat bonus** (rounded up).
Example: Fire hero + Fire Sword (+10 ATK) = effective +13 ATK.

### Upgrade (Burn) System
- Burn 2 items of same category + same rarity → mint 1 item of next rarity
- Common + Common → Uncommon
- Uncommon + Uncommon → Rare
- Rare + Rare → Epic
- Epic + Epic → Legendary
- Legendary cannot be upgraded further
- **Deflationary**: supply decreases over time
- On-chain: `upgrade(tokenId1, tokenId2)` burns both, mints new

### Pixel Art (64x64)
Each item rendered as standalone pixel art:
- Element-themed color palette
- Rarity glow: Common (none), Uncommon (green outline), Rare (blue glow), Epic (purple aura), Legendary (golden animated shine)
- 8 elements × 5 categories × rarity variants

---

## Mint Page (`/world/mint`)

### Layout

Single-page scroll with sections:

1. **Hero Section** — Large canvas preview (256x256 upscaled from 64x64), element selector (8 icons), mint button, progress bar (minted/5000)
2. **Items Section** — 5 category tabs (Weapon/Armor/Helmet/Shield/Ring), item grid with pixel previews, mint button per category, progress per category
3. **Upgrade Section** — Drag two items → burn → reveal upgraded item
4. **Stats Footer** — Total minted, unique holders, floor price

### Visual Style
- Background: `#0a0e1a` (matches game)
- Accents: Cyan `#00e5ff`, element colors
- Pixel font for headings (Press Start 2P)
- Modern font for body (Inter)
- Hero preview: Canvas-rendered 64x64 pixel art, displayed at 256x256
- Mint animation: pixel-by-pixel reveal effect
- Hover tooltips showing stats

### Wallet Integration
- Privy auth (same as `/world`)
- Avalanche C-Chain
- Connect → select element → mint

---

## Smart Contracts

### FrostbiteHeroes (ERC-721)

```
Constructor: name, symbol, maxSupply(5000), mintPrice(1 AVAX)

mint(element) payable → requires msg.value >= 1 AVAX, totalSupply < 5000
  - Assigns random traits via seed (block hash + tokenId + sender)
  - Sets base stats from element
  - Sets rarity from probability distribution
  - Emits HeroMinted(tokenId, element, rarity)

addXp(tokenId, amount) → onlyAuthorized
  - Accumulates XP on-chain
  - Emits XpAdded(tokenId, amount, newTotal)

levelUp(tokenId, statChoice) → onlyOwner(tokenId)
  - Requires sufficient XP for next level
  - statChoice: 0=ATK, 1=DEF, 2=SPD
  - Increments level, deducts XP cost, adds +1 to chosen stat
  - Max level: 69
  - Emits LevelUp(tokenId, newLevel, statChoice)

getHero(tokenId) → view returns (Hero struct)
  - element, rarity, level, xp, atk, def, spd, baseAtk, baseDef, baseSpd

tokenURI(tokenId) → on-chain JSON + base64 SVG or IPFS pointer

withdraw() → onlyOwner, sends collected AVAX to treasury
```

### FrostbiteItems (ERC-1155)

```
Constructor: name, maxPerCategory(5000), mintPrice(0.2 AVAX)

mint(category, element) payable → requires msg.value >= 0.2 AVAX
  - category: 0-4 (weapon/armor/helmet/shield/ring)
  - Each category tracks its own supply (max 5000)
  - Random rarity + stat assignment
  - Emits ItemMinted(tokenId, category, element, rarity)

upgrade(tokenId1, tokenId2) → owner of both
  - Both must be same category + same rarity
  - Burns both tokens
  - Mints new token of same category, next rarity tier
  - New element inherited from tokenId1
  - Emits ItemUpgraded(tokenId1, tokenId2, newTokenId, newRarity)

getItem(tokenId) → view returns (Item struct)
  - category, element, rarity, atk, def, spd

uri(tokenId) → metadata JSON

withdraw() → onlyOwner
```

### Authorized Callers
- Game server wallet (for addXp calls)
- Configurable: `setAuthorized(address, bool)` by owner

### Security
- Reentrancy guards on mint/upgrade
- Max mint per tx: 5 (anti-whale per tx, no wallet limit)
- Pausable (emergency)
- Owner: Gnosis Safe 2/3

---

## Game Integration

### World Entry
- `/world` checks hero NFT ownership
- No hero → redirect to `/world/mint`
- Hero found → load hero stats from chain, enter game

### Equipment
- Items equippable via game UI
- On-chain or off-chain binding (TBD in PvE/PvP spec)

### Stat Flow
```
Final ATK = hero.baseAtk + hero.levelBonusAtk + rarityBonus
          + weapon.atk * (elementMatch ? 1.25 : 1.0)
          + helmet.atk * (elementMatch ? 1.25 : 1.0)
          + ring.atk * (elementMatch ? 1.25 : 1.0)
```

### XP Recording
- Game server calls `addXp()` after PvE/PvP events
- Player calls `levelUp()` from game UI (sends tx)

---

## Revenue Projection

| Source | Per Unit | Max Revenue |
|--------|----------|-------------|
| Hero mint | 1 AVAX | 5,000 AVAX |
| Item mint | 0.2 AVAX | 5,000 AVAX (25K items) |
| **Total** | | **10,000 AVAX** |

Platform fee: 2.5% on secondary marketplace sales.

---

## Future (Separate Specs)
- PvE combat system design
- PvP matchmaking and ranking
- On-chain battle resolution
- FSB token integration with hero/item system
