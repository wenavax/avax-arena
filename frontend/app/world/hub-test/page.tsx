// frontend/app/world/hub-test/page.tsx
'use client';
/* GEÇİCİ World Hub test harness'ı — login gate'siz PhaserGame + GameOverlay.
 * Task 7'de SİLİNİR. */
import nextDynamic from 'next/dynamic';
import { GameOverlay } from '@/components/game/GameOverlay';

const PhaserGame = nextDynamic(() => import('@/lib/game/PhaserGame').then(m => m.PhaserGame), { ssr: false });

export default function HubTestPage() {
  return (<><PhaserGame /><GameOverlay /></>);
}
