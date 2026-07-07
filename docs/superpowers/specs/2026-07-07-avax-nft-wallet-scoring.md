# Avalanche NFT Wallet Score — Pazar Araştırması + Skorlama Tasarımı

**Tarih:** 2026-07-07 · **AVAX referans fiyatı:** $6.93 (CoinGecko simple/price, canlı çekildi)
**Amaç:** frostbite.pro için, bir cüzdanın tuttuğu Avalanche C-Chain NFT'lerine göre "Wallet NFT Score" üreten sistem.

> Metodoloji notu: Joepegs (403/WAF) ve Salvor (session-gated API) doğrudan çekilemedi; floor verileri
> CoinGecko public API (canlı, test edildi), OKX NFT marketplace canlı sayfaları ve arama sonuçlarından
> çapraz doğrulandı. Avalanche NFT piyasası 2026'da düşük likiditeli olduğundan tüm floor'lar ±%50
> oynaklıkla okunmalı — bu belirsizlik skor tasarımının kendisine (liquidity gate) yedirildi.

---

## BÖLÜM 1 — Pazar Araştırması

### 1.1 Pazar durumu (Temmuz 2026 özeti)

- **Salvor** (salvor.io) Avalanche'ın **en yüksek hacimli NFT marketplace'i**; P2P NFT + memecoin lending'e pivot etti, Avalanche Rush'tan $1M grant aldı, 800+ koleksiyon destekliyor. ([avax.network blog](https://www.avax.network/about/blog/salvor-avalanche-rush-1m-incentive-grant-nft-lending-platform), [Medium/vindi](https://medium.com/@vindicatethis/revisiting-salvor-the-top-nft-marketplace-on-avalanche-6315cf391689))
- **Joepegs** (joepegs.com, LFJ) hâlâ canlı, klasik listing marketplace'i.
- **OpenSea** ve **OKX NFT** Avalanche C-Chain'i destekliyor (agregasyon + kendi orderbook'ları).
- **Reservoir API 15 Ekim 2025'te kapandı** ([X duyurusu](https://x.com/reservoir0x/status/1912207186941313091)); **SimpleHash 27 Mart 2025'te kapandı** (Phantom satın aldı, [Alchemy migration](https://www.alchemy.com/blog/migrating-from-simplehash-to-alchemy)). Kalao (2023) ve Campfire/Hyperspace fiilen yok — doğrulanamadı, ölü varsayılmalı.
- Genel tablo: Avalanche NFT hacmi 2021-22 zirvesinin çok altında; günlük hacim çoğu koleksiyonda **sıfır**. CoinGecko'nun listelediği ~160 AVAX koleksiyonunun büyük kısmında 24h volume = $0. Bu, "floor price"ın tek başına manipüle edilebilir bir sinyal olduğu anlamına geliyor (aşağıda kanıtı var).

### 1.2 Koleksiyon envanteri (canlı çekilen veriler)

**Tier adayı — gerçek değer taşıyanlar** (floor × canlılık çapraz doğrulamalı):

| # | Collection | Contract | Supply | Floor (AVAX) | Source (2026-07-07) | Status |
|---|---|---|---|---|---|---|
| 1 | **Dokyo** | `0x54c800d2331e10467143911aabca092d68bf4166` | 5,555 | **3.3–3.8** | OKX live page: 3.29; cryptoslam | ALIVE — Kas 2023'te global #1 olmuştu, hâlâ AVAX'ın amiral PFP'si |
| 2 | **Chikn** | `0x8927985B358692815E18F2138964679DcA5d3b79` | 10,000 | **~2.5** | CoinGecko API (canlı); OKX kendi orderbook'u 14.87 (1 listing, güvenilmez) | ALIVE — $EGG üreten oyun ekosistemi |
| 3 | **Smol Joes (OG)** | `0xc70df87e1d98f6a531c8e324c9bcec6fc82b5e8d` | 100 | çok illikit; tarihsel 100+ | CoinGecko verisi bozuk | SEMI — 100'lük efsane free-mint, satış nadir |
| 4 | **Smol Joes Season 2** | `0xB449701A5ebB1D660CB1D206A94f151F5a544a81` | ~3.6K (OKX kısmi: 975) | **2.4–6.7** | OKX live: 2.39; eski OKX cache: 6.7 | ALIVE |
| 5 | **MadSkullz** | `0x3025c5c2aa6eb7364555aac0074292195701bbd6` | 5,561 | **0.7–1.6** | OKX live: 1.59; CoinGecko: 0.68 | ALIVE — Salvor lending'de teminat |
| 6 | **Hoppers Game** | `0x4245a1bd84eb5f3ebc115c2edf57e50667f98b0b` | 10,000 | **~1.7** | CoinGecko highest-volume sayfası | ALIVE (idle-staking oyunu, Adventures'ın ilham kaynağı) |
| 7 | **Party Animals** | `0x880fe52c6bc4ffffb92d6c03858c97807a900691` | 10,046 | **~1.1** | CoinGecko API (canlı) | ALIVE, 2,243 holder |
| 8 | **FunnelHeads** | `0x5378d068001d7e53d6c0a7ef539fbe213b5eb075` | ~5K | **~0.9** | Joepegs (arama snippet'i) | ALIVE — Joepegs hacim lideri |
| 9 | **Ripperz** | `0xa09477b44cff7b525436364a0da4e870bc9e052c` | ~3.3K | **~0.6** | CoinGecko API | ALIVE — Salvor lending teminatı |
| 10 | **Roostr** | `0xcf91b99548b1c17dd1095c0680e20de380635e20` | ~10-12K | **~0.55** | CoinGecko API | ALIVE (Chikn ekosistemi) |
| 11 | **Hatchy Pocket** | `0x76daaaf7711f0dc2a34bca5e13796b7c5d862b53` | büyük | **~0.55** | CoinGecko | ALIVE |
| 12 | **Monkeez** | `0xb42d0f524564cafe2a47ca3331221903eda83b3c` | ~5K | **~0.45** | CoinGecko | ALIVE |
| 13 | **Smol APAs** | `0x3dd5e0f0659ca8b52925e504fe9f0250bfe68301` | 100 | 20 (listing, illikit) | CoinGecko | SEMI |
| 14 | **Smol Creeps** | `0x2cd4dbcbfc005f8096c22579585fb91097d8d259` | ~200 | ~50 (listing, illikit) | CoinGecko | SEMI |
| 15 | **The Salvors** | `0xce4fee23ab35d0d9a4b6b644881ddd8adebeb300` | 10,038 | OKX'te listing yok | OKX live | SEMI — Salvor-native, veri Salvor içinde |
| 16 | **Kimbros** (Kimbo NFT) | doğrulanamadı (kimbros.xyz) | 6,942 (OG Club Key) | ? | [Kimbo Medium](https://medium.com/@kimboavax/kimbo-proudly-introduces-the-kimbros-c168afe31c99) | Kimbo memecoin topluluğu; MadSkullz ekibi çizdi |
| 17 | **Avax Apes** | `0x6d5087b3082f73d42a32d85e38bc95dccede39bb` | 10,000 | OKX'te 0 listing | OKX live | MOSTLY DEAD — heritage değeri |
| 18 | **Plague Game** | `0x006d36DFB318ec1B3A87b2caD4210698090717Dd` | ~10K | ? | CoinGecko listesinde | SEMI |
| 19 | **Rich Peon Poor Peon** | `0x4c5a8b71330d751bf995472f3ab8ceb06a98dd47` | ~10K | ? | CoinGecko listesinde | SEMI |
| 20 | **Cuddle Fish** | joepegs slug: `cuddle-fish` | ? | ? | Joepegs (JS-gated, çekilemedi) | doğrulanamadı |

**Kayda geçen düzeltmeler (kullanıcının verdiği isim listesinden):**
- **Cozyverse / Cozy Penguins → Ethereum koleksiyonu** (0x63d48e... ETH), Avalanche değil. Skorlamaya girmez. ([OpenSea](https://opensea.io/collection/cozy-penguin))
- **NoChillAvax → NFT değil, memecoin** (`$NOCHILL`, 0xacfb898c...). Arena kökenli token. NFT koleksiyonu bulunamadı.
- **Steady →** güncel hiçbir markette doğrulanamadı (Salvor lending duyurularında adı geçiyor ama canlı floor yok). "Unverified" olarak C-tier'a bile alınmamalı, önce Salvor'da elle bakılmalı.

**Floor manipülasyonunun canlı kanıtı (skor tasarımı için kritik):** CoinGecko'da şu koleksiyonlar
yüksek "floor" gösterip **sıfır 24h hacme** sahip — yani tek cüzdanın koyduğu fantezi listing'ler:
More Satos (555 AVAX), Smol Turds (145), Bounty Baddies (101), Bounty Boutique (25), Passive Panda
Node Club (24), Toonlands (8). **Ham listing floor'a göre otomatik tier atayan her sistem bu
koleksiyonlarla oyulur.** Çözüm: liquidity gate + elle küratörlük (Bölüm 2).

Kaynaklar: [CoinGecko Avalanche NFT](https://www.coingecko.com/en/nft/chains/avalanche-network), [CoinGecko highest-volume](https://www.coingecko.com/en/nft/chains/avalanche-network/highest-volume), [OKX Dokyo](https://web3.okx.com/nft/collection/avax/dokyo), [OKX Chikn](https://web3.okx.com/nft/collection/avax/chikn), [OKX MadSkullz](https://web3.okx.com/nft/collection/avax/madskullz), [OKX Smol Joes S2](https://web3.okx.com/nft/collection/avax/smol-joes-season-2), [OKX The Salvors](https://web3.okx.com/nft/collection/avax/the-salvors), [CryptoSlam Dokyo](https://www.cryptoslam.io/dokyo), CoinGecko public API `/nfts/list` + `/nfts/{id}` (canlı curl, 160 AVAX koleksiyonu).

### 1.3 Veri API'leri — Next.js server'dan gerçekten kullanılabilenler

Hepsi bu oturumda **canlı test edildi** veya güncel dokümandan doğrulandı:

| API | Cüzdan NFT'leri (AVAX) | Floor price (AVAX) | Auth | Limit | Karar |
|---|---|---|---|---|---|
| **Routescan / Snowtrace** | ✅ **TEST EDİLDİ, keyless çalışıyor**: `GET api.routescan.io/v2/network/mainnet/evm/43114/address/{addr}/erc721-holdings` (+`erc1155-holdings`; Etherscan-style `addresstokennftbalance` da çalışıyor) | ❌ | Keyless: 2 rps / 10K gün. Ücretsiz key: 5 rps / 100K gün ([snowtrace docs](https://snowtrace.io/documentation)) | bedava | **⭐ Cüzdan enumeration için birincil** |
| **CoinGecko public API** | ❌ | ✅ **TEST EDİLDİ, keyless**: `/api/v3/nfts/{id}` → `floor_price.native_currency` (AVAX cinsinden), 160 AVAX koleksiyonu; veri kısmen bayat | keyless ~5-15 çağrı/dk (429 görüldü); Demo key: 30/dk, 10K/ay | bedava | **⭐ Floor için birincil (cache'lenerek)** |
| **Joepegs API** | ✅ `api.joepegs.dev/v3/...` (endpoint canlı, "No API key found" döndü) | ✅ (kendi marketi) | Key başvuruyla: [form](https://forms.gle/6tMwevFCicd9nYoCA) / public-api@joepegs.com, "free for community builders" ([joepegs.dev](https://joepegs.dev/)) | görüşmeyle | **İyi ikincil — key başvurusu yapılmalı** |
| **OpenSea API v2** | ✅ `chain=avalanche` destekli | ✅ collection stats | Key zorunlu (test: 401), ücretsiz key alınabiliyor | free tier ~2-4 rps | İkincil / çapraz doğrulama |
| **GoldRush (Covalent)** | ✅ 100+ chain, AVAX dahil | ✅ NFT floor/volume endpoint'leri var ([guide](https://goldrush.dev/guides/how-to-get-floor-price-volume-and-sales-history-of-an-nft-collection/)) | Key, free 100K kredi/ay | yeterli | Sağlam yedek (tek API'de ikisi de var) |
| **Moralis** | ✅ AVAX destekli | ❌ floor endpoint'i yalnız ETH+Base | Key, free ~40K CU/gün | orta | Sadece cüzdan verisi için alternatif |
| **Alchemy NFT API** | ⚠️ AVAX, NFT API'nin ana chain listesinde YOK (spam-filter listesinde "Avax" geçiyor ama `getNFTsForOwner` desteği belirsiz) | ❌ | key | — | Güvenme, kullanma |
| **OKX Onchain OS (Marketplace API)** | ✅ | ✅ AVAX-C destekli NFT market endpoint'leri ([docs](https://web3.okx.com/build/docs/waas/marketplace-nft-api)) | OKX API key (ücretsiz) | makul | Floor çapraz-doğrulama adayı |
| **Salvor API** | fiilen ❌ | fiilen ❌ | `salvor.io/api/*` var (bundle'dan endpoint'ler çıkarıldı: `/collections/report-v2`, `/collections/{addr}/details`) ama WAF/session-gated: dışarıdan boş `data:[]` veya "Missing parameter" dönüyor | — | Ancak partnership ile; entegrasyona güvenme |
| **Reservoir** | — | — | **ÖLDÜ** (15 Eki 2025) | — | ❌ |
| **SimpleHash** | — | — | **ÖLDÜ** (27 Mar 2025, Phantom) | — | ❌ |

**Seçilen mimari:** Routescan (cüzdan) + CoinGecko (floor, cache'li) + kendi kontratlarımız için doğrudan RPC (`balanceOf`) + opsiyonel Joepegs key geldiğinde floor kalitesini yükselt.

---

## BÖLÜM 2 — Skorlama Modeli

### 2.1 Tasarım ilkeleri

1. **Floor tek başına sinyal değil** — sıfır hacimli 555 AVAX "floor"lar var (kanıt yukarıda). Tier ataması `min(listing_floor, 30g medyan satış)` + likidite şartıyla yapılır ve **elle küratörlü statik tablo** son sözü söyler.
2. **Ucuz hesap** — cüzdan başına 2-3 Routescan çağrısı + 1 multicall; sonuç 6 saat cache.
3. **Manipülasyona direnç "yeterince iyi"** — mükemmel değil (cüzdan bölme her sistemde işler) ama tek-cüzdan stuffing, floor pump ve flash-ownership'i anlamsızlaştırır.
4. **Frostbite koleksiyonları ayrıcalıklı** — hub'ın kendi ekonomisini ödüllendirir.

### 2.2 Tier tablosu (SQLite'ta seed, haftalık gözden geçirme)

| Tier | Kriter | Weight (W) | Koleksiyonlar (başlangıç) |
|---|---|---|---|
| **FROST** | Frostbite'ın kendi NFT'leri | Heroes **40**, Warriors **15**, Items **6** | FrostbiteHeroes `0x8b43A80A8EeBC2bf27EAa934B870AF1742f1e523`, Arena Warriors `0x958d7b064224453BB5134279777e5d907B405dE2`, FrostbiteItems (ERC-1155) `0xA121AD68f54347215C67AD9A254c8dbBD653d5e6` |
| **S** | floor ≥ 2.5 AVAX **ve** 30g satış ≥ 20 | **30** | Dokyo; Chikn |
| **A** | floor 1–2.5 AVAX, aktif market | **12** | MadSkullz, Hoppers, Smol Joes S2, Party Animals |
| **B** | floor 0.3–1 AVAX | **5** | FunnelHeads, Ripperz, Roostr, Hatchy Pocket, Monkeez |
| **C** | canlı ama illikit / heritage | **1** | Avax Apes, The Salvors, Plague Game, Peon, Smol Joes OG*, Smol APAs, Smol Creeps |
| **X** | blacklist (manipüle listing floor) | **0** | More Satos, Smol Turds, Bounty*, Passive Panda, Toonlands, tüm bilinmeyenler |

\* Smol Joes OG/APAs/Creeps gibi 100'lük illikit efsaneler bilinçli olarak C'de: floor'ları yüksek görünse de
tek satışla -%80 düşebilir; likidite şartını geçemezler. İstenirse "Heritage" rozeti (skor değil) verilebilir.

### 2.3 Formül

```
Score(wallet) = FrostBonus × DiversityBonus × Σ_c [ λ_c × W_c × min(N_c, 20)^0.7 ]

N_c      = cüzdandaki adet (ERC-1155'te balance toplamı, koleksiyon başına 20 cap)
^0.7     = azalan getiri: 1 adet=1.0, 5 adet≈3.1, 20 adet≈8.1 → floor süpürerek skor şişirme anlamsız
λ_c      = likidite çarpanı: 30g satış ≥20 → 1.0 · 5–19 → 0.5 · <5 → 0.25 (S/A tier <5 satışta otomatik B'ye düşer)
DiversityBonus = 1 + 0.05 × min(5, distinct_scored_collections − 1)   (maks ×1.25)
FrostBonus     = 1.20 eğer ≥1 FrostbiteHero, yoksa 1.0
```

**Rozetler:** Legend ≥ 500 · Diamond ≥ 250 · Gold ≥ 100 · Silver ≥ 40 · Bronze ≥ 10.
Örnek: 3 Dokyo + 1 Chikn + 5 Hero ≈ `30×3^0.7 + 30×1 + 40×5^0.7×1.2×1.1` ≈ 65+30+164 ≈ **259 → Diamond**.

### 2.4 Manipülasyon analizi

| Saldırı | Savunma |
|---|---|
| Floor pump (sıfır hacimli yüksek listing) | Tier ataması `min(floor, 30g medyan satış)` + λ likidite çarpanı + X blacklist; tier tablosu elle onaylı |
| Tek cüzdana 100 ucuz NFT doldurma | `N^0.7` + 20 cap: 100 Monkeez ≈ 5×8.1 ≈ 40 puan (1 Dokyo=30) |
| Cüzdan bölme (sybil) | Tam çözüm yok; skorun ödül değil **statü/çarpan** olarak kullanılması önerilir. Ödüle bağlanacaksa: skor yalnız Frostbite'ta aktif (ör. son 30g tx'i olan) cüzdanlarda geçerli |
| Flash ownership (skor anı için al-sat / lending) | **Holding-age gate**: NFT ilk görüldüğü snapshot'tan ≥7 gün sonra puan üretir (`nft_holdings_first_seen` tablosu). Salvor lending escrow'ları zaten kontrat adresinde göründüğü için borçlu cüzdanda sayılmaz |
| Kendi kendine transfer döngüsü | First-seen kaydı (contract,tokenId,wallet) bazlı; geri gelen token yeniden 7 gün bekler |

### 2.5 Implementasyon (repo pattern'ine uygun)

**Dosyalar:**
```
frontend/lib/nftScore/config.ts        — tier seed + weights (yukarıdaki tablo)
frontend/lib/nftScore/score.ts         — saf skor fonksiyonu (unit test edilebilir)
frontend/lib/nftScore/providers.ts     — routescan + coingecko + viem balanceOf çağrıları
frontend/app/api/v1/nft-score/[address]/route.ts    — skor endpoint'i (cache-first)
frontend/app/api/v1/nft-score/leaderboard/route.ts  — top-100
frontend/app/nft-score/page.tsx        — UI: cüzdan kartı + breakdown + leaderboard
server/nft-floor-refresh.mjs           — PM2 cron (saatlik), CoinGecko'dan floor tazeler
```

**SQLite şema (lib/db.ts'e ek):**
```sql
CREATE TABLE nft_collections (
  address TEXT PRIMARY KEY, name TEXT, tier TEXT, weight REAL,
  floor_avax REAL, sales_30d INTEGER, liquidity_factor REAL,
  coingecko_id TEXT, is_erc1155 INTEGER DEFAULT 0,
  floor_updated_at INTEGER, curated INTEGER DEFAULT 1
);
CREATE TABLE nft_wallet_scores (
  address TEXT PRIMARY KEY, score REAL, badge TEXT,
  breakdown_json TEXT, computed_at INTEGER
);
CREATE TABLE nft_holdings_first_seen (
  wallet TEXT, contract TEXT, token_id TEXT, first_seen INTEGER,
  PRIMARY KEY (wallet, contract, token_id)
);
```

**Akış:**
1. `GET /api/v1/nft-score/0xABC` → `nft_wallet_scores` cache < 6h ise direkt dön.
2. Değilse: Routescan `erc721-holdings` + `erc1155-holdings` (sayfalı, keyless 2rps yeter; `apikey=placeholder` ile 5rps) → yalnız `nft_collections`'ta tier'ı olan kontratları filtrele.
3. FROST tier'ı indexer'a emanet etme: viem ile `balanceOf` multicall (kendi RPC'miz, bedava, anında).
4. First-seen upsert → 7 günden yeni token'ları puanlamadan düş.
5. `score.ts` hesapla, cache'e yaz, breakdown JSON'la dön.
6. **Floor refresh:** PM2 cron saatte bir `nft-floor-refresh.mjs`: tier tablosundaki ≤30 koleksiyon için CoinGecko `/nfts/{id}` (6 sn arayla, keyless limite takılmaz; Demo key ile rahat). Floor tier eşiğini aşarsa/düşerse `curated=1` kilidi sayesinde otomatik tier değişmez, log + Telegram/console uyarısı üretir → haftalık elle onay.
7. **Leaderboard:** skor hesaplanan her cüzdan tabloda birikir; `/nft-score` sayfası top-100 + kendi kartın. Battle/leaderboard sistemlerine `FrostBonus` çarpanı olarak bağlanabilir.

**Maliyet:** cüzdan başına ≤3 dış çağrı (cache'li), floor refresh günde ~720 CoinGecko çağrısı → tüm sistem ücretsiz tier'larda çalışır.

### 2.6 Riskler

1. **Floor verisi kalitesi (EN BÜYÜK RİSK):** CoinGecko AVAX floor'ları kısmen bayat; Joepegs key onayı garantisiz; Salvor (asıl likiditenin olduğu yer) API vermiyor. → Mitigasyon: küratörlü tier tablosu zaten floor'un ±%50 hatasına dayanıklı (tier bantları geniş), floor sadece tier *önerisi* üretiyor.
2. **Routescan bağımlılığı:** tek enumeration kaynağı; çökerse skor hesaplanamaz (cache dönmeye devam eder). GoldRush free tier hazır yedek.
3. **Sybil:** skor ödüle bağlanırsa cüzdan bölme kârlı olur; statü/çarpan olarak tut.
4. **Piyasa ölümü:** Avalanche NFT likiditesi daha da düşerse S/A tier boşalır; λ mekanizması bunu otomatik yansıtır ama skorlar deflate olur — rozet eşikleri yılda bir gözden geçirilmeli.
