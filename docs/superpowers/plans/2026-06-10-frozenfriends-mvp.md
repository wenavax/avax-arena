# FrozenFriends MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2 hafta içinde FrozenFriends Ultra-MVP'yi Base mainnet'te `frostbite.pro/base` üzerinde canlıya almak — sosyal AI pet game.

**Architecture:** Next.js 15 frontend (PWA, Privy + Coinbase Smart Wallet) + Express backend + Node.js cron worker (Claude Haiku) + Postgres + ERC-721 contracts. Eski `base-frontend` silinir, yeni `frozenfriends/` dizinleri kullanılır. VPS 5.189.173.167 üzerinde PM2 ile deploy.

**Tech Stack:**
- Frontend: Next.js 15 + React 19 + Tailwind 4 + Framer Motion + Wagmi v2 + Viem + Privy v3 + @coinbase/wallet-sdk
- Backend: Node.js 20 + Express + TypeScript + node-cron + @anthropic-ai/sdk
- Contracts: Foundry + Solidity 0.8.24 + OpenZeppelin
- DB: PostgreSQL 16 + Redis 7
- Storage: IPFS (Pinata) + Postgres-backed SVG cache
- Deploy: VPS, PM2 (frozenfriends-frontend / -api / -worker), Nginx

**Spec reference:** `docs/superpowers/specs/2026-06-10-frozenfriends-design.md`

**Repo layout:**
- Lokal: `/Users/hts_bot/avax-arena/frozenfriends/`
- VPS: `/opt/frostbite/frozenfriends/`

---

## File Structure (Map)

```
frozenfriends/
├── contracts/
│   ├── src/
│   │   ├── FrozenFriends.sol         # ERC-721, 1/wallet, 0.0005 ETH mint
│   │   └── Paymaster.sol             # ERC-4337 gas sponsor
│   ├── test/
│   │   ├── FrozenFriends.t.sol
│   │   └── Paymaster.t.sol
│   ├── script/
│   │   ├── Deploy.s.sol
│   │   └── DeployPaymaster.s.sol
│   └── foundry.toml
├── frontend/
│   ├── app/
│   │   ├── layout.tsx                # Root layout + Providers
│   │   ├── page.tsx                  # Landing
│   │   ├── mint/page.tsx             # Mint flow
│   │   ├── pet/[id]/page.tsx         # Pet view
│   │   └── api/
│   │       └── og/[id]/route.ts      # Dynamic OG image
│   ├── components/
│   │   ├── Providers.tsx             # Privy + Wagmi + QueryClient
│   │   ├── ConnectButton.tsx
│   │   ├── PetCard.tsx
│   │   ├── PetSvg.tsx                # SVG renderer
│   │   ├── DiaryFeed.tsx
│   │   ├── MintFlow.tsx
│   │   └── ShareButton.tsx
│   ├── lib/
│   │   ├── contracts.ts              # ABI + addresses
│   │   ├── wagmi.ts                  # Wagmi config
│   │   ├── api.ts                    # Backend API client
│   │   └── pet-visual.ts             # Visual encoding helpers
│   ├── public/
│   │   └── manifest.json             # PWA
│   ├── next.config.mjs               # basePath /base
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── api/server.ts             # Express API
│   │   ├── worker/
│   │   │   ├── tick.ts               # Daily cron
│   │   │   ├── matching.ts           # Pet-pair selection
│   │   │   └── ai.ts                 # Claude Haiku calls
│   │   ├── lib/
│   │   │   ├── db.ts                 # Postgres pool
│   │   │   ├── prompts.ts            # AI prompt templates
│   │   │   ├── points.ts             # Frost Points helpers
│   │   │   └── viem.ts               # On-chain reader
│   │   └── types.ts
│   ├── migrations/
│   │   ├── 001_pets.sql
│   │   ├── 002_diary.sql
│   │   └── 003_frost_points.sql
│   ├── tsconfig.json
│   └── package.json
└── README.md
```

---

## Dependency Graph

```
Phase 1 (Setup)
    └─> Phase 2 (Contracts)
            └─> Phase 3 (Frontend Mint)
                    └─> Phase 5 (Diary view)
                              └─> Phase 7 (Deploy)
    └─> Phase 4 (Backend API)
            └─> Phase 6 (AI Worker) ──> Phase 7
    └─> Phase 5 needs Phase 3+4
```

**Critical path:** Setup → Contracts → Mint UI → Pet view → Backend API → AI Worker → Diary view → Deploy.

**Parallelizable:** Contracts can be developed in parallel with frontend scaffold. Backend API can start once schemas are decided.

---

## Phase 1 — Setup (Day 1)

### Task 1: Verify backups exist and confirm cleanup intent

**Files:**
- Read: `~/Desktop/frostbite-base-archive-20260610-1356/`

- [ ] **Step 1: Verify backup files exist on disk**

```bash
ls -lh ~/Desktop/frostbite-base-archive-20260610-1356/
```

Expected output (4 files, ~13 MB total):
```
frostbite-base-backup-20260610-1356.tar.gz   6.4M
frontend-base-local-20260610-1356.tar.gz     6.4M
nginx-frostbite-mainnet-backup-20260610-1356.conf  4.8K
base-env-backup-20260610-1356.txt            225B
```

- [ ] **Step 2: Verify VPS backup exists**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 'ls -lh /opt/*-backup-20260610*'
```

Expected: 3 files with timestamps from 20260610-1356.

- [ ] **Step 3: Confirm no rollback path needed**

If both backup sources exist, proceed. Otherwise STOP and re-create backups (see spec Migration section).

### Task 2: Delete old base-frontend (VPS)

**Files:**
- Delete: `/opt/frostbite/base-frontend/` (VPS, 3.4 GB)
- Modify: `/etc/nginx/sites-enabled/frostbite-mainnet` (remove 2 lines)
- Stop: PM2 `frostbite-base`

- [ ] **Step 1: Stop PM2 base process**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 'pm2 stop frostbite-base && pm2 delete frostbite-base'
```

Expected: `[PM2] [frostbite-base](10) ✓`

- [ ] **Step 2: Comment out nginx base config (safer than delete)**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 "sed -i.bak 's|^upstream base_upstream|# DISABLED 20260610 upstream base_upstream|; s|^    location /base|    # DISABLED 20260610 location /base|' /etc/nginx/sites-enabled/frostbite-mainnet"
```

- [ ] **Step 3: Test nginx config + reload**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 'nginx -t && nginx -s reload'
```

Expected: `syntax is ok` + `test is successful`

- [ ] **Step 4: Remove VPS directory**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 'rm -rf /opt/frostbite/base-frontend/'
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 'ls /opt/frostbite/ | grep -c base'
```

Expected: `0`

- [ ] **Step 5: Confirm `/base` route now returns 502 or 404**

```bash
curl -sI -m 5 https://frostbite.pro/base | head -3
```

Expected: `HTTP/2 404` (sayfa yok, ama nginx hala yaşıyor).

### Task 3: Delete old base-frontend (Local)

**Files:**
- Delete: `/Users/hts_bot/avax-arena/frontend-base/` (3.1 GB)

- [ ] **Step 1: Verify lokal backup**

```bash
ls -lh ~/Desktop/frostbite-base-archive-20260610-1356/frontend-base-local-*.tar.gz
```

Expected: file exists, ~6.4 MB.

- [ ] **Step 2: Delete directory**

```bash
rm -rf /Users/hts_bot/avax-arena/frontend-base/
ls /Users/hts_bot/avax-arena/ | grep -c frontend-base
```

Expected: `0`

- [ ] **Step 3: Commit deletion (.gitignore zaten ignore ediyor ama yine de log için)**

```bash
cd /Users/hts_bot/avax-arena
git add -A
git status --short | head -10
git commit -m "chore: remove old frontend-base (replaced by frozenfriends)"
```

### Task 4: Create new project structure

**Files:**
- Create: `/Users/hts_bot/avax-arena/frozenfriends/{contracts,frontend,backend}/`

- [ ] **Step 1: Create directory tree**

```bash
cd /Users/hts_bot/avax-arena
mkdir -p frozenfriends/contracts/{src,test,script}
mkdir -p frozenfriends/frontend/{app,components,lib,public}
mkdir -p frozenfriends/backend/{src/{api,worker,lib},migrations}
ls frozenfriends/
```

Expected: `backend  contracts  frontend`

- [ ] **Step 2: Add frozenfriends to .gitignore for node_modules & .next**

```bash
cat >> /Users/hts_bot/avax-arena/.gitignore <<'EOF'

# FrozenFriends build artifacts
frozenfriends/frontend/node_modules/
frozenfriends/frontend/.next/
frozenfriends/backend/node_modules/
frozenfriends/backend/dist/
frozenfriends/contracts/out/
frozenfriends/contracts/cache/
frozenfriends/contracts/lib/
EOF
tail -10 /Users/hts_bot/avax-arena/.gitignore
```

- [ ] **Step 3: Create README**

```bash
cat > /Users/hts_bot/avax-arena/frozenfriends/README.md <<'EOF'
# FrozenFriends

Social AI pet game on Base. See `docs/superpowers/specs/2026-06-10-frozenfriends-design.md`.

## Structure
- `contracts/` — Foundry (Solidity)
- `frontend/` — Next.js 15
- `backend/` — Express + cron worker

## Live
`https://frostbite.pro/base`
EOF
```

- [ ] **Step 4: Commit scaffold**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/README.md .gitignore
git commit -m "feat: scaffold frozenfriends project structure"
```

