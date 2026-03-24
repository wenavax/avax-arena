import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Marketplace | Frostbite',
  description: 'Buy and sell Frostbite warriors on the decentralized NFT marketplace. Fixed-price listings, auctions, and offers powered by Avalanche.',
  openGraph: {
    title: 'Marketplace | Frostbite',
    description: 'Decentralized NFT marketplace for Frostbite warriors on Avalanche.',
  },
};

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
