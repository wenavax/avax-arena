"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import type {Cell, LandMask} from "@/lib/landMask";
import {CELL, RES_H, RES_W, computeLandMask, tokenIdOf} from "@/lib/landMask";
import {GRID_H, GRID_W} from "@/lib/config";
import type {AtlasStore} from "@/lib/atlasState";
import {createAtlasStore} from "@/lib/atlasState";
import {OCEAN, OWNED, landColor} from "@/lib/colors";

const pinchMidDist = (ptrs: Array<{x: number; y: number}>) => {
  const [a, b] = ptrs;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  return {midX, midY, dist};
};

const dist = (a: {x: number; y: number}, b: {x: number; y: number}) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export type AtlasSelection = {
  cell: Cell;
  tokenId: number;
  /** sahip adresi (lowercase) ya da null */
  owner: string | null;
  /** sahip senin cüzdanın mı */
  mine: boolean;
  /** sahip resmi varsa uri */
  uri: string | null;
  /** lat/lng tahmini */
  lonLat: [number, number] | null;
  /** ülke adı */
  countryName: string;
};

type Props = {
  /** edge coverage threshold (yayında 0.55) */
  edgeT: number;
  /** bağlı cüzdan adresi (lowercase) — `mine` flag'i için */
  account: string | null;
  /** dışarıdan bildirim — yeni state geldiğinde re-render tetikle */
  storeRef: React.MutableRefObject<AtlasStore>;
  /** seçilen pixel değiştiğinde callback */
  onSelect: (sel: AtlasSelection | null) => void;
  /** mask hazır olduğunda land set'ini paylaş (merkle tree inşası için) */
  onReady?: (info: {landCount: number; landIds: number[]}) => void;
  /** harici redraw trigger sayacı; arttığında full draw */
  drawTick: number;
};

