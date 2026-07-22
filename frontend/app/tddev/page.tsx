'use client';
// frontend/app/tddev/page.tsx — DEV-ONLY TD mount (Faz 5.1)
// Headless smoke hedefi: /world'ün WorldLoginGate'i cüzdan istediği ve eski
// /worldtestnet önizlemesi redirect'e döndüğü için gate'siz bir mount gerekiyor.
// Prod build'de 404 (NODE_ENV inlined) — canlıda rota etkisiz.
// z-99999 sarmalayıcı: kök layout chrome'u (ActivityTicker z-30 vb.) canvas'ı örtmesin.
import nextDynamic from 'next/dynamic';
import { notFound } from 'next/navigation';

const TdPhaserGame = nextDynamic(
  () => import('@/lib/game/td/TdPhaserGame').then(m => m.TdPhaserGame),
  { ssr: false },
);

export default function TdDevPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
      <TdPhaserGame mode="live" />
    </div>
  );
}
