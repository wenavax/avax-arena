'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useSwitchChain, useWriteContract, usePublicClient, useSignMessage } from 'wagmi';
import { Wallet, LogOut, Coins, Loader2, Trophy } from 'lucide-react';
import { mountCardGame } from '@/lib/cardgame/mount';
import { mountStaked } from '@/lib/cardgame/mountStaked';
import { mountMultiplayer } from '@/lib/cardgame/mountMultiplayer';
import { createCardgameSocket, reserveMessage } from '@/lib/cardgame/mpClient';
import type { MatchInput } from '@/lib/cardgame/engine';
import { CARDGAME_ESCROW, CARDGAME_CHAIN_ID, ESCROW_ABI, STATUS } from '@/lib/cardgame/escrow';
import { updateRaceResultsStatus } from '@/lib/cardgame/resultsOverlay';
import { getHistory, getRecords, getDaily, DAILY_GOALS, type MatchRecord, type Records, type Daily } from '@/lib/cardgame/progress';
import LiveMatches from '@/components/cardgame/LiveMatches';
import Leaderboard from '@/components/cardgame/Leaderboard';
import IcmLab from '@/components/cardgame/IcmLab';
import GameStageBanner from '@/components/GameStageBanner';
import { formatEther, type Hex } from 'viem';
import type { Socket } from 'socket.io-client';
import './cardgame.css';

type Phase = 'idle' | 'creating' | 'joining' | 'waiting' | 'playing' | 'settling' | 'settled';
type Mode = 'practice' | 'staked' | 'watch' | 'mp';
type Seat = { pid: 'P1' | 'P2' | 'P3' | 'P4'; address: string };
/** Explicit transaction feedback: wallet-confirm → pending (+explorer) → ok/fail.
 *  Web3's documented trust-killer is a tx that "breaks quietly" — every on-chain
 *  action here narrates all four states. */
type TxInfo = { label: string; state: 'wallet' | 'pending' | 'ok' | 'fail'; hash?: string; msg?: string } | null;

const txUrl = (h: string) => `https://testnet.snowtrace.io/tx/${h}`;

// competence-before-risk soft gate (the Marvel Snap "snapping unlock" pattern):
// real-money modes open after this many practice wins — framed as progression,
// with an explicit skip for players who know what they're doing
const GATE_WINS = 2;

/** Locked-mode panel shown in place of the stake/join button until unlocked. */
function GatePanel({ wins, onSkip }: { wins: number; onSkip: () => void }) {
  const left = Math.max(0, GATE_WINS - wins);
  return (
    <div className="cg-gate">
      <div className="cg-gate-t">
        🔒 Win <b>{left}</b> more practice race{left === 1 ? '' : 's'} to unlock real-stake racing
      </div>
      <div className="cg-gate-p">
        {Array.from({ length: GATE_WINS }, (_, i) => <i key={i} className={i < wins ? 'on' : ''} />)}
        <span>{wins}/{GATE_WINS} wins</span>
      </div>
      <button type="button" className="cg-gate-skip" onClick={onSkip}>I know what I&apos;m doing — skip</button>
    </div>
  );
}

// money-flow steps: who holds your AVAX and what happens next, at a glance
const STAKED_STEPS = ['SIGN', 'OPEN', 'ENTRY', 'LOCK', 'RACE', 'SETTLE', 'PAID'];
const MP_STEPS = ['RESERVE', 'ENTRY', 'LOCK', 'RACE', 'SETTLE', 'PAID'];
// mpPhase → [completed steps, active index]
const MP_FLOW: Record<string, [number, number]> = {
  idle: [0, -1], reserved: [1, -1], paying: [1, 1], waiting: [2, 2],
  playing: [3, 3], settling: [4, 4], settled: [6, -1],
};

/** Horizontal money-flow stepper: done ✓ / active (pulsing) / upcoming (dim). */
function FlowSteps({ steps, done, active }: { steps: string[]; done: number; active: number }) {
  return (
    <div className="cg-flow">
      {steps.map((s, i) => (
        <span key={s} className={`cg-flow-step ${i < done ? 'done' : i === active ? 'act' : ''}`}>
          {i < done ? '✓ ' : ''}{s}
        </span>
      ))}
    </div>
  );
}

/** Transaction status row for the current on-chain action. */
function TxRow({ tx }: { tx: TxInfo }) {
  if (!tx) return null;
  return (
    <div className={`cg-txrow ${tx.state}`}>
      {(tx.state === 'wallet' || tx.state === 'pending') && <Loader2 size={13} className="cg-spin" />}
      {tx.state === 'ok' && <span className="cg-tx-ic">✓</span>}
      {tx.state === 'fail' && <span className="cg-tx-ic">✗</span>}
      <span>
        {tx.state === 'wallet' && <>Check your wallet — confirm <b>{tx.label}</b></>}
        {tx.state === 'pending' && <><b>{tx.label}</b> submitted — confirming on-chain…</>}
        {tx.state === 'ok' && <><b>{tx.label}</b> confirmed</>}
        {tx.state === 'fail' && <><b>{tx.label}</b> failed{tx.msg ? ` — ${tx.msg}` : ''}</>}
      </span>
      {tx.hash && <a className="txh" href={txUrl(tx.hash)} target="_blank" rel="noopener noreferrer">view tx ↗</a>}
    </div>
  );
}

