// frontend/components/game/GameOverlay.tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { HUB_GAMES, HubGame } from '@/lib/game/hub/hubGames';

/* World Hub overlay: Phaser 'hub-open-game' event'iyle açılır, oyunu
 * same-origin iframe'de (?embed=1) çalıştırır. Kapanınca iframe DOM'dan
 * tamamen sökülür ve 'hub-overlay-closed' yayınlanır (sahne resume eder).
 * basePath tuzağı: iframe src elle /avalanche önekli. */
export function GameOverlay() {
  const [game, setGame] = useState<HubGame | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent).detail?.gameId as string;
      const g = HUB_GAMES.find(x => x.id === id);
      if (!g) return;
      setGame(prev => {
        if (prev?.id === g.id) return prev; // zaten açık — watchdog'u yeniden kurma
        setLoaded(false); setFailed(false);
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

  const close = useCallback(() => {
    setGame(null);
    window.dispatchEvent(new CustomEvent('hub-overlay-closed'));
  }, []);

  if (!game) return null;
  const src = `/avalanche${game.url}${game.url.includes('?') ? '&' : '?'}embed=1`;

  return (
    <div data-testid="hub-overlay" role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(4,8,16,.96)',
      display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
      paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', background: '#0d1420', borderBottom: `2px solid ${game.accent}`,
      }}>
        <span style={{ color: game.accent, fontWeight: 700, fontFamily: 'monospace', fontSize: 14 }}>
          {game.icon} {game.name}
        </span>
        <button data-testid="hub-close" onClick={close} aria-label="Close" style={{
          background: 'rgba(255,255,255,.08)', color: '#cde', border: 0, borderRadius: 8,
          width: 44, height: 44, fontSize: 18, cursor: 'pointer',
        }}>✕</button>
      </div>
      {failed ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#8899aa', fontFamily: 'monospace' }}>
          <span>Game failed to load.</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setFailed(false); setLoaded(false); }}
              style={{ background: game.accent, color: '#000', border: 0, borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>RETRY</button>
            <a href={src} target="_blank" rel="noreferrer"
              style={{ color: '#4dd0e1', alignSelf: 'center' }}>Open as page →</a>
          </div>
        </div>
      ) : (
        <iframe src={src} title={game.name} onLoad={() => setLoaded(true)} allow="clipboard-write; fullscreen"
          style={{ flex: 1, width: '100%', border: 0, background: '#0a0e1a' }} />
      )}
    </div>
  );
}
