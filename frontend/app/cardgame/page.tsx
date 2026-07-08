'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useSwitchChain, useWriteContract, usePublicClient, useSignMessage } from 'wagmi';
import { Wallet, LogOut, Coins, Loader2, Trophy } from 'lucide-react';
import { mountCardGame } from '@/lib/cardgame/mount';
import { mountStaked } from '@/lib/cardgame/mountStaked';
import type { MatchInput } from '@/lib/cardgame/engine';
import { CARDGAME_ESCROW, CARDGAME_CHAIN_ID, ESCROW_ABI, STATUS } from '@/lib/cardgame/escrow';
import LiveMatches from '@/components/cardgame/LiveMatches';
import { formatEther, type Hex } from 'viem';
import './cardgame.css';

type Phase = 'idle' | 'creating' | 'joining' | 'waiting' | 'playing' | 'settling' | 'settled';
type Mode = 'practice' | 'staked' | 'watch';

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

  const [mode, setMode] = useState<Mode>('practice');
  const [phase, setPhase] = useState<Phase>('idle');
  const [note, setNote] = useState('');
  const [matchId, setMatchId] = useState<Hex | null>(null);
  const [entryFee, setEntryFee] = useState<bigint | null>(null);
  const [payout, setPayout] = useState<bigint>(0n);

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

  const ensureFuji = useCallback(async () => {
    if (chainId !== CARDGAME_CHAIN_ID) await switchChainAsync({ chainId: CARDGAME_CHAIN_ID });
  }, [chainId, switchChainAsync]);

  const readPending = useCallback(async () => {
    if (!address || !publicClient) return 0n;
    return publicClient.readContract({ address: CARDGAME_ESCROW, abi: ESCROW_ABI, functionName: 'pendingPayouts', args: [address] });
  }, [address, publicClient]);

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
      setMatchId(mId);
      setEntryFee(fee);

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
      setNote('Match locked — race! The server verifies your plays. Winner takes ◆ 0.02.');
      cleanupRef.current?.();
      if (rootRef.current) {
        cleanupRef.current = mountStaked(rootRef.current, {
          seed, player: address, bots, onFinish: (inp) => onFinishRef.current(inp),
        });
      }
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage || (e as Error).message;
      setPhase('idle');
      if (!/rejected|denied/i.test(msg)) setNote(`Error: ${msg.slice(0, 140)}`);
      else setNote('');
    }
  }, [address, publicClient, ensureFuji, writeContractAsync, signMessageAsync]);

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
      <div className="cg-wallet">
        {authenticated && address ? (
          <>
            <span className="chip mono" style={{ borderColor: 'rgba(34,197,94,.4)', color: '#22c55e' }}>● {shortAddr}</span>
            <div className="cg-modes">
              <button className={`cg-mode ${mode === 'practice' ? 'on' : ''}`} onClick={() => { setMode('practice'); setPhase('idle'); setNote(''); }}>Practice</button>
              <button className={`cg-mode ${mode === 'staked' ? 'on' : ''}`} onClick={() => { setMode('staked'); }}>Staked · Testnet</button>
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
              <div className="cg-stake-sub">Stake <b>0.01 AVAX</b> vs 3 house bots · winner takes ◆ 0.02 · real on-chain escrow</div>
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

      <div ref={rootRef} style={{ display: mode === 'watch' ? 'none' : undefined }} />
    </div>
  );
}
