# Üst Menü Navigasyonu (Sol Sidebar → Top Nav) Tasarımı

**Tarih:** 2026-07-19
**Durum:** Onaylandı (beyin fırtınası oturumu)
**Kapsam:** frostbite.pro (Avalanche uygulaması) masaüstü sol sidebar'ını kaldırıp yerine profesyonel bir üst menü (top navigation) getirmek. Sağdaki canlı aktivite şeridi ve mobil çekmece korunur.

## Amaç
Kullanıcı: "sol taraftaki menüyü kaldıralım ve daha profesyonel şekilde tasarlayalım." Mevcut sol sidebar (16.5rem, Play/Trade/Social accordion + altta dağınık wallet/müzik/tema/chain kontrolleri) kapalı durumda boş/dağınık görünüyor. Hedef: modern web3/borsa sitelerindeki gibi tek üst şerit, gruplu açılır menüler, toparlanmış kontroller, tam genişlik içerik.

## Kararlar (kullanıcı onaylı)

| Karar | Seçim |
|---|---|
| Yön | Üst menü (top nav) + gruplu hover-dropdown + sağda toplanan kontroller |
| Sol sidebar | Masaüstünde tamamen kaldırılır |
| Activity feed (ActivityTicker) | **Sağda kalır** (280px, `--feed-w` sağ marjı korunur) |
| Dropdown tetikleme | Hover (masaüstü); dokunmatikte tık'a düşer |
| Mobil | Mevcut MobileTopBar + slide-in drawer AYNEN kalır |
| İkon rayı (B varyantı) | YOK (kullanıcı sade üst menü seçti) |

## Mevcut durum (kod)
- `app/layout.tsx:181-190` — shell: `<Sidebar />` + `[data-content-wrap]` (xl sağ marj `--feed-w:280px`) içinde `<MobileTopBar />` + `<ChainGuard />` + `<main data-app-main>` + `<Footer />`, sonra `<ActivityTicker />`.
- `components/layout/Sidebar.tsx` — `Sidebar` (masaüstü `hidden lg:flex` aside, 16.5rem) + `MobileTopBar` (mobil `lg:hidden`) aynı dosyada. İçinde: `NAV_LINKS` (14 giriş, group: play/trade/social), `NAV_STATUS_STYLE`, `NavStatusChip`, `WalletButton`, `MusicControls`, `ThemeToggle` (import).
- `NAV_LINKS`: play(9: Arena/Mint/Fusion/Quests/Agents/CAR(D) GAME/World/Adventures/Expeditions), trade(3: Market/Launchpad/Swap), social(2: Rankings/NFT Score) + bağlıysa Profile. Ayrı FAQ linki.
- Embed modu: `[data-chrome]` öğeleri `?embed=1`'de gizlenir (Sidebar + MobileTopBar `data-chrome=""` taşır). World Hub overlay'leri buna bağlı — TopNav de taşımalı.

## Mimari

