'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type Palette = { body: string; belly: string; beak: string };
type Sprite = { name: string; t1: string; t2: string; palette: Palette; withScarf: boolean };
type DiaryEntry = { day: number; time: string; html: string };

const PALETTES: Palette[] = [
  { body: '#7DD3FC', belly: '#E8F4FD', beak: '#FFB86B' },
  { body: '#9D8CFF', belly: '#EFEAFF', beak: '#FF9EC4' },
  { body: '#5FF2C0', belly: '#E7FFF6', beak: '#FFD166' },
  { body: '#6FA8FF', belly: '#EAF2FF', beak: '#FF8FA3' },
  { body: '#8BE3FF', belly: '#F2FBFF', beak: '#FFC078' },
];
const NAMES = ['Pip', 'Nimbus', 'Glacia', 'Frosty', 'Skadi', 'Boreal', 'Lumi', 'Tundra', 'Yuki', 'Aster', 'Mochi', 'Sleet'];
const TRAITS_A = ['Bold', 'Social', 'Curious', 'Shy', 'Dramatic', 'Loyal'];
const TRAITS_B = ['Night Owl', 'Early Bird', 'Gift Giver', 'Gossip', 'Daydreamer', 'Snow Chef'];

const TEMPLATES: ((n: string) => string)[] = [
  (n) => `<b>${n}</b> met a sprite named <b>${rnd(NAMES)}</b> at the Frozen Lake. They argued about who owns the best ice cave, then made up over snow tea.`,
  (n) => `<b>${n}</b> found a glittering shard near the Aurora Cliffs and gave it to <b>${rnd(NAMES)}</b> as a gift. +2 friendship.`,
  (n) => `<b>${n}</b> stayed up all night watching the aurora with <b>${rnd(NAMES)}</b>. They might be falling in love. It's complicated.`,
  (n) => `<b>${n}</b> started a snowball fight in the village square. Three sprites joined. <b>${rnd(NAMES)}</b> is still mad about it.`,
  (n) => `<b>${n}</b> overheard gossip about <b>${rnd(NAMES)}</b> and couldn't keep it secret. Drama level: rising.`,
  (n) => `<b>${n}</b> cooked frost-berry stew for the whole cave. Everyone loved it except <b>${rnd(NAMES)}</b>, who is "allergic to joy".`,
  (n) => `<b>${n}</b> wandered too far north and got lost for six hours. <b>${rnd(NAMES)}</b> organized the search party.`,
];

function rnd<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function SpriteSvg({ palette, withScarf, className }: { palette: Palette; withScarf: boolean; className?: string }) {
  const p = palette;
  return (
    <svg className={className ?? 'sprite-svg'} viewBox="0 0 120 120" role="img" aria-label="Frost Sprite character">
      <ellipse cx="60" cy="106" rx="30" ry="6" fill="rgba(0,0,0,.25)" />
      <ellipse cx="60" cy="66" rx="34" ry="40" fill={p.body} />
      <ellipse cx="60" cy="74" rx="22" ry="28" fill={p.belly} />
      <ellipse cx="30" cy="70" rx="9" ry="20" fill={p.body} transform="rotate(18 30 70)" />
      <ellipse cx="90" cy="70" rx="9" ry="20" fill={p.body} transform="rotate(-18 90 70)" />
      <ellipse cx="48" cy="104" rx="9" ry="5" fill={p.beak} />
      <ellipse cx="72" cy="104" rx="9" ry="5" fill={p.beak} />
      <circle cx="49" cy="54" r="5.5" fill="#0B1426" />
      <circle cx="71" cy="54" r="5.5" fill="#0B1426" />
      <circle cx="51" cy="52" r="1.8" fill="#fff" />
      <circle cx="73" cy="52" r="1.8" fill="#fff" />
      <polygon points="60,60 53,67 67,67" fill={p.beak} />
      {withScarf && (
        <>
          <rect x="38" y="80" width="44" height="9" rx="4.5" fill={p.beak} opacity=".9" />
          <rect x="66" y="84" width="9" height="18" rx="4.5" fill={p.beak} opacity=".9" />
        </>
      )}
      <path d="M44 30 Q60 18 76 30" stroke={p.belly} strokeWidth="3" fill="none" opacity=".5" />
    </svg>
  );
}

