/**
 * Event log reader — `PixelMinted` ve `PixelImageSet` event'lerini deploy
 * block'tan head'e kadar chunked tara, owners/imgURIs map'lerini doldur.
 *
 * 61K per-pixel call yapmak yerine log'ları toplu okuyoruz (public RPC limit
 * dostu). Üretimde Alchemy gibi pinned key öneririz.
 */
"use client";

import type {Contract} from "ethers";
import type {AtlasStore} from "./atlasState";
import {DEPLOY_BLOCK} from "./config";
import {resolveURI} from "./colors";

const CHUNK = 9_500; // public RPC genelde ≤10K range kabul ediyor

export type ScanProgress = {
  fromBlock: number;
  toBlock: number;
  done: boolean;
};

export async function scanChainLogs(
  atlas: Contract,
  store: AtlasStore,
  onCellUpdate: (tokenId: number) => void,
  onProgress?: (p: ScanProgress) => void
): Promise<void> {
  const provider = atlas.runner?.provider;
  if (!provider) throw new Error("atlas.runner.provider missing");
  const head = await provider.getBlockNumber();

  const mintedFilter = atlas.filters.PixelMinted?.();
  const imageFilter = atlas.filters.PixelImageSet?.();
  const clearedFilter = atlas.filters.PixelImageCleared?.();

  for (let from = DEPLOY_BLOCK; from <= head; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, head);

    const [mintLogs, imgLogs, clearedLogs] = await Promise.all([
      mintedFilter ? atlas.queryFilter(mintedFilter, from, to) : Promise.resolve([]),
      imageFilter ? atlas.queryFilter(imageFilter, from, to) : Promise.resolve([]),
      clearedFilter ? atlas.queryFilter(clearedFilter, from, to) : Promise.resolve([]),
    ]);

    for (const ev of mintLogs) {
      // v2 event: (tokenId, owner, x, y, pricePaid)
      const args = (ev as unknown as {args: {tokenId: bigint; owner: string}}).args;
      const id = Number(args.tokenId);
      store.owners.set(id, args.owner.toLowerCase());
      onCellUpdate(id);
    }

    for (const ev of imgLogs) {
      // v2 event: (tokenId, owner, uri) — owner ignored on read path
      const args = (ev as unknown as {args: {tokenId: bigint; uri: string}}).args;
      const id = Number(args.tokenId);
      store.imgURIs.set(id, args.uri);
      loadImageInto(store, id, args.uri, onCellUpdate);
    }

    // Transfer clears image — v2 PixelImageCleared event
    for (const ev of clearedLogs) {
      const args = (ev as unknown as {args: {tokenId: bigint}}).args;
      const id = Number(args.tokenId);
      store.imgURIs.delete(id);
      store.imgObjs.delete(id);
      onCellUpdate(id);
    }

    onProgress?.({fromBlock: from, toBlock: to, done: to >= head});
  }
}

export function loadImageInto(
  store: AtlasStore,
  tokenId: number,
  uri: string,
  onLoaded: (tokenId: number) => void
): void {
  if (typeof window === "undefined") return;
  const im = new Image();
  im.crossOrigin = "anonymous";
  im.onload = () => {
    store.imgObjs.set(tokenId, im);
    onLoaded(tokenId);
  };
  im.src = resolveURI(uri);
}
