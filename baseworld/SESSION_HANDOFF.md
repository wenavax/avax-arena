# Session Handoff — Base Atlas

**Son güncelleme:** 2026-06-18 (önceki ana oturum: 2026-06-14)
**Branch:** `frozenfriends-mvp` (avax-arena repo)
**Çalışma dizini:** `/Users/hts_bot/avax-arena/baseworld/`

Bu doküman bir oturum sonunda her şeyi kapsayacak şekilde yazıldı. Yeni oturumda **bu dosyayı ve `memory/project_baseworld*.md`'leri** okuduğunda kaldığın yerden devam edebilirsin.

---

## 1. Proje özeti

**Base Atlas** (eski adı: Pixel Atlas) — Base L2 zincirinde 640×320 grid'lik dünya haritası NFT'si. Her kara pixeli (~60K) bir ERC-721 token. Mint = 1 USDC, sahibi pixele görsel atayabilir. UI dili **İngilizce**, brand adı **Base Atlas** (kontrat adı `PixelAtlas` aynı kaldı — deploy edildi).

---

## 2. CANLI ADRESLER (Base Sepolia, chainId 84532)

| Bileşen | Adres | Notlar |
|---|---|---|
| **PixelAtlas v2** (canlı) | `0x8aC58d9f1d01c7F13D6132F28E61051364C5a724` | block 42844305, 12 güvenlik patch'i uygulanmış |
| **AtlasTreasury** (sweep vault) | `0x6c6d05c168aca2bb34cd0c9e71f27d50662fb988` | threshold 50 USDC, destination immutable |
| **PixelAtlas v1** (deprecated) | `0x0806cFAEf06aaBDA9BE87CcD8481F018a92DfBd8` | block 42842202, kullanılmıyor |
| **Deploy wallet** | `0x42274A73CF875b8022513F08FB4bA4f171BAE501` | PK aşağıda |
| **Treasury destination** | `0x6500894B572755C11d129a76E99d5284D58d4CF5` | sweep'in USDC akıttığı cüzdan |
| **USDC (Base Sepolia)** | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | 6 decimals |

---

## 3. KRİTİK CREDENTIALS

```
Deploy wallet PK: <BURADA DEGIL — asla repoya yazma>
                  ESKI anahtar (0x42274A73CF875b8022513F08FB4bA4f171BAE501) 30 Tem 2026'da
                  YAKILDI: bu dosyada acik metin public repoya push edilmisti. Kullanma.
                  Yeni deployer: ~/Desktop/baseworld-deployer-keys.json (chmod 600, repo DISI)
Base App ID:      6a22c2b22280de924021e2c0  (base.dev'de kayıtlı, meta tag layout.tsx'te)
Builder Code:     YOK — bc_xxx, kullanıcı base.dev'den çekecek, NEXT_PUBLIC_BUILDER_CODE env'e yazılacak
PINATA_JWT:       YOK — VPS local storage tercih edildi, IPFS opsiyonel
```

`.env` dosyaları:
- `contracts/.env` — PRIVATE_KEY, RPC URL'leri, ATLAS_ADDRESS, TREASURY_DEST, TREASURY_THRESHOLD
- `web/.env.local` — NEXT_PUBLIC_CONTRACT, NEXT_PUBLIC_DEPLOY_BLOCK, STORAGE=local

---

## 4. NE BİTTİ ✅

### Faz 0-5 (5 ana faz)
1. ✅ **Setup** — forge install (OZ v5.0.2 + forge-std), pnpm install
2. ✅ **Frontend port** — HTML → React/Next.js, AtlasCanvas + SelectionCard + WalletButton + event reader + landMask rasterizer
3. ✅ **Merkle gating** — `lib/landMerkle.ts`, `/admin/derive` JSON downloader, `verifyLandRoot.mjs`
4. ✅ **Production polish** — pinch-zoom, txErrors (TR→EN), mint race protection, USDC 2-tx UX, blocklist, terms+content-policy, rate limit, OpenAI moderation hook
5. ✅ **Deploy prep** — vercel.json, security headers (CSP/XFO), robots+sitemap, OG meta, nginx config, PreflightDeploy, CI workflow

### Base ekosistem (1 oturum)
6. ✅ **base:app_id meta** — layout.tsx Metadata.other'da
7. ✅ **ERC-8021 Builder Code dataSuffix** — `ox/erc8021` + `lib/builderCode.ts` + SelectionCard mint+setPixelImage sarmalandı, NEXT_PUBLIC_BUILDER_CODE bekliyor
8. ✅ **TALENT_SETUP.md** — Basename→GitHub→contract verify rehberi
9. ✅ **Farcaster Mini App iskeleti** — `.well-known/farcaster.json`, `atlas/layout.tsx` fc:frame meta, `/api/frame/webhook`, CSP /atlas frame-ancestors açıldı

### Sepolia smoke (canlı tx ile teyit)
10. ✅ **2 mint** v1'de yapıldı (X=466 Y=78 + X=458 Y=54), tx'ler Basescan'de
11. ✅ **1 image upload** (URL: `localhost:3000/uploads/5d55a19b...png`)