/** Hold-to-confirm button: real money should never be one accidental tap away.
 *  Press and hold ~0.9s to fire (progress fill); keyboard Enter/Space fires
 *  directly (the wallet popup stays as the accessible second gate). */
function HoldButton({ onConfirm, disabled, children }: { onConfirm: () => void; disabled?: boolean; children: React.ReactNode }) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const t0 = useRef(0);
  const fired = useRef(false);
  const stop = useCallback(() => { cancelAnimationFrame(raf.current); raf.current = 0; setP(0); }, []);
  const tick = useCallback(() => {
    const k = Math.min(1, (performance.now() - t0.current) / 900);
    setP(k);
    if (k >= 1) { stop(); if (!fired.current) { fired.current = true; onConfirm(); } return; }
    raf.current = requestAnimationFrame(tick);
  }, [onConfirm, stop]);
  const down = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    fired.current = false; t0.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  }, [disabled, tick]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <button
      className="btn cg-hold" disabled={disabled} title="Hold to confirm"
      onPointerDown={down} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && !disabled) { e.preventDefault(); onConfirm(); } }}
    >
      <span className="cg-hold-fill" style={{ transform: `scaleX(${p})` }} aria-hidden />
      <span className="cg-hold-body">{children}</span>
    </button>
  );
}

