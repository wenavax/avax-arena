/**
 * CAR(D) GAME — 3D track renderer (three.js). A pure VIEW over the deterministic
 * engine: the mount feeds it one snapshot per game tick (10 Hz) and this module
 * lerps positions at 60 fps. No game logic lives here — swapping 2D↔3D can never
 * change a result.
 *
 * Car mesh: tries to load a GLB from /avalanche/cardgame/car.glb (AI-generated
 * asset drop-in); if absent, builds a stylised low-poly neon car from primitives
 * so the renderer always works with zero external assets.
 *
 * Loaded lazily (dynamic import) so the cardgame page only pays for three.js
 * when the player switches to 3D.
 */

export interface Seat3D { pid: string; color: string; name: string }
export interface CarSnap {
  pid: string; dist: number; speed: number; boosted: boolean;
  fx: string | null;      // fx-val | fx-ice | fx-epic | fx-nitro | fx-max | fx-hit | fx-oil
  fin: boolean; veh: string | null;
}
export interface Track3D {
  update(cars: CarSnap[]): void;
  setNames(names: Record<string, string>): void;
  /** Round-driven weather: 0 sunny day · 1 rainstorm · 2 snowy night (mod 3). */
  setWeather(round: number): void;
  resize(): void;
  destroy(): void;
}

const TRACK = 1000;           // engine units
const LANE_W = 3.2;           // world units per lane
const LEN = 90;               // world length of the straight
const X0 = -LEN / 2;
const CP = [250, 500, 750];
// wheel angular velocity per (speed·dt): (world-units-per-engine-unit / wheel radius) · fudge
const WHEEL_SPIN_K = (LEN / TRACK) / 0.26 * 1.7;

const FX_COLOR: Record<string, number> = {
  'fx-val': 0xececee, 'fx-ice': 0x4dd0e1, 'fx-epic': 0xa78bfa,
  'fx-nitro': 0xf5c542, 'fx-max': 0xffffff, 'fx-hit': 0xed2f39, 'fx-oil': 0x7c8299,
};

