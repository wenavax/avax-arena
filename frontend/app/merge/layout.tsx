import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Warrior Fusion | Frostbite',
  description: 'Fuse two warriors into one stronger NFT. Burn the originals and mint a new warrior with boosted stats on Avalanche.',
  openGraph: {
    title: 'Warrior Fusion | Frostbite',
    description: 'Fuse two warriors into a stronger NFT with boosted stats.',
  },
};

export default function MergeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