### Task 5: Initialize Foundry for contracts

**Files:**
- Create: `frozenfriends/contracts/foundry.toml`
- Create: `frozenfriends/contracts/lib/` (forge install)

- [ ] **Step 1: Initialize Foundry**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/contracts
forge init --no-git --force .
rm -f src/Counter.sol test/Counter.t.sol script/Counter.s.sol README.md
```

- [ ] **Step 2: Install OpenZeppelin**

```bash
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-commit
```

- [ ] **Step 3: Write foundry.toml**

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.24"
optimizer = true
optimizer_runs = 200
remappings = [
  "@openzeppelin/=lib/openzeppelin-contracts/",
]

[rpc_endpoints]
base = "https://mainnet.base.org"
base_sepolia = "https://sepolia.base.org"

[etherscan]
base = { key = "${BASESCAN_API_KEY}" }
base_sepolia = { key = "${BASESCAN_API_KEY}" }
```

- [ ] **Step 4: Verify Foundry setup**

```bash
forge build
```

Expected: `Compiling 0 files` or no error.

- [ ] **Step 5: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/contracts/foundry.toml frozenfriends/contracts/lib
git commit -m "feat: initialize foundry with openzeppelin v5"
```

---

## Phase 2 — Contracts (Day 2-3)

### Task 6: Write FrozenFriends ERC-721 contract

**Files:**
- Create: `frozenfriends/contracts/src/FrozenFriends.sol`

- [ ] **Step 1: Write the contract**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FrozenFriends is ERC721, Ownable {
    uint256 public constant MINT_PRICE = 0.0005 ether;
    uint256 public nextTokenId = 1;
    string private _baseTokenURI;

    mapping(address => bool) public hasMinted;
    mapping(uint256 => uint256) public seedOf;

    event Minted(address indexed owner, uint256 indexed tokenId, uint256 seed);

    error AlreadyMinted();
    error InsufficientPayment();
    error WithdrawFailed();

    constructor(string memory baseURI_) ERC721("FrozenFriends", "FROZE") Ownable(msg.sender) {
        _baseTokenURI = baseURI_;
    }

    function mint() external payable returns (uint256 tokenId) {
        if (hasMinted[msg.sender]) revert AlreadyMinted();
        if (msg.value < MINT_PRICE) revert InsufficientPayment();

        hasMinted[msg.sender] = true;
        tokenId = nextTokenId++;
        uint256 seed = uint256(keccak256(abi.encodePacked(block.prevrandao, msg.sender, tokenId)));
        seedOf[tokenId] = seed;

        _safeMint(msg.sender, tokenId);
        emit Minted(msg.sender, tokenId, seed);
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
    }

    function withdraw(address payable to) external onlyOwner {
        (bool ok, ) = to.call{value: address(this).balance}("");
        if (!ok) revert WithdrawFailed();
    }
}
```

- [ ] **Step 2: Verify compile**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/contracts
forge build
```

Expected: `Compiler run successful`

- [ ] **Step 3: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/contracts/src/FrozenFriends.sol
git commit -m "feat(contracts): FrozenFriends ERC-721 with 1/wallet mint limit"
```

### Task 7: Write FrozenFriends contract tests (TDD coverage)

**Files:**
- Create: `frozenfriends/contracts/test/FrozenFriends.t.sol`

- [ ] **Step 1: Write the test file**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../src/FrozenFriends.sol";

contract FrozenFriendsTest is Test {
    FrozenFriends ff;
    address owner = address(0xA11CE);
    address alice = address(0xA1);
    address bob = address(0xB0B);

    function setUp() public {
        vm.prank(owner);
        ff = new FrozenFriends("ipfs://baseuri/");
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);
    }

    function test_MintSuccess() public {
        vm.prank(alice);
        uint256 id = ff.mint{value: 0.0005 ether}();
        assertEq(id, 1);
        assertEq(ff.ownerOf(1), alice);
        assertTrue(ff.hasMinted(alice));
    }

    function test_RevertOnDoubleMint() public {
        vm.prank(alice);
        ff.mint{value: 0.0005 ether}();
        vm.prank(alice);
        vm.expectRevert(FrozenFriends.AlreadyMinted.selector);
        ff.mint{value: 0.0005 ether}();
    }

    function test_RevertOnInsufficientPayment() public {
        vm.prank(alice);
        vm.expectRevert(FrozenFriends.InsufficientPayment.selector);
        ff.mint{value: 0.0001 ether}();
    }

    function test_SeedIsDeterministicallyDifferent() public {
        vm.prank(alice);
        ff.mint{value: 0.0005 ether}();
        vm.prank(bob);
        ff.mint{value: 0.0005 ether}();
        assertTrue(ff.seedOf(1) != ff.seedOf(2));
    }

    function test_OnlyOwnerCanWithdraw() public {
        vm.prank(alice);
        ff.mint{value: 0.0005 ether}();
        vm.prank(alice);
        vm.expectRevert();
        ff.withdraw(payable(alice));
    }

    function test_OwnerWithdrawsBalance() public {
        vm.prank(alice);
        ff.mint{value: 0.0005 ether}();
        uint256 ownerBalanceBefore = owner.balance;
        vm.prank(owner);
        ff.withdraw(payable(owner));
        assertEq(owner.balance, ownerBalanceBefore + 0.0005 ether);
    }

    function test_TokenURIUsesBaseURI() public {
        vm.prank(alice);
        ff.mint{value: 0.0005 ether}();
        assertEq(ff.tokenURI(1), "ipfs://baseuri/1");
    }
}
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/contracts
forge test -vv
```

Expected: 7 passing tests.

- [ ] **Step 3: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/contracts/test/FrozenFriends.t.sol
git commit -m "test(contracts): FrozenFriends mint + withdraw coverage"
```

### Task 8: Write Paymaster contract

**Files:**
- Create: `frozenfriends/contracts/src/Paymaster.sol`

- [ ] **Step 1: Write minimal sponsor paymaster (per-wallet tx counter)**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Minimal sponsor contract — tracks per-user sponsored tx count.
/// @dev Full ERC-4337 paymaster integration is out of scope for v1.
///      Coinbase Smart Wallet'in built-in paymaster'ı + bu kontrat'ın
///      sponsorshipFor(user) read'i ile front-end karar verir.
contract Paymaster is Ownable {
    uint256 public constant FREE_TX_LIMIT = 20;
    mapping(address => uint256) public sponsoredTxCount;
    bool public sponsorshipActive = true;

    event TxSponsored(address indexed user, uint256 newCount);
    event SponsorshipToggled(bool active);

    constructor() Ownable(msg.sender) {}

    function recordSponsoredTx(address user) external onlyOwner {
        sponsoredTxCount[user]++;
        emit TxSponsored(user, sponsoredTxCount[user]);
    }

    function canSponsor(address user) external view returns (bool) {
        return sponsorshipActive && sponsoredTxCount[user] < FREE_TX_LIMIT;
    }

    function toggleSponsorship() external onlyOwner {
        sponsorshipActive = !sponsorshipActive;
        emit SponsorshipToggled(sponsorshipActive);
    }

    function withdraw(address payable to) external onlyOwner {
        (bool ok, ) = to.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }

    receive() external payable {}
}
```

- [ ] **Step 2: Verify compile**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/contracts
forge build
```

- [ ] **Step 3: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/contracts/src/Paymaster.sol
git commit -m "feat(contracts): minimal Paymaster tracker for sponsored tx count"
```

### Task 9: Write Paymaster tests

**Files:**
- Create: `frozenfriends/contracts/test/Paymaster.t.sol`

- [ ] **Step 1: Write tests**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../src/Paymaster.sol";

contract PaymasterTest is Test {
    Paymaster pm;
    address owner = address(0xA11CE);
    address alice = address(0xA1);

    function setUp() public {
        vm.prank(owner);
        pm = new Paymaster();
    }

    function test_InitiallyCanSponsor() public {
        assertTrue(pm.canSponsor(alice));
    }

    function test_OwnerCanRecord() public {
        vm.prank(owner);
        pm.recordSponsoredTx(alice);
        assertEq(pm.sponsoredTxCount(alice), 1);
    }

    function test_NonOwnerCannotRecord() public {
        vm.prank(alice);
        vm.expectRevert();
        pm.recordSponsoredTx(alice);
    }

    function test_CannotSponsorAfterLimit() public {
        for (uint256 i = 0; i < 20; i++) {
            vm.prank(owner);
            pm.recordSponsoredTx(alice);
        }
        assertFalse(pm.canSponsor(alice));
    }

    function test_ToggleSponsorshipOff() public {
        vm.prank(owner);
        pm.toggleSponsorship();
        assertFalse(pm.canSponsor(alice));
    }
}
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/contracts
forge test -vv
```

Expected: 5 passing tests.

- [ ] **Step 3: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/contracts/test/Paymaster.t.sol
git commit -m "test(contracts): Paymaster coverage"
```

### Task 10: Deploy scripts

**Files:**
- Create: `frozenfriends/contracts/script/Deploy.s.sol`

- [ ] **Step 1: Write deploy script**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Script.sol";
import "../src/FrozenFriends.sol";
import "../src/Paymaster.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        string memory baseURI = vm.envString("BASE_TOKEN_URI");

        vm.startBroadcast(pk);
        FrozenFriends ff = new FrozenFriends(baseURI);
        Paymaster pm = new Paymaster();
        vm.stopBroadcast();

        console2.log("FrozenFriends:", address(ff));
        console2.log("Paymaster:    ", address(pm));
    }
}
```

