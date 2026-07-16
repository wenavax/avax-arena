/**
 * CAR(D) GAME — shared 3D stage controller.
 *
 * ALL three modes (practice, staked, multiplayer) share ONE implementation of:
 * the lazy three.js load (started automatically at mount — 3D is the only track
 * view), native + iOS-fallback fullscreen, docking the hand/vehicle UI into the
 * stage as permanent overlays, and forwarding per-tick car snapshots. The game
 * logic is untouched — this is a pure renderer.
 *
 * When WebGL / three.js is unavailable (old devices, jsdom tests) the stage
 * shows a short note and the game keeps running: hand panel, popups, countdown
 * and the HUD overlays are plain DOM inside the same stage element.
 */
import type { Track3D, Seat3D, CarSnap } from './track3d';

export interface View3DConfig {
  /** The stage container (must carry the `track3d` class for the CSS). */
  host: HTMLElement;
  /** The fullscreen button (typically inside `host`). Optional. */
  fsBtn?: HTMLElement | null;
  /** Build the seat list lazily (colours resolved from the live DOM). */
  buildSeats: () => Seat3D[];
  /** [element, className] pairs re-parented into `host` at mount so the player
   *  plays cards over the 3D scene (the stage IS the game screen). */
  dockItems?: () => Array<[HTMLElement | null, string]>;
  /** Optional log hook for the "3D unavailable" fallback message. */
  onLog?: (msg: string) => void;
  /** Called right after the 3D scene mounts — push a first frame here. */
  onReady?: () => void;
}

export interface View3D {
  is3D: () => boolean;
  forward: (cars: CarSnap[]) => void;
  /** Round index (0-based) → per-round weather in the 3D scene. Cached, so it
   *  also applies when the scene finishes loading mid-match. */
  setRound: (round: number) => void;
  /** Impact feedback pass-throughs (no-ops until the scene is ready). */
  shake: (mag: number) => void;
  hitstop: (ms: number) => void;
  destroy: () => void;
}

export function attachView3D(cfg: View3DConfig): View3D {
  let track3d: Track3D | null = null;
  let unmounted = false; // guards the async three.js load racing an unmount
  let lastRound = 0;     // remembered so a late scene load gets the right weather
  let lastCars: CarSnap[] | null = null; // replayed once the scene is ready

  // ── permanent dock: the hand panel / vehicle selector / toast live INSIDE
  // the stage. Comment markers remember the original spots so destroy() can
  // put everything back (mode switches re-mount into the same page DOM).
  const dockMarkers = new Map<HTMLElement, Comment>();
  function dock() {
    for (const [el, cls] of cfg.dockItems?.() ?? []) {
      if (!el || dockMarkers.has(el)) continue;
      const marker = document.createComment('stage-dock');
      el.parentElement?.insertBefore(marker, el);
      dockMarkers.set(el, marker);
      cfg.host.appendChild(el);
      el.classList.add(cls);
    }
  }
  function undock() {
    for (const [el, cls] of cfg.dockItems?.() ?? []) {
      if (!el) continue;
      const marker = dockMarkers.get(el);
      el.classList.remove(cls);
      if (marker?.parentNode) { marker.parentNode.insertBefore(el, marker); marker.remove(); }
      dockMarkers.delete(el);
    }
  }
  dock();

  if (cfg.fsBtn) {
    cfg.fsBtn.onclick = (e) => {
      e.stopPropagation();
      const el = cfg.host;
      if (typeof el.requestFullscreen === 'function') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void el.requestFullscreen();
      } else {
        // iOS Safari: no element requestFullscreen → CSS pseudo-fullscreen
        const on = !el.classList.contains('cg-fs-fake');
        el.classList.toggle('cg-fs-fake', on);
        document.body.classList.toggle('cg-noscroll', on);
      }
    };
  }

  // ── start the 3D scene right away (three.js lazy chunk) ─────────────
  void (async () => {
    try {
      const { createTrack3D } = await import('./track3d');
      const seats = cfg.buildSeats();
      const inst = await createTrack3D(cfg.host, seats);
      if (unmounted) { inst.destroy(); return; } // left while three.js loaded
      track3d = inst;
      inst.setWeather(lastRound);
      if (lastCars) inst.update(lastCars);
      cfg.onReady?.();
    } catch {
      cfg.host.classList.add('cg-no3d');
      cfg.onLog?.('3D view unavailable on this device');
    }
  })();

  return {
    is3D: () => !!track3d,
    forward: (cars) => { lastCars = cars; track3d?.update(cars); },
    setRound: (round) => { lastRound = round; track3d?.setWeather(round); },
    shake: (mag) => track3d?.shake(mag),
    hitstop: (ms) => track3d?.hitstop(ms),
    destroy: () => {
      unmounted = true;
      track3d?.destroy(); track3d = null;
      undock();
      if (document.fullscreenElement === cfg.host) void document.exitFullscreen().catch(() => {});
      cfg.host.classList.remove('cg-fs-fake');
      document.body.classList.remove('cg-noscroll');
    },
  };
}
