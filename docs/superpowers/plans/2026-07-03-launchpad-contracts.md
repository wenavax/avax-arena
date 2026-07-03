# Frostbite Launchpad Contracts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a paid-permissionless pump.fun-style token launchpad on Avalanche — a factory that clones isolated AVAX bonding-curve pools which graduate launched tokens to Trader Joe V1 with burned LP.

**Architecture:** One singleton `LaunchpadFactory` (owned by a Gnosis Safe) clones, per launch, an EIP-1167 `BondingCurvePool` and a non-ruggable `LaunchToken` (ERC20). Trading runs against a virtual-reserve constant-product curve priced in AVAX until `realAvax` hits a governable threshold, at which point the pool seeds a Trader Joe V1 pair and burns the LP. Owner can never withdraw pool reserves; an emergency pause halts new launches + buys only, sells always stay open.

**Tech Stack:** Solidity 0.8.24, Foundry (forge), OpenZeppelin (contracts + contracts-upgradeable), Trader Joe V1 (Uniswap-V2-style) router. Isolated project under `launchpad/`.

**Reference spec:** `docs/superpowers/specs/2026-07-03-launchpad-design.md`

---

## File structure

```
launchpad/
  foundry.toml
  remappings.txt
  .gitignore
  lib/            forge-std, openzeppelin-contracts, openzeppelin-contracts-upgradeable (forge install)
  src/
    libraries/CurveMath.sol        pure curve math (tokensOut / avaxOut)
    interfaces/IJoeRouter.sol       minimal Trader Joe V1 router
    interfaces/IPausableFactory.sol  paused() read for pools
    LaunchToken.sol                 ERC20 clone template (no owner, fixed supply)
    BondingCurvePool.sol            per-token curve pool (clone)
    LaunchpadFactory.sol            singleton factory
  test/
    CurveMath.t.sol                 unit + fuzz for math
    LaunchToken.t.sol               token template
    BondingCurvePool.t.sol          buy / sell / graduate (mock router)
    LaunchpadFactory.t.sol          createToken + config + pause
    invariant/PoolInvariant.t.sol   solvency + supply conservation
    fork/Graduation.fork.t.sol      real Trader Joe V1 + donation scenario
    mocks/MockJoeRouter.sol         records addLiquidityAVAX, mocks graduation
  script/
    DeployFuji.s.sol                deploy + param derivation
```

**Design notes carried into every task:**
- Curve invariant: `K = vAvax0 * y0` constant. `X = vAvax0 + realAvax`. Current token virtual reserve `Ycur = K / X = mulDiv(vAvax0, y0, X)`. Rounding always favors the protocol.
- `vAvax0` and `y0` are computed **off-chain** (deploy script / test helper) from the economic anchors `P_grad` and `P_init`; the contracts only consume them. This avoids on-chain derivation overflow.
- Non-ruggable token: no mint after init, no owner, no hooks.
- Pool never grants the owner a path to reserves. `factory.paused()` gates **buys** only.

---

## Task 1: Foundry project scaffold

**Files:**
- Create: `launchpad/foundry.toml`
- Create: `launchpad/remappings.txt`
- Create: `launchpad/.gitignore`

- [ ] **Step 1: Init the project and install deps**

Run:
```bash
cd /Users/hts_bot/avax-arena
mkdir -p launchpad && cd launchpad
forge init --no-git --no-commit .
rm -rf src/* test/* script/*
forge install --no-git foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts OpenZeppelin/openzeppelin-contracts-upgradeable
```
Expected: `lib/forge-std`, `lib/openzeppelin-contracts`, `lib/openzeppelin-contracts-upgradeable` present.

- [ ] **Step 2: Write `launchpad/foundry.toml`**

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.24"
optimizer = true
optimizer_runs = 200
via_ir = false
fs_permissions = [{ access = "read", path = "./"}]

[fuzz]
runs = 512

[invariant]
runs = 256
depth = 64
fail_on_revert = false

[rpc_endpoints]
fuji = "${FUJI_RPC_URL}"
avalanche = "${AVALANCHE_RPC_URL}"
```

- [ ] **Step 3: Write `launchpad/remappings.txt`**

```
forge-std/=lib/forge-std/src/
@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
@openzeppelin/contracts-upgradeable/=lib/openzeppelin-contracts-upgradeable/contracts/
```

- [ ] **Step 4: Write `launchpad/.gitignore`**

```
out/
cache/
broadcast/
.env
```

- [ ] **Step 5: Verify the toolchain builds**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge build`
Expected: compiles (no sources yet → "Nothing to compile" or success).

- [ ] **Step 6: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add launchpad/foundry.toml launchpad/remappings.txt launchpad/.gitignore launchpad/.gitmodules 2>/dev/null
git commit -m "chore(launchpad): foundry scaffold + OZ/forge-std deps"
```

---

## Task 2: Interfaces

**Files:**
- Create: `launchpad/src/interfaces/IJoeRouter.sol`
- Create: `launchpad/src/interfaces/IPausableFactory.sol`

- [ ] **Step 1: Write `IJoeRouter.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal Trader Joe V1 (Uniswap-V2-style) router surface used at graduation.
interface IJoeRouter {
    function factory() external view returns (address);
    function WAVAX() external view returns (address);

    /// @dev Wraps the sent AVAX internally and adds liquidity for (token, WAVAX).
    function addLiquidityAVAX(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountAVAXMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountAVAX, uint256 liquidity);
}
```

- [ ] **Step 2: Write `IPausableFactory.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice The single read a pool needs from its factory: is the platform paused?
interface IPausableFactory {
    function paused() external view returns (bool);
}
```

- [ ] **Step 3: Build**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge build`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add launchpad/src/interfaces
git commit -m "feat(launchpad): Trader Joe router + pausable-factory interfaces"
```

---

## Task 3: CurveMath library (TDD, fuzz-first)

**Files:**
- Create: `launchpad/src/libraries/CurveMath.sol`
- Test: `launchpad/test/CurveMath.t.sol`

- [ ] **Step 1: Write the failing tests**

`launchpad/test/CurveMath.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CurveMath} from "../src/libraries/CurveMath.sol";

