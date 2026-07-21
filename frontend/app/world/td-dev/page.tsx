// frontend/app/world/td-dev/page.tsx
'use client';
/**
 * TD World geliştirme rotası — Faz 1-4 boyunca içeriden doğrulama alanı.
 * Nav'da YOK, noindex; canlı izo World'e dokunmaz. Faz 5 geçişinde silinir.
 */
import { useEffect, useRef } from 'react';

export default function TdDevPage() {
  const ref = useRef<HTMLDivElement>(null);

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
    })();
    return () => { cancelled = true; game?.destroy(true); };
  }, []);

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-5xl">
        <p className="mb-2 text-center font-mono text-xs text-white/40">
          TD-DEV — internal preview · WASD move · F3 perf
        </p>
        <div ref={ref} className="aspect-[3/2] w-full [image-rendering:pixelated]" />
      </div>
    </div>
  );
}
