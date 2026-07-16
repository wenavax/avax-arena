import nextDynamic from 'next/dynamic';

export const dynamic = 'force-dynamic';

const WorldLoginGate = nextDynamic(
  () => import('@/components/game/WorldLoginGate').then(m => m.WorldLoginGate),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center h-screen bg-[#0a0e1a]">
      <p className="font-mono text-cyan-400 animate-pulse text-lg">Loading...</p>
    </div>
  )}
);

export default function WorldPage() {
  return <WorldLoginGate />;
}
