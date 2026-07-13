import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | Frostbite',
  description: 'Frostbite terms of service — rules and conditions for using the platform.',
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="font-display text-3xl font-bold text-white mb-2">Terms of Service</h1>
      <p className="text-sm text-white/40 mb-10">Last updated: April 2, 2026</p>

      <div className="space-y-8 text-white/70 text-sm leading-relaxed">
        <Section title="1. Acceptance of Terms">
          <p>
            By accessing or using Frostbite (&quot;the Service&quot;), operated at frostbite.pro,
            you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree
            to these Terms, you must not use the Service.
          </p>
          <p>
            These Terms constitute a legally binding agreement between you and Frostbite regarding
            your use of the NFT Battle Arena platform on the Avalanche blockchain.
          </p>
        </Section>

        <Section title="2. Description of Service">
          <p>
            Frostbite is a decentralized GameFi platform where users can:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Mint warrior NFTs with randomized combat attributes and elements</li>
            <li>Stake AVAX in 1v1 and 3v3 PvP battles</li>
            <li>Fuse warriors to create more powerful fighters</li>
            <li>Trade warrior NFTs on the built-in marketplace</li>
            <li>Complete zone-based quests for XP and tier progression</li>
            <li>Compete on global leaderboards</li>
            <li>Swap tokens via integrated DEX</li>
          </ul>
          <p className="mt-2">
            The Service operates on the Avalanche C-Chain (Mainnet). All AVAX referenced on this
            platform is real AVAX with real monetary value. Use the platform at your own risk.
          </p>
        </Section>

        <Section title="3. Eligibility">
          <ul className="list-disc pl-5 space-y-1">
            <li>You must be at least 18 years old to use the Service</li>
            <li>You must have the legal capacity to enter into a binding agreement</li>
            <li>You must not be located in a jurisdiction where use of blockchain-based
              services is prohibited</li>
            <li>You are responsible for compliance with all applicable local laws</li>
          </ul>
        </Section>

        <Section title="4. Wallet Connection">
          <p>
            You connect to Frostbite using your own Web3 wallet (MetaMask, Core, WalletConnect, etc.).
            Your wallet address serves as your identity on the platform.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>You are solely responsible for the security of your wallet and private keys</li>
            <li>We never have access to your private keys or seed phrases</li>
            <li>All transactions require your explicit approval in your wallet</li>
            <li>Lost wallet access cannot be recovered by us</li>
          </ul>
        </Section>

        <Section title="5. NFTs and Digital Assets">
          <h4 className="text-white/90 font-semibold mt-3 mb-1">5.1 Warrior NFTs</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li>Warrior NFTs are minted on the Avalanche C-Chain as ERC-721 tokens</li>
            <li>Each warrior has randomly generated stats (attack, defense, speed) and an element</li>
            <li>Warrior attributes are determined at mint time and cannot be modified (except via fusion)</li>
            <li>We do not guarantee any specific stat distribution or rarity</li>
          </ul>

          <h4 className="text-white/90 font-semibold mt-3 mb-1">5.2 Ownership</h4>
          <p>
            You own the NFTs in your wallet. Ownership is recorded on the Avalanche blockchain.
            We do not custody your NFTs.
          </p>

          <h4 className="text-white/90 font-semibold mt-3 mb-1">5.3 No Guarantees of Value</h4>
          <p>
            NFTs and any associated tokens have no guaranteed value. Do not treat interactions on
            this platform as financial investments. All transactions are final and irreversible.
          </p>
        </Section>

        <Section title="6. Battles and Staking">
          <ul className="list-disc pl-5 space-y-1">
            <li>Battles require staking AVAX. Staked amounts are held by the smart contract
              until battle resolution.</li>
            <li>Battle outcomes are determined by warrior stats, element advantages, and
              on-chain logic</li>
            <li>Winners receive the combined stake minus a 2.5% platform fee</li>
            <li>Losers forfeit their staked amount</li>
            <li>All battle results are final and recorded on-chain</li>
            <li>We are not responsible for losses incurred through battles</li>
            <li>Winnings use a pull-payment pattern — you must withdraw your payouts</li>
          </ul>
        </Section>

        <Section title="7. Marketplace">
          <ul className="list-disc pl-5 space-y-1">
            <li>You may list warrior NFTs for sale at any price</li>
            <li>Purchases are executed on-chain and are irreversible</li>
            <li>A platform fee applies to marketplace sales</li>
            <li>We do not guarantee the sale of listed items</li>
          </ul>
        </Section>

        <Section title="8. Quests">
          <ul className="list-disc pl-5 space-y-1">
            <li>Quests have cooldown timers and tier requirements</li>
            <li>Quest rewards (XP, tier progression) are tracked off-chain</li>
            <li>We reserve the right to modify quest parameters and rewards</li>
          </ul>
        </Section>

        <Section title="9. Prohibited Conduct">
          <p>You agree NOT to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Exploit bugs, vulnerabilities, or smart contract flaws</li>
            <li>Use bots or scripts to circumvent rate limits or gain unfair advantage</li>
            <li>Engage in wash trading or battle manipulation</li>
            <li>Attempt to access other users&apos; wallets</li>
            <li>Reverse-engineer, decompile, or attack the Service infrastructure</li>
            <li>Use the Service for money laundering or any illegal activity</li>
          </ul>
          <p className="mt-2">
            Violation of these rules may result in platform restrictions without notice.
          </p>
        </Section>

        <Section title="10. Smart Contracts">
          <p>
            The Service relies on smart contracts deployed on the Avalanche blockchain.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Smart contracts are immutable once deployed and operate autonomously</li>
            <li>We are not responsible for bugs in deployed smart contracts</li>
            <li>Blockchain transactions are irreversible</li>
            <li>Gas fees are your responsibility</li>
            <li>Network congestion or outages may affect Service availability</li>
          </ul>
        </Section>

        <Section title="11. Intellectual Property &amp; Music">
          <p>
            All content on the Frostbite platform, including artwork, music, sound effects,
            warrior designs, logos, and user interface elements, are the exclusive intellectual
            property of Frostbite and its creators.
          </p>
          <p className="mt-3">
            All original music tracks are owned by and copyrighted to Frostbite. Unauthorized
            reproduction, distribution, or commercial use is strictly prohibited.
          </p>
        </Section>

        <Section title="12. Disclaimers">
          <p className="uppercase font-semibold text-white/50">
            The Service is provided &quot;as is&quot; and &quot;as available&quot; without
            warranties of any kind, either express or implied.
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>We do not warrant uninterrupted or error-free operation</li>
            <li>We do not guarantee the security of smart contracts</li>
            <li>We do not guarantee any returns or profits from battles</li>
            <li>We are not responsible for losses due to blockchain network issues, wallet
              compromises, or smart contract vulnerabilities</li>
          </ul>
        </Section>

        <Section title="13. Limitation of Liability">
          <p>
            To the maximum extent permitted by law, Frostbite and its operators shall not be
            liable for any indirect, incidental, special, consequential, or punitive damages,
            including loss of funds, data, or digital assets, arising from your use of the Service.
          </p>
        </Section>

        <Section title="14. Modifications">
          <p>
            We reserve the right to modify these Terms at any time. Changes will be posted on
            this page with an updated date. We may also modify, suspend, or discontinue the
            Service at any time without liability.
          </p>
        </Section>

        <Section title="15. Contact">
          <p>
            For questions about these Terms, reach us at{' '}
            <a
              href="https://x.com/frostbiteprol1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-frost-cyan hover:underline"
            >
              x.com/frostbiteprol1
            </a>.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-lg font-semibold text-white/90 mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
