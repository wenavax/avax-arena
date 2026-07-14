'use client';

/**
 * ICM Lab — live cross-chain ticket panel for the scheduled-race lobby.
 * Client-side only: reads the Fuji RaceTicketHub and the Echo RaceTicketGate
 * over their public RPCs (no server involvement). Env-gated: without both
 * contract addresses it renders the original "coming soon" teaser.
 */
import { useEffect, useState } from 'react';
import { createPublicClient, http, parseAbi, type Hex } from 'viem';

const HUB = process.env.NEXT_PUBLIC_ICM_HUB as Hex | undefined;
const GATE = process.env.NEXT_PUBLIC_ICM_GATE as Hex | undefined;
const FUJI_RPC = 'https://api.avax-test.network/ext/bc/C/rpc';
const ECHO_RPC = 'https://subnets.avax.network/echo/testnet/rpc';

const HUB_ABI = parseAbi(['function getTickets() view returns (address[32], uint64[32], uint8, uint8)']);
const GATE_ABI = parseAbi(['function lastResult() view returns (bytes32, address[4], uint64)']);

const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4);
const ago = (t: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - t));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
};

interface Ticket { player: string; at: number }
interface LastResult { matchId: string; winner: string; at: number }

export default function IcmLab() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [result, setResult] = useState<LastResult | null>(null);

  useEffect(() => {
    if (!HUB || !GATE) return;
    const fuji = createPublicClient({ transport: http(FUJI_RPC) });
    const echo = createPublicClient({ transport: http(ECHO_RPC) });
    let dead = false;
    const load = async () => {
      try {
        const [players, times, count, head] = await fuji.readContract({
          address: HUB, abi: HUB_ABI, functionName: 'getTickets',
        }) as unknown as [string[], bigint[], number, number];
        const out: Ticket[] = [];
        // newest first: walk backwards from head-1 over `count` filled slots
        for (let i = 0; i < count; i++) {
          const idx = (head - 1 - i + 64) % 32;
          out.push({ player: players[idx], at: Number(times[idx]) });
        }
        if (!dead) setTickets(out.slice(0, 5));
      } catch { /* panel is best-effort */ }
      try {
        const [matchId, ranking, postedAt] = await echo.readContract({
          address: GATE, abi: GATE_ABI, functionName: 'lastResult',
        }) as unknown as [string, string[], bigint];
        if (!dead && Number(postedAt) > 0) setResult({ matchId, winner: ranking[0], at: Number(postedAt) });
      } catch { /* best-effort */ }
    };
    void load();
    const id = setInterval(load, 20_000);
    return () => { dead = true; clearInterval(id); };
  }, []);

  if (!HUB || !GATE) {
    return (
      <div className="cg-icm">🔗 Cross-chain race entries from Avalanche L1s — powered by <b>Avalanche ICM</b> · <span className="cg-icm-soon">COMING SOON</span></div>
    );
  }
  return (
    <div className="cg-icmlab">
      <div className="cg-icmlab-hd">🔗 ICM LAB <span className="cg-icm-soon">LIVE · TESTNET</span>
        <span className="cg-icmlab-sub">cross-chain tickets from <b>Echo L1</b> via Avalanche ICM</span></div>
      {tickets.length === 0 ? (
        <div className="cg-icmlab-empty">No cross-chain tickets yet — buy one on Echo and watch it land here.</div>
      ) : (
        <ul className="cg-icmlab-list">
          {tickets.map((t, i) => (
            <li key={`${t.player}-${t.at}-${i}`}><span className="mono">{short(t.player)}</span> from Echo L1 · {ago(t.at)}</li>
          ))}
        </ul>
      )}
      {result && (
        <div className="cg-icmlab-res">🏁 last result relayed back to Echo: <span className="mono">{short(result.winner)}</span> won · {ago(result.at)}</div>
      )}
      <div className="cg-icmlab-links">
        <a href={`https://testnet.snowtrace.io/address/${HUB}`} target="_blank" rel="noopener noreferrer">hub ↗</a>
        <a href={`https://testnet.avascan.info/blockchain/echo/address/${GATE}`} target="_blank" rel="noopener noreferrer">gate ↗</a>
      </div>
    </div>
  );
}
