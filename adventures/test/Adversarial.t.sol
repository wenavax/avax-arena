// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {FrostbiteAdventures} from "../src/FrostbiteAdventures.sol";
import {IFrostbiteHeroes} from "../src/interfaces/IFrostbiteHeroes.sol";
import {MockFSB} from "./mocks/MockFSB.sol";
import {MockFrostbiteHeroes} from "./mocks/MockFrostbiteHeroes.sol";

/// @dev A contract wallet that deliberately does NOT implement onERC721Received.
///      Any ERC721 safeTransferFrom/safeMint TO this contract reverts with
///      ERC721InvalidReceiver — so if FrostbiteAdventures used safe transfers,
///      unstake() would trap this staker's hero forever. It also proves no
///      receiver callback (i.e. no reentry point) fires during stake/unstake.
contract NoReceiverStaker {
    FrostbiteAdventures internal immutable adv;
    MockFrostbiteHeroes internal immutable heroes;

    constructor(FrostbiteAdventures adv_, MockFrostbiteHeroes heroes_) {
        adv = adv_;
        heroes = heroes_;
    }

    function approveAndStake(uint256 tokenId, uint8 zoneId) external returns (uint256) {
        heroes.approve(address(adv), tokenId);
        return adv.stake(tokenId, zoneId);
    }

    function doUnstake(uint256 positionId) external {
        adv.unstake(positionId);
    }

    function doWithdraw() external {
        adv.withdrawPayout();
    }
}

