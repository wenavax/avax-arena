# Frostbite — NFT Battle Arena on Avalanche

## What is Frostbite?

Frostbite is a GameFi PvP battle platform on the Avalanche blockchain.
Players mint warrior NFTs, battle other players by staking AVAX, and trade on the marketplace.
Winners take the opponent's stake (minus 2.5% platform fee).

**Website:** https://frostbite.pro
**Chain:** Avalanche C-Chain (Chain ID 43114)
**Currency:** AVAX

## How It Works

1. Connect your Avalanche wallet (MetaMask, Core, Rabby, etc.)
2. Mint warrior NFTs (0.01 AVAX each) with randomized stats and one of 8 elements
3. Stake AVAX in PvP battles against other players
4. Combat is resolved based on warrior stats (attack, defense, speed) and element advantages
5. Trade warriors on the marketplace, complete quests for XP, or merge warriors

## Element System

8 elements in two cycles with 1.5x damage advantage:

- **Cycle A:** Fire → Wind → Ice → Water → Fire
- **Cycle B:** Earth → Thunder → Shadow → Light → Earth

## Features

- **1v1 Battles** — Stake AVAX, winner takes all (minus 2.5% fee)
- **3v3 Team Battles** — Pick 3 warriors, best of 3 matchups
- **Marketplace** — List, auction, and make offers on warrior NFTs
- **Quests** — Send warriors on quests (8 zones, 4 difficulties) to earn XP
- **Warrior Merge** — Burn 2 warriors to create 1 stronger warrior
- **Batch Minting** — Mint multiple warriors in a single transaction
- **Leaderboard** — On-chain rankings by win rate
- **Tournaments** — Bracket-style competitive events

## Smart Contracts (Avalanche Mainnet)

| Contract | Address |
|----------|---------|
| ArenaWarrior (ERC-721) | `0x958d7b064224453BB5134279777e5d907B405dE2` |
| BattleEngine | `0x617fd0B23C35b4bA7fCf76c47F919ddd9a506f62` |
| TeamBattleEngine | `0x522d57c8b594Ddd56Ab8660E77fA9e0BA7548c27` |
| FrostbiteToken (FSB) | `0x96D9fB6BD38f1E0D9b1A9a9f63595F928B56214` |
| Marketplace | `0x716ECe04F80b3986D180c0d8Ff25424a6Ea69039` |
| QuestEngine | `0x2A471Cead6d71f26A811b0FACa21Bf58b93627dB` |
| Tournament | `0xABbde81f4B5D6A7968e0C216Abddefe4398E22Ab` |
| Leaderboard | `0x9E6108ea6d0a43c9622f581498E2bBfe53971a46` |
| RewardVault | `0xEa620F3772d66927979D90BC039936500fa1363A` |
| BatchMinter | `0xCA2329461C2C9360fda690850773E5321fa74eB9` |

## Battle Rules

- Minimum stake: 0.005 AVAX
- Platform fee: 2.5% on winnings
- Element advantage: 1.5x damage multiplier
- All results are final and recorded on-chain