export async function createTrack3D(container: HTMLElement, seats: Seat3D[]): Promise<Track3D> {
  const THREE = await import('three');
  const { EffectComposer } = await import('three/examples/jsm/postprocessing/EffectComposer.js');
  const { RenderPass } = await import('three/examples/jsm/postprocessing/RenderPass.js');
  const { UnrealBloomPass } = await import('three/examples/jsm/postprocessing/UnrealBloomPass.js');

  const W = () => container.clientWidth || 800;
  const H = () => container.clientHeight || 380;

  // Device tier: touch / low-core devices skip MSAA and render at a lower DPI.
  // antialias + 2× pixelRatio + bloom = ~4× overdraw, the main mobile frame-drop
  // source. Bloom stays (it carries the neon look) but softens the aliased edges.
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const lowEnd = coarse || (typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 8) <= 4);

  const renderer = new THREE.WebGLRenderer({ antialias: !lowEnd, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowEnd ? 1.5 : 2));

  // index seats by pid once — the update loop looked one up with .find() per car
  const seatByPid = new Map(seats.map((s) => [s.pid, s] as const));
  renderer.setSize(W(), H());
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.borderRadius = '14px';
  container.appendChild(renderer.domElement);

  // ── user-cyclable camera views (self-contained button on the stage) ──
  const CAM_MODES = ['CHASE', 'AERIAL', 'TRACKSIDE', 'FAR SIDE', 'ORBIT'];
  let camMode = 0;
  let userOrbitA = 0;
  const camBtn = document.createElement('button');
  camBtn.className = 'cg-cambtn';
  camBtn.title = 'Change camera angle';
  camBtn.textContent = '🎥 ' + CAM_MODES[camMode];
  camBtn.onclick = (e) => {
    e.stopPropagation();
    camMode = (camMode + 1) % CAM_MODES.length;
    camBtn.textContent = '🎥 ' + CAM_MODES[camMode];
  };
  container.appendChild(camBtn);

  const scene = new THREE.Scene();
  // daytime atmosphere: haze fades distant geometry into the sky horizon tint
  scene.fog = new THREE.Fog(0xcfe4f5, 90, 300);

  const camera = new THREE.PerspectiveCamera(46, W() / H(), 0.1, 400);

  // ── canvas-drawn textures (no external assets; crisp at any DPI) ─────
  function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): InstanceType<typeof THREE.CanvasTexture> {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d')!);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
  }
  /** Official Avalanche mark (bundled asset); null → hand-drawn fallback. */
  const avaxImg = await (async (): Promise<HTMLImageElement | null> => {
    try {
      const img = new Image();
      img.src = '/avalanche/cardgame/avax-logo.png';
      await img.decode();
      return img;
    } catch { return null; }
  })();
  const avaxTex = () => avaxImg
    ? canvasTex(512, 512, (ctx) => ctx.drawImage(avaxImg, 0, 0, 512, 512))
    : canvasTex(128, 128, (ctx) => {
      ctx.fillStyle = '#e84142';
      ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(64, 26); ctx.lineTo(104, 96); ctx.lineTo(76, 96);
      ctx.lineTo(58, 64); ctx.lineTo(40, 96); ctx.lineTo(24, 96); ctx.closePath(); ctx.fill();
    });
  /** Shrink-to-fit: largest font size (≤max) whose text fits maxWidth. */
  function fitFont(ctx: CanvasRenderingContext2D, text: string, max: number, maxWidth: number): number {
    let fs = max;
    ctx.font = `900 ${fs}px Impact, "Arial Black", sans-serif`;
    while (fs > 60 && ctx.measureText(text).width > maxWidth) {
      fs -= 8;
      ctx.font = `900 ${fs}px Impact, "Arial Black", sans-serif`;
    }
    return fs;
  }
  /** FROST(white)BITE(red) wordmark on translucent dark. 1024×320 (3.2:1). */
  const frostbiteTex = (sub?: string) => canvasTex(1024, 320, (ctx) => {
    ctx.fillStyle = 'rgba(10,10,16,0.94)';
    ctx.beginPath(); ctx.roundRect(4, 4, 1016, 312, 34); ctx.fill();
    ctx.strokeStyle = 'rgba(237,47,57,0.7)'; ctx.lineWidth = 10; ctx.stroke();
    fitFont(ctx, 'FROSTBITE', sub ? 170 : 200, 930);
    ctx.textBaseline = 'middle';
    const y = sub ? 118 : 160;
    const fw = ctx.measureText('FROST').width;
    const bw = ctx.measureText('BITE').width;
    const x0 = (1024 - fw - bw) / 2;
    // frost-white kept under the bloom threshold (0.82) — pure #fff blooms
    // into an unreadable blob next to the red BITE
    ctx.fillStyle = '#b9c0ce'; ctx.fillText('FROST', x0, y);
    ctx.fillStyle = '#ed2f39'; ctx.fillText('BITE', x0 + fw, y);
    if (sub) {
      ctx.font = '800 74px "Arial", sans-serif';
      ctx.fillStyle = 'rgba(210,216,228,0.8)'; ctx.textAlign = 'center';
      ctx.fillText(sub, 512, 252);
    }
  });
  const boardTex = (text: string, accent: string) => canvasTex(1024, 320, (ctx) => {
    ctx.fillStyle = 'rgba(12,12,18,0.96)';
    ctx.beginPath(); ctx.roundRect(4, 4, 1016, 312, 28); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 12; ctx.stroke();
    fitFont(ctx, text, 210, 920);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    ctx.fillText(text, 512, 164);
  });
  // TEAM1 sponsor board — red / white / black livery (user request)
  const WHITE = '#d2d5db'; // kept just under the daytime bloom threshold
  const team1Tex = () => canvasTex(1024, 320, (ctx) => {
    ctx.fillStyle = '#0a0a0c';
    ctx.beginPath(); ctx.roundRect(4, 4, 1016, 312, 28); ctx.fill();
    ctx.strokeStyle = WHITE; ctx.lineWidth = 14; ctx.stroke();          // white border
    ctx.fillStyle = '#d21f2b'; ctx.fillRect(24, 250, 976, 42);          // red base bar
    ctx.font = '900 190px "Arial Black","Arial",sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText('TEAM').width, ow = ctx.measureText('1').width;
    const x0 = (1024 - tw - ow - 26) / 2;
    ctx.fillStyle = WHITE; ctx.fillText('TEAM', x0, 148);               // white "TEAM"
    ctx.fillStyle = '#e01f2b'; ctx.fillText('1', x0 + tw + 26, 148);    // red "1"
  });
  /** Sponsor board with the real Avalanche mark + label. */
  const avaxBoardTex = (label: string) => !avaxImg ? boardTex(`${label} ▲`, '#e84142') : canvasTex(1024, 320, (ctx) => {
    ctx.fillStyle = 'rgba(12,12,18,0.96)';
    ctx.beginPath(); ctx.roundRect(4, 4, 1016, 312, 28); ctx.fill();
    ctx.strokeStyle = '#e84142'; ctx.lineWidth = 12; ctx.stroke();
    ctx.drawImage(avaxImg, 48, 36, 248, 248);
    // dim the logo's pure-white mountain under the bloom threshold (0.82)
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(48, 36, 248, 248);
    ctx.globalCompositeOperation = 'source-over';
    fitFont(ctx, label, 180, 640);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e84142';
    ctx.fillText(label, 660, 164);
  });
  const tagTex = (text: string, color: string) => canvasTex(128, 64, (ctx) => {
    ctx.font = '900 40px "Arial Black", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 34);
  });

  // ── lighting (weather presets re-tune these each round) ──────────────
  const hemi = new THREE.HemisphereLight(0xbfdcff, 0x7fae62, 0.85);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1d6, 1.35);
  key.position.set(55, 85, -110); // matches the sun disk in the sky
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfeaff, 0.3);
  rim.position.set(-30, 12, 24);
  scene.add(rim);

  // ── sky dome + sun/moon + clouds + stars (weather-driven) ────────────
  const skyGrad = (stops: Array<[number, string]>) => canvasTex(64, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 512);
  });
  const skyTexDay = skyGrad([[0, '#3f86d8'], [0.55, '#8fc0ea'], [0.78, '#cfe4f5'], [1, '#dfeef7']]);
  const skyTexRain = skyGrad([[0, '#5a6672'], [0.55, '#77828c'], [0.8, '#98a1a9'], [1, '#a7aeb5']]);
  const skyTexNight = skyGrad([[0, '#060913'], [0.55, '#0c1224'], [0.82, '#1a2340'], [1, '#232d4e']]);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTexDay, side: THREE.BackSide, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(330, 24, 16), skyMat);
  scene.add(sky);

  const sunPos = new THREE.Vector3(110, 170, -220);
  const sunDisk = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTex('rgba(255,246,220,1)', 'rgba(255,246,220,0)'), fog: false,
    transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sunDisk.scale.setScalar(46); sunDisk.position.copy(sunPos);
  scene.add(sunDisk);
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTex('rgba(255,236,190,0.55)', 'rgba(255,236,190,0)'), fog: false,
    transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sunHalo.scale.setScalar(130); sunHalo.position.copy(sunPos);
  scene.add(sunHalo);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTex('rgba(214,224,240,0.95)', 'rgba(214,224,240,0)'), fog: false,
    transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  moon.scale.setScalar(26); moon.position.set(-140, 150, -230); moon.visible = false;
  scene.add(moon);

  const cloudMats: InstanceType<typeof THREE.SpriteMaterial>[] = [];
  {
    const cloudMap = radialTex('rgba(255,255,255,0.85)', 'rgba(255,255,255,0)');
    for (let i = 0; i < 9; i++) {
      const m = new THREE.SpriteMaterial({
        map: cloudMap, fog: false, transparent: true,
        opacity: 0.5 + Math.random() * 0.25, depthWrite: false,
      });
      (m as unknown as { userData: { base: number } }).userData = { base: m.opacity };
      const c = new THREE.Sprite(m);
      c.position.set(-160 + Math.random() * 320, 60 + Math.random() * 70, -140 - Math.random() * 120);
      c.scale.set(34 + Math.random() * 42, 9 + Math.random() * 7, 1);
      scene.add(c);
      cloudMats.push(m);
    }
  }
  const stars = (() => {
    const g = new THREE.BufferGeometry();
    const n = 420, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 500;
      pos[i * 3 + 1] = 40 + Math.random() * 180;
      pos[i * 3 + 2] = -60 - Math.random() * 240;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfd8ff, size: 0.7, sizeAttenuation: true, transparent: true, opacity: 0.85 }));
    p.visible = false;
    scene.add(p);
    return p;
  })();

  // ── precipitation: pooled points, recycled top↔bottom ────────────────
  const PRECIP_N = lowEnd ? 260 : 700;
  function makePrecip(color: number, size: number): { pts: InstanceType<typeof THREE.Points>; pos: Float32Array } {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(PRECIP_N * 3);
    for (let i = 0; i < PRECIP_N; i++) {
      pos[i * 3] = X0 - 25 + Math.random() * (LEN + 50);
      pos[i * 3 + 1] = Math.random() * 26;
      pos[i * 3 + 2] = -34 + Math.random() * 68;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({
      color, size, sizeAttenuation: true, transparent: true, opacity: 0.75, depthWrite: false,
    }));
    pts.visible = false;
    scene.add(pts);
    return { pts, pos };
  }
  const rain = makePrecip(0xbcd8ec, 0.16);
  const snow = makePrecip(0xe2e9f2, 0.22);
  function stepPrecip(dt: number, now: number) {
    if (rain.pts.visible) {
      const a = rain.pos;
      for (let i = 0; i < PRECIP_N; i++) {
        a[i * 3 + 1] -= 34 * dt;
        if (a[i * 3 + 1] < 0) a[i * 3 + 1] += 26;
      }
      (rain.pts.geometry.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>).needsUpdate = true;
    }
    if (snow.pts.visible) {
      const a = snow.pos;
      for (let i = 0; i < PRECIP_N; i++) {
        a[i * 3 + 1] -= 2.4 * dt;
        a[i * 3] += Math.sin(now * 0.001 + i) * dt * 0.7;
        if (a[i * 3 + 1] < 0) a[i * 3 + 1] += 26;
      }
      (snow.pts.geometry.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>).needsUpdate = true;
    }
  }

  // ── weather presets: round 1 = sunny day, 2 = rainstorm, 3 = snowy night ─
  interface Weather {
    sky: InstanceType<typeof THREE.CanvasTexture>;
    fog: [number, number, number];
    hemi: [number, number, number]; keyC: [number, number]; rimI: number;
    sun: boolean; moon: boolean; starsV: boolean; clouds: number; cloudTint: number;
    rainV: boolean; snowV: boolean;
    deckRough: number; bloomS: number; bloomT: number;
  }
  const WEATHERS: Weather[] = [
    { sky: skyTexDay, fog: [0xcfe4f5, 90, 300], hemi: [0xbfdcff, 0x7fae62, 0.85], keyC: [0xfff1d6, 1.35], rimI: 0.3,
      sun: true, moon: false, starsV: false, clouds: 1, cloudTint: 0xffffff, rainV: false, snowV: false,
      deckRough: 0.92, bloomS: 0.42, bloomT: 0.88 },
    { sky: skyTexRain, fog: [0x9aa3ab, 55, 210], hemi: [0x9fa9b3, 0x5d7a52, 0.6], keyC: [0xcdd6de, 0.55], rimI: 0.15,
      sun: false, moon: false, starsV: false, clouds: 1.6, cloudTint: 0x707a84, rainV: true, snowV: false,
      deckRough: 0.35, bloomS: 0.3, bloomT: 0.9 },
    { sky: skyTexNight, fog: [0x11182b, 45, 190], hemi: [0x33415f, 0x1c2a1e, 0.5], keyC: [0xa9c1e8, 0.5], rimI: 0.45,
      sun: false, moon: true, starsV: true, clouds: 0.25, cloudTint: 0x2c3652, rainV: false, snowV: true,
      deckRough: 0.7, bloomS: 0.75, bloomT: 0.8 },
  ];
  let deckMatRef: InstanceType<typeof THREE.MeshStandardMaterial> | null = null;
  function applyWeather(idx: number) {
    const w = WEATHERS[((idx % WEATHERS.length) + WEATHERS.length) % WEATHERS.length];
    skyMat.map = w.sky;
    (scene.fog as InstanceType<typeof THREE.Fog>).color.setHex(w.fog[0]);
    (scene.fog as InstanceType<typeof THREE.Fog>).near = w.fog[1];
    (scene.fog as InstanceType<typeof THREE.Fog>).far = w.fog[2];
    hemi.color.setHex(w.hemi[0]); hemi.groundColor.setHex(w.hemi[1]); hemi.intensity = w.hemi[2];
    key.color.setHex(w.keyC[0]); key.intensity = w.keyC[1];
    rim.intensity = w.rimI;
    sunDisk.visible = w.sun; sunHalo.visible = w.sun; moon.visible = w.moon; stars.visible = w.starsV;
    for (const m of cloudMats) {
      m.color.setHex(w.cloudTint);
      m.opacity = Math.min(1, ((m as unknown as { userData: { base: number } }).userData?.base ?? 0.55) * w.clouds);
    }
    rain.pts.visible = w.rainV;
    snow.pts.visible = w.snowV;
    if (deckMatRef) deckMatRef.roughness = w.deckRough; // wet asphalt sheen in rain
    bloom.strength = w.bloomS; bloom.threshold = w.bloomT;
  }

  // ── track: asphalt deck + neon lane lines + grid horizon ────────────
  // procedural asphalt: dark base + grain specks + faint wear streaks
  const asphaltTex = canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = '#232329'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) {
      const g = 26 + Math.floor(Math.random() * 34);
      ctx.fillStyle = `rgb(${g},${g},${g + 4})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.4, 1.4);
    }
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? '#000' : '#555';
      ctx.fillRect(0, Math.random() * 256, 256, 6 + Math.random() * 14);
    }
    ctx.globalAlpha = 1;
  });
  asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;
  asphaltTex.repeat.set(22, 4);
  const deckMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92, metalness: 0.06 });
  deckMatRef = deckMat; // weather presets drop roughness for a wet-asphalt sheen
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(LEN + 14, 0.5, seats.length * LANE_W + 4),
    deckMat,
  );
  deck.position.set(0, -0.26, 0);
  scene.add(deck);

  const laneZ = (i: number) => (i - (seats.length - 1) / 2) * LANE_W;
  const trackHalf = (seats.length * LANE_W) / 2;

  // ── F1-standard road markings: ONE non-repeating overlay drawn to scale ──
  // (solid white edge lines + dashed white lane separators). One draw call.
  {
    const lanes = seats.length;
    const CW = 2048, CH = 256, laneH = CH / lanes;
    const markTex = canvasTex(CW, CH, (ctx) => {
      ctx.clearRect(0, 0, CW, CH);
      ctx.fillStyle = '#d2d5db';
      // solid white edge lines (top & bottom = the two track edges)
      ctx.fillRect(0, 5, CW, 8);
      ctx.fillRect(0, CH - 13, CW, 8);
      // dashed white lane separators (F1-style long dash + gap)
      for (let i = 1; i < lanes; i++) {
        const y = Math.round(i * laneH - 3);
        for (let x = 30; x < CW - 30; x += 170) ctx.fillRect(x, y, 95, 6);
      }
    });
    const markMat = new THREE.MeshBasicMaterial({ map: markTex, transparent: true, depthWrite: false });
    const markPlane = new THREE.Mesh(new THREE.PlaneGeometry(LEN + 8, lanes * LANE_W), markMat);
    markPlane.rotation.x = -Math.PI / 2;
    markPlane.position.set(0, 0.014, 0);
    scene.add(markPlane);

    // red/white F1 kerbs just outside each edge line
    const kerbTex = canvasTex(256, 32, (ctx) => {
      for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#d21f2b' : '#dcdce0'; ctx.fillRect(i * 32, 0, 32, 32); }
    });
    kerbTex.wrapS = kerbTex.wrapT = THREE.RepeatWrapping;
    kerbTex.repeat.set(64, 1);
    const kerbMat = new THREE.MeshBasicMaterial({ map: kerbTex });
    for (const s of [-1, 1]) {
      const kerb = new THREE.Mesh(new THREE.PlaneGeometry(LEN + 8, 0.62), kerbMat);
      kerb.rotation.x = -Math.PI / 2;
      kerb.position.set(0, 0.013, s * (trackHalf + 0.4));
      scene.add(kerb);
    }
  }

  // ── greenery: grass field + low-poly trees & bushes ──────────────────
  const grassTex = canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = '#3f9c30'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3400; i++) {
      const shade = Math.random();
      ctx.fillStyle = shade < 0.5 ? '#379027' : shade < 0.8 ? '#57bd41' : '#2c7a1f';
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.6, 2.6);
    }
    ctx.globalAlpha = 0.09;
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? '#26721a' : '#72d257';
      ctx.beginPath();
      ctx.ellipse(Math.random() * 256, Math.random() * 256, 40 + Math.random() * 60, 24 + Math.random() * 40, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(26, 26);
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 640),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, metalness: 0 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.55;
  scene.add(grass);

  {
    // deterministic scatter (seeded LCG), counts kept modest for mobile.
    // EDGE proper is declared further down (TDZ) — same formula locally.
    const EDGE = (seats.length * LANE_W) / 2 + 2;
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
    const leafMats = [0x3e8f3e, 0x4da34d, 0x357a35].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
    const rand = (() => { let sx = 1234567; return () => ((sx = (sx * 1103515245 + 12345) >>> 0) / 4294967296); })();
    const addTree = (x: number, z: number, s: number) => {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.2 * s, 1.4 * s, 6), trunkMat);
      trunk.position.y = 0.7 * s;
      t.add(trunk);
      const m = leafMats[Math.floor(rand() * leafMats.length)];
      for (let li = 0; li < 3; li++) {
        const r = (1.15 - li * 0.28) * s;
        const puffM = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 6), m);
        puffM.position.y = (1.5 + li * 0.75) * s;
        puffM.position.x = (rand() - 0.5) * 0.3 * s;
        t.add(puffM);
      }
      t.position.set(x, -0.5, z);
      scene.add(t);
    };
    // near side (camera side, beyond the light poles — clear of the orbit path)
    for (let i = 0; i < 14; i++) addTree(X0 - 25 + rand() * (LEN + 50), EDGE + 10 + rand() * 26, 0.8 + rand() * 1);
    // far side skyline behind the grandstand
    for (let i = 0; i < 12; i++) addTree(X0 - 30 + rand() * (LEN + 60), -EDGE - 26 - rand() * 22, 1.1 + rand() * 1.3);
    // bushes hugging the near barrier
    for (let i = 0; i < 16; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.35 + rand() * 0.3, 7, 5), leafMats[Math.floor(rand() * leafMats.length)]);
      b.position.set(X0 - 5 + rand() * (LEN + 10), -0.25, EDGE + 2.2 + rand() * 1.6);
      b.scale.y = 0.75;
      scene.add(b);
    }
  }

  // checkpoint gates: holo energy curtain + floating rings + ground band.
  // Each gate flashes when a car crosses it (see the rig update loop).
  interface CpGate {
    x: number;
    curtainMat: InstanceType<typeof THREE.MeshBasicMaterial>;
    curtainTex: InstanceType<typeof THREE.CanvasTexture>;
    beamMat: InstanceType<typeof THREE.MeshBasicMaterial>;
    bandMat: InstanceType<typeof THREE.MeshBasicMaterial>;
    rings: InstanceType<typeof THREE.Mesh>[];
    flash: number;
  }
  const cpGates: CpGate[] = [];
  function curtainCanvasTex(): InstanceType<typeof THREE.CanvasTexture> {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(77,208,225,0)');
    grad.addColorStop(0.5, 'rgba(77,208,225,0.55)');
    grad.addColorStop(1, 'rgba(77,208,225,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 256);
    g.fillStyle = 'rgba(160,235,245,0.5)';
    for (let y = 6; y < 256; y += 14) g.fillRect(0, y, 64, 2); // scanlines
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  const gateW = seats.length * LANE_W + 1.6;
  CP.forEach((cp, ci) => {
    const x = X0 + (cp / TRACK) * LEN;
    const gateMat = new THREE.MeshBasicMaterial({ color: 0x4dd0e1, transparent: true, opacity: 0.75 });
    const rings: InstanceType<typeof THREE.Mesh>[] = [];
    for (const side of [-1, 1]) {
      const pz = side * (seats.length * LANE_W) / 2 + side * 0.8;
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 3.4, 8), gateMat);
      pylon.position.set(x, 1.7, pz);
      scene.add(pylon);
      // light rings that drift up the pylons
      for (let r = 0; r < 2; r++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.3, 0.045, 8, 20),
          new THREE.MeshBasicMaterial({ color: 0x8ee7f2, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(x, 0.4 + r * 1.7, pz);
        scene.add(ring);
        rings.push(ring);
      }
    }
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x4dd0e1, transparent: true, opacity: 0.75 });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, gateW), beamMat);
    beam.position.set(x, 3.4, 0);
    scene.add(beam);
    // holo energy curtain under the beam — scrolling scanline texture
    const curtainTex = curtainCanvasTex();
    const curtainMat = new THREE.MeshBasicMaterial({
      map: curtainTex, transparent: true, opacity: 0.34, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(gateW, 3.25), curtainMat);
    curtain.rotation.y = Math.PI / 2; // face along the track (cars pass through)
    curtain.position.set(x, 1.72, 0);
    scene.add(curtain);
    // glowing band on the asphalt
    const bandMat = new THREE.MeshBasicMaterial({ color: 0x4dd0e1, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    const band = new THREE.Mesh(new THREE.PlaneGeometry(1.3, gateW), bandMat);
    band.rotation.x = -Math.PI / 2;
    band.rotation.z = Math.PI / 2;
    band.position.set(x, 0.03, 0);
    scene.add(band);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(`CP${ci + 1}`, '#4dd0e1'), transparent: true, depthTest: false }));
    label.scale.set(1.5, 0.75, 1);
    label.position.set(x, 4.1, 0);
    scene.add(label);
    cpGates.push({ x, curtainMat, curtainTex, beamMat, bandMat, rings, flash: 0 });
  });

  function updateGates(dt: number, now: number) {
    for (let gi = 0; gi < cpGates.length; gi++) {
      const g = cpGates[gi];
      g.flash = Math.max(0, g.flash - dt * 2.2);
      const pulse = 0.75 + 0.25 * Math.sin(now * 0.003 + gi * 2.1);
      const boost = 1 + g.flash * 1.6;
      g.curtainTex.offset.y = -(now * 0.00045) % 1; // slow upward energy scroll
      g.curtainMat.opacity = Math.min(0.95, 0.34 * pulse * boost);
      g.beamMat.opacity = Math.min(1, 0.75 * pulse * boost);
      g.bandMat.opacity = Math.min(0.8, 0.22 * pulse * boost);
      for (let r = 0; r < g.rings.length; r++) {
        const ring = g.rings[r];
        ring.position.y = 0.4 + ((now * 0.0011 + r * 0.85 + gi * 0.4) % 1) * 2.6;
        const rm = ring.material as InstanceType<typeof THREE.MeshBasicMaterial>;
        rm.opacity = (0.5 + 0.5 * (1 - ring.position.y / 3)) * boost;
        const s = 1 + g.flash * 0.5;
        ring.scale.set(s, s, s);
      }
    }
  }
  // ── finish line: checkered wall + road strip + FINISH gantry + pulsing neon ──
  // materials whose opacity breathes in the render loop (base kept in userData)
  const finishPulseMats: InstanceType<typeof THREE.MeshBasicMaterial>[] = [];
  {
    const finEdge = (seats.length * LANE_W) / 2 + 2;
    // muted checker — pure white explodes under the bloom pass
    const mkChecker = (cells: number, cell: number, a = '#7e7e88', b = '#101014') =>
      canvasTex(cells * cell, cells * cell, (ctx) => {
        for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
          ctx.fillStyle = (x + y) % 2 ? a : b;
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      });
    // low checkered barrier — tall wall used to merge with the banner overhead
    const wallTex = mkChecker(8, 8);
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(5, 0.5);
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 1.5, seats.length * LANE_W + 2),
      new THREE.MeshBasicMaterial({ map: wallTex }),
    );
    wall.position.set(X0 + LEN + 1.2, 0.75, 0);
    scene.add(wall);

    // checkered strip painted across the road right at the line
    const stripTex = mkChecker(8, 16, '#9a9aa4', '#141418');
    stripTex.wrapS = stripTex.wrapT = THREE.RepeatWrapping;
    stripTex.repeat.set(1, Math.ceil(seats.length * LANE_W / 2.4));
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, seats.length * LANE_W + 2),
      new THREE.MeshBasicMaterial({ map: stripTex }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(X0 + LEN - 0.9, 0.035, 0);
    scene.add(strip);

    // FINISH gantry: dark legs with pulsing neon edge, checkered banner overhead
    const finX = X0 + LEN + 0.4;
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1c1c26, roughness: 0.4, metalness: 0.7 });
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.6, 0.5), legMat);
      leg.position.set(finX, 3.3, side * (finEdge - 0.1));
      scene.add(leg);
      const neon = new THREE.MeshBasicMaterial({ color: 0xf5c542, transparent: true, opacity: 0.9 });
      neon.userData.base = 0.9;
      finishPulseMats.push(neon);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 6.4, 0.08), neon);
      edge.position.set(finX - 0.3, 3.2, side * (finEdge - 0.1));
      scene.add(edge);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, finEdge * 2 + 0.4), legMat);
    beam.position.set(finX, 6.6, 0);
    scene.add(beam);
    // banner: FINISH between checkered bands, frost-white text (bloom-safe)
    const bannerTex = canvasTex(1024, 256, (ctx) => {
      ctx.fillStyle = 'rgba(12,12,18,0.97)';
      ctx.fillRect(0, 0, 1024, 256);
      for (const yy of [0, 224]) for (let x = 0; x < 32; x++) {
        ctx.fillStyle = (x + (yy ? 1 : 0)) % 2 ? '#8e8e98' : '#101014';
        ctx.fillRect(x * 32, yy, 32, 32);
      }
      ctx.fillStyle = '#ed2f39';
      ctx.fillRect(0, 32, 14, 192); ctx.fillRect(1010, 32, 14, 192);
      ctx.font = '900 150px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#b9c0ce';
      ctx.fillText('FINISH', 512, 130);
    });
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(finEdge * 2 - 1, 2.5),
      new THREE.MeshBasicMaterial({ map: bannerTex, transparent: true, side: THREE.DoubleSide }),
    );
    banner.position.set(finX, 5.1, 0);
    banner.rotation.y = -Math.PI / 2;
    scene.add(banner);
    // soft light shafts falling from the beam onto the line
    for (const side of [-1, 1]) {
      const shaftMat = new THREE.MeshBasicMaterial({
        color: 0xf5c542, transparent: true, opacity: 0.07,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      shaftMat.userData.base = 0.07;
      finishPulseMats.push(shaftMat);
      const shaft = new THREE.Mesh(new THREE.ConeGeometry(1.7, 6.2, 16, 1, true), shaftMat);
      shaft.rotation.x = Math.PI;
      shaft.position.set(finX, 3.4, side * finEdge * 0.45);
      scene.add(shaft);
    }
  }

  // ── trackside dressing: barriers, sponsor boards, light poles, gantry ─
  const EDGE = (seats.length * LANE_W) / 2 + 2;
  {
    // low barriers with a neon stripe on both sides
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24, roughness: 0.5, metalness: 0.5 });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xed2f39 });
    for (const side of [-1, 1]) {
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(LEN + 10, 0.7, 0.3), barrierMat);
      barrier.position.set(0, 0.35, side * EDGE);
      scene.add(barrier);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(LEN + 10, 0.1, 0.32), stripeMat);
      stripe.position.set(0, 0.62, side * EDGE);
      scene.add(stripe);
    }
    // sponsor billboards on the far side (facing the camera side) — a dense,
    // near-continuous sponsor wall running the WHOLE straight, race-track style
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a36, roughness: 0.5, metalness: 0.6 });
    const boardSet = [
      frostbiteTex('BATTLE ARENA'),
      avaxBoardTex('AVAX'),
      boardTex('CAR(D) GAME', '#f5c542'),
      team1Tex(),
      frostbiteTex(),
      avaxBoardTex('AVALANCHE'),
      boardTex('FUJI TESTNET', '#f97316'),
      frostbiteTex('RACING'),
      boardTex('THE ARCADE', '#4dd0e1'),
      team1Tex(),
    ];
    const BW = 6.0, BH = 1.9;           // smaller panels (texture aspect ≈ 3.15)
    // dense wall along the whole straight, but panels sit edge-to-edge with a
    // small gap (spacing > BW) so they never intersect / z-fight
    const BOARD_COUNT = 13;
    const bSpan = LEN - 4, bStep = bSpan / (BOARD_COUNT - 1);
    for (let i = 0; i < BOARD_COUNT; i++) {
      const tex = boardSet[i % boardSet.length];
      const x = X0 + 2 + i * bStep;
      // tiny support legs — the panels rest right on the ground, not on poles
      for (const dz of [-2.2, 2.2]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 8), poleMat);
        pole.position.set(x + dz, 0.35, -EDGE - 2.4);
        scene.add(pole);
      }
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(BW, BH),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      panel.position.set(x, BH / 2 + 0.1, -EDGE - 2.4); // bottom ~ground level
      panel.rotation.x = -0.1;
      scene.add(panel);
    }
    // mirror the sponsor wall onto the NEAR (camera) side too — panels face the
    // far side, so they enrich FAR SIDE / AERIAL / ORBIT without cluttering the
    // default CHASE view (their single-sided backs cull toward the near camera).
    for (let i = 0; i < BOARD_COUNT; i++) {
      const tex = boardSet[(i + 4) % boardSet.length]; // offset so the two walls differ
      const x = X0 + 2 + i * bStep;
      for (const dz of [-2.2, 2.2]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 8), poleMat);
        pole.position.set(x + dz, 0.35, EDGE + 2.4);
        scene.add(pole);
      }
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(BW, BH),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      panel.position.set(x, BH / 2 + 0.1, EDGE + 2.4);
      panel.rotation.y = Math.PI;   // face -z (toward the track / far side)
      panel.rotation.x = 0.1;       // tilt the top toward the track
      scene.add(panel);
    }
    // second, slightly-elevated mega-board row further back for skyline depth
    const megas = [
      avaxBoardTex('AVALANCHE'),
      frostbiteTex('POWERED BY AVAX'),
      avaxBoardTex('AVAX'),
    ];
    megas.forEach((tex, i) => {
      const x = X0 + 10 + i * (LEN - 20) / (megas.length - 1);
      for (const dz of [-5.6, 5.6]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 8), poleMat);
        pole.position.set(x + dz, 0.7, -EDGE - 10);
        scene.add(pole);
      }
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(15, 4.7),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      panel.position.set(x, 2.7, -EDGE - 10); // bottom ~ground level (skyline depth kept by distance)
      panel.rotation.x = -0.08;
      scene.add(panel);
    });
    // glowing light poles on the near side
    const lampGlow = new THREE.MeshBasicMaterial({ color: 0x9fdcff });
    for (let i = 0; i <= 6; i++) {
      const x = X0 + (i * LEN) / 6;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x22222e, roughness: 0.5, metalness: 0.6 }));
      pole.position.set(x, 1.6, EDGE + 1.1);
      scene.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), lampGlow);
      head.position.set(x, 3.25, EDGE + 1.1);
      scene.add(head);
    }
    // START gantry with the game wordmark
    const gantryMat = new THREE.MeshStandardMaterial({ color: 0x22222e, roughness: 0.45, metalness: 0.7 });
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 5.4, 0.22), gantryMat);
      leg.position.set(X0 - 1.5, 2.7, side * (EDGE - 0.4));
      scene.add(leg);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.5, EDGE * 2 - 0.4), gantryMat);
    top.position.set(X0 - 1.5, 5.15, 0);
    scene.add(top);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 2.0),
      new THREE.MeshBasicMaterial({ map: frostbiteTex('CAR(D) GAME'), transparent: true, side: THREE.DoubleSide }),
    );
    banner.position.set(X0 - 1.5, 4.1, 0);
    banner.rotation.y = Math.PI / 2;
    scene.add(banner);
  }

  // ── grandstand: tiered stand + instanced crowd behind the far sponsor wall ─
  // Sits at z < -EDGE-13 so the two billboard rows layer in front of it; the
  // mega row (top ~10.8) stays the tallest silhouette. Crowd is two
  // InstancedMeshes (bodies + heads); on low-end devices it's half-density and
  // static, on desktop it does a slow mexican wave.
  interface CrowdAnim {
    bodies: InstanceType<typeof THREE.InstancedMesh>;
    heads: InstanceType<typeof THREE.InstancedMesh>;
    x: Float32Array; baseY: Float32Array; z: Float32Array; phase: Float32Array;
  }
  const crowds: CrowdAnim[] = [];
  // Build a grandstand on one side (-1 = far, +1 = near/camera side). The near
  // stand sits behind the CHASE camera (z > camera) so it never blocks the
  // default view, but fills out FAR SIDE / AERIAL / ORBIT with a full stadium.
  function buildGrandstand(side: number) {
    const standMat = new THREE.MeshStandardMaterial({ color: 0x232330, roughness: 0.8, metalness: 0.2 });
    const standX = 0, standW = LEN + 8;
    const TIERS = 6;
    const tierZ = (t: number) => side * (EDGE + 14 + t * 1.35);
    for (let t = 0; t < TIERS; t++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(standW, 1.0, 1.5), standMat);
      step.position.set(standX, 1.6 + t * 1.15, tierZ(t));
      scene.add(step);
    }
    // back wall + roof canopy with a bloom-safe neon lip
    const wall = new THREE.Mesh(new THREE.BoxGeometry(standW, 8.4, 0.4), standMat);
    wall.position.set(standX, 4.6, side * (EDGE + 14 + TIERS * 1.35 + 0.6));
    scene.add(wall);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(standW, 0.22, TIERS * 1.35 + 2.4),
      new THREE.MeshStandardMaterial({ color: 0x1a1a24, roughness: 0.6, metalness: 0.5 }));
    roof.position.set(standX, 1.6 + TIERS * 1.15 + 1.7, side * (EDGE + 14 + (TIERS * 1.35) / 2));
    scene.add(roof);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(standW, 0.12, 0.14),
      new THREE.MeshBasicMaterial({ color: 0x4dd0e1 }));
    lip.position.set(standX, roof.position.y - 0.05, side * (EDGE + 13.9));
    scene.add(lip);
    const colMat = new THREE.MeshStandardMaterial({ color: 0x2a2a36, roughness: 0.5, metalness: 0.6 });
    for (let i = 0; i <= 8; i++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, roof.position.y, 8), colMat);
      col.position.set(X0 - 4 + (i * standW) / 8, roof.position.y / 2, side * (EDGE + 14 + TIERS * 1.35 + 0.2));
      scene.add(col);
    }

    // crowd — one seat every ~0.72 units per tier, half density on low-end
    const seatStep = lowEnd ? 1.44 : 0.72;
    const perTier = Math.floor(standW / seatStep);
    const count = perTier * TIERS;
    const bodyGeo = new THREE.BoxGeometry(0.34, 0.52, 0.28);
    const headGeo = new THREE.SphereGeometry(0.13, 6, 5);
    const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), count);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), count);
    // fan palette — no pure white (bloom threshold ~0.82 would blow it out)
    const palette = [0xed2f39, 0x4dd0e1, 0xf5c542, 0xb9c0ce, 0x8f6fe8, 0xf97316, 0x3aa76d, 0x38537a];
    const skins = [0xd9a97e, 0xb07b4f, 0x8a5a33, 0xe8c9a0];
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    const cx = new Float32Array(count), cy = new Float32Array(count), cz = new Float32Array(count), ph = new Float32Array(count);
    // side-dependent salt so the two stands aren't identical fan-for-fan
    const salt = side > 0 ? 4 : 0;
    let idx = 0;
    for (let t = 0; t < TIERS; t++) {
      for (let i = 0; i < perTier; i++, idx++) {
        const x = -standW / 2 + (i + 0.5) * seatStep + (((i * 7 + t * 13) % 5) - 2) * 0.05;
        const y = 1.6 + t * 1.15 + 0.5 + 0.26;
        const z = tierZ(t) + (((i * 3 + t) % 3) - 1) * 0.12;
        cx[idx] = x; cy[idx] = y; cz[idx] = z; ph[idx] = (x * 0.18 + t * 0.7 + salt) % (Math.PI * 2);
        m4.setPosition(x, y, z);
        bodies.setMatrixAt(idx, m4);
        m4.setPosition(x, y + 0.38, z);
        heads.setMatrixAt(idx, m4);
        bodies.setColorAt(idx, col.setHex(palette[(i * 31 + t * 17 + salt) % palette.length]));
        heads.setColorAt(idx, col.setHex(skins[(i * 13 + t * 7) % skins.length]));
      }
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
    scene.add(bodies); scene.add(heads);
    if (!lowEnd) crowds.push({ bodies, heads, x: cx, baseY: cy, z: cz, phase: ph });
  }
  buildGrandstand(-1); // far side (behind the sponsor wall)
  buildGrandstand(1);  // near side (behind the CHASE camera)

  let crowdT = 0;
  let cheerAmt = 0; // 0 = idle wave, 1 = full finish-line frenzy (smoothly blended)
  function updateCrowd(dt: number) {
    if (!crowds.length) return; // low-end: static crowd
    crowdT += dt;
    // cheer while this round has finishers; roundFinishers resets on the next
    // round's snap-back, and never resets after the final round — so the crowd
    // keeps jumping through the end-of-match orbit camera.
    cheerAmt += ((roundFinishers > 0 ? 1 : 0) - cheerAmt) * Math.min(1, dt * 3);
    const m4 = new THREE.Matrix4();
    for (const { bodies, heads, x, baseY, z, phase } of crowds) {
      for (let i = 0; i < x.length; i++) {
        // idle: slow wave rolling along the stand (fans sit between pulses)
        const wave = Math.max(0, Math.sin(crowdT * 2.0 + phase[i])) * 0.22;
        // frenzy: everyone bounces on their own fast rhythm
        const jump = Math.abs(Math.sin(crowdT * 5.5 + phase[i] * 7.3)) * 0.55;
        const lift = wave * (1 - cheerAmt) + jump * cheerAmt;
        m4.setPosition(x[i], baseY[i] + lift, z[i]);
        bodies.setMatrixAt(i, m4);
        m4.setPosition(x[i], baseY[i] + lift + 0.38, z[i]);
        heads.setMatrixAt(i, m4);
      }
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    }
  }

  // ── car factory: per-rarity GLB drop-ins with procedural fallback ────
  async function loadCarTemplate(url: string): Promise<InstanceType<typeof THREE.Object3D> | null> {
    try {
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) return null;
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(url);
      const obj = gltf.scene;
      // Kenney-style kits face +Z; our track runs along +X → rotate the mesh,
      // then normalise: ~2.9 world-units long, centred on X/Z, wheels on y=0.
      obj.rotation.y = Math.PI / 2;
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3(); box.getSize(size);
      const s = 3.3 / Math.max(size.x, size.z, 0.001);
      const wrap = new THREE.Group();
      wrap.add(obj);
      wrap.scale.setScalar(s);
      const c = new THREE.Vector3(); box.getCenter(c);
      obj.position.x -= c.x; obj.position.z -= c.z;
      obj.position.y -= box.min.y; // bottom of wheels sits on the deck
      return wrap;
    } catch { return null; }
  }

  function buildProceduralCar(color: number): InstanceType<typeof THREE.Group> {
    const g = new THREE.Group();
    const vividC = new THREE.Color(color);
    const hsl0 = { h: 0, s: 0, l: 0 };
    vividC.getHSL(hsl0);
    vividC.setHSL(hsl0.h, Math.max(hsl0.s, 0.92), Math.min(Math.max(hsl0.l, 0.5), 0.58));
    const body = new THREE.MeshStandardMaterial({ color: vividC, roughness: 0.28, metalness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0d0d12, roughness: 0.6, metalness: 0.4 });
    const glow = new THREE.MeshBasicMaterial({ color });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.34, 1.1), body);
    hull.position.y = 0.36; g.add(hull);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.9), body);
    nose.position.set(1.45, 0.3, 0); g.add(nose);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.34, 0.82), dark);
    cabin.position.set(-0.1, 0.68, 0); g.add(cabin);
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 1.15), body);
    spoiler.position.set(-1.28, 0.72, 0); g.add(spoiler);
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.06), body);
      fin.position.set(-1.28, 0.56, s * 0.52); g.add(fin);
    }
    // glowing strip + headlight (bloom picks these up)
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.05, 0.06), glow);
    strip.position.set(0.05, 0.55, 0); g.add(strip);
    const head_ = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.7), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    head_.position.set(1.82, 0.32, 0); g.add(head_);
    // wheels
    const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 14);
    wheelGeo.rotateX(Math.PI / 2);
    for (const [wx, wz] of [[0.85, 0.62], [0.85, -0.62], [-0.85, 0.62], [-0.85, -0.62]]) {
      const wheel = new THREE.Mesh(wheelGeo, dark);
      wheel.name = 'wheel-proc';
      wheel.position.set(wx, 0.28, wz);
      g.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 8), glow);
      hub.geometry.rotateX(Math.PI / 2);
      hub.name = 'wheel-proc';
      hub.position.copy(wheel.position);
      g.add(hub);
    }
    return g;
  }

  // Rarity-matched silhouettes (real-car lines): LEGENDARY = open-wheel racer,
  // EPIC = sports sedan, COMMON = hot hatch. car.glb stays the garage default
  // (shown before a vehicle is picked) and the fallback if a variant is missing.
  const [tplDefault, tplLegendary, tplEpic, tplCommon] = await Promise.all([
    loadCarTemplate('/avalanche/cardgame/car.glb'),
    loadCarTemplate('/avalanche/cardgame/car-legendary.glb'),
    loadCarTemplate('/avalanche/cardgame/car-epic.glb'),
    loadCarTemplate('/avalanche/cardgame/car-common.glb'),
  ]);
  const templates: Record<string, InstanceType<typeof THREE.Object3D> | null> = {
    DEFAULT: tplDefault,
    LEGENDARY: tplLegendary ?? tplDefault,
    EPIC: tplEpic ?? tplDefault,
    COMMON: tplCommon ?? tplDefault,
  };

  interface CarRig {
    root: InstanceType<typeof THREE.Group>;
    assembly: InstanceType<typeof THREE.Group>;
    veh: string | null;
    colorHex: number;
    ring: InstanceType<typeof THREE.Mesh>;
    ringMat: InstanceType<typeof THREE.MeshBasicMaterial>;
    flame: InstanceType<typeof THREE.Mesh>;
    label: InstanceType<typeof THREE.Sprite>;
    labelTex: InstanceType<typeof THREE.CanvasTexture>;
    labelCanvas: HTMLCanvasElement;
    lastLabel: string;
    wheels: InstanceType<typeof THREE.Object3D>[];
    wheelAxis: 'x' | 'z';
    trailAcc: number;
    targetX: number; curX: number; speed: number; boosted: boolean; fin: boolean;
    // realism extras
    flameCore: InstanceType<typeof THREE.Mesh>;
    headMats: InstanceType<typeof THREE.SpriteMaterial>[];
    tailMats: InstanceType<typeof THREE.SpriteMaterial>[];
    poolMat: InstanceType<typeof THREE.MeshBasicMaterial>;
    smSpeed: number;   // smoothed speed → accel = speed - smSpeed (pitch/brake)
    smokeAcc: number;
    slipUntil: number;
    lastFx: string | null;
  }
  const rigs = new Map<string, CarRig>();

  // shared radial glow texture for head/tail lights + light pool (tinted per material)
  function radialTex(inner: string, outer: string): InstanceType<typeof THREE.CanvasTexture> {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, inner); grad.addColorStop(1, outer);
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const glowTexture = radialTex('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)');
  const smokeTexture = radialTex('rgba(150,155,165,0.5)', 'rgba(150,155,165,0)');
  const shadowTexture = radialTex('rgba(0,0,0,0.5)', 'rgba(0,0,0,0)'); // soft contact shadow

  // exhaust / slip smoke: pooled sprites, skipped entirely on low-end devices
  const SMOKE_POOL = lowEnd ? 0 : 110;
  interface Puff { sp: InstanceType<typeof THREE.Sprite>; mat: InstanceType<typeof THREE.SpriteMaterial>; vx: number; vy: number; vz: number; born: number; life: number }
  const puffs: (Puff | undefined)[] = new Array(SMOKE_POOL);
  let puffCursor = 0;
  function spawnPuff(x: number, y: number, z: number, dark: boolean) {
    if (!SMOKE_POOL) return;
    let p = puffs[puffCursor];
    if (!p) {
      const mat = new THREE.SpriteMaterial({ map: smokeTexture, transparent: true, opacity: 0.4, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      scene.add(sp);
      p = { sp, mat, vx: 0, vy: 0, vz: 0, born: 0, life: 1 };
      puffs[puffCursor] = p;
    }
    p.sp.visible = true;
    p.sp.position.set(x, y, z);
    p.sp.scale.setScalar(0.16 + Math.random() * 0.1);
    p.mat.opacity = dark ? 0.34 : 0.22;
    p.mat.color.setHex(dark ? 0x565b66 : 0x9aa1ad);
    p.vx = -1.6 - Math.random() * 1.2; p.vy = 0.5 + Math.random() * 0.5; p.vz = (Math.random() - 0.5) * 0.5;
    p.born = performance.now(); p.life = 0.7 + Math.random() * 0.4;
    puffCursor = (puffCursor + 1) % SMOKE_POOL;
  }
  function stepPuffs(now: number, dt: number) {
    for (const p of puffs) {
      if (!p || !p.sp.visible) continue;
      const age = (now - p.born) / 1000;
      if (age > p.life) { p.sp.visible = false; continue; }
      p.sp.position.x += p.vx * dt; p.sp.position.y += p.vy * dt; p.sp.position.z += p.vz * dt;
      p.sp.scale.addScalar(dt * 1.1);
      p.mat.opacity *= 1 - dt * 2.2;
    }
  }

  /** Car body + livery for one vehicle type; swapped in place when the seat
   *  picks a different vehicle for the round. */
  function buildAssembly(veh: string | null, color: number): {
    group: InstanceType<typeof THREE.Group>;
    wheels: InstanceType<typeof THREE.Object3D>[];
    wheelAxis: 'x' | 'z';
  } {
    const template = templates[veh ?? 'DEFAULT'] ?? templates.DEFAULT;
    const group = new THREE.Group();
    const mesh = template ? (template.clone(true) as InstanceType<typeof THREE.Object3D>) : buildProceduralCar(color);
    if (template) {
      // Team paint: recolour only the BRIGHT body panels; dark parts (wheels,
      // glass, vents) keep their factory look. Punch the seat colour up to a
      // vivid, saturated racing livery (the raw lerp read muted in daylight).
      const vivid = new THREE.Color(color);
      const hsl = { h: 0, s: 0, l: 0 };
      vivid.getHSL(hsl);
      vivid.setHSL(hsl.h, Math.max(hsl.s, 0.92), Math.min(Math.max(hsl.l, 0.5), 0.58));
      mesh.traverse((o) => {
        const m = o as InstanceType<typeof THREE.Mesh>;
        if (m.isMesh && m.material && 'color' in (m.material as object)) {
          const mat = (m.material as InstanceType<typeof THREE.MeshStandardMaterial>).clone();
          const lum = mat.color.r * 0.3 + mat.color.g * 0.6 + mat.color.b * 0.1;
          // 0.18: some kit bodies ship with dark factory paint that the old 0.3
          // threshold skipped — those cars stayed murky. Tyres/glass sit ≈0.05.
          if (lum > 0.18) {
            // the kit's colormap texture MULTIPLIES the tint (cyan × orange
            // texel = murky green) — drop it on painted panels for clean paint
            mat.map = null;
            mat.color.copy(vivid);
            mat.roughness = 0.28; // glossy paint catches the sun
            mat.metalness = 0.35;
          }
          m.material = mat;
        }
      });
    } else {
      // procedural geometry is built per assembly → safe to dispose on swap
      mesh.traverse((o: InstanceType<typeof THREE.Object3D>) => { o.userData.ownGeo = true; });
    }

    // ── pronounced contour lines ──────────────────────────────────────
    // Overlay crisp ink edges on every body panel so the low-poly silhouette
    // reads with sharp, defined lines (cel-shaded / technical look). Wheels are
    // skipped (their facets would read as noise). Works for GLB + procedural.
    const inkMat = new THREE.LineBasicMaterial({ color: 0x07070c, transparent: true, opacity: 0.9 });
    const edgeTargets: InstanceType<typeof THREE.Mesh>[] = [];
    mesh.traverse((o) => {
      const m = o as InstanceType<typeof THREE.Mesh>;
      if (m.isMesh && m.geometry && !/wheel/i.test(m.name)) edgeTargets.push(m);
    });
    for (const m of edgeTargets) {
      const edges = new THREE.EdgesGeometry(m.geometry as InstanceType<typeof THREE.BufferGeometry>, 24);
      const line = new THREE.LineSegments(edges, inkMat);
      line.userData.ownGeo = true; // disposed on assembly swap (ownGeo) + material below
      m.add(line);                 // inherits the panel's transform
    }
    group.add(mesh);

    // livery: AVAX badge on the nose + door decals + FROSTBITE banner at the
    // rear — positions derive from the actual mesh bounds so every silhouette
    // (racer / sedan / hatch) wears them correctly
    const bb = new THREE.Box3().setFromObject(mesh);
    const decal = (map: InstanceType<typeof THREE.CanvasTexture>, w: number, h: number, doubleSided = false) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map, transparent: true, ...(doubleSided ? { side: THREE.DoubleSide } : {}) }),
      );
      m.userData.ownGeo = true; m.userData.ownMap = true;
      return m;
    };
    const hood = decal(avaxTex(), 0.82, 0.82);
    hood.rotation.x = -Math.PI / 2;
    hood.position.set(0.55, template ? Math.max(0.4, bb.max.y * 0.62) : 0.58, 0);
    group.add(hood);
    const doorZ = template ? bb.max.z + 0.03 : 0.57; // procedural bbox includes wheels → fixed hull offset
    const doorY = template ? Math.max(0.42, bb.max.y * 0.52) : 0.45;
    for (const s of [-1, 1]) {
      const door = decal(avaxTex(), 0.56, 0.56);
      door.position.set(0.05, doorY, s * doorZ);
      if (s < 0) door.rotation.y = Math.PI;
      group.add(door);
    }
    const wing = decal(frostbiteTex(), 1.35, 0.42, true);
    wing.position.set(-1.45, template ? bb.max.y + 0.08 : 0.98, 0);
    wing.rotation.y = Math.PI / 2;
    group.add(wing);

    // collect spinnable wheel nodes (GLB kits name them wheel-*; procedural uses wheel-proc)
    const wheels: InstanceType<typeof THREE.Object3D>[] = [];
    mesh.traverse((o) => { if (/^wheel/i.test(o.name)) wheels.push(o); });
    return { group, wheels, wheelAxis: template ? 'x' : 'z' };
  }

  /** Swap-time cleanup: dispose cloned materials + per-assembly resources, but
   *  NEVER shared GLB geometry or the shared colormap texture (ownGeo/ownMap
   *  mark what this assembly created itself). Full teardown happens in destroy(). */
  function disposeAssembly(g: InstanceType<typeof THREE.Object3D>) {
    g.traverse((o: InstanceType<typeof THREE.Object3D>) => {
      const anyO = o as unknown as { geometry?: { dispose(): void }; material?: unknown; userData: Record<string, unknown> };
      if (anyO.userData.ownGeo) anyO.geometry?.dispose();
      const mats = Array.isArray(anyO.material) ? anyO.material : anyO.material ? [anyO.material] : [];
      for (const mat of mats as Array<{ dispose(): void; map?: { dispose(): void } | null }>) {
        if (anyO.userData.ownMap) mat.map?.dispose();
        mat.dispose();
      }
    });
  }

  function makeLabel(): { sprite: InstanceType<typeof THREE.Sprite>; tex: InstanceType<typeof THREE.CanvasTexture>; canvas: HTMLCanvasElement } {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(3.4, 0.85, 1);
    return { sprite, tex, canvas };
  }
  function drawLabel(rig: CarRig, text: string, color: string) {
    if (rig.lastLabel === text) return;
    rig.lastLabel = text;
    const ctx = rig.labelCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(6,6,10,0.72)';
    ctx.beginPath(); ctx.roundRect(4, 10, 248, 44, 12); ctx.fill();
    ctx.font = '600 24px "JetBrains Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text.slice(0, 18), 128, 33);
    rig.labelTex.needsUpdate = true;
  }

  seats.forEach((seat, i) => {
    const color = new THREE.Color(seat.color).getHex();
    const root = new THREE.Group();
    const asm = buildAssembly(null, color);
    root.add(asm.group);

    // soft contact shadow — grounds the car on the asphalt (realism)
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.7, 1.8),
      new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(-0.15, 0.011, 0);
    root.add(shadow);

    // under-glow ring (fx indicator)
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.07, 8, 40), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.06;
    root.add(ring);

    // boost flame — outer gold cone + hotter inner core (length scales with speed)
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 1.1, 10),
      new THREE.MeshBasicMaterial({ color: 0xf5a032, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    flame.rotation.z = Math.PI / 2; flame.position.set(-1.9, 0.38, 0);
    root.add(flame);
    const flameCore = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.7, 8),
      new THREE.MeshBasicMaterial({ color: 0xf8e2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    flameCore.rotation.z = Math.PI / 2; flameCore.position.set(-1.75, 0.38, 0);
    root.add(flameCore);

    // headlights: two glow sprites + a light pool cast on the road ahead
    const headMats: InstanceType<typeof THREE.SpriteMaterial>[] = [];
    for (const dz of [-0.42, 0.42]) {
      const m = new THREE.SpriteMaterial({ map: glowTexture, color: 0xc9d4e4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const sp = new THREE.Sprite(m); sp.scale.setScalar(0.34); sp.position.set(1.5, 0.42, dz);
      root.add(sp); headMats.push(m);
    }
    const poolMat = new THREE.MeshBasicMaterial({ map: glowTexture, color: 0x8fa8c9, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.7), poolMat);
    pool.rotation.x = -Math.PI / 2; pool.position.set(3.6, 0.02, 0);
    root.add(pool);

    // taillights: dim red glows, flare on braking
    const tailMats: InstanceType<typeof THREE.SpriteMaterial>[] = [];
    for (const dz of [-0.42, 0.42]) {
      const m = new THREE.SpriteMaterial({ map: glowTexture, color: 0xd23a3a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const sp = new THREE.Sprite(m); sp.scale.setScalar(0.26); sp.position.set(-1.58, 0.45, dz);
      root.add(sp); tailMats.push(m);
    }

    const { sprite, tex, canvas } = makeLabel();
    sprite.position.set(0, 2.1, 0);
    root.add(sprite);

    root.position.set(X0, 0, laneZ(i));
    scene.add(root);
    const rig: CarRig = {
      root, assembly: asm.group, veh: null, colorHex: color,
      ring, ringMat, flame, label: sprite, labelTex: tex, labelCanvas: canvas, lastLabel: '',
      wheels: asm.wheels, wheelAxis: asm.wheelAxis, trailAcc: 0,
      targetX: X0, curX: X0, speed: 0, boosted: false, fin: false,
      flameCore, headMats, tailMats, poolMat, smSpeed: 0, smokeAcc: 0, slipUntil: 0, lastFx: null,
    };
    rigs.set(seat.pid, rig);
    drawLabel(rig, seat.name, seat.color);
  });

  // ── post: bloom for the neon ─────────────────────────────────────────
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // daylight scene: weaker bloom + higher threshold, or the bright sky blows out
  const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.42, 0.55, 0.88);
  composer.addPass(bloom);
  applyWeather(0); // default: sunny day (mounts drive it per round via setWeather)

  // ── finish confetti (transient particle bursts) ──────────────────────
  interface Burst { pts: InstanceType<typeof THREE.Points>; vel: Float32Array; born: number; mat: InstanceType<typeof THREE.PointsMaterial> }
  const bursts: Burst[] = [];
  const CONFETTI_COLORS = [0xed2f39, 0xf5c542, 0x4dd0e1, 0xa78bfa, 0x6ee7a0, 0xffffff];
  const SPARK_COLORS = [0xffb347, 0xf5a032, 0xf6d67c, 0xd94f2a];
  function spawnConfetti(x: number, z: number, big: boolean, palette?: number[]) {
    const n = palette ? 34 : big ? 160 : 60;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = 1.4; pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * (big ? 7 : 4);
      vel[i * 3] = Math.cos(a) * r * 0.45;
      vel[i * 3 + 1] = 4.5 + Math.random() * (big ? 6 : 3.5);
      vel[i * 3 + 2] = Math.sin(a) * r * 0.45;
      c.setHex((palette ?? CONFETTI_COLORS)[i % (palette ?? CONFETTI_COLORS).length]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: big ? 0.16 : 0.12, vertexColors: true, transparent: true, opacity: 1 });
    const pts = new THREE.Points(g, mat);
    scene.add(pts);
    bursts.push({ pts, vel, born: performance.now(), mat });
  }
  function stepConfetti(dt: number) {
    const now = performance.now();
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      const age = (now - b.born) / 1000;
      const attr = b.pts.geometry.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>;
      const arr = attr.array as Float32Array;
      for (let j = 0; j < arr.length; j += 3) {
        b.vel[j + 1] -= 9.5 * dt;
        arr[j] += b.vel[j] * dt; arr[j + 1] += b.vel[j + 1] * dt; arr[j + 2] += b.vel[j + 2] * dt;
        if (arr[j + 1] < 0.02) { arr[j + 1] = 0.02; b.vel[j + 1] = 0; b.vel[j] *= 0.9; b.vel[j + 2] *= 0.9; }
      }
      attr.needsUpdate = true;
      b.mat.opacity = Math.max(0, 1 - age / 2.4);
      if (age > 2.5) {
        scene.remove(b.pts);
        b.pts.geometry.dispose(); b.mat.dispose();
        bursts.splice(i, 1);
      }
    }
  }

  // ── boost tyre trails: pooled glowing marks laid behind the rear wheels ──
  const TRAIL_POOL = 240;
  const markGeo = new THREE.PlaneGeometry(0.62, 0.11);
  interface Mark { mesh: InstanceType<typeof THREE.Mesh>; mat: InstanceType<typeof THREE.MeshBasicMaterial>; born: number }
  const markPool: (Mark | undefined)[] = new Array(TRAIL_POOL);
  let markCursor = 0;
  function spawnMark(x: number, z: number) {
    let m = markPool[markCursor];
    if (!m) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xf5c542, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(markGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      scene.add(mesh);
      m = { mesh, mat, born: 0 };
      markPool[markCursor] = m;
    }
    markCursor = (markCursor + 1) % TRAIL_POOL;
    m.born = performance.now();
    m.mesh.position.set(x, 0.015 + (markCursor % 3) * 0.001, z); // tiny y-jitter avoids z-fighting
    m.mesh.visible = true;
  }
  function stepMarks(now: number) {
    for (const m of markPool) {
      if (!m || !m.mesh.visible) continue;
      const age = (now - m.born) / 1000;
      if (age > 1.15) m.mesh.visible = false;
      else m.mat.opacity = 0.8 * (1 - age / 1.15);
    }
  }

  // ── boost floor sparks (F1 skid-block style): one pooled Points buffer ──
  // Emitted from the diffuser under hard boost; skitter along the ground and
  // fade — a single draw call, skipped on low-end devices.
  const SPARK_N = lowEnd ? 0 : 140;
  const sparkPos = new Float32Array(Math.max(1, SPARK_N) * 3).fill(-999);
  const sparkVel = new Float32Array(Math.max(1, SPARK_N) * 3);
  const sparkLife = new Float32Array(Math.max(1, SPARK_N));
  let sparkCursor = 0;
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkPts = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: 0xffb14a, size: 0.1, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  if (SPARK_N) scene.add(sparkPts);
  function emitSpark(x: number, z: number) {
    if (!SPARK_N) return;
    const i = sparkCursor; sparkCursor = (sparkCursor + 1) % SPARK_N;
    sparkPos[i * 3] = x; sparkPos[i * 3 + 1] = 0.09; sparkPos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
    sparkVel[i * 3] = -(2.5 + Math.random() * 3.5);       // shoot backward
    sparkVel[i * 3 + 1] = 0.5 + Math.random() * 1.4;      // small hop
    sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 1.8;    // fan out
    sparkLife[i] = 0.3 + Math.random() * 0.28;
  }
  function stepSparks(dt: number) {
    if (!SPARK_N) return;
    for (let i = 0; i < SPARK_N; i++) {
      if (sparkLife[i] <= 0) continue;
      sparkLife[i] -= dt;
      sparkVel[i * 3 + 1] -= 15 * dt;                     // gravity
      sparkPos[i * 3] += sparkVel[i * 3] * dt;
      sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
      sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      if (sparkPos[i * 3 + 1] < 0.04) {                   // skitter along the deck
        sparkPos[i * 3 + 1] = 0.04; sparkVel[i * 3 + 1] = -sparkVel[i * 3 + 1] * 0.4; sparkVel[i * 3] *= 0.6;
      }
      if (sparkLife[i] <= 0) sparkPos[i * 3 + 1] = -999;  // park off-screen
    }
    (sparkGeo.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>).needsUpdate = true;
  }

  // ── camera: cinematic side-chase; slow orbit once everyone finished ──
  let camX = X0 + 8;
  let orbitA = -1; // <0 → chase mode
  const desiredPos = new THREE.Vector3();
  const lookAtV = new THREE.Vector3();
  function updateCamera(dt: number) {
    let lead = X0;
    let allFin = rigs.size > 0;
    for (const rig of rigs.values()) { lead = Math.max(lead, rig.curX); if (!rig.fin) allFin = false; }
    if (allFin) {
      if (orbitA < 0) orbitA = Math.PI * 0.65;
      orbitA += dt * 0.28;
      const fx = X0 + LEN - 4;
      desiredPos.set(fx + Math.cos(orbitA) * 15, 7.5, Math.sin(orbitA) * 15);
      lookAtV.set(fx - 2, 0.6, 0);
    } else {
      orbitA = -1;
      const target = Math.min(Math.max(lead, X0 + 6), X0 + LEN - 8);
      camX += (target - camX) * Math.min(1, dt * 2.2);
      const cx = camX, halfW = (seats.length * LANE_W) / 2;
      // camera.position.lerp below smooths the switch between any two modes
      switch (camMode) {
        case 1: // AERIAL — high, looking down the straight
          desiredPos.set(cx - 2, 26, 8); lookAtV.set(cx + 8, 0, 0); break;
        case 2: // TRACKSIDE — low & dramatic on the near rail
          desiredPos.set(cx + 3, 2.4, halfW + 8); lookAtV.set(cx + 1, 1.2, 0); break;
        case 3: // FAR SIDE — reverse angle from the billboard side
          desiredPos.set(cx + 5, 7.5, -(halfW + 14)); lookAtV.set(cx - 1, 1, 0); break;
        case 4: // ORBIT — continuous rotation around the leader
          userOrbitA += dt * 0.4;
          desiredPos.set(cx + Math.cos(userOrbitA) * 15, 8, Math.sin(userOrbitA) * 15);
          lookAtV.set(cx, 1, 0); break;
        default: // 0 CHASE — original cinematic side-chase
          desiredPos.set(cx - 10, 10, halfW + 12); lookAtV.set(cx + 7, 0.1, -1);
      }
    }
    camera.position.lerp(desiredPos, Math.min(1, dt * 2.5));
    camera.lookAt(lookAtV);
  }

  // ── snapshot intake (10 Hz) + 60 fps lerp loop ───────────────────────
  const names: Record<string, string> = Object.fromEntries(seats.map((s) => [s.pid, s.name]));
  let roundFinishers = 0;
  function update(cars: CarSnap[]) {
    // Defensive: this runs synchronously inside the game tick — a renderer bug
    // must never be able to kill the game loop (purity: view can't affect play).
    try { updateInner(cars); } catch { /* render-only failure; next tick retries */ }
  }
  function updateInner(cars: CarSnap[]) {
    for (const c of cars) {
      const rig = rigs.get(c.pid); if (!rig) continue;
      // vehicle changed (round pick) → swap in the rarity-matched silhouette
      const veh = c.veh ?? null;
      if (veh !== rig.veh) {
        rig.veh = veh;
        const next = buildAssembly(veh, rig.colorHex);
        rig.root.remove(rig.assembly);
        disposeAssembly(rig.assembly);
        rig.assembly = next.group;
        rig.wheels = next.wheels;
        rig.wheelAxis = next.wheelAxis;
        rig.root.add(next.group);
      }
      rig.targetX = X0 + (Math.min(c.dist, TRACK) / TRACK) * LEN;
      // round reset: dist jumped back to 0 → snap instead of lerping backwards
      if (rig.targetX + 12 < rig.curX) { rig.curX = rig.targetX; roundFinishers = 0; }
      // finish-line celebration: confetti on the fin transition (big for P1 of the round)
      if (c.fin && !rig.fin) {
        roundFinishers += 1;
        spawnConfetti(X0 + LEN, rig.root.position.z, roundFinishers === 1);
      }
      rig.speed = c.speed; rig.boosted = c.boosted; rig.fin = c.fin;
      const fxc = c.fx ? FX_COLOR[c.fx] : undefined;
      if (fxc !== undefined) { rig.ringMat.color.setHex(fxc); rig.ringMat.opacity = 0.85; }
      else rig.ringMat.opacity = Math.max(0, rig.ringMat.opacity - 0.1);
      // debuff hits: NAIL → spark burst, OIL → a moment of slip wobble + smoke
      if (c.fx !== rig.lastFx && !c.fin) {
        if (c.fx === 'fx-hit') spawnConfetti(rig.curX, rig.root.position.z, false, SPARK_COLORS);
        if (c.fx === 'fx-oil') rig.slipUntil = performance.now() + 1300;
        rig.lastFx = c.fx;
      } else if (!c.fx) rig.lastFx = null;
      const seat = seatByPid.get(c.pid)!;
      drawLabel(rig, `${names[c.pid] ?? c.pid}${c.veh ? ' · ' + c.veh[0] : ''}${c.fin ? ' ✔' : ''}`, seat.color);
    }
  }

  let raf = 0;
  let last = performance.now();
  let alive = true;
  const clockTick = () => {
    if (!alive) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const rig of rigs.values()) {
      const prevX = rig.curX;
      rig.curX += (rig.targetX - rig.curX) * Math.min(1, dt * 9);
      // gate flash when a car passes through a checkpoint (forward crossings only)
      if (rig.curX > prevX) {
        for (const g of cpGates) {
          if (prevX < g.x && rig.curX >= g.x) g.flash = 1;
        }
      }
      rig.root.position.x = rig.curX;
      const moving = !rig.fin && rig.speed > 0.1;
      // subtle life: bob while moving
      rig.root.position.y = moving ? Math.sin(now * 0.02 + rig.curX) * 0.02 : 0;
      rig.ring.rotation.z = now * 0.004;

      // ── realism pass ──
      // smoothed speed → accel drives pitch (nose up on throttle, dip on brake)
      const accel = rig.speed - rig.smSpeed;
      rig.smSpeed += accel * Math.min(1, dt * 4);
      const pitchTarget = moving ? Math.max(-0.07, Math.min(0.09, accel * 0.012)) : 0;
      rig.assembly.rotation.z += (pitchTarget - rig.assembly.rotation.z) * Math.min(1, dt * 6);
      // oil slip: brief fishtail wobble
      if (now < rig.slipUntil) {
        rig.assembly.rotation.y = Math.sin(now * 0.02) * 0.14;
        if (Math.random() < dt * 14) spawnPuff(rig.curX - 1.2, 0.22, rig.root.position.z + (Math.random() - 0.5) * 0.8, true);
      } else {
        rig.assembly.rotation.y *= Math.max(0, 1 - dt * 8);
      }
      // headlights + road pool (night scene): on while racing, off after finish
      const lightsOn = !rig.fin;
      for (const m of rig.headMats) m.opacity += ((lightsOn ? 0.85 : 0) - m.opacity) * Math.min(1, dt * 6);
      rig.poolMat.opacity += ((lightsOn && moving ? 0.16 : 0) - rig.poolMat.opacity) * Math.min(1, dt * 6);
      // taillights: dim glow, flaring bright while decelerating
      const braking = moving && accel < -0.9;
      for (const m of rig.tailMats) m.opacity += ((rig.fin ? 0.08 : braking ? 1 : 0.3) - m.opacity) * Math.min(1, dt * 10);
      // twin-layer exhaust flame: length tracks boost intensity, core flickers hotter
      const boostRatio = Math.min(1, Math.max(0, (rig.speed - 10) / 30));
      const flameOn = rig.boosted && moving;
      const fMat = rig.flame.material as InstanceType<typeof THREE.MeshBasicMaterial>;
      const fcMat = rig.flameCore.material as InstanceType<typeof THREE.MeshBasicMaterial>;
      fMat.opacity += ((flameOn ? 0.9 : 0) - fMat.opacity) * Math.min(1, dt * 12);
      fcMat.opacity += ((flameOn ? 0.95 : 0) - fcMat.opacity) * Math.min(1, dt * 12);
      const flick = 0.85 + Math.sin(now * 0.045 + rig.curX) * 0.3;
      rig.flame.scale.x = (0.7 + boostRatio * 1.3) * flick;
      rig.flameCore.scale.x = (0.6 + boostRatio * 1.1) * (0.8 + Math.sin(now * 0.08) * 0.25);
      // exhaust smoke: light haze at cruise, heavy on boost
      if (moving) {
        rig.smokeAcc += dt * (rig.boosted ? 22 : 5);
        while (rig.smokeAcc > 1) {
          rig.smokeAcc -= 1;
          spawnPuff(rig.curX - 1.85, 0.34, rig.root.position.z + (Math.random() - 0.5) * 0.16, false);
        }
      }
      // wheel spin: angular velocity = ground speed / wheel radius (boost = visibly faster)
      if (moving) {
        const ang = rig.speed * WHEEL_SPIN_K * dt;
        for (const w of rig.wheels) {
          if (rig.wheelAxis === 'x') w.rotation.x += ang; else w.rotation.z += ang;
        }
      }
      // boost: lay glowing tyre trails behind the rear wheels + floor sparks
      if (rig.boosted && moving) {
        rig.trailAcc += dt;
        while (rig.trailAcc > 0.05) {
          rig.trailAcc -= 0.05;
          spawnMark(rig.curX - 0.95, rig.root.position.z - 0.5);
          spawnMark(rig.curX - 0.95, rig.root.position.z + 0.5);
        }
        // F1 diffuser sparks — a couple per frame while boosting hard
        if (Math.random() < 0.7) emitSpark(rig.curX - 1.75, rig.root.position.z);
        if (Math.random() < 0.4) emitSpark(rig.curX - 1.75, rig.root.position.z);
      } else rig.trailAcc = 0;
    }
    updateCamera(dt);
    updateCrowd(dt);
    updateGates(dt, now);
    stepConfetti(dt);
    stepSparks(dt);
    stepPuffs(now, dt);
    stepPrecip(dt, now);
    stepMarks(now);
    // finish-line neon breathes
    const finPulse = 0.62 + 0.38 * Math.sin(now * 0.005);
    for (const m of finishPulseMats) m.opacity = (m.userData.base as number) * finPulse;
    composer.render();
    raf = requestAnimationFrame(clockTick);
  };
  raf = requestAnimationFrame(clockTick);

  // Pause the render loop while the tab is hidden — no GPU work / battery drain
  // on a background tab. Reset `last` on resume so dt doesn't jump (it's clamped
  // anyway). Context-loss sets alive=false, so this won't revive a dead context.
  const onVis = () => {
    if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    else if (alive && !raf) { last = performance.now(); raf = requestAnimationFrame(clockTick); }
  };
  document.addEventListener('visibilitychange', onVis);

  function resize() {
    const w = W(), h = H();
    camera.aspect = w / h;
    // portrait (mobile fullscreen): widen the FOV so the pack stays in frame
    camera.fov = camera.aspect < 0.9 ? 64 : 46;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h); composer.setSize(w, h);
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // context loss: stop the loop cleanly instead of spamming GL errors
  const onCtxLost = (e: Event) => { e.preventDefault(); alive = false; cancelAnimationFrame(raf); };
  renderer.domElement.addEventListener('webglcontextlost', onCtxLost, false);

  /** Dispose geometry + material(s) + any material textures for one object. */
  function disposeObject(o: InstanceType<typeof THREE.Object3D>) {
    const anyO = o as unknown as { geometry?: { dispose(): void }; material?: unknown; isInstancedMesh?: boolean; dispose?: () => void };
    // InstancedMesh keeps instanceMatrix/instanceColor GPU buffers of its own
    if (anyO.isInstancedMesh) anyO.dispose?.();
    anyO.geometry?.dispose();
    const mats = Array.isArray(anyO.material) ? anyO.material : anyO.material ? [anyO.material] : [];
    for (const mat of mats as Array<{ dispose(): void; map?: { dispose(): void } | null }>) {
      mat.map?.dispose();
      mat.dispose();
    }
  }

  return {
    update,
    setNames(n) { Object.assign(names, n); },
    setWeather(round) { applyWeather(round); },
    resize,
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onCtxLost);
      // in-flight confetti bursts live outside the static scene bookkeeping
      for (const b of bursts) { scene.remove(b.pts); b.pts.geometry.dispose(); b.mat.dispose(); }
      bursts.length = 0;
      // meshes, sprites, points, lines — plus their canvas textures
      scene.traverse(disposeObject);
      // GLB templates (never added to the scene) hold the original materials;
      // fallback aliases may repeat a template — double dispose is harmless
      for (const tpl of Object.values(templates)) tpl?.traverse(disposeObject);
      bloom.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // release the GL context (browsers cap ~16)
      renderer.domElement.remove();
      camBtn.remove();
    },
  };
}
