"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import AtlasCanvas, {createAtlasStore} from "@/components/AtlasCanvas";
import type {AtlasSelection} from "@/components/AtlasCanvas";
import SelectionCard from "@/components/SelectionCard";
import WalletButton from "@/components/WalletButton";
import type {WalletConn} from "@/lib/wallet";
import {scanChainLogs} from "@/lib/events";
import {buildLandTree, proofFor, rootOf} from "@/lib/landMerkle";
import {loadBlocklist} from "@/lib/blocklist";
import {CHAIN_ID, CHAIN_NAME, EDGE_THRESHOLD, IS_DEMO} from "@/lib/config";

export default function AtlasPage() {
  const storeRef = useRef(createAtlasStore());
  const [selection, setSelection] = useState<AtlasSelection | null>(null);
  const [landCount, setLandCount] = useState<number | null>(null);
  const [landIds, setLandIds] = useState<number[] | null>(null);
  const [mintedCount, setMintedCount] = useState(0);
  const [conn, setConn] = useState<WalletConn | null>(null);
  const [drawTick, setDrawTick] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const account = conn?.account ?? null;

  // ~60K leaf'lı merkle tree — landIds set'i değişince yeniden inşa edilir.
  // İnşa ~1s tutar, getProof O(log N).
  const tree = useMemo(() => {
    if (!landIds) return null;
    return buildLandTree(landIds);
  }, [landIds]);

  const localRoot = useMemo(() => (tree ? rootOf(tree) : null), [tree]);

  const proof = useMemo<`0x${string}`[]>(() => {
    if (!tree || !selection) return [];
    try {
      return proofFor(tree, selection.tokenId);
    } catch {
      // selected pixel land set'te yoksa (olmamalı, AtlasCanvas filtreliyor)
      return [];
    }
  }, [tree, selection]);

  // Boot'ta blocklist'i yükle (silent, dosya yoksa boş set)
  useEffect(() => {
    loadBlocklist().then((view) => {
      storeRef.current.blocklist = view;
      setDrawTick((t) => t + 1);
    });
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  // Cell güncellendiğinde tek pixel re-draw için drawTick'i bumple
  const onCellUpdate = useCallback(() => {
    setMintedCount(storeRef.current.owners.size);
    setDrawTick((t) => t + 1);
  }, []);

  // Wallet bağlanınca event log taramasını başlat
  const handleConn = useCallback(
    (c: WalletConn | null) => {
      setConn(c);
      if (!c) return;
      if (IS_DEMO) return;
      toast("Scanning chain…");
      scanChainLogs(c.atlas, storeRef.current, onCellUpdate, ({done}) => {
        if (done) toast("Scan complete");
      }).catch((e) => {
        toast("Scan error: " + (e as Error).message.slice(0, 40));
      });
    },
    [onCellUpdate, toast]
  );

  return (
    <div id="app" style={{position: "fixed", inset: 0}}>
      <AtlasCanvas
        edgeT={EDGE_THRESHOLD}
        account={account}
        storeRef={storeRef}
        onSelect={setSelection}
        onReady={({landCount, landIds}) => {
          setLandCount(landCount);
          setLandIds(landIds);
        }}
        drawTick={drawTick}
      />

      <div
        className="hud tl"
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "flex-start",
          zIndex: 5,
        }}
      >
        <div style={{display: "flex", alignItems: "center", gap: 10}}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: "conic-gradient(from 45deg,#f4a259,#6fd6e8,#9b8cff,#f4a259)",
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,.4)",
            }}
          />
          <h1 style={{fontSize: 15, margin: 0, fontWeight: 650}}>Base Atlas</h1>
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.18em",
              color: "var(--cyan)",
              textTransform: "uppercase",
              border: "1px solid var(--line-strong)",
              borderRadius: 999,
              padding: "2px 7px",
            }}
          >
            {CHAIN_NAME}
          </span>
        </div>
        <div style={{display: "flex", gap: 7, flexWrap: "wrap"}}>
          <Stat k="Land" v={landCount?.toLocaleString("en-US") ?? "—"} />
          <Stat k="Minted" v={mintedCount.toLocaleString("en-US")} />
          <Stat k="Chain" v={String(CHAIN_ID)} />
        </div>
      </div>

      <div
        className="hud tr"
        style={{position: "absolute", top: 16, right: 16, zIndex: 5}}
      >
        <WalletButton onChange={handleConn} />
      </div>

      {IS_DEMO && (
        <div
          className="glass"
          style={{
            position: "absolute",
            top: 70,
            right: 16,
            padding: "6px 12px",
            border: "1px solid var(--line-strong)",
            borderRadius: 999,
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--amber)",
            zIndex: 5,
          }}
        >
          DEMO · no on-chain writes
        </div>
      )}

      {toastMsg && (
        <div
          className="glass"
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 16px",
            border: "1px solid var(--line-strong)",
            borderRadius: 999,
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: "var(--text)",
            zIndex: 7,
          }}
        >
          {toastMsg}
        </div>
      )}

      {selection && (
        <SelectionCard
          sel={selection}
          conn={conn}
          account={account}
          store={storeRef.current}
          onClose={() => setSelection(null)}
          onCellUpdate={onCellUpdate}
          toast={toast}
          proof={proof}
        />
      )}

      {localRoot && (
        <div
          className="glass"
          style={{
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "5px 10px",
            border: "1px solid var(--line)",
            borderRadius: 6,
            fontFamily: "var(--mono)",
            fontSize: 9,
            color: "var(--muted)",
            zIndex: 4,
          }}
          title="JS-side land merkle root (kontrat landRoot() ile eşleşmelidir)"
        >
          root {localRoot.slice(0, 10)}…{localRoot.slice(-6)}
        </div>
      )}
    </div>
  );
}

function Stat({k, v}: {k: string; v: string}) {
  return (
    <div
      style={{
        background: "var(--panel)",
        backdropFilter: "blur(10px)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "5px 9px",
        fontFamily: "var(--mono)",
        fontSize: 11,
        color: "var(--muted)",
      }}
    >
      {k} <b style={{color: "var(--text)"}}>{v}</b>
    </div>
  );
}
