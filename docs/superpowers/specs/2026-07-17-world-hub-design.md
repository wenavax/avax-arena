# World Hub — Kasaba İçi Oyun Binaları Tasarımı

**Tarih:** 2026-07-17
**Durum:** Onaylandı (beyin fırtınası oturumu, görsel companion ile)
**Kapsam:** Avalanche World (izometrik RPG) kasabasına sitedeki 9 oyunun/aracın binalarını yerleştirmek; her bina E etkileşimiyle oyunu dünyadan çıkmadan tam ekran overlay içinde açar.

## Amaç ve kararlar

| Karar | Seçim |
|---|---|
| Ana amaç | Keşif + trafik: World'de oynayan kişi diğer oyunları fark etsin ve oynasın |
| Kapsam | 9 oyun/araç: Arena, CAR(D) GAME, Battle Royale, Expeditions, Adventures, Swap, Marketplace, Launchpad, NFT Score |
| Yerleşim | Mevcut kasabaya (IsoTown) serpiştir — yeni zone yok, meydan revizyonu yok |
| Etkileşim | E → oyun overlay'de **gerçekten çalışır** (same-origin iframe) — Faz 1'de 9'u da |
| Ödül köprüsü | YOK — ekonomiler ayrı kalır (köprü ileriki faz, ayrı tasarım) |
| Mobil | Aynı overlay her platformda; overlay açıkken World tamamen duraklar |

## Mimari

### Yeni parçalar

1. **`frontend/lib/game/hub/hubGames.ts`** — oyun kayıt defteri (tek doğruluk kaynağı):
   ```ts
   interface HubGame {
     id: string;            // 'arena' | 'cardgame' | ...
     name: string;          // tabela adı
     icon: string;          // emoji/ikon
     url: string;           // '/battle' gibi (basePath'siz route; iframe src'de /avalanche öneklenir)
     accent: number;        // bina/tabela rengi
     building: string;      // tema anahtarı (kolezyum, garaj, kule...)
     townPos: { tx: number; ty: number }; // kapı tile'ı (uygulamada çarpışma haritasına göre kesinleşir)
   }
   ```

