# Üst Menü Navigasyonu (Sol Sidebar → Top Nav) Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** frostbite.pro masaüstü sol sidebar'ını kaldırıp yerine profesyonel bir üst menü (TopNav — logo + Play/Trade/Social hover-dropdown + sağda ağ/müzik/tema/wallet) getirmek; sağ activity feed ve mobil çekmece korunur.

**Architecture:** Sidebar.tsx'teki ortak parçalar (`NAV_LINKS`, `NavStatusChip`, `WalletButton`, `MusicControls`, tipler) `nav-data.tsx`'e çıkarılır; yeni `TopNav.tsx` masaüstü üst menüyü çizer; `layout.tsx` shell'inde `<Sidebar/>` yerine `<TopNav/>` girer (content-wrap içinde, MobileTopBar'ın masaüstü kardeşi). `MobileTopBar` aynen kalır, ortak parçaları nav-data'dan alır.

**Tech Stack:** Next.js (app router), React, Tailwind, lucide-react, Privy/wagmi. Doğrulama: Playwright (npx cache, hub-embed-smoke kalıbı).

**Kritik bağlam:**
- `app/layout.tsx:6` `import { Sidebar, MobileTopBar } from '@/components/layout/Sidebar'`; `:181-190` shell: `<Sidebar/>` + `[data-content-wrap]` (xl sağ marj `--feed-w:280px`) içinde `<MobileTopBar/>` + `<ChainGuard/>` + `<main data-app-main>` + `<Footer/>`, sonra `<ActivityTicker/>`.
- `components/layout/Sidebar.tsx` — `Sidebar` (masaüstü aside `hidden lg:flex`, w-[16.5rem], `data-chrome=""`), `MobileTopBar` (`lg:hidden`, `data-chrome=""`), + `NAV_LINKS`(14), `NavStatus`/`NAV_STATUS_STYLE`/`NavStatusChip`, `WalletButton`, `MusicControls`. `ThemeToggle` `./ThemeToggle`'dan import.
- Embed modu: `?embed=1` → `[data-chrome]` öğeleri gizlenir (world hub overlay'leri buna bağlı). TopNav `data-chrome=""` TAŞIMALI. `hub-embed-smoke.mjs` chrome görünürlüğünü `[data-chrome]` ile ölçer.
- Dev server: port 3000'de `npm run dev`. ⚠️ `next build` dev'in `.next`'ini bozar — test/screenshot dev'e karşı; build sadece deploy'da (dev durdur → `rm -rf .next && npm run build`).
- Untracked bırak: `.github/`.

---

### Task 1: Ortak nav verisi + alt-bileşenleri `nav-data.tsx`'e çıkar

**Files:**
- Create: `frontend/components/layout/nav-data.tsx`
- Modify: `frontend/components/layout/Sidebar.tsx` (taşınan parçaları buradan import et)

- [ ] **Step 1: `nav-data.tsx` oluştur** — Sidebar.tsx'ten şu parçaları BİREBİR taşı (kesip yapıştır, davranış değişmez): `NavStatus` tipi, `NAV_LINKS` dizisi (14 giriş), `NAV_STATUS_STYLE`, `NavStatusChip` bileşeni, `WalletButton` bileşeni, `MusicControls` bileşeni ve `TRACKS` sabiti. Dosya başı:

```tsx
'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { LogOut, Swords, Sparkles, BarChart3, Store, ArrowLeftRight, GitMerge, Map, Bot, Wallet, Copy, Check, Rocket, Car, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Compass, Dices, Gem, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
```
(Sidebar.tsx'te hangi lucide ikonları NAV_LINKS/WalletButton/MusicControls kullanıyorsa onları buraya al; kalanlar Sidebar/TopNav'da kalır.) `NAV_LINKS`, `NavStatus`, `NAV_STATUS_STYLE`, `NavStatusChip`, `WalletButton`, `MusicControls` hepsi `export`. Taşırken içeriği DEĞİŞTİRME.

- [ ] **Step 2: Sidebar.tsx'i import'a çevir** — taşınan tanımları Sidebar.tsx'ten SİL, üste ekle:
```tsx
import { NAV_LINKS, NavStatusChip, WalletButton, MusicControls, type NavStatus } from './nav-data';
```
Sidebar.tsx'te artık kullanılmayan lucide import'larını temizle (ör. sadece taşınanların kullandıkları). `Sidebar` ve `MobileTopBar` gövdeleri aynen kalır (artık import edilen bileşenleri kullanır).

- [ ] **Step 3: Derleme + regresyon doğrula**
```bash
cd /Users/hts_bot/avax-arena/frontend
npx tsc --noEmit    # yeni hata 0 (baseline: track3d/fuji-ui/matchescrow)
node scripts/hub-embed-smoke.mjs http://localhost:3000   # 18/18 (dev ayakta)
```
Görsel: Playwright ile `http://localhost:3000/avalanche` masaüstü (1440) + mobil (390) screenshot — sidebar ve mobil drawer ÖNCEKİYLE AYNI görünmeli (bu görev saf refactor, görsel değişiklik YOK). /tmp/ws-nav/task1-{desktop,mobile}.png, Read ile karşılaştır.

- [ ] **Step 4: Commit**
```bash
git add components/layout/nav-data.tsx components/layout/Sidebar.tsx
git commit -m "refactor(nav): ortak nav verisi + WalletButton/MusicControls/NavStatusChip nav-data.tsx'e çıkarıldı

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012DzGzcU4Pk5WkmHbstrvJp"
```

---

### Task 2: `TopNav.tsx` — masaüstü üst menü bileşeni

**Files:**
- Create: `frontend/components/layout/TopNav.tsx`

- [ ] **Step 1: TopNav iskeleti** — masaüstü (`hidden lg:flex`) sticky üst şerit, `data-chrome=""` (embed'de gizlenir):

```tsx
'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Zap, User, HelpCircle, ChevronDown } from 'lucide-react';
import { NAV_LINKS, NavStatusChip, WalletButton, MusicControls, type NavStatus } from './nav-data';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';

const GROUPS: { key: string; label: string }[] = [
  { key: 'play', label: 'Play' },
  { key: 'trade', label: 'Trade' },
  { key: 'social', label: 'Social' },
];

export function TopNav() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const navLinks = isConnected && address
    ? [...NAV_LINKS, { href: `/profile/${address}`, label: 'Profile', desc: 'Your stats', icon: User, group: 'social' as const }]
    : NAV_LINKS;

  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openNow = useCallback((g: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenGroup(g);
  }, []);
  const closeSoon = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenGroup(null), 140); // hover köprüsü boşluğu
  }, []);
  // Esc + dış-tık kapatma
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenGroup(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activeGroup = navLinks.find(l => pathname === l.href || pathname.startsWith(l.href + '/'))?.group ?? null;

  return (
    <header
      data-chrome=""
      className="hidden lg:flex sticky top-0 z-40 items-center gap-1 h-14 px-5 bg-[rgb(var(--frost-bg))]/95 backdrop-blur-xl border-b border-white/[0.05]"
      onMouseLeave={closeSoon}
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 mr-3 flex-shrink-0 group">
        <Image src="/avalanche/logo.png" alt="Frostbite" width={32} height={32} className="rounded-lg ring-1 ring-white/[0.08]" priority />
        <span className="font-display text-lg font-bold tracking-wide leading-none">
          <span className="gradient-text">FROST</span><span className="text-white/85 ml-0.5">BITE</span>
        </span>
      </Link>

      {/* Group tabs */}
      <nav className="flex items-center gap-0.5">
        {GROUPS.map(g => {
          const links = navLinks.filter(l => l.group === g.key);
          const isOpen = openGroup === g.key;
          const isActive = activeGroup === g.key;
          return (
            <div key={g.key} className="relative" onMouseEnter={() => openNow(g.key)}>
              <button
                onClick={() => setOpenGroup(isOpen ? null : g.key)}
                aria-expanded={isOpen}
                className={cn(
                  'flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors',
                  isActive || isOpen ? 'text-white' : 'text-white/50 hover:text-white/80'
                )}
              >
                {g.label}
                <ChevronDown className={cn('w-3 h-3 transition-transform', isOpen && 'rotate-180')} />
              </button>
              {isActive && <div className="absolute left-3 right-3 -bottom-[1px] h-[2px] rounded-full bg-frost-primary" />}
              {isOpen && <GroupPanel links={links} pathname={pathname} onNavigate={() => setOpenGroup(null)} />}
            </div>
          );
        })}
        {/* FAQ tek link */}
        <Link href="/faq" className="px-3 py-2 rounded-lg text-[13px] font-semibold text-white/40 hover:text-white/70 transition-colors">FAQ</Link>
      </nav>

      {/* Right controls */}
      <div className="ml-auto flex items-center gap-3 flex-shrink-0">
        <div className="hidden xl:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
          <Zap className="w-3.5 h-3.5 text-frost-primary" />
          <span className="text-[10px] font-semibold text-white/50">Avalanche</span>
        </div>
        <MusicControls />
        <ThemeToggle />
        <WalletButton compact />
      </div>
    </header>
  );
}

function GroupPanel({ links, pathname, onNavigate }: { links: typeof NAV_LINKS; pathname: string; onNavigate: () => void }) {
  return (
    <div
      role="menu"
      className="absolute left-0 top-full mt-1 w-[540px] max-w-[80vw] p-2 rounded-2xl bg-[rgb(var(--frost-bg))]/98 backdrop-blur-xl border border-white/[0.08] shadow-2xl grid grid-cols-2 gap-1 z-50"
    >
      {links.map(link => {
        const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
        const Icon = link.icon;
        const acc = (link as { acc?: string }).acc ?? '#ed2f39';
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            role="menuitem"
            className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors', isActive ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]')}
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
              style={isActive ? { background: `${acc}26` } : { background: 'rgba(255,255,255,0.03)' }}>
              <Icon className="h-[18px] w-[18px]" style={isActive ? { color: acc } : { color: 'rgba(255,255,255,0.5)' }} />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className={cn('text-[13px] font-semibold leading-tight truncate', isActive ? 'text-white' : 'text-white/80')}>{link.label}</span>
                <NavStatusChip status={(link as { status?: NavStatus }).status} />
              </span>
              <span className="block text-[10px] leading-tight mt-0.5 text-white/30 truncate">{link.desc}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
```
⚠️ `WalletButton compact` prop'u nav-data'da mevcut (Sidebar MobileTopBar'da `compact` kullanıyordu). `MusicControls`/`ThemeToggle`/`NavStatusChip` imzaları nav-data/ThemeToggle'daki mevcut hallerine uymalı — Task 1 sonrası import'lar çözülür. `NAV_LINKS` girişlerinde `acc`/`status` opsiyonel; tip erişimi cast'le yapıldı (mevcut Sidebar de böyle yapıyor).

- [ ] **Step 2: Derleme**
```bash
cd /Users/hts_bot/avax-arena/frontend && npx tsc --noEmit   # TopNav'da hata 0
```
(Bileşen henüz layout'a bağlı değil — sadece derlenir. Görsel test Task 3'te.)

- [ ] **Step 3: Commit**
```bash
git add components/layout/TopNav.tsx
git commit -m "feat(nav): TopNav masaüstü üst menü bileşeni (hover dropdown + gruplu panel + sağ kontroller)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012DzGzcU4Pk5WkmHbstrvJp"
```

---

### Task 3: layout.tsx — Sidebar → TopNav swap + Sidebar kaldırma

**Files:**
- Modify: `frontend/app/layout.tsx:6,181-190`
- Modify: `frontend/components/layout/Sidebar.tsx` (masaüstü `Sidebar` export'unu sil, `MobileTopBar` kalır)

- [ ] **Step 1: layout.tsx import + shell** — `:6` import satırını:
```tsx
import { MobileTopBar } from '@/components/layout/Sidebar';
import { TopNav } from '@/components/layout/TopNav';
```
`:181-190` shell'i şuna çevir (Sidebar satırı gider; TopNav content-wrap içinde MobileTopBar'ın hemen üstüne — TopNav masaüstü, MobileTopBar mobil):
```tsx
<div className="mx-auto max-w-[1560px] w-full flex min-h-screen relative">
  <div data-content-wrap="" className="flex-1 min-w-0 flex flex-col min-h-screen xl:[margin-right:var(--feed-w,280px)] transition-[margin] duration-300">
    <TopNav />
    <MobileTopBar />
    <ChainGuard />
    <main data-app-main="" className="relative flex-1 pb-4 px-3 sm:px-6 lg:px-8">{children}</main>
    <Footer />
  </div>
  <ActivityTicker />
</div>
```
Not: sol `<Sidebar/>` gitti → content-wrap tam genişlik (flex-1). Sağ `<ActivityTicker/>` + `--feed-w` marjı KORUNDU. TopNav ve MobileTopBar biri `lg:flex` biri `lg:hidden` — aynı anda ikisi görünmez.

- [ ] **Step 2: Sidebar.tsx'ten masaüstü Sidebar'ı sil** — `export function Sidebar() {...}` bloğunu tamamen kaldır (MobileTopBar ve import'lar kalır). Sidebar.tsx artık yalnız MobileTopBar barındırır. Kalan kullanılmayan import varsa temizle (tsc uyarır).

- [ ] **Step 3: Derleme + kapsamlı doğrulama**
```bash
cd /Users/hts_bot/avax-arena/frontend
npx tsc --noEmit                                   # yeni hata 0
node scripts/hub-embed-smoke.mjs http://localhost:3000   # 18/18 — embed'de TopNav gizli (data-chrome)
node scripts/world-visual-smoke.mjs http://localhost:3000  # 4×✓ (regresyon)
```
Görsel (Playwright, dev 3000):
- Masaüstü (1440) `/avalanche`: üst menü görünür, sol sidebar YOK, içerik tam genişlik, sağ feed yerinde. `/avalanche/battle` ve `/avalanche/cardgame`: aktif grup vurgusu.
- `Play` sekmesi hover → dropdown açılır (ikon+çip+açıklama grid). `page.click` ile aç, panel görünür, bir linke tıkla → gider + panel kapanır.
- Mobil (390): MobileTopBar + drawer değişmeden çalışır.
- Embed: `/avalanche/cardgame?embed=1` → TopNav görünmez (`[data-chrome]` gizli), elementFromPoint kontrolü.
Screenshot'ları /tmp/ws-nav/task3-*.png, Read ile doğrula.

- [ ] **Step 4: Commit**
```bash
git add app/layout.tsx components/layout/Sidebar.tsx
git commit -m "feat(nav): sol sidebar kaldırıldı, layout üst menüye (TopNav) geçti — içerik tam genişlik, sağ feed korundu

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012DzGzcU4Pk5WkmHbstrvJp"
```

---

### Task 4: Cila + deploy

**Files:** ayar çıkarsa TopNav.tsx / cardgame gibi sayfa-özel üst boşluk

- [ ] **Step 1: Sayfa üst-boşluk kontrolü** — bazı sayfalar eskiden sidebar varken üstte MobileTopBar yoktu (masaüstü); şimdi TopNav 56px yer kaplıyor. `/avalanche` (hero), `/battle`, `/world` (Phaser canvas), `/cardgame` masaüstü screenshot'la — içerik TopNav altında kesilmiyor/örtülmüyor mu (özellikle sticky/absolute başlıklar). Sorun varsa `main` padding-top ya da ilgili sayfada ayar (minimal). World `/world` sayfası kendi tam-ekran mantığına sahip — TopNav onu bozmuyor mu (embed değil ama tam-ekran canvas) kontrol et.
- [ ] **Step 2: Aktif-sayfa + dropdown davranış turu** — her grupta bir sayfaya git, doğru sekme vurgulu mu; dropdown hover aç/kapa köprüsü (140ms) pürüzsüz mü; Esc + dış-tık kapatıyor mu; dokunmatik viewport'ta (`hasTouch`) tık ile aç/kapa çalışıyor mu. Sorunları TopNav'da düzelt.
- [ ] **Step 3: Tam test + build**
```bash
cd /Users/hts_bot/avax-arena/frontend
npx tsc --noEmit && npx tsx scripts/hub-registry-test.ts && npx tsx scripts/hub-town-check.ts
# deploy build: dev durdur → temiz build
kill $(lsof -ti :3000 -sTCP:LISTEN) 2>/dev/null; rm -rf .next && npm run build
```
- [ ] **Step 4: Deploy (frontend — memory rsync akışı)**
```bash
cd /Users/hts_bot/avax-arena
rsync -avz --delete --exclude='node_modules' --exclude='.env' --exclude='.env.local' --exclude='data/frostbite.db' --exclude='data/frostbite.db-shm' --exclude='data/frostbite.db-wal' --exclude='data/uploads' -e "ssh -i ~/.ssh/id_ed25519" frontend/ root@5.189.173.167:/opt/frostbite/mainnet/frontend/
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 "pm2 restart frostbite-mainnet"
```
Prod doğrula: `node scripts/world-visual-smoke.mjs https://frostbite.pro` (4×✓) + masaüstü/mobil screenshot + `?embed=1` TopNav gizli. Bu SADECE frontend — MP hub/bundle etkilenmez.
- [ ] **Step 5: Commit (ayar çıktıysa) + memory güncelle** — nav redesign durumu memory'ye (Sidebar→TopNav, nav-data ortak dosya, embed data-chrome, sağ feed korundu).

---

## Self-review notları
- **Spec kapsaması:** layout swap=Task 3 · TopNav=Task 2 · nav-data ortak çıkarma=Task 1 · mobil koruma=Task 3 (MobileTopBar kalır) · embed data-chrome=Task 2 (TopNav) + Task 3 smoke · activity feed korunması=Task 3 (ActivityTicker+--feed-w dokunulmaz) · cila/deploy=Task 4.
- **Tip tutarlılığı:** `NAV_LINKS`/`NavStatus`/`NavStatusChip`/`WalletButton`/`MusicControls` Task 1'de export edilir, Task 2 tüketir. `WalletButton compact` prop'u mevcut (Sidebar MobileTopBar kullanıyor). `openGroup` string|null tutarlı.
- **Bilinçli esneklik (placeholder değil):** Task 1'de "hangi lucide ikonlar taşınır" — kesin liste NAV_LINKS'in kullandıklarıdır (Swords/Sparkles/GitMerge/Target/Bot/Car/Map/Compass/Dices/Store/Rocket/ArrowLeftRight/BarChart3/Gem + WalletButton'ın Wallet/Copy/Check/LogOut + MusicControls'ün Play/Pause/SkipForward/SkipBack/Volume2/VolumeX); tsc kalanı yakalar. Task 4 cila ayarları görsel-bağımlı (screenshot'a göre), sabit kod dayatmak yanlış olurdu.
- **Risk:** embed'de TopNav görünürse hub bozulur → data-chrome + hub-embed-smoke 18/18 zorunlu (Task 3). Refactor'da MobileTopBar kırılması → Task 1 mobil screenshot.
