/**
 * Global in-memory cache for generated warrior image URLs.
 * Uses globalThis to persist across Next.js API route module boundaries.
 * In production, replace with Redis or a database.
 */

const CACHE_KEY = '__frostbite_image_cache__';

function getCache(): Map<number, string> {
  const g = globalThis as Record<string, unknown>;
  if (!g[CACHE_KEY]) {
    g[CACHE_KEY] = new Map<number, string>();
  }
  return g[CACHE_KEY] as Map<number, string>;
}

export const imageCache = {
  get(tokenId: number): string | undefined {
    return getCache().get(tokenId);
  },
  set(tokenId: number, url: string): void {
    getCache().set(tokenId, url);
  },
  has(tokenId: number): boolean {
    return getCache().has(tokenId);
  },
};
