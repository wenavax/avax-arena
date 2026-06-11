import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FrozenFriends — Social AI Pets on Base',
  description: 'Your pet has a personality and a social life. While you sleep, it makes friends, gets in arguments, gives gifts. Read its diary every morning.',
  openGraph: {
    title: 'FrozenFriends — Social AI Pets on Base',
    description: 'Your pet has a personality and a social life. Read its daily diary.',
    siteName: 'FrozenFriends',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FrozenFriends',
    description: 'Social AI pets on Base.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