- [ ] **Step 2: Create .env.example**

```bash
cat > /Users/hts_bot/avax-arena/frozenfriends/contracts/.env.example <<'EOF'
DEPLOYER_KEY=0x<private-key-here>
BASESCAN_API_KEY=<key-from-basescan>
BASE_TOKEN_URI=https://api.frostbite.pro/base/v1/metadata/
EOF
```

- [ ] **Step 3: Add .env to gitignore**

```bash
echo "frozenfriends/contracts/.env" >> /Users/hts_bot/avax-arena/.gitignore
```

- [ ] **Step 4: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/contracts/script/Deploy.s.sol frozenfriends/contracts/.env.example .gitignore
git commit -m "feat(contracts): deploy script for FrozenFriends + Paymaster"
```

### Task 11: Deploy contracts to Base Sepolia (testnet first)

**Files:**
- Modify: `frozenfriends/contracts/.env` (local, gitignored)

- [ ] **Step 1: Create local .env with testnet deployer key**

```bash
cp /Users/hts_bot/avax-arena/frozenfriends/contracts/.env.example /Users/hts_bot/avax-arena/frozenfriends/contracts/.env
# Manually edit .env with TESTNET deployer key
```

User action required: edit `.env` with a Base Sepolia testnet wallet that has 0.05+ ETH (faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet).

- [ ] **Step 2: Deploy to Sepolia**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/contracts
source .env
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
```

Expected output: 2 contract addresses logged.

- [ ] **Step 3: Save addresses**

```bash
cat > /Users/hts_bot/avax-arena/frozenfriends/contracts/addresses-sepolia.json <<EOF
{
  "FrozenFriends": "0x...REPLACE_WITH_LOGGED_ADDRESS...",
  "Paymaster": "0x...REPLACE_WITH_LOGGED_ADDRESS..."
}
EOF
```

User action: replace with actual deployed addresses.

- [ ] **Step 4: Test mint via cast**

```bash
cast send <FrozenFriendsAddr> "mint()" --value 0.0005ether --rpc-url base_sepolia --private-key $DEPLOYER_KEY
cast call <FrozenFriendsAddr> "ownerOf(uint256)" 1 --rpc-url base_sepolia
```

Expected: ownerOf returns deployer address.

- [ ] **Step 5: Commit address file (testnet only — don't commit env)**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/contracts/addresses-sepolia.json
git commit -m "feat(contracts): deploy to base sepolia"
```

### Task 12: Deploy contracts to Base Mainnet (after frontend smoke test)

> **NOTE:** Defer this task until Day 13 (after frontend works against Sepolia). Listed here for completeness; execution moves to Phase 7.

- [ ] **Step 1: Verify mainnet deployer has ~0.02 ETH**

```bash
cast balance <MAINNET_DEPLOYER> --rpc-url base
```

- [ ] **Step 2: Deploy to mainnet**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/contracts
forge script script/Deploy.s.sol --rpc-url base --broadcast --verify
```

- [ ] **Step 3: Save mainnet addresses**

```bash
cat > /Users/hts_bot/avax-arena/frozenfriends/contracts/addresses-mainnet.json <<EOF
{
  "FrozenFriends": "0x...",
  "Paymaster": "0x...",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
```

- [ ] **Step 4: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/contracts/addresses-mainnet.json
git commit -m "feat(contracts): deploy to base mainnet"
```

---

## Phase 3 — Frontend Scaffold + Mint (Day 4-6)

### Task 13: Initialize Next.js 15 frontend

**Files:**
- Create: `frozenfriends/frontend/package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`

- [ ] **Step 1: Initialize package.json**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/frontend
cat > package.json <<'EOF'
{
  "name": "frozenfriends-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3002",
    "build": "next build",
    "start": "next start -p 3002",
    "lint": "next lint"
  }
}
EOF
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/frontend
npm install next@15.3.2 react@19.1.0 react-dom@19.1.0
npm install -D typescript@5 @types/node @types/react @types/react-dom
npm install tailwindcss@4.1.4 @tailwindcss/postcss postcss
npm install framer-motion@12 lucide-react
npm install wagmi@2 viem@2 @tanstack/react-query@5
npm install @privy-io/react-auth@3 @privy-io/wagmi@4
```

- [ ] **Step 3: Write next.config.mjs**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/base',
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};

export default nextConfig;
```

- [ ] **Step 4: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Write postcss.config.mjs**

```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

- [ ] **Step 6: Write tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        frost: { 50: '#f0f9ff', 500: '#06b6d4', 900: '#164e63' },
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 7: Smoke test**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/frontend
npm run build 2>&1 | tail -5
```

Expected: no errors. Possibly warning about no pages — OK, we add them next.

- [ ] **Step 8: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/frontend/package.json frozenfriends/frontend/package-lock.json frozenfriends/frontend/next.config.mjs frozenfriends/frontend/tsconfig.json frozenfriends/frontend/postcss.config.mjs frozenfriends/frontend/tailwind.config.ts
git commit -m "feat(frontend): scaffold Next.js 15 with basePath /base"
```

### Task 14: Wagmi + Privy provider setup

**Files:**
- Create: `frozenfriends/frontend/lib/wagmi.ts`, `lib/contracts.ts`
- Create: `frozenfriends/frontend/components/Providers.tsx`

- [ ] **Step 1: Write lib/wagmi.ts**

```typescript
import { http, createConfig } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';

export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  transports: {
    [base.id]: http('https://mainnet.base.org'),
    [baseSepolia.id]: http('https://sepolia.base.org'),
  },
});
```

- [ ] **Step 2: Write lib/contracts.ts**

```typescript
import sepoliaAddrs from '../../contracts/addresses-sepolia.json';

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 84532);

export const FROZEN_FRIENDS_ADDR = sepoliaAddrs.FrozenFriends as `0x${string}`;
export const PAYMASTER_ADDR = sepoliaAddrs.Paymaster as `0x${string}`;
export const ACTIVE_CHAIN_ID = CHAIN_ID;

export const FROZEN_FRIENDS_ABI = [
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'payable',
    inputs: [],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'hasMinted',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'seedOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Minted',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'seed', type: 'uint256', indexed: false },
    ],
  },
] as const;
```

- [ ] **Step 3: Write components/Providers.tsx**

```tsx
'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { base, baseSepolia } from 'viem/chains';
import { wagmiConfig } from '@/lib/wagmi';
import { useState } from 'react';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'cmncpclp100mf0cl5x9cn47ea';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        defaultChain: base,
        supportedChains: [base, baseSepolia],
        loginMethods: ['email', 'wallet', 'google', 'twitter'],
        embeddedWallets: { createOnLogin: 'users-without-wallets' },
        appearance: { theme: 'dark', accentColor: '#06b6d4' },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
```

- [ ] **Step 4: Write app/layout.tsx**

```tsx
import './globals.css';
import { Providers } from '@/components/Providers';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FrozenFriends — Social AI Pets on Base',
  description: 'Your pet has a personality and a social life. Read its daily diary.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Write app/globals.css**

```css
@import 'tailwindcss';

