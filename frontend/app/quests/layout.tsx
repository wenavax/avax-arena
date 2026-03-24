import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Quests | Frostbite',
  description: 'Send your warriors on PvE quests across 8 elemental zones. Complete tiers, defeat bosses, and earn XP on Avalanche.',
  openGraph: {
    title: 'Quests | Frostbite',
    description: 'PvE quests across 8 elemental zones — earn XP and advance tiers.',
  },
};

export default function QuestsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
