# Frostbite — On-Chain Battle Arena

A fully on-chain NFT battle arena built on Avalanche C-Chain. Mint warriors, battle for AVAX, fuse for power, trade on the marketplace.

**Live:** [frostbite.pro](https://frostbite.pro)

## How It Works

1. **Mint** a warrior NFT (0.01 AVAX) — each has random element, stats, and power score
2. **Battle** 1v1 or 3v3 — stake AVAX, winner takes all (minus 2.5% platform fee)
3. **Fuse** two warriors into a stronger one — combine power scores
4. **Trade** on the built-in marketplace — buy/sell warriors
5. **Quest** through zone-based campaigns — earn XP and tier up

## Elements & Advantages

```
🔥 Fire → 🌪️ Wind → ❄️ Ice → 💧 Water → 🔥 Fire
🌍 Earth → ⚡ Thunder → 🌑 Shadow → ✨ Light → 🌍 Earth
```

Element advantage = 1.25x damage multiplier in battle.

## Smart Contracts

All contracts are deployed and verified on Avalanche C-Chain (43114).

| Contract | Description |
|----------|-------------|
| `ArenaWarrior` | ERC-721 warrior NFT with on-chain stats, elements, power score |
| `BattleEngine` | 1v1 PvP battles with AVAX staking, pull-payment pattern |
| `TeamBattleEngine` | 3v3 team battles, same stake mechanics |
| `FrostbiteMarketplace` | NFT marketplace with listings and purchases |
| `QuestEngine` | Zone-based quests with tier progression and cooldowns |
| `Leaderboard` | On-chain ranking by wins, streaks, power |
| `RewardVault` | Reward distribution for tournaments and events |
| `GameEngine` | Core game logic and stat calculations |
| `BatchMinter` | Gas-efficient bulk minting |
| `FrostbiteSwapRouter` | DEX swap wrapper (TraderJoe V2.1) with 0.05% fee |
| `FrostbiteAccount` | ERC-6551 token-bound accounts for warrior NFTs |
| `FrostbiteIdentityRegistry` | Identity registry for TBA system |
| `Tournament` | Tournament brackets and prize pools |

## Tech Stack

- **Contracts:** Solidity 0.8.x, Hardhat, OpenZeppelin
- **Frontend:** Next.js 14, TypeScript, TailwindCSS, wagmi/viem, RainbowKit
- **Chain:** Avalanche C-Chain (mainnet)
- **Storage:** SQLite (better-sqlite3) for off-chain indexing

## Project Structure

```
contracts/          # Solidity smart contracts
frontend/           # Next.js web application
  app/              # Pages (battle, mint, merge, marketplace, quests, leaderboard)
  components/       # UI components
  lib/              # Contract ABIs, constants, DB queries
scripts/            # Deployment and configuration scripts
test/               # Contract tests
types/              # TypeScript contract type definitions
```

## Development

```bash
# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Deploy to Avalanche
npx hardhat run scripts/deploy-mainnet.ts --network avalanche

# Run frontend
cd frontend && npm run dev
```

## License

MIT

---

Built by **hts**
