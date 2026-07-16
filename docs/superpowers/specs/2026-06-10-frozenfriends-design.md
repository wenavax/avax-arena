# FrozenFriends — Design Spec

**Date:** 2026-06-10
**Status:** Approved for implementation planning
**Replaces:** Eski Frostbite Base GDD (4 arketip × 8 element) ve sonra FrostCore (tap-to-mine idle)
**Domain:** `frostbite.pro/base`
**Chain:** Base mainnet (chainId 8453)
**Scope:** Ultra-tight 2-week MVP

## Vizyon

Pet'in bir kişiliği ve sosyal hayatı var. Sen uyurken pet'in dünyada gezer, başka pet'lerle karşılaşır, sohbet eder, hediye verir. Sabah uygulamayı açtığında geçen günün dramasını okursun.

**Tone:** Cozy + drama hybrid. FrenPet'ten net farklılaşma: pet ölmez (cozy), ama hikayesi sürer (drama).

**Inspirations:** Tamagotchi (pet care) · The Sims (sosyal sim) · FrenPet (on-chain pet) · AI Town (autonomous agents) · Animal Crossing (cozy)

## Hedefler

**Birincil amaç:** Base ekosisteminde topluluk ve marka varlığı oluşturma. Token launch ön hazırlığı.

**Başarı kriteri (3-6 ay):** Viral moment / hype — küçük tutkulu topluluk, memetik güç, sosyal medyada paylaşılan içerik. Kalite > miktar.

**Token launch:** Bu MVP'nin v2 fazında planlandı (6 ay sonra hedef).

## Architecture Genel

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Next.js 15     │    │  Node.js Worker │    │  Smart Contract │
│  Frontend (PWA) │◀──▶│  AI Tick Loop   │◀──▶│  FrozenFriends  │
│  Privy+SmartW   │    │  Claude Haiku   │    │  ERC-721 + Pay  │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                ▼
                     ┌──────────────────┐
                     │  Postgres + IPFS │
                     │  (state + media) │
                     └──────────────────┘
```

## Pet Sistemi

### Pet NFT
- **Standart:** ERC-721 on Base
- **Mint:** 0.0005 ETH (~$1.50)
- **Limit:** 1 pet / cüzdan (anti-sybil, fair airdrop)
- **Token URI:** IPFS metadata + dynamic stat overlay

### Visual (1 species in MVP)
- **Tür:** Frost Sprite — özgün ice spirit yaratık
- **Varyasyon:** 8 renk paleti × 4 desen × 4 göz şekli = 128 visual kombinasyon
- **Format:** SVG (browser-rendered, lightweight)

### Personality (sabit, mint anında jenerate)
3 boyut, her biri 0-100:
- **Bold** (0=Timid, 100=Brave)
- **Social** (0=Loner, 100=Party Animal)
- **Curious** (0=Lazy, 100=Adventurous)

Personality AI'ın olay kararlarını yönlendirir. Sabit, değişmez.

### Stats (mutable, zamana göre)
1 stat tutuyoruz MVP'de:
- **Mood** (0-100) — olaylardan etkilenir, oyuncu beslemeyle artırır

### İsim
- Mint anında AI-jenerate: kişiliğe göre (örn. "Brave Pip", "Cozy Mira")
- v1'de rename yok

## Sosyal AI Sistemi

### Tick Loop
Server-side cron, **her gün 1 kez** çalışır (UTC 12:00):
1. Aktif pet listesini çek
2. Her pet için:
   - Rastgele başka bir pet bul (matching algorithm)
   - Claude Haiku'ya prompt at: personalities + recent diary
   - 2-3 cümlelik narrative + stat delta (JSON) dön
   - Diary entry'ye yaz, mood'u güncelle
3. Marketplace olmadığı için ilişki graph'i sadece "tanışıklık" listesi tutar

### Olay Tipleri (MVP'de 2)
1. **💬 Sohbet (Chat)** — pet'ler tanışır, kişiliklere göre iyi/kötü gidebilir
2. **🎁 Hediye Verme (Gift)** — generous trait'i yüksek olanlar hediye verir

### Locations
MVP'de yok — pet'ler "neutral zone"da karşılaşır. Faz 2'de lokasyon eklenir.

### AI Prompt (örnek şablon)
```
Pet A: {name}, traits: bold={n}, social={n}, curious={n}, mood={n}
Pet B: {name}, traits: bold={n}, social={n}, curious={n}, mood={n}
Recent history: {last 2 events}
Event type: {chat | gift}

