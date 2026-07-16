"use client";

/**
 * /admin/derive — dev/admin tool. Land mask'i hesaplar, merkle tree'yi inşa
 * eder, `landRoot.json` indirir. Kontrat deploy edildikten sonra
 * `contracts/script/SetLandRoot.s.sol`'ye verilecek LAND_ROOT'u burada
 * türetiyoruz.
 *
 * Üretimde bu route gizlenmeli veya middleware ile basic-auth korunmalı.
 */
import {useState} from "react";
import {computeLandMask, tokenIdOf} from "@/lib/landMask";
import {buildLandTree, exportSnapshot} from "@/lib/landMerkle";
import {EDGE_THRESHOLD, GRID_H, GRID_W} from "@/lib/config";

export default function DerivePage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    edgeT: number;
    count: number;
    root: string;
    ms: number;
  } | null>(null);
  const [edgeT, setEdgeT] = useState(EDGE_THRESHOLD);

  const run = async () => {
    setBusy(true);
    setResult(null);
    const t0 = performance.now();
    try {
      const mask = await computeLandMask(edgeT);
      const ids = mask.cells.map((c) => tokenIdOf(c.c, c.r));
      const tree = buildLandTree(ids);
      const snap = exportSnapshot(ids, edgeT, tree);
      const ms = Math.round(performance.now() - t0);
      setResult({edgeT: snap.edgeT, count: snap.ids.length, root: snap.root, ms});

      // Download
      const blob = new Blob([JSON.stringify(snap)], {type: "application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `landRoot-${edgeT}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(1400px 800px at 60% -10%,#0f2230 0%,transparent 60%), var(--ink)",
      }}
    >
      <div style={{maxWidth: 560, width: "100%"}}>
        <h1 style={{margin: "0 0 12px", fontSize: 20}}>
          Derive land merkle root
        </h1>
        <p style={{color: "var(--muted)", fontSize: 13, lineHeight: 1.6, marginTop: 0}}>
          Computes the land mask, builds the merkle tree with{" "}
          <code>SimpleMerkleTree</code>, and downloads{" "}
          <code>landRoot-{edgeT}.json</code>. Set the <code>root</code> value as{" "}
          <code>LAND_ROOT</code> in <code>contracts/.env</code> and run{" "}
          <code>forge script SetLandRoot.s.sol</code>.
        </p>

        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            fontFamily: "var(--mono)",
            fontSize: 12,
          }}
        >
          <Row k="grid" v={`${GRID_W} × ${GRID_H}`} />
          <Row k="edgeT" v={String(edgeT)} />
          <Row k="leaf format" v="keccak256(abi.encodePacked(uint256 tokenId))" />
          <Row k="tree" v="@openzeppelin/merkle-tree · SimpleMerkleTree" />
        </div>

        <div style={{display: "flex", gap: 8, alignItems: "center", marginBottom: 12}}>
          <label style={{fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)"}}>
            edgeT
          </label>
          <input
            type="number"
            step="0.05"
            min="0.1"
            max="0.95"
            value={edgeT}
            onChange={(e) => setEdgeT(Number(e.target.value))}
            style={{
              background: "var(--panel-2)",
              color: "var(--text)",
              border: "1px solid var(--line-strong)",
              borderRadius: 8,
              padding: "6px 10px",
              fontFamily: "var(--mono)",
              fontSize: 12,
              width: 80,
            }}
          />
          <span style={{fontSize: 11, color: "var(--muted)"}}>
            (0.55 at launch)
          </span>
        </div>

        <button className="btn primary" onClick={run} disabled={busy}>
          {busy ? "Computing…" : "Derive and download"}
        </button>

        {result && (
          <div
            style={{
              marginTop: 20,
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 16,
              fontFamily: "var(--mono)",
              fontSize: 12,
            }}
          >
            <Row k="edgeT" v={String(result.edgeT)} />
            <Row k="land cells" v={result.count.toLocaleString("en-US")} />
            <Row k="root" v={result.root} mono />
            <Row k="elapsed" v={`${result.ms} ms`} />
            <div style={{marginTop: 8, fontSize: 11, color: "var(--muted)"}}>
              JSON downloaded. Commit as <code>web/public/data/land.json</code> to
              make it the canonical land set for the frontend.
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Row({k, v, mono}: {k: string; v: string; mono?: boolean}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
        color: "var(--muted)",
        gap: 12,
      }}
    >
      <span>{k}</span>
      <b
        style={{
          color: "var(--text)",
          fontFamily: mono ? "var(--mono)" : undefined,
          fontSize: mono ? 11 : undefined,
          wordBreak: "break-all",
          textAlign: "right",
        }}
      >
        {v}
      </b>
    </div>
  );
}
