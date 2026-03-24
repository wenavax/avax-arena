import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Rankings | Frostbite',
  description: 'View the top Frostbite warriors and players ranked by ELO rating, win streaks, and battle stats on Avalanche.',
  openGraph: {
    title: 'Rankings | Frostbite',
    description: 'Top warriors and players ranked by ELO, win streaks, and battle stats.',
  },
};

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
