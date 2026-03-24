import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Battle Arena | Frostbite',
  description: 'Challenge other players in 1v1 and 3v3 PvP NFT battles on Avalanche. Stake AVAX, exploit element advantages, and climb the rankings.',
  openGraph: {
    title: 'Battle Arena | Frostbite',
    description: 'PvP NFT battles on Avalanche — 1v1 and 3v3 with AVAX stakes.',
  },
};

export default function BattleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
