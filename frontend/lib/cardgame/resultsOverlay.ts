/** Full-screen race-results overlay shared by practice / staked / multiplayer.
 *  Purely cosmetic: mounts call showRaceResults() at match end and
 *  closeRaceResults() in their teardown. Appended into the fullscreen element
 *  when one is active (a fixed overlay outside it would be invisible). */

import { SEAT_SHAPE } from './stageHud';

export interface ResultRow {
  name: string;
  color: string;
  /** Seat id (P1..P4) → the colour-blind-safe shape mark next to the name. */
  pid?: string;
  you?: boolean;
  /** per-round points, e.g. [5,3,5] */
  rounds?: number[];
  total: number | string;
  /** formatted prize, e.g. "◆ 2.0" */
  prize: string;
}

let el: HTMLDivElement | null = null;
let showT: ReturnType<typeof setTimeout> | null = null;
let payStat = ''; // live payout-status line (survives the 1.8s build delay)

const MEDALS = ['🥇', '🥈', '🥉', '4th'];

function esc(sx: string): string {
  return sx.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export function closeRaceResults(): void {
  if (showT) { clearTimeout(showT); showT = null; }
  el?.remove();
  el = null;
}

/** Update the payout-status line on the results overlay AFTER it was shown —
 *  collapses the game outcome and the money outcome into one moment (the
 *  settle tx lands seconds after the finish). Trusted HTML only (our own
 *  templates). No-op if the player already closed the overlay; if the overlay
 *  is still in its entrance delay, the line lands when it builds. */
export function updateRaceResultsStatus(html: string): void {
  payStat = html;
  const t = el?.querySelector('.cg-results-paystat') as HTMLElement | null;
  if (t) { t.innerHTML = html; t.hidden = !html; }
}

export function showRaceResults(o: { rows: ResultRow[]; sim?: boolean; note?: string; delayMs?: number }): void {
  closeRaceResults();
  payStat = ''; // a new match starts a fresh settle story
  const build = () => {
    showT = null;
    const host = (document.fullscreenElement as HTMLElement | null) ?? document.body;
    el = document.createElement('div');
    el.className = 'cg-results';
    const winner = o.rows[0];
    el.innerHTML = `
      <div class="cg-results-card">
        <div class="cg-results-flag">🏁</div>
        <h3>RACE RESULTS</h3>
        <div class="cg-results-winner"><span style="color:${winner.color}">${esc(winner.name)}</span> wins the match!</div>
        <div class="cg-results-rows">
          ${o.rows.map((r, i) => `
            <div class="cg-results-row${r.you ? ' me' : ''}${i === 0 ? ' first' : ''}">
              <span class="crr-place">${MEDALS[i] ?? i + 1}</span>
              <span class="crr-name"><i class="crr-shp" style="color:${r.color}">${SEAT_SHAPE[r.pid ?? ''] ?? '●'}</i>${esc(r.name)}${r.you ? '<b class="crr-you">YOU</b>' : ''}</span>
              <span class="crr-rounds">${(r.rounds ?? []).map((p) => `<u>${p}</u>`).join('')}</span>
              <span class="crr-pts">${r.total}<small>pts</small></span>
              <span class="crr-prize">${esc(r.prize)}${o.sim ? '<small>SIM</small>' : ''}</span>
            </div>`).join('')}
        </div>
        <div class="cg-results-paystat"${payStat ? '' : ' hidden'}>${payStat}</div>
        ${o.note ? `<div class="cg-results-note">${esc(o.note)}</div>` : ''}
        <button type="button" class="cg-results-close">CONTINUE</button>
      </div>`;
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === el || t.closest('.cg-results-close')) closeRaceResults();
    });
    host.appendChild(el);
  };
  // let the finish moment breathe (confetti / orbit camera) before covering it
  showT = setTimeout(build, o.delayMs ?? 1800);
}
