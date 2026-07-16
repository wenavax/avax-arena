/**
 * CAR(D) GAME — in-stage HUD overlays, shared by all three modes.
 *
 * The 3D stage is the whole game screen, so the old side panels (scoreboard
 * table, event log) become translucent overlays layered over the scene:
 *   · top-left    — chip strip (round, seed, music, help… mode provides them)
 *   · top-right   — mini standings + track-progress strip (racing position widget)
 *   · right       — compact event log (last few lines; click to expand)
 *   · top-left #2 — big position badge (1ST/2ND…), the single most important
 *                   racing number; pops on change, gold when leading
 *   · centre      — "▲ 2ND!" overtake banner when the player gains a place
 *
 * Player identity is never colour-alone: every seat pairs its colour with a
 * fixed shape (P1 ▲ · P2 ● · P3 ■ · P4 ◆) across standings, progress dots and
 * the results overlay — colourblind-safe and instant to parse mid-race.
 *
 * Pure DOM, no game logic. Hosts call `rank()` per tick and `log()` on events.
 */

export const SEAT_SHAPE: Record<string, string> = { P1: '▲', P2: '●', P3: '■', P4: '◆' };
const POS_LABEL = ['1ST', '2ND', '3RD', '4TH'];

export interface HudRankRow {
  name: string;
  color: string;   // CSS colour for the seat mark
  value: string;   // right column (distance, points…) — fallback display
  you?: boolean;
  fin?: boolean;
  /** Seat id (P1..P4) → shape mark. Optional for backward compatibility. */
  pid?: string;
  /** Live race distance in engine units — enables the gap-to-leader column,
   *  the progress strip and the position badge. Omit on final/payout rows. */
  dist?: number;
  pts?: number;
}

export interface StageHudOpts {
  /** Fired when the local player's live race position changes (1-based). */
  onPosChange?: (pos: number, up: boolean) => void;
  /** Track length in engine units (progress strip scale). */
  goal?: number;
}

export interface StageHud {
  /** The chip strip element — the mode appends its own chips/buttons. */
  chips: HTMLElement;
  /** Replace the mini-standings rows (call per tick; cheap signature-diffed). */
  rank(rows: HudRankRow[]): void;
  /** Prepend one log line (HTML). Keeps the last 60; collapsed shows ~4. */
  log(html: string): void;
  destroy(): void;
}

const esc = (s: string) => s.replace(/</g, '&lt;');