Generate a 2-3 sentence narrative of their interaction in third person.
Output JSON: { narrative: string, moodDeltaA: -10..+10, moodDeltaB: -10..+10 }
```

### Maliyet
- Claude Haiku: ~$0.001 / event
- 1K pet × 1 event/gün = 1K events/gün = $1/gün
- 10K pet → $10/gün (~$300/ay)
- Treasury'den sponsorlanır

## Diary

- **Görünüm:** Chronological feed, en yeni en üstte
- **Veri:** Son 5 event (MVP)
- **Her entry:** pet emoji + meeting pet emoji + narrative + mood delta badge'i
- **Share:** "📤 Share to Farcaster" butonu — auto-generated OG image

## Ekonomi

### Revenue
- **Pet mint:** 0.0005 ETH × N user = N × $1.50 revenue
- v1'de **TEK** revenue stream. Marketplace, accessory yok.

### Gas (Gasless onboarding)
- Coinbase Smart Wallet + Paymaster
- Yeni cüzdan ilk **20 işlem** ücretsiz (sponsor: FrozenFriends Project Treasury — Avalanche tarafının Treasury'sinden ayrı, bu proje için yeni cüzdan)
- 20 sonra user öder (Smart Wallet'ın native ETH balance'ı veya manual fund)
- Tahmini sponsor maliyeti: 10K user × 20 tx × $0.001 = $200

### Frost Points (backend tracking, MVP'de gizli)
v1'de görünür DEĞİL, sadece DB'de tutulur. Faz 2'de açılır + token launch eligibility.
- Pet mint: +100
- Daily login: +5
- Olay yaşama: +1
- Hediye verme: +3
- Hediye alma: +3

### Token Launch
- **$FROZE** (placeholder isim, launch öncesi finalize edilir)
- **6 ay sonra hedef** (token launch v2 fazında, MVP'de yok)
- Total supply: 1,000,000,000
- 40% airdrop (snapshot of Frost Points)
- 30% LP
- 20% Project Treasury (FrozenFriends — ayrı cüzdan)
- 10% Team (3y vesting)

### Anti-Sybil
- 1 pet / cüzdan (kontrat seviyesinde enforced: `mapping(address => bool) public hasMinted` + revert if true)
- Privy auth (email/social/passkey gerekli)
- Coinbase Smart Wallet (passkey + biometric)
- Aktivite gradient (linear puan, exponential değil)

## Teknik Stack

### Frontend
- Next.js 15 + React 19
- Tailwind 4
- Framer Motion (animations)
- Wagmi v2 + Viem
- Privy v3 (mevcut App ID: `cmncpclp100mf0cl5x9cn47ea`)
- Coinbase Smart Wallet SDK
- PWA manifest (mobile install)

### Smart Contracts
- **FrozenFriends.sol** — ERC-721, fixed-price mint, max 1 per wallet
- **Paymaster.sol** — ERC-4337 paymaster, Treasury-funded gas sponsorship
- Marketplace.sol — Faz 2

### Backend
- Node.js + Express
- node-cron (daily 12:00 UTC tick)
- Anthropic SDK (Claude Haiku)
- Postgres (pets, diary, frost_points)
- Redis (event queue, rate limit)

### Data Schemas

**`pets` table:**
- `token_id` int PK
- `owner` address
- `name` text
- `bold`, `social`, `curious` int (0-100)
- `mood` int (0-100)
- `color_palette`, `pattern`, `eye_shape` int
- `minted_at` timestamp
- `last_tick_at` timestamp

**`diary` table:**
- `id` serial PK
- `pet_a_id` FK → pets
- `pet_b_id` FK → pets
- `event_type` enum (chat, gift)
- `narrative` text
- `mood_delta_a`, `mood_delta_b` int
- `created_at` timestamp

**`frost_points` table:**
- `wallet` address PK
- `points` int
- `last_updated` timestamp

### Storage
- Pet metadata: IPFS (Pinata gateway)
- Pet SVG: rendered server-side, cached in Postgres
- Shareable OG cards: Vercel OG API (dynamic image gen)

### Deployment
- VPS 5.189.173.167 (mevcut altyapı)
- PM2: `frozenfriends-frontend` (Next.js, port 3002), `frozenfriends-worker` (cron AI), `frozenfriends-api` (Express, port 3003)
- Nginx: `frostbite.pro/base/` → port 3002
- Postgres: yeni veritabanı `frozenfriends_db`

## Error Handling

- **AI fail:** Tick yapılamazsa, pet o gün event almaz. Mood'da küçük negatif delta uygulanır ("missed an interesting day").
- **Mint fail:** Standard onchain revert mesajları gösterilir.
- **Paymaster fail:** Smart Wallet kullanıcıya gas için ödeme uyarısı verir.
- **DB outage:** Frontend cached pet view gösterir; mint disabled.

## Testing

- **Unit:** Smart contract testleri (Foundry/Hardhat) — mint, max-1 enforcement, withdraw
- **Integration:** AI worker → DB write → frontend read flow
- **E2E:** Cypress, manual run before launch
- **No TDD requirement** for MVP — speed priority, but contracts MUST be tested

## MVP Scope (2 Hafta)

### Hafta 1
- **Day 1-2:** Setup (Next.js, Postgres, Privy entegrasyon, Smart Wallet)
- **Day 3-4:** FrozenFriends.sol + Paymaster.sol deploy (testnet first, sonra mainnet)
- **Day 5-6:** Mint flow UI (gasless), pet generation (visual + personality)
- **Day 7:** Pet view (NFT card, stats, personality)

### Hafta 2
- **Day 8-9:** AI worker (Claude Haiku integration, prompt engineering)
- **Day 10:** Tick cron + DB write
- **Day 11:** Diary view UI (chronological feed)
- **Day 12:** Farcaster share button + OG card
- **Day 13:** Polish, mobile responsive, performance
- **Day 14:** LAUNCH 🚀

## V1'de Yok (Faz 2'ye)

- 34 ek event tipi (drama/cozy/milestone/group)
- Multi-pet group events
- 5 lokasyon (Café, Library, Forest, Peak, Plaza)
- 5 stat (Hunger, Energy, Trust)
- 5 personality boyutu (Loyal, Generous)
- 6 species
- Marketplace (P2P trade, %2.5 fee)
- Accessories (0.0001 ETH/parça)
- Rename (0.001 ETH)
- Görünür leaderboard
- Görünür Frost Points
- Native iOS/Android (Capacitor)
- Token launch + airdrop snapshot
- Discord bot
- Sponsored events

## Migration Strategy (Eski Base)

### Silinecek
- `/opt/frostbite/base-frontend/` (3.4 GB, eski 4 arketip sistem)
- `~/avax-arena/frontend-base/` (3.1 GB, lokal)
- PM2 process `frostbite-base`
- Nginx upstream + location block

### Korunacak
- Privy App ID + Secret (yeni projede tekrar kullanılır)
- Domain `frostbite.pro/base`
- Nginx config pattern (basePath = `/base`, port 3002)

### Yedek
- `~/Desktop/frostbite-base-archive-20260610-1356/` (4 dosya, 13 MB)
- VPS: `/opt/*-backup-20260610-1356*`

## Risks / Open Questions

- **AI maliyet sürdürülebilirliği:** Mint revenue ($1.50/pet) AI sponsor maliyetini (uzun vadede) karşılamayabilir. Çözüm: cüzdan başına günlük limit, faz 2'de accessory revenue.
- **FrenPet rekabeti:** Aynı pazardayız. Differansiyel hikaye odaklı; gerçek farklılaşma launch sonrası feedback'le anlaşılır.
- **Visual fidelity:** SVG-only visual ucuz ama "premium" hissi vermez. Faz 2'de illustrate artist'le upgrade.
- **Sybil resistance:** 1/cüzdan + Privy auth yeterli mi? Token launch öncesi tekrar bakılır.
- **AI prompt drift:** Claude Haiku'nun event quality'si zamanla nasıl değişir? Monitor ve refresh stratejisi gerek.

## Sonraki Adım

Bu spec onaylandıktan sonra **writing-plans skill** ile detaylı implementation planı oluşturulacak. Plan içeriği: task breakdown, dependency graph, test stratejisi, deployment checklist.
