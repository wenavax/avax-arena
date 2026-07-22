// frontend/app/tddev/layout.tsx — dev-only TD smoke harness (noindex)
import type { Metadata } from 'next';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function TdDevLayout({ children }: { children: React.ReactNode }) {
  return children;
}
