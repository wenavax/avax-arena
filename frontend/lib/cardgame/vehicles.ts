/**
 * CAR(D) GAME — shared vehicle metadata + selection UI.
 *
 * Used by BOTH the practice (mount.ts) and staked (mountStaked.ts) renderers so
 * the "choose your vehicle each round" screen is identical, and so the rarity /
 * stat presentation lives in one place instead of scattered magic strings
 * (`veh[0]`, `spd ${s}`, hard-coded colours) across the two mount files.
 */
import { CFG, VEHICLES } from './engine';

export interface VehMeta { rarity: string; color: string; abbr: string; blurb: string }

/** Cosmetic metadata keyed by the engine's vehicle id. Stats (s/h) come from
 *  CFG.VEH so gameplay stays the single source of truth. */
export const VEH_META: Record<string, VehMeta> = {
  LEGENDARY: { rarity: 'LEGENDARY', color: '#f5c542', abbr: 'LEG', blurb: 'Top speed · biggest hand' },
  EPIC:      { rarity: 'EPIC',      color: '#a78bfa', abbr: 'EPI', blurb: 'Balanced speed & hand' },
  COMMON:    { rarity: 'COMMON',    color: '#8ea0b5', abbr: 'COM', blurb: 'Steady all-rounder' },
};

export const rarityClass = (v: string) => 'vr-' + (VEH_META[v]?.rarity.toLowerCase() ?? 'common');
export const vehAbbr = (v: string | null) => (v ? VEH_META[v]?.abbr ?? v.slice(0, 3) : '');
export const vehColor = (v: string | null) => (v ? VEH_META[v]?.color ?? '#8ea0b5' : '#8ea0b5');

/**
 * Build the vehicle-selection screen for one round. The player picks one of
 * their still-available vehicles; already-used ones render disabled with a USED
 * badge. `onPick` fires once with the chosen vehicle id.
 */
export function vehicleSelector(opts: {
  round: number;                  // 0-based round index
  used: Record<string, boolean>;  // the player's already-used vehicles
  onPick: (veh: string) => void;
  opponents?: string;             // optional preview line under the header
}): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'cg-vsel glass';
  const cards = VEHICLES.map((v) => {
    const m = VEH_META[v];
    const st = CFG.VEH[v];
    const used = !!opts.used[v];
    return `<button class="cg-vcard ${rarityClass(v)}${used ? ' used' : ''}" data-veh="${v}"${used ? ' disabled' : ''}>
      <span class="cg-vrar">${m.rarity}${used ? ' · USED' : ''}</span>
      <span class="cg-vname">${v}</span>
      <span class="cg-vstat"><span class="cg-vlab">SPEED</span><span class="cg-vbar"><i style="width:${st.s * 10}%"></i></span><b>${st.s}</b></span>
      <span class="cg-vstat"><span class="cg-vlab">HAND</span><span class="cg-vbar"><i style="width:${st.h * 10}%"></i></span><b>${st.h}</b></span>
      <span class="cg-vblurb">${m.blurb}</span>
    </button>`;
  }).join('');
  wrap.innerHTML = `<div class="cg-vsel-hd">
      <span class="cg-vsel-ttl">ROUND ${opts.round + 1}/${CFG.ROUNDS} — CHOOSE YOUR VEHICLE</span>
      ${opts.opponents ? `<span class="cg-vsel-opp">${opts.opponents}</span>` : ''}
    </div>
    <div class="cg-vsel-cards">${cards}</div>`;
  wrap.querySelectorAll<HTMLButtonElement>('.cg-vcard').forEach((el) => {
    if (el.disabled) return;
    el.onclick = () => opts.onPick(el.dataset.veh as string);
  });
  return wrap;
}
