/**
 * CAR(D) GAME — SAMPLE-based engine sound (Google Racer pattern): six CC0
 * recordings of the SAME engine at rising pitches, crossfaded + fine-pitched
 * with playbackRate. Replaces the rejected live-synth engine ("doesn't sound
 * like a car") — only short transients (gear shift, blow-off, overrun crackle)
 * are synthesized, because transients synth well.
 *
 * Assets: /avalanche/cardgame/audio/loop0..5.m4a (~0.86s mono loops; the
 * basePath prefix must be manual for public assets). We anchor on loops
 * 0/2/4/5 and bend between anchors with playbackRate (~0.85..1.3).
 *
 * Pure view-layer: never touches match state or the engine. Safe under jsdom /
 * SSR — everything guarded, never throws into the game loop. Toggle persists
 * in localStorage ('cg_engine'), independent from the music toggle.
 */

const KEY = 'cg_engine'; // '1' on (default) | '0' off
const LOOP_URL = (n: number) => `/avalanche/cardgame/audio/loop${n}.m4a`;
const ANCHOR_LOOPS = [0, 2, 4, 5]; // which of the six files we actually play
// F1 character (ear-test round 2: "make it sound like an F1 car"):
// road-car loops pitched into the F1 register + an rpm-tracking scream layer
const GEARS = 8;             // F1 gearbox — faster, denser shift ladder
const F1_PITCH = 1.8;        // global playbackRate multiplier into the F1 register
const WHINE_BASE = 340;      // scream-layer fundamental at idle (Hz)
const WHINE_SPAN = 860;      // …rising to ~1.2kHz at redline (≈ V10 firing freq)
const WHINE_VOL = 0.22;      // relative within the engine master (masked by loops)
                             // — the 1kHz scream region is ear-sensitive; ear-test
                             // round 3 ("motor çok belirgin") pulled it back
const MASTER_VOL = 0.13;     // engine bed clearly UNDER the music (0.22): the F1
                             // brightness + scream layer raised perceived loudness,
                             // so the fader dropped again (ear-test round 3)
const TICK_TC = 0.09;        // setTargetAtTime time constant (~60-120ms) — no zipper
const LP_STEADY = 7500;      // F1 register is bright — keep more top end
const LP_OPEN = 12000;       // accel / boost opens to full scream
const LP_DECEL = 3800;       // hard decel closes it (still brighter than a road car)
const DECEL_HARD = -0.35;    // d(speed01)/dt below this = hard decel
const DECEL_GAIN = 0.63;     // ~-4 dB dip while decelerating hard
const WOBBLE = 0.02;         // ±2% playbackRate anti-fatigue wobble

/* ------------------------------------------------------------------ */
/* Pure math — exported for tests                                      */
/* ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Virtual gear index 0..gears-1 from normalized speed. Monotone. */
export function gearOf(speed01: number, gears = GEARS): number {
  const s = clamp(speed01, 0, 1);
  return Math.min(gears - 1, Math.floor(s * gears));
}

/**
 * Sawtooth rpm 0..1 within each gear: revs from ~0.25 up to ~1.0 across the
 * gear's speed span, then snaps back down on upshift (the pitch drop is the
 * arcade feel). Always within [0.2, 1.05].
 */
export function gearRpm(speed01: number, gears = GEARS): number {
  const s = clamp(speed01, 0, 1);
  const g = gearOf(s, gears);
  const frac = clamp(s * gears - g, 0, 1); // 0..1 inside the gear
  return 0.25 + 0.75 * frac;
}

/**
 * Per-loop crossfade gains for n anchors evenly spaced over rpm 0..1.
 * Each loop ramps up to its anchor, holds to ~1.3× the anchor, then decays
 * over one anchor step. Normalized so the weights sum to 1.
 */
