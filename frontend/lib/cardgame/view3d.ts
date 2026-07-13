/**
 * CAR(D) GAME — shared 2D/3D view controller.
 *
 * Extracted from the practice renderer so ALL three modes (practice, staked,
 * multiplayer) share ONE implementation of: the lazy three.js load, the 2D↔3D
 * swap, native + iOS-fallback fullscreen, docking the hand/vehicle UI into the
 * fullscreened subtree, and forwarding per-tick car snapshots. The game logic is
 * untouched — this is a pure renderer swap.
 */
import type { Track3D, Seat3D, CarSnap } from './track3d';

export interface View3DConfig {
  /** The 3D container (must carry the `track3d` class for the fullscreen CSS). */
  host: HTMLElement;
  /** The 2D track element to hide while 3D is on. */
  track2d: HTMLElement;
  /** The "3D VIEW" toggle button. */
  toggleBtn: HTMLElement;
  /** The fullscreen button (typically inside `host`). Optional. */
  fsBtn?: HTMLElement | null;
  /** Build the seat list lazily (colours resolved from the live DOM at toggle). */
  buildSeats: () => Seat3D[];
  /** [element, className] pairs re-parented into `host` while fullscreen so the
   *  player can keep playing cards over the 3D scene. */
  dockItems?: () => Array<[HTMLElement | null, string]>;
  /** Optional log hook for the "3D unavailable" fallback message. */
  onLog?: (msg: string) => void;
  /** Called right after the 3D scene mounts — push a first frame here. */
  onReady?: () => void;
}

export interface View3D {
  is3D: () => boolean;
  forward: (cars: CarSnap[]) => void;
  destroy: () => void;
}

export function attachView3D(cfg: View3DConfig): View3D {
  let track3d: Track3D | null = null;
  let busy = false;
  let unmounted = false; // guards the async three.js load racing an unmount

  // ── fullscreen docking ──────────────────────────────────────────────
  const dockMarkers = new Map<HTMLElement, Comment>();
  function dockIntoFS(on: boolean) {
    for (const [el, cls] of cfg.dockItems?.() ?? []) {
      if (!el) continue;
      if (on) {
        if (dockMarkers.has(el)) continue;
        const marker = document.createComment('fs-dock');
        el.parentElement?.insertBefore(marker, el);
        dockMarkers.set(el, marker);
        cfg.host.appendChild(el);
        el.classList.add(cls);
      } else {
        const marker = dockMarkers.get(el);
        el.classList.remove(cls);
        if (marker?.parentNode) { marker.parentNode.insertBefore(el, marker); marker.remove(); }
        dockMarkers.delete(el);
      }
    }
  }
  const onFsChange = () => dockIntoFS(document.fullscreenElement === cfg.host);
  document.addEventListener('fullscreenchange', onFsChange);

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
        dockIntoFS(on);
      }
    };
  }

  // ── 2D/3D toggle (lazy-loads three.js on first use) ─────────────────
  cfg.toggleBtn.onclick = async () => {
    if (busy) return;
    if (track3d) {
      track3d.destroy(); track3d = null;
      cfg.host.style.display = 'none';
      cfg.track2d.style.display = '';
      cfg.toggleBtn.textContent = '🎥 3D VIEW';
      return;
    }
    busy = true;
    cfg.toggleBtn.textContent = '… LOADING 3D';
    try {
      const { createTrack3D } = await import('./track3d');
      const seats = cfg.buildSeats();
      cfg.host.style.display = 'block';
      const inst = await createTrack3D(cfg.host, seats);
      if (unmounted) { inst.destroy(); return; } // left while three.js loaded
      track3d = inst;
      cfg.track2d.style.display = 'none';
      cfg.toggleBtn.textContent = '🗺 2D VIEW';
      cfg.onReady?.();
    } catch {
      cfg.host.style.display = 'none';
      cfg.toggleBtn.textContent = '🎥 3D VIEW';
      cfg.onLog?.('3D view unavailable on this device');
    } finally { busy = false; }
  };

  return {
    is3D: () => !!track3d,
    forward: (cars) => track3d?.update(cars),
    destroy: () => {
      unmounted = true;
      track3d?.destroy(); track3d = null;
      document.removeEventListener('fullscreenchange', onFsChange);
      if (document.fullscreenElement === cfg.host) void document.exitFullscreen().catch(() => {});
      document.body.classList.remove('cg-noscroll');
    },
  };
}
