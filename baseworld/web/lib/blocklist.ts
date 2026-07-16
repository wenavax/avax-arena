/**
 * Off-chain content blocklist. On-chain image URI'lar silinemez (kontrat
 * sadece sahip tarafından `setPixelImage`'le değiştirilebilir), bu sebeple
 * yasaklı içerik için renderer-side filtre tutuyoruz.
 *
 * Akış:
 *  - Bir kullanıcı bir pixele kötü görsel yükledi → /report linki ile şikayet
 *  - Moderatör `public/data/blocklist.json`'a tokenId veya uri ekler
 *  - Frontend boot'ta yükler; engellenmiş tokenId/uri için görsel render etmez,
 *    yerine "moderated" overlay gösterir
 */

export type Blocklist = {
  version: number;
  updated: string;
  tokenIds: number[];
  uris: string[];
};

let _cache: BlocklistView | null = null;

export type BlocklistView = {
  blockedTokens: Set<number>;
  blockedURIs: Set<string>;
};

export async function loadBlocklist(
  url = "/data/blocklist.json"
): Promise<BlocklistView> {
  if (_cache) return _cache;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as Blocklist;
    _cache = {
      blockedTokens: new Set(j.tokenIds ?? []),
      blockedURIs: new Set(j.uris ?? []),
    };
    return _cache;
  } catch {
    // dosya yoksa boş set döner — renderer hiçbir şey engellemez
    _cache = {blockedTokens: new Set(), blockedURIs: new Set()};
    return _cache;
  }
}

export const isBlocked = (
  view: BlocklistView,
  tokenId: number,
  uri?: string | null
): boolean =>
  view.blockedTokens.has(tokenId) || (!!uri && view.blockedURIs.has(uri));
