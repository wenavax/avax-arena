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
import LiveMatches from '@/components/cardgame/LiveMatches';
import IcmLab from '@/components/cardgame/IcmLab';
import GameStageBanner from '@/components/GameStageBanner';
import { formatEther, type Hex } from 'viem';
import type { Socket } from 'socket.io-client';
import './cardgame.css';

type Phase = 'idle' | 'creating' | 'joining' | 'waiting' | 'playing' | 'settling' | 'settled';
type Mode = 'practice' | 'staked' | 'watch' | 'mp';
type Seat = { pid: 'P1' | 'P2' | 'P3' | 'P4'; address: string };

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
  // multiplayer lobby
  const [mpPhase, setMpPhase] = useState<'idle' | 'reserved' | 'paying' | 'waiting' | 'playing' | 'settled'>('idle');
  const [mpNote, setMpNote] = useState('');
  const [slot, setSlot] = useState<{ startsAt: number; reserved: number } | null>(null);
  const [slotLeft, setSlotLeft] = useState('');
  const [feeWei, setFeeWei] = useState<bigint | null>(null);
  const feeRef = useRef<string>('0');

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
    setMpPhase('idle'); setMpNote('');
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

  // Settle callback: fired by the game engine when the staked match ends
  const onFinish = useCallback(async (input: MatchInput) => {
    if (!address || !authRef.current) return;
    setPhase('settling');
    setNote('Submitting play log — server re-derives the result…');
    try {
      const res = await fetch('/avalanche/api/cardgame/settle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player: address, nonce: authRef.current.nonce, sig: authRef.current.sig, input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'settle failed');
      const p = await readPending();
      setPayout(p);
      setPhase('settled');
      setNote(p > 0n ? `You won ◆ ${formatEther(p)} AVAX — withdraw below.` : 'Match settled — no payout this time.');
    } catch (e) {
      setPhase('settled');
      setNote(`Settle error: ${(e as Error).message}`);
    }
  }, [address, readPending]);

  // keep the latest onFinish for the mounted engine
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const startStaked = useCallback(async () => {
    if (!address || !publicClient) return;
    setPayout(0n);
    try {
      await ensureFuji();
      const nonce = Math.floor(Math.random() * 2_000_000_000); // avoid id reuse across sessions

      // 0) prove wallet ownership once — gates create/seat-bots/settle server-side
      setPhase('creating');
      setNote('Sign to authorize your staked match…');
      const message = `Frostbite CAR(D) GAME — authorize staked match\nplayer: ${address.toLowerCase()}\nnonce: ${nonce}`;
      const sig = (await signMessageAsync({ message })) as Hex;
      authRef.current = { nonce, sig };

      // 1) server opens the match (createMatch only — bots seated after you pay)
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

      // 2) player joins with real AVAX
      setPhase('joining');
      setNote(`Confirm your ${formatEther(fee)} AVAX entry…`);
      const hash = await writeContractAsync({
        address: CARDGAME_ESCROW, abi: ESCROW_ABI, functionName: 'joinMatch',
        args: [mId], value: fee, chainId: CARDGAME_CHAIN_ID,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      // 3) now that you've paid, ask the server to seat the 3 bots → lock
      setPhase('waiting');
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
      setPhase('playing');
      setNote(`Match locked — race! The server verifies your plays. Winner takes ◆ ${formatEther(fee * 2n)}.`);
      cleanupRef.current?.();
      if (rootRef.current) {
        cleanupRef.current = mountStaked(rootRef.current, {
          seed, player: address, bots, entryFee: String(fee), onFinish: (inp) => onFinishRef.current(inp),
        });
      }
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage || (e as Error).message;
      setPhase('idle');
      if (!/rejected|denied/i.test(msg)) setNote(`Error: ${msg.slice(0, 140)}`);
      else setNote('');
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
      try {
        setMpPhase('paying');
        setMpNote(`Race starting — confirm your ${formatEther(BigInt(d.entryFee))} AVAX entry…`);
        await ensureFujiRef.current();
        const hash = await writeContractAsyncRef.current({
          address: CARDGAME_ESCROW, abi: ESCROW_ABI, functionName: 'joinMatch',
          args: [d.matchId], value: BigInt(d.entryFee), chainId: CARDGAME_CHAIN_ID,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        socket.emit('cardgame:paid');
        setMpPhase('waiting'); setMpNote('Paid — waiting for all four to lock in…');
      } catch (e) {
        const msg = (e as { shortMessage?: string; message?: string }).shortMessage || (e as Error).message;
        setMpNote(/rejected|denied/i.test(msg) ? 'Entry declined — your seat was released.' : `Pay error: ${msg.slice(0, 120)}`);
        socket.emit('cardgame:leave'); setMpPhase('idle');
      }
    });
    socket.on('cardgame:locked', (d: { seats: Seat[] }) => {
      setMpPhase('playing'); setMpNote('');
      cleanupRef.current?.();
      if (rootRef.current) {
        cleanupRef.current = mountMultiplayer(rootRef.current, {
          socket, myAddress: address, seats: d.seats, entryFee: feeRef.current,
          onFinished: () => setMpNote('Match over — settling on-chain…'),
          onSettled: async () => {
            const p = await readPendingRef.current(); setPayout(p); setMpPhase('settled');
            setMpNote(p > 0n ? `You won ◆ ${formatEther(p)} AVAX — withdraw below.` : 'Settled — no payout this time.');
          },
        });
      }
    });
    return () => { socket.disconnect(); socketRef.current = null; setSlot(null); setMpPhase('idle'); setMpNote(''); };
  }, [mode, authenticated, address, publicClient]);

  const joinRace = useCallback(async () => {
    if (!address || !socketRef.current) return;
    try {
      const nonce = Math.floor(Math.random() * 2_000_000_000);
      const sig = (await signMessageAsync({ message: reserveMessage(address, nonce) })) as Hex;
      socketRef.current.emit('cardgame:reserve', { address, nonce, sig });
    } catch { /* user declined the signature */ }
  }, [address, signMessageAsync]);
  const leaveRace = useCallback(() => { socketRef.current?.emit('cardgame:unreserve'); setMpPhase('idle'); setMpNote(''); }, []);

  const withdraw = useCallback(async () => {
    if (!publicClient) return;
    try {
      await ensureFuji();
      setNote('Confirm withdrawal…');
      const hash = await writeContractAsync({
        address: CARDGAME_ESCROW, abi: ESCROW_ABI, functionName: 'withdrawPayout', args: [], chainId: CARDGAME_CHAIN_ID,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setPayout(0n);
      setNote('Withdrawn ✓ — play again to stake another match.');
      setPhase('idle');
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage || (e as Error).message;
      if (!/rejected|denied/i.test(msg)) setNote(`Withdraw error: ${msg.slice(0, 120)}`);
    }
  }, [publicClient, ensureFuji, writeContractAsync]);

  const busy = phase === 'creating' || phase === 'joining' || phase === 'waiting' || phase === 'settling';

  return (
    <div className="cgroot py-4">
      <GameStageBanner
        stage="TESTNET"
        message="Staked & multiplayer matches run on Avalanche Fuji — test AVAX only, no real funds. Practice mode is free."
      />
      <div className="cg-wallet">
        {authenticated && address ? (
          <>
            <span className="chip mono" style={{ borderColor: 'rgba(34,197,94,.4)', color: '#22c55e' }}>● {shortAddr}</span>
            <div className="cg-modes">
              <button className={`cg-mode ${mode === 'practice' ? 'on' : ''}`} onClick={() => { setMode('practice'); setPhase('idle'); setNote(''); }}>Practice</button>
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

      {mode === 'watch' && <LiveMatches myAddress={address ?? undefined} />}

      {mode === 'staked' && authenticated && address && (
        <div className="cg-stakebar glass">
          <div className="cg-stakebar-l">
            <Coins size={18} className="gold-ic" />
            <div>
              <div className="cg-stake-title">Staked Match <span className="tn">FUJI TESTNET</span></div>
              <div className="cg-stake-sub">Stake <b>{feeWei !== null ? formatEther(feeWei) : '…'} AVAX</b> vs 3 house bots · winner takes ◆ {feeWei !== null ? formatEther(feeWei * 2n) : '…'} · real on-chain escrow</div>
            </div>
          </div>
          <div className="cg-stakebar-r">
            {phase === 'settled' && payout > 0n ? (
              <button className="btn" onClick={withdraw} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Trophy size={15} /> WITHDRAW ◆ {formatEther(payout)}
              </button>
            ) : (
              <button className="btn" onClick={startStaked} disabled={busy || phase === 'playing'} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                {busy && <Loader2 size={15} className="cg-spin" />}
                {phase === 'playing' ? 'RACING…' : busy ? 'WORKING…' : 'STAKE & PLAY'}
              </button>
            )}
          </div>
          {note && <div className="cg-stake-note">{note}</div>}
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
                entry <b>{feeWei !== null ? formatEther(feeWei) : '…'} AVAX</b> · winner takes <b>◆ {feeWei !== null ? formatEther(feeWei * 2n) : '…'}</b>
              </div>
              {slot && (
                <div className="cg-slot">
                  <span className="cg-slot-count">{slotLeft || '…'}</span>
                  <span className="cg-slot-seats">{Array.from({ length: 4 }, (_, i) => (
                    <i key={i} className={i < slot.reserved ? 'on' : ''} />
                  ))} {slot.reserved}/4 reserved</span>
                </div>
              )}
              <IcmLab />
            </div>
          </div>
          <div className="cg-stakebar-r">
            {mpPhase === 'settled' && payout > 0n ? (
              <button className="btn" onClick={withdraw} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Trophy size={15} /> WITHDRAW ◆ {formatEther(payout)}
              </button>
            ) : mpPhase === 'idle' || mpPhase === 'settled' ? (
              <button className="btn" onClick={joinRace}>JOIN RACE</button>
            ) : mpPhase === 'reserved' ? (
              <button className="btn ghost" onClick={leaveRace}>RESERVED ✓ · LEAVE</button>
            ) : (
              <button className="btn ghost" onClick={teardownMp} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                {mpPhase === 'waiting' && <Loader2 size={15} className="cg-spin" />}
                {mpPhase === 'paying' ? 'PAYING…' : mpPhase === 'waiting' ? 'WAITING…' : 'LEAVE'}
              </button>
            )}
          </div>
          {mpNote && <div className="cg-stake-note">{mpNote}</div>}
        </div>
      )}

      {mode === 'mp' && !authenticated && (
        <div className="cg-stakebar glass"><div className="cg-stake-sub">Connect your wallet to play a real 4-player Fuji testnet match.</div></div>
      )}

      <div ref={rootRef} style={{ display: mode === 'watch' ? 'none' : undefined }} />
    </div>
  );
}
