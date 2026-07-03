// NOTE: Privy is now provided once at the app root (providers/Web3Provider.tsx).
// The World route must NOT re-wrap in its own PrivyProvider or the two would
// nest and break auth — it simply inherits the root Privy + wagmi context.

export default function WorldLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
      <style>{`
        /* ═══ WORLD PAGE: Full viewport takeover ═══ */

        /* Kill EVERYTHING in parent layout */
        .mesh-bg, .scanlines,
        nav, footer, aside,
        .hidden.lg\\:flex,
        .lg\\:hidden,
        [class*="ActivityTicker"],
        [class*="MobileTopBar"],
        [class*="ChainGuard"],
        [class*="MusicPlayer"],
        [class*="GameplayDemo"],
        [class*="ParticleBackground"] {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
          overflow: hidden !important;
        }

        /* ActivityTicker — force hide (fixed positioned, z-30) */
        .hidden.xl\\:flex.fixed.right-0 {
          display: none !important;
        }

        /* Kill ALL fixed elements except our game container and Privy modals */
        body > div > div > div.fixed:not([id*="privy"]):not([data-privy-dialog]) {
          display: none !important;
        }

        /* Remove max-width and all spacing from layout shell */
        .mx-auto.max-w-\\[1560px\\] {
          max-width: 100vw !important;
          width: 100vw !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        /* Content wrapper — nuke ALL margins including Tailwind responsive */
        .flex-1.min-w-0 {
          margin: 0 !important;
          margin-right: 0 !important;
          padding: 0 !important;
        }

        /* Explicitly override xl:mr-[280px] */
        @media (min-width: 1280px) {
          .flex-1.min-w-0 {
            margin-right: 0 !important;
          }
        }

        /* Main element — zero everything */
        main {
          padding: 0 !important;
          margin: 0 !important;
          position: static !important;
        }

        /* Body — no scroll, no overflow */
        html, body {
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        /* Privy modal — ensure visible on mobile */
        #privy-dialog,
        [data-privy-dialog],
        [class*="PrivyModal"],
        [class*="privy"],
        iframe[title*="privy"],
        #privy-modal-content {
          display: block !important;
          width: auto !important;
          height: auto !important;
          z-index: 9999999 !important;
          position: fixed !important;
          overflow: visible !important;
        }

        /* Privy overlay backdrop */
        [data-privy-dialog] + div,
        [class*="PrivyOverlay"] {
          z-index: 9999998 !important;
        }
      `}</style>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999,
        backgroundColor: '#0a0e1a',
        overflow: 'auto',
      }}>
        {children}
      </div>
    </>
  );
}
