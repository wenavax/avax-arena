/**
 * CAR(D) GAME — race audio: quiet Frostbite background music, plus a victory
 * fanfare when the player WINS the match (user request 2026-07-10). The
 * synthesized F1 engine was cut by user decision ("sadece fon müziği olsun").
 *
 * Music reuses the site's Frostbite tracks (/avalanche/music/track*.mp3 — the
 * basePath prefix must be manual for public assets) looped at low volume while
 * a round runs.
 *
 * Pure view-layer: never touches match state or the engine. Safe under jsdom /
 * SSR — everything guarded, never throws. The on/off toggle persists in
 * localStorage and is shared by all three modes.
 */

const KEY = 'cg_sound'; // '1' on (default) | '0' off
const MUSIC_TRACKS = [1, 2, 3, 4, 5, 6].map((n) => `/avalanche/music/track${n}.mp3`);
const MUSIC_VOL = 0.22; // "kısık" — background level

export interface CgSound {
  /** Race running → music playing (idempotent). */
  raceOn(on: boolean): void;
  /** Short victory fanfare — only fired when the PLAYER wins the match. */
  victory(): void;
  /** Countdown beep: n=3/2/1 short tick, n=0 the higher "GO!" tone. */
  count(n: number): void;
  enabled(): boolean;
  /** Flip on/off, persist, apply immediately. Returns the new state. */
  toggle(): boolean;
  destroy(): void;
}

export function createCgSound(): CgSound {
  const W = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null;
  const AC = (W?.AudioContext || W?.webkitAudioContext) as (new () => AudioContext) | undefined;
  let on = true;
  try { on = localStorage.getItem(KEY) !== '0'; } catch { /* private mode */ }

  let ctx: AudioContext | null = null; // lazily created, only for the fanfare
  let music: HTMLAudioElement | null = null;
  let running = false;
  let dead = false;

  function apply() {
    const audible = on && running && !dead;
    if (audible) {
      if (!music) {
        try {
          music = new Audio(MUSIC_TRACKS[Math.floor(Math.random() * MUSIC_TRACKS.length)]);
          music.loop = true; music.volume = MUSIC_VOL;
        } catch { music = null; }
      }
      try { music?.play()?.catch(() => { /* autoplay gate — next gesture retries */ }); } catch { /* jsdom */ }
    } else {
      try { music?.pause(); } catch { /* jsdom */ }
    }
    if (W) W.__cgSound = { get music() { return !!music && !music.paused; }, on };
  }

  /** Lazily create/resume the shared AudioContext; null when muted/impossible. */
  function ensureCtx(): AudioContext | null {
    if (dead || !on || !AC) return null;
    try {
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume().catch(() => { /* pre-gesture */ });
      return ctx;
    } catch { return null; }
  }
  function note(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, vol: number) {
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
    g.gain.setValueAtTime(vol, at + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(c.destination); o.start(at); o.stop(at + dur + 0.02);
  }

  return {
    raceOn(v: boolean) {
      if (dead || running === v) return;
      running = v;
      apply();
    },
    victory() {
      const c = ensureCtx(); if (!c) return;
      try {
        const t0 = c.currentTime + 0.05;
        // classic win fanfare: C-E-G-C6 run, echo, then held C6 over a C-major chord
        const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;
        [[C5, 0, 0.14], [E5, 0.12, 0.14], [G5, 0.24, 0.14], [C6, 0.36, 0.32]]
          .forEach(([f, at, d]) => note(c, f, t0 + at, d, 'square', 0.14));
        note(c, G5, t0 + 0.72, 0.14, 'square', 0.13);
        note(c, C6, t0 + 0.88, 0.9, 'square', 0.15);
        [261.63, 329.63, 392].forEach((f) => note(c, f, t0 + 0.88, 1.0, 'triangle', 0.09)); // chord bed
        note(c, C6 * 2, t0 + 0.88, 0.5, 'triangle', 0.05); // sparkle
      } catch { /* never break the finish flow */ }
    },
    count(n: number) {
      const c = ensureCtx(); if (!c) return;
      try {
        const t0 = c.currentTime + 0.02;
        if (n > 0) note(c, 660, t0, 0.13, 'square', 0.16);           // 3·2·1 tick
        else { note(c, 880, t0, 0.42, 'square', 0.18); note(c, 1108.73, t0, 0.42, 'triangle', 0.08); } // GO!
      } catch { /* never break the start flow */ }
    },
    enabled() { return on; },
    toggle() {
      on = !on;
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
      apply();
      return on;
    },
    destroy() {
      dead = true;
      try { music?.pause(); music = null; } catch { /* ignore */ }
      try { ctx?.close(); } catch { /* ignore */ }
      try { if (W) delete W.__cgSound; } catch { /* ignore */ }
      ctx = null;
    },
  };
}

/** Label for the shared 🔊 toggle chip/button. */
export function soundLabel(on: boolean): string { return on ? '🎵 MUSIC' : '🔇 MUTED'; }
