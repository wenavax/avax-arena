/**
 * CAR(D) GAME — combo "juice": Balatro-style sequential play scoring.
 *
 * When the LOCAL player's play lands, the played cards pop in one-by-one over
 * the stage with a rising note each, a running multiplier ticks up per card,
 * and the final combo name hits with a magnitude-scaled camera shake (+ a brief
 * render hit-stop on the big tiers). Ability callouts follow, sequenced.
 *
 * Purely cosmetic and completely detached from the game state: the boost was
 * already applied by the engine the moment the play was accepted — this only
 * narrates it. Under prefers-reduced-motion (or jsdom, where matchMedia is
 * absent) it falls back to the classic instant popup, so tests and motion-
 * sensitive players get the exact pre-juice behaviour.
 */

export interface JuiceCard { value: number; magic: string | null }

export interface JuiceOpts {
  /** The stage element (.track3d) the overlay/popups render into. */
  host: HTMLElement;
  /** The played cards, in hand order. */
  cards: JuiceCard[];
  /** Final combo label (combo name or kind) and multiplier. */
  label: string;
  mult: number;
  /** Colour tier class for the final popup (fx-val/ice/epic/nitro/max). */
  fxCls: string;
  /** Fired ability lines — shown as the smaller pop-ab popups, sequenced last. */
  abilities?: string[];
  sound?: { comboNote(i: number): void; impact(tier: number): void };
  fx?: { shake(mag: number): void; hitstop(ms: number): void };
}

/** Impact tier by magnitude: 0 small · 1 mid · 2 big (four-of-a-kind league). */
export function juiceTier(label: string, mult: number): number {
  if (mult >= 2.5 || label === 'FOUR_OF_A_KIND' || label === 'TWO_TRIOS') return 2;
  if (mult >= 1.6) return 1;
  return 0;
}

const SHAKE_MAG = [0.03, 0.09, 0.2];
const STEP_MS = 150;   // per-card reveal cadence
const MAGIC_ICON: Record<string, string> = { NITRO: '⚡', NAIL: '✕', OIL: '●' };

// module-level timer registry so a mode unmount can cancel an in-flight sequence
const timers = new Set<ReturnType<typeof setTimeout>>();
function after(ms: number, fn: () => void) {
  const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
  timers.add(t);
}
export function cancelComboJuice(): void {
  for (const t of timers) clearTimeout(t);
  timers.clear();
}

function popup(host: HTMLElement, txt: string, cls: string) {
  const el = document.createElement('div');
  el.className = 'popup ' + cls;
  el.textContent = txt;
  host.appendChild(el);
  after(1400, () => el.remove());
}

export function comboJuice(o: JuiceOpts): void {
  const reduced = typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tier = juiceTier(o.label, o.mult);
  const finale = () => {
    popup(o.host, `${o.label} ×${o.mult.toFixed(2)}`, o.fxCls);
    o.sound?.impact(tier);
    o.fx?.shake(SHAKE_MAG[tier]);
    if (tier >= 2) o.fx?.hitstop(70);
    (o.abilities ?? []).forEach((txt, i) => after(420 + i * 300, () => popup(o.host, txt, 'pop-ab')));
  };

  // instant path: reduced motion, jsdom, or a single card (nothing to sequence)
  if (reduced || o.cards.length <= 1) { finale(); return; }

  const wrap = document.createElement('div');
  wrap.className = 'cg-jz';
  const cardsEl = document.createElement('div');
  cardsEl.className = 'cg-jz-cards';
  const multEl = document.createElement('div');
  multEl.className = 'cg-jz-mult';
  multEl.textContent = '×1.00';
  wrap.append(cardsEl, multEl);
  o.host.appendChild(wrap);

  const n = o.cards.length;
  o.cards.forEach((c, i) => {
    after(i * STEP_MS, () => {
      const el = document.createElement('div');
      el.className = 'cg-jz-card on' + (c.magic ? ' m-' + c.magic.toLowerCase() : '') + (c.value >= 9 ? ' m-hi' : '');
      el.textContent = c.magic ? MAGIC_ICON[c.magic] ?? String(c.value) : String(c.value);
      cardsEl.appendChild(el);
      // running total: interpolate 1.00 → final so every card visibly "adds"
      multEl.textContent = '×' + (1 + (o.mult - 1) * ((i + 1) / n)).toFixed(2);
      multEl.classList.remove('tick'); void multEl.offsetWidth; multEl.classList.add('tick');
      o.sound?.comboNote(c.magic ? i + 3 : i); // magic cards ring higher
    });
  });
  after(n * STEP_MS + 180, () => { wrap.remove(); finale(); });
}