export function attachStageHud(host: HTMLElement, opts: StageHudOpts = {}): StageHud {
  const goal = opts.goal ?? 1000;

  const chips = document.createElement('div');
  chips.className = 'cg-hud-chips';

  const rankEl = document.createElement('div');
  rankEl.className = 'cg-hud-rank';
  // progress strip lives INSIDE the standings widget so it inherits its
  // placement on every breakpoint (no new overlap surface to manage)
  const trkEl = document.createElement('div');
  trkEl.className = 'cg-hud-trk';
  const rowsEl = document.createElement('div');
  rowsEl.className = 'cg-hud-rows';
  rankEl.append(trkEl, rowsEl);
  const trkDots = new Map<string, HTMLElement>();

  const posEl = document.createElement('div');
  posEl.className = 'cg-hud-pos';

  const ovtEl = document.createElement('div');
  ovtEl.className = 'cg-hud-ovt';

  const logEl = document.createElement('div');
  logEl.className = 'cg-hud-log';
  logEl.title = 'Event log — click to expand';
  logEl.onclick = () => logEl.classList.toggle('open');

  host.append(chips, rankEl, posEl, ovtEl, logEl);

  let lastSig = '';
  let prevPos = -1;          // my last seen live position (0-based)
  let lastOvtAt = 0;         // banner cooldown
  let ovtT: ReturnType<typeof setTimeout> | null = null;

  function mark(row: HudRankRow): string {
    const shp = SEAT_SHAPE[row.pid ?? ''] ?? '●';
    return `<i class="cg-shp" style="color:${row.color}">${shp}</i>`;
  }

  return {
    chips,
    rank(rows) {
      rankEl.classList.add('on'); // widget shows once it has data (CSS-gated)
      const live = rows.some((r) => r.dist !== undefined);
      const leadDist = live ? Math.max(...rows.map((r) => r.dist ?? 0)) : 0;

      // ── standings rows (signature-diffed innerHTML) ──────────────────
      const sig = rows.map((r) => `${r.name}|${r.value}|${r.dist ?? ''}|${r.fin ? 1 : 0}`).join(';');
      if (sig !== lastSig) {
        lastSig = sig;
        rowsEl.innerHTML = rows.map((r, i) => {
          // live race: leader shows absolute distance, the rest show the gap —
          // "−123u" reads faster than raw distances (F1 delta convention)
          const val = (r.dist !== undefined && !r.fin)
            ? (i === 0 ? `${Math.round(r.dist)}u` : `−${Math.max(0, Math.round(leadDist - r.dist))}u`) + (r.pts !== undefined ? ` · ${r.pts}p` : '')
            : r.value;
          return `<div class="cg-hud-row${r.you ? ' you' : ''}${r.fin ? ' fin' : ''}">
            <b>${i + 1}</b>${mark(r)}
            <span>${esc(r.name)}</span><em>${esc(val)}</em>
          </div>`;
        }).join('');
      }

      // ── track-progress strip: 4 shape dots racing toward the flag ────
      if (live) {
        trkEl.classList.add('live');
        for (const r of rows) {
          const key = r.pid ?? r.name;
          let dot = trkDots.get(key);
          if (!dot) {
            dot = document.createElement('i');
            dot.textContent = SEAT_SHAPE[r.pid ?? ''] ?? '●';
            if (r.you) dot.classList.add('you');
            trkEl.appendChild(dot);
            trkDots.set(key, dot);
          }
          dot.style.color = r.color;
          dot.style.left = (Math.min(1, (r.dist ?? 0) / goal) * 94 + 3) + '%';
          dot.classList.toggle('fin', !!r.fin);
        }
      }

      // ── position badge + overtake banner (my live position only) ─────
      const myIdx = rows.findIndex((r) => r.you);
      if (live && myIdx >= 0) {
        posEl.textContent = POS_LABEL[myIdx] ?? `${myIdx + 1}TH`;
        posEl.classList.add('live');
        posEl.classList.toggle('p1', myIdx === 0);
        const settled = leadDist > 30; // ignore the start-grid shuffle
        if (prevPos >= 0 && myIdx !== prevPos && settled) {
          posEl.classList.remove('pop'); void posEl.offsetWidth; posEl.classList.add('pop');
          const up = myIdx < prevPos;
          const now = Date.now();
          if (up && !rows[myIdx].fin && now - lastOvtAt > 2000) {
            lastOvtAt = now;
            ovtEl.textContent = `▲ ${POS_LABEL[myIdx] ?? myIdx + 1}!`;
            ovtEl.classList.remove('on'); void ovtEl.offsetWidth; ovtEl.classList.add('on');
            if (ovtT) clearTimeout(ovtT);
            ovtT = setTimeout(() => ovtEl.classList.remove('on'), 1300);
          }
          opts.onPosChange?.(myIdx + 1, up);
        }
        if (prevPos < 0 || settled) prevPos = myIdx;
      }
    },
    log(html) {
      const d = document.createElement('div');
      d.innerHTML = html;
      logEl.insertBefore(d, logEl.firstChild);
      while (logEl.childElementCount > 60) logEl.removeChild(logEl.lastElementChild!);
    },
    destroy() {
      if (ovtT) clearTimeout(ovtT);
      chips.remove(); rankEl.remove(); posEl.remove(); ovtEl.remove(); logEl.remove();
    },
  };
}
