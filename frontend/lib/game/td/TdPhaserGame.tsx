'use client';
// frontend/lib/game/td/TdPhaserGame.tsx
// ─── TD dünyası mount komponenti — live/preview mod tek kaynak ───
// worldtestnet/page.tsx'in oyun-mount + toast mantığının komponentleşmişi (Faz 5 Task 1).
// mode='preview': /worldtestnet önizlemesi (toast'lar, sandbox savaş).
// mode='live': WorldLoginGate'in gerçek mount'u (gerçek hub overlay, sandbox:false, MP-hazır).
import { useEffect, useRef, useState } from 'react';
import { GameOverlay } from '@/components/game/GameOverlay';

interface HubToast { name: string; accent: string }

export function TdPhaserGame({ mode }: { mode: 'preview' | 'live' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<HubToast | null>(null);
  const [sellToast, setSellToast] = useState<number | null>(null);

  // ── Phaser mount: 3 TD sahnesi, registry.set('tdMode', mode) game oluşturulur oluşturulmaz
  // (sahnelerin create()'i registry'den senkron okur — Phaser.Game constructor'ı sahneleri
  // hemen boot etmez, ilk resize/RAF'ta olur; yine de en erken noktada set edilir). ──
  useEffect(() => {
    let game: import('phaser').Game | null = null;
    let cancelled = false;
    (async () => {
      const Phaser = await import('phaser');
      // ── LIVE mod: GERÇEK kaydı singleton'a yükle + NFT sync (CharacterSelect paritesi).
      // Bu olmadan ilk savaş default Lv.1 hero'yu frostbite_save üstüne yazar (pre-switch
      // review CRITICAL bulgusu — Faz 3 sandbox Critical'inin canlı-mod eşleniği).
      if (mode === 'live') {
        const { PlayerState } = await import('../PlayerState');
        const st = PlayerState.get();
        const loaded = st.load();
        const w = window as unknown as {
          __frostbiteWallet?: { authenticated?: boolean };
          __frostbiteHero?: { tokenId: number; element: number; rarity: number; level?: number; xp?: number; atk: number; def: number; spd: number };
        };
        const nft = w.__frostbiteWallet?.authenticated ? w.__frostbiteHero : undefined;
        if (nft) {
          // CharacterSelectScene continue-yolu NFT sync'i ile birebir (base statlar,
          // recalcStats notu: atk/def/spd doğrudan atanmaz, base* atanır).
          st.nftTokenId = nft.tokenId; st.nftElement = nft.element; st.nftRarity = nft.rarity;
          st.useNftSprite = true;
          st.baseAtk = nft.atk; st.baseDef = nft.def; st.baseSpd = nft.spd;
          st.nftStatLevel = nft.level || 1;
          st.level = Math.max(st.level, nft.level || 1);
          st.xp = nft.xp || 0;
          const rarityBonus = [0, 2, 5, 10, 20][nft.rarity] || 0;
          st.maxHp = 120 + 15 * (st.level - 1) + rarityBonus;
          if (!loaded) { st.hp = st.maxHp; st.gold = 50; } // kayıtsız NFT sahibi: taze başlangıç
          else st.hp = Math.min(st.hp, st.maxHp);
        }
      }
      const { TdWorldScene } = await import('./TdWorldScene');
      const { TdBattleScene } = await import('./TdBattleScene');
      const { TdDungeonScene } = await import('./TdDungeonScene');
      if (cancelled || !ref.current) return;
      // ── Faz 5.2 Netlik (Larvy paritesi — play.larvy.fun game.js incelemesi):
      // canvas TAM viewport çözünürlüğünde (Scale.RESIZE; CSS ölçekleme YOK → tarayıcı
      // yeniden-örnekleme bulanıklığı ve yarım-piksel ofset sınıfı komple ölür).
      // Dünya büyütmesi sahnelerin KAMERASINDA (setZoom(k), tam-sayı; computeTdView.k)
      // — sprite pikselleri çizim anında k× nearest, metin/HUD native çözünürlükte
      // (layoutHud screen→logical dönüşümü + setResolution). Savaş kendi kamerasını
      // kesirli fit-zoom'lar; ScaleManager'a kimse dokunmaz → restore dansı yok. ──
      game = new Phaser.Game({
        // Faz 5.2: CANVAS → AUTO (WebGL) — tam-çözünürlük canvas'ta 2D rasterizer dar
        // boğazdı; izo PhaserGame de AUTO idi (BattleScene kodu WebGL'de kanıtlı).
        // Chunk/su texture'ları frame-başına AYRI addCanvas key'leri kullanır (in-place
        // mutasyon yok) → WebGL texture-refresh tuzağı yok.
        type: Phaser.AUTO,
        parent: ref.current,
        pixelArt: true, roundPixels: true,
        backgroundColor: '#0d1319',
        scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: '100%', height: '100%' },
        scene: [TdWorldScene, TdBattleScene, TdDungeonScene],
      });
      // Sahneler create()'te registry.get('tdMode') okur — scene başlamadan hemen önce set edilir.
      game.registry.set('tdMode', mode);
      game.registry.set('tdTouch', { dx: 0, dy: 0, e: false, space: false });
      if (process.env.NODE_ENV !== 'production') (window as unknown as { __tdGame?: unknown }).__tdGame = game;
      // Larvy DPR fallback'i: kesirli devicePixelRatio (Windows %125/150, tarayıcı zoom'u)
      // pixelated canvas'ı compositor'da kemirir — o ekranlarda smooth örneklemeye düş.
      const dpr = window.devicePixelRatio || 1;
      if (Math.abs(dpr - Math.round(dpr)) > 0.01 && game.canvas) game.canvas.style.imageRendering = 'auto';
    })();
    return () => { cancelled = true; game?.destroy(true); };
    // mode değişmez (component ömrü boyunca sabit prop) — yeniden mount gerektirmez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── PREVIEW mod: hub toast (mevcut worldtestnet davranışı) ──
  useEffect(() => {
    if (mode === 'live') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onHubOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ url?: string; name?: string; accent?: string }>).detail;
      if (!detail?.name) return;
      setToast({ name: detail.name, accent: detail.accent ?? '#9fe8ff' });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setToast(null), 2500);
    };
    window.addEventListener('td-hub-open', onHubOpen);
    return () => {
      window.removeEventListener('td-hub-open', onHubOpen);
      if (timer) clearTimeout(timer);
    };
  }, [mode]);

  // ── sell toast (her iki mod) ──
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onSell = (e: Event) => {
      const detail = (e as CustomEvent<{ gold?: number; total?: number }>).detail;
      if (!detail || typeof detail.gold !== 'number') return;
      setSellToast(detail.gold);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setSellToast(null), 2500);
    };
    window.addEventListener('td-sell', onSell);
    return () => {
      window.removeEventListener('td-sell', onSell);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // ── Mobil dokunmatik kontroller: (pointer: coarse) — sol sanal joystick + sağ E/SPACE ──
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true);
  }, []);

  const joyBaseRef = useRef<HTMLDivElement>(null);
  const joyThumbRef = useRef<HTMLDivElement>(null);
  const joyActiveRef = useRef<{ id: number; cx: number; cy: number } | null>(null);
  const touchStateRef = useRef({ dx: 0, dy: 0, e: false, space: false });

  const pushTouch = () => {
    const g = (window as unknown as { __tdGame?: import('phaser').Game }).__tdGame;
    g?.registry.set('tdTouch', { ...touchStateRef.current });
  };

  const onJoyStart = (ev: React.PointerEvent) => {
    ev.preventDefault();
    const rect = (ev.currentTarget as HTMLDivElement).getBoundingClientRect();
    joyActiveRef.current = { id: ev.pointerId, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  };
  const onJoyMove = (ev: React.PointerEvent) => {
    const active = joyActiveRef.current;
    if (!active || ev.pointerId !== active.id) return;
    ev.preventDefault();
    const R = 42;
    let dx = ev.clientX - active.cx, dy = ev.clientY - active.cy;
    const len = Math.hypot(dx, dy) || 1;
    const clampedLen = Math.min(len, R);
    dx = (dx / len) * clampedLen; dy = (dy / len) * clampedLen;
    if (joyThumbRef.current) joyThumbRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / R, ny = dy / R;
    touchStateRef.current.dx = Math.abs(nx) < 0.15 ? 0 : nx;
    touchStateRef.current.dy = Math.abs(ny) < 0.15 ? 0 : ny;
    pushTouch();
  };
  const onJoyEnd = (ev: React.PointerEvent) => {
    const active = joyActiveRef.current;
    if (!active || ev.pointerId !== active.id) return;
    joyActiveRef.current = null;
    if (joyThumbRef.current) joyThumbRef.current.style.transform = 'translate(0px, 0px)';
    touchStateRef.current.dx = 0; touchStateRef.current.dy = 0;
    pushTouch();
  };

  const setBtn = (key: 'e' | 'space', v: boolean) => {
    touchStateRef.current[key] = v;
    pushTouch();
  };

  return (
    // live: tam viewport (world layout takeover'ı ile bütün ekran)
    // preview: worldtestnet'in ortalanmış 3:2 kutusu
    // Faz 5.2: Scale.RESIZE canvas'ı konteynere 1:1 oturtur (CSS ölçekleme yok) —
    // ortalama/kırpma gerekmez, pixelated yalnız DPR compositor upscale'i için.
    <div className={mode === 'live' ? 'fixed inset-0 bg-[#0d1319]' : 'relative w-full max-w-5xl'}>
      <div ref={ref} className={(mode === 'live' ? 'h-full w-full' : 'aspect-[3/2] w-full') + ' overflow-hidden bg-[#0d1319] [image-rendering:pixelated]'} />

      {isTouch && (
        <>
          {/* sol-alt sanal joystick */}
          <div
            ref={joyBaseRef}
            onPointerDown={onJoyStart}
            onPointerMove={onJoyMove}
            onPointerUp={onJoyEnd}
            onPointerCancel={onJoyEnd}
            className="absolute bottom-4 left-4 z-40 h-24 w-24 touch-none rounded-full border border-white/20 bg-black/30"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <div
              ref={joyThumbRef}
              className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30 transition-transform duration-75"
            />
          </div>
          {/* sağ-üst 🎒 çanta / 🗺 minimap (Faz 5.4 — one-shot window event, sahne dinler) */}
          <div className="absolute right-4 top-4 z-40 flex gap-2">
            <button
              onPointerDown={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('td-ui-bag')); }}
              className="h-11 w-11 touch-none rounded-full border border-white/20 bg-black/30 text-lg active:bg-white/20"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >🎒</button>
            <button
              onPointerDown={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('td-ui-map')); }}
              className="h-11 w-11 touch-none rounded-full border border-white/20 bg-black/30 text-lg active:bg-white/20"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >🗺</button>
            <button
              onPointerDown={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('td-ui-potion')); }}
              className="h-11 w-11 touch-none rounded-full border border-white/20 bg-black/30 text-lg active:bg-white/20"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >🧪</button>
          </div>
          {/* sağ-alt E / SPACE */}
          <div className="absolute bottom-4 right-4 z-40 flex gap-3">
            <button
              onPointerDown={e => { e.preventDefault(); setBtn('space', true); }}
              onPointerUp={e => { e.preventDefault(); setBtn('space', false); }}
              onPointerLeave={() => setBtn('space', false)}
              className="h-16 w-16 touch-none rounded-full border border-white/20 bg-black/30 font-mono text-xs text-white/80 active:bg-white/20"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >SPACE</button>
            <button
              onPointerDown={e => { e.preventDefault(); setBtn('e', true); }}
              onPointerUp={e => { e.preventDefault(); setBtn('e', false); }}
              onPointerLeave={() => setBtn('e', false)}
              className="h-16 w-16 touch-none rounded-full border border-white/20 bg-black/30 font-mono text-sm text-white/80 active:bg-white/20"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >E</button>
          </div>
        </>
      )}

      {mode === 'preview' && toast && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded bg-[#141c24] px-4 py-3 text-sm text-white shadow-lg"
          style={{ borderLeft: `3px solid ${toast.accent}` }}
        >
          {toast.name} — opens after the World switch (Phase 5)
        </div>
      )}
      {sellToast !== null && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded bg-[#141c24] px-4 py-3 text-sm text-white shadow-lg"
          style={{ borderLeft: '3px solid #ffd23f' }}
        >
          Sold for {sellToast}g 💰
        </div>
      )}

      {/* LIVE mod: gerçek same-origin iframe hub overlay (izo ile birebir aynı komponent/sözleşme) */}
      {mode === 'live' && <GameOverlay />}
    </div>
  );
}
