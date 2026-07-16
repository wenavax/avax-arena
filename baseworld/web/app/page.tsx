import Link from "next/link";
import {CHAIN_ID, CHAIN_NAME, CONTRACT_ADDRESS, IS_DEMO} from "@/lib/config";

export default function Home() {
  const deployed = CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";
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
      <div style={{maxWidth: 640, width: "100%"}}>
        <div style={{display: "flex", alignItems: "center", gap: 12, marginBottom: 24}}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background:
                "conic-gradient(from 45deg,#f4a259,#6fd6e8,#9b8cff,#f4a259)",
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,.4)",
            }}
          />
          <h1 style={{margin: 0, fontSize: 22, letterSpacing: "-0.01em"}}>
            Base Atlas <span style={{color: "var(--muted)", fontWeight: 400}}>· {CHAIN_NAME}</span>
          </h1>
        </div>

        <p style={{color: "var(--muted)", lineHeight: 1.6, marginBottom: 32}}>
          A 640×320 grid over the world map. Every land pixel (~61,000 of them) is an
          ERC-721 NFT on Base. Mint for 1 USDC. The owner sets the pixel image.
        </p>

        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 16,
            background: "var(--panel)",
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: "var(--muted)",
            marginBottom: 24,
          }}
        >
          <Row k="chainId" v={CHAIN_ID} />
          <Row k="contract" v={deployed ? CONTRACT_ADDRESS : "— not deployed —"} />
          <Row k="demo" v={IS_DEMO ? "true (no on-chain writes)" : "false"} />
        </div>

        <Link
          href="/atlas"
          style={{
            display: "inline-block",
            padding: "12px 18px",
            background: "var(--cyan)",
            color: "#06222b",
            borderRadius: 10,
            textDecoration: "none",
            fontFamily: "var(--mono)",
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          Open the map →
        </Link>

        <div
          style={{
            marginTop: 24,
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--muted)",
          }}
        >
          <Link href="/terms" style={{color: "var(--muted)", marginRight: 14}}>
            Terms
          </Link>
          <Link href="/content-policy" style={{color: "var(--muted)"}}>
            Content Policy
          </Link>
        </div>
      </div>
    </main>
  );
}

function Row({k, v}: {k: string; v: string | number}) {
  return (
    <div style={{display: "flex", justifyContent: "space-between", padding: "4px 0"}}>
      <span>{k}</span>
      <b style={{color: "var(--text)"}}>{v}</b>
    </div>
  );
}
