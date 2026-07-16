import type {Metadata} from "next";

export const metadata: Metadata = {
  title: "Content Policy",
  description: "Content Policy — Base Atlas",
};

export default function ContentPolicyPage() {
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
        <h1 style={{fontSize: 26, marginTop: 8}}>Content Policy</h1>
        <p>
          Base Atlas is a world-wide visible map. Images you upload are visible
          to everyone. The categories below are strictly prohibited.
        </p>

        <h2 style={{marginTop: 32}}>Prohibited content</h2>
        <ul>
          <li><b>Child Sexual Abuse Material (CSAM)</b>. Reported immediately; permanent block.</li>
          <li>Content promoting violence, glorifying terror or mass murder.</li>
          <li>Sexually explicit content (especially non-consensual).</li>
          <li>Doxxing / personal data exposure.</li>
          <li>Copyrighted images without the rights-holder's permission.</li>
          <li>Misleading financial claims / scams / phishing links.</li>
          <li>Hate speech (targeting race, religion, gender, orientation, ethnicity).</li>
          <li>Malware / files containing malicious code.</li>
        </ul>

        <h2 style={{marginTop: 32}}>Enforcement</h2>
        <p>
          On-chain data cannot be deleted; however the frontend renderer reads an
          off-chain blocklist. If prohibited content is detected, the tokenId /
          image hash is added to <code>blocklist.json</code> and the image is
          replaced by an empty cell. NFT ownership doesn't change, but the
          image is blocked.
        </p>

        <h2 style={{marginTop: 32}}>Reporting</h2>
        <p>
          When you see prohibited content, email{" "}
          <code style={{color: "var(--cyan)"}}>report@base-atlas.example</code>{" "}
          with tokenId, the pixel coordinates (X/Y), and the reason. (Real
          address will be set before launch.) After review, the blocklist is
          updated within 24 hours.
        </p>

        <h2 style={{marginTop: 32}}>Technical details</h2>
        <ul>
          <li>Max file size: 2 MB.</li>
          <li>Types: PNG, JPEG, WebP, GIF.</li>
          <li>Storage: IPFS via Pinata (replicated across nodes) or hosted disk (CDN-served).</li>
          <li>
            Planned: pre-pin moderation (OpenAI Moderation API). After integration,
            uploads will be auto-filtered before storage.
          </li>
        </ul>

        <p style={{marginTop: 40, fontSize: 12, color: "var(--muted)"}}>
          Back →{" "}
          <a href="/atlas" style={{color: "var(--cyan)"}}>
            Atlas
          </a>{" "}
          ·{" "}
          <a href="/terms" style={{color: "var(--cyan)"}}>
            Terms
          </a>
        </p>
      </div>
    </main>
  );
}