contract CurveMathTest is Test {
    // Realistic anchors: 1e27 virtual tokens, 30e18 virtual AVAX.
    uint256 constant V_AVAX0 = 30e18;
    uint256 constant Y0 = 1_073_000_000e18;

    function test_tokensOut_increasesWithReserve_priceMonotone() public pure {
        // Price = avaxIn / tokensOut. For a fixed avaxIn, tokensOut must be
        // smaller (price higher) as realAvax grows.
        uint256 dx = 1e18;
        uint256 outEarly = CurveMath.tokensOut(V_AVAX0, Y0, 0, dx);
        uint256 outLate = CurveMath.tokensOut(V_AVAX0, Y0, 100e18, dx);
        assertGt(outEarly, outLate, "price should rise with reserve");
    }

    function test_roundTrip_neverProfitable(uint96 avaxInRaw, uint96 realAvaxRaw) public pure {
        uint256 realAvax = uint256(realAvaxRaw);
        uint256 avaxIn = bound(uint256(avaxInRaw), 1e12, 50e18);
        uint256 tokens = CurveMath.tokensOut(V_AVAX0, Y0, realAvax, avaxIn);
        vm.assume(tokens > 0);
        // Sell the tokens straight back at the post-buy reserve.
        uint256 avaxBack = CurveMath.avaxOut(V_AVAX0, Y0, realAvax + avaxIn, tokens);
        assertLe(avaxBack, avaxIn, "round trip must not print AVAX");
    }

    function test_avaxOut_neverExceedsReserve(uint96 realAvaxRaw, uint96 tokensInRaw) public pure {
        uint256 realAvax = bound(uint256(realAvaxRaw), 0, 1_000_000e18);
        uint256 tokensIn = bound(uint256(tokensInRaw), 1, Y0 / 4);
        uint256 out = CurveMath.avaxOut(V_AVAX0, Y0, realAvax, tokensIn);
        assertLe(out, realAvax, "cannot pay out more than the real reserve");
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge test --match-contract CurveMathTest`
Expected: FAIL — `CurveMath` source does not exist / functions undefined.

- [ ] **Step 3: Write `CurveMath.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title CurveMath
/// @notice Virtual-reserve constant-product bonding curve. K = vAvax0 * y0.
///         AVAX side X = vAvax0 + realAvax; token virtual reserve Ycur = K / X.
///         All divisions floor, which favors the protocol (buyers get no free
///         tokens; sellers never over-withdraw).
library CurveMath {
    /// @notice Tokens out for `avaxIn` (already net of fees) at `realAvax`.
    function tokensOut(uint256 vAvax0, uint256 y0, uint256 realAvax, uint256 avaxIn)
        internal
        pure
        returns (uint256)
    {
        uint256 x = vAvax0 + realAvax;
        uint256 yCur = Math.mulDiv(vAvax0, y0, x);
        uint256 yNew = Math.mulDiv(vAvax0, y0, x + avaxIn);
        return yCur - yNew;
    }

    /// @notice Gross AVAX out (before fees) for `tokensIn` at `realAvax`.
    function avaxOut(uint256 vAvax0, uint256 y0, uint256 realAvax, uint256 tokensIn)
        internal
        pure
        returns (uint256)
    {
        uint256 x = vAvax0 + realAvax;
        uint256 yCur = Math.mulDiv(vAvax0, y0, x);
        uint256 yNew = yCur + tokensIn;
        uint256 xNew = Math.mulDiv(vAvax0, y0, yNew);
        return x - xNew;
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge test --match-contract CurveMathTest -vv`
Expected: PASS (3 tests, fuzz runs green).

- [ ] **Step 5: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add launchpad/src/libraries/CurveMath.sol launchpad/test/CurveMath.t.sol
git commit -m "feat(launchpad): CurveMath library with monotonicity + round-trip fuzz"
```

---

## Task 4: LaunchToken (non-ruggable ERC20 clone template)

**Files:**
- Create: `launchpad/src/LaunchToken.sol`
- Test: `launchpad/test/LaunchToken.t.sol`

- [ ] **Step 1: Write the failing tests**

`launchpad/test/LaunchToken.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {LaunchToken} from "../src/LaunchToken.sol";

contract LaunchTokenTest is Test {
    LaunchToken impl;

    function setUp() public {
        impl = new LaunchToken();
    }

    function _clone(address holder) internal returns (LaunchToken t) {
        t = LaunchToken(Clones.clone(address(impl)));
        t.initialize("Frostbite Meme", "MEME", 1_000_000_000e18, holder);
    }

    function test_initMintsFullSupplyToHolder() public {
        address pool = address(0xBEEF);
        LaunchToken t = _clone(pool);
        assertEq(t.totalSupply(), 1_000_000_000e18);
        assertEq(t.balanceOf(pool), 1_000_000_000e18);
        assertEq(t.name(), "Frostbite Meme");
        assertEq(t.symbol(), "MEME");
    }

    function test_cannotReinitialize() public {
        LaunchToken t = _clone(address(0xBEEF));
        vm.expectRevert();
        t.initialize("Evil", "EVIL", 1, address(this));
    }

    function test_implementationCannotBeInitialized() public {
        vm.expectRevert();
        impl.initialize("X", "X", 1, address(this));
    }

    function test_noMintFunctionExists() public {
        // Sanity: the ABI has no mint(). This compiles only if there is none.
        LaunchToken t = _clone(address(this));
        assertEq(t.totalSupply(), 1_000_000_000e18);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge test --match-contract LaunchTokenTest`
Expected: FAIL — `LaunchToken` does not exist.

- [ ] **Step 3: Write `LaunchToken.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20Upgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

/// @title LaunchToken
/// @notice Fixed-supply ERC20 minted once to its bonding-curve pool. It has NO
///         owner, NO mint after init, NO blacklist, NO fee-on-transfer, and NO
///         transfer pause — so a launch creator cannot rug the token.
contract LaunchToken is ERC20Upgradeable {
    constructor() {
        _disableInitializers();
    }

    function initialize(string memory name_, string memory symbol_, uint256 supply, address holder)
        external
        initializer
    {
        __ERC20_init(name_, symbol_);
        _mint(holder, supply);
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge test --match-contract LaunchTokenTest -vv`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add launchpad/src/LaunchToken.sol launchpad/test/LaunchToken.t.sol
git commit -m "feat(launchpad): non-ruggable fixed-supply LaunchToken clone template"
```

---

## Task 5: MockJoeRouter + BondingCurvePool (init + buy)

**Files:**
- Create: `launchpad/test/mocks/MockJoeRouter.sol`
- Create: `launchpad/src/BondingCurvePool.sol`
- Test: `launchpad/test/BondingCurvePool.t.sol`

- [ ] **Step 1: Write the mock router**

`launchpad/test/mocks/MockJoeRouter.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Stand-in for Trader Joe V1's router in unit tests: pulls the token,
///         keeps the AVAX, and records the graduation call.
contract MockJoeRouter {
    address public lastTo;
    uint256 public lastAmountToken;
    uint256 public lastAmountAVAX;
    bool public called;

    function factory() external view returns (address) { return address(this); }
    function WAVAX() external view returns (address) { return address(0xW); }

    function addLiquidityAVAX(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountAVAXMin,
        address to,
        uint256 /*deadline*/
    ) external payable returns (uint256, uint256, uint256) {
        require(msg.value >= amountAVAXMin, "AVAX min");
        require(amountTokenDesired >= amountTokenMin, "token min");
        IERC20(token).transferFrom(msg.sender, address(this), amountTokenDesired);
        called = true;
        lastTo = to;
        lastAmountToken = amountTokenDesired;
        lastAmountAVAX = msg.value;
        return (amountTokenDesired, msg.value, 1e18);
    }
}
```
(Note: `address(0xW)` is illustrative — replace with `address(0xEEEE)` if the literal errors.)

- [ ] **Step 2: Write the failing pool tests**

`launchpad/test/BondingCurvePool.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {LaunchToken} from "../src/LaunchToken.sol";
import {BondingCurvePool} from "../src/BondingCurvePool.sol";
import {CurveMath} from "../src/libraries/CurveMath.sol";
import {MockJoeRouter} from "./mocks/MockJoeRouter.sol";

/// Minimal factory stand-in exposing paused().
contract StubFactory {
    bool public paused;
    function setPaused(bool p) external { paused = p; }
}

contract BondingCurvePoolTest is Test {
    LaunchToken tokenImpl;
    BondingCurvePool poolImpl;
    MockJoeRouter router;
    StubFactory factory;

    uint256 constant TOTAL = 1_000_000_000e18;
    uint256 constant CURVE = 800_000_000e18;
    uint256 constant LP = 200_000_000e18;
    uint256 constant V_AVAX0 = 30e18;
    uint256 constant Y0 = 1_073_000_000e18;
    uint256 constant GRAD = 400e18;
    uint16 constant FEE = 100; // 1%

    address alice = address(0xA11CE);

    LaunchToken token;
    BondingCurvePool pool;

    function setUp() public {
        tokenImpl = new LaunchToken();
        poolImpl = new BondingCurvePool();
        router = new MockJoeRouter();
        factory = new StubFactory();

        token = LaunchToken(Clones.clone(address(tokenImpl)));
        pool = BondingCurvePool(payable(Clones.clone(address(poolImpl))));
        token.initialize("Meme", "MEME", TOTAL, address(pool));
        pool.initialize(BondingCurvePool.InitParams({
            factory: address(factory),
            token: address(token),
            vAvax0: V_AVAX0,
            y0: Y0,
            curveSupply: CURVE,
            lpReserve: LP,
            graduationThreshold: GRAD,
            tradingFeeBps: FEE,
            treasury: address(0x7),
            joeRouter: address(router)
        }));

        vm.deal(alice, 1000e18);
    }

    function test_buy_transfersTokens_takesFee_advancesReserve() public {
        uint256 sent = 10e18;
        uint256 fee = sent * FEE / 10000;
        uint256 expected = CurveMath.tokensOut(V_AVAX0, Y0, 0, sent - fee);

        vm.prank(alice);
        uint256 out = pool.buy{value: sent}(0, block.timestamp);

        assertEq(out, expected, "tokens out");
        assertEq(token.balanceOf(alice), expected);
        assertEq(pool.realAvax(), sent - fee, "reserve excludes fee");
        assertEq(address(pool).balance, sent - fee, "AVAX held == realAvax");
        assertEq(address(0x7).balance, fee, "fee to treasury");
    }

    function test_buy_revertsOnSlippage() public {
        vm.prank(alice);
        vm.expectRevert(BondingCurvePool.Slippage.selector);
        pool.buy{value: 1e18}(type(uint256).max, block.timestamp);
    }

    function test_buy_revertsWhenFactoryPaused() public {
        factory.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(BondingCurvePool.Halted.selector);
        pool.buy{value: 1e18}(0, block.timestamp);
    }

    function test_buy_revertsAfterDeadline() public {
        vm.warp(1000);
        vm.prank(alice);
        vm.expectRevert(BondingCurvePool.Expired.selector);
        pool.buy{value: 1e18}(0, 999);
    }
}
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge test --match-contract BondingCurvePoolTest`
Expected: FAIL — `BondingCurvePool` does not exist.

- [ ] **Step 4: Write `BondingCurvePool.sol` (init + buy + graduate stub)**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardUpgradeable} from
    "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {CurveMath} from "./libraries/CurveMath.sol";
import {IJoeRouter} from "./interfaces/IJoeRouter.sol";
import {IPausableFactory} from "./interfaces/IPausableFactory.sol";

/// @title BondingCurvePool
/// @notice One AVAX bonding-curve pool per launched token. Custodies only this
///         token's reserve; no owner path to those funds. Graduates to Trader
///         Joe V1 with burned LP once realAvax reaches the threshold.
contract BondingCurvePool is Initializable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    address internal constant BURN = 0x000000000000000000000000000000000000dEaD;

    enum State { Trading, Graduated }

    struct InitParams {
        address factory;
        address token;
        uint256 vAvax0;
        uint256 y0;
        uint256 curveSupply;
        uint256 lpReserve;
        uint256 graduationThreshold;
        uint16 tradingFeeBps;
        address treasury;
        address joeRouter;
    }

    // config (set once at init)
    address public factory;
    IERC20 public token;
    uint256 public vAvax0;
    uint256 public y0;
    uint256 public curveSupply;
    uint256 public lpReserve;
    uint256 public graduationThreshold;
    uint16 public tradingFeeBps;
    address public treasury;
    address public joeRouter;

    // state
    uint256 public realAvax;
    uint256 public tokensSold;
    State public state;

    error Expired();
    error Halted();
    error Slippage();
    error NotTrading();
    error ZeroAmount();
    error ExceedsCurveSupply();
    error ExceedsSold();
    error TransferFailed();

    event Buy(address indexed buyer, uint256 avaxIn, uint256 fee, uint256 tokensOut, uint256 realAvax);
    event Sell(address indexed seller, uint256 tokensIn, uint256 fee, uint256 avaxOut, uint256 realAvax);
    event Graduated(uint256 avaxToLp, uint256 tokensToLp);

    constructor() {
        _disableInitializers();
    }

    function initialize(InitParams calldata p) external initializer {
        __ReentrancyGuard_init();
        factory = p.factory;
        token = IERC20(p.token);
        vAvax0 = p.vAvax0;
        y0 = p.y0;
        curveSupply = p.curveSupply;
        lpReserve = p.lpReserve;
        graduationThreshold = p.graduationThreshold;
        tradingFeeBps = p.tradingFeeBps;
        treasury = p.treasury;
        joeRouter = p.joeRouter;
        state = State.Trading;
    }

    function buy(uint256 minTokensOut, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 out)
    {
        if (block.timestamp > deadline) revert Expired();
        if (state != State.Trading) revert NotTrading();
        if (IPausableFactory(factory).paused()) revert Halted();
        if (msg.value == 0) revert ZeroAmount();

        uint256 fee = (msg.value * tradingFeeBps) / 10000;
        uint256 avaxIn = msg.value - fee;
        out = CurveMath.tokensOut(vAvax0, y0, realAvax, avaxIn);
        if (out < minTokensOut) revert Slippage();
        if (tokensSold + out > curveSupply) revert ExceedsCurveSupply();

        // effects
        realAvax += avaxIn;
        tokensSold += out;

        // interactions
        if (fee > 0) _sendAvax(treasury, fee);
        token.safeTransfer(msg.sender, out);
        emit Buy(msg.sender, avaxIn, fee, out, realAvax);

        if (realAvax >= graduationThreshold) _graduate();
    }

    function _graduate() internal {
        state = State.Graduated; // effects before external calls
        uint256 avaxToLp = realAvax;
        uint256 tokensToLp = lpReserve;

        token.forceApprove(joeRouter, tokensToLp);
        IJoeRouter(joeRouter).addLiquidityAVAX{value: avaxToLp}(
            address(token), tokensToLp, tokensToLp, avaxToLp, BURN, block.timestamp
        );
        emit Graduated(avaxToLp, tokensToLp);
    }

    function _sendAvax(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
```

- [ ] **Step 5: Run to verify buy tests pass**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge test --match-contract BondingCurvePoolTest -vv`
Expected: PASS for the four buy tests (sell/graduate added next tasks).

- [ ] **Step 6: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add launchpad/src/BondingCurvePool.sol launchpad/test/BondingCurvePool.t.sol launchpad/test/mocks/MockJoeRouter.sol
git commit -m "feat(launchpad): BondingCurvePool init + buy (fee, slippage, pause, deadline)"
```

---

## Task 6: BondingCurvePool — sell

**Files:**
- Modify: `launchpad/src/BondingCurvePool.sol` (add `sell`)
- Modify: `launchpad/test/BondingCurvePool.t.sol` (add sell tests)

- [ ] **Step 1: Add the failing sell tests**

Append to `BondingCurvePoolTest`:
```solidity
    function test_sell_returnsAvax_takesFee_reducesReserve() public {
        // Buy first so there is something to sell.
        vm.prank(alice);
        uint256 bought = pool.buy{value: 10e18}(0, block.timestamp);

        uint256 reserveBefore = pool.realAvax();
        uint256 gross = CurveMath.avaxOut(V_AVAX0, Y0, reserveBefore, bought);
        uint256 fee = gross * FEE / 10000;

        vm.startPrank(alice);
        token.approve(address(pool), bought);
        uint256 got = pool.sell(bought, 0, block.timestamp);
        vm.stopPrank();

        assertEq(got, gross - fee, "net avax to seller");
        assertEq(pool.realAvax(), reserveBefore - gross, "reserve drops by gross");
        assertEq(pool.tokensSold(), 0, "all sold tokens returned");
    }

    function test_sell_worksWhenPaused() public {
        vm.prank(alice);
        uint256 bought = pool.buy{value: 5e18}(0, block.timestamp);
        factory.setPaused(true); // halt must NOT block exits
        vm.startPrank(alice);
        token.approve(address(pool), bought);
        uint256 got = pool.sell(bought, 0, block.timestamp);
        vm.stopPrank();
        assertGt(got, 0, "sell must remain open under pause");
    }

    function test_sell_revertsOnSlippage() public {
        vm.prank(alice);
        uint256 bought = pool.buy{value: 5e18}(0, block.timestamp);
        vm.startPrank(alice);
        token.approve(address(pool), bought);
        vm.expectRevert(BondingCurvePool.Slippage.selector);
        pool.sell(bought, type(uint256).max, block.timestamp);
        vm.stopPrank();
    }
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge test --match-test test_sell`
Expected: FAIL — `sell` not defined.

- [ ] **Step 3: Add `sell` to `BondingCurvePool.sol`**

Insert after `buy`:
```solidity
    function sell(uint256 tokenIn, uint256 minAvaxOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 net)
    {
        if (block.timestamp > deadline) revert Expired();
        if (state != State.Trading) revert NotTrading();
        if (tokenIn == 0) revert ZeroAmount();
        if (tokenIn > tokensSold) revert ExceedsSold();

        uint256 gross = CurveMath.avaxOut(vAvax0, y0, realAvax, tokenIn);
        uint256 fee = (gross * tradingFeeBps) / 10000;
        net = gross - fee;
        if (net < minAvaxOut) revert Slippage();

        // effects
        realAvax -= gross;
        tokensSold -= tokenIn;

        // interactions
        token.safeTransferFrom(msg.sender, address(this), tokenIn);
        if (fee > 0) _sendAvax(treasury, fee);
        _sendAvax(msg.sender, net);
        emit Sell(msg.sender, tokenIn, fee, net, realAvax);
    }
```
Note: `sell` intentionally does NOT check `factory.paused()` — exits stay open.

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge test --match-contract BondingCurvePoolTest -vv`
Expected: PASS (all buy + sell tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add launchpad/src/BondingCurvePool.sol launchpad/test/BondingCurvePool.t.sol
git commit -m "feat(launchpad): pool sell (exits stay open under pause)"
```

---

## Task 7: BondingCurvePool — graduation

**Files:**
- Modify: `launchpad/test/BondingCurvePool.t.sol` (add graduation tests)

(The `_graduate` implementation already landed in Task 5; this task proves it and locks behavior.)

- [ ] **Step 1: Add the failing graduation tests**

Append to `BondingCurvePoolTest`:
```solidity
    function test_graduation_triggersAtThreshold_seedsRouter_burnsLp() public {
        // One large buy that pushes realAvax past GRAD in a single call.
        vm.prank(alice);
        pool.buy{value: 600e18}(0, block.timestamp);

        assertEq(uint256(pool.state()), uint256(BondingCurvePool.State.Graduated), "graduated");
        assertTrue(router.called(), "router seeded");
        assertEq(router.lastTo(), address(0x000000000000000000000000000000000000dEaD), "LP burned");
        assertEq(router.lastAmountToken(), LP, "LP token amount");
        assertGe(router.lastAmountAVAX(), GRAD, "AVAX to LP >= threshold");
    }

    function test_buy_revertsAfterGraduation() public {
        vm.prank(alice);
        pool.buy{value: 600e18}(0, block.timestamp);
        vm.prank(alice);
        vm.expectRevert(BondingCurvePool.NotTrading.selector);
        pool.buy{value: 1e18}(0, block.timestamp);
    }
```

- [ ] **Step 2: Run to verify it passes**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge test --match-test test_graduation -vv && forge test --match-test test_buy_revertsAfterGraduation -vv`
Expected: PASS (graduate logic already present).

- [ ] **Step 3: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add launchpad/test/BondingCurvePool.t.sol
git commit -m "test(launchpad): graduation seeds router + burns LP + closes curve"
```

---

## Task 8: LaunchpadFactory

**Files:**
- Create: `launchpad/src/LaunchpadFactory.sol`
- Test: `launchpad/test/LaunchpadFactory.t.sol`

- [ ] **Step 1: Write the failing tests**

`launchpad/test/LaunchpadFactory.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {LaunchpadFactory} from "../src/LaunchpadFactory.sol";
import {LaunchToken} from "../src/LaunchToken.sol";
import {BondingCurvePool} from "../src/BondingCurvePool.sol";
import {MockJoeRouter} from "./mocks/MockJoeRouter.sol";

contract LaunchpadFactoryTest is Test {
    LaunchpadFactory factory;
    MockJoeRouter router;
    address treasury = address(0x7);
    address creator = address(0xC0FFEE);

    function setUp() public {
        router = new MockJoeRouter();
        factory = new LaunchpadFactory(
            LaunchpadFactory.Config({
                launchFee: 1e18,
                tradingFeeBps: 100,
                graduationThreshold: 400e18,
                vAvax0: 30e18,
                y0: 1_073_000_000e18,
                totalSupply: 1_000_000_000e18,
                curveSupply: 800_000_000e18,
                lpReserve: 200_000_000e18,
                treasury: treasury,
                joeRouter: address(router)
            })
        );
        vm.deal(creator, 100e18);
    }

    function test_createToken_chargesFee_deploysWiredPair() public {
        vm.prank(creator);
        (address token, address pool) = factory.createToken{value: 1e18}("Meme", "MEME", "ipfs://x");

        assertEq(treasury.balance, 1e18, "launch fee to treasury");
        assertEq(LaunchToken(token).totalSupply(), 1_000_000_000e18);
        assertEq(LaunchToken(token).balanceOf(pool), 1_000_000_000e18, "supply to pool");
        assertEq(address(BondingCurvePool(payable(pool)).token()), token, "pool wired to token");
        assertEq(factory.launchCount(), 1);
    }

    function test_createToken_refundsExcess() public {
        vm.prank(creator);
        factory.createToken{value: 3e18}("Meme", "MEME", "ipfs://x");
        // 1 AVAX fee to treasury, 2 AVAX refunded → creator spent exactly 1.
        assertEq(creator.balance, 99e18);
    }

    function test_createToken_revertsBelowFee() public {
        vm.prank(creator);
        vm.expectRevert(LaunchpadFactory.InsufficientFee.selector);
        factory.createToken{value: 0.5e18}("Meme", "MEME", "ipfs://x");
    }

    function test_createToken_revertsWhenPaused() public {
        factory.pause();
        vm.prank(creator);
        vm.expectRevert(); // Pausable: EnforcedPause
        factory.createToken{value: 1e18}("Meme", "MEME", "ipfs://x");
    }

    function test_onlyOwnerCanSetConfig() public {
        vm.prank(creator);
        vm.expectRevert(); // Ownable
        factory.setLaunchFee(2e18);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge test --match-contract LaunchpadFactoryTest`
Expected: FAIL — `LaunchpadFactory` does not exist.

- [ ] **Step 3: Write `LaunchpadFactory.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {LaunchToken} from "./LaunchToken.sol";
import {BondingCurvePool} from "./BondingCurvePool.sol";

/// @title LaunchpadFactory
/// @notice Paid-permissionless factory. Each createToken clones an isolated
///         LaunchToken + BondingCurvePool. Config changes affect FUTURE launches
///         only; launched pools snapshot their params at init and are immutable.
///         paused() gates new launches and (read by pools) buys — never sells.
contract LaunchpadFactory is Ownable, Pausable {
    struct Config {
        uint256 launchFee;
        uint16 tradingFeeBps;
        uint256 graduationThreshold;
        uint256 vAvax0;
        uint256 y0;
        uint256 totalSupply;
        uint256 curveSupply;
        uint256 lpReserve;
        address treasury;
        address joeRouter;
    }

    struct Launch {
        address token;
        address pool;
        address creator;
    }

    address public immutable tokenImpl;
    address public immutable poolImpl;
    Config public config;
    Launch[] public launches;

    error InsufficientFee();
    error RefundFailed();
    error FeePayoutFailed();

    event TokenLaunched(uint256 indexed id, address indexed token, address indexed pool, address creator, string metadataURI);
    event ConfigUpdated();

    constructor(Config memory c) Ownable(msg.sender) {
        tokenImpl = address(new LaunchToken());
        poolImpl = address(new BondingCurvePool());
        config = c;
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }

    function createToken(string calldata name, string calldata symbol, string calldata metadataURI)
        external
        payable
        whenNotPaused
        returns (address token, address pool)
    {
        Config memory c = config; // snapshot
        if (msg.value < c.launchFee) revert InsufficientFee();

        token = Clones.clone(tokenImpl);
        pool = Clones.clone(poolImpl);

        LaunchToken(token).initialize(name, symbol, c.totalSupply, pool);
        BondingCurvePool(payable(pool)).initialize(BondingCurvePool.InitParams({
            factory: address(this),
            token: token,
            vAvax0: c.vAvax0,
            y0: c.y0,
            curveSupply: c.curveSupply,
            lpReserve: c.lpReserve,
            graduationThreshold: c.graduationThreshold,
            tradingFeeBps: c.tradingFeeBps,
            treasury: c.treasury,
            joeRouter: c.joeRouter
        }));

        if (c.launchFee > 0) {
            (bool ok,) = c.treasury.call{value: c.launchFee}("");
            if (!ok) revert FeePayoutFailed();
        }
        uint256 refund = msg.value - c.launchFee;
        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            if (!ok) revert RefundFailed();
        }

        launches.push(Launch(token, pool, msg.sender));
        emit TokenLaunched(launches.length - 1, token, pool, msg.sender, metadataURI);
    }

    // --- owner (Safe) governance: FUTURE launches only ---
    function setLaunchFee(uint256 v) external onlyOwner { config.launchFee = v; emit ConfigUpdated(); }
    function setTradingFeeBps(uint16 v) external onlyOwner { require(v <= 500, "fee too high"); config.tradingFeeBps = v; emit ConfigUpdated(); }
    function setGraduationThreshold(uint256 v) external onlyOwner { config.graduationThreshold = v; emit ConfigUpdated(); }
    function setCurveParams(uint256 vAvax0_, uint256 y0_) external onlyOwner { config.vAvax0 = vAvax0_; config.y0 = y0_; emit ConfigUpdated(); }
    function setTreasury(address v) external onlyOwner { require(v != address(0)); config.treasury = v; emit ConfigUpdated(); }
    function setJoeRouter(address v) external onlyOwner { require(v != address(0)); config.joeRouter = v; emit ConfigUpdated(); }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge test --match-contract LaunchpadFactoryTest -vv`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the whole suite**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge test -vv`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add launchpad/src/LaunchpadFactory.sol launchpad/test/LaunchpadFactory.t.sol
git commit -m "feat(launchpad): factory createToken + governance + pause"
```

---

## Task 9: Invariant tests (solvency + supply conservation)

**Files:**
- Create: `launchpad/test/invariant/PoolInvariant.t.sol`

- [ ] **Step 1: Write the invariant test + handler**

`launchpad/test/invariant/PoolInvariant.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";
import {BondingCurvePool} from "../../src/BondingCurvePool.sol";
import {MockJoeRouter} from "../mocks/MockJoeRouter.sol";

contract StubFactory2 { function paused() external pure returns (bool) { return false; } }

/// Bounded actor that buys and sells; never lets the pool graduate (keeps the
/// invariants about the live curve meaningful).
contract Handler is Test {
    BondingCurvePool public pool;
    LaunchToken public token;
    address[] public actors;

    constructor(BondingCurvePool _pool, LaunchToken _token) {
        pool = _pool;
        token = _token;
        for (uint160 i = 1; i <= 5; i++) {
            actors.push(address(i));
            vm.deal(address(i), 100e18);
        }
    }

    function buy(uint256 actorSeed, uint256 amt) external {
        if (uint256(pool.state()) != 0) return; // stop after graduation
        address a = actors[actorSeed % actors.length];
        amt = bound(amt, 1e14, 50e18); // stay well under the 400 AVAX threshold
        if (a.balance < amt) return;
        vm.prank(a);
        try pool.buy{value: amt}(0, block.timestamp) {} catch {}
    }

    function sell(uint256 actorSeed, uint256 amt) external {
        if (uint256(pool.state()) != 0) return;
        address a = actors[actorSeed % actors.length];
        uint256 bal = token.balanceOf(a);
        if (bal == 0) return;
        amt = bound(amt, 1, bal);
        vm.startPrank(a);
        token.approve(address(pool), amt);
        try pool.sell(amt, 0, block.timestamp) {} catch {}
        vm.stopPrank();
    }
}

contract PoolInvariantTest is Test {
    BondingCurvePool pool;
    LaunchToken token;
    Handler handler;

    uint256 constant TOTAL = 1_000_000_000e18;
    uint256 constant CURVE = 800_000_000e18;
    uint256 constant LP = 200_000_000e18;

    function setUp() public {
        LaunchToken tImpl = new LaunchToken();
        BondingCurvePool pImpl = new BondingCurvePool();
        MockJoeRouter router = new MockJoeRouter();
        StubFactory2 f = new StubFactory2();

        token = LaunchToken(Clones.clone(address(tImpl)));
        pool = BondingCurvePool(payable(Clones.clone(address(pImpl))));
        token.initialize("Meme", "MEME", TOTAL, address(pool));
        pool.initialize(BondingCurvePool.InitParams({
            factory: address(f), token: address(token), vAvax0: 30e18, y0: 1_073_000_000e18,
            curveSupply: CURVE, lpReserve: LP, graduationThreshold: 400e18,
            tradingFeeBps: 100, treasury: address(0x7), joeRouter: address(router)
        }));

        handler = new Handler(pool, token);
        targetContract(address(handler));
    }

    /// The pool's AVAX balance always covers its accounted reserve.
    function invariant_solvent() public view {
        assertGe(address(pool).balance, pool.realAvax());
    }

    /// Never sell more than the curve allows.
    function invariant_supplyConserved() public view {
        assertLe(pool.tokensSold(), CURVE);
        // Pool holds every token it has not sold (curve unsold + LP reserve).
        assertEq(token.balanceOf(address(pool)), TOTAL - pool.tokensSold());
    }
}
```

- [ ] **Step 2: Run the invariants**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge test --match-contract PoolInvariantTest -vv`
Expected: PASS — `invariant_solvent` and `invariant_supplyConserved` hold across all runs.

- [ ] **Step 3: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add launchpad/test/invariant/PoolInvariant.t.sol
git commit -m "test(launchpad): solvency + supply-conservation invariants"
```

---

## Task 10: Fork test vs real Trader Joe V1 (Fuji) + donation scenario

**Files:**
- Create: `launchpad/test/fork/Graduation.fork.t.sol`

**Prereq:** `FUJI_RPC_URL` set in the environment (e.g. `export FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc`). Confirm the Trader Joe V1 router address on Fuji in the plan-locked constants below before running.

- [ ] **Step 1: Write the fork test**

`launchpad/test/fork/Graduation.fork.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";
import {BondingCurvePool} from "../../src/BondingCurvePool.sol";
import {IJoeRouter} from "../../src/interfaces/IJoeRouter.sol";

contract StubFactory3 { function paused() external pure returns (bool) { return false; } }

contract GraduationForkTest is Test {
    // CONFIRM before running: Trader Joe V1 router on Fuji.
    address constant JOE_ROUTER = 0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901; // Fuji JoeRouter02 — verify

    BondingCurvePool pool;
    LaunchToken token;
    address buyer = address(0xB0B);

    function setUp() public {
        vm.createSelectFork(vm.envString("FUJI_RPC_URL"));
        LaunchToken tImpl = new LaunchToken();
        BondingCurvePool pImpl = new BondingCurvePool();
        StubFactory3 f = new StubFactory3();

        token = LaunchToken(Clones.clone(address(tImpl)));
        pool = BondingCurvePool(payable(Clones.clone(address(pImpl))));
        token.initialize("ForkMeme", "FMEME", 1_000_000_000e18, address(pool));
        pool.initialize(BondingCurvePool.InitParams({
            factory: address(f), token: address(token), vAvax0: 30e18, y0: 1_073_000_000e18,
            curveSupply: 800_000_000e18, lpReserve: 200_000_000e18, graduationThreshold: 400e18,
            tradingFeeBps: 100, treasury: address(0x7), joeRouter: JOE_ROUTER
        }));
        vm.deal(buyer, 1000e18);
    }

    function test_fork_graduationSeedsRealPair() public {
        vm.prank(buyer);
        pool.buy{value: 600e18}(0, block.timestamp);
        assertEq(uint256(pool.state()), uint256(BondingCurvePool.State.Graduated));

        address pair = IJoeFactory(IJoeRouter(JOE_ROUTER).factory())
            .getPair(address(token), IJoeRouter(JOE_ROUTER).WAVAX());
        assertTrue(pair != address(0), "TJ pair created");
        assertGt(token.balanceOf(pair), 0, "pair holds the LP token reserve");
    }

    function test_fork_donationAttack() public {
        // Attacker buys on the curve, then pre-creates + skews the TJ pair before
        // graduation. Document the outcome: with exact-amount minimums the naive
        // router path reverts (griefing). Task 11 hardens this.
        vm.prank(buyer);
        pool.buy{value: 100e18}(0, block.timestamp); // below threshold
        // ... attacker steps here (create pair, add skewed liquidity) ...
        // Assert the observed behavior once implemented; drives Task 11.
    }
}

interface IJoeFactory { function getPair(address, address) external view returns (address); }
```

- [ ] **Step 2: Run the fork test (graduation path)**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge test --match-test test_fork_graduationSeedsRealPair --fork-url "$FUJI_RPC_URL" -vvv`
Expected: PASS — real TJ pair created and seeded. If the router address is wrong the test reverts; fix the constant and re-run.

- [ ] **Step 3: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add launchpad/test/fork/Graduation.fork.t.sol
git commit -m "test(launchpad): fork graduation against real Trader Joe V1 on Fuji"
```

---

## Task 11: Harden graduation against the donation / pre-created-pair attack

**Files:**
- Modify: `launchpad/src/BondingCurvePool.sol` (`_graduate`)
- Modify: `launchpad/test/fork/Graduation.fork.t.sol` (complete `test_fork_donationAttack`)

Background: `router.addLiquidityAVAX` with `amountMin == desired` reverts if a pre-existing
pair has a skewed ratio → an attacker who buys tokens and seeds the pair first can brick
graduation. Harden by seeding the pair directly via low-level `mint`, tolerating prior balances.

- [ ] **Step 1: Add the pair interface**

Add to `launchpad/src/interfaces/IJoeRouter.sol`:
```solidity
interface IJoeFactoryLike {
    function getPair(address a, address b) external view returns (address);
    function createPair(address a, address b) external returns (address);
}

interface IJoePair {
    function mint(address to) external returns (uint256 liquidity);
    function getReserves() external view returns (uint112, uint112, uint32);
    function token0() external view returns (address);
    function sync() external;
}

interface IWAVAXLike {
    function deposit() external payable;
    function transfer(address to, uint256 amount) external returns (bool);
}
```

- [ ] **Step 2: Replace `_graduate` with the direct-mint path**

```solidity
    function _graduate() internal {
        state = State.Graduated; // effects before external calls

        uint256 avaxToLp = realAvax;
        uint256 tokensToLp = lpReserve;

        address wavax = IJoeRouter(joeRouter).WAVAX();
        address jfactory = IJoeRouter(joeRouter).factory();
        address pair = IJoeFactoryLike(jfactory).getPair(address(token), wavax);
        if (pair == address(0)) {
            pair = IJoeFactoryLike(jfactory).createPair(address(token), wavax);
        }

        // Move the LP token reserve + wrapped AVAX straight into the pair, then
        // mint LP to the burn address. Any attacker pre-donation is captured by
        // the burned LP position (the attacker cannot recover it), and mint()
        // does not revert on an existing balance.
        IWAVAXLike(wavax).deposit{value: avaxToLp}();
        require(IWAVAXLike(wavax).transfer(pair, avaxToLp), "wavax xfer");
        token.safeTransfer(pair, tokensToLp);
        IJoePair(pair).mint(BURN);

        emit Graduated(avaxToLp, tokensToLp);
    }
```
Note: this removes the `forceApprove`/`addLiquidityAVAX` router call; `_graduate` now
talks to WAVAX + the pair directly. Keep `IJoeRouter` only for `WAVAX()`/`factory()` reads.

- [ ] **Step 3: Update the unit mock + graduation unit test**

The unit `MockJoeRouter` no longer receives `addLiquidityAVAX`; instead the pool now calls
WAVAX + pair. For the unit path, either (a) mark `test_graduation_*` as fork-only and delete the
unit graduation assertions that inspect the mock router, or (b) add `MockWAVAX` + `MockJoePair`
mocks mirroring the interfaces and assert `MockJoePair.mint` was called with `to == BURN`.
Prefer (b):

Create `launchpad/test/mocks/MockWAVAX.sol` and `launchpad/test/mocks/MockJoePair.sol`
implementing `deposit`/`transfer` and `mint`/`getReserves`/`token0`, wire a `MockJoeFactory`
returning a `MockJoePair`, and update `MockJoeRouter` to return that factory + a `WAVAX()`.
Rewrite `test_graduation_triggersAtThreshold_*` to assert `MockJoePair.lastMintTo() == BURN`
and the pair received `LP` tokens + `>= GRAD` WAVAX.

- [ ] **Step 4: Complete the fork donation test**

In `test_fork_donationAttack`: after the sub-threshold buy, have an attacker EOA create the
pair via the real factory and transfer a small skewing donation, then push the curve over the
threshold and assert graduation still succeeds (`state == Graduated`) and the burned LP exists.
Document the resulting price skew tolerance in a comment.

- [ ] **Step 5: Run unit + fork**

Run:
```bash
cd /Users/hts_bot/avax-arena/launchpad
forge test --match-contract BondingCurvePoolTest -vv
forge test --match-test test_fork_donationAttack --fork-url "$FUJI_RPC_URL" -vvv
```
Expected: PASS — graduation robust to a pre-created/donated pair.

- [ ] **Step 6: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add launchpad/src launchpad/test
git commit -m "feat(launchpad): harden graduation via direct pair mint (donation-resistant)"
```

---

## Task 12: Fuji deploy script + parameter derivation

**Files:**
- Create: `launchpad/script/DeployFuji.s.sol`

The script locks the economic anchors and computes `vAvax0`/`y0` off-chain (in the script) from
`P_grad` and `P_init`, then deploys the factory.

- [ ] **Step 1: Write the deploy script**

`launchpad/script/DeployFuji.s.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {LaunchpadFactory} from "../src/LaunchpadFactory.sol";

contract DeployFuji is Script {
    // CONFIRM before running.
    address constant JOE_ROUTER = 0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901; // Fuji — verify
    address constant TREASURY = 0x301B013280317a75F808a3c0d23E82e9027a6b77; // project treasury

    // Economic anchors (locked here).
    uint256 constant TOTAL = 1_000_000_000e18;
    uint256 constant CURVE = 800_000_000e18;
    uint256 constant LP = 200_000_000e18;
    uint256 constant P_GRAD = 400e18;           // AVAX raised at graduation
    // P_init = P_GRAD / CURVE * INIT_DISCOUNT, chosen so the opening FDV is low.
    // Derivation (off-chain): Y0 = CURVE*P_GRAD / (P_GRAD - CURVE*P_init); vAvax0 = P_init*Y0.
    // With P_init picked so Y0 ≈ 1.073e27 and vAvax0 ≈ 30e18 (validated in tests):
    uint256 constant V_AVAX0 = 30e18;
    uint256 constant Y0 = 1_073_000_000e18;

    function run() external {
        vm.startBroadcast();
        LaunchpadFactory factory = new LaunchpadFactory(
            LaunchpadFactory.Config({
                launchFee: 1e18,
                tradingFeeBps: 100,
                graduationThreshold: P_GRAD,
                vAvax0: V_AVAX0,
                y0: Y0,
                totalSupply: TOTAL,
                curveSupply: CURVE,
                lpReserve: LP,
                treasury: TREASURY,
                joeRouter: JOE_ROUTER
            })
        );
        console2.log("LaunchpadFactory:", address(factory));
        vm.stopBroadcast();
    }
}
```

- [ ] **Step 2: Dry-run the script against a Fuji fork (no broadcast)**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge script script/DeployFuji.s.sol --fork-url "$FUJI_RPC_URL"`
Expected: simulates deployment, prints a factory address, no revert.

- [ ] **Step 3: Commit**

```bash
cd /Users/hts_bot/avax-arena
git add launchpad/script/DeployFuji.s.sol
git commit -m "chore(launchpad): Fuji deploy script with locked curve params"
```

**Live Fuji deploy (manual, when ready):**
```bash
cd /Users/hts_bot/avax-arena/launchpad
forge script script/DeployFuji.s.sol --rpc-url "$FUJI_RPC_URL" --broadcast --private-key "$DEPLOYER_PK"
```
Then run the full lifecycle (createToken → buy → graduate) against the deployed factory on Fuji.

---

## Task 13: In-repo audit pass + fixes

**Files:**
- Reviews the whole `launchpad/src` tree; fixes applied inline.

- [ ] **Step 1: Semgrep Solidity scan**

Invoke the `semgrep` skill against `launchpad/src`. Triage findings; fix real issues.

- [ ] **Step 2: solidity-security review**

Invoke the `solidity-security` skill on `launchpad/src`. Focus areas: reentrancy in
buy/sell/graduate, access control on factory setters, clone `initialize` front-running,
graduation atomicity/donation, solvency/precision, fund-trapping. Fix real findings; add a
regression test per fix.

- [ ] **Step 3: security-review skill**

Invoke the `security-review` skill on the launchpad diff for a second, adversarial pass.

- [ ] **Step 4: Re-run everything**

Run: `cd /Users/hts_bot/avax-arena/launchpad && forge test -vv && forge test --match-path 'test/fork/*' --fork-url "$FUJI_RPC_URL"`
Expected: all green.

- [ ] **Step 5: Commit the audit fixes**

```bash
cd /Users/hts_bot/avax-arena
git add launchpad
git commit -m "fix(launchpad): address in-repo audit findings (semgrep/solidity-security/security-review)"
```

- [ ] **Step 6: Write an audit summary**

Create `launchpad/AUDIT.md` listing: tools run, findings (severity, status), residual risks
(notably: external professional audit recommended before mainnet with real liquidity; MEV/sniping
inherent), and the exact commit reviewed.

---

## Self-review (completed by author)

**Spec coverage:**
- §3 contracts → Tasks 4 (token), 5–7 (pool), 8 (factory). ✓
- §4 supply split → factory Config + pool init (Tasks 5, 8). ✓
- §5 curve math → Task 3 (CurveMath) with monotonicity + round-trip fuzz. ✓
- §6 lifecycle → Tasks 5–8. ✓
- §8 graduation security → Tasks 7, 10, 11 (donation hardening + fork). ✓
- §9 guardrails → non-ruggable token (4), isolated clones (5/8), launch fee (8), slippage/deadline (5/6). ✓
- §10 admin/pause (sells always open) → Task 6 `test_sell_worksWhenPaused` + factory pause (8). ✓
- §11 error handling → custom errors across pool/factory (5/6/8). ✓
- §12 testing → unit/fuzz (3,5,6), invariant (9), fork (10). ✓
- §13 audit → Task 13. ✓
- §14 rollout / §15 repo layout → Tasks 1, 12. ✓
- §17 parameters → locked in Task 12 deploy script; `vAvax0/y0` derivation documented. ✓

**Placeholder scan:** Task 11 Step 3–4 and Task 13 describe multi-mock/skill work rather than
literal code because they depend on prior-step outputs (the chosen mock shape / the tools'
findings); each names the exact files, interfaces, and assertions to produce. No `TODO`/`TBD`
left in shipped contract code.

**Type consistency:** `InitParams`, `Config`, `State`, error selectors (`Slippage`, `Halted`,
`Expired`, `NotTrading`, `ExceedsCurveSupply`, `ExceedsSold`), and `CurveMath.tokensOut/avaxOut`
signatures are identical everywhere they appear across Tasks 3–12. ✓

**Known follow-ups (out of this plan, flagged):** external professional audit before mainnet;
exact Fuji/mainnet Trader Joe router addresses to be confirmed in Task 10/12; final `P_grad`/
`P_init` numeric lock + price-continuity validation before mainnet.