export function loopWeights(rpmNorm: number, n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [1];
  const r = clamp(rpmNorm, 0, 1.1);
  const step = 1 / (n - 1);
  const raw: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * step;                       // anchor rpm of this loop
    const rampStart = a - step;               // rises from the previous anchor
    const holdEnd = Math.max(a * 1.3, a + 0.02);
    const decayEnd = holdEnd + step;
    let v: number;
    if (r <= a) v = clamp((r - rampStart) / (a - rampStart), 0, 1);
    else if (r <= holdEnd) v = 1;
    else v = clamp(1 - (r - holdEnd) / (decayEnd - holdEnd), 0, 1);
    raw.push(v);
  }
  const sum = raw.reduce((x, y) => x + y, 0);
  return sum > 0 ? raw.map((v) => v / sum) : raw.map((_, i) => (i === 0 ? 1 : 0));
}

/**
 * playbackRate fine-tune for the loop anchored at anchorIdx (of n even
 * anchors): 1.0 exactly on the anchor, bending ~0.85..1.3 between anchors so
 * pitch tracks rpm continuously across the crossfade.
 */
export function rateFor(rpmNorm: number, anchorIdx: number, n: number): number {
  const step = n > 1 ? 1 / (n - 1) : 1;
  const a = n > 1 ? anchorIdx * step : 0.5;
  const d = (clamp(rpmNorm, 0, 1.1) - a) / step; // distance in anchor units
  return clamp(Math.pow(1.28, d), 0.85, 1.3);
}

/* ------------------------------------------------------------------ */
/* Runtime                                                             */
/* ------------------------------------------------------------------ */

export interface EngineAudio {
  /** Per-tick state for the player car; cheap, callable at 10Hz. */
  setState(s: { speed01: number; boosted: boolean; fin: boolean }): void;
  /** Race running gate (also starts lazy asset load + ctx resume). */
  raceOn(on: boolean): void;
  enabled(): boolean;
  /** Toggle + persist. Independent from the music toggle. */
  toggle(): boolean;
  destroy(): void;
}

