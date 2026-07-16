// ─── Ambient Music & Sound System ───
// Procedural music via Web Audio API — no external files needed
// Each zone has unique ambient soundscape generated in real-time

export type ZoneMusic = 'town' | 'forest' | 'dungeon' | 'ice_cave' | 'volcano' | 'battle' | 'boss' | 'none';

class MusicSystem {
  private ctx: AudioContext | null = null;
  private currentZone: ZoneMusic = 'none';
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private activeNodes: AudioNode[] = [];
  private activeTimers: number[] = [];
  private _volume = 0.3;
  private _muted = false;
  private initialized = false;

  get volume(): number { return this._volume; }
  get muted(): boolean { return this._muted; }

  init(): void {
    if (this.initialized) return;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._volume;
      this.masterGain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 1;
      this.musicGain.connect(this.masterGain);
      this.initialized = true;

      // Load saved preferences
      try {
        const saved = localStorage.getItem('frostbite_music');
        if (saved) {
          const d = JSON.parse(saved);
          this._volume = d.volume ?? 0.3;
          this._muted = d.muted ?? false;
          this.masterGain.gain.value = this._muted ? 0 : this._volume;
        }
      } catch {}
    } catch {}
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) {
      this.masterGain.gain.value = this._muted ? 0 : this._volume;
    }
    this.savePrefs();
  }

  toggleMute(): void {
    this._muted = !this._muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this._muted ? 0 : this._volume;
    }
    this.savePrefs();
  }

  private savePrefs(): void {
    try {
      localStorage.setItem('frostbite_music', JSON.stringify({ volume: this._volume, muted: this._muted }));
    } catch {}
  }

  play(zone: ZoneMusic): void {
    if (zone === this.currentZone) return;
    this.stop();
    this.init();
    if (!this.ctx || !this.musicGain) return;

    this.currentZone = zone;

    switch (zone) {
      case 'town': this.playTown(); break;
      case 'forest': this.playForest(); break;
      case 'dungeon': this.playDungeon(); break;
      case 'ice_cave': this.playIceCave(); break;
      case 'volcano': this.playVolcano(); break;
      case 'battle': this.playBattle(); break;
      case 'boss': this.playBoss(); break;
    }
  }

  stop(): void {
    this.currentZone = 'none';
    for (const timer of this.activeTimers) clearInterval(timer);
    this.activeTimers = [];
    for (const node of this.activeNodes) {
      try { (node as any).stop?.(); } catch {}
      try { node.disconnect(); } catch {}
    }
    this.activeNodes = [];
  }

  // ── Procedural Music Generators ──

  private playTown(): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;

    // Warm pad chord (C major)
    const notes = [261.63, 329.63, 392.00]; // C4, E4, G4
    for (const freq of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.06;
      osc.connect(gain);
      gain.connect(this.musicGain!);
      osc.start();
      this.activeNodes.push(osc, gain);

      // Gentle vibrato
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.5 + Math.random() * 0.5;
      lfoGain.gain.value = 2;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
      this.activeNodes.push(lfo, lfoGain);
    }

    // Gentle melody loop
    const melody = [523.25, 587.33, 659.25, 587.33, 523.25, 440.00, 392.00, 440.00];
    let noteIdx = 0;
    const timer = setInterval(() => {
      if (!this.ctx || this.currentZone !== 'town') return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = melody[noteIdx % melody.length];
      gain.gain.value = 0.04;
      gain.gain.setTargetAtTime(0, ctx.currentTime + 0.8, 0.2);
      osc.connect(gain);
      gain.connect(this.musicGain!);
      osc.start();
      osc.stop(ctx.currentTime + 1.2);
      noteIdx++;
    }, 1500) as unknown as number;
    this.activeTimers.push(timer);
  }

  private playForest(): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;

    // Wind noise
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 400;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.04;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.musicGain!);
    noise.start();
    this.activeNodes.push(noise, noiseFilter, noiseGain);

    // Mysterious minor pad
    const notes = [220.00, 261.63, 329.63]; // A3, C4, E4 (Am)
    for (const freq of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.03;
      osc.connect(gain);
      gain.connect(this.musicGain!);
      osc.start();
      this.activeNodes.push(osc, gain);
    }

    // Bird chirps
    const timer = setInterval(() => {
      if (!this.ctx || this.currentZone !== 'forest') return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1800 + Math.random() * 1200;
      gain.gain.value = 0.02;
      gain.gain.setTargetAtTime(0, ctx.currentTime + 0.1, 0.05);
      osc.connect(gain);
      gain.connect(this.musicGain!);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }, 3000 + Math.random() * 4000) as unknown as number;
    this.activeTimers.push(timer);
  }

  private playDungeon(): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;

    // Dark drone (D minor)
    const notes = [146.83, 174.61]; // D3, F3
    for (const freq of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      gain.gain.value = 0.02;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain!);
      osc.start();
      this.activeNodes.push(osc, gain, filter);
    }

    // Water drip
    const timer = setInterval(() => {
      if (!this.ctx || this.currentZone !== 'dungeon') return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 2000 + Math.random() * 500;
      gain.gain.value = 0.03;
      gain.gain.setTargetAtTime(0, ctx.currentTime + 0.05, 0.02);
      osc.connect(gain);
      gain.connect(this.musicGain!);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    }, 2000 + Math.random() * 3000) as unknown as number;
    this.activeTimers.push(timer);
  }

  private playIceCave(): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;

    // Icy pad (high reverb feel)
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    for (const freq of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.025;
      // Slow LFO for shimmer
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.2;
      lfoGain.gain.value = 0.008;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
      osc.connect(gain);
      gain.connect(this.musicGain!);
      osc.start();
      this.activeNodes.push(osc, gain, lfo, lfoGain);
    }

    // Ice crack sounds
    const timer = setInterval(() => {
      if (!this.ctx || this.currentZone !== 'ice_cave') return;
      const bufLen = ctx.sampleRate * 0.05;
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.3));
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.06;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 3000;
      src.connect(f);
      f.connect(g);
      g.connect(this.musicGain!);
      src.start();
    }, 4000 + Math.random() * 6000) as unknown as number;
    this.activeTimers.push(timer);
  }

  private playVolcano(): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;

    // Rumbling bass
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 55; // A1
    gain.gain.value = 0.04;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 150;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain!);
    osc.start();
    this.activeNodes.push(osc, gain, filter);

    // Fire crackle
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (Math.random() < 0.1 ? 0.5 : 0.05);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 2000;
    nf.Q.value = 0.5;
    const ng = ctx.createGain();
    ng.gain.value = 0.03;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(this.musicGain!);
    noise.start();
    this.activeNodes.push(noise, nf, ng);

    // Lava bubble
    const timer = setInterval(() => {
      if (!this.ctx || this.currentZone !== 'volcano') return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 80 + Math.random() * 60;
      o.frequency.setTargetAtTime(40, ctx.currentTime + 0.1, 0.05);
      g.gain.value = 0.05;
      g.gain.setTargetAtTime(0, ctx.currentTime + 0.15, 0.05);
      o.connect(g);
      g.connect(this.musicGain!);
      o.start();
      o.stop(ctx.currentTime + 0.3);
    }, 1500 + Math.random() * 2000) as unknown as number;
    this.activeTimers.push(timer);
  }

  private playBattle(): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;

    // Tense rhythm
    const kick = () => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 150;
      o.frequency.setTargetAtTime(40, ctx.currentTime + 0.05, 0.02);
      g.gain.value = 0.08;
      g.gain.setTargetAtTime(0, ctx.currentTime + 0.1, 0.04);
      o.connect(g);
      g.connect(this.musicGain!);
      o.start();
      o.stop(ctx.currentTime + 0.2);
    };

    // Minor chord stabs
    const stab = () => {
      const notes = [220, 261.63, 329.63]; // Am
      for (const freq of notes) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = freq;
        g.gain.value = 0.02;
        g.gain.setTargetAtTime(0, ctx.currentTime + 0.3, 0.1);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 800;
        o.connect(f);
        f.connect(g);
        g.connect(this.musicGain!);
        o.start();
        o.stop(ctx.currentTime + 0.5);
      }
    };

    let beat = 0;
    const timer = setInterval(() => {
      if (!this.ctx || this.currentZone !== 'battle') return;
      if (beat % 2 === 0) kick();
      if (beat % 4 === 0) stab();
      beat++;
    }, 400) as unknown as number;
    this.activeTimers.push(timer);
  }

  private playBoss(): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;

    // Epic drone
    const drone = ctx.createOscillator();
    const dg = ctx.createGain();
    drone.type = 'sawtooth';
    drone.frequency.value = 110; // A2
    dg.gain.value = 0.03;
    const df = ctx.createBiquadFilter();
    df.type = 'lowpass';
    df.frequency.value = 400;
    drone.connect(df);
    df.connect(dg);
    dg.connect(this.musicGain!);
    drone.start();
    this.activeNodes.push(drone, dg, df);

    // Heavy percussion
    let beat = 0;
    const timer = setInterval(() => {
      if (!this.ctx || this.currentZone !== 'boss') return;
      // Kick
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 200;
      o.frequency.setTargetAtTime(30, ctx.currentTime + 0.05, 0.02);
      g.gain.value = 0.1;
      g.gain.setTargetAtTime(0, ctx.currentTime + 0.12, 0.04);
      o.connect(g);
      g.connect(this.musicGain!);
      o.start();
      o.stop(ctx.currentTime + 0.2);

      // Power chord on every 4th beat
      if (beat % 4 === 0) {
        const notes = [110, 146.83, 164.81]; // A2, D3, E3 (power)
        for (const freq of notes) {
          const oc = ctx.createOscillator();
          const gc = ctx.createGain();
          oc.type = 'sawtooth';
          oc.frequency.value = freq;
          gc.gain.value = 0.03;
          gc.gain.setTargetAtTime(0, ctx.currentTime + 0.4, 0.15);
          const fc = ctx.createBiquadFilter();
          fc.type = 'lowpass';
          fc.frequency.value = 600;
          oc.connect(fc);
          fc.connect(gc);
          gc.connect(this.musicGain!);
          oc.start();
          oc.stop(ctx.currentTime + 0.6);
        }
      }
      beat++;
    }, 350) as unknown as number;
    this.activeTimers.push(timer);
  }
}

// Singleton
export const music = new MusicSystem();