### Yeni/değişen dosyalar
1. **`components/layout/nav-data.tsx`** (YENİ — ortak veri + alt-bileşenler): `NAV_LINKS`, `NavStatus` tipi, `NAV_STATUS_STYLE`, `NavStatusChip`, `WalletButton`, `MusicControls` Sidebar.tsx'ten buraya taşınır. Hem TopNav hem MobileTopBar import eder (kod tekrarı biter). (`ThemeToggle` zaten ayrı dosyada, import kalır.)
2. **`components/layout/TopNav.tsx`** (YENİ — masaüstü üst menü):
   - Kök: `<header data-chrome="" className="hidden lg:flex sticky top-0 z-40 ...">` (content-wrap içinde, MobileTopBar'ın masaüstü karşılığı).
   - Sol: logo (Link `/`), FROSTBITE wordmark.
   - Orta: `Play`/`Trade`/`Social` sekme grubu. Her sekme hover'da (`onMouseEnter`/`onMouseLeave` + kısa kapanma gecikmesi) altında absolute konumlu gruplu panel gösterir: o grubun linkleri ikon + isim + `NavStatusChip` + açıklama grid'i (2-3 sütun). Aktif sayfanın grubu/sekmesi vurgulu (mevcut `pathname` mantığı). Dokunmatik (`hover: none` / pointer coarse) → tık ile aç/kapat (state fallback).
   - Sağ: kompakt Avalanche ağ göstergesi + `MusicControls` + `ThemeToggle` + `WalletButton`. FAQ küçük link (Social panelinde ya da sağda).
   - Social grubu: Rankings + NFT Score + (bağlıysa) Profile.
   - Erişilebilirlik: sekmeler `aria-expanded`, panel `role="menu"`, Esc kapatır, dış-tık kapatır.
3. **`app/layout.tsx`** (değişiklik): `<Sidebar />` satırı kaldırılır; `<TopNav />` `[data-content-wrap]` içinde `<MobileTopBar />`'dan hemen sonra (ya da yerine masaüstü) eklenir — TopNav `lg:flex`, MobileTopBar `lg:hidden` → biri masaüstü biri mobil. `ActivityTicker` + sağ marj DEĞİŞMEZ. Sol sidebar gidince content-wrap doğal tam genişlik alır (flex-1).
4. **`components/layout/Sidebar.tsx`** (değişiklik): masaüstü `Sidebar` export'u SİLİNİR. `MobileTopBar` KALIR ama ortak parçaları nav-data.tsx'ten import eder (kendi kopyalarını bırakır). Dosya adı MobileTopBar'ı barındırdığı için kalabilir ya da MobileTopBar da ayrı dosyaya taşınabilir (implementer kararı; minimal tut).

### Veri akışı
Değişmez — `NAV_LINKS` statik; `usePathname` aktif vurgu; `usePrivy`/`useAccount` wallet; müzik/tema mevcut mantık. Sadece sunum katmanı yer değiştirir.

## Doğrulama
1. `tsc --noEmit` temiz + `next build` ✓
2. Masaüstü headless screenshot (1440px): ana sayfa + Battle + Cardgame — üst menü görünür, sol sidebar yok, içerik tam genişlik, sağ feed yerinde. Play sekmesi hover → dropdown açılır (ikon+çip+açıklama).
3. Mobil headless (390px): MobileTopBar + drawer değişmeden çalışır.
4. `node scripts/hub-embed-smoke.mjs` 18/18 — `?embed=1`'de TopNav gizli (`data-chrome`), overlay chrome'suz.
5. Aktif-sayfa vurgusu (her grupta bir sayfa) + Esc/dış-tık kapatma + dokunmatik tık davranışı görsel kontrol.
6. `hub-registry-test`/`hub-town-check` regresyon (layout değişikliği world'ü etkilememeli).

## Değişmeyenler / kısıtlar
- ActivityTicker (sağ feed), Footer, ChainGuard, tüm sayfa içerikleri, wallet/tema/müzik işlevleri, mobil drawer, save/state.
- Embed modu sözleşmesi (`data-chrome`) korunur — World Hub overlay'leri bozulmaz.
- Tüm UI metinleri İngilizce.
- `--feed-w` değişkeni ve xl sağ marj mantığı korunur.

## Riskler
| Risk | Önlem |
|---|---|
| Embed'de TopNav görünür kalırsa hub overlay'leri bozulur | TopNav `data-chrome=""`; hub-embed-smoke 18/18 zorunlu |
| Ortak parça taşımada (nav-data) MobileTopBar kırılır | Taşıma sonrası mobil headless smoke + import kontrolü |
| Hover dropdown dokunmatikte açılmaz/kapanmaz | pointer-coarse'ta tık fallback + Esc/dış-tık |
| 14 link dropdown'da kalabalık | gruplu grid (2-3 sütun), Play grubu en büyük — açıklamalar kısa |
| Aktif-sayfa vurgusu kaybolması | mevcut pathname mantığı sekme + panel öğesinde korunur |
