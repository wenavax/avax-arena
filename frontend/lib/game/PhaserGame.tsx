'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { GAME_WIDTH, GAME_HEIGHT } from './config';

export function PhaserGame() {
  const gameRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
  }, []);

  useEffect(() => {
    if (gameRef.current || !containerRef.current) return;
    let cancelled = false;

    // Only load core scenes at startup (4 instead of 23)
    Promise.all([
      import('phaser'),
      import('./scenes/BootScene'),
      import('./scenes/CharacterSelectScene'),
      import('./scenes/IsoWorldScene'),
      import('./scenes/HUDScene'),
    ]).then(([Phaser, Boot, CharSelect, IsoWorld, HUD]) => {
      // cancelled: unmounted while imports were in flight — creating the game now
      // would attach a detached canvas that nothing ever destroys
      if (cancelled || gameRef.current) return;

      // Store Phaser globally for sceneLoader to use
      (window as any).__Phaser = Phaser;

      const config: any = {
        type: Phaser.AUTO,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        parent: 'game-container',
        pixelArt: false,
        antialias: true,
        backgroundColor: '#0a0e1a',
        physics: {
          default: 'arcade',
          arcade: { gravity: { x: 0, y: 0 }, debug: false },
        },
        scene: [
          Boot.BootScene,
          CharSelect.CharacterSelectScene,
          IsoWorld.IsoWorldScene,
          HUD.HUDScene,
        ],
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          fullscreenTarget: 'game-container',
          expandParent: true,
        },
        input: {
          activePointers: 3,
        },
      };

      const game = new Phaser.Game(config);
      gameRef.current = game;

      // Store game instance globally for sceneLoader
      (window as any).__phaserGame = game;

      // Preload town bundle after game init (player will likely go to town first)
      import('./sceneLoader').then(({ loadTownBundle }) => {
        loadTownBundle(game);
      });
    });

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
      (window as any).__phaserGame = undefined;
      (window as any).__Phaser = undefined;
      // The music singleton runs on WebAudio intervals outside Phaser's lifecycle —
      // without this, zone music keeps playing after navigating away from /world.
      import('./musicSystem').then(({ music }) => music.stop()).catch(() => {});
    };
  }, []);

  // Track fullscreen state
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const game = gameRef.current;
    if (game?.scale) {
      if (game.scale.isFullscreen) {
        game.scale.stopFullscreen();
      } else {
        game.scale.startFullscreen();
      }
    }
  }, []);

  return (
    <div
      id="game-container"
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0e1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* Fullscreen button */}
      <button
        onClick={toggleFullscreen}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 60,
          background: 'rgba(0,0,0,0.6)',
          border: '1px solid rgba(0,229,255,0.3)',
          color: '#00e5ff',
          padding: '6px 12px',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 12,
          fontFamily: 'monospace',
        }}
      >
        {isFullscreen ? 'ESC: Exit' : 'F: Fullscreen'}
      </button>

      {/* Controls hint — only on desktop */}
      {!isMobile && (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            color: 'rgba(255,255,255,0.3)',
            fontSize: 11,
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
          }}
        >
          WASD: Move &nbsp; E: Interact &nbsp; I: Bag &nbsp; F: Fullscreen
        </div>
      )}
    </div>
  );
}
