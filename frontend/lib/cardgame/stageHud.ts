/**
 * CAR(D) GAME — in-stage HUD overlays, shared by all three modes.
 *
 * The 3D stage is the whole game screen, so the old side panels (scoreboard
 * table, event log) become translucent overlays layered over the scene:
 *   · top-left    — chip strip (round, seed, music, help… mode provides them)
 *   · top-right   — mini standings (racing-game position widget, 4 rows)
 *   · bottom-left — compact event log (last few lines; click to expand)
 *
 * Pure DOM, no game logic. Hosts call `rank()` per tick and `log()` on events.
 */

export interface HudRankRow {
  name: string;
  color: string;   // CSS colour for the seat dot
  value: string;   // right column (distance, points…)
  you?: boolean;
  fin?: boolean;
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

export function attachStageHud(host: HTMLElement): StageHud {
  const chips = document.createElement('div');
  chips.className = 'cg-hud-chips';

  const rankEl = document.createElement('div');
  rankEl.className = 'cg-hud-rank';

  const logEl = document.createElement('div');
  logEl.className = 'cg-hud-log';
  logEl.title = 'Event log — click to expand';
  logEl.onclick = () => logEl.classList.toggle('open');

  host.append(chips, rankEl, logEl);

  let lastSig = '';
  return {
    chips,
    rank(rows) {
      const sig = rows.map((r) => `${r.name}|${r.value}|${r.fin ? 1 : 0}`).join(';');
      if (sig === lastSig) return;
      lastSig = sig;
      rankEl.innerHTML = rows.map((r, i) =>
        `<div class="cg-hud-row${r.you ? ' you' : ''}${r.fin ? ' fin' : ''}">
          <b>${i + 1}</b><i style="background:${r.color}"></i>
          <span>${esc(r.name)}</span><em>${esc(r.value)}</em>
        </div>`).join('');
    },
    log(html) {
      const d = document.createElement('div');
      d.innerHTML = html;
      logEl.insertBefore(d, logEl.firstChild);
      while (logEl.childElementCount > 60) logEl.removeChild(logEl.lastElementChild!);
    },
    destroy() { chips.remove(); rankEl.remove(); logEl.remove(); },
  };
}
