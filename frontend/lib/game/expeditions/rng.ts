// ─── Deterministic seeded RNG ───
// Everything in an expedition run is derived from a single seed string
// (in production: the on-chain blockhash + runId). Same seed => identical run,
// which is what makes combat verifiable and server-trustless.

/** Hash an arbitrary string into a uint32 seed (xmur3). */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 PRNG — tiny, fast, good enough for game RNG, fully deterministic. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private _next: () => number;
  readonly seed: string;

  constructor(seed: string) {
    this.seed = seed;
    this._next = mulberry32(xmur3(seed)());
  }

  /** Float in [0, 1). */
  next(): number {
    return this._next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick one element from a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /**
   * Weighted pick. `weights[i]` is the relative weight of `arr[i]`.
   * Weights need not sum to 1.
   */
  weighted<T>(arr: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = this.next() * total;
    for (let i = 0; i < arr.length; i++) {
      roll -= weights[i];
      if (roll < 0) return arr[i];
    }
    return arr[arr.length - 1];
  }

  /**
   * Derive an independent child RNG for a sub-context (e.g. a floor), so the
   * order in which the caller consumes randomness elsewhere never changes a
   * floor's outcome. Keeps runs stable under UI/logic reordering.
   */
  fork(label: string | number): Rng {
    return new Rng(`${this.seed}:${label}`);
  }
}