/// Adversarial test suite for FrostbiteAdventures: leaked resolver key,
/// restake accounting, owner rug attempts on totalPending, reentrancy surface,
/// pause griefing, costUnit governance, and seed uniqueness.
contract AdversarialTest is Test {
    FrostbiteAdventures adv;
    MockFSB fsb;
    MockFrostbiteHeroes heroes;

    uint128 internal constant RATE = 1e17; // 0.1 FSB/sec per zone
    uint256 internal constant POOL = 1_000e18;
    uint256 internal constant CAP_L1 = 90e18; // emissionCap(1) = 3*(25+5)*1e18
    uint256 internal constant COST_L1 = 30e18; // costToNextLevel(1)

    address owner = makeAddr("owner");
    address resolver = makeAddr("resolver"); // treat as LEAKED key in tests below
    address player = makeAddr("player");
    address funder = makeAddr("funder");

    function setUp() public {
        fsb = new MockFSB();
        heroes = new MockFrostbiteHeroes();
        uint128[6] memory rates = [RATE, RATE, RATE, RATE, RATE, RATE];
        adv = new FrostbiteAdventures(IERC20(address(fsb)), IFrostbiteHeroes(address(heroes)), owner, rates);

        vm.prank(owner);
        adv.setAuthorized(resolver, true);

        fsb.mint(funder, POOL);
        vm.startPrank(funder);
        fsb.approve(address(adv), POOL);
        adv.fundPool(POOL);
        vm.stopPrank();

        // Move off the genesis edge so blockhash(block.number - 1) is sane.
        vm.roll(100);
        vm.warp(1_000_000);
    }

    // ─────────────────────────────── Helpers ────────────────────────────────

    function _mintHero(address to) internal returns (uint256 id) {
        id = heroes.mint(to, 0, 0, 1, 10, 10, 10); // level 1 => advLevel 1 on first touch
    }

    function _stake(address who, uint256 tokenId, uint8 zoneId) internal returns (uint256 pid) {
        vm.startPrank(who);
        heroes.approve(address(adv), tokenId);
        pid = adv.stake(tokenId, zoneId);
        vm.stopPrank();
    }

    function _min3(uint256 a, uint256 b, uint256 c) internal pure returns (uint256 m) {
        m = a < b ? a : b;
        m = m < c ? m : c;
    }

    // ─────────────────── (1) Leaked resolver key: drain attempts ─────────────

    function test_leakedResolver_settleAboveRateBound_reverts() public {
        uint256 tokenId = _mintHero(player);
        uint256 pid = _stake(player, tokenId, 0);
        uint256 T = 100;
        vm.warp(block.timestamp + T);

        // Compromised resolver tries 1 wei above the zone-rate bound.
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.RateBoundExceeded.selector);
        adv.settle(pid, uint256(RATE) * T + 1, bytes32(0));

        // Exactly at the bound passes (cap 90e18 > 10e18, pool ample).
        vm.prank(resolver);
        adv.settle(pid, uint256(RATE) * T, bytes32(0));
        assertEq(adv.pendingPayouts(player), uint256(RATE) * T);
    }

    function test_leakedResolver_settleAboveEmissionCap_reverts() public {
        uint256 tokenId = _mintHero(player);
        uint256 pid = _stake(player, tokenId, 0);
        vm.warp(block.timestamp + 2000); // rate bound 200e18 > cap 90e18

        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.CapExceeded.selector);
        adv.settle(pid, CAP_L1 + 1, bytes32(0));

        vm.prank(resolver);
        adv.settle(pid, CAP_L1, bytes32(0)); // cap exactly reachable
        assertEq(adv.settledSinceLevel(tokenId), CAP_L1);

        // Cap is cumulative per level — even 1 more wei is locked out.
        vm.warp(block.timestamp + 1000);
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.CapExceeded.selector);
        adv.settle(pid, 1, bytes32(0));
    }

    function test_leakedResolver_settleAbovePoolBalance_reverts() public {
        // Owner shrinks the pool to 5e18 (below cap and rate bound) so pool binds.
        vm.prank(owner);
        adv.sweepUnallocated(POOL - 5e18, owner);

        uint256 tokenId = _mintHero(player);
        uint256 pid = _stake(player, tokenId, 0);
        vm.warp(block.timestamp + 2000);

        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.PoolInsufficient.selector);
        adv.settle(pid, 5e18 + 1, bytes32(0));

        vm.prank(resolver);
        adv.settle(pid, 5e18, bytes32(0));
        assertEq(adv.poolBalance(), 0);

        // Pool is empty: nothing further is extractable, ever.
        vm.warp(block.timestamp + 1000);
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.PoolInsufficient.selector);
        adv.settle(pid, 1, bytes32(0));
    }

    /// A greedy attacker with the resolver key, settling the max allowed amount
    /// at every step over a total span T, extracts EXACTLY
    /// min(zoneRate*T, emissionCap(advLevel), initialPoolBalance) — never more.
    function testFuzz_leakedResolver_maxExtraction_isMinOfRateCapPool(uint256 T, uint256 steps, uint256 pool)
        public
    {
        T = bound(T, 1, 7 days);
        steps = bound(steps, 1, 8);
        pool = bound(pool, 1e18, POOL);
        if (pool < POOL) {
            vm.prank(owner);
            adv.sweepUnallocated(POOL - pool, owner);
        }

        uint256 tokenId = _mintHero(player);
        uint256 pid = _stake(player, tokenId, 0);
        uint256 start = block.timestamp;
        uint256 last = start;
        uint256 extracted;

        for (uint256 i = 1; i <= steps; i++) {
            uint256 tNow = start + (T * i) / steps;
            vm.warp(tNow);
            if (tNow == last) continue; // elapsed 0 => settle would revert NothingToSettle
            uint256 maxNow = _min3(uint256(RATE) * (tNow - last), adv.capRemaining(tokenId), adv.poolBalance());
            vm.prank(resolver);
            adv.settle(pid, maxNow, bytes32(i)); // amount==0 allowed: checkpoints lastSettledAt
            last = tNow;
            extracted += maxNow;
        }

        uint256 theoreticalMax = _min3(uint256(RATE) * T, adv.emissionCap(1), pool);
        assertEq(extracted, theoreticalMax, "greedy drain == min(rate*T, cap, pool)");
        assertEq(adv.pendingPayouts(player), extracted, "credit lands on the position player");
        assertEq(adv.pendingPayouts(resolver), 0, "resolver cannot self-credit");
        assertEq(adv.poolBalance() + adv.totalPending(), pool, "pool + pending conserved");
    }

    /// Settle -> withdraw -> settle cycling gives no extra headroom: the cap
    /// counter (settledSinceLevel) never decreases on claim; only a levelUp
    /// burn (25+5L^2 shards to 0xdEaD) resets it.
    function test_leakedResolver_settleClaimSettleCycling_cappedUntilLevelUp() public {
        uint256 tokenId = _mintHero(player);
        uint256 pid = _stake(player, tokenId, 0);

        vm.warp(block.timestamp + 450);
        vm.prank(resolver);
        adv.settle(pid, 45e18, bytes32(0));
        vm.prank(player);
        adv.withdrawPayout(); // claim does NOT free cap space

        vm.warp(block.timestamp + 450);
        vm.prank(resolver);
        adv.settle(pid, 45e18, bytes32(0));
        vm.prank(player);
        adv.withdrawPayout();
        assertEq(fsb.balanceOf(player), CAP_L1);
        assertEq(adv.settledSinceLevel(tokenId), CAP_L1);

        vm.warp(block.timestamp + 100);
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.CapExceeded.selector);
        adv.settle(pid, 1, bytes32(0));

        // Zero-amount checkpoint still works on a cap-locked position.
        vm.prank(resolver);
        adv.settle(pid, 0, bytes32(0));

        // Unlocking requires a real burn: player re-invests 30e18 of the 90e18.
        vm.startPrank(player);
        fsb.approve(address(adv), COST_L1);
        adv.levelUp(tokenId);
        vm.stopPrank();
        assertEq(adv.advLevel(tokenId), 2);
        assertEq(adv.settledSinceLevel(tokenId), 0);
        assertEq(fsb.balanceOf(adv.BURN()), COST_L1, "cost burned to dEaD, not recoverable");

        vm.warp(block.timestamp + 100);
        vm.prank(resolver);
        adv.settle(pid, 10e18, bytes32(0)); // fresh headroom under emissionCap(2)=135e18
        assertEq(adv.pendingPayouts(player), 10e18);
    }

    function test_leakedResolver_cannotForgePositions() public {
        vm.startPrank(resolver);
        vm.expectRevert(FrostbiteAdventures.UnknownPosition.selector);
        adv.settle(0, 0, bytes32(0)); // 0 is the "no position" sentinel
        vm.expectRevert(FrostbiteAdventures.UnknownPosition.selector);
        adv.settle(999, 1e18, bytes32(0)); // never-created id
        vm.stopPrank();

        // A forged id poisons the whole batch atomically — no partial credit.
        uint256 tokenId = _mintHero(player);
        uint256 pid = _stake(player, tokenId, 0);
        uint64 stakedAt = adv.getPosition(pid).lastSettledAt;
        vm.warp(block.timestamp + 100);

        uint256[] memory ids = new uint256[](2);
        ids[0] = pid;
        ids[1] = 777;
        uint256[] memory amts = new uint256[](2);
        amts[0] = 5e18;
        amts[1] = 0;
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.UnknownPosition.selector);
        adv.settleBatch(ids, amts, bytes32(0));

        assertEq(adv.pendingPayouts(player), 0, "no partial credit from reverted batch");
        assertEq(adv.getPosition(pid).lastSettledAt, stakedAt, "no partial checkpoint either");
    }

    function test_leakedResolver_cannotRedirectPayout() public {
        uint256 tokenId = _mintHero(player);
        uint256 pid = _stake(player, tokenId, 0);
        vm.warp(block.timestamp + 100);

        // settle() takes no recipient parameter: credit is hard-wired to
        // positions[pid].player. The strongest a leaked key can do is credit
        // the rightful staker.
        vm.prank(resolver);
        adv.settle(pid, 10e18, bytes32(0));
        assertEq(adv.pendingPayouts(player), 10e18);
        assertEq(adv.pendingPayouts(resolver), 0);

        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.NoPayout.selector);
        adv.withdrawPayout();
    }

    /// NOTE (documented trust assumption, not a bug): the rate bound is
    /// per-POSITION at the FULL zone rate — the contract header explicitly
    /// trusts the resolver for "fair split". With N positions staked in one
    /// zone, a leaked resolver key can extract up to N * zoneRate * T,
    /// bounded only by the per-token emission caps and poolBalance.
    /// This test pins that aggregate behavior so any future tightening
    /// (e.g. a global zone budget) shows up as a diff.
    /// The rate bound is per position, but the zone's ALL-TIME budget
    /// (rate integrated over wall-clock since deploy; idle time rolls over)
    /// caps the AGGREGATE a leaked key can extract across any number of
    /// positions. Fresh deployment here so the budget window is controlled
    /// (setUp's instance has ~1M s of rolled-over idle budget by design).
    function test_leakedResolver_multiPosition_aggregateCappedByZoneBudget() public {
        uint128[6] memory rates = [RATE, RATE, RATE, RATE, RATE, RATE];
        FrostbiteAdventures adv2 =
            new FrostbiteAdventures(IERC20(address(fsb)), IFrostbiteHeroes(address(heroes)), owner, rates);
        vm.prank(owner);
        adv2.setAuthorized(resolver, true);
        fsb.mint(funder, POOL);
        vm.startPrank(funder);
        fsb.approve(address(adv2), POOL);
        adv2.fundPool(POOL);
        vm.stopPrank();

        address player2 = makeAddr("player2");
        uint256 tokenA = _mintHero(player);
        uint256 tokenB = _mintHero(player2);
        vm.startPrank(player);
        heroes.approve(address(adv2), tokenA);
        uint256 pidA = adv2.stake(tokenA, 0);
        vm.stopPrank();
        vm.startPrank(player2);
        heroes.approve(address(adv2), tokenB);
        uint256 pidB = adv2.stake(tokenB, 0);
        vm.stopPrank();

        uint256 T = 100;
        vm.warp(block.timestamp + T);

        // Deployed and staked in the same second: budget == rate * T exactly.
        assertEq(adv2.zoneBudgetRemaining(0), uint256(RATE) * T);

        // A takes the full zone budget (== its own per-position bound).
        vm.prank(resolver);
        adv2.settle(pidA, uint256(RATE) * T, bytes32(0));
        assertEq(adv2.zoneBudgetRemaining(0), 0);

        // B passes its per-position rate bound but MUST hit the zone budget —
        // even for a single wei.
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.ZoneBudgetExceeded.selector);
        adv2.settle(pidB, uint256(RATE) * T, bytes32(0));
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.ZoneBudgetExceeded.selector);
        adv2.settle(pidB, 1, bytes32(0));

        // Aggregate extraction == the zone's all-time emission, exactly.
        assertEq(adv2.totalPending(), uint256(RATE) * T);
    }

    // ──────────────── (2) Restake / double-stake accounting ─────────────────

    function test_stake_whileTokenActive_revertsAlreadyStaked() public {
        uint256 tokenId = _mintHero(player);
        _stake(player, tokenId, 0);

        // The original staker cannot open a second position on the same token...
        vm.prank(player);
        vm.expectRevert(FrostbiteAdventures.AlreadyStaked.selector);
        adv.stake(tokenId, 0);

        // ...and neither can anyone else (activePositionOf gates before ownerOf).
        vm.prank(makeAddr("rando"));
        vm.expectRevert(FrostbiteAdventures.AlreadyStaked.selector);
        adv.stake(tokenId, 1);
    }

    function test_restake_afterUnstake_createsFreshPosition() public {
        uint256 tokenId = _mintHero(player);
        uint256 pid1 = _stake(player, tokenId, 0);

        vm.warp(block.timestamp + 100);
        vm.prank(player);
        adv.unstake(pid1);

        vm.warp(block.timestamp + 400);
        uint256 pid2 = _stake(player, tokenId, 0);

        assertEq(pid2, pid1 + 1, "monotonic new position, old id never recycled");
        assertEq(adv.activePositionOf(tokenId), pid2);

        FrostbiteAdventures.Position memory p1 = adv.getPosition(pid1);
        FrostbiteAdventures.Position memory p2 = adv.getPosition(pid2);
        assertEq(uint8(p1.status), uint8(FrostbiteAdventures.PositionStatus.Closed));
        assertEq(uint8(p2.status), uint8(FrostbiteAdventures.PositionStatus.Active));
        assertEq(p2.stakedAt, uint64(block.timestamp), "fresh accrual clock");
        assertEq(p2.lastSettledAt, uint64(block.timestamp), "no time smuggled from the old span");
    }

    /// The old position's rate bound is evaluated to closedAt, NOT to now:
    /// a leaked resolver cannot mine the idle gap between unstake and restake.
    function test_restake_oldPositionRateBound_usesClosedAtNotNow() public {
        uint256 tokenId = _mintHero(player);
        uint256 pid1 = _stake(player, tokenId, 0);

        vm.warp(block.timestamp + 100); // active span: 100s
        vm.prank(player);
        adv.unstake(pid1);

        vm.warp(block.timestamp + 400); // 400s idle gap — must earn nothing
        uint256 pid2 = _stake(player, tokenId, 0);

        uint256 oldMax = uint256(RATE) * 100;
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.RateBoundExceeded.selector);
        adv.settle(pid1, oldMax + 1, bytes32(0)); // 500s-of-rate would pass if tEnd were `now`

        vm.prank(resolver);
        adv.settle(pid1, oldMax, bytes32(0));
        assertEq(adv.pendingPayouts(player), oldMax);

        // Old span is fully drained to closedAt — nothing more, ever.
        vm.warp(block.timestamp + 1);
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.NothingToSettle.selector);
        adv.settle(pid1, 0, bytes32(0));

        // The NEW position accrues from restake time only, and the emission-cap
        // counter is per-TOKEN: restaking does not reset settledSinceLevel.
        vm.warp(block.timestamp + 49); // 50s since restake
        vm.prank(resolver);
        adv.settle(pid2, uint256(RATE) * 50, bytes32(0));
        assertEq(adv.settledSinceLevel(tokenId), uint256(RATE) * 150, "cap counter spans positions");
    }

    function test_closedPosition_settleAtGraceBoundary_succeeds() public {
        uint256 tokenId = _mintHero(player);
        uint256 pid = _stake(player, tokenId, 0);
        vm.warp(block.timestamp + 100);
        vm.prank(player);
        adv.unstake(pid);
        uint64 closedAt = adv.getPosition(pid).closedAt;

        vm.warp(uint256(closedAt) + adv.SETTLE_GRACE()); // exactly at the boundary: still open
        vm.prank(resolver);
        adv.settle(pid, uint256(RATE) * 100, bytes32(0));
        assertEq(adv.pendingPayouts(player), uint256(RATE) * 100);
    }

    function test_closedPosition_settleAfterGrace_reverts() public {
        uint256 tokenId = _mintHero(player);
        uint256 pid = _stake(player, tokenId, 0);
        vm.warp(block.timestamp + 100);
        vm.prank(player);
        adv.unstake(pid);
        uint64 closedAt = adv.getPosition(pid).closedAt;

        vm.warp(uint256(closedAt) + adv.SETTLE_GRACE() + 1);
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.SettleWindowClosed.selector);
        adv.settle(pid, 1, bytes32(0)); // unsettled accrual is forfeited by design
    }

    // ─────────── (3) Owner rug attempts: sweeps vs totalPending ─────────────

    function test_ownerRug_sweepUnallocated_cannotTouchTotalPending() public {
        uint256 tokenId = _mintHero(player);
        uint256 pid = _stake(player, tokenId, 0);
        vm.warp(block.timestamp + 900);
        vm.prank(resolver);
        adv.settle(pid, CAP_L1, bytes32(0)); // 90e18 now owed to player

        uint256 unallocated = POOL - CAP_L1; // 910e18

        // Owner tries to take everything including the owed 90e18 — bounded.
        vm.prank(owner);
        vm.expectRevert(FrostbiteAdventures.PoolInsufficient.selector);
        adv.sweepUnallocated(unallocated + 1, owner);

        // Max legal sweep leaves the contract holding exactly totalPending.
        vm.prank(owner);
        adv.sweepUnallocated(unallocated, owner);
        assertEq(fsb.balanceOf(address(adv)), adv.totalPending());
        assertEq(adv.poolBalance(), 0);

        // Player exit is unaffected by the sweep.
        vm.prank(player);
        adv.withdrawPayout();
        assertEq(fsb.balanceOf(player), CAP_L1);
        assertEq(fsb.balanceOf(address(adv)), 0);
    }

    function test_ownerRug_sweepExcess_takesOnlyDonations() public {
        uint256 tokenId = _mintHero(player);
        uint256 pid = _stake(player, tokenId, 0);
        vm.warp(block.timestamp + 900);
        vm.prank(resolver);
        adv.settle(pid, CAP_L1, bytes32(0));

        // balance == poolBalance + totalPending exactly => nothing to skim.
        vm.prank(owner);
        vm.expectRevert(FrostbiteAdventures.NothingToSweep.selector);
        adv.sweepExcess(owner);

        // Someone donates FSB directly (outside fundPool): only THAT is sweepable.
        fsb.mint(address(adv), 7e18);
        vm.prank(owner);
        adv.sweepExcess(owner);
        assertEq(fsb.balanceOf(owner), 7e18, "sweep bounded to the donation");
        assertEq(adv.poolBalance(), POOL - CAP_L1, "pool accounting untouched");
        assertEq(adv.totalPending(), CAP_L1, "owed payouts untouched");

        vm.prank(player);
        adv.withdrawPayout();
        assertEq(fsb.balanceOf(player), CAP_L1);
    }

    // ───────────────────── (4) Reentrancy surface ────────────────────────────

    /// stake()/unstake() use plain ERC721 transferFrom, so no onERC721Received
    /// callback ever fires: there is no reentry point, and contract wallets
    /// WITHOUT the receiver hook can stake and — critically — unstake. Had the
    /// contract used safeTransferFrom, unstake() would revert with
    /// ERC721InvalidReceiver for such wallets and trap the hero forever.
    function test_contractStakerWithoutHook_stakeUnstakeCompletes() public {
        NoReceiverStaker s = new NoReceiverStaker(adv, heroes);

        // Premise check: this wallet genuinely lacks the hook — safeMint to it reverts.
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, address(s)));
        heroes.mint(address(s), 0, 0, 1, 10, 10, 10);

        // Route a hero in via plain transferFrom (also hook-free).
        uint256 tokenId = _mintHero(player);
        vm.prank(player);
        heroes.transferFrom(player, address(s), tokenId);

        uint256 pid = s.approveAndStake(tokenId, 0);
        assertEq(heroes.ownerOf(tokenId), address(adv), "custodial stake completed, no callback");

        s.doUnstake(pid);
        assertEq(heroes.ownerOf(tokenId), address(s), "unstake returns hero without receiver hook");
    }

    /// withdrawPayout() reentry is impossible: FSB is a plain OZ ERC20 with no
    /// transfer hooks (no ERC777/ERC1363 surface), so the recipient gets no
    /// execution during safeTransfer. Defense in depth on top of that:
    /// CEI (pendingPayouts zeroed BEFORE the transfer) and nonReentrant.
    /// This test exercises the flow from a contract player and pins the
    /// state ordering a reentrant call would have observed.
    function test_withdrawPayout_contractPlayer_noReentrySurface() public {
        NoReceiverStaker s = new NoReceiverStaker(adv, heroes);
        uint256 tokenId = _mintHero(player);
        vm.prank(player);
        heroes.transferFrom(player, address(s), tokenId);
        uint256 pid = s.approveAndStake(tokenId, 0);

        vm.warp(block.timestamp + 100);
        vm.prank(resolver);
        adv.settle(pid, 10e18, bytes32(0));

        s.doWithdraw();
        assertEq(fsb.balanceOf(address(s)), 10e18);
        assertEq(adv.pendingPayouts(address(s)), 0, "zeroed before transfer (CEI)");
        assertEq(adv.totalPending(), 0);

        // A hypothetical reentrant second call would see amount == 0 => NoPayout.
        vm.expectRevert(FrostbiteAdventures.NoPayout.selector);
        s.doWithdraw();
    }

    // ─────────────────────── (5) Pause griefing ─────────────────────────────

    function test_pause_playersCanStillExitFully() public {
        uint256 tokenId = _mintHero(player);
        uint256 pid = _stake(player, tokenId, 0);
        vm.warp(block.timestamp + 100);
        vm.prank(resolver);
        adv.settle(pid, 10e18, bytes32(0));

        vm.prank(owner);
        adv.pause();

        // Entry and emission paths are frozen...
        uint256 tokenId2 = _mintHero(player);
        vm.startPrank(player);
        heroes.approve(address(adv), tokenId2);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        adv.stake(tokenId2, 0);
        vm.stopPrank();

        vm.prank(resolver);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        adv.settle(pid, 1, bytes32(0));

        vm.prank(player);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        adv.levelUp(tokenId);

        // ...but the escape hatches are not: full exit while paused.
        vm.startPrank(player);
        adv.unstake(pid);
        adv.withdrawPayout();
        vm.stopPrank();
        assertEq(heroes.ownerOf(tokenId), player, "hero recovered while paused");
        assertEq(fsb.balanceOf(player), 10e18, "settled payout recovered while paused");
    }

    /// NOTE (griefing edge, documented trust model): the SETTLE_GRACE clock on
    /// closed positions is wall-clock and NOT pause-aware. A pause lasting past
    /// closedAt+7d forfeits the player's UNSETTLED accrual (principal hero and
    /// already-settled payouts remain safe — consistent with the header's
    /// "a dead resolver can only cost unsettled accrual"). This test pins the
    /// current behavior; flagged in findings as a governance/ops footgun.
    function test_pauseLongerThanGrace_forfeitsUnsettledAccrualOnClosedPositions() public {
        uint256 tokenId = _mintHero(player);
        uint256 pid = _stake(player, tokenId, 0);
        vm.warp(block.timestamp + 100);
        vm.prank(player);
        adv.unstake(pid); // 100s of accrual left unsettled
        uint64 closedAt = adv.getPosition(pid).closedAt;

        vm.prank(owner);
        adv.pause();
        vm.warp(uint256(closedAt) + adv.SETTLE_GRACE() + 1); // incident outlives the grace
        vm.prank(owner);
        adv.unpause();

        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.SettleWindowClosed.selector);
        adv.settle(pid, uint256(RATE) * 100, bytes32(0));
    }

    // ─────────────────── (6) costUnit rescale mid-flight ────────────────────

    /// GOVERNANCE IMPLICATION: setCostUnit rescales emissionCap() while
    /// settledSinceLevel keeps its absolute value, so the cap applies
    /// RETROACTIVELY and immediately:
    ///  - lowering costUnit can push existing counters over the new cap,
    ///    freezing emissions on every touched token until a levelUp burn;
    ///  - raising costUnit instantly re-opens headroom that was already fully
    ///    consumed, letting a colluding owner+resolver re-emit against spans
    ///    that had hit the old cap (still bounded by rate*elapsed and pool).
    /// The contract comments say "only sensible at season boundaries"; owner is
    /// a Gnosis Safe on mainnet. Pinned here and flagged in findings.
    function test_costUnitChange_capAppliesRetroactively() public {
        uint256 tokenId = _mintHero(player);
        uint256 pid = _stake(player, tokenId, 0);
        vm.warp(block.timestamp + 900);
        vm.prank(resolver);
        adv.settle(pid, CAP_L1, bytes32(0)); // exactly at the 1e18-unit cap
        assertEq(adv.capRemaining(tokenId), 0);

        // Halve the unit: cap(1) becomes 45e18 < 90e18 already settled => frozen.
        vm.prank(owner);
        adv.setCostUnit(0.5e18);
        assertEq(adv.capRemaining(tokenId), 0, "over-cap clamps to zero");
        vm.warp(block.timestamp + 10);
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.CapExceeded.selector);
        adv.settle(pid, 1, bytes32(0));

        // Double the unit: cap(1) becomes 180e18 => 90e18 of NEW headroom with no burn.
        vm.prank(owner);
        adv.setCostUnit(2e18);
        assertEq(adv.capRemaining(tokenId), 90e18);
        vm.warp(block.timestamp + 900);
        vm.prank(resolver);
        adv.settle(pid, 90e18, bytes32(0)); // immediately settleable under the new cap
        assertEq(adv.settledSinceLevel(tokenId), 180e18);
    }

    // ─────────────────────── (7) Seed uniqueness ────────────────────────────

    /// Two stakes by the same player in the same block share blockhash(n-1) but
    /// differ in positionId, so the resolver RNG roots differ. (The seed is
    /// still fully PREDICTABLE pre-tx — blockhash(n-1) is public — which is
    /// acceptable only because the resolver, not the chain, consumes it.)
    function test_sameBlockStakes_produceDistinctSeeds() public {
        uint256 t1 = _mintHero(player);
        uint256 t2 = _mintHero(player);

        vm.startPrank(player);
        heroes.setApprovalForAll(address(adv), true);
        uint256 pid1 = adv.stake(t1, 0);
        uint256 pid2 = adv.stake(t2, 0); // same block.number, same timestamp
        vm.stopPrank();

        FrostbiteAdventures.Position memory p1 = adv.getPosition(pid1);
        FrostbiteAdventures.Position memory p2 = adv.getPosition(pid2);
        assertTrue(p1.seed != p2.seed, "positionId differentiates same-block seeds");
        assertEq(p1.seed, keccak256(abi.encodePacked(blockhash(block.number - 1), pid1, player)));
        assertEq(p2.seed, keccak256(abi.encodePacked(blockhash(block.number - 1), pid2, player)));
    }
}