2. **`frontend/lib/game/hub/GameOverlay.tsx`** — React overlay bileşeni (`PhaserGame.tsx`'in kardeşi, world sayfasında render edilir):
   - Tam ekran katman: karartma + başlık çubuğu (oyun ikonu+adı, ✕ kapat) + `<iframe src="/avalanche/<url>?embed=1">`
   - `100dvh` + safe-area inset'ler (cardgame Paket 6 kalıbı)
   - iframe 10 sn içinde `load` event'i vermezse: "Yüklenemedi — Tekrar dene / Sayfada aç" fallback'i
   - Kapatınca iframe DOM'dan tamamen sökülür (bellek/ses temizliği garantili)

3. **Phaser ↔ React köprüsü** — `window` custom event'leri (mevcut `__frostbiteWallet` sadeliğinde):
   - Phaser → React: `hub-open-game` (detail: gameId)
   - React → Phaser: `hub-overlay-closed`

### World tarafı değişiklikler

- **`IsoTownScene`**: 9 bina, mevcut bina çizim kalıbıyla (Graphics + tabela + aksan rengi). Her binanın kapı tile'ına `interact: 'hub_<gameId>'`.
- **`IsoBaseScene.onInteract`** (veya IsoTown override): `hub_` önekini görünce `hub-open-game` yollar + `freeze()`.
- **Duraklatma**: overlay açılırken World sahnesi `scene.pause` + müzik stop; MP socket bağlı kalır (presence düşmez) ama update işlenmez. `hub-overlay-closed` → resume + unfreeze, karakter kapının önünde kaldığı yerde.

### Embed modu (`?embed=1`) — merkezi, oyun koduna dokunmadan

- Kök layout'a minik client bileşeni (`components/EmbedMode.tsx`): `window.location.search`'te `embed=1` görünce `document.body.classList.add('embed')`.
- `globals.css`: `.embed` altında sidebar/header/footer gizlenir, ana içerik tam viewport'a oturur.
- 9 oyunun sayfa kodu değişmez. Testnet `GameStageBanner` uyarıları görünür KALIR (bilinçli karar).
- Oyun-başı taşma/kırılma çıkarsa per-game QA turunda nokta düzeltme.

## Kasaba yerleşimi + bina temaları (onaylandı)

Kesin tile koordinatları uygulamada gerçek çarpışma haritasına göre oturtulur; onaylanan şey bölgeleme + temalar:

| Bina | Oyun | Tema/tabela | Bölge |
|---|---|---|---|
| ⚔️ Kolezyum | Arena (1v1/3v3 NFT war, `/battle`) | Taş arena, kılıç tabelası, meşaleler | Ana yolun kuzeydoğusu (spawn'dan görünür) |
| 🏎️ Yarış Garajı | CAR(D) GAME (`/cardgame`) | Neon "CAR(D)" tabelası, damalı bayrak | Kolezyumun yanı — oyun ikilisi yan yana |
| 👑 Savaş Kulesi | Battle Royale (`/world/battle-royale`) | Kule + taç sancağı | Kuzey çıkışına yakın |
| 🎲 Sefer Kampı | Expeditions (`/expeditions`) | Çadır + zar tabelası | Güneydoğu |
| 🧭 Macera Loncası | Adventures (`/world/adventures`) | Lonca binası, pusula tabelası | Güney, spawn'a yakın |
| 💱 Sarrafhane | Swap (`/swap`) | Terazi tabelası, altın detaylar | Batı çarşı sokağı (Merchant Bjorn'un yanı) |
| 🏪 NFT Pazarı | Marketplace (`/marketplace`) | Tezgâh + sancaklar | Batı çarşı sokağı |
| 🚀 Roket Kulesi | Launchpad (`/launchpad`) | Mini roket, duman efekti | Güneybatı köşe (yüksek silüet) |
| 💎 Kahin Evi | NFT Score (`/nft-score`) | Kristal küre vitrini | Güney |

## Kenar durumları

- **iframe yüklenemedi**: başlık çubuğu + ✕ overlay katmanında (asla kilitlenmez); 10 sn timeout → hata + "Tekrar dene / Sayfada aç".
- **Tx/maç ortasında kapatma**: sekme kapatma semantiği. Cardgame MP reconnect altyapısı yeniden açılışta maça bağlar; tx zincirde akmaya devam eder. Faz 1'de kapatma onayı YOK.
- **ESC**: iframe focus'tayken oyuna gider; ana kapatma yolu ✕ (mobille tutarlı). World-focus'taki ESC de kapatır (opsiyonel iyileştirme).
- **Cüzdan**: same-origin iframe → Privy/wagmi oturumu paylaşılır; yeniden bağlanma beklenmez. Injected cüzdan (MetaMask) same-origin iframe'e inject olur — canlı testte doğrulanacak.
- **Kapsam**: binalar yalnız kasabada; dungeon/diğer zone'larda yok.
- **Çifte tetik**: overlay açıkken World frozen → ikinci E işlenmez (mevcut frozen guard yeterli; `runAfterDialog` gerekmiyor).

## Test planı

1. **Headless bina etkileşimi**: kasaba boot → her binanın kapısında E → doğru `hub-open-game` event'i + overlay DOM'da doğru iframe src; ✕ → `hub-overlay-closed` + World resume (battle-test harness kalıbı).
2. **Embed smoke**: 9 sayfa `?embed=1` ile — sidebar yok + 0 konsol hatası.
3. **Mobil viewport smoke**: portre + yatay, overlay safe-area (simüle-inset kalıbı hazır).
4. **Canlı cüzdanlı akış**: overlay içinde cardgame practice + tx'li bir akış — kullanıcı gözüyle (özellikle MetaMask-in-iframe).

## Faz 1 dışı (bilinçli ertelenen)

- Ödül/başarım köprüsü (oyun ↔ world ekonomisi)
- Binalarda canlı veri teaser'ları (sonraki yarış sayacı, arena pot'u — vitrin paneli fikri)
- Cardgame'in native mount'a terfisi (iframe yerine)
- Dungeon/diğer zone'lara ikincil girişler
