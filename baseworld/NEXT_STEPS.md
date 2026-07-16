# Next Steps — Pixel Atlas launch

İskelet hazır. Buradan launch'a kadar sıralı yol.

## Faz 0 — Kurulum (10 dk)

- [ ] `cd baseworld/contracts && cp .env.example .env` → boşları doldur
  - `PRIVATE_KEY` (deploy cüzdanı, fonu olmalı)
  - `BASE_SEPOLIA_RPC_URL` (önerilen: Alchemy/Infura)
  - `BASESCAN_API_KEY` (verify için)
  - `TREASURY` (Gnosis Safe önerilir)
- [ ] `cd baseworld/web && cp .env.example .env.local` → boşları doldur
  - `NEXT_PUBLIC_*` Sepolia değerleri (default'lar zaten Sepolia)
  - `PINATA_JWT` (görsel yükleme için)
- [ ] `cd baseworld/contracts && forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.0.2`
- [ ] `cd baseworld/web && pnpm install`

## Faz 1 — Kontrat test + Sepolia deploy (1 saat)

- [ ] `forge build` — derleme temiz
- [ ] `forge test -vv` — yazılı testler geçmeli, `test_merkleGating_stub` skip
- [ ] **Merkle test eksik** — `test/PixelAtlas.t.sol` içinde `test_merkleGating_stub` placeholder. Küçük bir fixture tree (örn. 4 leaf) ile mint with-proof + revert-without-proof testi yaz.
- [ ] `forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify` (LAND_ROOT=0x0 ile)
- [ ] Çıkan `PixelAtlas:` adresini `web/.env.local`'a `NEXT_PUBLIC_CONTRACT` olarak yaz
- [ ] Çıkan deploy block'u `NEXT_PUBLIC_DEPLOY_BLOCK` olarak yaz
- [ ] Basescan Sepolia → verified ✓

## Faz 2 — Frontend port (en uzun adım, 1-2 gün)

Orijinal `web/public/pixel-atlas-reference.html` → React/TSX componentlere böl.

- [ ] `lib/landMask.ts` — Natural Earth GeoJSON inline + `computeLandMask(0.55)` (referans `landgrid()` fonksiyonu HTML satır ~230)
- [ ] `components/AtlasCanvas.tsx` — `<canvas>` pixel grid, zoom/pan, hover/click. Referansta `#pixels`, `#borders`, `#fx` katmanları
- [ ] `components/WalletGate.tsx` — EIP-1193 inject, `wallet_switchEthereumChain` → fallback `wallet_addEthereumChain`, `accountsChanged`/`chainChanged` handle
- [ ] `components/MintButton.tsx` — `usdc.approve` (allowance < price ise) → `atlas.mint(x,y,proof)`. Hata mesajları: rejected / already minted / insufficient USDC
- [ ] `components/ImageUpload.tsx` — file picker → POST `/api/upload` → `atlas.setPixelImage(tokenId, uri)`
- [ ] `lib/events.ts` — `provider.getLogs` ile `PixelMinted` + `PixelImageSet` chunked taraması (deploy block → head, 10K blok pencereler). Sonucu memory map'lere koy
- [ ] `app/atlas/page.tsx` — tüm component'leri birleştir, demo modunda `NEXT_PUBLIC_DEMO=true` ile tx göndermeden simule et
- [ ] **Edge control kilitle** — UI'da gösterme veya disabled; launch land set'i `0.55`

Doğrulama: `pnpm dev` → `localhost:3000/atlas` → demo modunda kara pixele tıklayınca mint simüle, ocean tıklanamaz.

## Faz 3 — Merkle land gating ✅

- [x] `web/lib/landMerkle.ts` — `leafFor`, `buildLandTree`, `proofFor`, `rootOf`, `exportSnapshot`
- [x] Round-trip teyit: JS `SimpleMerkleTree.of([leafFor(id) for id in [0,1,640,641]]).root` ===  Solidity `keccak256(abi.encodePacked) + sorted pair`. Sentinel root `0x03bea047239e1630…`
- [x] `app/atlas/page.tsx` — `useMemo(buildLandTree, [landIds])`, selection değişince `proofFor(tree, tokenId)`, `SelectionCard` proof'la mint atıyor
- [x] `app/admin/derive/page.tsx` — landMask + tree + `landRoot-{edgeT}.json` indirir; root, ids, edgeT içerir
- [x] `contracts/script/verifyLandRoot.mjs` — indirilen snapshot'ı doğrular, `LAND_ROOT` env satırını yazar
- [ ] **Deploy sonrası** — `landRoot.json` indir → `LAND_ROOT` env'e yaz → `forge script SetLandRoot.s.sol --broadcast`
- [ ] Mainnet hazırlığında: ocean pixelini doğrudan kontrat çağrısı ile mintlemeyi dene, revert "not a land pixel" göründüğünü teyit et (manuel)

## Faz 4 — Production polish ✅

- [x] **Mobile pinch-zoom** — `AtlasCanvas` 2-finger pinch + 2-finger pan + double-tap zoom + tek parmak pan
- [x] **Mint race UI** — mint çağrısı öncesi `ownerOf()` ile ön-kontrol; revert "already minted" yakalanırsa otomatik refresh + friendly mesaj
- [x] **USDC approve UX** — `SelectionCard`'da allowance < price ise "2 işlem" banner, balance < price ise "Yetersiz USDC" + button disabled
- [x] **Error toast'ları** — `lib/txErrors.ts` 4001/4902/already-minted/not-a-land-pixel/insufficient-usdc/network → Türkçe kısa mesajlar; wallet + mint + upload kullanıyor
- [x] **Image moderation hook** — `/api/upload` → OpenAI omni-moderation-latest (MODERATION_PROVIDER=openai + OPENAI_API_KEY varsa); flagged → 422
- [x] **Image hide blocklist** — `web/public/data/blocklist.json`, `lib/blocklist.ts`, `AtlasCanvas.drawCell` blocked id/uri için görseli atlar
- [x] **Terms + Content Policy** — `/terms`, `/content-policy` Türkçe sayfalar, ana sayfa footer link
- [x] **Rate limit** — `lib/rateLimit.ts` in-memory token bucket (5/dk, 20 burst), per-IP. Üretimde Upstash Redis ile değiştirilebilir, aynı arayüz
- [x] **Edge control** — UI'da yok, atlas page `EDGE_THRESHOLD = 0.55` sabit. Sadece `/admin/derive` (admin tool) değiştirilebilir

## Faz 5 — Mainnet deploy

Hazırlık tamamlandı, **execute kullanıcı tarafında** (PRIVATE_KEY + RPC + Pinata creds gerekiyor). Tüm runbook → [DEPLOY.md](./DEPLOY.md).

Hazırlanan parçalar:
- [x] `web/.env.mainnet.example` — mainnet için tam env template
- [x] `web/vercel.json` — function memory/timeout, cache headers, admin noindex
- [x] `web/next.config.mjs` — CSP, X-Frame-Options, Permissions-Policy
- [x] `web/public/robots.txt` + `app/sitemap.ts` — SEO
- [x] `app/layout.tsx` — OpenGraph, Twitter card, metadataBase
- [x] `deploy/nginx.conf` — self-host reverse proxy snippet (`frostbite.pro/baseworld`)
- [x] `contracts/script/PreflightDeploy.s.sol` — broadcast'siz sanity check (deployer ETH, USDC decimals, treasury, root)
- [x] `.github/workflows/baseworld-ci.yml` — PR'de forge test + pnpm typecheck + build
- [x] `DEPLOY.md` — 8 bölümlük adım-adım runbook (önkoşullar → Sepolia → root → smoke → mainnet → hosting → domain → smoke)

Kullanıcı eylemleri (sırayla):
- [ ] **§0 Önkoşullar** — deploy cüzdanı + Sepolia ETH/USDC + Alchemy RPC + Basescan API + Pinata JWT + treasury
- [ ] **§1 Sepolia deploy** — `PreflightDeploy` → `Deploy` → verify
- [ ] **§2 LandRoot** — `/admin/derive` → `verifyLandRoot.mjs` → `SetLandRoot`
- [ ] **§3 Sepolia smoke** — UI flow, görsel upload, mobil pinch-zoom, okyanus revert
- [ ] **§4 Mainnet deploy** — aynı akış, mainnet RPC + LAND_ROOT
- [ ] **§5 Hosting** — Vercel (önerilir) ya da self-host VPS (Frostbite pattern'i)
- [ ] **§6 Custom domain** — `frostbite.pro/baseworld` nginx proxy
- [ ] **§7 Production smoke** — 1 USDC live mint + Basescan teyit

## Production acceptance (build prompt §DoD)

- [ ] Kontrat Basescan'de verified — *Sepolia/Mainnet deploy bekliyor*
- [x] Border'lar net, kara → denize taşmıyor — coverage `0.55` filtre + AtlasCanvas at[] index sadece kara cell'ler için seçilebilir
- [x] Coinbase Wallet **ve** MetaMask, yanlış ağda switch prompt — `ensureChain` + 4902 fallback
- [x] Mint full flow: approve → mint — kod hazır, *gerçek tx için canlı kontrat lazım*
- [x] Görsel: upload → IPFS → setPixelImage — kod hazır, *PINATA_JWT + canlı kontrat lazım*
- [x] Refresh: event log'lardan mintli pikseller — `lib/events.ts` chunked `getLogs` (10K), 61K per-pixel call YOK
- [x] Mobil: tam ekran, pinch-zoom — `viewport meta` + 2-finger pinch + double-tap zoom
- [x] `PINATA_JWT` client bundle'da yok — `runtime=nodejs` API route, env sadece server

## Açık kararlar

1. ~~Merkle leaf encoding~~ — ✅ Çözüldü: `SimpleMerkleTree` + `keccak256(abi.encodePacked(tokenId))`, test ile doğrulandı.
2. **Hosting** — Vercel + nginx reverse proxy mı, self-host Next.js mı?
3. **Moderation policy** — pre-pin moderation şart mı, sadece blocklist mı yeterli?
4. **Treasury** — Gnosis Safe `0xc4d1cCb6C18dF7254014c9f43cD1D32cb5D44d07` (memoy'de Frostbite safe'i) mi, yeni Safe mi?
