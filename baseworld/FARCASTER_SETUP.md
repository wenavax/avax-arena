# Farcaster Mini App Setup

Pixel Atlas Farcaster Mini App olarak yayına hazır (iskelet). Aşağıdaki adımları **mainnet deploy sonrası** yap.

## 1. Manifest signature üret

`web/public/.well-known/farcaster.json` içinde `accountAssociation` placeholder olarak `TODO_REPLACE...` dolu. Bunu Warpcast Developer Tools ile imzalayıp gerçek değerlerle değiştir:

1. [warpcast.com/~/developers/mini-apps/manifest](https://warpcast.com/~/developers/mini-apps/manifest)
2. Domain gir: `frostbite.pro` (subpath değil, root domain)
3. Custody cüzdanını bağla (Mini App owner adresi)
4. "Sign" → `header`, `payload`, `signature` üretilir
5. JSON'a yapıştır

## 2. Görsel dosyaları

Manifest'te 3 URL'ye gerçek görseller koy:

- `iconUrl` → 1024×1024 PNG, square, transparent OK (Pixel Atlas amblemi)
- `imageUrl` (OG/feed preview) → 3:2 oran, 1200×800 (haritanın güzel bir frame'i)
- `splashImageUrl` → 200×200 PNG, square (uygulama açılırken)

`web/public/icon.png`, `og.png`, `splash.png` olarak yerleştir.

## 3. Deploy + test

```bash
cd baseworld/web && pnpm build
# Mainnet'e push edildikten sonra
curl https://frostbite.pro/baseworld/.well-known/farcaster.json
# header/payload/signature non-placeholder olmalı

# Frame meta tag teyit:
curl https://frostbite.pro/baseworld/atlas | grep "fc:frame"
```

## 4. Warpcast'te dene

1. Cast at: `https://frostbite.pro/baseworld/atlas`
2. Feed preview'da "Open Atlas" butonu görünmeli
3. Tıkla → splash → harita içinde açılır (Warpcast'in webview'i)

## 5. Coinbase Wallet integration (opsiyonel)

Frame protokolü Coinbase Wallet'ta da çalışır. Test:

1. Coinbase Wallet → DApp browser → URL gir
2. Aynı `fc:frame` meta otomatik tanınır

## Webhook events

`/api/frame/webhook` endpoint'i lifecycle event'leri için. Mini App kullanıcı tarafından "Add" edildiğinde notification token gelir. İleride:

- Yeni mint → tüm Mini App add'lenmiş kullanıcılara notification
- Sahiplik kaybı → eski sahibe bildirim
- Görsel block'landı → sahibe bildirim

DB henüz yok; ileride Redis/Postgres ile token'ları sakla.

## MiniApp rewards bağlantısı

Mini App olarak yayınlanma + kullanım Talent.app Builder Score'una **Farcaster MiniApp rewards** olarak katkı yapar. Builder Code dataSuffix zaten her tx'i Pixel Atlas'a atfettiği için ayrı bir kurulum gerekmez.

## CSP notu

`next.config.mjs` `/atlas` route'unda `frame-ancestors` Warpcast + Coinbase Wallet'a açtı. Diğer route'lar (`/`, `/terms`, `/admin/derive`) hâlâ DENY — Mini App context'i yalnızca `/atlas` üzerinden açılır.
