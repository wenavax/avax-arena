# Frostbite Adventures — contracts

Idle NFT staking (Hoppers-style) for FrostbiteHeroes. Phase-1 contract:
custodial stake → off-chain accrual by an authorized resolver → bounded on-chain
settlement (zone rate × elapsed, emission cap, pre-funded pool) → pull-payment
FSB payouts → FSB burn (0x…dEaD) to level up and reset the emission cap.

Design: `../docs/superpowers/specs/2026-07-05-frostbite-adventures-design.md` §5
Plan:   `../docs/superpowers/plans/2026-07-07-adventures-p1.md`
Settlement blueprint: `../docs/EXPEDITIONS_PHASE1.md`

## Bootstrap

`lib/` is gitignored. Fresh checkout:

```bash
forge install --no-git foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts
forge build
forge test
```

Fork tests (read the real FrostbiteHeroes on mainnet) need
`AVALANCHE_RPC_URL=https://api.avax.network/ext/bc/C/rpc`.

## Deploy

```bash
# Fuji (deploys MockFSB + MockFrostbiteHeroes too, deployer stays owner)
forge script script/Deploy.s.sol --rpc-url $FUJI_RPC_URL --broadcast --private-key $DEPLOYER_PK

# Mainnet (real FSB/Heroes, ownership → Gnosis Safe) — Phase-2 gate, do not run
# before the economy model + pool funding decisions are approved.
```
