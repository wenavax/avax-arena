// frontend/app/worldtestnet/layout.tsx
import type { Metadata } from 'next';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function WorldTestnetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
