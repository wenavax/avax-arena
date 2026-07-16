/**
 * Land mask — kara/deniz hesabı. Frontend ve `script/generateLandMerkle.ts`
 * AYNI fonksiyonu kullanmalı, aksi halde mintlenebilir set'le merkle ağacı
 * uyuşmaz.
 *
 * Algoritma (HTML referansındaki rasterizeStats + buildGrid):
 *  1. Natural Earth GeoJSON → /data/world.geo.json üzerinden fetch
 *  2. d3.geoNaturalEarth1().fitExtent([[10,10],[RES_W-10,RES_H-10]])
 *  3. SAMP=5 subsample → 3200×1600 offscreen canvas
 *  4. Hücre coverage = land_subsamples / SAMP², majority countryIndex
 *  5. coverage >= edgeT → CELL listesine eklenir
 *
 * Browser-only — `document.createElement` ve canvas API kullanır.
 */

import {geoNaturalEarth1, geoPath as makeGeoPath} from "d3-geo";
import {GRID_H, GRID_W} from "./config";

// Her token hücresi için render uzayında kaç pixel. Token ID grid'i (GRID_W ×
// GRID_H) sabit kalır; CELL arttıkça canvas büyür → zoom in'de daha keskin
// görünür. SAMP raster fidelity'sini etkilemez (3200×1600 offscreen sabit).
export const CELL = 8;
export const RES_W = GRID_W * CELL;
export const RES_H = GRID_H * CELL;
export const SAMP = 5;

export type GeoFeature = {
  type: "Feature";
  properties: {name: string; iso: string};
  geometry: {type: string; coordinates: unknown};
};
export type WorldGeo = {type: "FeatureCollection"; features: GeoFeature[]};

export type Cell = {c: number; r: number; ci: number};

export type Projection = ReturnType<typeof geoNaturalEarth1>;
export type GeoPath = ReturnType<typeof makeGeoPath>;

export type LandMask = {
  world: WorldGeo;
  projection: Projection;
  geoPath: GeoPath;
  /** coverage in [0,1], length = GRID_W*GRID_H */
  coverage: Float32Array;
  /** country index per cell (-1 = ocean), length = GRID_W*GRID_H */
  countryIndex: Int16Array;
  /** filtered cells where coverage >= edgeT */
  cells: Cell[];
  /** at[gi] = index into cells[], or -1 if not in cells */
  at: Int32Array;
  edgeT: number;
};

let _worldCache: WorldGeo | null = null;

export async function loadWorldGeo(url = "/data/world.geo.json"): Promise<WorldGeo> {
  if (_worldCache) return _worldCache;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`world geo fetch failed: ${res.status}`);
  _worldCache = (await res.json()) as WorldGeo;
  return _worldCache;
}

/**
 * Bir kez çağrılır, COV + CIA üretilir (büyük buffer). Sonra `buildGrid` ile
 * istenen edgeT için CELLS/AT türetilir.
 */
function rasterizeStats(world: WorldGeo): {
  projection: Projection;
  geoPath: GeoPath;
  coverage: Float32Array;
  countryIndex: Int16Array;
} {
  const projection = geoNaturalEarth1().fitExtent(
    [
      [10, 10],
      [RES_W - 10, RES_H - 10],
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    world as any
  );
  const geoPath = makeGeoPath(projection);

  const RW = GRID_W * SAMP; // 3200
  const RH = GRID_H * SAMP; // 1600

  const off = document.createElement("canvas");
  off.width = RW;
  off.height = RH;
  const octx = off.getContext("2d", {willReadFrequently: true})!;
  const k = SAMP / CELL; // RES → raster

  // ----- 1) ülke indeks haritası (her ülke farklı kırmızı tonu) -----
  octx.setTransform(k, 0, 0, k, 0, 0);
  octx.fillStyle = "#000";
  octx.fillRect(0, 0, RES_W, RES_H);
  const p = makeGeoPath(projection, octx);
  world.features.forEach((f, i) => {
    octx.beginPath();
    octx.fillStyle = `rgb(${i + 1},0,0)`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p(f as any);
    octx.fill();
  });
  const IDX = octx.getImageData(0, 0, RW, RH).data;

  // ----- 2) tek renkli kara maskesi -----
  octx.fillStyle = "#000";
  octx.fillRect(0, 0, RES_W, RES_H);
  octx.beginPath();
  octx.fillStyle = "#fff";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  world.features.forEach((f) => p(f as any));
  octx.fill();
  const MASK = octx.getImageData(0, 0, RW, RH).data;

  // ----- 3) hücre başına coverage + majority country -----
  const coverage = new Float32Array(GRID_W * GRID_H);
  const countryIndex = new Int16Array(GRID_W * GRID_H).fill(-1);

  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      let land = 0;
      const votes: Record<number, number> = {};
      const bx = c * SAMP;
      const by = r * SAMP;
      for (let sy = 0; sy < SAMP; sy++) {
        let row = ((by + sy) * RW + bx) * 4;
        for (let sx = 0; sx < SAMP; sx++) {
          if (MASK[row] >= 128) {
            land++;
            const ci = IDX[row] - 1;
            if (ci >= 0) votes[ci] = (votes[ci] ?? 0) + 1;
          }
          row += 4;
        }
      }
      const gi = r * GRID_W + c;
      coverage[gi] = land / (SAMP * SAMP);
      if (land > 0) {
        let best = 0;
        let bv = -1;
        for (const v in votes) {
          if (votes[v] > bv) {
            bv = votes[v];
            best = +v;
          }
        }
        countryIndex[gi] = best;
      }
    }
  }

  // Büyük tamponu serbest bırak
  off.width = off.height = 1;

  return {projection, geoPath, coverage, countryIndex};
}

export function buildGridFromStats(
  coverage: Float32Array,
  countryIndex: Int16Array,
  edgeT: number
): {cells: Cell[]; at: Int32Array} {
  const cells: Cell[] = [];
  const at = new Int32Array(GRID_W * GRID_H).fill(-1);
  for (let gi = 0; gi < coverage.length; gi++) {
    if (coverage[gi] >= edgeT && countryIndex[gi] >= 0) {
      at[gi] = cells.length;
      cells.push({c: gi % GRID_W, r: (gi / GRID_W) | 0, ci: countryIndex[gi]});
    }
  }
  return {cells, at};
}

export async function computeLandMask(edgeT: number): Promise<LandMask> {
  const world = await loadWorldGeo();
  const stats = rasterizeStats(world);
  const grid = buildGridFromStats(stats.coverage, stats.countryIndex, edgeT);
  return {
    world,
    projection: stats.projection,
    geoPath: stats.geoPath,
    coverage: stats.coverage,
    countryIndex: stats.countryIndex,
    cells: grid.cells,
    at: grid.at,
    edgeT,
  };
}

// ---- tokenId helpers ----
export const tokenIdOf = (c: number, r: number) => r * GRID_W + c;
export const colOf = (id: number) => id % GRID_W;
export const rowOf = (id: number) => Math.floor(id / GRID_W);
