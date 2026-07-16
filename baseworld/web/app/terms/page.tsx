import type {Metadata} from "next";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of Service — Base Atlas",
};

export default function TermsPage() {
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        overflow: "auto",
        padding: "40px 24px",
        background: "var(--ink)",
        color: "var(--text)",
      }}
    >
      <div style={{maxWidth: 720, margin: "0 auto", lineHeight: 1.7}}>
        <p style={{fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)"}}>
          last updated · 2026-06-14
        </p>
        <h1 style={{fontSize: 26, marginTop: 8}}>Terms of Service</h1>

        <h2 style={{marginTop: 32}}>1. What you're using</h2>
        <p>
          Base Atlas consists of a smart contract (PixelAtlas) on Base and a web
          interface that interacts with it. Land pixels of the world map are
          minted as ERC-721 NFTs. The service is provided <b>as is</b>, without
          warranty.
        </p>

        <h2 style={{marginTop: 32}}>2. NFT ownership</h2>
        <p>
          By minting a pixel you become the <b>ERC-721 owner</b> of the
          corresponding token. You can transfer, sell, or burn the NFT. Setting
          the pixel image (<code>setPixelImage</code>) is solely the owner's
          right.
        </p>
        <p>
          Base Atlas is <b>not</b> real-estate ownership; it is a representation
          of the world map. No physical land rights are conveyed.
        </p>

        <h2 style={{marginTop: 32}}>3. Payments</h2>
        <ul>
          <li>Mint fee is currently <b>1 USDC</b>; the contract's <code>mintPrice()</code> value is the live ceiling.</li>
          <li>Fees flow to the <code>treasury</code> address. No refunds.</li>
          <li>Gas fees follow Base chain rules and are paid by the user.</li>
        </ul>

        <h2 style={{marginTop: 32}}>4. Images you upload</h2>
        <p>
          When you upload an image it is stored (IPFS or our hosted storage) and
          the URI is written on-chain via <code>setPixelImage</code>. Content
          cannot be deleted on-chain. For prohibited content see the{" "}
          <a href="/content-policy" style={{color: "var(--cyan)"}}>Content Policy</a>.
          A renderer-side blocklist may filter content, but on-chain data is
          permanent.
        </p>
        <p>
          You agree that you own the rights to the content you upload, it is not
          in any prohibited category, and you have all permissions needed to
          display it.
        </p>

        <h2 style={{marginTop: 32}}>5. Liability</h2>
        <p>
          The smart contract is not audited; bug risk exists. You are
          responsible for using your wallet; do not share your private key. We
          cannot access or restore your NFTs.
        </p>

        <h2 style={{marginTop: 32}}>6. Admin</h2>
        <p>
          The contract <code>owner</code> can update <code>mintPrice</code>,
          <code>treasury</code>, <code>usdc</code> token address, and{" "}
          <code>landRoot</code> parameters. New mint rules apply only to future
          mints; existing NFTs are unaffected.
        </p>

        <h2 style={{marginTop: 32}}>7. Jurisdiction</h2>
        <p>
          The jurisdiction in which the service is provided is undefined.
          Complying with your local laws is your responsibility. NFT operations
          do not constitute investment advice.
        </p>

        <p style={{marginTop: 40, fontSize: 12, color: "var(--muted)"}}>
          Back →{" "}
          <a href="/atlas" style={{color: "var(--cyan)"}}>
            Atlas
          </a>{" "}
          ·{" "}
          <a href="/content-policy" style={{color: "var(--cyan)"}}>
            Content Policy
          </a>
        </p>
      </div>
    </main>
  );
}
