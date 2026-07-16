# Deploy Runbook — Pixel Atlas → `frostbite.pro/baseworld`

Buradaki adımları **sıralı** uygula. Her bölümün başındaki "Önkoşullar" satırı atlanırsa sonraki adım çalışmaz.

```
Sepolia (test)   →   Mainnet (canlı)   →   Hosting   →   Custom domain
```

---

## 0. Önkoşullar (bir kerelik)

Aşağıdakileri sağla, hepsi olmadan ilerlemeye gerek yok:

| | Nedir | Nereden |
|---|---|---|
| **Deploy cüzdanı** | Sepolia ETH'li EOA (private key) | Yeni Foundry wallet: `cast wallet new` |
| **Sepolia ETH** | ~0.01 ETH | https://www.alchemy.com/faucets/base-sepolia veya QuickNode faucet |
| **Sepolia USDC** | ~10 USDC (smoke test mint için) | https://faucet.circle.com → Base Sepolia |
| **Base Sepolia RPC** | Alchemy/Infura key (public yetersiz olabilir) | https://www.alchemy.com → "Create App" → Base Sepolia |
| **Basescan API key** | Verify için | https://basescan.org/myapikey |
| **Treasury adresi** | Mint USDC'leri akacak adres | Önerilen: Gnosis Safe `0xc4d1cCb6C18dF7254014c9f43cD1D32cb5D44d07` (memory'deki Frostbite safe) |
| **Pinata JWT** | Görsel IPFS pin'leme | https://pinata.cloud → API Keys → JWT |

### `.env` doldur

```bash
cd baseworld/contracts
cp .env.example .env
```

`.env`'i şu değerlerle doldur:

```
PRIVATE_KEY=0x...                          # deploy cüzdanı
BASE_RPC_URL=https://mainnet.base.org      # (mainnet için, alchemy key önerilir)
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
BASESCAN_API_KEY=...
TREASURY=0xc4d1cCb6C18dF7254014c9f43cD1D32cb5D44d07
USDC_MAINNET=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
USDC_SEPOLIA=0x036CbD53842c5426634e7929541eC2318f3dCF7e
LAND_ROOT=0x0                              # ilk deploy'da boş; Faz 3'te dolduracağız
```

---

## 1. Sepolia deploy

**Önkoşul:** §0 tamam, cüzdanda ETH var.

```bash
cd baseworld/contracts
source .env

# 1a) Sanity check — broadcast YOK, sadece simulate eder
forge script script/PreflightDeploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL
# Bekle: "=== READY to deploy ==="

# 1b) Gerçek deploy + verify
forge script script/Deploy.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY \
  -vvv
```

Çıktıda:
- `PixelAtlas: 0xABC...` → adres
- Verify ✓ → https://sepolia.basescan.org/address/0xABC... görünmeli

> **Kaydet:** Bu adres + deploy block numarasını al, sonra web/.env.local'a yazacaksın.

---

## 2. Land merkle root üret + Sepolia'da gating'i aç

**Önkoşul:** §1 tamam, kontrat adresi elde.

### 2a) `/admin/derive` ile root üret

```bash
cd baseworld/web
cp .env.example .env.local
# .env.local'da NEXT_PUBLIC_CONTRACT'ı az önceki adresle güncelle
pnpm install
pnpm dev
```

Tarayıcıda `http://localhost:3000/admin/derive` aç → "Türet ve indir" → `landRoot-0.55.json` indirilir.

### 2b) Root'u doğrula + kontrata yaz

```bash
cd baseworld/contracts
node script/verifyLandRoot.mjs ~/Downloads/landRoot-0.55.json
# Bekle: "match: OK ✓"
# Çıktıdan LAND_ROOT=0x... satırını al, .env'e ekle
```

`.env`'i düzenle:

```
LAND_ROOT=0x... # yukarıdaki çıktıdan
ATLAS_ADDRESS=0x... # §1'deki deploy adresi
```

```bash
source .env

forge script script/SetLandRoot.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast \
  -vvv
```

Bekle: `LandRoot set on: 0xABC...`

---

## 3. Sepolia smoke test

Tarayıcıda Coinbase Wallet / MetaMask + Base Sepolia bağlı olarak:

- [ ] `localhost:3000/atlas` → harita yüklenir, ~60K kara pixel
- [ ] Cüzdanı bağla → ağ Sepolia'ya geçer
- [ ] Bir kara pixele tıkla → mint butonu görünür, "2 işlem" banner doğru
- [ ] Mint → USDC approve imzala → mint imzala → tx confirm
- [ ] Pixel turuncu (owned) renge döner, harita state'i güncellenir
- [ ] Sayfa yenile → mint state event log'lardan tekrar yüklenir
- [ ] Görsel seç → kaydet → IPFS'e pinlenir → setPixelImage tx → görsel haritada render olur
- [ ] Mobilde aç (DevTools mobile mode veya gerçek cihaz) — pinch-zoom çalışır, mint mobilde de çalışır
- [ ] Okyanus pixeline tıkla — UI tıklamaz; doğrudan `cast call` ile dene → revert "not a land pixel"

