# Frostbite Launchpad (contracts)

Paid-permissionless pump.fun-style token launchpad on Avalanche. A factory clones
isolated AVAX bonding-curve pools + non-ruggable ERC20 tokens that graduate to
Trader Joe V1 with burned LP.

- Design spec: `../docs/superpowers/specs/2026-07-03-launchpad-design.md`
- Implementation plan: `../docs/superpowers/plans/2026-07-03-launchpad-contracts.md`

## Bootstrap

Dependencies (`lib/`) are gitignored; install them with Foundry:

```bash
forge install --no-git foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts OpenZeppelin/openzeppelin-contracts-upgradeable
forge build
forge test
```

Fork/deploy tasks need `FUJI_RPC_URL` (and a confirmed Trader Joe V1 router address).
