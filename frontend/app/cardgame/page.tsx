'use client';

import { useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { Wallet, LogOut } from 'lucide-react';
import { mountCardGame } from '@/lib/cardgame/mount';
import './cardgame.css';

export default function CardGamePage() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address } = useAccount();
  const rootRef = useRef<HTMLDivElement>(null);

  // Cüzdan değişince oyun yeni kimlikle yeniden kurulur (maç baştan başlar)
  useEffect(() => {
    if (!rootRef.current) return;
    return mountCardGame(rootRef.current, { address: address ?? null });
  }, [address]);

  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';

  return (
    <div className="cgroot py-4">
      <div className="cg-wallet">
        {authenticated && address ? (
          <>
            <span className="chip mono" style={{ borderColor: 'rgba(34,197,94,.4)', color: '#22c55e' }}>
              ● racing as {shortAddr}
            </span>
            <button className="btn ghost" onClick={logout} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <LogOut size={13} /> Disconnect
            </button>
          </>
        ) : (
          <>
            <button
              className="btn"
              onClick={login}
              disabled={!ready}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <Wallet size={15} /> CONNECT WALLET
            </button>
            <span className="pill">connect to race under your address — escrow phase coming</span>
          </>
        )}
      </div>
      <div ref={rootRef} />
    </div>
  );
}
