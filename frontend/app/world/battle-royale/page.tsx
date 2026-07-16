'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, useSwitchChain, usePublicClient } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { mp } from '@/lib/game/multiplayer/socket';

const BR_CONTRACT = '0xf253bE24ffeC8D21B8Bc9169b80bc0DC34927Fb3' as const;
const AVALANCHE_CHAIN_ID = 43114;

const BR_ABI = [
  { inputs: [], name: 'joinLobby', outputs: [], stateMutability: 'payable', type: 'function' },
  { inputs: [{ name: 'lobbyId', type: 'uint256' }], name: 'leaveLobby', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'getCurrentLobby', outputs: [{ components: [
    { name: 'id', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'prizePool', type: 'uint256' },
    { name: 'playerCount', type: 'uint256' }, { name: 'createdAt', type: 'uint256' }, { name: 'startedAt', type: 'uint256' },
    { name: 'winner', type: 'address' }, { name: 'prizeClaimed', type: 'bool' },
  ], name: '', type: 'tuple' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'currentLobbyId', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

type BRState = 'idle' | 'joining' | 'waiting' | 'fighting' | 'finished';

interface MatchState {
  yourTurn: boolean;
  you: any;
  opponent: any;
  round: number;
  aliveCount?: number;
}

export default function BattleRoyalePage() {
  const { address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [state, setState] = useState<BRState>('idle');
  const [lobbyId, setLobbyId] = useState<string | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);
  const [status, setStatus] = useState('');

  const { data: currentLobby, refetch: refetchLobby } = useReadContract({
    address: BR_CONTRACT, abi: BR_ABI, functionName: 'getCurrentLobby',
  });
  const { data: currentLobbyIdOnChain, refetch: refetchLobbyId } = useReadContract({
    address: BR_CONTRACT, abi: BR_ABI, functionName: 'currentLobbyId',
  });
  const publicClient = usePublicClient();

  const addLog = useCallback((msg: string) => {
    setLog(prev => [...prev.slice(-19), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  // Socket.io event listeners
  useEffect(() => {
    if (!mp.connected) mp.connect();

    mp.on('br-lobby-update', (data: any) => {
      setPlayers(data.players || []);
      setPlayerCount(data.count);
      addLog(`Player joined — ${data.count}/${data.minPlayers} players`);
    });

    mp.on('br-started', (data: any) => {
      setState('fighting');
      addLog(`Battle Royale started! ${data.playerCount} warriors clash!`);
    });

    mp.on('br-match-start', (data: any) => {
      setMatch({
        yourTurn: data.yourTurn,
        you: data.you,
        opponent: data.opponent,
        round: data.round,
        aliveCount: data.aliveCount,
      });
      addLog(`Round ${data.round}: vs ${data.opponent.name} (${data.aliveCount} alive)`);
    });

    mp.on('br-battle-update', (data: any) => {
      if (data.matchFinished) {
        addLog(data.winner ? 'You won the match!' : 'You were eliminated...');
        if (!data.winner) setState('finished');
        setMatch(null);
      } else {
        setMatch(prev => prev ? {
          ...prev,
          yourTurn: data.yourTurn,
          you: data.you,
          opponent: data.opponent,
        } : null);
        if (data.action) {
          const a = data.action;
          addLog(a.missed ? 'Attack dodged!' : `${a.crit ? 'CRIT! ' : ''}${a.damage} damage`);
        }
      }
    });

    mp.on('br-bye', (data: any) => {
      addLog(`Round ${data.round}: You got a bye — resting...`);
    });

    mp.on('br-round-end', (data: any) => {
      addLog(`Round ${data.round} over — ${data.aliveCount} remain`);
    });

    mp.on('br-finished', (data: any) => {
      setState('finished');
      setResult(data);
      if (data.winner) {
        addLog(`WINNER: ${data.winner.name} — ${data.prize} AVAX prize!`);
      }
    });

    mp.on('br-error', (data: any) => {
      setStatus(data.message);
    });

    return () => {
      // off() with a fresh arrow fn removes nothing (different reference) —
      // these events are exclusive to this page, so offAll is the right cleanup.
      for (const e of [
        'br-lobby-update', 'br-started', 'br-match-start', 'br-battle-update',
        'br-bye', 'br-round-end', 'br-finished', 'br-error',
      ]) mp.offAll(e);
    };
  }, [addLog]);

  // Join Battle Royale
  const joinBR = async () => {
    if (!isConnected || !address) { setStatus('Connect wallet first'); return; }
    try {
      setState('joining');
      setStatus('Switching chain...');
      await switchChainAsync?.({ chainId: AVALANCHE_CHAIN_ID });

      setStatus('Paying entry fee (1 AVAX)...');
      const tx = await writeContractAsync({
        address: BR_CONTRACT, abi: BR_ABI, functionName: 'joinLobby',
        value: parseEther('1'),
      });
      // Wait for the join tx to be mined — otherwise the lobby id read below
      // still reflects pre-join chain state.
      await publicClient?.waitForTransactionReceipt({ hash: tx });
      setStatus('Transaction confirmed! Joining lobby...');

      // Get lobby ID from chain (use the refetch result directly — the hook's
      // state variable in this closure is stale)
      refetchLobby();
      const idRes = await refetchLobbyId();
      const lid = idRes.data?.toString() || currentLobbyIdOnChain?.toString() || '1';
      setLobbyId(lid);

      // Register on socket server (offAll first: a listener stacked per join
      // attempt would emit duplicate br-joins on every reconnect)
      const emitJoin = () => {
        (mp as any).socket?.emit('br-join', {
          lobbyId: lid, wallet: address,
          hp: 100, atk: 15, def: 8, spd: 10,
        });
      };
      mp.offAll('_connected');
      mp.on('_connected', emitJoin);
      if (mp.connected) emitJoin();

      setState('waiting');
      setStatus('');
      addLog('Joined Battle Royale lobby!');
    } catch (e: any) {
      setState('idle');
      setStatus(`Error: ${e.shortMessage || e.message}`);
    }
  };

  // Attack action
  const doAttack = () => {
    if (!match?.yourTurn || !lobbyId) return;
    (mp as any).socket?.emit('br-action', { lobbyId, action: 'attack' });
  };

  const onChainPool = currentLobby ? formatEther(currentLobby.prizePool) : '0';
  const onChainCount = currentLobby ? Number(currentLobby.playerCount) : 0;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a0008 0%, #1a0515 50%, #0a0008 100%)',
      color: '#e0e4ee', fontFamily: 'Inter, Arial, sans-serif',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '24px 16px',
    }}>
      {/* Header */}
      <h1 style={{
        fontSize: 36, fontWeight: 900, margin: '0 0 4px',
        background: 'linear-gradient(90deg, #ff4444, #ff8800, #ffdd00)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        fontFamily: '"Press Start 2P", monospace', letterSpacing: 2,
      }}>
        BATTLE ROYALE
      </h1>
      <p style={{ color: '#886666', fontSize: 14, marginBottom: 24 }}>
        Last warrior standing wins the prize pool
      </p>

      {/* Prize Pool Card */}
      <div style={{
        background: 'rgba(40,10,20,0.8)', borderRadius: 16, padding: 24,
        border: '1px solid rgba(255,68,68,0.2)', width: '100%', maxWidth: 500,
        textAlign: 'center', marginBottom: 24,
      }}>
        <div style={{ fontSize: 12, color: '#886666', marginBottom: 8, fontWeight: 600 }}>PRIZE POOL</div>
        <div style={{ fontSize: 40, fontWeight: 900, color: '#ffdd00' }}>
          {playerCount > 0 ? (playerCount * 0.95).toFixed(1) : onChainCount > 0 ? (onChainCount * 0.95).toFixed(1) : '0'} AVAX
        </div>
        <div style={{ fontSize: 13, color: '#886666', marginTop: 4 }}>
          Entry: 1 AVAX | Fee: 5% | Min: 10 players
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-around', marginTop: 16,
          background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '12px 0',
        }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#ff6644' }}>{playerCount || onChainCount}</div>
            <div style={{ fontSize: 10, color: '#886666' }}>PLAYERS</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#ffaa00' }}>10</div>
            <div style={{ fontSize: 10, color: '#886666' }}>MIN</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#44dd66' }}>50</div>
            <div style={{ fontSize: 10, color: '#886666' }}>MAX</div>
          </div>
        </div>
      </div>

      {/* State-based UI */}
      {state === 'idle' && (
        <button onClick={joinBR} style={{
          padding: '18px 48px', borderRadius: 12, border: 'none',
          background: 'linear-gradient(135deg, #cc2222, #ff4444)', color: '#fff',
          fontSize: 20, fontWeight: 900, cursor: 'pointer', letterSpacing: 2,
          boxShadow: '0 6px 30px rgba(255,68,68,0.3)', width: '100%', maxWidth: 500,
        }}>
          JOIN BATTLE — 1 AVAX
        </button>
      )}

      {state === 'waiting' && (
        <div style={{
          background: 'rgba(40,10,20,0.6)', borderRadius: 12, padding: 20,
          border: '1px solid rgba(255,170,0,0.2)', width: '100%', maxWidth: 500,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#ffaa00', marginBottom: 8 }}>
            Waiting for players... {playerCount}/10
          </div>
          <div style={{
            height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.1)',
            overflow: 'hidden', marginBottom: 16,
          }}>
            <div style={{
              height: '100%', borderRadius: 4, transition: 'width 0.5s',
              background: 'linear-gradient(90deg, #ff4444, #ffaa00)',
              width: `${Math.min(100, (playerCount / 10) * 100)}%`,
            }} />
          </div>
          {/* Player list */}
          <div style={{ textAlign: 'left' }}>
            {players.map((p, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', padding: '4px 8px',
                background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                borderRadius: 4, fontSize: 12, color: '#aaa',
              }}>
                <span>{p.name}</span>
                <span style={{ color: '#666' }}>Lv{p.level} {p.playerClass}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {state === 'fighting' && match && (
        <div style={{
          background: 'rgba(40,10,20,0.8)', borderRadius: 16, padding: 24,
          border: '1px solid rgba(255,68,68,0.3)', width: '100%', maxWidth: 500,
        }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: '#886666' }}>ROUND {match.round}</span>
            {match.aliveCount && (
              <span style={{ fontSize: 12, color: '#ff6644', marginLeft: 12 }}>{match.aliveCount} alive</span>
            )}
          </div>

          {/* You vs Opponent */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            {/* You */}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#00ccee' }}>{match.you.name}</div>
              <div style={{ fontSize: 11, color: '#667' }}>Lv{match.you.level} {match.you.playerClass}</div>
              <div style={{
                height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.1)',
                margin: '8px 0', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 5, transition: 'width 0.3s',
                  background: match.you.hp / match.you.maxHp > 0.5 ? '#44dd66' : match.you.hp / match.you.maxHp > 0.25 ? '#ffaa00' : '#ff4444',
                  width: `${(match.you.hp / match.you.maxHp) * 100}%`,
                }} />
              </div>
              <div style={{ fontSize: 12, color: '#aaa' }}>HP {match.you.hp}/{match.you.maxHp}</div>
            </div>

            <div style={{ fontSize: 24, color: '#ff4444', alignSelf: 'center', fontWeight: 900 }}>VS</div>

            {/* Opponent */}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#ff6644' }}>{match.opponent.name}</div>
              <div style={{ fontSize: 11, color: '#667' }}>Lv{match.opponent.level} {match.opponent.playerClass}</div>
              <div style={{
                height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.1)',
                margin: '8px 0', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 5, transition: 'width 0.3s',
                  background: '#cc3333',
                  width: `${(match.opponent.hp / match.opponent.maxHp) * 100}%`,
                }} />
              </div>
              <div style={{ fontSize: 12, color: '#aaa' }}>HP {match.opponent.hp}/{match.opponent.maxHp}</div>
            </div>
          </div>

          {/* Action */}
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            {match.yourTurn ? (
              <button onClick={doAttack} style={{
                padding: '14px 48px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #cc2222, #ff4444)', color: '#fff',
                fontSize: 18, fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(255,68,68,0.3)',
                animation: 'pulse 1s infinite',
              }}>
                ATTACK!
              </button>
            ) : (
              <div style={{ color: '#886666', fontSize: 14, fontStyle: 'italic' }}>
                Opponent&apos;s turn...
              </div>
            )}
          </div>
        </div>
      )}

      {state === 'fighting' && !match && (
        <div style={{
          background: 'rgba(40,10,20,0.6)', borderRadius: 12, padding: 20,
          border: '1px solid rgba(255,170,0,0.2)', width: '100%', maxWidth: 500,
          textAlign: 'center', color: '#ffaa00',
        }}>
          Waiting for next round...
        </div>
      )}

      {state === 'finished' && result && (
        <div style={{
          background: 'rgba(40,10,20,0.8)', borderRadius: 16, padding: 32,
          border: `2px solid ${result.winner?.wallet?.toLowerCase() === address?.toLowerCase() ? '#ffdd00' : '#cc3333'}`,
          width: '100%', maxWidth: 500, textAlign: 'center',
        }}>
          {result.winner?.wallet?.toLowerCase() === address?.toLowerCase() ? (
            <>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#ffdd00' }}>VICTORY!</div>
              <div style={{ fontSize: 20, color: '#44dd66', marginTop: 8 }}>+{result.prize} AVAX</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 48, marginBottom: 8 }}>💀</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#cc3333' }}>ELIMINATED</div>
            </>
          )}
          <div style={{ fontSize: 13, color: '#886666', marginTop: 16 }}>
            Winner: {result.winner?.name} | {result.rounds} rounds | {result.playerCount} players
          </div>
          <button onClick={() => { setState('idle'); setResult(null); setLog([]); setPlayers([]); setMatch(null); }} style={{
            marginTop: 20, padding: '12px 32px', borderRadius: 8, border: 'none',
            background: 'rgba(255,255,255,0.1)', color: '#aaa', fontSize: 14, cursor: 'pointer',
          }}>
            Play Again
          </button>
        </div>
      )}

      {status && (
        <p style={{ color: status.startsWith('Error') ? '#ff4444' : '#44dd66', fontSize: 13, marginTop: 12 }}>
          {status}
        </p>
      )}

      {/* Battle Log */}
      <div style={{
        marginTop: 24, width: '100%', maxWidth: 500,
        background: 'rgba(10,5,15,0.8)', borderRadius: 12, padding: 16,
        border: '1px solid rgba(255,255,255,0.05)', maxHeight: 200, overflowY: 'auto',
      }}>
        <div style={{ fontSize: 11, color: '#554444', fontWeight: 600, marginBottom: 8 }}>BATTLE LOG</div>
        {log.length === 0 ? (
          <div style={{ fontSize: 12, color: '#443333' }}>Waiting for action...</div>
        ) : (
          log.map((l, i) => (
            <div key={i} style={{ fontSize: 11, color: '#998888', padding: '2px 0' }}>{l}</div>
          ))
        )}
      </div>

      {/* Back link */}
      <a href="/world" style={{
        marginTop: 24, color: '#554444', fontSize: 13, textDecoration: 'none',
      }}>
        ← Back to World
      </a>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
