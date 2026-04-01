import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agents | Frostbite',
  description: 'Manage your warrior agents, wallets, and reputation on Frostbite.',
};

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
