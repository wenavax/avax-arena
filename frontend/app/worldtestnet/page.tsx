// frontend/app/worldtestnet/page.tsx
'use client';
/**
 * TD World testnet önizlemesi — Faz 1-4 boyunca canlı doğrulama alanı.
 * Nav'da YOK, noindex; canlı izo World'e dokunmaz. Faz 5 geçişinde silinir.
 */
import { useEffect, useRef, useState } from 'react';

interface HubToast { name: string; accent: string }

export default function TdDevPage() {
  const ref = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<HubToast | null>(null);

  useEffect(() => {
    let game: import('phaser').Game | null = null;
    let cancelled = false;
    (async () => {
      const Phaser = await import('phaser');
      const { TdWorldScene } = await import('@/lib/game/td/TdWorldScene');
      const { VIEW_W, VIEW_H } = await import('@/lib/game/td/tdCore');
      if (cancelled || !ref.current) return;
      game = new Phaser.Game({
        type: Phaser.CANVAS,
        parent: ref.current,
        width: VIEW_W, height: VIEW_H,
        pixelArt: true, roundPixels: true,
        backgroundColor: '#0d1319',
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [TdWorldScene],
      });
      // dev-only: konsoldan sahne durumunu incelemek için
      if (process.env.NODE_ENV !== 'production') (window as unknown as { __tdGame?: unknown }).__tdGame = game;
    })();
    return () => { cancelled = true; game?.destroy(true); };
  }, []);

  useEffect(() => {
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
  }, []);

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-5xl">
        <p className="mb-2 text-center font-mono text-xs text-white/40">
          WORLD TESTNET — early preview · WASD move · E interact · M minimap · F3 perf
        </p>
        <div ref={ref} className="aspect-[3/2] w-full [image-rendering:pixelated]" />
      </div>
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded bg-[#141c24] px-4 py-3 text-sm text-white shadow-lg"
          style={{ borderLeft: `3px solid ${toast.accent}` }}
        >
          {toast.name} — opens after the World switch (Phase 5)
        </div>
      )}
    </div>
  );
}
