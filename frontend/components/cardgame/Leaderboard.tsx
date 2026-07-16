'use client';

/** CAR(D) GAME — global leaderboard (Watch mode). Ranks every wallet that has
 *  finished an on-chain race on the current escrow (house bots excluded), by
 *  wins → AVAX won → fewest races. Data comes from the server-side settle
 *  index; while the index is still catching up a progress note shows. */
import { useEffect, useState } from 'react';
import { Crown } from 'lucide-react';

interface Row { address: string; races: number; wins: number; podiums: number; won: number; rank: number }
interface Board { rows: Row[]; me: Row | null; matches: number; scan?: { scannedTo: number; head: number; complete: boolean }; error?: string }

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const MEDALS = ['🥇', '🥈', '🥉'];

export default function Leaderboard({ myAddress }: { myAddress?: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`/avalanche/api/cardgame/leaderboard${myAddress ? `?me=${myAddress}` : ''}`, { cache: 'no-store' });
        const d: Board = await r.json();
        if (alive && !d.error) setBoard(d);
      } catch { /* board offline — keep the last one */ }
    };
    void load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [myAddress]);

  if (!board) return null;
  const mine = myAddress?.toLowerCase();
  const meVisible = board.rows.some((r) => r.address === mine);
  const indexing = board.scan && !board.scan.complete;

  return (
    <div className="lb-wrap glass">
      <div className="lb-head">
        <Crown size={15} className="lb-crown" />
        <span className="lb-title">GLOBAL LEADERBOARD</span>
        <span className="lb-sub">{board.matches} settled race{board.matches === 1 ? '' : 's'} · house bots excluded</span>
      </div>
      {board.rows.length === 0 ? (
        <div className="lb-empty">{indexing ? 'Indexing on-chain races…' : 'No settled races yet — win one to claim the crown.'}</div>
      ) : (
        <div className="lb-rows">
          <div className="lb-row lb-hd"><b>#</b><span>RACER</span><em>RACES</em><em>WINS</em><em>WIN%</em><em>◆ WON</em></div>
          {board.rows.map((r) => (
            <div key={r.address} className={`lb-row${r.rank === 1 ? ' first' : ''}${r.address === mine ? ' me' : ''}`}>
              <b>{MEDALS[r.rank - 1] ?? r.rank}</b>
              <span className="mono">{r.address === mine ? 'YOU' : short(r.address)}</span>
              <em>{r.races}</em>
              <em>{r.wins}</em>
              <em>{Math.round((r.wins / r.races) * 100)}%</em>
              <em className="gold">◆ {r.won}</em>
            </div>
          ))}
          {board.me && !meVisible && (
            <div className="lb-row me lb-mine-far">
              <b>{board.me.rank}</b>
              <span className="mono">YOU</span>
              <em>{board.me.races}</em>
              <em>{board.me.wins}</em>
              <em>{Math.round((board.me.wins / board.me.races) * 100)}%</em>
              <em className="gold">◆ {board.me.won}</em>
            </div>
          )}
        </div>
      )}
      {indexing && board.scan && (
        <div className="lb-foot">indexing… block {board.scan.scannedTo.toLocaleString('en-US')} / {board.scan.head.toLocaleString('en-US')}</div>
      )}
    </div>
  );
}
