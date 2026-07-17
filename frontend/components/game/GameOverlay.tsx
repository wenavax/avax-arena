// frontend/components/game/GameOverlay.tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { HUB_GAMES, HubGame } from '@/lib/game/hub/hubGames';

/* World Hub overlay: Phaser 'hub-open-game' event'iyle açılır, oyunu
 * same-origin iframe'de (?embed=1) çalıştırır. Kapanınca iframe DOM'dan
 * tamamen sökülür ve 'hub-overlay-closed' yayınlanır (sahne resume eder).
 * basePath tuzağı: iframe src elle /avalanche önekli. */

const CLOSE_MS = 150;

const OVERLAY_STYLE_ID = 'hub-overlay-anim-styles';
const OVERLAY_STYLE_CSS = `
@keyframes hubOverlayBackdropIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes hubOverlayBackdropOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes hubOverlayPanelIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes hubOverlayPanelOut {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0.6; transform: scale(0.98); }
}
@keyframes hubOverlayLoadingOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes hubOverlaySpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes hubOverlayDotPulse {
  0%, 80%, 100% { opacity: .25; transform: scale(.85); }
  40% { opacity: 1; transform: scale(1); }
}
`;

function ensureOverlayStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(OVERLAY_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = OVERLAY_STYLE_ID;
  style.textContent = OVERLAY_STYLE_CSS;
  document.head.appendChild(style);
}

export function GameOverlay() {
  const [game, setGame] = useState<HubGame | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showLoadingLayer, setShowLoadingLayer] = useState(true);

  useEffect(() => {
    ensureOverlayStyles();
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent).detail?.gameId as string;
      const g = HUB_GAMES.find(x => x.id === id);
      if (!g) return;
      setClosing(false);
      setGame(prev => {
        if (prev?.id === g.id) return prev; // zaten açık — watchdog'u yeniden kurma
        setLoaded(false); setFailed(false); setShowLoadingLayer(true);
        return g;
      });
      window.dispatchEvent(new CustomEvent('hub-overlay-opened'));
    };
    window.addEventListener('hub-open-game', onOpen);
    return () => window.removeEventListener('hub-open-game', onOpen);
  }, []);

  // iframe 10 sn'de load vermezse fallback — başlık çubuğu bizde, kilitlenmez
  useEffect(() => {
    if (!game || loaded || failed) return;
    const t = setTimeout(() => setFailed(true), 10000);
    return () => clearTimeout(t);
  }, [game, loaded, failed]);

  // loaded olunca yükleme katmanını hemen kaldırma — 250ms fade-out'u oynat, sonra söküp DOM'dan çıkar
  useEffect(() => {
    if (!loaded) { setShowLoadingLayer(true); return; }
    const t = setTimeout(() => setShowLoadingLayer(false), 250);
    return () => clearTimeout(t);
  }, [loaded]);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setGame(null);
      setClosing(false);
      window.dispatchEvent(new CustomEvent('hub-overlay-closed'));
    }, CLOSE_MS);
  }, []);

  if (!game) return null;
  const src = `/avalanche${game.url}${game.url.includes('?') ? '&' : '?'}embed=1`;

  return (
    <div data-testid="hub-overlay" role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(4,8,16,.96)',
      display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
      paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)',
      animation: closing
        ? `hubOverlayBackdropOut ${CLOSE_MS}ms ease-in forwards`
        : 'hubOverlayBackdropIn 200ms ease-out',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0,
        animation: closing
          ? `hubOverlayPanelOut ${CLOSE_MS}ms ease-in forwards`
          : 'hubOverlayPanelIn 220ms ease-out',
      }}>
        <div style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', background: '#0d1420',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 8,
              background: `${game.accent}26`, fontSize: 14, lineHeight: 1,
            }}>{game.icon}</span>
            <span style={{ color: game.accent, fontWeight: 700, fontFamily: 'monospace', fontSize: 14 }}>
              {game.name}
            </span>
          </span>
          <button
            data-testid="hub-close"
            onClick={close}
            aria-label="Close"
            onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.2)'; }}
            onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.14)'; }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.14)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.08)'; }}
            style={{
              background: 'rgba(255,255,255,.08)', color: '#cde', border: 0, borderRadius: 8,
              width: 44, height: 44, fontSize: 18, cursor: 'pointer',
              transition: 'background 120ms ease-out',
            }}>✕</button>
          <div aria-hidden style={{
            position: 'absolute', left: 0, right: 0, bottom: -1, height: 2,
            background: `linear-gradient(90deg, ${game.accent}, transparent)`,
          }} />
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          {failed ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#8899aa', fontFamily: 'monospace' }}>
              <span>Game failed to load.</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setFailed(false); setLoaded(false); }}
                  style={{ background: game.accent, color: '#000', border: 0, borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>RETRY</button>
                <a href={src} target="_blank" rel="noreferrer"
                  style={{ color: '#4dd0e1', alignSelf: 'center' }}>Open as page →</a>
              </div>
            </div>
          ) : (
            <>
              <iframe src={src} title={game.name} onLoad={() => setLoaded(true)} allow="clipboard-write; fullscreen"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, background: '#0a0e1a' }} />
              {showLoadingLayer && !failed && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 14,
                  background: '#0a0e1a', pointerEvents: 'none',
                  animation: loaded ? 'hubOverlayLoadingOut 250ms ease-out forwards' : undefined,
                }}>
                  <span style={{ fontSize: 40, lineHeight: 1 }}>{game.icon}</span>
                  <span style={{ color: game.accent, fontWeight: 700, fontFamily: 'monospace', fontSize: 15, letterSpacing: 0.5 }}>
                    {game.name}
                  </span>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%',
                    border: `2.5px solid ${game.accent}33`, borderTopColor: game.accent,
                    animation: 'hubOverlaySpin 800ms linear infinite',
                  }} />
                  <span style={{ display: 'flex', gap: 5 }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{
                        width: 5, height: 5, borderRadius: '50%', background: game.accent,
                        animation: `hubOverlayDotPulse 1.1s ease-in-out ${i * 0.15}s infinite`,
                      }} />
                    ))}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