@layer base {
  body {
    background: linear-gradient(180deg, #0c1a3d 0%, #1e1b4b 100%);
    color: #fff;
    min-height: 100vh;
  }
}
```

- [ ] **Step 6: Write .env.local**

```bash
cat > /Users/hts_bot/avax-arena/frozenfriends/frontend/.env.local <<'EOF'
NEXT_PUBLIC_PRIVY_APP_ID=cmncpclp100mf0cl5x9cn47ea
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_API_BASE=http://localhost:3003
EOF
echo "frozenfriends/frontend/.env.local" >> /Users/hts_bot/avax-arena/.gitignore
```

- [ ] **Step 7: Verify build**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/frontend
npm run build 2>&1 | tail -10
```

Expected: build succeeds (warnings OK, errors NOT OK).

- [ ] **Step 8: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/frontend/lib frozenfriends/frontend/components/Providers.tsx frozenfriends/frontend/app/layout.tsx frozenfriends/frontend/app/globals.css .gitignore
git commit -m "feat(frontend): Privy + Wagmi providers + base layout"
```

### Task 15: Pet visual encoding (SVG generator)

**Files:**
- Create: `frozenfriends/frontend/lib/pet-visual.ts`
- Create: `frozenfriends/frontend/components/PetSvg.tsx`

- [ ] **Step 1: Write pet-visual.ts (seed → trait derivation)**

```typescript
const COLOR_PALETTES = [
  ['#06b6d4', '#0ea5e9'], // Cyan ice
  ['#a855f7', '#7e22ce'], // Violet frost
  ['#10b981', '#047857'], // Emerald
  ['#f59e0b', '#b45309'], // Amber
  ['#ef4444', '#7f1d1d'], // Red
  ['#3b82f6', '#1e40af'], // Blue
  ['#fbbf24', '#92400e'], // Gold
  ['#ec4899', '#831843'], // Pink
];

const PATTERNS = ['plain', 'dots', 'stripes', 'sparkles'] as const;
const EYE_SHAPES = ['round', 'oval', 'sleepy', 'star'] as const;

export type Pet = {
  tokenId: number;
  seed: bigint;
  paletteIdx: number;
  patternIdx: number;
  eyeIdx: number;
  bold: number;
  social: number;
  curious: number;
  name: string;
};

export function petFromSeed(tokenId: number, seed: bigint): Pet {
  const s = seed;
  const paletteIdx = Number(s % BigInt(COLOR_PALETTES.length));
  const patternIdx = Number((s >> 8n) % BigInt(PATTERNS.length));
  const eyeIdx = Number((s >> 16n) % BigInt(EYE_SHAPES.length));
  const bold = Number((s >> 24n) % 101n);
  const social = Number((s >> 32n) % 101n);
  const curious = Number((s >> 40n) % 101n);
  const name = generateName(bold, social, curious, tokenId);
  return { tokenId, seed, paletteIdx, patternIdx, eyeIdx, bold, social, curious, name };
}

const FIRST = ['Pip', 'Mira', 'Zuko', 'Lumi', 'Frosty', 'Nyx', 'Vex', 'Yumi', 'Kai', 'Bubu', 'Nori', 'Sage'];
const ADJ = ['Bold', 'Cozy', 'Sneaky', 'Curious', 'Loyal', 'Wild', 'Wise', 'Sleepy'];

function generateName(bold: number, social: number, curious: number, tokenId: number): string {
  const adjIdx = (bold + social + curious) % ADJ.length;
  const nameIdx = tokenId % FIRST.length;
  return `${ADJ[adjIdx]} ${FIRST[nameIdx]}`;
}

export function getPalette(idx: number): readonly [string, string] {
  return COLOR_PALETTES[idx % COLOR_PALETTES.length] as [string, string];
}

export function getPattern(idx: number) {
  return PATTERNS[idx % PATTERNS.length];
}

export function getEye(idx: number) {
  return EYE_SHAPES[idx % EYE_SHAPES.length];
}
```

- [ ] **Step 2: Write PetSvg.tsx (renders the pet)**

```tsx
'use client';

import { Pet, getPalette, getPattern, getEye } from '@/lib/pet-visual';

export function PetSvg({ pet, size = 120 }: { pet: Pet; size?: number }) {
  const [c1, c2] = getPalette(pet.paletteIdx);
  const pattern = getPattern(pet.patternIdx);
  const eye = getEye(pet.eyeIdx);

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`g-${pet.tokenId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>

      {/* Body */}
      <ellipse cx="50" cy="55" rx="32" ry="38" fill={`url(#g-${pet.tokenId})`} />

      {/* Pattern overlay */}
      {pattern === 'dots' && (
        <g opacity="0.4">
          <circle cx="40" cy="65" r="3" fill="#fff" />
          <circle cx="55" cy="70" r="2.5" fill="#fff" />
          <circle cx="48" cy="80" r="2" fill="#fff" />
        </g>
      )}
      {pattern === 'stripes' && (
        <g opacity="0.3">
          <line x1="30" y1="65" x2="70" y2="65" stroke="#fff" strokeWidth="2" />
          <line x1="30" y1="75" x2="70" y2="75" stroke="#fff" strokeWidth="2" />
        </g>
      )}
      {pattern === 'sparkles' && (
        <g opacity="0.7">
          <text x="35" y="50" fontSize="8" fill="#fff">✦</text>
          <text x="60" y="60" fontSize="6" fill="#fff">✧</text>
          <text x="45" y="80" fontSize="7" fill="#fff">✦</text>
        </g>
      )}

      {/* Eyes */}
      {eye === 'round' && (
        <>
          <circle cx="40" cy="45" r="5" fill="#fff" />
          <circle cx="60" cy="45" r="5" fill="#fff" />
          <circle cx="40" cy="46" r="2" fill="#000" />
          <circle cx="60" cy="46" r="2" fill="#000" />
        </>
      )}
      {eye === 'oval' && (
        <>
          <ellipse cx="40" cy="45" rx="4" ry="6" fill="#fff" />
          <ellipse cx="60" cy="45" rx="4" ry="6" fill="#fff" />
          <ellipse cx="40" cy="46" rx="1.5" ry="2.5" fill="#000" />
          <ellipse cx="60" cy="46" rx="1.5" ry="2.5" fill="#000" />
        </>
      )}
      {eye === 'sleepy' && (
        <>
          <path d="M 35 47 Q 40 42 45 47" stroke="#fff" strokeWidth="2" fill="none" />
          <path d="M 55 47 Q 60 42 65 47" stroke="#fff" strokeWidth="2" fill="none" />
        </>
      )}
      {eye === 'star' && (
        <>
          <text x="35" y="50" fontSize="10" fill="#fde047">★</text>
          <text x="55" y="50" fontSize="10" fill="#fde047">★</text>
        </>
      )}

      {/* Cheeks (Mood hint — pink if happy) */}
      <circle cx="32" cy="60" r="3" fill="#fbb6ce" opacity="0.6" />
      <circle cx="68" cy="60" r="3" fill="#fbb6ce" opacity="0.6" />
    </svg>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/frontend/lib/pet-visual.ts frozenfriends/frontend/components/PetSvg.tsx
git commit -m "feat(frontend): pet SVG visual encoding from on-chain seed"
```

### Task 16: Mint flow page

**Files:**
- Create: `frozenfriends/frontend/app/mint/page.tsx`
- Create: `frozenfriends/frontend/components/MintFlow.tsx`

- [ ] **Step 1: Write MintFlow.tsx**

```tsx
'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { FROZEN_FRIENDS_ADDR, FROZEN_FRIENDS_ABI, ACTIVE_CHAIN_ID } from '@/lib/contracts';
import { PetSvg } from './PetSvg';
import { petFromSeed } from '@/lib/pet-visual';

export function MintFlow() {
  const { login, authenticated, ready, user } = usePrivy();
  const { address } = useAccount();
  const [mintedTokenId, setMintedTokenId] = useState<number | null>(null);

  const { data: hasMinted } = useReadContract({
    address: FROZEN_FRIENDS_ADDR,
    abi: FROZEN_FRIENDS_ABI,
    functionName: 'hasMinted',
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!address },
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: ACTIVE_CHAIN_ID,
  });

  // Parse Minted event for tokenId
  if (isSuccess && receipt && mintedTokenId === null) {
    const log = receipt.logs.find((l) => l.address.toLowerCase() === FROZEN_FRIENDS_ADDR.toLowerCase());
    if (log && log.topics[2]) {
      setMintedTokenId(Number(BigInt(log.topics[2])));
    }
  }

  if (!ready) return <p className="text-white/40">Loading...</p>;

  if (!authenticated) {
    return (
      <button onClick={login} className="bg-frost-500 px-6 py-3 rounded-lg font-semibold hover:bg-cyan-400">
        Login with Email or Wallet
      </button>
    );
  }

  if (hasMinted) {
    return (
      <div className="text-center">
        <p className="text-white/60 mb-4">Bu cüzdan zaten bir pet mintledi.</p>
        <a href="/base/pet/me" className="underline text-frost-500">Pet'ini gör →</a>
      </div>
    );
  }

  if (mintedTokenId !== null) {
    return (
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold">Pet'in geldi! 🎉</h2>
        <a href={`/base/pet/${mintedTokenId}`} className="bg-frost-500 px-6 py-3 rounded-lg inline-block">
          Pet'ini Gör
        </a>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4 max-w-sm">
      <h2 className="text-3xl font-bold">Adopt a Frozen Friend</h2>
      <p className="text-white/60">Mint fiyatı: 0.0005 ETH (~$1.50)</p>
      <p className="text-white/40 text-sm">Cüzdan başına 1 pet. Pet'in kişiliği + görseli mint anında rastgele oluşturulur.</p>
      <button
        disabled={isPending || isConfirming}
        onClick={() =>
          writeContract({
            address: FROZEN_FRIENDS_ADDR,
            abi: FROZEN_FRIENDS_ABI,
            functionName: 'mint',
            value: parseEther('0.0005'),
            chainId: ACTIVE_CHAIN_ID,
          })
        }
        className="bg-frost-500 px-8 py-4 rounded-lg font-bold text-lg hover:bg-cyan-400 disabled:opacity-50"
      >
        {isPending ? 'Confirm in wallet…' : isConfirming ? 'Minting…' : 'Mint Now'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write app/mint/page.tsx**

```tsx
import { MintFlow } from '@/components/MintFlow';

export default function MintPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <MintFlow />
    </div>
  );
}
```

- [ ] **Step 3: Run dev server + smoke test**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/frontend
npm run dev
# In browser: http://localhost:3002/base/mint
# Expect: login button, then mint button (with testnet wallet)
```

- [ ] **Step 4: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/frontend/app/mint frozenfriends/frontend/components/MintFlow.tsx
git commit -m "feat(frontend): mint flow with Privy login + wagmi writeContract"
```

### Task 17: Pet view page (read from chain)

**Files:**
- Create: `frozenfriends/frontend/app/pet/[id]/page.tsx`
- Create: `frozenfriends/frontend/components/PetCard.tsx`

- [ ] **Step 1: Write PetCard.tsx**

```tsx
'use client';

import { useReadContract } from 'wagmi';
import { FROZEN_FRIENDS_ADDR, FROZEN_FRIENDS_ABI, ACTIVE_CHAIN_ID } from '@/lib/contracts';
import { petFromSeed } from '@/lib/pet-visual';
import { PetSvg } from './PetSvg';

export function PetCard({ tokenId }: { tokenId: number }) {
  const { data: seed, isLoading } = useReadContract({
    address: FROZEN_FRIENDS_ADDR,
    abi: FROZEN_FRIENDS_ABI,
    functionName: 'seedOf',
    args: [BigInt(tokenId)],
    chainId: ACTIVE_CHAIN_ID,
  });

  if (isLoading) return <div className="text-white/40">Loading pet…</div>;
  if (!seed) return <div className="text-red-400">Pet not found</div>;

  const pet = petFromSeed(tokenId, seed as bigint);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 max-w-sm">
      <PetSvg pet={pet} size={180} />
      <h2 className="text-2xl font-bold mt-4">{pet.name}</h2>
      <p className="text-white/50 text-sm">Frost Sprite #{tokenId}</p>

      <div className="mt-4 space-y-2">
        <PersonalityBar label="Bold" value={pet.bold} color="#fbbf24" />
        <PersonalityBar label="Social" value={pet.social} color="#a855f7" />
        <PersonalityBar label="Curious" value={pet.curious} color="#ec4899" />
      </div>
    </div>
  );
}

function PersonalityBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-white/60">
        <span>{label}</span>
        <span>{value}/100</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write app/pet/[id]/page.tsx**

```tsx
import { PetCard } from '@/components/PetCard';

export default async function PetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tokenId = parseInt(id, 10);
  if (isNaN(tokenId) || tokenId < 1) return <div className="p-8">Invalid pet ID</div>;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 space-y-6">
      <PetCard tokenId={tokenId} />
      {/* Diary feed will be added in Phase 5 */}
    </div>
  );
}
```

- [ ] **Step 3: Smoke test**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/frontend
# Visit http://localhost:3002/base/pet/1 after minting on testnet
```

Expected: pet visual + name + personality bars render.

- [ ] **Step 4: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/frontend/app/pet frozenfriends/frontend/components/PetCard.tsx
git commit -m "feat(frontend): pet view page reads seed from chain"
```

---

## Phase 4 — Backend API + DB (Day 7-8)

### Task 18: Initialize backend project

**Files:**
- Create: `frozenfriends/backend/package.json`, `tsconfig.json`, `src/`

- [ ] **Step 1: package.json**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/backend
cat > package.json <<'EOF'
{
  "name": "frozenfriends-backend",
  "version": "0.1.0",
  "scripts": {
    "build": "tsc",
    "dev:api": "tsx watch src/api/server.ts",
    "dev:worker": "tsx watch src/worker/tick.ts",
    "start:api": "node dist/api/server.js",
    "start:worker": "node dist/worker/tick.js",
    "migrate": "tsx scripts/migrate.ts"
  }
}
EOF
```

- [ ] **Step 2: Install deps**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/backend
npm install express cors dotenv pg node-cron @anthropic-ai/sdk viem
npm install -D typescript @types/node @types/express @types/cors @types/pg @types/node-cron tsx
```

- [ ] **Step 3: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "declaration": false
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/backend/package.json frozenfriends/backend/tsconfig.json frozenfriends/backend/package-lock.json
git commit -m "feat(backend): scaffold Express + worker"
```

### Task 19: Postgres migrations

**Files:**
- Create: `frozenfriends/backend/migrations/001_pets.sql`, `002_diary.sql`, `003_frost_points.sql`
- Create: `frozenfriends/backend/scripts/migrate.ts`

- [ ] **Step 1: Write 001_pets.sql**

```sql
CREATE TABLE IF NOT EXISTS pets (
  token_id INTEGER PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  bold SMALLINT NOT NULL CHECK (bold BETWEEN 0 AND 100),
  social SMALLINT NOT NULL CHECK (social BETWEEN 0 AND 100),
  curious SMALLINT NOT NULL CHECK (curious BETWEEN 0 AND 100),
  mood SMALLINT NOT NULL DEFAULT 80 CHECK (mood BETWEEN 0 AND 100),
  seed NUMERIC NOT NULL,
  palette_idx SMALLINT NOT NULL,
  pattern_idx SMALLINT NOT NULL,
  eye_idx SMALLINT NOT NULL,
  minted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_tick_at TIMESTAMPTZ
);

CREATE INDEX idx_pets_owner ON pets(owner);
CREATE INDEX idx_pets_last_tick ON pets(last_tick_at NULLS FIRST);
```

- [ ] **Step 2: Write 002_diary.sql**

```sql
CREATE TABLE IF NOT EXISTS diary (
  id BIGSERIAL PRIMARY KEY,
  pet_a_id INTEGER NOT NULL REFERENCES pets(token_id) ON DELETE CASCADE,
  pet_b_id INTEGER NOT NULL REFERENCES pets(token_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('chat', 'gift')),
  narrative TEXT NOT NULL,
  mood_delta_a SMALLINT NOT NULL,
  mood_delta_b SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_diary_pet_a ON diary(pet_a_id, created_at DESC);
CREATE INDEX idx_diary_pet_b ON diary(pet_b_id, created_at DESC);
```

- [ ] **Step 3: Write 003_frost_points.sql**

```sql
CREATE TABLE IF NOT EXISTS frost_points (
  wallet TEXT PRIMARY KEY,
  points INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_frost_points_points ON frost_points(points DESC);
```

- [ ] **Step 4: Write scripts/migrate.ts**

```typescript
import { Client } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/frozenfriends';
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

async function migrate() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const { rows } = await client.query('SELECT 1 FROM _migrations WHERE name = $1', [f]);
    if (rows.length > 0) {
      console.log(`✓ ${f} (already run)`);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8');
    console.log(`→ Running ${f}…`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      console.log(`✓ ${f}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  }
  await client.end();
}

migrate().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 5: Create local DB + run migrations**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/backend
# Local Postgres assumed (e.g., Homebrew). Otherwise: brew install postgresql@16 && brew services start postgresql@16
createdb frozenfriends 2>/dev/null || echo "DB exists"
mkdir -p scripts
DATABASE_URL=postgres://localhost:5432/frozenfriends npx tsx scripts/migrate.ts
```

Expected: 3 migrations report `✓`.

- [ ] **Step 6: Verify schema**

```bash
psql frozenfriends -c '\dt'
```

Expected: `pets`, `diary`, `frost_points`, `_migrations`.

- [ ] **Step 7: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/backend/migrations frozenfriends/backend/scripts/migrate.ts
git commit -m "feat(backend): pets/diary/frost_points migrations"
```

### Task 20: Backend lib (DB pool, viem reader)

**Files:**
- Create: `frozenfriends/backend/src/lib/db.ts`, `lib/viem.ts`, `types.ts`

- [ ] **Step 1: Write lib/db.ts**

```typescript
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/frozenfriends';

export const pool = new Pool({ connectionString: DATABASE_URL });
```

- [ ] **Step 2: Write types.ts**

```typescript
export interface Pet {
  token_id: number;
  owner: string;
  name: string;
  bold: number;
  social: number;
  curious: number;
  mood: number;
  seed: string;
  palette_idx: number;
  pattern_idx: number;
  eye_idx: number;
  minted_at: string;
  last_tick_at: string | null;
}

export interface DiaryEntry {
  id: number;
  pet_a_id: number;
  pet_b_id: number;
  event_type: 'chat' | 'gift';
  narrative: string;
  mood_delta_a: number;
  mood_delta_b: number;
  created_at: string;
}
```

- [ ] **Step 3: Write lib/viem.ts**

```typescript
import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';

const CHAIN_ID = Number(process.env.CHAIN_ID || 84532);
const chain = CHAIN_ID === 8453 ? base : baseSepolia;
const rpc = CHAIN_ID === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org';

export const publicClient = createPublicClient({ chain, transport: http(rpc) });
export const CHAIN = chain;
```

- [ ] **Step 4: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/backend/src/lib frozenfriends/backend/src/types.ts
git commit -m "feat(backend): DB pool + viem client + types"
```

### Task 21: Express API server

**Files:**
- Create: `frozenfriends/backend/src/api/server.ts`

- [ ] **Step 1: Write server.ts**

```typescript
import express from 'express';
import cors from 'cors';
import { pool } from '../lib/db';
import type { Pet, DiaryEntry } from '../types';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.API_PORT || 3003);

app.get('/health', (_, res) => res.json({ ok: true }));

app.get('/api/pet/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const { rows } = await pool.query<Pet>('SELECT * FROM pets WHERE token_id = $1', [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

app.get('/api/diary/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const limit = Math.min(parseInt((req.query.limit as string) || '5'), 50);
  const { rows } = await pool.query<DiaryEntry>(
    `SELECT * FROM diary WHERE pet_a_id = $1 OR pet_b_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [id, limit]
  );
  res.json(rows);
});

app.get('/api/points/:wallet', async (req, res) => {
  const wallet = req.params.wallet.toLowerCase();
  const { rows } = await pool.query('SELECT points FROM frost_points WHERE wallet = $1', [wallet]);
  res.json({ wallet, points: rows[0]?.points ?? 0 });
});

app.post('/api/pet', async (req, res) => {
  // Called after mint tx confirms — backend records pet in DB
  const { token_id, owner, name, bold, social, curious, seed, palette_idx, pattern_idx, eye_idx } = req.body;
  if (typeof token_id !== 'number') return res.status(400).json({ error: 'token_id required' });
  try {
    await pool.query(
      `INSERT INTO pets (token_id, owner, name, bold, social, curious, seed, palette_idx, pattern_idx, eye_idx)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (token_id) DO NOTHING`,
      [token_id, owner.toLowerCase(), name, bold, social, curious, seed.toString(), palette_idx, pattern_idx, eye_idx]
    );
    // Award +100 Frost Points for mint
    await pool.query(
      `INSERT INTO frost_points (wallet, points) VALUES ($1, 100)
       ON CONFLICT (wallet) DO UPDATE SET points = frost_points.points + 100, last_updated = now()`,
      [owner.toLowerCase()]
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`API listening on :${PORT}`));
```

- [ ] **Step 2: Smoke test**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/backend
DATABASE_URL=postgres://localhost:5432/frozenfriends npm run dev:api &
sleep 2
curl http://localhost:3003/health
```

Expected: `{"ok":true}`

- [ ] **Step 3: Stop dev server + commit**

```bash
pkill -f "tsx watch src/api"
cd /Users/hts_bot/avax-arena
git add frozenfriends/backend/src/api/server.ts
git commit -m "feat(backend): API endpoints for pet, diary, points, registration"
```

### Task 22: Wire up mint → backend POST

**Files:**
- Modify: `frozenfriends/frontend/components/MintFlow.tsx`
- Create: `frozenfriends/frontend/lib/api.ts`

- [ ] **Step 1: Write lib/api.ts**

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3003';

export async function registerPet(payload: {
  token_id: number;
  owner: string;
  name: string;
  bold: number;
  social: number;
  curious: number;
  seed: string;
  palette_idx: number;
  pattern_idx: number;
  eye_idx: number;
}) {
  const r = await fetch(`${API_BASE}/api/pet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getDiary(petId: number) {
  const r = await fetch(`${API_BASE}/api/diary/${petId}`);
  if (!r.ok) return [];
  return r.json();
}
```

- [ ] **Step 2: Update MintFlow.tsx to register pet after mint**

Add this block inside the `if (isSuccess && receipt && mintedTokenId === null)` block:

```tsx
// Inside the existing success handler:
if (isSuccess && receipt && mintedTokenId === null) {
  const log = receipt.logs.find((l) => l.address.toLowerCase() === FROZEN_FRIENDS_ADDR.toLowerCase());
  if (log && log.topics[2]) {
    const tokenId = Number(BigInt(log.topics[2]));
    setMintedTokenId(tokenId);
    // Read seed and register
    (async () => {
      const seedResult = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/seed/${tokenId}`
      ).catch(() => null);
      // OR: derive seed from log.data (Minted event includes seed as last topic/data)
      const seedHex = log.data;
      const seed = BigInt(seedHex);
      const pet = petFromSeed(tokenId, seed);
      await registerPet({
        token_id: tokenId,
        owner: address || '',
        name: pet.name,
        bold: pet.bold,
        social: pet.social,
        curious: pet.curious,
        seed: seed.toString(),
        palette_idx: pet.paletteIdx,
        pattern_idx: pet.patternIdx,
        eye_idx: pet.eyeIdx,
      });
    })();
  }
}
```

- [ ] **Step 3: Add import to MintFlow.tsx**

```tsx
import { registerPet } from '@/lib/api';
```

- [ ] **Step 4: Smoke test mint → DB**

```bash
# Frontend dev + backend running
# Mint on testnet via UI
# Then:
psql frozenfriends -c 'SELECT * FROM pets;'
```

Expected: 1 row with newly minted pet.

- [ ] **Step 5: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/frontend/lib/api.ts frozenfriends/frontend/components/MintFlow.tsx
git commit -m "feat(frontend): register pet to backend after mint confirmation"
```

---

## Phase 5 — AI Worker (Day 9-10)

### Task 23: Matching algorithm

**Files:**
- Create: `frozenfriends/backend/src/worker/matching.ts`

- [ ] **Step 1: Write matching.ts**

```typescript
import { pool } from '../lib/db';
import type { Pet } from '../types';

/// Eligible pets that haven't been tick'd today (or ever)
export async function getEligiblePets(): Promise<Pet[]> {
  const { rows } = await pool.query<Pet>(`
    SELECT * FROM pets
    WHERE last_tick_at IS NULL OR last_tick_at < now() - interval '23 hours'
    ORDER BY last_tick_at NULLS FIRST
  `);
  return rows;
}

/// Pair pets together randomly. Each pet appears in at most 1 pair.
export function pairPets(pets: Pet[]): Array<[Pet, Pet]> {
  if (pets.length < 2) return [];
  const shuffled = [...pets].sort(() => Math.random() - 0.5);
  const pairs: Array<[Pet, Pet]> = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    pairs.push([shuffled[i], shuffled[i + 1]]);
  }
  return pairs;
}

export async function markTicked(tokenIds: number[]): Promise<void> {
  if (tokenIds.length === 0) return;
  await pool.query(`UPDATE pets SET last_tick_at = now() WHERE token_id = ANY($1::int[])`, [tokenIds]);
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/backend/src/worker/matching.ts
git commit -m "feat(worker): pet matching + tick tracking"
```

### Task 24: AI prompt + Claude Haiku call

**Files:**
- Create: `frozenfriends/backend/src/lib/prompts.ts`, `src/worker/ai.ts`

- [ ] **Step 1: Write lib/prompts.ts**

```typescript
import type { Pet } from '../types';

export function buildPrompt(a: Pet, b: Pet, eventType: 'chat' | 'gift'): string {
  return `You are narrating a social interaction between two cute frozen creatures in third person.

Pet A: "${a.name}" — Bold=${a.bold}, Social=${a.social}, Curious=${a.curious}, current Mood=${a.mood}
Pet B: "${b.name}" — Bold=${b.bold}, Social=${b.social}, Curious=${b.curious}, current Mood=${b.mood}

Event type: ${eventType === 'chat' ? 'They have a conversation' : 'One gives the other a small gift'}

Write a 2-3 sentence narrative of this moment. Reflect their personalities subtly. Tone: cozy, wholesome, sometimes slightly dramatic.

Then output JSON on the LAST LINE:
{"moodDeltaA": <-10 to +10>, "moodDeltaB": <-10 to +10>}

Output format:
<narrative paragraph>
{"moodDeltaA": N, "moodDeltaB": N}`;
}

export function parseAIResponse(text: string): { narrative: string; moodDeltaA: number; moodDeltaB: number } {
  const lines = text.trim().split('\n');
  const lastLine = lines[lines.length - 1].trim();
  const narrative = lines.slice(0, -1).join('\n').trim();
  try {
    const parsed = JSON.parse(lastLine);
    return {
      narrative,
      moodDeltaA: clamp(Number(parsed.moodDeltaA) || 0, -10, 10),
      moodDeltaB: clamp(Number(parsed.moodDeltaB) || 0, -10, 10),
    };
  } catch {
    return { narrative: narrative || text, moodDeltaA: 0, moodDeltaB: 0 };
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
```

- [ ] **Step 2: Write worker/ai.ts**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { buildPrompt, parseAIResponse } from '../lib/prompts';
import type { Pet } from '../types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateEvent(a: Pet, b: Pet): Promise<{
  eventType: 'chat' | 'gift';
  narrative: string;
  moodDeltaA: number;
  moodDeltaB: number;
}> {
  // 70% chat, 30% gift (weighted by generosity? for MVP just probabilistic)
  const eventType: 'chat' | 'gift' = Math.random() < 0.7 ? 'chat' : 'gift';
  const prompt = buildPrompt(a, b, eventType);

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('\n');

  const parsed = parseAIResponse(text);
  return { eventType, ...parsed };
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/backend/src/lib/prompts.ts frozenfriends/backend/src/worker/ai.ts
git commit -m "feat(worker): Claude Haiku event generator + prompt template"
```

### Task 25: Tick cron job

**Files:**
- Create: `frozenfriends/backend/src/worker/tick.ts`

- [ ] **Step 1: Write tick.ts**

```typescript
import cron from 'node-cron';
import { pool } from '../lib/db';
import { getEligiblePets, pairPets, markTicked } from './matching';
import { generateEvent } from './ai';

async function runTick() {
  console.log(`[${new Date().toISOString()}] Tick starting…`);
  const pets = await getEligiblePets();
  console.log(`  Eligible: ${pets.length}`);
  const pairs = pairPets(pets);
  console.log(`  Pairs: ${pairs.length}`);

  const tickedIds: number[] = [];
  for (const [a, b] of pairs) {
    try {
      const event = await generateEvent(a, b);
      await pool.query('BEGIN');
      await pool.query(
        `INSERT INTO diary (pet_a_id, pet_b_id, event_type, narrative, mood_delta_a, mood_delta_b)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [a.token_id, b.token_id, event.eventType, event.narrative, event.moodDeltaA, event.moodDeltaB]
      );
      await pool.query(
        `UPDATE pets SET mood = LEAST(100, GREATEST(0, mood + $2)) WHERE token_id = $1`,
        [a.token_id, event.moodDeltaA]
      );
      await pool.query(
        `UPDATE pets SET mood = LEAST(100, GREATEST(0, mood + $2)) WHERE token_id = $1`,
        [b.token_id, event.moodDeltaB]
      );
      // Frost Points: +1 each for being in an event
      await pool.query(
        `INSERT INTO frost_points (wallet, points)
         SELECT owner, 1 FROM pets WHERE token_id = ANY($1::int[])
         ON CONFLICT (wallet) DO UPDATE SET points = frost_points.points + 1, last_updated = now()`,
        [[a.token_id, b.token_id]]
      );
      await pool.query('COMMIT');
      tickedIds.push(a.token_id, b.token_id);
    } catch (e) {
      await pool.query('ROLLBACK');
      console.error(`  Pair ${a.token_id}/${b.token_id} failed:`, e);
    }
  }
  await markTicked(tickedIds);
  console.log(`[${new Date().toISOString()}] Tick complete. Processed ${tickedIds.length / 2} pairs.`);
}

const ONESHOT = process.argv.includes('--once');
if (ONESHOT) {
  runTick().then(() => process.exit(0));
} else {
  console.log('Worker running. Tick scheduled for 12:00 UTC daily.');
  cron.schedule('0 12 * * *', runTick, { timezone: 'UTC' });
}
```

- [ ] **Step 2: Test one-shot tick locally**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/backend
# Requires ANTHROPIC_API_KEY in env
ANTHROPIC_API_KEY=sk-ant-xxx DATABASE_URL=postgres://localhost:5432/frozenfriends npx tsx src/worker/tick.ts --once
```

Expected: at least 1 pair processed if 2+ pets exist in DB.

- [ ] **Step 3: Verify DB has new diary entries**

```bash
psql frozenfriends -c 'SELECT id, pet_a_id, pet_b_id, event_type, LEFT(narrative, 50) FROM diary ORDER BY created_at DESC LIMIT 5;'
```

- [ ] **Step 4: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/backend/src/worker/tick.ts
git commit -m "feat(worker): daily tick cron — generates AI events + updates mood/points"
```

---

## Phase 6 — Diary UI + Share (Day 11-12)

### Task 26: Diary feed component

**Files:**
- Create: `frozenfriends/frontend/components/DiaryFeed.tsx`
- Modify: `frozenfriends/frontend/app/pet/[id]/page.tsx`

- [ ] **Step 1: Write DiaryFeed.tsx**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { getDiary } from '@/lib/api';

type Entry = {
  id: number;
  pet_a_id: number;
  pet_b_id: number;
  event_type: 'chat' | 'gift';
  narrative: string;
  mood_delta_a: number;
  mood_delta_b: number;
  created_at: string;
};

export function DiaryFeed({ petId }: { petId: number }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDiary(petId)
      .then((data) => { setEntries(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [petId]);

  if (loading) return <p className="text-white/40">Loading diary…</p>;
  if (entries.length === 0) {
    return (
      <div className="text-center text-white/40 py-8">
        <p>Pet'in hâlâ ilk macerasını yaşamadı.</p>
        <p className="text-xs mt-2">İlk olay bugün 12:00 UTC'de gelir.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-md w-full">
      <h3 className="text-lg font-semibold text-white/80">Diary</h3>
      {entries.map((e) => (
        <div key={e.id} className="bg-white/5 border border-white/10 rounded-lg p-4">
          <div className="flex justify-between text-xs text-white/40 mb-2">
            <span>#{e.pet_a_id} met #{e.pet_b_id} · {e.event_type === 'chat' ? '💬' : '🎁'}</span>
            <span>{new Date(e.created_at).toLocaleDateString()}</span>
          </div>
          <p className="text-sm text-white/80 leading-relaxed">{e.narrative}</p>
          <div className="flex gap-2 mt-2 text-xs">
            <span className={e.mood_delta_a >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              #{e.pet_a_id}: {e.mood_delta_a >= 0 ? '+' : ''}{e.mood_delta_a} mood
            </span>
            <span className={e.mood_delta_b >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              #{e.pet_b_id}: {e.mood_delta_b >= 0 ? '+' : ''}{e.mood_delta_b} mood
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Modify app/pet/[id]/page.tsx**

```tsx
import { PetCard } from '@/components/PetCard';
import { DiaryFeed } from '@/components/DiaryFeed';
import { ShareButton } from '@/components/ShareButton';

export default async function PetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tokenId = parseInt(id, 10);
  if (isNaN(tokenId) || tokenId < 1) return <div className="p-8">Invalid pet ID</div>;

  return (
    <div className="min-h-screen flex flex-col items-center p-8 space-y-6">
      <PetCard tokenId={tokenId} />
      <ShareButton tokenId={tokenId} />
      <DiaryFeed petId={tokenId} />
    </div>
  );
}
```

- [ ] **Step 3: Commit (ShareButton next task)**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/frontend/components/DiaryFeed.tsx frozenfriends/frontend/app/pet
git commit -m "feat(frontend): diary feed component on pet page"
```

### Task 27: Farcaster share + OG image

**Files:**
- Create: `frozenfriends/frontend/components/ShareButton.tsx`
- Create: `frozenfriends/frontend/app/api/og/[id]/route.ts`

- [ ] **Step 1: Install OG image deps**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/frontend
npm install @vercel/og
```

- [ ] **Step 2: Write app/api/og/[id]/route.ts**

```tsx
import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tokenId = parseInt(id, 10);
  if (isNaN(tokenId)) return new Response('Invalid id', { status: 400 });

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #0c1a3d, #1e1b4b)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontFamily: 'system-ui',
        }}
      >
        <div style={{ fontSize: 120, marginBottom: 30 }}>🐧</div>
        <div style={{ fontSize: 64, fontWeight: 800 }}>Frost Sprite #{tokenId}</div>
        <div style={{ fontSize: 24, color: '#06b6d4', marginTop: 16 }}>FrozenFriends · Base</div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
```

- [ ] **Step 3: Write ShareButton.tsx**

```tsx
'use client';

export function ShareButton({ tokenId }: { tokenId: number }) {
  const url = typeof window !== 'undefined' ? `${window.location.origin}/base/pet/${tokenId}` : '';
  const text = `Look at my Frost Sprite #${tokenId} on FrozenFriends 🐧❄️`;
  const fcUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(url)}`;

  return (
    <a
      href={fcUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-purple-600 hover:bg-purple-500 px-6 py-2 rounded-lg font-semibold text-sm"
    >
      📤 Share to Farcaster
    </a>
  );
}
```

- [ ] **Step 4: Smoke test OG**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/frontend
npm run dev
# Open http://localhost:3002/base/api/og/1
# Expect: 1200x630 image with pet number
```

- [ ] **Step 5: Add metadata for OG to pet page**

Update `app/pet/[id]/page.tsx`:

```tsx
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const tokenId = parseInt(id, 10);
  if (isNaN(tokenId)) return { title: 'FrozenFriends' };
  return {
    title: `Frost Sprite #${tokenId} — FrozenFriends`,
    openGraph: {
      title: `Frost Sprite #${tokenId}`,
      images: [`/base/api/og/${tokenId}`],
    },
    twitter: { card: 'summary_large_image' },
  };
}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/frontend/components/ShareButton.tsx frozenfriends/frontend/app/api frozenfriends/frontend/app/pet
git commit -m "feat(frontend): Farcaster share button + dynamic OG image"
```

### Task 28: Landing page

**Files:**
- Create: `frozenfriends/frontend/app/page.tsx`

- [ ] **Step 1: Write landing**

```tsx
import Link from 'next/link';

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <div className="text-7xl mb-6">🐧❄️</div>
      <h1 className="text-5xl font-bold mb-4">FrozenFriends</h1>
      <p className="text-xl text-white/70 max-w-md mb-2">
        Your pet has a personality and a social life.
      </p>
      <p className="text-base text-white/50 max-w-md mb-8">
        While you sleep, your pet wanders the world, makes friends, gets in arguments, gives gifts. Read its diary every morning.
      </p>
      <Link
        href="/base/mint"
        className="bg-frost-500 hover:bg-cyan-400 text-white px-8 py-4 rounded-lg font-semibold text-lg"
      >
        Mint a Pet (0.0005 ETH)
      </Link>
      <div className="mt-12 text-white/30 text-xs">on Base · 1 pet per wallet · gasless onboarding</div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add frozenfriends/frontend/app/page.tsx
git commit -m "feat(frontend): landing page"
```

---

## Phase 7 — Deploy (Day 13-14)

### Task 29: Deploy contracts to Base mainnet

> Refer back to Task 12. Execute now (after frontend works on Sepolia).

- [ ] **Step 1: Fund mainnet deployer with ~0.02 ETH on Base**

User action: bridge ETH to Base for the deployer wallet.

- [ ] **Step 2: Deploy mainnet contracts**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/contracts
forge script script/Deploy.s.sol --rpc-url base --broadcast --verify
```

- [ ] **Step 3: Update addresses-mainnet.json + commit**

```bash
cat > /Users/hts_bot/avax-arena/frozenfriends/contracts/addresses-mainnet.json <<EOF
{
  "FrozenFriends": "0x...",
  "Paymaster": "0x...",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
git add frozenfriends/contracts/addresses-mainnet.json
git commit -m "feat(contracts): deploy to base mainnet"
```

- [ ] **Step 4: Modify frontend lib/contracts.ts to use mainnet by default in prod**

```typescript
// At top of contracts.ts
import sepoliaAddrs from '../../contracts/addresses-sepolia.json';
import mainnetAddrs from '../../contracts/addresses-mainnet.json';

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 8453);
const addrs = CHAIN_ID === 8453 ? mainnetAddrs : sepoliaAddrs;

export const FROZEN_FRIENDS_ADDR = addrs.FrozenFriends as `0x${string}`;
export const PAYMASTER_ADDR = addrs.Paymaster as `0x${string}`;
```

- [ ] **Step 5: Commit + update .env**

```bash
# Update frontend/.env.local for production:
# NEXT_PUBLIC_CHAIN_ID=8453
cd /Users/hts_bot/avax-arena
git add frozenfriends/frontend/lib/contracts.ts
git commit -m "feat(frontend): switch to mainnet contracts"
```

### Task 30: VPS environment prep

**Files:**
- VPS: install Node 20, Postgres 16, Redis (if not present)

- [ ] **Step 1: SSH and check versions**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 'node -v && psql --version && redis-cli ping'
```

Expected: Node 20+, Postgres 14+, Redis OK.

- [ ] **Step 2: If Postgres missing, install**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 '
  apt-get update && apt-get install -y postgresql-16 && systemctl enable --now postgresql
'
```

- [ ] **Step 3: Create production DB**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 '
  sudo -u postgres psql -c "CREATE DATABASE frozenfriends;"
  sudo -u postgres psql -c "CREATE USER frozenfriends WITH ENCRYPTED PASSWORD '"'"'$(openssl rand -hex 16)'"'"';"
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE frozenfriends TO frozenfriends;"
'
```

User action: store the generated password locally (e.g., in `~/Desktop/frozenfriends-prod.txt`).

- [ ] **Step 4: Create /opt/frostbite/frozenfriends/ on VPS**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 'mkdir -p /opt/frostbite/frozenfriends/{frontend,backend,contracts}'
```

### Task 31: Deploy frontend to VPS

**Files:**
- VPS: `/opt/frostbite/frozenfriends/frontend/`

- [ ] **Step 1: Build locally**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/frontend
NEXT_PUBLIC_CHAIN_ID=8453 \
NEXT_PUBLIC_PRIVY_APP_ID=cmncpclp100mf0cl5x9cn47ea \
NEXT_PUBLIC_API_BASE=https://frostbite.pro/base-api \
npm run build
```

- [ ] **Step 2: Rsync to VPS**

```bash
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.env*' \
  -e "ssh -i ~/.ssh/id_ed25519" \
  /Users/hts_bot/avax-arena/frozenfriends/frontend/ \
  root@5.189.173.167:/opt/frostbite/frozenfriends/frontend/
```

- [ ] **Step 3: Install prod deps + start PM2**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 '
  cd /opt/frostbite/frozenfriends/frontend
  cat > .env.local <<EOF
NEXT_PUBLIC_CHAIN_ID=8453
NEXT_PUBLIC_PRIVY_APP_ID=cmncpclp100mf0cl5x9cn47ea
NEXT_PUBLIC_API_BASE=https://frostbite.pro/base-api
EOF
  npm install --omit=dev
  pm2 start npm --name frozenfriends-frontend -- start
  pm2 save
'
```

- [ ] **Step 4: Verify**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 'curl -s http://localhost:3002/base | head -c 200'
```

Expected: HTML containing "FrozenFriends".

### Task 32: Deploy backend (API + worker)

**Files:**
- VPS: `/opt/frostbite/frozenfriends/backend/`

- [ ] **Step 1: Build TS locally**

```bash
cd /Users/hts_bot/avax-arena/frozenfriends/backend
npm run build
```

- [ ] **Step 2: Rsync**

```bash
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.env*' \
  -e "ssh -i ~/.ssh/id_ed25519" \
  /Users/hts_bot/avax-arena/frozenfriends/backend/ \
  root@5.189.173.167:/opt/frostbite/frozenfriends/backend/
```

- [ ] **Step 3: Install + migrate + PM2 start**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 '
  cd /opt/frostbite/frozenfriends/backend
  cat > .env <<EOF
DATABASE_URL=postgres://frozenfriends:<PASSWORD>@localhost:5432/frozenfriends
ANTHROPIC_API_KEY=sk-ant-xxx
CHAIN_ID=8453
API_PORT=3003
EOF
  npm install --omit=dev
  DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-) npx tsx scripts/migrate.ts
  pm2 start dist/api/server.js --name frozenfriends-api
  pm2 start dist/worker/tick.js --name frozenfriends-worker
  pm2 save
'
```

User action: replace `<PASSWORD>` with stored DB password and `sk-ant-xxx` with Anthropic key.

- [ ] **Step 4: Verify**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 'curl -s http://localhost:3003/health'
```

Expected: `{"ok":true}`

### Task 33: Nginx routing

**Files:**
- Modify: `/etc/nginx/sites-enabled/frostbite-mainnet` (uncomment + adjust)

- [ ] **Step 1: Re-enable + update nginx**

Add to `/etc/nginx/sites-enabled/frostbite-mainnet`:

```nginx
upstream base_upstream { server 127.0.0.1:3002; keepalive 64; }
upstream base_api_upstream { server 127.0.0.1:3003; keepalive 64; }

location /base { proxy_pass http://base_upstream; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }

location /base-api { proxy_pass http://base_api_upstream/; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
```

- [ ] **Step 2: Reload**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 'nginx -t && nginx -s reload'
```

- [ ] **Step 3: Verify public URL**

```bash
curl -sI https://frostbite.pro/base | head -3
curl -s https://frostbite.pro/base-api/health
```

Expected: 200 + `{"ok":true}`

### Task 34: Smoke test + launch

- [ ] **Step 1: Mint a test pet on mainnet (real money, small)**

User action: open `https://frostbite.pro/base/mint` in mobile browser, login via Privy email, mint 0.0005 ETH pet.

- [ ] **Step 2: Verify pet appears in DB**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 'psql -U frozenfriends -d frozenfriends -c "SELECT * FROM pets ORDER BY minted_at DESC LIMIT 5;"'
```

- [ ] **Step 3: Force-run a tick to verify AI**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 'cd /opt/frostbite/frozenfriends/backend && DATABASE_URL=postgres://... ANTHROPIC_API_KEY=... npx tsx src/worker/tick.ts --once'
```

(Need at least 2 minted pets for matching to work — invite a friend to mint or mint from a second wallet.)

- [ ] **Step 4: View diary on https://frostbite.pro/base/pet/1**

Expected: PetCard + at least 1 diary entry.

- [ ] **Step 5: Launch announce**

User action: post on Farcaster + X with link to https://frostbite.pro/base. Pin first pet share.

- [ ] **Step 6: Monitor logs first 24h**

```bash
ssh -i ~/.ssh/id_ed25519 root@5.189.173.167 'pm2 logs --lines 50'
```

Watch for errors.

---

## Deployment Checklist

Final go-live readiness — review before public launch (Day 14):

- [ ] FrozenFriends contract verified on Basescan
- [ ] Paymaster contract verified on Basescan
- [ ] Mainnet contract addresses committed in `addresses-mainnet.json`
- [ ] Anthropic API key tested + has spending limit configured
- [ ] Privy production env (App ID set correctly, redirect URLs include `https://frostbite.pro/base`)
- [ ] Postgres backups configured (`pg_dump` daily cron)
- [ ] PM2 startup persisted (`pm2 startup` + `pm2 save`)
- [ ] Nginx config syntax test passes
- [ ] Public URL responds with 200
- [ ] First mint completed end-to-end (mint → DB write → pet page renders)
- [ ] First AI tick completed (2+ pets paired, diary entries written)
- [ ] Mobile responsive verified on iPhone Safari + Android Chrome
- [ ] OG image renders correctly when pet page URL pasted in Farcaster compose
- [ ] Initial Treasury wallet funded for Paymaster sponsorship (0.05 ETH on Base)
- [ ] User documentation: README mentions Privy login + mint flow

---

## Smart Contract Test Plan

Beyond unit tests in Task 7 & 9:

**Test on Sepolia first:**
1. Deploy → verify on basescan-sepolia
2. Mint with 0.0005 ETH from 3 different wallets → confirm only 1 mint per wallet enforced
3. Attempt second mint with same wallet → expect revert with `AlreadyMinted`
4. Attempt mint with 0.0001 ETH → expect revert with `InsufficientPayment`
5. Read seedOf(1), seedOf(2), seedOf(3) → confirm all different
6. Owner withdraw → confirm balance moves
7. Non-owner withdraw → expect revert
8. setBaseURI(new) → tokenURI(1) reflects new URI

**Mainnet smoke test (after Phase 7 deploy):**
1. Mint 1 pet from deployer wallet (0.0005 ETH)
2. Verify token exists, seed is non-zero
3. Test Withdraw to a separate cold wallet (not deployer)

---

## Risks & Open Questions

- **Anthropic API key throttling:** Test rate limits before launch. Worst case: 100 events queued, parallel calls = ~3min per tick. Acceptable.
- **Paymaster integration unclear:** Coinbase Smart Wallet's built-in paymaster might handle gas automatically; our `Paymaster.sol` is currently just a tracker. If gas-sponsored mint doesn't work natively, plan a fallback: user mints with their own ETH (slightly less gasless, but functional).
- **No real-time DB sync to chain:** Mood is off-chain only. If we want shareable on-chain stats later, design a delta-based sync mechanism — out of scope here.
- **AI event quality drift:** First 100 outputs should be manually reviewed for tone and consistency. Adjust prompt in `lib/prompts.ts` if needed.

---

## Self-Review Notes

Verified against spec:
- ✅ Pet NFT mint (0.0005 ETH, 1/wallet, ERC-721 on Base) — Task 6-7, 16
- ✅ 3 personality dimensions (Bold/Social/Curious) — Task 15, 19
- ✅ Mood stat — Task 19
- ✅ Daily AI tick — Task 25
- ✅ 2 events (chat, gift) — Task 24-25
- ✅ Diary view (5 events) — Task 26
- ✅ Farcaster share — Task 27
- ✅ Frost Points backend tracking — Task 21 (mint), 25 (tick)
- ✅ Privy + Smart Wallet — Task 14
- ✅ Deletion of old base — Task 2-3
- ✅ VPS deploy on existing infra — Task 30-33

Gaps (none critical for MVP):
- "1 species (8 colors × 4 patterns × 4 eyes = 128 visuals)" — implementation has 8 palettes × 4 patterns × 4 eyes = 128. ✓
- "Frost Points hidden in v1" — backend tracks but frontend doesn't expose. ✓
- "AI cost ~$10/day at 10K pets" — informational, no code task needed.