### Güvenlik
12. ✅ **2 paralel security audit** (general-purpose agents, bağımsız) + benim review
13. ✅ **12 security patch** v2 kontrata uygulandı, 35/35 forge test geçti
14. ✅ **v2 deploy** Sepolia'da

### Treasury automation
15. ✅ **AtlasTreasury** deploy edildi (immutable destination + threshold)
16. ✅ **Sweep bot** (`sweeper/sweep-bot.mjs`) yazıldı + PM2 ecosystem config
17. ✅ **Bot local LOOP modunda canlı** — her 60 sn vault.canSweep() okur, true ise sweep atar

### Brand
18. ✅ **Rename** Pixel Atlas → Base Atlas, tüm UI'da
19. ✅ **Dil** Türkçe → English (terms, content-policy, txErrors, toasts, buttons, badges)

---

## 5. NE KALDI ⏳

### Kullanıcı tarafı (manuel adımlar)
1. ⏳ **Builder Code claim** — `base.dev`'de Settings → Builder Code → `bc_xxxxxxxx` al → bana ver → `NEXT_PUBLIC_BUILDER_CODE` env'e yazılacak (kullanıcının seçtiği son adım buydu, oturum bitti)
2. ⏳ **Basename al** — `base.org/names` (mainnet'te, deploy cüzdanı için)
3. ⏳ **Talent.app profili** — `TALENT_SETUP.md` adımları
4. ⏳ **Smoke test v2 mint** — yeni signature ile (`mint(x, y, maxPrice, proof)`)
5. ⏳ **Mainnet deploy** — DEPLOY.md akışı (Preflight → Deploy → SetLandRoot → DeployTreasury)
6. ⏳ **Hosting** — Vercel deploy ya da VPS rsync + PM2 (nginx config hazır)
7. ⏳ **Farcaster manifest sign** — Warpcast developer tools, accountAssociation alanını imzala
8. ⏳ **Mini App assets** — 1024×1024 icon.png, 1200×800 og.png, 200×200 splash.png

### Açık kararlar
- Vercel vs self-host hosting kararı
- Farcaster Mini App wrapper (opsiyonel ama Talent skor için faydalı)
- Audit kararı: bug bounty (Immunefi) mi Code4rena contest mi (Faz 4 sonu)

---

## 6. ARKAPLANDA ÇALIŞAN PROSESLER

### a) Sweep bot
- **Task ID:** `bssuvaait`
- **Path:** `/Users/hts_bot/avax-arena/baseworld/sweeper/sweep-bot.mjs`
- **Mode:** LOOP=1, POLL=60s
- **Status:** vault.balance=0 USDC, canSweep=false (henüz mint birikmedi v2'de)
- **NOT:** Bu makine kapandığında bot durur. Mainnet'te VPS PM2 kullan (`sweeper/ecosystem.config.cjs`).

### b) Next.js dev server
- **Task ID:** `bbc1411x9`
- **URL:** http://localhost:3000
- **Path:** `/Users/hts_bot/avax-arena/baseworld/web`
- **NOT:** Aynı şekilde sadece bu oturumda canlı.

---

## 7. DİKKAT EDİLECEKLER

### Mevcut tasarım kararları
- **Treasury = AtlasTreasury contract** (PixelAtlas.treasury() bunu döner)
- **AtlasTreasury.destination = `0x6500894B57…`** (immutable, asla değişmez)
- **Threshold = 50 USDC** (immutable)
- **PixelAtlas.usdc = immutable** (constructor'da set)
- **Pausable + Ownable2Step + ReentrancyGuard** aktif
- **URI whitelist:** ipfs://, https://, ar://, data:image/{png|jpeg|webp|gif|svg+xml};base64,
- **URI max length:** 512 bytes
- **JSON-special chars rejected:** `"`, `\`, `<`, control chars (< 0x20)
- **MAX_MINT_PRICE = 10000 USDC** (admin tipo guard)
- **Merkle leaf:** `keccak256(bytes.concat(keccak256(abi.encode(tokenId))))` — double-hash domain separation, JS `StandardMerkleTree` ile uyumlu

### Mevcut Sepolia bakiyeleri (oturum sonu)
- Deploy wallet ETH: ~0.000965 ETH
- Deploy wallet USDC: ~40 USDC (yine kendisine akıyor v1 mint'lerinden; v2'de treasury=vault olduğu için yeni mint'lerde vault'a akar)
- Vault USDC: 0 USDC
- Destination USDC: 0 USDC

---

## 8. KEY FILE PATHS

```
baseworld/
├── README.md                # ana README
├── DEPLOY.md                # mainnet runbook (8 fazlı)
├── NEXT_STEPS.md            # faz checklist
├── TALENT_SETUP.md          # talent.app rehberi
├── FARCASTER_SETUP.md       # mini app deploy rehberi
├── SESSION_HANDOFF.md       # bu dosya
├── contracts/
│   ├── src/PixelAtlas.sol       # v2, 12 patch uygulanmış
│   ├── src/AtlasTreasury.sol    # sweep vault
│   ├── test/PixelAtlas.t.sol    # 35 test
│   ├── test/AtlasTreasury.t.sol # 10 test
│   ├── script/Deploy.s.sol
│   ├── script/DeployTreasury.s.sol
│   ├── script/SetLandRoot.s.sol
│   ├── script/PreflightDeploy.s.sol  (broadcast'siz sanity)
│   ├── script/verifyLandRoot.mjs     (landRoot.json doğrulayıcı)
│   └── .env                          # PK + RPC + addresses
├── web/
│   ├── app/                          # Next.js 15 App Router
│   │   ├── layout.tsx                # base:app_id meta var
│   │   ├── page.tsx                  # landing
│   │   ├── atlas/page.tsx            # ana harita
│   │   ├── atlas/layout.tsx          # fc:frame Farcaster meta
│   │   ├── admin/derive/page.tsx     # landRoot.json üretici
│   │   ├── api/upload/route.ts       # dual backend (local/pinata)
│   │   ├── api/frame/webhook/route.ts# Farcaster webhook placeholder
│   │   ├── terms/page.tsx            # İngilizce
│   │   └── content-policy/page.tsx   # İngilizce
│   ├── components/
│   │   ├── AtlasCanvas.tsx           # ana canvas + camera + okyanus BASE harfleri
│   │   ├── SelectionCard.tsx         # mint + image upload UI
│   │   └── WalletButton.tsx
│   ├── lib/
│   │   ├── config.ts                 # GRID_W=640, GRID_H=320, EDGE_THRESHOLD=0.55
│   │   ├── landMask.ts               # CELL=8 (yüksek çözünürlük), SAMP=5
│   │   ├── landMerkle.ts             # v2 double-hash StandardMerkleTree
│   │   ├── builderCode.ts            # ERC-8021 dataSuffix, ox/erc8021
│   │   ├── wallet.ts                 # ethers v6, BrowserProvider
│   │   ├── events.ts                 # PixelMinted + PixelImageSet + PixelImageCleared (v2)
│   │   ├── txErrors.ts               # İngilizce hata parser
│   │   └── abi.ts                    # v2 ABI (mint signature: x,y,maxPrice,proof)
│   ├── public/.well-known/farcaster.json
│   └── .env.local                    # NEXT_PUBLIC_CONTRACT=v2 adres
├── sweeper/
│   ├── sweep-bot.mjs                 # canlı izleyici
│   ├── ecosystem.config.cjs          # PM2 config (VPS için)
│   └── .env.example
└── deploy/nginx.conf                 # frostbite.pro/baseworld reverse proxy
```

---

## 9. YENİ OTURUMDA İLK MESAJ ÖRNEĞİ

Yeni oturumda şöyle başlayabilirsin:

> "Base Atlas projesinde kaldığım yerden devam edeceğim. `baseworld/SESSION_HANDOFF.md`'yi oku. Sonra ne yapacağımı söyle."

veya direkt bir görev:

> "Builder Code aldım: `bc_XXXXXXXX`. NEXT_PUBLIC_BUILDER_CODE env'e koy."

veya:

> "Mainnet deploy'a geçelim. Hazır mıyız kontrol et."

---

## 10. SECURITY AUDIT FINDINGS (TAMAMI)

12 patch uygulandı, 3 kaynak (Agent A, Agent B, ben) tüm CRITICAL'larda anlaştı.

**CRITICAL (3):**
1. JSON injection in tokenURI → URI whitelist + length cap + JSON-special char reject ✅
2. Sandwich attack (mintPrice spike vs MAX approval) → `mint(... maxPrice ...)` parameter ✅
3. Admin rug (mutable usdc/treasury/mintPrice) → usdc immutable, MAX_MINT_PRICE constant, address(0) guards, Ownable2Step ✅

**HIGH (4):**
4. Pausable emergency stop ✅
5. SafeERC20.safeTransferFrom ✅
6. Stale image after transfer → `_update` hook clears `_pixelImage` ✅
7. pixelsInfo unbounded array → MAX_BATCH_READ = 1024 ✅

**MEDIUM (3):**
8. PixelMinted event emits pricePaid ✅
9. PixelImageSet event adds owner indexed + new PixelImageCleared event ✅
10. MAX_MINT_PRICE = 10000 USDC ✅

**LOW (2):**
11. Merkle leaf double-hash domain separation ✅
12. SECURITY.md / docs MEV note → not written yet, low priority

---

## 11. NOTLAR

- Memory dosyaları: `~/.claude/projects/-Users-hts-bot-avax-arena/memory/project_baseworld*.md`
- `MEMORY.md` index'te Pixel Atlas / Base Atlas linkleri var
- Frontend SHA-256 hash dosya adıyla VPS local storage kullanıyor (`/uploads/{hash}.ext`)
- Sepolia smoke testte v1'de minted 2 pixel hala var: tokenId 50386 (X=466,Y=78) + 35018 (X=458,Y=54) — ama bu artık eski kontrat, v2 başka adres
- CSP'de `blob:` ve `https:` img-src'de açık (preview için)
- Pinch-zoom + double-tap zoom mobilde test edilmedi henüz
