# Pixel Atlas — `frostbite.pro/baseworld`

Dünya haritası 640×320 sabit ızgaraya bölünmüş, kara pikselleri **Base** zincirinde ERC-721 NFT. Mint 1 USDC. Sahibi pixele görsel yükler, haritada görünür.

```
baseworld/
  contracts/    # Foundry · PixelAtlas.sol + tests + deploy + merkle gen
  web/          # Next.js · Pixel Atlas frontend + /api/upload IPFS endpoint
  README.md     # bu dosya
  NEXT_STEPS.md # ne sırayla yapılacak
```

## Hızlı başlangıç

```bash
# 1) Contracts
cd contracts
cp .env.example .env             # PRIVATE_KEY, BASE_RPC_URL, BASESCAN_API_KEY, TREASURY, USDC
forge install                    # OZ v5 + forge-std
forge build
forge test -vv

# 2) Sepolia deploy (1 USDC = 1e6 USDC token unit)
source .env
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify

# 3) Web
cd ../web
cp .env.example .env.local       # NEXT_PUBLIC_* + server-only PINATA_JWT
pnpm install
pnpm dev                         # http://localhost:3000
```

## Mimari kararlar (sabit)

| Karar | Değer | Sebep |
|---|---|---|
| Grid | `640 × 320` | Frontend ve kontratta birebir aynı. tokenId = `y*640 + x` |
| Mint fiyatı | 1 USDC (`1_000_000` base unit) | Düşük entry, treasury'ye akar |
| Land gating | **On-chain merkle tree** | Doğrudan kontrat çağrısıyla okyanus mintlenemez. `setLandRoot(root, true)` ile aktif |
| Edge threshold | `0.55` coverage | Yayın için **dondurulmuş** — kullanıcı UI'da değiştirse bile launch'taki set baz alınır |
| Network | Önce **Base Sepolia**, sonra mainnet | `chainId 84532` → `8453` |
| Image storage | IPFS (Pinata), serverless endpoint üzerinden | JWT asla client'a sızmaz |
| Frontend | Next.js (App Router), ayrı proje | FrozenFriends/world ile izolasyon |

## Network referansı

| | mainnet | sepolia |
|---|---|---|
| chainId | 8453 | 84532 |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| RPC | `https://mainnet.base.org` | `https://sepolia.base.org` |
| Explorer | https://basescan.org | https://sepolia.basescan.org |

## Land merkle akışı

1. Frontend ile aynı land mask hesaplamasını node tarafında üret (`web/lib/landMask.ts` paylaşılabilir bir module olur)
2. `contracts/script/GenerateLandMerkle.s.sol` (veya TS) ile `tokenId` listesinden merkle ağacı kur (leaf = `keccak256(abi.encodePacked(tokenId))`, sıralı çiftler)
3. `landIds.json` + `landRoot` üret
4. Deploy sonrası `setLandRoot(root, true)` çağır
5. Frontend mint çağrısı için merkle proof'u `landIds.json`'dan üretir

## Production-ready acceptance (build prompt'tan)

- [ ] Kontrat Basescan'de verified
- [ ] Border'lar net, kara pikselleri denize taşmıyor, okyanus mintlenemiyor
- [ ] Coinbase Wallet **ve** MetaMask Base'e bağlanıyor, yanlış ağda prompt
- [ ] Mint: USDC approve → mint → tx confirm → treasury 1 USDC alıyor
- [ ] Görsel: upload → IPFS → setPixelImage → harita ve `tokenURI` görseli render ediyor
- [ ] Refresh: event log'lardan tüm mintli pikseller yükleniyor (61K per-pixel call **yok**)
- [ ] Mobilde tam ekran, pinch-zoom, mint çalışıyor
- [ ] `demo:false`, hiçbir secret client bundle'da yok

Detaylı sıra için → [NEXT_STEPS.md](./NEXT_STEPS.md)
