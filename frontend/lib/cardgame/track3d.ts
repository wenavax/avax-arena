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
  resize(): void;
  destroy(): void;
}

const TRACK = 1000;           // engine units
const LANE_W = 3.2;           // world units per lane
const LEN = 90;               // world length of the straight
const X0 = -LEN / 2;
const CP = [250, 500, 750];

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

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W(), H());
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.borderRadius = '14px';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a0a10, 60, 160);
  scene.background = new THREE.Color(0x0a0a10);

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
  /** Simplified Avalanche mark: white mountain "A" on the AVAX red disc. */
  const avaxTex = () => canvasTex(128, 128, (ctx) => {
    ctx.fillStyle = '#e84142';
    ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(64, 26); ctx.lineTo(104, 96); ctx.lineTo(76, 96);
    ctx.lineTo(58, 64); ctx.lineTo(40, 96); ctx.lineTo(24, 96); ctx.closePath(); ctx.fill();
  });
  /** FROST(white)BITE(red) wordmark on translucent dark. 1024×320 (3.2:1). */
  const frostbiteTex = (sub?: string) => canvasTex(1024, 320, (ctx) => {
    ctx.fillStyle = 'rgba(10,10,16,0.94)';
    ctx.beginPath(); ctx.roundRect(4, 4, 1016, 312, 34); ctx.fill();
    ctx.strokeStyle = 'rgba(237,47,57,0.7)'; ctx.lineWidth = 10; ctx.stroke();
    ctx.font = '900 150px Impact, "Arial Black", sans-serif';
    ctx.textBaseline = 'middle';
    const y = sub ? 128 : 160;
    const fw = ctx.measureText('FROST').width;
    const bw = ctx.measureText('BITE').width;
    const x0 = (1024 - fw - bw) / 2;
    ctx.fillStyle = '#ffffff'; ctx.fillText('FROST', x0, y);
    ctx.fillStyle = '#ed2f39'; ctx.fillText('BITE', x0 + fw, y);
    if (sub) {
      ctx.font = '700 62px "Arial", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = 'center';
      ctx.fillText(sub, 512, 250);
    }
  });
  const boardTex = (text: string, accent: string) => canvasTex(1024, 320, (ctx) => {
    ctx.fillStyle = 'rgba(12,12,18,0.96)';
    ctx.beginPath(); ctx.roundRect(4, 4, 1016, 312, 28); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 12; ctx.stroke();
    ctx.font = '900 132px Impact, "Arial Black", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    ctx.fillText(text, 512, 164);
  });
  const tagTex = (text: string, color: string) => canvasTex(128, 64, (ctx) => {
    ctx.font = '900 40px "Arial Black", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 34);
  });

  // ── lighting ─────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x8899bb, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(-20, 30, 18);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x4dd0e1, 0.5);
  rim.position.set(30, 12, -24);
  scene.add(rim);

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
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(LEN + 14, 0.5, seats.length * LANE_W + 4),
    new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92, metalness: 0.06 }),
  );
  deck.position.set(0, -0.26, 0);
  scene.add(deck);

  const laneZ = (i: number) => (i - (seats.length - 1) / 2) * LANE_W;
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x2b2b38 });
  for (let i = 0; i <= seats.length; i++) {
    const z = laneZ(i - 0.5) + LANE_W / 2;
    const line = new THREE.Mesh(new THREE.BoxGeometry(LEN + 8, 0.02, 0.07), lineMat);
    line.position.set(0, 0.02, z - LANE_W / 2);
    scene.add(line);
  }

  // neon horizon grid (synthwave backdrop, cheap: GridHelper)
  const grid = new THREE.GridHelper(400, 80, 0x4dd0e1, 0x1a2030);
  (grid.material as InstanceType<typeof THREE.Material>).transparent = true;
  (grid.material as InstanceType<typeof THREE.Material>).opacity = 0.22;
  grid.position.y = -0.6;
  scene.add(grid);

  const stars = (() => {
    const g = new THREE.BufferGeometry();
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 400;
      pos[i * 3 + 1] = 12 + Math.random() * 120;
      pos[i * 3 + 2] = -40 - Math.random() * 220;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfd8ff, size: 0.5, sizeAttenuation: true, transparent: true, opacity: 0.8 }));
  })();
  scene.add(stars);

  // checkpoint gates + finish wall
  const gateMat = new THREE.MeshBasicMaterial({ color: 0x4dd0e1, transparent: true, opacity: 0.75 });
  CP.forEach((cp, ci) => {
    const x = X0 + (cp / TRACK) * LEN;
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 8), gateMat);
      pylon.position.set(x, 1.7, side * (seats.length * LANE_W) / 2 + side * 0.8);
      scene.add(pylon);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, seats.length * LANE_W + 1.6), gateMat);
    beam.position.set(x, 3.4, 0);
    scene.add(beam);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(`CP${ci + 1}`, '#4dd0e1'), transparent: true, depthTest: false }));
    label.scale.set(1.5, 0.75, 1);
    label.position.set(x, 4.1, 0);
    scene.add(label);
  });
  {
    // checkered finish
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      // muted checker — pure white explodes under the bloom pass
      ctx.fillStyle = (x + y) % 2 ? '#7e7e88' : '#101014';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 2);
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 4.4, seats.length * LANE_W + 2),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    wall.position.set(X0 + LEN + 1.2, 2.2, 0);
    scene.add(wall);
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
    // sponsor billboards on the far side (facing the camera side)
    const boards = [
      frostbiteTex('BATTLE ARENA'),
      boardTex('AVAX ▲', '#e84142'),
      boardTex('CAR(D) GAME', '#f5c542'),
      frostbiteTex(),
      boardTex('FUJI TESTNET', '#f97316'),
    ];
    boards.forEach((tex, i) => {
      const x = X0 + 8 + i * (LEN - 16) / (boards.length - 1);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a36, roughness: 0.5, metalness: 0.6 });
      for (const dz of [-2.9, 2.9]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.6, 8), poleMat);
        pole.position.set(x + dz, 1.8, -EDGE - 2.4);
        scene.add(pole);
      }
      // big readable panels, tilted a touch toward the camera side
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(7.8, 2.45),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      panel.position.set(x, 4.4, -EDGE - 2.4);
      panel.rotation.x = -0.1;
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

  // ── car factory: GLB drop-in with procedural low-poly fallback ───────
  async function loadCarTemplate(): Promise<InstanceType<typeof THREE.Object3D> | null> {
    try {
      const head = await fetch('/avalanche/cardgame/car.glb', { method: 'HEAD' });
      if (!head.ok) return null;
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync('/avalanche/cardgame/car.glb');
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
    const body = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.75 });
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

  const template = await loadCarTemplate();

  interface CarRig {
    root: InstanceType<typeof THREE.Group>;
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
  }
  const rigs = new Map<string, CarRig>();

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
    const mesh = template ? (template.clone(true) as InstanceType<typeof THREE.Object3D>) : buildProceduralCar(color);
    if (template) {
      // Team paint: recolour only the BRIGHT body panels toward the saturated
      // seat colour; dark parts (wheels, glass, vents) keep their factory look.
      mesh.traverse((o) => {
        const m = o as InstanceType<typeof THREE.Mesh>;
        if (m.isMesh && m.material && 'color' in (m.material as object)) {
          const mat = (m.material as InstanceType<typeof THREE.MeshStandardMaterial>).clone();
          const lum = mat.color.r * 0.3 + mat.color.g * 0.6 + mat.color.b * 0.1;
          if (lum > 0.3) mat.color.lerp(new THREE.Color(color), 0.85);
          m.material = mat;
        }
      });
    }
    root.add(mesh);

    // livery: AVAX badge on the nose + FROSTBITE banner on the rear wing
    const hood = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.52),
      new THREE.MeshBasicMaterial({ map: avaxTex(), transparent: true }),
    );
    hood.rotation.x = -Math.PI / 2;
    hood.position.set(0.55, template ? 0.76 : 0.58, 0);
    root.add(hood);
    const wing = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 0.42),
      new THREE.MeshBasicMaterial({ map: frostbiteTex(), transparent: true, side: THREE.DoubleSide }),
    );
    wing.position.set(-1.55, template ? 1.02 : 0.98, 0);
    wing.rotation.y = Math.PI / 2;
    root.add(wing);

    // under-glow ring (fx indicator)
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.07, 8, 40), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.06;
    root.add(ring);

    // boost flame
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 1.1, 10),
      new THREE.MeshBasicMaterial({ color: 0xf5c542, transparent: true, opacity: 0 }),
    );
    flame.rotation.z = Math.PI / 2; flame.position.set(-1.9, 0.38, 0);
    root.add(flame);

    const { sprite, tex, canvas } = makeLabel();
    sprite.position.set(0, 2.1, 0);
    root.add(sprite);

    root.position.set(X0, 0, laneZ(i));
    scene.add(root);
    // collect spinnable wheel nodes (GLB kits name them wheel-*; procedural uses wheel-proc)
    const wheels: InstanceType<typeof THREE.Object3D>[] = [];
    mesh.traverse((o) => { if (/^wheel/i.test(o.name)) wheels.push(o); });
    const rig: CarRig = {
      root, ring, ringMat, flame, label: sprite, labelTex: tex, labelCanvas: canvas, lastLabel: '',
      wheels, wheelAxis: template ? 'x' : 'z', trailAcc: 0,
      targetX: X0, curX: X0, speed: 0, boosted: false, fin: false,
    };
    rigs.set(seat.pid, rig);
    drawLabel(rig, seat.name, seat.color);
  });

  // ── post: bloom for the neon ─────────────────────────────────────────
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.75, 0.6, 0.82);
  composer.addPass(bloom);

  // ── finish confetti (transient particle bursts) ──────────────────────
  interface Burst { pts: InstanceType<typeof THREE.Points>; vel: Float32Array; born: number; mat: InstanceType<typeof THREE.PointsMaterial> }
  const bursts: Burst[] = [];
  const CONFETTI_COLORS = [0xed2f39, 0xf5c542, 0x4dd0e1, 0xa78bfa, 0x6ee7a0, 0xffffff];
  function spawnConfetti(x: number, z: number, big: boolean) {
    const n = big ? 160 : 60;
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
      c.setHex(CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
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
      desiredPos.set(camX - 10, 10, (seats.length * LANE_W) / 2 + 12);
      lookAtV.set(camX + 7, 0.1, -1);
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
      (rig.flame.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = c.boosted && !c.fin ? 0.95 : 0;
      const seat = seats.find((s) => s.pid === c.pid)!;
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
      rig.curX += (rig.targetX - rig.curX) * Math.min(1, dt * 9);
      rig.root.position.x = rig.curX;
      const moving = !rig.fin && rig.speed > 0.1;
      // subtle life: bob while moving
      rig.root.position.y = moving ? Math.sin(now * 0.02 + rig.curX) * 0.02 : 0;
      rig.flame.scale.x = 0.8 + Math.sin(now * 0.045) * 0.35;
      rig.ring.rotation.z = now * 0.004;
      // wheel spin: angular velocity = ground speed / wheel radius (boost = visibly faster)
      if (moving) {
        const ang = ((rig.speed * (LEN / TRACK)) / 0.26) * dt * 1.7;
        for (const w of rig.wheels) {
          if (rig.wheelAxis === 'x') w.rotation.x += ang; else w.rotation.z += ang;
        }
      }
      // boost: lay glowing tyre trails behind the rear wheels
      if (rig.boosted && moving) {
        rig.trailAcc += dt;
        while (rig.trailAcc > 0.05) {
          rig.trailAcc -= 0.05;
          spawnMark(rig.curX - 0.95, rig.root.position.z - 0.5);
          spawnMark(rig.curX - 0.95, rig.root.position.z + 0.5);
        }
      } else rig.trailAcc = 0;
    }
    updateCamera(dt);
    stepConfetti(dt);
    stepMarks(now);
    stars.rotation.y = now * 0.000012;
    composer.render();
    raf = requestAnimationFrame(clockTick);
  };
  raf = requestAnimationFrame(clockTick);

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
    const anyO = o as unknown as { geometry?: { dispose(): void }; material?: unknown };
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
    resize,
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onCtxLost);
      // in-flight confetti bursts live outside the static scene bookkeeping
      for (const b of bursts) { scene.remove(b.pts); b.pts.geometry.dispose(); b.mat.dispose(); }
      bursts.length = 0;
      // meshes, sprites, points, lines — plus their canvas textures
      scene.traverse(disposeObject);
      // the GLB template (never added to the scene) holds the original materials
      template?.traverse(disposeObject);
      bloom.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // release the GL context (browsers cap ~16)
      renderer.domElement.remove();
    },
  };
}