export function createEngineAudio(): EngineAudio {
  const W = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null;
  const D = typeof document !== 'undefined' ? document : null;
  const AC = (W?.AudioContext || W?.webkitAudioContext) as (new () => AudioContext) | undefined;
  const N_ANCHORS = ANCHOR_LOOPS.length;

  let on = true;
  try { on = localStorage.getItem(KEY) !== '0'; } catch { /* private mode / node */ }

  let ctx: AudioContext | null = null;
  let buffers: (AudioBuffer | null)[] | null = null; // decoded anchor loops
  let loading = false;
  let running = false;
  let dead = false;
  let hidden = false;

  // graph (built once buffers land)
  let sources: AudioBufferSourceNode[] = [];
  let loopGains: GainNode[] = [];
  let lowpass: BiquadFilterNode | null = null;
  let master: GainNode | null = null;
  let comp: DynamicsCompressorNode | null = null;
  let lfo: OscillatorNode | null = null;
  let whine: OscillatorNode[] = [];      // F1 scream layer (2 detuned saws)
  let whineGain: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null; // shared white noise for one-shots

  // per-tick state
  let rpm = 0.25;            // smoothed rpm we actually voice
  let prevSpeed = 0;
  let prevGear = 0;
  let prevBoost = false;
  let finished = false;
  let haveTick = false;
  let nextCrackleAt = 0;

  function ensureCtx(): AudioContext | null {
    if (dead || !on || !AC) return null;
    try {
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume().catch(() => { /* pre-gesture */ });
      return ctx;
    } catch { return null; }
  }

  function decode(c: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
    return new Promise((res, rej) => {
      try { c.decodeAudioData(data, res, rej); } catch (e) { rej(e); }
    });
  }

  /** Kill the loop-seam click for real: trim the AAC encoder priming/padding,
   *  then crossfade the loop's TAIL into its HEAD inside the decoded buffer —
   *  the wrap point becomes sample-continuous no matter what the codec did.
   *  (Ear-test feedback: loopStart/loopEnd trimming alone still ticked.) */
  function seamless(c: AudioContext, b: AudioBuffer): AudioBuffer {
    try {
      const sr = b.sampleRate;
      const start = Math.min(Math.floor(0.06 * sr), b.length >> 2);
      const end = b.length - Math.min(Math.floor(0.03 * sr), b.length >> 3);
      const L = end - start;
      const F = Math.min(Math.floor(0.045 * sr), L >> 2); // ~45ms equal fade
      if (L - F < sr * 0.2) return b; // too short to surgery — keep as-is
      const out = c.createBuffer(b.numberOfChannels, L - F, sr);
      for (let ch = 0; ch < b.numberOfChannels; ch++) {
        const s = b.getChannelData(ch);
        const o = out.getChannelData(ch);
        for (let i = 0; i < L - F; i++) o[i] = s[start + i];
        // head = blend of (what naturally follows the last sample) → (real head)
        for (let i = 0; i < F; i++) {
          const w = i / F;
          o[i] = o[i] * w + s[start + (L - F) + i] * (1 - w);
        }
      }
      return out;
    } catch { return b; }
  }

  function load() {
    const c = ensureCtx();
    if (!c || loading || buffers) return;
    loading = true;
    Promise.all(ANCHOR_LOOPS.map(async (n) => {
      try {
        const r = await fetch(LOOP_URL(n));
        if (!r.ok) return null;
        return seamless(c, await decode(c, await r.arrayBuffer()));
      } catch { return null; }
    })).then((bufs) => {
      loading = false;
      if (dead) return;
      buffers = bufs;
      if (running && on) buildGraph();
    }).catch(() => { loading = false; });
  }

  function buildGraph() {
    const c = ensureCtx();
    if (!c || !buffers || sources.length) return;
    try {
      comp = c.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 6;
      comp.connect(c.destination);
      master = c.createGain();
      master.gain.value = 0.0001; // fade in via tick
      master.connect(comp);
      lowpass = c.createBiquadFilter();
      lowpass.type = 'lowpass'; lowpass.frequency.value = LP_STEADY; lowpass.Q.value = 0.5;
      lowpass.connect(master);
      lfo = c.createOscillator();
      lfo.frequency.value = 0.45; // slow anti-fatigue wobble
      const lfoGain = c.createGain();
      lfoGain.gain.value = WOBBLE;
      lfo.connect(lfoGain);
      // F1 scream layer: two detuned saws tracking the virtual firing frequency,
      // tucked UNDER the sample bed (the loops mask the synthetic timbre — a thin
      // masked layer works where full synthesis failed)
      whineGain = c.createGain();
      whineGain.gain.value = 0.0001;
      const whineHp = c.createBiquadFilter();
      whineHp.type = 'highpass'; whineHp.frequency.value = 500; whineHp.Q.value = 0.6;
      whineGain.connect(whineHp); whineHp.connect(master);
      whine = [c.createOscillator(), c.createOscillator()];
      whine[0].type = 'sawtooth'; whine[1].type = 'sawtooth';
      whine[0].detune.value = -7; whine[1].detune.value = 8; // shimmer
      for (const o of whine) { o.frequency.value = WHINE_BASE; o.connect(whineGain); o.start(); }
      for (let i = 0; i < buffers.length; i++) {
        const b = buffers[i];
        if (!b) { sources.push(null as unknown as AudioBufferSourceNode); loopGains.push(null as unknown as GainNode); continue; }
        const src = c.createBufferSource();
        // buffers were made seam-continuous at decode time → loop the whole thing
        src.buffer = b; src.loop = true;
        const g = c.createGain();
        g.gain.value = 0.0001;
        src.connect(g); g.connect(lowpass);
        try { lfoGain.connect(src.playbackRate); } catch { /* param connect unsupported */ }
        src.start();
        sources.push(src); loopGains.push(g);
      }
      lfo.start();
    } catch { teardownGraph(); }
  }

  function teardownGraph() {
    try { sources.forEach((s) => { try { s?.stop(); s?.disconnect(); } catch { /* ignore */ } }); } catch { /* ignore */ }
    try { loopGains.forEach((g) => { try { g?.disconnect(); } catch { /* ignore */ } }); } catch { /* ignore */ }
    try { lfo?.stop(); lfo?.disconnect(); } catch { /* ignore */ }
    try { whine.forEach((o) => { try { o.stop(); o.disconnect(); } catch { /* ignore */ } }); } catch { /* ignore */ }
    try { whineGain?.disconnect(); } catch { /* ignore */ }
    try { lowpass?.disconnect(); } catch { /* ignore */ }
    try { master?.disconnect(); } catch { /* ignore */ }
    try { comp?.disconnect(); } catch { /* ignore */ }
    sources = []; loopGains = []; lfo = null; whine = []; whineGain = null; lowpass = null; master = null; comp = null;
  }

  /** Shared white-noise buffer for the synthesized transients. */
  function noise(c: AudioContext): AudioBuffer | null {
    if (noiseBuf) return noiseBuf;
    try {
      const b = c.createBuffer(1, Math.floor(c.sampleRate * 0.35), c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseBuf = b;
      return b;
    } catch { return null; }
  }

  /** Bandpassed noise burst: gear shift / blow-off / crackle transients. */
  function burst(freq: number, q: number, attack: number, decay: number, vol: number) {
    const c = ensureCtx();
    if (!c || !master || hidden) return;
    try {
      const b = noise(c); if (!b) return;
      const t0 = c.currentTime + 0.005;
      const src = c.createBufferSource();
      src.buffer = b;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
      // through master: one-shots follow the engine volume/fades/mute too
      src.connect(bp); bp.connect(g); g.connect(master!);
      src.start(t0); src.stop(t0 + attack + decay + 0.05);
    } catch { /* cosmetic */ }
  }

  /** ~10ms 70Hz sine thump under the gear-shift click. */
  function thump() {
    const c = ensureCtx();
    if (!c || !master || hidden) return;
    try {
      const t0 = c.currentTime + 0.005;
      const o = c.createOscillator();
      o.type = 'sine'; o.frequency.value = 70;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.004); // ÷master ≈ old level
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.014);
      o.connect(g); g.connect(master!);
      o.start(t0); o.stop(t0 + 0.05);
    } catch { /* cosmetic */ }
  }

  // vols compensated for the master (0.2) they now route through — effective
  // loudness lands slightly under the old direct-to-comp levels, matching the
  // overall quieter mix the ear test asked for
  // F1 shifts are near-instant — shorter, brighter bark than a road-car shift
  const shiftClick = () => { burst(3800, 1.5, 0.004, 0.06, 0.8); thump(); };
  const blowOff = () => burst(1200, 0.9, 0.012, 0.28, 0.85);
  const crackle = () => burst(1000 + Math.random() * 2000, 2.5, 0.004, 0.03 + Math.random() * 0.03, 0.45 + Math.random() * 0.2);

  /** Push current rpm/gain/filter targets into the graph (smoothed). */
  function voice(accelHard: boolean, decelHard: boolean, boosted: boolean) {
    const c = ctx;
    if (!c || !master || !lowpass || !sources.length) return;
    try {
      const t = c.currentTime;
      const w = loopWeights(rpm, N_ANCHORS);
      for (let i = 0; i < N_ANCHORS; i++) {
        const src = sources[i], g = loopGains[i];
        if (!src || !g) continue;
        g.gain.setTargetAtTime(Math.max(0.0001, w[i]), t, TICK_TC);
        src.playbackRate.setTargetAtTime(rateFor(rpm, i, N_ANCHORS) * F1_PITCH, t, TICK_TC);
      }
      // scream layer: pitch tracks the virtual firing freq, level rises with rpm²
      // (clean at idle, screaming at redline), brighter still under boost
      if (whine.length && whineGain) {
        const f = WHINE_BASE + rpm * WHINE_SPAN;
        for (const o of whine) o.frequency.setTargetAtTime(f, t, TICK_TC);
        const wv = WHINE_VOL * rpm * rpm * (boosted ? 1.25 : 1);
        whineGain.gain.setTargetAtTime(Math.max(0.0001, wv), t, TICK_TC);
      }
      const cutoff = boosted || accelHard ? LP_OPEN : decelHard ? LP_DECEL : LP_STEADY;
      lowpass.frequency.setTargetAtTime(cutoff, t, TICK_TC * 1.5);
      let vol = MASTER_VOL;
      if (decelHard) vol *= DECEL_GAIN;
      if (finished || !running || !on || hidden) vol = 0.0001;
      master.gain.setTargetAtTime(Math.max(0.0001, vol),
        t, finished ? 0.35 : hidden ? 0.02 : !running || !on ? 0.05 : TICK_TC);
    } catch { /* never break the game loop */ }
  }

  function fadeOutFast() {
    try { master?.gain.setTargetAtTime(0.0001, ctx?.currentTime ?? 0, 0.04); } catch { /* ignore */ }
  }

  function onVis() {
    if (dead) return;
    hidden = !!D && D.visibilityState === 'hidden';
    if (hidden) fadeOutFast();
    else if (running && on && !finished) voice(false, false, false);
  }
  try { D?.addEventListener('visibilitychange', onVis); } catch { /* jsdom */ }

  return {
    setState(s: { speed01: number; boosted: boolean; fin: boolean }) {
      if (dead) return;
      try {
        const speed = clamp(Number.isFinite(s.speed01) ? s.speed01 : 0, 0, 1);
        const dt = 0.1; // 10Hz nominal tick
        const accel = haveTick ? (speed - prevSpeed) / dt : 0;
        const gear = gearOf(speed);
        const decelHard = accel < DECEL_HARD;
        const accelHard = accel > 0.25;

        // gear ladder: on upshift the rpm target snaps down + shift transient
        if (haveTick && gear > prevGear && !s.fin && running && on) shiftClick();
        // boost end → blow-off
        if (haveTick && prevBoost && !s.boosted && running && on && !s.fin) blowOff();

        let target = gearRpm(speed);
        if (s.boosted) target = Math.min(1.05, target + 0.15);

        // smooth rpm toward target; F1 revs fast — hard decel decays ~2× faster
        const k = target < rpm && decelHard ? 0.75 : 0.45;
        rpm = rpm + (target - rpm) * k;
        rpm = clamp(rpm, 0.2, 1.05);

        // overrun crackle while decelerating hard at high rpm
        if (decelHard && rpm > 0.6 && running && on && !s.fin && !hidden) {
          const now = Date.now();
          if (now >= nextCrackleAt) {
            crackle();
            nextCrackleAt = now + 80 + Math.random() * 220;
          }
        }

        if (s.fin && !finished) finished = true;
        prevSpeed = speed; prevGear = gear; prevBoost = s.boosted; haveTick = true;
        voice(accelHard, decelHard, s.boosted);
      } catch { /* never break the game loop */ }
    },
    raceOn(v: boolean) {
      if (dead || running === v) return;
      running = v;
      if (v) {
        finished = false; haveTick = false; rpm = 0.25; prevGear = 0; prevBoost = false;
        if (on) {
          load(); // lazy: ctx + fetch/decode on first race
          if (buffers && !sources.length) buildGraph();
          if (ctx?.state === 'suspended') { try { ctx.resume().catch(() => { /* gate */ }); } catch { /* ignore */ } }
        }
      } else {
        fadeOutFast();
      }
      if (W) W.__cgEngine = { on, running };
    },
    enabled() { return on; },
    toggle() {
      on = !on;
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
      if (on && running) {
        load();
        if (buffers && !sources.length) buildGraph();
        if (ctx?.state === 'suspended') { try { ctx.resume().catch(() => { /* gate */ }); } catch { /* ignore */ } }
        if (!finished) voice(false, false, false);
      } else {
        fadeOutFast();
      }
      if (W) W.__cgEngine = { on, running };
      return on;
    },
    destroy() {
      dead = true;
      try { D?.removeEventListener('visibilitychange', onVis); } catch { /* ignore */ }
      teardownGraph();
      try { ctx?.close(); } catch { /* ignore */ }
      ctx = null; buffers = null; noiseBuf = null;
      try { if (W) delete W.__cgEngine; } catch { /* ignore */ }
    },
  };
}

/** Label for the engine toggle chip/button. */
export function engineLabel(on: boolean): string { return on ? '🏎️ ENGINE' : '🔇 ENGINE'; }