export default function AtlasCanvas({
  edgeT,
  account,
  storeRef,
  onSelect,
  onReady,
  drawTick,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const pixelsRef = useRef<HTMLCanvasElement>(null);
  const bordersRef = useRef<SVGSVGElement>(null);
  const fxRef = useRef<SVGSVGElement>(null);

  const [maskState, setMaskState] = useState<LandMask | null>(null);
  const [loading, setLoading] = useState(true);
  const camRef = useRef({s: 1, x: 0, y: 0});
  const selIdRef = useRef<number>(-1);
  // onReady'yi ref'te tut — inline arrow fn'i deps'te yer alırsa effect
  // her render'da tetiklenir ve computeLandMask infinite loop'a girer.
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // ----------- (1) load + rasterize -----------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    computeLandMask(edgeT).then((m) => {
      if (cancelled) return;
      setMaskState(m);
      const landIds = m.cells.map((c) => tokenIdOf(c.c, c.r));
      onReadyRef.current?.({landCount: m.cells.length, landIds});
      setLoading(false);
    }).catch((e) => {
      console.error("computeLandMask failed", e);
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [edgeT]);

  // ----------- (2) canvas + svg setup -----------
  useEffect(() => {
    const cv = pixelsRef.current;
    if (cv) {
      cv.width = RES_W;
      cv.height = RES_H;
    }
    for (const svg of [bordersRef.current, fxRef.current]) {
      if (svg) {
        svg.setAttribute("width", String(RES_W));
        svg.setAttribute("height", String(RES_H));
        svg.setAttribute("viewBox", `0 0 ${RES_W} ${RES_H}`);
      }
    }
  }, []);

  // ----------- (3) draw helpers -----------
  const drawCell = useCallback(
    (cell: Cell) => {
      const ctx = pixelsRef.current?.getContext("2d");
      if (!ctx) return;
      const x = cell.c * CELL;
      const y = cell.r * CELL;
      const id = tokenIdOf(cell.c, cell.r);
      const store = storeRef.current;
      const uri = store.imgURIs.get(id);
      const blocked =
        store.blocklist.blockedTokens.has(id) ||
        (!!uri && store.blocklist.blockedURIs.has(uri));
      const im = store.imgObjs.get(id);
      if (im && !blocked) {
        ctx.drawImage(im, x, y, CELL, CELL);
        return;
      }
      ctx.fillStyle = store.owners.has(id) ? OWNED : landColor(cell.ci);
      // Hücreler arasında ince çizgi için 0.1×CELL boşluk (8px CELL'de 0.8px)
      ctx.fillRect(x, y, CELL - CELL * 0.1, CELL - CELL * 0.1);
    },
    [storeRef]
  );

  const fullDraw = useCallback(
    (mask: LandMask) => {
      const ctx = pixelsRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = OCEAN;
      ctx.fillRect(0, 0, RES_W, RES_H);
      for (const cell of mask.cells) drawCell(cell);
    },
    [drawCell]
  );

  // borders draw — yalnız mask hazırken bir kere
  useEffect(() => {
    if (!maskState) return;
    const svgB = bordersRef.current;
    if (!svgB) return;
    const NS = "http://www.w3.org/2000/svg";
    svgB.innerHTML = "";
    let d = "";
    maskState.world.features.forEach((f) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = maskState.geoPath(f as any);
      if (s) d += s;
    });
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "rgba(206,230,240,.4)");
    // RES uzayında stroke; CELL=8 ile RES_W=5120 → 2.2 ≈ önceki görsel kalınlık
    p.setAttribute("stroke-width", "2.2");
    p.setAttribute("stroke-linejoin", "round");
    svgB.appendChild(p);

    // --- "BASE" okyanus etiketleri (silik, gizemli watermark) ---
    // CELL ile orantılı, böylece CELL ayarı değiştiğinde görünür boyut sabit kalır.
    const LETTER_SIZE = CELL * 20; // CELL=8 → 160 (RES uzayında)
    const LETTER_GAP = LETTER_SIZE * 1.5;

    const isOceanXY = (px: number, py: number): boolean => {
      const c = Math.floor(px / CELL);
      const r = Math.floor(py / CELL);
      if (c < 0 || r < 0 || c >= GRID_W || r >= GRID_H) return true;
      return maskState.coverage[r * GRID_W + c] < 0.15;
    };

    const fits = (cx: number, cy: number, sz: number): boolean => {
      const r = sz / 2;
      return (
        isOceanXY(cx, cy) &&
        isOceanXY(cx - r * 0.5, cy - r * 0.5) &&
        isOceanXY(cx + r * 0.5, cy - r * 0.5) &&
        isOceanXY(cx - r * 0.5, cy + r * 0.5) &&
        isOceanXY(cx + r * 0.5, cy + r * 0.5)
      );
    };

    const findFreeNear = (cx: number, cy: number, sz: number): [number, number] => {
      if (fits(cx, cy, sz)) return [cx, cy];
      const step = CELL * 4;
      for (let d = step; d < 600; d += step) {
        for (let a = 0; a < 16; a++) {
          const th = (a / 16) * Math.PI * 2;
          const nx = cx + Math.cos(th) * d;
          const ny = cy + Math.sin(th) * d;
          if (fits(nx, ny, sz)) return [nx, ny];
        }
      }
      return [cx, cy];
    };

    const drawLetter = (cx: number, cy: number, ch: string) => {
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", String(cx));
      t.setAttribute("y", String(cy));
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dominant-baseline", "central");
      t.setAttribute("fill", "rgba(206,230,240,0.13)");
      t.setAttribute("font-size", String(LETTER_SIZE));
      t.setAttribute("font-weight", "700");
      t.setAttribute("letter-spacing", "0.08em");
      t.setAttribute(
        "font-family",
        "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
      );
      t.setAttribute("style", "pointer-events:none; user-select:none");
      t.textContent = ch;
      svgB.appendChild(t);
    };

    // Bir okyanus için 4 harfi center'dan başlayıp aşağı dağıtır
    // (her harf en yakın okyanusa kaydırılır).
    const placeBaseAt = (centerLng: number, centerLat: number) => {
      const pt0 = maskState.projection([centerLng, centerLat]);
      if (!pt0) return;
      const letters = ["B", "A", "S", "E"];
      const totalH = LETTER_GAP * (letters.length - 1);
      const startY = pt0[1] - totalH / 2;
      letters.forEach((ch, i) => {
        const [x, y] = findFreeNear(pt0[0], startY + i * LETTER_GAP, LETTER_SIZE);
        drawLetter(x, y, ch);
      });
    };

    // 3 okyanus: en sol Pasifik · Atlantik · en sağ Pasifik
    placeBaseAt(-152, 8); // sol Pasifik (Hawaii-Polynesia arası açıklar)
    placeBaseAt(-32, 25); // Atlantik
    placeBaseAt(165, 8); // sağ Pasifik (Filipinler doğusu)
  }, [maskState]);

  // pixels full redraw — mask değişince ya da drawTick artınca
  useEffect(() => {
    if (!maskState) return;
    fullDraw(maskState);
  }, [maskState, drawTick, fullDraw]);

  // ----------- (4) camera -----------
  const applyCam = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    const {s, x, y} = camRef.current;
    w.style.transform = `translate(${x}px,${y}px) scale(${s})`;
  }, []);

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const w = vp.clientWidth;
    const h = vp.clientHeight;
    const s = Math.min(w / RES_W, h / RES_H) * 0.96;
    camRef.current = {s, x: (w - RES_W * s) / 2, y: (h - RES_H * s) / 2};
    applyCam();
  }, [applyCam]);

  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      const cam = camRef.current;
      const ns = Math.min(14, Math.max(0.3, cam.s * factor));
      const k = ns / cam.s;
      cam.x = cx - (cx - cam.x) * k;
      cam.y = cy - (cy - cam.y) * k;
      cam.s = ns;
      applyCam();
    },
    [applyCam]
  );

  useEffect(() => {
    if (!maskState) return;
    fit();
    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [maskState, fit]);

  // ----------- (5) interaction: wheel + 1-finger pan + 2-finger pinch + click -----------
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !maskState) return;

    // wheel zoom — desktop / trackpad
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    vp.addEventListener("wheel", onWheel, {passive: false});

    // Multi-pointer takip — 1 parmak: pan; 2 parmak: pinch + pan
    type Ptr = {id: number; x: number; y: number};
    const ptrs: Ptr[] = [];
    let lastTap: {x: number; y: number; t: number} | null = null;
    let movedSincePress = false;
    let pinchPrev: {midX: number; midY: number; dist: number} | null = null;

    const findIdx = (id: number) => ptrs.findIndex((p) => p.id === id);

    const onDown = (e: PointerEvent) => {
      // sadece sol fare butonu — kontekst menüsü ile çakışmayalım
      if (e.pointerType === "mouse" && e.button !== 0) return;
      vp.setPointerCapture?.(e.pointerId);
      const idx = findIdx(e.pointerId);
      if (idx >= 0) {
        ptrs[idx] = {id: e.pointerId, x: e.clientX, y: e.clientY};
      } else {
        ptrs.push({id: e.pointerId, x: e.clientX, y: e.clientY});
      }
      movedSincePress = false;
      vp.classList.add("grabbing");
      if (ptrs.length === 2) {
        pinchPrev = pinchMidDist(ptrs);
      }
    };

    const onMove = (e: PointerEvent) => {
      const idx = findIdx(e.pointerId);
      if (idx < 0) return;

      if (ptrs.length === 1) {
        // 1-finger pan
        const prev = ptrs[idx];
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) movedSincePress = true;
        camRef.current.x += dx;
        camRef.current.y += dy;
        ptrs[idx] = {id: e.pointerId, x: e.clientX, y: e.clientY};
        applyCam();
      } else if (ptrs.length === 2) {
        // 2-finger pinch + pan
        ptrs[idx] = {id: e.pointerId, x: e.clientX, y: e.clientY};
        movedSincePress = true;
        const cur = pinchMidDist(ptrs);
        if (pinchPrev) {
          const factor = cur.dist / Math.max(1, pinchPrev.dist);
          const r = vp.getBoundingClientRect();
          // zoom toward midpoint of fingers
          zoomAt(cur.midX - r.left, cur.midY - r.top, factor);
          // pan to follow midpoint translation
          camRef.current.x += cur.midX - pinchPrev.midX;
          camRef.current.y += cur.midY - pinchPrev.midY;
          applyCam();
        }
        pinchPrev = cur;
      }
    };

    const onUp = (e: PointerEvent) => {
      const idx = findIdx(e.pointerId);
      const wasClick = ptrs.length === 1 && !movedSincePress;
      if (idx >= 0) ptrs.splice(idx, 1);
      vp.releasePointerCapture?.(e.pointerId);

      if (ptrs.length < 2) pinchPrev = null;
      if (ptrs.length === 0) {
        vp.classList.remove("grabbing");
        if (wasClick) {
          const now = performance.now();
          const tap = {x: e.clientX, y: e.clientY, t: now};
          // çift dokunma → seçili pixele zoom in
          if (lastTap && now - lastTap.t < 320 && dist(tap, lastTap) < 30) {
            const r = vp.getBoundingClientRect();
            zoomAt(tap.x - r.left, tap.y - r.top, 1.6);
            lastTap = null;
          } else {
            selectAt({x: e.clientX, y: e.clientY});
            lastTap = tap;
          }
        }
      }
    };

    vp.addEventListener("pointerdown", onDown);
    vp.addEventListener("pointermove", onMove);
    vp.addEventListener("pointerup", onUp);
    vp.addEventListener("pointercancel", onUp);

    return () => {
      vp.removeEventListener("wheel", onWheel);
      vp.removeEventListener("pointerdown", onDown);
      vp.removeEventListener("pointermove", onMove);
      vp.removeEventListener("pointerup", onUp);
      vp.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maskState, account, applyCam, zoomAt]);

  // ----------- (6) selection -----------
  const cellFromClient = useCallback(
    (p: {x: number; y: number}, mask: LandMask) => {
      const cv = pixelsRef.current;
      if (!cv) return -1;
      const r = cv.getBoundingClientRect();
      const x = (p.x - r.left) * (RES_W / r.width);
      const y = (p.y - r.top) * (RES_H / r.height);
      const c = Math.floor(x / CELL);
      const rr = Math.floor(y / CELL);
      if (c < 0 || rr < 0 || c >= GRID_W || rr >= GRID_H) return -1;
      return mask.at[rr * GRID_W + c];
    },
    []
  );

  const selectAt = useCallback(
    (p: {x: number; y: number}) => {
      if (!maskState) return;
      const k = cellFromClient(p, maskState);
      const svgFx = fxRef.current;
      if (!svgFx) return;
      if (k < 0) {
        svgFx.innerHTML = "";
        selIdRef.current = -1;
        onSelect(null);
        return;
      }
      const cell = maskState.cells[k];
      const id = tokenIdOf(cell.c, cell.r);
      selIdRef.current = id;

      svgFx.innerHTML = "";
      const NS = "http://www.w3.org/2000/svg";
      const rect = document.createElementNS(NS, "rect");
      // RES uzayında 2px outline; CELL ile orantılı
      const outline = CELL * 0.25;
      rect.setAttribute("x", String(cell.c * CELL - outline));
      rect.setAttribute("y", String(cell.r * CELL - outline));
      rect.setAttribute("width", String(CELL + outline * 2));
      rect.setAttribute("height", String(CELL + outline * 2));
      rect.setAttribute("fill", "none");
      rect.setAttribute("stroke", "#fff");
      rect.setAttribute("stroke-width", String(CELL * 0.4));
      svgFx.appendChild(rect);

      const store = storeRef.current;
      const owner = store.owners.get(id) ?? null;
      const mine = !!(owner && account && owner === account.toLowerCase());
      const uri = store.imgURIs.get(id) ?? null;
      const lonLat =
        maskState.projection.invert?.([cell.c * CELL + CELL / 2, cell.r * CELL + CELL / 2]) ?? null;
      const countryName = maskState.world.features[cell.ci]?.properties.name ?? "—";

      onSelect({cell, tokenId: id, owner, mine, uri, lonLat, countryName});
    },
    [maskState, account, cellFromClient, onSelect, storeRef]
  );

  // public API: zoom +/− and fit buttons
  const onZoomIn = () => {
    const vp = viewportRef.current!;
    zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, 1.3);
  };
  const onZoomOut = () => {
    const vp = viewportRef.current!;
    zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, 1 / 1.3);
  };

  return (
    <>
      <div id="viewport" ref={viewportRef}>
        <div id="world" ref={worldRef}>
          <canvas id="pixels" ref={pixelsRef} />
          <svg id="borders" ref={bordersRef} />
          <svg id="fx" ref={fxRef} />
        </div>
      </div>
      <div className="hud bl" style={{position: "absolute", bottom: 16, left: 16, display: "flex", gap: 10}}>
        <div className="glass zoom" style={{padding: 6, display: "flex", gap: 4}}>
          <button className="btn ghost" onClick={onZoomIn} title="Zoom in">
            +
          </button>
          <button className="btn ghost" onClick={onZoomOut} title="Zoom out">
            −
          </button>
          <button className="btn ghost" onClick={fit} title="Fit to screen" style={{fontSize: 12}}>
            ⤢
          </button>
        </div>
      </div>
      {loading && (
        <div
          id="loading"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "var(--muted)",
            pointerEvents: "none",
          }}
        >
          loading map…
        </div>
      )}
    </>
  );
}

export {createAtlasStore};
