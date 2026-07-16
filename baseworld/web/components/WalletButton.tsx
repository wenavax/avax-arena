"use client";

import {useEffect, useState} from "react";
import type {WalletConn} from "@/lib/wallet";
import {connectWallet, hasInjectedWallet, watchAccount, watchChain} from "@/lib/wallet";
import {IS_DEMO} from "@/lib/config";
import {shortAddr} from "@/lib/colors";
import {parseTxError} from "@/lib/txErrors";

type Props = {
  onChange: (conn: WalletConn | null) => void;
};

export default function WalletButton({onChange}: Props) {
  const [account, setAccount] = useState<string | null>(null);
  const [conn, setConn] = useState<WalletConn | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = async () => {
    setErr(null);
    if (IS_DEMO || !hasInjectedWallet()) {
      const demo = "0xDEMO00000000000000000000000000000000d3m0";
      setAccount(demo);
      onChange(null); // demo mod: gerçek conn yok
      return;
    }
    try {
      setBusy(true);
      const c = await connectWallet();
      setConn(c);
      setAccount(c.account);
      onChange(c);
    } catch (e) {
      console.error("wallet connect error", e);
      setErr(parseTxError(e).short);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!conn) return;
    const a = watchAccount((accs) => {
      const next = accs[0] ?? null;
      setAccount(next);
      if (!next) {
        setConn(null);
        onChange(null);
      }
    });
    const c = watchChain(() => {
      // Chain değişti — sayfayı yenilemek en güvenli
      window.location.reload();
    });
    return () => {
      a();
      c();
    };
  }, [conn, onChange]);

  if (account) {
    return (
      <span
        className="glass"
        style={{
          padding: "8px 12px",
          border: "1px solid var(--line-strong)",
          borderRadius: 999,
          fontFamily: "var(--mono)",
          fontSize: 12,
          color: "var(--text)",
        }}
      >
        {account.startsWith("0xDEMO") ? "Demo wallet" : shortAddr(account)}
      </span>
    );
  }

  return (
    <div style={{display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6}}>
      <button className="btn primary" onClick={onClick} disabled={busy}>
        {busy ? "Connecting…" : "Connect wallet"}
      </button>
      {err && (
        <span style={{fontFamily: "var(--mono)", fontSize: 10, color: "var(--bad)"}}>{err}</span>
      )}
    </div>
  );
}
