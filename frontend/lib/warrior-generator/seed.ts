/** Deterministic hash from string → 32-bit integer */
export function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — deterministic, fast, good distribution */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Create a seeded RNG from tokenId */
export function createRng(tokenId: number): () => number {
  return mulberry32(hashCode(`warrior_${tokenId}_v1`));
}

/** Pick from array using RNG */
export function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Pick index from array using RNG */
export function pickIndex(rng: () => number, length: number): number {
  return Math.floor(rng() * length);
}