Hata varsa NEXT_STEPS.md'deki "Açık kararlar"ı gözden geçir.

---

## 4. Mainnet deploy

**Önkoşul:** §3 yeşil, mainnet ETH var (~0.005 ETH yeterli).

```bash
cd baseworld/contracts

# .env'i mainnet için güncelle
# - LAND_ROOT'u sil (ilk deploy'da boş; §2 mainnet'te tekrarlanacak)
# - RPC ve BASESCAN aynı kalır (chain id'yi RPC URL belirler)

source .env
forge script script/PreflightDeploy.s.sol --rpc-url $BASE_RPC_URL
forge script script/Deploy.s.sol \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY \
  -vvv
```

**Mainnet adres + deploy block**ı kaydet.

### 4a) Mainnet env'i web'e geçir

```bash
cd baseworld/web
cp .env.mainnet.example .env.production.local
# NEXT_PUBLIC_CONTRACT ve NEXT_PUBLIC_DEPLOY_BLOCK'u doldur
# PINATA_JWT, OPENAI_API_KEY (varsa)
```

### 4b) Mainnet merkle root + setLandRoot

`§2`'yi mainnet için tekrarla. **DİKKAT:** Mainnet'te `setLandRoot` çağrısı kalıcı — bir kere set'leyince yalnız `owner` değiştirebilir.

---

## 5. Hosting

### Yaklaşım A — Vercel (önerilir, en hızlı)

```bash
cd baseworld/web
npx vercel link
npx vercel env add PINATA_JWT production
# Diğer NEXT_PUBLIC_* ve OPENAI_API_KEY'i de ekle
npx vercel --prod
```

Vercel domain'i `pixel-atlas.vercel.app` gibi olur. Custom domain için §6'ya geç.

### Yaklaşım B — Self-host (Frostbite VPS'ine paralel)

```bash
# Lokalde build
cd baseworld/web && pnpm build

# VPS'e rsync (memory'deki Frostbite pattern'i)
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.env' --exclude='.env.local' \
  -e "ssh -i ~/.ssh/id_ed25519" \
  /Users/hts_bot/avax-arena/baseworld/web/ \
  root@5.189.173.167:/opt/baseworld/web/

# VPS'te
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 << 'EOF'
  cd /opt/baseworld/web
  pnpm install --frozen-lockfile
  # .env.production.local'ı VPS'te ayrıca oluştur (PINATA_JWT vs)
  pm2 start "PORT=3002 pnpm start" --name baseworld-web
  pm2 save
EOF
```

Sonra nginx config'i ekle: `baseworld/deploy/nginx.conf` snippet'ini `/etc/nginx/sites-available/frostbite.pro`'ya yapıştır.

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 "nginx -t && systemctl reload nginx"
```

---

## 6. Custom domain — `frostbite.pro/baseworld`

### Vercel'e koştuysan

Vercel proje sayfasında domain ekleyemezsin (subpath domain Vercel'in core feature'ı değil). Tek yol: nginx proxy.

VPS'te (`5.189.173.167`):

```nginx
location /baseworld {
    proxy_pass https://pixel-atlas.vercel.app/;
    proxy_set_header Host pixel-atlas.vercel.app;
    proxy_ssl_server_name on;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
}
```

### Self-host ettiysen

`baseworld/deploy/nginx.conf` zaten `/baseworld` location'ını ayarlıyor, reload yeter.

### Doğrula

```bash
curl -sI https://frostbite.pro/baseworld/
curl -s https://frostbite.pro/baseworld/data/world.geo.json | head -c 100
```

---

## 7. Production smoke

- [ ] `https://frostbite.pro/baseworld/` ana sayfa açılıyor
- [ ] `/atlas` haritası yükleniyor, cüzdan Base mainnet'e bağlanıyor
- [ ] Küçük bir mint yap (1 USDC fee) → treasury bakiyesi artıyor
- [ ] Basescan'de tx + transfer görünür: https://basescan.org/address/$ATLAS
- [ ] Refresh testle event scan tamamlanır (5-10 saniye)
- [ ] `/terms`, `/content-policy` açılıyor

---

## 8. Sonraki

- Twitter/X anonsu
- `landRoot` çok büyük bir set olunca proof boyutu büyür — gerekirse merkle leaf'leri compressed seri olarak frontend'e ön-pinle
- Replay attack için event listener (PixelMinted) ile real-time UI güncellemesi (uzun vadede)
- Moderation queue dashboard
