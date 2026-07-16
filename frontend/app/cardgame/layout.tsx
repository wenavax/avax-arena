import type { Viewport } from 'next';
import type { ReactNode } from 'react';

/* viewport-fit=cover: lets the fullscreen 3D stage extend under the notch /
 * home-indicator areas so env(safe-area-inset-*) paddings in cardgame.css can
 * keep the HUD and hand dock inside the safe area. Scoped to /cardgame only —
 * the rest of the site keeps the default viewport. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function CardgameLayout({ children }: { children: ReactNode }) {
  return children;
}
