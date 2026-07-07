// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {FrostbiteAdventures} from "../../src/FrostbiteAdventures.sol";
import {IFrostbiteHeroes} from "../../src/interfaces/IFrostbiteHeroes.sol";
import {MockFSB} from "../mocks/MockFSB.sol";
import {MockFrostbiteHeroes} from "../mocks/MockFrostbiteHeroes.sol";

/// Bounded actor set that stakes/unstakes heroes, levels up, settles (as the
/// authorized resolver, with amounts deliberately over-bound ~1/3 of the time
/// to exercise RateBoundExceeded / CapExceeded / PoolInsufficient), funds the
/// pool, withdraws payouts, sweeps unallocated pool, and toggles pause.
///
/// The handler NEVER moves FSB into the contract outside fundPool (levelUp
/// burns go to 0xdEaD, sweeps go to SINK), so the EXACT accounting identity
///   fsb.balanceOf(adventures) == poolBalance + totalPending
/// must hold for the whole run, not just the >= lower bound.
contract Handler is Test {
    FrostbiteAdventures public adventures;
    MockFSB public fsb;
    MockFrostbiteHeroes public heroes;

    /// @dev sweepUnallocated destination; never interacts with the system.
    address public constant SINK = address(0x5EEE);

    address[] public actors;
    uint256[] public heroTokens;
    /// @dev original (and only ever) player owner of each hero token
    mapping(uint256 => address) public ownerOfToken;

    uint256[] public allPositionIds;
    mapping(uint256 => bool) public isActivePos;
    /// @dev handler-side count of Active positions (== heroes escrowed)
    uint256 public activeCount;

    // ─── Ghost variables ───
    /// @dev sum of every amount credited through successful settle() calls
    uint256 public ghostSettled;
    /// @dev sum of every levelUp burn cost that succeeded
    uint256 public ghostBurned;

    constructor(FrostbiteAdventures _adventures, MockFSB _fsb, MockFrostbiteHeroes _heroes) {
        adventures = _adventures;
        fsb = _fsb;
        heroes = _heroes;

        for (uint160 i = 1; i <= 5; i++) {
            address a = address(i);
            actors.push(a);
            fsb.mint(a, 1e26); // deep FSB reserves for levelUp burns + pool funding
            vm.startPrank(a);
            fsb.approve(address(adventures), type(uint256).max);
            heroes.setApprovalForAll(address(adventures), true);
            vm.stopPrank();

            // One low hero (lvl 1, rarity 1 — gated out of zones 3-5 until it
            // levels up) and one high hero (lvl 25, rarity 2 — passes all gates).
            uint256 t1 = heroes.mint(a, uint8(i % 7), 1, 1, 10, 10, 10);
            uint256 t2 = heroes.mint(a, uint8((i + 2) % 7), 2, 25, 20, 20, 20);
            heroTokens.push(t1);
            heroTokens.push(t2);
            ownerOfToken[t1] = a;
            ownerOfToken[t2] = a;
        }
    }

    // ─── Length helpers for the invariant contract ───

    function heroTokensLength() external view returns (uint256) {
        return heroTokens.length;
    }

    function actorsLength() external view returns (uint256) {
        return actors.length;
    }

    // ─── Actions ───

    function stakeHero(uint256 heroSeed, uint256 zoneSeed) external {
        uint256 tokenId = heroTokens[heroSeed % heroTokens.length];
        uint8 zoneId = uint8(bound(zoneSeed, 0, 5));
        address a = ownerOfToken[tokenId];
        vm.prank(a);
        try adventures.stake(tokenId, zoneId) returns (uint256 pid) {
            allPositionIds.push(pid);
            isActivePos[pid] = true;
            activeCount++;
        } catch {}
    }

    function unstakeHero(uint256 posSeed) external {
        if (allPositionIds.length == 0) return;
        uint256 pid = allPositionIds[posSeed % allPositionIds.length];
        FrostbiteAdventures.Position memory p = adventures.getPosition(pid);
        vm.prank(p.player);
        try adventures.unstake(pid) {
            isActivePos[pid] = false;
            activeCount--;
        } catch {}
    }

    function levelUpHero(uint256 heroSeed) external {
        uint256 tokenId = heroTokens[heroSeed % heroTokens.length];
        address payer = ownerOfToken[tokenId]; // controller whether staked or not
        uint256 cost = adventures.costToNextLevel(_effLevel(tokenId));
        vm.prank(payer);
        try adventures.levelUp(tokenId) {
            ghostBurned += cost;
        } catch {}
    }

    /// Resolver settlement. Warps up to 12h first so elapsed>0 spans exist,
    /// then picks an amount in [0, 1.5x rateBound + 1 FSB] — the upper half
    /// deliberately violates the on-chain bounds to exercise the reverts.
    function settlePosition(uint256 posSeed, uint256 amountSeed, uint256 warpSeed) external {
        if (allPositionIds.length == 0) return;
        uint256 warpBy = bound(warpSeed, 0, 12 hours);
        if (warpBy != 0) vm.warp(block.timestamp + warpBy);

        uint256 pid = allPositionIds[posSeed % allPositionIds.length];
        FrostbiteAdventures.Position memory p = adventures.getPosition(pid);
        uint64 tEnd =
            p.status == FrostbiteAdventures.PositionStatus.Active ? uint64(block.timestamp) : p.closedAt;
        uint256 elapsed = tEnd > p.lastSettledAt ? tEnd - p.lastSettledAt : 0;
        (uint128 ratePerSec,,,,,,,) = adventures.zones(p.zoneId);
        uint256 rateBound_ = uint256(ratePerSec) * elapsed;

        uint256 amount = bound(amountSeed, 0, rateBound_ + rateBound_ / 2 + 1e18);
        // handler itself is the authorized resolver — no prank
        try adventures.settle(pid, amount, keccak256(abi.encode(pid, amount, block.timestamp))) {
            ghostSettled += amount;
        } catch {}
    }

    function fund(uint256 actorSeed, uint256 amount) external {
        address a = actors[actorSeed % actors.length];
        amount = bound(amount, 1, 2_000e18);
        if (fsb.balanceOf(a) < amount) return;
        vm.prank(a);
        try adventures.fundPool(amount) {} catch {}
    }

    function withdraw(uint256 actorSeed) external {
        address a = actors[actorSeed % actors.length];
        vm.prank(a);
        try adventures.withdrawPayout() {} catch {}
    }

    /// Owner sweep; upper bound exceeds poolBalance sometimes to exercise
    /// PoolInsufficient. Sweeps to SINK so the exact identity keeps holding.
    function sweep(uint256 amountSeed) external {
        uint256 amount = bound(amountSeed, 0, adventures.poolBalance() + 1e18);
        try adventures.sweepUnallocated(amount, SINK) {} catch {}
    }

    function togglePause() external {
        if (adventures.paused()) {
            try adventures.unpause() {} catch {}
        } else {
            try adventures.pause() {} catch {}
        }
    }

    function warpTime(uint256 secsSeed) external {
        vm.warp(block.timestamp + bound(secsSeed, 1 hours, 2 days));
    }

    // ─── Internal ───

    /// @dev Mirrors _initLevel/_levelOrDefault: advLevel, or max(1, hero.level)
    ///      when untouched. Used to predict the exact levelUp burn cost.
    function _effLevel(uint256 tokenId) internal view returns (uint32 lvl) {
        lvl = adventures.advLevel(tokenId);
        if (lvl == 0) {
            MockFrostbiteHeroes.Hero memory h = heroes.getHero(tokenId);
            lvl = h.level == 0 ? 1 : uint32(h.level);
        }
    }
}