const shortA = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const MEDALS = ['🥇', '🥈', '🥉', '4th'];
function ago(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** Personal record + daily goals + recent-races panel (device-local meta).
 *  Personal bests beat a global leaderboard while the player base is small. */
function StatsPanel() {
  const [hist, setHist] = useState<MatchRecord[]>([]);
  const [rec, setRec] = useState<Records | null>(null);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [, setClock] = useState(0); // re-render for the "resets in" countdown
  useEffect(() => {
    const read = () => { setHist(getHistory()); setRec(getRecords()); setDaily(getDaily()); };
    read();
    window.addEventListener('cg:progress', read);
    const t = setInterval(() => setClock((c) => c + 1), 60_000);
    return () => { window.removeEventListener('cg:progress', read); clearInterval(t); };
  }, []);
  if (!rec || !daily || rec.races === 0) return null; // nothing yet — stay quiet
  const winRate = Math.round((rec.wins / rec.races) * 100);
  // time-boxed framing (Agent Intercept "Ends in…"): goals reset at local midnight
  const mid = new Date(); mid.setHours(24, 0, 0, 0);
  const left = mid.getTime() - Date.now();
  const resetsIn = `${Math.floor(left / 3600000)}h ${Math.floor((left % 3600000) / 60000)}m`;
  const allDone = DAILY_GOALS.every((g) => daily[g.key] >= g.target);
  return (
    <div className="cg-stats glass">
      <div className="cg-stats-hd">
        <span className="cg-stats-t">YOUR RECORD</span>
        <span className="chip mono">🏁 {rec.races} race{rec.races === 1 ? '' : 's'}</span>
        <span className="chip mono">🏆 {rec.wins} win{rec.wins === 1 ? '' : 's'}</span>
        {rec.races >= 3 && <span className="chip mono">🎯 {winRate}% win rate</span>}
        {rec.streak >= 2 && <span className="chip mono gold">🔥 {rec.streak} win streak</span>}
        {rec.bestMult > 0 && <span className="chip mono">⚡ best {rec.bestCombo ?? ''} ×{rec.bestMult.toFixed(2)}</span>}
      </div>
      <div className="cg-daily">
        <span className="cg-daily-t">TODAY · resets in {resetsIn}</span>
        {DAILY_GOALS.map((g) => {
          const v = Math.min(daily[g.key], g.target);
          const done = v >= g.target;
          const pct = Math.round((v / g.target) * 100);
          return (
            <span
              key={g.key} className={`cg-daily-goal${done ? ' done' : ''}`}
              style={done ? undefined : { background: `linear-gradient(90deg, rgba(77,208,225,.13) ${pct}%, rgba(255,255,255,.03) ${pct}%)` }}
            >
              {done ? '✓ ' : ''}{g.label} <b>{v}/{g.target}</b>
            </span>
          );
        })}
        {allDone && <span className="cg-daily-goal alldone">🏁 All goals done — see you tomorrow!</span>}
      </div>
      {hist.length > 0 && (
        <div className="cg-hist">
          {hist.slice(0, 8).map((r, i) => (
            <div key={r.ts + '-' + i} className={`cg-hist-row${r.place === 1 ? ' won' : ''}`}>
              <b>{MEDALS[r.place - 1] ?? `${r.place}.`}</b>
              <span className={`cg-hist-mode m-${r.mode}`}>{r.mode === 'mp' ? 'MULTI' : r.mode.toUpperCase()}</span>
              <span className="cg-hist-combo">{r.bestCombo ? `${r.bestCombo} ×${r.bestMult.toFixed(2)}` : '—'}</span>
              <em>{r.pts}p</em>
              <span className="cg-hist-prize">{r.mode === 'practice' ? '' : r.prize ?? ''}</span>
              <time>{ago(r.ts)}</time>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Recent on-chain winners — makes the 5-minute-slot lobby feel inhabited. */
function WinnersTicker() {
  const [items, setItems] = useState<Array<{ id: string; w: string; prize: string }>>([]);
  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const f = await (await fetch('/avalanche/api/cardgame/matches')).json();
        if (dead || !Array.isArray(f.matches)) return;
        const prize = f.rewards?.[0] ? formatEther(BigInt(f.rewards[0])) : '';
        setItems(f.matches
          .filter((m: { status: string; ranking?: string[] }) => m.status === 'Settled' && m.ranking?.[0])
          .sort((a: { block: number }, b: { block: number }) => b.block - a.block)
          .slice(0, 3)
          .map((m: { matchId: string; ranking: string[] }) => ({ id: m.matchId, w: shortA(m.ranking[0]), prize })));
      } catch { /* feed offline — stay quiet */ }
    };
    void load();
    const t = setInterval(load, 60_000);
    return () => { dead = true; clearInterval(t); };
  }, []);
  if (!items.length) return null;
  return (
    <div className="cg-ticker">
      <span className="cg-ticker-t">RECENT WINNERS</span>
      {items.map((i) => <span key={i.id} className="cg-ticker-i">🏆 {i.w}{i.prize ? ` took ◆ ${i.prize}` : ''}</span>)}
    </div>
  );
}

/** Plain-language payout preview — what you stake and what each place pays. */
function PayoutLine({ fee }: { fee: bigint | null }) {
  if (fee === null) return null;
  const f = (x: bigint) => formatEther((fee * x) / 10n);
  return (
    <div className="cg-payline">
      payouts&nbsp; 🥇 ◆{f(20n)} · 🥈 ◆{f(10n)} · 🥉 ◆{f(5n)} · 4th ◆{f(3n)} <span className="dim">· protocol fee ◆{f(2n)}</span>
    </div>
  );
}

export default function CardGamePage() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const publicClient = usePublicClient({ chainId: CARDGAME_CHAIN_ID });
  const rootRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<null | (() => void)>(null);
  // stake authorization for the current match (signed once, reused for the
  // create/seat-bots/settle routes so a third party can't act on your match)
  const authRef = useRef<{ nonce: number; sig: Hex } | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [mode, setMode] = useState<Mode>('practice');
  const [phase, setPhase] = useState<Phase>('idle');
  const [note, setNote] = useState('');
  const [payout, setPayout] = useState<bigint>(0n);
  // explicit 4-state feedback for the on-chain action currently in flight
  const [txInfo, setTxInfo] = useState<TxInfo>(null);
  // staked money-flow stepper position (index into STAKED_STEPS; -1 hidden)
  const [stakedStep, setStakedStep] = useState(-1);
  // multiplayer lobby
  const [mpPhase, setMpPhase] = useState<'idle' | 'reserved' | 'paying' | 'waiting' | 'playing' | 'settling' | 'settled'>('idle');
  // latest mp phase + the reserve signature, for the socket reconnect handler
  // (kept in refs so the handler never closes over stale state)
  const mpPhaseRef = useRef<typeof mpPhase>('idle');
  const reserveSigRef = useRef<{ nonce: number; sig: Hex } | null>(null);
  const [mpNote, setMpNote] = useState('');
  const [slot, setSlot] = useState<{ startsAt: number; reserved: number } | null>(null);
  const [slotLeft, setSlotLeft] = useState('');
  const [feeWei, setFeeWei] = useState<bigint | null>(null);
  const feeRef = useRef<string>('0');
  // onboarding gate: practice wins (written by the practice mount, same keys)
  const [gateWins, setGateWins] = useState(GATE_WINS); // optimistic until read
  const [gateSkip, setGateSkip] = useState(true);
  useEffect(() => {
    const read = () => {
      try {
        setGateWins(+(localStorage.getItem('cg_wins') || 0) || 0);
        setGateSkip(localStorage.getItem('cg_gate_skip') === '1');
      } catch { /* private mode → never gate */ }
    };
    read();
    window.addEventListener('cg:progress', read);
    return () => window.removeEventListener('cg:progress', read);
  }, []);
  const gated = gateWins < GATE_WINS && !gateSkip;
  const skipGate = useCallback(() => {
    try { localStorage.setItem('cg_gate_skip', '1'); } catch { /* ignore */ }
    setGateSkip(true);
  }, []);

  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';

  // Practice mode: free interactive demo (mount whenever wallet/mode changes).
  // Watch mode renders the live feed instead; staked mounts on demand.
  useEffect(() => {
    if (mode !== 'practice' || !rootRef.current) return;
    cleanupRef.current?.();
    cleanupRef.current = mountCardGame(rootRef.current, { address: address ?? null });
    return () => { cleanupRef.current?.(); cleanupRef.current = null; };
  }, [address, mode]);

  // tear down any running game when leaving to watch mode
  useEffect(() => {
    if (mode === 'watch') { cleanupRef.current?.(); cleanupRef.current = null; }
  }, [mode]);

  // Bail out of an in-progress entry (LEAVE button during paying/waiting, or a
  // pay error). Tells the server to release the seat and unmounts any renderer,
  // but does NOT disconnect the socket — the connection effect owns the socket
  // lifecycle (it reconnects/cleans up on mode + auth changes), so we stay wired
  // for the next scheduled race while in mp mode.
  const teardownMp = useCallback(() => {
    socketRef.current?.emit('cardgame:leave');
    cleanupRef.current?.(); cleanupRef.current = null;
    setMpPhase('idle'); setMpNote(''); setTxInfo(null);
  }, []);
  // Unmount everything on page unmount.
  useEffect(() => () => { cleanupRef.current?.(); cleanupRef.current = null; socketRef.current?.disconnect(); }, []);

  const ensureFuji = useCallback(async () => {
    if (chainId !== CARDGAME_CHAIN_ID) await switchChainAsync({ chainId: CARDGAME_CHAIN_ID });
  }, [chainId, switchChainAsync]);

  const readPending = useCallback(async () => {
    if (!address || !publicClient) return 0n;
    return publicClient.readContract({ address: CARDGAME_ESCROW, abi: ESCROW_ABI, functionName: 'pendingPayouts', args: [address] });
  }, [address, publicClient]);

  // Refs kept current every render (same pattern as onFinishRef below) so the
  // mp socket effect can use the LATEST callbacks without listing them as deps.
  // Crucially, ensureFuji's identity changes with chainId — and the match-found
  // handler itself switches the chain — so depending on it would disconnect the
  // live socket mid-pay/mid-race. The socket must only reconnect when
  // mode/auth/wallet/client change.
  const ensureFujiRef = useRef(ensureFuji); ensureFujiRef.current = ensureFuji;
  const readPendingRef = useRef(readPending); readPendingRef.current = readPending;
  const writeContractAsyncRef = useRef(writeContractAsync); writeContractAsyncRef.current = writeContractAsync;
  mpPhaseRef.current = mpPhase;

  // read the entry fee straight from the escrow (single source of truth)
  useEffect(() => {
    if (!publicClient) return;
    publicClient.readContract({ address: CARDGAME_ESCROW, abi: ESCROW_ABI, functionName: 'entryFee' })
      .then((f) => { setFeeWei(f); feeRef.current = String(f); }).catch(() => {});
  }, [publicClient]);

  // scheduled-race countdown ticker (ticks while a slot is known)
  useEffect(() => {
    if (!slot) return;
    const id = setInterval(() => {
      const ms = Math.max(0, slot.startsAt - Date.now());
      const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
      setSlotLeft(`${m}:${String(s).padStart(2, '0')}`);
    }, 500);
    return () => clearInterval(id);
  }, [slot]);

  // Settle callback: fired by the game engine when the staked match ends.
  // Retried with backoff — a connection blip at the finish line must not lose
  // the settle (the play log only lives in this tab until the server has it).
  const onFinish = useCallback(async (input: MatchInput) => {
    if (!address || !authRef.current) return;
    setPhase('settling'); setStakedStep(5);
    setNote('Submitting play log — server re-derives the result…');
    const waits = [2_000, 5_000, 10_000, 20_000, 30_000];
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch('/avalanche/api/cardgame/settle', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player: address, nonce: authRef.current.nonce, sig: authRef.current.sig, input }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'settle failed');
        const p = await readPending();
        setPayout(p);
        setPhase('settled'); setStakedStep(6);
        setNote(p > 0n ? `You won ◆ ${formatEther(p)} AVAX — withdraw below.` : 'Match settled — no payout this time.');
        // money outcome joins the game outcome on the results overlay
        const txLink = data.txHash ? ` — tx <a class="txh" href="${txUrl(data.txHash)}" target="_blank" rel="noopener noreferrer">${String(data.txHash).slice(0, 10)}…</a>` : '';
        updateRaceResultsStatus(`✓ Settled on-chain${txLink}<br>${p > 0n
          ? `<b>◆ ${formatEther(p)} AVAX</b> is claimable — use the <b>WITHDRAW</b> button in the panel above`
          : 'No payout this race — your entry funded the pot'}`);
        return;
      } catch (e) {
        if (attempt >= waits.length) {
          setPhase('settled'); setStakedStep(-1);
          setNote(`Settle error: ${(e as Error).message} — your entry stays refundable on-chain after the settle window.`);
          updateRaceResultsStatus(`✗ Settlement failed after ${waits.length + 1} attempts — your entry stays <b>refundable on-chain</b> after the settle window`);
          return;
        }
        // never fail quietly: the retry loop narrates itself
        setNote(`Settle attempt ${attempt + 1}/${waits.length + 1} failed — auto-retrying in ${waits[attempt] / 1000}s (keep this tab open)…`);
        updateRaceResultsStatus(`Settling on-chain — attempt ${attempt + 1}/${waits.length + 1} failed, auto-retrying…`);
        await new Promise((r) => setTimeout(r, waits[attempt]));
      }
    }
  }, [address, readPending]);

  // keep the latest onFinish for the mounted engine
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const startStaked = useCallback(async () => {
    if (!address || !publicClient) return;
    setPayout(0n); setTxInfo(null);
    try {
      await ensureFuji();
      const nonce = Math.floor(Math.random() * 2_000_000_000); // avoid id reuse across sessions

      // 0) prove wallet ownership once — gates create/seat-bots/settle server-side
      setPhase('creating'); setStakedStep(0);
      setNote('Sign to authorize your staked match (free — no funds move yet)…');
      const message = `Frostbite CAR(D) GAME — authorize staked match\nplayer: ${address.toLowerCase()}\nnonce: ${nonce}`;
      const sig = (await signMessageAsync({ message })) as Hex;
      authRef.current = { nonce, sig };

      // 1) server opens the match (createMatch only — bots seated after you pay)
      setStakedStep(1);
      setNote('Opening escrow match…');
      const cr = await fetch('/avalanche/api/cardgame/create-match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player: address, nonce, sig }),
      });
      const created = await cr.json();
      if (!cr.ok) throw new Error(created.error || 'create failed');
      const mId = created.matchId as Hex;
      const bots = created.bots as string[];
      const fee = BigInt(created.entryFee);

      // 2) player joins with real AVAX — narrate every tx state explicitly
      setPhase('joining'); setStakedStep(2);
      setNote(`You are staking ${formatEther(fee)} AVAX. Finish 1st to receive ${formatEther(fee * 2n)}.`);
      setTxInfo({ label: `${formatEther(fee)} AVAX entry`, state: 'wallet' });
      // explicit gas: the 4th join also runs the lock path (~+25k) — with four
      // concurrent payers a pre-join estimate is stale and under-budgets it
      const hash = await writeContractAsync({
        address: CARDGAME_ESCROW, abi: ESCROW_ABI, functionName: 'joinMatch',
        args: [mId], value: fee, chainId: CARDGAME_CHAIN_ID, gas: 160_000n,
      });
      setTxInfo({ label: `${formatEther(fee)} AVAX entry`, state: 'pending', hash });
      const rcpt = await publicClient.waitForTransactionReceipt({ hash });
      if (rcpt.status !== 'success') {
        setTxInfo({ label: `${formatEther(fee)} AVAX entry`, state: 'fail', hash, msg: 'reverted — you were not charged beyond gas' });
        throw new Error('entry transaction reverted — you were not charged beyond gas');
      }
      setTxInfo({ label: `${formatEther(fee)} AVAX entry`, state: 'ok', hash });

      // 3) now that you've paid, ask the server to seat the 3 bots → lock
      setPhase('waiting'); setStakedStep(3);
      setNote('Seating opponents & locking match…');
      const sb = await fetch('/avalanche/api/cardgame/seat-bots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player: address, nonce, sig }),
      });
      const sbData = await sb.json();
      if (!sb.ok) throw new Error(sbData.error || 'seating failed');
      const seed = sbData.seed as string; // server-authoritative match seed
      for (let i = 0; i < 20; i++) {
        const st = await publicClient.readContract({ address: CARDGAME_ESCROW, abi: ESCROW_ABI, functionName: 'getStatus', args: [mId] });
        if (STATUS[st] === 'Locked') break;
        await new Promise((r) => setTimeout(r, 1500));
      }

      // 4) play the shared deterministic engine seeded by the server; capture the
      //    play log and send it to settle (server re-derives the ranking)
      setPhase('playing'); setStakedStep(4);
      setNote(`Match locked — race! The server verifies your plays. Winner takes ◆ ${formatEther(fee * 2n)}.`);
      cleanupRef.current?.();
      if (rootRef.current) {
        cleanupRef.current = mountStaked(rootRef.current, {
          seed, player: address, bots, entryFee: String(fee), onFinish: (inp) => onFinishRef.current(inp),
        });
      }
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage || (e as Error).message;
      setPhase('idle'); setStakedStep(-1);
      if (!/rejected|denied/i.test(msg)) setNote(`Error: ${msg.slice(0, 140)}`);
      else { setNote(''); setTxInfo(null); } // user declined in the wallet — clean slate
    }
  }, [address, publicClient, ensureFuji, writeContractAsync, signMessageAsync]);

  // ── Real 4-player multiplayer: SCHEDULED races (reserve → pay → locked → play → settle) ──
  // A single owner of the socket lifecycle: the socket opens when we enter mp
  // mode (authenticated + client ready) and disconnects on cleanup. All server
  // handlers live here so they survive across reserve/pay/play without a click.
  useEffect(() => {
    if (mode !== 'mp' || !authenticated || !address || !publicClient) return;
    const socket = createCardgameSocket();
    socketRef.current = socket;
    // Transport resilience: socket.io auto-reconnects, but the hub binds the
    // address per CONNECTION — after a drop we must re-authenticate. Mid-match
    // we rejoin the live room (the server kept the race running the whole
    // time); merely-reserved seats re-reserve. Reuses the reserve signature so
    // no wallet popup interrupts the race.
    let hadConnect = false;
    socket.on('connect', () => {
      if (!hadConnect) { hadConnect = true; return; }
      const cred = reserveSigRef.current;
      if (!cred) return;
      const ph = mpPhaseRef.current;
      if (ph === 'playing' || ph === 'waiting') {
        socket.emit('cardgame:reconnect', { address, nonce: cred.nonce, sig: cred.sig });
      } else if (ph === 'reserved') {
        socket.emit('cardgame:reserve', { address, nonce: cred.nonce, sig: cred.sig });
      }
    });
    socket.on('cardgame:slot', (d: { startsAt: number; reserved: number }) => setSlot(d));
    socket.on('cardgame:reserved', () => { setMpPhase('reserved'); setMpNote('Seat reserved — the race locks in the first four when the countdown hits zero.'); });
    socket.on('cardgame:error', (d: { error?: string }) => setMpNote(`Error: ${d?.error || 'unknown'}`));
    socket.on('cardgame:cancelled', (d: { reason?: string }) => {
      setMpNote(`Race cancelled: ${d?.reason || 'a player left'}. Paid entries are instantly refundable — you're still reserved for the next race.`);
      setMpPhase('reserved');
    });
    socket.on('cardgame:match-found', async (d: { matchId: Hex; entryFee: string; seat: Seat['pid']; seats: Seat[] }) => {
      // the server's fee is authoritative — never let a slow/failed contract
      // read leave feeRef at '0' (mountMultiplayer would render ◆ 0 payouts)
      feeRef.current = d.entryFee; setFeeWei(BigInt(d.entryFee));
      const feeLabel = `${formatEther(BigInt(d.entryFee))} AVAX entry`;
      try {
        setMpPhase('paying');
        setMpNote(`Race starting — you are staking ${formatEther(BigInt(d.entryFee))} AVAX (90s window). Finish 1st to receive ${formatEther(BigInt(d.entryFee) * 2n)}.`);
        setTxInfo({ label: feeLabel, state: 'wallet' });
        await ensureFujiRef.current();
        // explicit gas: all four pay at once, so the 4th join (which also locks
        // the match, ~+25k gas) would revert on a stale pre-join estimate
        const hash = await writeContractAsyncRef.current({
          address: CARDGAME_ESCROW, abi: ESCROW_ABI, functionName: 'joinMatch',
          args: [d.matchId], value: BigInt(d.entryFee), chainId: CARDGAME_CHAIN_ID, gas: 160_000n,
        });
        setTxInfo({ label: feeLabel, state: 'pending', hash });
        const rcpt = await publicClient.waitForTransactionReceipt({ hash });
        if (rcpt.status !== 'success') {
          setTxInfo({ label: feeLabel, state: 'fail', hash, msg: 'reverted — you were not charged beyond gas' });
          throw new Error('entry transaction reverted — you were not charged beyond gas');
        }
        setTxInfo({ label: feeLabel, state: 'ok', hash });
        socket.emit('cardgame:paid');
        setMpPhase('waiting'); setMpNote('Paid — waiting for all four to lock in…');
      } catch (e) {
        const msg = (e as { shortMessage?: string; message?: string }).shortMessage || (e as Error).message;
        if (/rejected|denied/i.test(msg)) { setMpNote('Entry declined — your seat was released.'); setTxInfo(null); }
        else setMpNote(`Pay error: ${msg.slice(0, 120)}`);
        socket.emit('cardgame:leave'); setMpPhase('idle');
      }
    });
    socket.on('cardgame:locked', (d: { seats: Seat[] }) => {
      setMpPhase('playing'); setMpNote('');
      cleanupRef.current?.();
      if (rootRef.current) {
        cleanupRef.current = mountMultiplayer(rootRef.current, {
          socket, myAddress: address, seats: d.seats, entryFee: feeRef.current,
          onFinished: () => { setMpPhase('settling'); setMpNote('Match over — the server is settling on-chain (automatic)…'); },
          onSettled: async () => {
            const p = await readPendingRef.current(); setPayout(p); setMpPhase('settled');
            setMpNote(p > 0n ? `You won ◆ ${formatEther(p)} AVAX — withdraw below.` : 'Settled — no payout this time.');
          },
        });
      }
    });
    return () => { socket.disconnect(); socketRef.current = null; setSlot(null); setMpPhase('idle'); setMpNote(''); setTxInfo(null); };
  }, [mode, authenticated, address, publicClient]);

  const joinRace = useCallback(async () => {
    if (!address || !socketRef.current) return;
    try {
      const nonce = Math.floor(Math.random() * 2_000_000_000);
      const sig = (await signMessageAsync({ message: reserveMessage(address, nonce) })) as Hex;
      reserveSigRef.current = { nonce, sig }; // reused for silent re-auth after a drop
      socketRef.current.emit('cardgame:reserve', { address, nonce, sig });
    } catch { /* user declined the signature */ }
  }, [address, signMessageAsync]);
  const leaveRace = useCallback(() => { socketRef.current?.emit('cardgame:unreserve'); setMpPhase('idle'); setMpNote(''); }, []);

  const withdraw = useCallback(async () => {
    if (!publicClient) return;
    const label = `◆ ${formatEther(payout)} withdrawal`;
    try {
      await ensureFuji();
      setNote('Withdrawing your payout…');
      setTxInfo({ label, state: 'wallet' });
      const hash = await writeContractAsync({
        address: CARDGAME_ESCROW, abi: ESCROW_ABI, functionName: 'withdrawPayout', args: [], chainId: CARDGAME_CHAIN_ID,
      });
      setTxInfo({ label, state: 'pending', hash });
      const rcpt = await publicClient.waitForTransactionReceipt({ hash });
      if (rcpt.status !== 'success') {
        setTxInfo({ label, state: 'fail', hash, msg: 'reverted — your payout is still claimable' });
        return;
      }
      setTxInfo({ label, state: 'ok', hash });
      setPayout(0n);
      setNote('Withdrawn ✓ — play again to stake another match.');
      setPhase('idle'); setStakedStep(-1);
      updateRaceResultsStatus(`✓ <b>${label}</b> sent to your wallet — tx <a class="txh" href="${txUrl(hash)}" target="_blank" rel="noopener noreferrer">${hash.slice(0, 10)}…</a>`);
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage || (e as Error).message;
      if (!/rejected|denied/i.test(msg)) setNote(`Withdraw error: ${msg.slice(0, 120)}`);
      else setTxInfo(null);
    }
  }, [publicClient, ensureFuji, writeContractAsync, payout]);

  const busy = phase === 'creating' || phase === 'joining' || phase === 'waiting' || phase === 'settling';

  return (
    <div className="cgroot cgroot--stage py-4">
      <GameStageBanner
        stage="TESTNET"
        message="Staked & multiplayer matches run on Avalanche Fuji — test AVAX only, no real funds. Practice mode is free."
      />
      <div className="cg-wallet">
        {authenticated && address ? (
          <>
            <span className="chip mono" style={{ borderColor: 'rgba(34,197,94,.4)', color: '#22c55e' }}>● {shortAddr}</span>
            <div className="cg-modes">
              <button className={`cg-mode ${mode === 'practice' ? 'on' : ''}`} onClick={() => { setMode('practice'); setPhase('idle'); setNote(''); setTxInfo(null); setStakedStep(-1); }}>Practice</button>
              <button className={`cg-mode ${mode === 'staked' ? 'on' : ''}`} onClick={() => { setMode('staked'); }}>Staked · Testnet</button>
              <button className={`cg-mode ${mode === 'mp' ? 'on' : ''}`} onClick={() => { setMode('mp'); }}>Multiplayer · Testnet</button>
              <button className={`cg-mode ${mode === 'watch' ? 'on' : ''}`} onClick={() => { setMode('watch'); }}>Watch · Live</button>
            </div>
            <button className="btn ghost" onClick={logout} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <LogOut size={13} /> Disconnect
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={login} disabled={!ready} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Wallet size={15} /> CONNECT WALLET
            </button>
            <div className="cg-modes">
              <button className={`cg-mode ${mode === 'practice' ? 'on' : ''}`} onClick={() => { setMode('practice'); }}>Practice</button>
              <button className={`cg-mode ${mode === 'watch' ? 'on' : ''}`} onClick={() => { setMode('watch'); }}>Watch · Live</button>
            </div>
            <span className="pill">connect for staked matches — or watch live now</span>
          </>
        )}
      </div>

      {mode === 'watch' && (
        <>
          <LiveMatches myAddress={address ?? undefined} />
          <Leaderboard myAddress={address ?? undefined} />
        </>
      )}

      {mode === 'staked' && authenticated && address && (
        <div className="cg-stakebar glass">
          <div className="cg-stakebar-l">
            <Coins size={18} className="gold-ic" />
            <div>
              <div className="cg-stake-title">Staked Match <span className="tn">FUJI TESTNET</span></div>
              <div className="cg-stake-sub">Stake <b>{feeWei !== null ? formatEther(feeWei) : '…'} AVAX</b> vs 3 house bots · real on-chain escrow</div>
              <PayoutLine fee={feeWei} />
            </div>
          </div>
          <div className="cg-stakebar-r">
            {phase === 'settled' && payout > 0n ? (
              <button className="btn" onClick={withdraw} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Trophy size={15} /> WITHDRAW ◆ {formatEther(payout)}
              </button>
            ) : busy || phase === 'playing' ? (
              <button className="btn" disabled style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                {busy && <Loader2 size={15} className="cg-spin" />}
                {phase === 'playing' ? 'RACING…' : 'WORKING…'}
              </button>
            ) : gated ? (
              <GatePanel wins={gateWins} onSkip={skipGate} />
            ) : (
              <HoldButton onConfirm={startStaked}>
                STAKE &amp; PLAY
                <small>hold to stake ◆ {feeWei !== null ? formatEther(feeWei) : '…'}</small>
              </HoldButton>
            )}
          </div>
          {stakedStep >= 0 && (
            <FlowSteps steps={STAKED_STEPS} done={stakedStep >= 6 ? 7 : stakedStep} active={stakedStep >= 6 ? -1 : stakedStep} />
          )}
          {note && <div className={`cg-stake-note${/^(Error|Pay error|Settle error|Withdraw error|✗)/.test(note) ? ' err' : ''}`}>{note}</div>}
          <TxRow tx={txInfo} />
        </div>
      )}

      {mode === 'staked' && !authenticated && (
        <div className="cg-stakebar glass"><div className="cg-stake-sub">Connect your wallet to stake a real Fuji testnet match.</div></div>
      )}

      {mode === 'mp' && authenticated && address && (
        <div className="cg-stakebar glass">
          <div className="cg-stakebar-l">
            <Coins size={18} className="gold-ic" />
            <div>
              <div className="cg-stake-title">Scheduled Race <span className="tn">FUJI TESTNET</span></div>
              <div className="cg-stake-sub">
                A race starts <b>every 5 minutes</b> · first four reserved seats play ·
                entry <b>{feeWei !== null ? formatEther(feeWei) : '…'} AVAX</b>
              </div>
              <PayoutLine fee={feeWei} />
              {slot && (
                <div className="cg-slot">
                  <span className="cg-slot-count">{slotLeft || '…'}</span>
                  <span className="cg-slot-seats">{Array.from({ length: 4 }, (_, i) => (
                    <i key={i} className={i < slot.reserved ? 'on' : ''} />
                  ))} {slot.reserved}/4 reserved</span>
                </div>
              )}
              <WinnersTicker />
              <IcmLab />
            </div>
          </div>
          <div className="cg-stakebar-r">
            {mpPhase === 'settled' && payout > 0n ? (
              <button className="btn" onClick={withdraw} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Trophy size={15} /> WITHDRAW ◆ {formatEther(payout)}
              </button>
            ) : (mpPhase === 'idle' || mpPhase === 'settled') && gated ? (
              <GatePanel wins={gateWins} onSkip={skipGate} />
            ) : mpPhase === 'idle' || mpPhase === 'settled' ? (
              <HoldButton onConfirm={joinRace}>
                JOIN RACE
                <small>hold to reserve · ◆ {feeWei !== null ? formatEther(feeWei) : '…'} charged at race start</small>
              </HoldButton>
            ) : mpPhase === 'reserved' ? (
              <button className="btn ghost" onClick={leaveRace}>RESERVED ✓ · LEAVE</button>
            ) : mpPhase === 'settling' ? (
              <button className="btn ghost" disabled style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Loader2 size={15} className="cg-spin" /> SETTLING…
              </button>
            ) : (
              <button className="btn ghost" onClick={teardownMp} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                {mpPhase === 'waiting' && <Loader2 size={15} className="cg-spin" />}
                {mpPhase === 'paying' ? 'PAYING…' : mpPhase === 'waiting' ? 'WAITING…' : 'LEAVE'}
              </button>
            )}
          </div>
          {mpPhase !== 'idle' && (
            <FlowSteps steps={MP_STEPS} done={MP_FLOW[mpPhase][0]} active={MP_FLOW[mpPhase][1]} />
          )}
          {mpNote && <div className={`cg-stake-note${/^(Error|Pay error|Settle error|✗)/.test(mpNote) ? ' err' : ''}`}>{mpNote}</div>}
          <TxRow tx={txInfo} />
        </div>
      )}

      {mode === 'mp' && !authenticated && (
        <div className="cg-stakebar glass"><div className="cg-stake-sub">Connect your wallet to play a real 4-player Fuji testnet match.</div></div>
      )}

      <div ref={rootRef} style={{ display: mode === 'watch' ? 'none' : undefined }} />
      {mode !== 'watch' && <StatsPanel />}
    </div>
  );
}
