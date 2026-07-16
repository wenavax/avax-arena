/**
 * Atlas state — render dışındaki on-chain ve UI state.
 * React state'inden ayrı tutuyoruz çünkü canvas render her frame'de yeniden
 * çiziliyor (CSS transform pan/zoom var, sadece veri değişince re-draw).
 */
import type {BlocklistView} from "./blocklist";

export type Owners = Map<number, string>; // tokenId → lowercase address
export type ImageURIs = Map<number, string>; // tokenId → uri
export type ImageObjs = Map<number, HTMLImageElement>; // tokenId → loaded image

export type AtlasStore = {
  owners: Owners;
  imgURIs: ImageURIs;
  imgObjs: ImageObjs;
  blocklist: BlocklistView;
};

export const createAtlasStore = (): AtlasStore => ({
  owners: new Map(),
  imgURIs: new Map(),
  imgObjs: new Map(),
  blocklist: {blockedTokens: new Set(), blockedURIs: new Set()},
});
