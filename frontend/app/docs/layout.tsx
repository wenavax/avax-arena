import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documentation | Frostbite',
  description: 'Learn how Frostbite works — warrior stats, element system, battle mechanics, quests, marketplace, and smart contracts on Avalanche.',
  openGraph: {
    title: 'Documentation | Frostbite',
    description: 'Complete guide to Frostbite mechanics, battles, and marketplace.',
  },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
