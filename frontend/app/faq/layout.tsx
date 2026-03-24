import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Frequently asked questions about Frostbite NFT Battle Arena on Avalanche.',
};
export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return children;
}