contract AdventuresInvariantTest is Test {
    FrostbiteAdventures adventures;
    MockFSB fsb;
    MockFrostbiteHeroes heroes;
    Handler handler;

    address constant BURN = 0x000000000000000000000000000000000000dEaD;

    function setUp() public {
        fsb = new MockFSB();
        heroes = new MockFrostbiteHeroes();
        uint128[6] memory rates =
            [uint128(0.01e18), 0.02e18, 0.03e18, 0.05e18, 0.08e18, 0.12e18];
        adventures = new FrostbiteAdventures(fsb, IFrostbiteHeroes(address(heroes)), address(this), rates);

        handler = new Handler(adventures, fsb, heroes);
        adventures.setAuthorized(address(handler), true);
        // handler also plays owner: pause/unpause + sweepUnallocated
        adventures.transferOwnership(address(handler));

        targetContract(address(handler));
        bytes4[] memory sels = new bytes4[](9);
        sels[0] = Handler.stakeHero.selector;
        sels[1] = Handler.unstakeHero.selector;
        sels[2] = Handler.levelUpHero.selector;
        sels[3] = Handler.settlePosition.selector;
        sels[4] = Handler.fund.selector;
        sels[5] = Handler.withdraw.selector;
        sels[6] = Handler.sweep.selector;
        sels[7] = Handler.togglePause.selector;
        sels[8] = Handler.warpTime.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sels}));
    }

    /// (a) Solvency lower bound: the contract can always cover the unallocated
    ///     pool plus every owed payout.
    function invariant_solvency() public view {
        assertGe(
            fsb.balanceOf(address(adventures)),
            adventures.poolBalance() + adventures.totalPending(),
            "balance < poolBalance + totalPending"
        );
    }

    /// (b) EXACT accounting identity — holds because the handler only moves
    ///     FSB in via fundPool (no direct transfers to the contract).
    function invariant_exactAccounting() public view {
        assertEq(
            fsb.balanceOf(address(adventures)),
            adventures.poolBalance() + adventures.totalPending(),
            "balance != poolBalance + totalPending"
        );
    }

    /// (c) Custody: escrowed hero count equals the number of Active positions.
    function invariant_custodyMatchesActivePositions() public view {
        assertEq(heroes.balanceOf(address(adventures)), handler.activeCount(), "escrow != active positions");
    }

    /// (d) Hoppers cap: for every touched tokenId, cumulative settlement since
    ///     the last level-up never exceeds emissionCap(advLevel).
    function invariant_capNeverExceeded() public view {
        uint256 n = handler.heroTokensLength();
        for (uint256 i = 0; i < n; i++) {
            uint256 tokenId = handler.heroTokens(i);
            uint32 lvl = adventures.advLevel(tokenId);
            if (lvl == 0) lvl = 1; // _levelOrDefault
            assertLe(
                adventures.settledSinceLevel(tokenId), adventures.emissionCap(lvl), "settledSinceLevel > cap"
            );
        }
    }

    /// (e) Guardrail counters match ghost sums, and burns actually landed at
    ///     the dEaD address (FSB has no real burn).
    function invariant_ghostTotals() public view {
        assertEq(adventures.emittedTotal(), handler.ghostSettled(), "emittedTotal != ghost settled sum");
        assertEq(adventures.burnedTotal(), handler.ghostBurned(), "burnedTotal != ghost burn sum");
        assertEq(fsb.balanceOf(BURN), handler.ghostBurned(), "dEaD balance != ghost burn sum");
    }

    /// (f) totalPending is exactly the sum of per-actor pendingPayouts
    ///     (actors are the only possible position players).
    function invariant_totalPendingMatchesSum() public view {
        uint256 sum;
        uint256 n = handler.actorsLength();
        for (uint256 i = 0; i < n; i++) {
            sum += adventures.pendingPayouts(handler.actors(i));
        }
        assertEq(adventures.totalPending(), sum, "totalPending != sum(pendingPayouts)");
    }

    /// Guard against a silently no-op'ing handler (every inner call is wrapped
    /// in try/catch, so the invariants above would pass vacuously if e.g. a
    /// prank ordering bug made every action revert). Drives one deterministic
    /// lifecycle through the handler and asserts the ghost variables move.
    function test_handlerSmoke_actionsMutateState() public {
        handler.fund(0, 1_000e18); // actor 1 funds 1000 FSB
        assertEq(adventures.poolBalance(), 1_000e18, "fund no-op");

        handler.stakeHero(0, 0); // token 1 (lvl-1 hero) into zone 0
        assertEq(handler.activeCount(), 1, "stake no-op");
        assertEq(heroes.ownerOf(1), address(adventures), "hero not escrowed");

        // warp 6h inside settle; zone 0 rate 0.01 FSB/s -> bound 216 FSB;
        // cap at advLevel 1 = 90 FSB; 50 FSB passes all three bounds
        handler.settlePosition(0, 50e18, 6 hours);
        assertEq(handler.ghostSettled(), 50e18, "settle no-op");
        assertEq(adventures.emittedTotal(), 50e18);
        assertEq(adventures.pendingPayouts(address(1)), 50e18);

        handler.withdraw(0);
        assertEq(adventures.totalPending(), 0, "withdraw no-op");

        handler.levelUpHero(0); // lvl 1 -> 2, burns 30 FSB
        assertEq(handler.ghostBurned(), 30e18, "levelUp no-op");
        assertEq(fsb.balanceOf(BURN), 30e18);
        assertEq(adventures.settledSinceLevel(1), 0, "cap counter not reset");

        handler.unstakeHero(0);
        assertEq(handler.activeCount(), 0, "unstake no-op");
        assertEq(heroes.ownerOf(1), address(1), "hero not returned");

        handler.togglePause();
        assertTrue(adventures.paused(), "pause no-op");
        handler.togglePause();
        assertFalse(adventures.paused(), "unpause no-op");

        handler.sweep(100e18);
        assertEq(fsb.balanceOf(handler.SINK()), 100e18, "sweep no-op");

        // exact identity still holds after the full lifecycle
        assertEq(fsb.balanceOf(address(adventures)), adventures.poolBalance() + adventures.totalPending());
    }
}
