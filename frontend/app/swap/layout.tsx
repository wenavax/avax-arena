import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Swap | Frostbite',
  description: 'Trade tokens on Avalanche C-Chain powered by 0x',
};

export default function SwapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
