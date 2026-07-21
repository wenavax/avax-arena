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
    const isMonsterGrid = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('monsters') === '1';
    (async () => {
      if (isMonsterGrid) {
        const { mkMonsterChibi } = await import('@/lib/game/td/sprites/monsterChibi');
        const { MONSTER_VISUALS } = await import('@/lib/game/iso/monsterSprites');
        if (cancelled || !ref.current) return;

        // 6 planın temsilcisi: [type, plan label]
        const reps: [string, string][] = [
          ['skeleton', 'biped'],
          ['wolf', 'beast'],
          ['treant', 'blob'],
          ['ghost', 'flying'],
          ['venomous_hydra', 'serpent'], // gerçek snake-arch tipi ('snake' top-level key değil)
          ['__boss__', 'boss'],
        ];
        const sampleTypes = Object.keys(MONSTER_VISUALS).slice(0, 12);

        const PAD = 8, CELL_W = 64, CELL_H = 88, COLS = 6; // 88: big boss (~54px) + label sığar
        const repRows = Math.ceil(reps.length / COLS);
        const sampleRows = Math.ceil(sampleTypes.length / COLS);
        const canvasW = PAD * 2 + COLS * CELL_W;
        const canvasH = PAD * 2 + repRows * CELL_H + 24 + sampleRows * CELL_H + 24;

        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        canvas.style.width = `${canvasW * 3}px`;
        canvas.style.height = `${canvasH * 3}px`;
        canvas.style.imageRendering = 'pixelated';
        canvas.style.background = '#0d1319';
        ref.current.innerHTML = '';
        ref.current.appendChild(canvas);
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#0d1319';
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.font = '6px monospace';
        ctx.fillStyle = '#9fe8ff';
        ctx.fillText('6-plan reps (small + big, frame 0)', PAD, 8);

        reps.forEach(([type, plan], i) => {
          const col = i % COLS, row = Math.floor(i / COLS);
          const x = PAD + col * CELL_W;
          const y = PAD + 10 + row * CELL_H;
          const small = mkMonsterChibi(type, false);
          const big = mkMonsterChibi(type, true);
          ctx.drawImage(small.frames[0], x, y);
          ctx.drawImage(small.frames[1], x + small.frames[0].width + 2, y);
          ctx.drawImage(big.frames[0], x, y + 22);
          ctx.fillStyle = '#e8eef4';
          ctx.font = '6px monospace';
          ctx.fillText(`${plan}`, x, y + CELL_H - 2);
        });

        const sampleY = PAD + 10 + repRows * CELL_H + 12;
        ctx.fillStyle = '#9fe8ff';
        ctx.fillText('first 12 MONSTER_VISUALS (small, frame 0)', PAD, sampleY - 2);
        sampleTypes.forEach((type, i) => {
          const col = i % COLS, row = Math.floor(i / COLS);
          const x = PAD + col * CELL_W;
          const y = sampleY + 6 + row * CELL_H;
          const small = mkMonsterChibi(type, false);
          ctx.drawImage(small.frames[0], x, y);
          ctx.fillStyle = '#e8eef4';
          ctx.font = '6px monospace';
          ctx.fillText(type.slice(0, 10), x, y + 30);
        });

        console.log('monsterChibi grid: reps=', reps.length, 'samples=', sampleTypes.length);
        return;
      }

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
