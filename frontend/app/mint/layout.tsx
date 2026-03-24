import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mint Warriors | Frostbite',
  description: 'Mint unique cyber warriors with random stats and elemental powers on Avalanche. Each warrior is a fully on-chain NFT ready for battle.',
  openGraph: {
    title: 'Mint Warriors | Frostbite',
    description: 'Mint unique cyber warriors with random stats and elemental powers on Avalanche.',
  },
};

export default function MintLayout({ children }: { children: React.ReactNode }) {
  return children;
}