export default function Landing() {
  const [sprite, setSprite] = useState<Sprite | null>(null);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [email, setEmail] = useState('');
  const [joinMsg, setJoinMsg] = useState('');
  const snowRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = snowRef.current;
    if (!c) return;
    const x = c.getContext('2d');
    if (!x) return;

    let W = 0, H = 0;
    let flakes: { x: number; y: number; r: number; s: number; d: number }[] = [];
    let raf = 0;

    const reset = () => {
      W = c.width = window.innerWidth;
      H = c.height = window.innerHeight;
      flakes = Array.from({ length: Math.min(70, W / 18) }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.8 + 0.6,
        s: Math.random() * 0.5 + 0.25,
        d: Math.random() * 1.2 - 0.6,
      }));
    };
    reset();
    window.addEventListener('resize', reset);

    const tick = () => {
      x.clearRect(0, 0, W, H);
      x.fillStyle = 'rgba(232,244,253,.7)';
      for (const f of flakes) {
        x.beginPath();
        x.arc(f.x, f.y, f.r, 0, 7);
        x.fill();
        f.y += f.s;
        f.x += f.d * 0.3;
        if (f.y > H + 4) {
          f.y = -4;
          f.x = Math.random() * W;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', reset);
    };
  }, []);

  const spawnSprite = () => {
    setSprite({
      name: rnd(NAMES),
      t1: rnd(TRAITS_A),
      t2: rnd(TRAITS_B),
      palette: rnd(PALETTES),
      withScarf: Math.random() > 0.5,
    });
    setEntries([]);
  };

  const skipDay = () => {
    if (!sprite || entries.length >= 5) return;
    const nextDay = entries.length + 1;
    const minutes = String(Math.floor(Math.random() * 60)).padStart(2, '0');
    const tpl = rnd(TEMPLATES);
    setEntries((prev) => [
      { day: nextDay, time: `Day ${nextDay} · 03:${minutes} AM`, html: tpl(sprite.name) },
      ...prev,
    ]);
  };

  const handleJoin = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = email.trim();
    if (!v) return;
    setJoinMsg("✓ You're on the list. We'll email you before the first wave.");
    setEmail('');
  };

  const heroPalette = PALETTES[0];
  const diaryFull = entries.length >= 5;

  return (
    <>
      <div className="aurora" aria-hidden="true" />
      <canvas id="snow" ref={snowRef} aria-hidden="true" />

      <nav>
        <div className="wrap nav-inner">
          <a className="logo" href="#">
            <span className="logo-mark">❄</span>FrozenFriends
          </a>
          <ul className="nav-links">
            <li><a href="#demo">Demo</a></li>
            <li><a href="#features">Features</a></li>
            <li><a href="#roadmap">Roadmap</a></li>
            <li><a className="nav-cta" href="#mint">Join waitlist</a></li>
          </ul>
        </div>
      </nav>

      <header className="hero wrap">
        <div>
          <span className="badge"><span className="dot" />In development · Built on Base</span>
          <h1>
            Your pet has a <span className="grad">social life</span>
          </h1>
          <p className="lede">
            While you sleep, your Frost Sprite wanders the world — makes friends, gets in arguments, falls in love. Read its diary every morning. Share the drama.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#demo">Try the gameplay</a>
            <a className="btn btn-ghost" href="#roadmap">View roadmap</a>
          </div>
          <div className="hero-chain">
            <div className="chain-item"><b>0.0005 ETH</b>mint price</div>
            <div className="chain-item"><b>1 / wallet</b>per pet</div>
            <div className="chain-item"><b>Sponsored</b>gas (Paymaster)</div>
            <div className="chain-item"><b>ERC-721</b>on Base</div>
          </div>
        </div>
        <div className="sprite-stage">
          <SpriteSvg palette={heroPalette} withScarf />
          <div className="sprite-name">Pip</div>
          <div className="sprite-traits">
            <span className="trait">Curious</span>
            <span className="trait t2">Night Owl</span>
          </div>
          <p className="sprite-sub">Frost Sprite #0001 · last seen at the Aurora Cliffs</p>
        </div>
      </header>

      <section id="demo" className="wrap">
        <p className="eyebrow">Interactive demo</p>
        <h2>See how a Frost Sprite lives</h2>
        <p className="section-lede">
          Spawn a random sprite, skip ahead 24 hours, and read what happened. This demo uses pre-written narratives — the real game generates them with AI.
        </p>

        <div className="demo-grid">
          <div className="card demo-pet">
            {sprite ? (
              <>
                <SpriteSvg palette={sprite.palette} withScarf={sprite.withScarf} />
                <div className="sprite-name">{sprite.name}</div>
                <div className="sprite-traits">
                  <span className="trait">{sprite.t1}</span>
                  <span className="trait t2">{sprite.t2}</span>
                </div>
              </>
            ) : (
              <div>
                <div style={{ fontSize: '3rem', opacity: 0.35 }}>🐧</div>
                <p className="demo-empty">No Frost Sprite yet</p>
              </div>
            )}
            <div className="demo-controls">
              <button className="btn btn-mint-accent" onClick={spawnSprite}>
                {sprite ? 'Respawn Sprite' : 'Spawn a Sprite'}
              </button>
              <button className="btn btn-ghost" onClick={skipDay} disabled={!sprite || diaryFull}>
                {diaryFull ? 'Diary full — respawn to replay' : 'Skip 24h ⏩'}
              </button>
            </div>
          </div>

          <div className="card diary">
            <div className="diary-head">
              <h3>📖 Diary</h3>
              <span className="diary-count">{entries.length}/5 entries</span>
            </div>
            <div className="diary-feed">
              {entries.length === 0 ? (
                <p className="diary-placeholder">
                  Press <b>Skip 24h</b> to see what {sprite ? sprite.name : 'your sprite'} did overnight.
                </p>
              ) : (
                entries.map((e) => (
                  <div className="diary-entry" key={e.day}>
                    <span className="time">{e.time}</span>
                    <p dangerouslySetInnerHTML={{ __html: e.html }} />
                  </div>
                ))
              )}
            </div>
            <p className="diary-note">AI-generated narratives in the real game. Pre-written templates in this demo.</p>
          </div>
        </div>
      </section>

      <section id="features" className="wrap">
        <p className="eyebrow">Core loop</p>
        <h2>A pet that lives without you</h2>
        <p className="section-lede">
          FrozenFriends flips the virtual-pet formula: instead of you caring for the pet, the pet lives a life and reports back to you.
        </p>
        <div className="features">
          <div className="card feature">
            <div className="icon">🧬</div>
            <h3>Unique personality</h3>
            <p>Every Frost Sprite is born with a random personality — Bold, Social, Curious. Traits shape who it befriends and what trouble it finds. No two are alike.</p>
          </div>
          <div className="card feature">
            <div className="icon">🌙</div>
            <h3>AI-generated drama</h3>
            <p>Your pet meets others while you sleep. Conversations, gifts, arguments, rivalries — all written by AI in a daily simulation tick.</p>
          </div>
          <div className="card feature">
            <div className="icon">📖</div>
            <h3>Daily diary</h3>
            <p>Wake up to your pet's overnight stories. Share the best moments to Farcaster and follow other sprites' lives.</p>
          </div>
        </div>
      </section>

      <section id="mint" className="wrap">
        <div className="mint-band">
          <div>
            <p className="eyebrow">Mint details</p>
            <h2>Be first to adopt a Frost Sprite</h2>
            <p className="section-lede" style={{ marginBottom: 0 }}>
              We're minting in waves. Early adopters get priority access plus bonus Frost Points.
            </p>
            <div className="mint-stats">
              <div className="stat"><div className="v">0.0005 ETH</div><div className="k">Mint price</div></div>
              <div className="stat"><div className="v">1</div><div className="k">Pet per wallet</div></div>
              <div className="stat"><div className="v"><span className="base-tag">Base</span></div><div className="k">Network</div></div>
              <div className="stat"><div className="v">Sponsored</div><div className="k">Gas</div></div>
            </div>
          </div>
          <div>
            <form className="join-form" onSubmit={handleJoin}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                aria-label="Email address"
                required
              />
              <button className="btn btn-primary" type="submit">Join waitlist</button>
            </form>
            <p className="join-msg" role="status">{joinMsg}</p>
          </div>
        </div>
      </section>

      <section id="roadmap" className="wrap">
        <p className="eyebrow">Roadmap</p>
        <h2>From contract to mainnet</h2>
        <p className="section-lede">Shipping in public. Each phase unlocks the next.</p>
        <div className="roadmap">
          <div className="step done">
            <div className="node">✓</div>
            <h3>Smart contracts <span className="chip done">Done</span></h3>
            <p>ERC-721 + Paymaster integration. 12/12 tests passing.</p>
          </div>
          <div className="step active">
            <div className="node">2</div>
            <h3>Mint UI + pet visuals <span className="chip active">Building</span></h3>
            <p>Privy auth, Coinbase Smart Wallet, and on-chain SVG sprite generation.</p>
          </div>
          <div className="step">
            <div className="node">3</div>
            <h3>Social AI worker <span className="chip soon">Soon</span></h3>
            <p>Daily Claude Haiku simulation tick — events, mood, and diary entries for every sprite.</p>
          </div>
          <div className="step">
            <div className="node">4</div>
            <h3>Mainnet launch <span className="chip soon">Soon</span></h3>
            <p>Base mainnet deployment, Farcaster sharing, and the Frost Points leaderboard.</p>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap foot">
          <span>❄ FrozenFriends · Built on Base · 2026</span>
          <span>
            Part of the <a href="https://frostbite.pro">Frostbite</a> ecosystem
          </span>
        </div>
      </footer>
    </>
  );
}
