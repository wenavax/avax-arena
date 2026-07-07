// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FrostbiteAdventures} from "../src/FrostbiteAdventures.sol";
import {IFrostbiteHeroes} from "../src/interfaces/IFrostbiteHeroes.sol";
import {MockFSB} from "./mocks/MockFSB.sol";
import {MockFrostbiteHeroes} from "./mocks/MockFrostbiteHeroes.sol";

/// Fuzz coverage of the economic curves and the three settlement bounds:
///  - costToNextLevel / emissionCap: monotone in level, exactly linear in
///    costUnit, no overflow anywhere in the supported domain
///    (level <= 100, costUnit <= 1e24).
///  - settle can never credit above ratePerSec * elapsed (revert above the
///    bound, success at exactly the bound).
///  - fund/settle/withdraw sequences preserve the exact accounting identity
///    fsb.balanceOf(adventures) == poolBalance + totalPending.
///  - settledSinceLevel never exceeds emissionCap(advLevel) under fuzzed
///    settle/levelUp sequences.
///  - levelUp burns exactly costToNextLevel to 0xdEaD and never touches
///    pool accounting.
contract CurvesFuzzTest is Test {
    FrostbiteAdventures adv;
    MockFSB fsb;
    MockFrostbiteHeroes heroes;

    address constant BURN = 0x000000000000000000000000000000000000dEaD;
    uint128 constant RATE0 = 1e15; // zone 0 constructor rate (FSB wei/sec)

    address player = address(0xBEEF);
    uint256 tokenId;

    function setUp() public {
        fsb = new MockFSB();
        heroes = new MockFrostbiteHeroes();
        uint128[6] memory rates = [RATE0, RATE0, RATE0, RATE0, RATE0, RATE0];
        adv = new FrostbiteAdventures(
            IERC20(address(fsb)), IFrostbiteHeroes(address(heroes)), address(this), rates
        );

        tokenId = heroes.mint(player, 0, 0, 1, 10, 10, 10);
        vm.prank(player);
        heroes.setApprovalForAll(address(adv), true);

        // this = owner (passes onlyAuthorized) and pool funder
        fsb.approve(address(adv), type(uint256).max);
    }

    // ─────────────────────────────── Helpers ─────────────────────────────────

    function _fund(uint256 amount) internal {
        fsb.mint(address(this), amount);
        adv.fundPool(amount);
    }

    function _stakeZone0() internal returns (uint256 pid) {
        vm.prank(player);
        pid = adv.stake(tokenId, 0);
    }

    function _setZone0Rate(uint128 rate) internal {
        adv.setZone(
            0,
            FrostbiteAdventures.Zone({
                ratePerSec: rate,
                minLevel: 1,
                minAtk: 0,
                minDef: 0,
                minSpd: 0,
                minWisdom: 0,
                favoredElement: 0,
                enabled: true
            })
        );
    }

    function _min3(uint256 a, uint256 b, uint256 c) internal pure returns (uint256 m) {
        m = a < b ? a : b;
        m = m < c ? m : c;
    }

    function _assertIdentity() internal view {
        assertEq(
            fsb.balanceOf(address(adv)),
            adv.poolBalance() + adv.totalPending(),
            "balance != poolBalance + totalPending"
        );
    }

    // ─────────────────────────── (1) Curve shape ─────────────────────────────

    /// costToNextLevel matches the reference P0 formula, strictly increases in
    /// level, is exactly linear in costUnit, and never overflows for
    /// level <= 100 / costUnit <= 1e24.
    function test_fuzz_costToNextLevel_monotonicInLevel_linearInCostUnit(
        uint32 level,
        uint256 u1,
        uint256 u2
    ) public {
        level = uint32(bound(level, 0, 99)); // level+1 covers the full domain up to 100
        u1 = bound(u1, 1, 1e24);
        u2 = bound(u2, 1, 1e24);

        adv.setCostUnit(u1);
        uint256 c1 = adv.costToNextLevel(level);
        uint256 c1Next = adv.costToNextLevel(level + 1);

        // reference formula, computed in unchecked-free 0.8 arithmetic (no overflow)
        assertEq(c1, (25 + 5 * uint256(level) * uint256(level)) * u1, "cost formula");
        assertGt(c1Next, c1, "cost not strictly increasing in level");

        // exact linearity in costUnit: c(u1)/u1 == c(u2)/u2 (cross-multiplied)
        adv.setCostUnit(u2);
        uint256 c2 = adv.costToNextLevel(level);
        assertEq(c1 * u2, c2 * u1, "cost not linear in costUnit");
    }

    /// emissionCap is exactly 3x costToNextLevel, so it inherits monotonicity
    /// and linearity; asserted independently over the full domain.
    function test_fuzz_emissionCap_isTripleCost_monotonic_noOverflow(
        uint32 level,
        uint256 u1,
        uint256 u2
    ) public {
        level = uint32(bound(level, 0, 99));
        u1 = bound(u1, 1, 1e24);
        u2 = bound(u2, 1, 1e24);

        adv.setCostUnit(u1);
        uint256 cap1 = adv.emissionCap(level);
        assertEq(cap1, 3 * adv.costToNextLevel(level), "cap != 3x cost");
        assertEq(cap1, 3 * (25 + 5 * uint256(level) * uint256(level)) * u1, "cap formula");
        assertGt(adv.emissionCap(level + 1), cap1, "cap not strictly increasing in level");

        adv.setCostUnit(u2);
        assertEq(cap1 * u2, adv.emissionCap(level) * u1, "cap not linear in costUnit");
    }

    // ────────────────────────── (2) Rate bound ───────────────────────────────

    /// settle can NEVER credit more than ratePerSec * elapsed: any fuzzed
    /// amount above the bound reverts; exactly the bound succeeds; and a
    /// second settle in the same block has nothing left to credit.
    function test_fuzz_settle_neverCreditsAboveRateBound(uint128 rate, uint64 elapsed, uint256 excess)
        public
    {
        rate = uint128(bound(rate, 1, 1e18));
        elapsed = uint64(bound(elapsed, 1, 365 days));
        excess = bound(excess, 1, 1e30);

        // make the OTHER two bounds non-binding: cap(level 1) = 90e24 and a
        // 4e25 pool both exceed the max possible rate bound (~3.16e25)
        adv.setCostUnit(1e24);
        _setZone0Rate(rate);
        _fund(4e25);

        uint256 pid = _stakeZone0();
        vm.warp(block.timestamp + elapsed);
        uint256 exact = uint256(rate) * uint256(elapsed);

        vm.expectRevert(FrostbiteAdventures.RateBoundExceeded.selector);
        adv.settle(pid, exact + excess, bytes32("over"));

        uint256 poolBefore = adv.poolBalance();
        adv.settle(pid, exact, bytes32("exact"));
        assertEq(adv.pendingPayouts(player), exact, "credited != rate * elapsed");
        assertEq(adv.poolBalance(), poolBefore - exact, "pool not debited");
        assertEq(adv.settledSinceLevel(tokenId), exact, "cap counter mismatch");
        _assertIdentity();

        // the full span is consumed: no double-credit without new elapsed time
        vm.expectRevert(FrostbiteAdventures.NothingToSettle.selector);
        adv.settle(pid, 1, bytes32("again"));
    }

    // ─────────────────────── (3) Accounting identity ─────────────────────────

    /// Fuzzed sequences of fundPool / settle (incl. amount==0 checkpoints) /
    /// withdrawPayout preserve fsb.balanceOf(adventures) == poolBalance +
    /// totalPending after EVERY step (no NFT dust paths involved).
    function test_fuzz_fundSettleWithdraw_identityHolds(uint256 seed) public {
        adv.setCostUnit(1e21); // cap(1) = 90e21 — never cap-locked over this run
        uint256 pid = _stakeZone0();
        _fund(1e21);
        _assertIdentity();

        for (uint256 i = 0; i < 24; i++) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            uint256 action = r % 3;
            if (action == 0) {
                _fund(bound(r >> 8, 1, 1e22));
            } else if (action == 1) {
                vm.warp(block.timestamp + bound(r >> 8, 1, 6 hours));
                uint256 elapsed = block.timestamp - adv.getPosition(pid).lastSettledAt;
                uint256 maxAmt =
                    _min3(uint256(RATE0) * elapsed, adv.capRemaining(tokenId), adv.poolBalance());
                adv.settle(pid, bound(r >> 16, 0, maxAmt), bytes32(r));
            } else {
                if (adv.pendingPayouts(player) > 0) {
                    vm.prank(player);
                    adv.withdrawPayout();
                }
            }
            _assertIdentity();
        }

        // drain any remainder; identity must survive the final withdraw too
        if (adv.pendingPayouts(player) > 0) {
            vm.prank(player);
            adv.withdrawPayout();
        }
        assertEq(adv.totalPending(), adv.pendingPayouts(player), "pending drained");
        _assertIdentity();
    }

    // ──────────────────────── (4) Emission cap ───────────────────────────────

    /// Under fuzzed settle sequences — amounts deliberately overshooting the
    /// cap, interleaved with cap-resetting levelUps — settledSinceLevel never
    /// exceeds emissionCap(advLevel).
    function test_fuzz_settledSinceLevel_neverExceedsCap(uint256 seed) public {
        uint256 pid = _stakeZone0();
        _fund(1e30); // pool bound never binding
        _setZone0Rate(1e18); // rate bound rarely binding: cap is the live constraint
        fsb.mint(player, 1e27);
        vm.prank(player);
        fsb.approve(address(adv), type(uint256).max);

        for (uint256 i = 0; i < 24; i++) {
            uint256 r = uint256(keccak256(abi.encode(seed, i, "cap")));
            vm.warp(block.timestamp + bound(r, 1, 1 days));

            uint256 cap = adv.emissionCap(adv.advLevel(tokenId));
            // up to 2x cap: overshooting attempts must revert (CapExceeded or
            // RateBoundExceeded) and are swallowed; in-bound ones credit
            uint256 amt = bound(r >> 32, 0, 2 * cap + 1);
            try adv.settle(pid, amt, bytes32(r)) {} catch {}

            if (r % 5 == 0) {
                vm.prank(player);
                adv.levelUp(tokenId);
                assertEq(adv.settledSinceLevel(tokenId), 0, "levelUp must reset cap counter");
            }

            assertLe(
                adv.settledSinceLevel(tokenId),
                adv.emissionCap(adv.advLevel(tokenId)),
                "settledSinceLevel exceeded emissionCap"
            );
        }
        _assertIdentity();
    }

    // ───────────────────────── (5) levelUp burn ──────────────────────────────

    /// levelUp moves exactly costToNextLevel(level) from the payer to 0xdEaD
    /// and never touches poolBalance / totalPending / the contract's FSB.
    function test_fuzz_levelUp_burnsExactCost_poolUntouched(uint16 heroLevel, uint256 unit) public {
        heroLevel = uint16(bound(heroLevel, 1, 99)); // levelUp requires advLevel < 100
        unit = bound(unit, 1, 1e24);
        adv.setCostUnit(unit);
        heroes.setLevel(tokenId, heroLevel); // advLevel inits from hero level on stake

        // build non-trivial pool state (poolBalance AND totalPending > 0) so
        // "untouched" is a meaningful assertion
        _fund(5e20);
        uint256 pid = _stakeZone0();
        assertEq(adv.advLevel(tokenId), uint32(heroLevel), "advLevel init from hero level");
        vm.warp(block.timestamp + 1000);
        uint256 settleAmt =
            _min3(uint256(RATE0) * 1000, adv.capRemaining(tokenId), adv.poolBalance());
        adv.settle(pid, settleAmt, bytes32("pre"));
        assertGt(adv.totalPending(), 0, "need pending payouts before levelUp");

        uint256 cost = adv.costToNextLevel(uint32(heroLevel));
        assertEq(cost, (25 + 5 * uint256(heroLevel) * uint256(heroLevel)) * unit);
        fsb.mint(player, cost);
        vm.prank(player);
        fsb.approve(address(adv), cost);

        uint256 burnBefore = fsb.balanceOf(BURN);
        uint256 playerBefore = fsb.balanceOf(player);
        uint256 poolBefore = adv.poolBalance();
        uint256 pendingBefore = adv.totalPending();
        uint256 advBalBefore = fsb.balanceOf(address(adv));

        vm.prank(player); // staker is the controller while escrowed
        adv.levelUp(tokenId);

        assertEq(fsb.balanceOf(BURN) - burnBefore, cost, "burn != exact cost");
        assertEq(playerBefore - fsb.balanceOf(player), cost, "payer != exact cost");
        assertEq(adv.poolBalance(), poolBefore, "poolBalance touched");
        assertEq(adv.totalPending(), pendingBefore, "totalPending touched");
        assertEq(fsb.balanceOf(address(adv)), advBalBefore, "contract FSB touched");
        assertEq(adv.burnedTotal(), cost, "burnedTotal mismatch");
        assertEq(adv.advLevel(tokenId), uint32(heroLevel) + 1, "level not incremented");
        assertEq(adv.settledSinceLevel(tokenId), 0, "cap counter not reset");
        _assertIdentity();
    }
}
