"use client";

import {useEffect, useState} from "react";
import type {AtlasSelection} from "@/components/AtlasCanvas";
import type {WalletConn} from "@/lib/wallet";
import type {AtlasStore} from "@/lib/atlasState";
import {EXPLORER, IS_DEMO, MINT_PRICE_BASE} from "@/lib/config";
import {resolveURI, shortAddr} from "@/lib/colors";
import {loadImageInto} from "@/lib/events";
import {parseTxError} from "@/lib/txErrors";
import {builderCodeEnabled, withBuilderSuffix} from "@/lib/builderCode";

type Toast = (msg: string) => void;

type Props = {
  sel: AtlasSelection;
  conn: WalletConn | null;
  account: string | null;
  store: AtlasStore;
  onClose: () => void;
  onCellUpdate: (tokenId: number) => void;
  toast: Toast;
  /** mint proof for the selected pixel (boş array landCheck=off için) */
  proof?: `0x${string}`[];
};

export default function SelectionCard({
  sel,
  conn,
  account,
  store,
  onClose,
  onCellUpdate,
  toast,
  proof = [],
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "mint" | "approve" | "upload" | "setImg">("");
  const [allowanceOk, setAllowanceOk] = useState<boolean | null>(null);
  const [usdcBalanceOk, setUsdcBalanceOk] = useState<boolean | null>(null);

  useEffect(() => {
    // Selection değişince upload state'i sıfırla
    setFile(null);
    setPreviewUrl(null);
    setBusy("");
    setAllowanceOk(null);
    setUsdcBalanceOk(null);
  }, [sel.tokenId]);

  // Mint öncesi: allowance + balance kontrol et (free pixel + canlı zincir)
  useEffect(() => {
    let cancelled = false;
    const owner = sel.owner;
    if (owner || IS_DEMO || !conn) return;
    (async () => {
      try {
        const [price, allow, bal] = await Promise.all([
          conn.atlas.mintPrice(),
          conn.usdc.allowance(conn.account, await conn.atlas.getAddress()),
          conn.usdc.balanceOf(conn.account),
        ]);
        if (cancelled) return;
        setAllowanceOk(allow >= price);
        setUsdcBalanceOk(bal >= price);
      } catch (e) {
        console.error("[mint check error]", e);
        if (cancelled) return;
        setAllowanceOk(null);
        setUsdcBalanceOk(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sel.tokenId, sel.owner, conn]);

  const mine = sel.mine && !!account;
  const owner = sel.owner;

  const badge = !owner
    ? {label: "Free", color: "var(--good)"}
    : mine
      ? {label: "Yours", color: "var(--cyan)"}
      : {label: "Owned", color: "var(--amber)"};

  // ---- mint ----
  const doMint = async () => {
    if (busy) return;
    if (IS_DEMO || !conn) {
      // Demo: yerel state'e yaz
      store.owners.set(sel.tokenId, account?.toLowerCase() ?? "0xdemo");
      onCellUpdate(sel.tokenId);
      toast(`Minted (demo) · X${sel.cell.c} Y${sel.cell.r}`);
      return;
    }
    try {
      // Mint race koruması: tx göndermeden önce on-chain teyit et
      const owner: string = await conn.atlas.ownerOf(sel.tokenId).catch(() => "");
      if (owner && owner !== "0x0000000000000000000000000000000000000000") {
        store.owners.set(sel.tokenId, owner.toLowerCase());
        onCellUpdate(sel.tokenId);
        toast("This pixel was just minted — refreshed");
        return;
      }

      const price: bigint = await conn.atlas.mintPrice();
      // Sandwich protection: cap at current price (user accepts exact current
      // price; owner can't spike mid-flight)
      const maxPrice = price;
      const allow = await conn.usdc.allowance(conn.account, await conn.atlas.getAddress());
      if (allow < price) {
        setBusy("approve");
        toast("USDC approval (1/2 tx)…");
        // Approve exactly mintPrice — avoid MAX approval surface for any
        // remaining owner grief vectors (mintPrice can still change but maxPrice
        // guard on mint() blocks the sandwich)
        const tx = await conn.usdc.approve(await conn.atlas.getAddress(), price);
        await tx.wait();
      }
      setBusy("mint");
      toast("Sending mint (2/2 tx)…");
      // ERC-8021 builder code suffix — builderCodeEnabled false ise no-op
      let tx;
      if (builderCodeEnabled) {
        const populated = await conn.atlas.mint.populateTransaction(
          sel.cell.c,
          sel.cell.r,
          maxPrice,
          proof
        );
        tx = await conn.signer.sendTransaction({
          ...populated,
          data: withBuilderSuffix(populated.data!),
        });
      } else {
        tx = await conn.atlas.mint(sel.cell.c, sel.cell.r, maxPrice, proof);
      }
      const rcpt = await tx.wait();
      store.owners.set(sel.tokenId, conn.account.toLowerCase());
      onCellUpdate(sel.tokenId);
      toast(`Minted! tx ${rcpt.hash.slice(0, 10)}…`);
    } catch (e) {
      console.error("mint error", e);
      const parsed = parseTxError(e);
      // race condition: revert "already minted" → state'i refresh et
      if (parsed.kind === "already-minted") {
        try {
          const owner = await conn.atlas.ownerOf(sel.tokenId);
          if (owner && owner !== "0x0000000000000000000000000000000000000000") {
            store.owners.set(sel.tokenId, owner.toLowerCase());
            onCellUpdate(sel.tokenId);
          }
        } catch {
          /* ignore */
        }
      }
      toast(parsed.short);
    } finally {
      setBusy("");
    }
  };

  // ---- image upload ----
  const pickFile = (f: File | null) => {
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  const doUpload = async () => {
    if (!file || busy) return;
    try {
      setBusy("upload");
      toast("Uploading image…");
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", {method: "POST", body: fd});
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "upload failed");
      }
      const {uri} = (await res.json()) as {uri: string};

      if (IS_DEMO || !conn) {
        store.imgURIs.set(sel.tokenId, uri);
        loadImageInto(store, sel.tokenId, uri, onCellUpdate);
        toast("Image attached (demo)");
        return;
      }

      setBusy("setImg");
      toast("Writing on-chain…");
      let tx;
      if (builderCodeEnabled) {
        const populated = await conn.atlas.setPixelImage.populateTransaction(
          sel.tokenId,
          uri
        );
        tx = await conn.signer.sendTransaction({
          ...populated,
          data: withBuilderSuffix(populated.data!),
        });
      } else {
        tx = await conn.atlas.setPixelImage(sel.tokenId, uri);
      }
      await tx.wait();
      store.imgURIs.set(sel.tokenId, uri);
      loadImageInto(store, sel.tokenId, uri, onCellUpdate);
      toast("Image saved ✓");
    } catch (e) {
      console.error("upload error", e);
      toast(parseTxError(e).short);
    } finally {
      setBusy("");
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        bottom: 16,
        width: 320,
        padding: 16,
        background: "var(--panel)",
        backdropFilter: "blur(10px)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        color: "var(--text)",
        zIndex: 6,
      }}
    >
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start"}}>
        <div>
          <div style={{fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600}}>
            X {sel.cell.c} · Y {sel.cell.r}
          </div>
          <div style={{fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", marginTop: 2}}>
            {sel.lonLat
              ? `${sel.lonLat[1].toFixed(1)}°, ${sel.lonLat[0].toFixed(1)}° · ${sel.countryName}`
              : sel.countryName}
          </div>
        </div>
        <div style={{display: "flex", gap: 8, alignItems: "center"}}>
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: badge.color,
              border: `1px solid ${badge.color}`,
              borderRadius: 999,
              padding: "2px 7px",
            }}
          >
            {badge.label}
          </span>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <div style={{marginTop: 12, fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)"}}>
        tokenId <b style={{color: "var(--text)"}}>{sel.tokenId}</b>
      </div>

      {/* state: free */}
      {!owner && (
        <div style={{marginTop: 12}}>
          <div style={{display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8}}>
            <span style={{fontSize: 20, fontWeight: 600}}>1</span>
            <span style={{fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)"}}>
              USDC
            </span>
            <span style={{fontSize: 11, color: "var(--muted)", marginLeft: "auto"}}>
              ({Number(MINT_PRICE_BASE)} unit)
            </span>
          </div>

          {/* 2-tx flow notice */}
          {!IS_DEMO && conn && allowanceOk === false && (
            <div
              style={{
                marginBottom: 8,
                padding: "8px 10px",
                background: "var(--ink)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                fontSize: 11,
                color: "var(--muted)",
                lineHeight: 1.5,
              }}
            >
              <b style={{color: "var(--cyan)"}}>2 transactions</b> required: 1) USDC
              approval, 2) Mint. Your wallet will prompt for two signatures.
            </div>
          )}

          {!IS_DEMO && conn && usdcBalanceOk === false && (
            <div
              style={{
                marginBottom: 8,
                padding: "8px 10px",
                background: "var(--ink)",
                border: "1px solid var(--bad)",
                borderRadius: 8,
                fontSize: 11,
                color: "var(--bad)",
                lineHeight: 1.5,
              }}
            >
              Insufficient USDC. You need 1 USDC.
            </div>
          )}

          <button
            className="btn primary"
            style={{width: "100%"}}
            onClick={doMint}
            disabled={!!busy || usdcBalanceOk === false}
          >
            {busy === "mint"
              ? "Minting (2/2)…"
              : busy === "approve"
                ? "USDC approval (1/2)…"
                : !IS_DEMO && conn && allowanceOk === false
                  ? "Approve and mint"
                  : "Mint this pixel"}
          </button>
        </div>
      )}

      {/* state: taken (someone else) */}
      {owner && !mine && (
        <div style={{marginTop: 12}}>
          <div style={{fontSize: 12, color: "var(--muted)"}}>
            Owner:{" "}
            <a
              href={`${EXPLORER}/address/${owner}`}
              target="_blank"
              rel="noreferrer"
              style={{color: "var(--text)", fontFamily: "var(--mono)"}}
            >
              {shortAddr(owner)}
            </a>
          </div>
          <div
            style={{
              marginTop: 10,
              aspectRatio: "1 / 1",
              background: "var(--ink)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
            }}
          >
            {sel.uri ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveURI(sel.uri)}
                alt="pixel"
                style={{width: "100%", height: "100%", objectFit: "cover"}}
              />
            ) : (
              <span style={{color: "var(--muted)", fontSize: 12}}>No image yet</span>
            )}
          </div>
        </div>
      )}

      {/* state: mine */}
      {mine && (
        <div style={{marginTop: 12}}>
          <div style={{fontSize: 12, color: "var(--muted)"}}>
            This pixel is <b style={{color: "var(--text)"}}>yours</b>. Upload any image.
          </div>
          <div
            style={{
              marginTop: 10,
              aspectRatio: "1 / 1",
              background: "var(--ink)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
            }}
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="seçilen"
                style={{width: "100%", height: "100%", objectFit: "cover"}}
              />
            ) : sel.uri ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveURI(sel.uri)}
                alt="pixel"
                style={{width: "100%", height: "100%", objectFit: "cover"}}
              />
            ) : (
              <span style={{color: "var(--muted)", fontSize: 12}}>Pick an image →</span>
            )}
          </div>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{display: "none"}}
            id="file-picker"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <div style={{display: "flex", gap: 8, marginTop: 10}}>
            <button
              className="btn"
              style={{flex: 1}}
              onClick={() => document.getElementById("file-picker")?.click()}
              disabled={!!busy}
            >
              Pick image
            </button>
            <button
              className="btn primary"
              style={{flex: 1}}
              onClick={doUpload}
              disabled={!file || !!busy}
            >
              {busy === "upload"
                ? "Uploading…"
                : busy === "setImg"
                  ? "Writing on-chain…"
                  : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
