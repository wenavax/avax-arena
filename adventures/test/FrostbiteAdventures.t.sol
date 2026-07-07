// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {FrostbiteAdventures} from "../src/FrostbiteAdventures.sol";
import {IFrostbiteHeroes} from "../src/interfaces/IFrostbiteHeroes.sol";
import {MockFSB} from "./mocks/MockFSB.sol";
import {MockFrostbiteHeroes} from "./mocks/MockFrostbiteHeroes.sol";

/// Unit tests for FrostbiteAdventures. Owner is the test contract; `resolver`
/// is an authorized settlement address; alice/bob are players.
contract FrostbiteAdventuresTest is Test {
    FrostbiteAdventures adv;
    MockFSB fsb;
    MockFrostbiteHeroes heroes;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address resolver = address(0x5E77);

    uint256 constant POOL_FUND = 1_000_000e18;
    bytes32 constant HASH = keccak256("result");
    uint128 constant RATE0 = 1e17; // zone 0: 0.1 FSB/sec

    function setUp() public {
        vm.warp(1_000_000);
        vm.roll(100);

        fsb = new MockFSB();
        heroes = new MockFrostbiteHeroes();
        adv = new FrostbiteAdventures(
            IERC20(address(fsb)), IFrostbiteHeroes(address(heroes)), address(this), _rates()
        );
        adv.setAuthorized(resolver, true);

        // pre-fund reward pool
        fsb.mint(address(this), POOL_FUND);
        fsb.approve(address(adv), type(uint256).max);
        adv.fundPool(POOL_FUND);

        // players: FSB for level-ups, NFT operator approval for staking
        for (uint256 i = 0; i < 2; i++) {
            address p = i == 0 ? alice : bob;
            fsb.mint(p, 1_000_000e18);
            vm.startPrank(p);
            fsb.approve(address(adv), type(uint256).max);
            heroes.setApprovalForAll(address(adv), true);
            vm.stopPrank();
        }
    }

    // ─────────────────────────────── Helpers ───────────────────────────────

    function _rates() internal pure returns (uint128[6] memory r) {
        r[0] = RATE0;
        r[1] = 2e17;
        r[2] = 3e17;
        r[3] = 4e17;
        r[4] = 5e17;
        r[5] = 6e17;
    }

    function _mintHero(address to, uint16 level, uint8 rarity, uint16 atk, uint16 def, uint16 spd)
        internal
        returns (uint256)
    {
        return heroes.mint(to, 0, rarity, level, atk, def, spd);
    }

    /// level-1 common hero staked into zone 0 by alice
    function _stakeDefault() internal returns (uint256 pid, uint256 tokenId) {
        tokenId = _mintHero(alice, 1, 0, 10, 10, 10);
        vm.prank(alice);
        pid = adv.stake(tokenId, 0);
    }

    // ───────────────────────────── Constructor ─────────────────────────────

    function test_constructor_zoneTableMatchesSource() public view {
        // (ratePerSec, minLevel, minAtk, minDef, minSpd, minWisdom, favoredElement, enabled)
        _assertZone(0, RATE0, 1, 0, 0, 0, 0, 0, true); // Frostpond (fire)
        _assertZone(1, 2e17, 1, 0, 0, 0, 0, 2, true); // Glacier Stream (wind)
        _assertZone(2, 3e17, 1, 0, 0, 0, 0, 4, true); // Frozen Marsh (earth)
        _assertZone(3, 4e17, 10, 5, 0, 0, 5, 3, true); // Rime River (ice)
        _assertZone(4, 5e17, 15, 0, 5, 5, 5, 6, true); // Whitewood Forest (shadow)
        _assertZone(5, 6e17, 20, 5, 5, 5, 5, 5, true); // Great Frostlake (thunder)
    }

    function _zone(uint8 id) internal view returns (FrostbiteAdventures.Zone memory z) {
        (z.ratePerSec, z.minLevel, z.minAtk, z.minDef, z.minSpd, z.minWisdom, z.favoredElement, z.enabled) =
            adv.zones(id);
    }

    function _assertZone(
        uint8 id,
        uint128 rate,
        uint16 minLevel,
        uint16 minAtk,
        uint16 minDef,
        uint16 minSpd,
        uint16 minWisdom,
        uint8 elem,
        bool enabled
    ) internal view {
        FrostbiteAdventures.Zone memory z = _zone(id);
        assertEq(z.ratePerSec, rate, "rate");
        assertEq(z.minLevel, minLevel, "minLevel");
        assertEq(z.minAtk, minAtk, "minAtk");
        assertEq(z.minDef, minDef, "minDef");
        assertEq(z.minSpd, minSpd, "minSpd");
        assertEq(z.minWisdom, minWisdom, "minWisdom");
        assertEq(z.favoredElement, elem, "favoredElement");
        assertEq(z.enabled, enabled, "enabled");
    }

    function test_constructor_revertsZeroFsb() public {
        vm.expectRevert(FrostbiteAdventures.ZeroAddress.selector);
        new FrostbiteAdventures(
            IERC20(address(0)), IFrostbiteHeroes(address(heroes)), address(this), _rates()
        );
    }

    function test_constructor_revertsZeroHeroes() public {
        vm.expectRevert(FrostbiteAdventures.ZeroAddress.selector);
        new FrostbiteAdventures(
            IERC20(address(fsb)), IFrostbiteHeroes(address(0)), address(this), _rates()
        );
    }

    function test_constructor_initialState() public view {
        assertEq(adv.nextPositionId(), 1, "positionIds start at 1");
        assertEq(adv.costUnit(), 1e18);
        assertEq(adv.xpPerLevelUp(), 0);
        assertEq(adv.owner(), address(this));
        assertEq(address(adv.fsb()), address(fsb));
        assertEq(address(adv.heroes()), address(heroes));
    }

    // ──────────────────────────────── stake ────────────────────────────────

    function test_stake_happyPath_custodyAndPosition() public {
        (uint256 pid, uint256 tokenId) = _stakeDefault();

        assertEq(pid, 1, "first positionId is 1");
        assertEq(heroes.ownerOf(tokenId), address(adv), "custodial transfer");
        assertEq(adv.activePositionOf(tokenId), pid);
        assertEq(adv.advLevel(tokenId), 1);

        FrostbiteAdventures.Position memory p = adv.getPosition(pid);
        assertEq(p.player, alice);
        assertEq(p.tokenId, uint32(tokenId));
        assertEq(p.zoneId, 0);
        assertEq(uint8(p.status), uint8(FrostbiteAdventures.PositionStatus.Active));
        assertEq(p.stakedAt, uint64(block.timestamp));
        assertEq(p.lastSettledAt, uint64(block.timestamp));
        assertEq(p.closedAt, 0);
        assertTrue(p.seed != bytes32(0), "seed non-zero");
    }

    function test_stake_emitsStakedWithComputedSeed() public {
        uint256 tokenId = _mintHero(alice, 1, 0, 10, 10, 10);
        uint256 pid = adv.nextPositionId();
        bytes32 seed = keccak256(abi.encodePacked(blockhash(block.number - 1), pid, alice));

        vm.expectEmit(address(adv));
        emit FrostbiteAdventures.Staked(pid, alice, tokenId, 0, seed);
        vm.prank(alice);
        adv.stake(tokenId, 0);
    }

    function test_stake_incrementsPositionIds() public {
        (uint256 pid1,) = _stakeDefault();
        uint256 tokenId2 = _mintHero(alice, 1, 0, 10, 10, 10);
        vm.prank(alice);
        uint256 pid2 = adv.stake(tokenId2, 1);
        assertEq(pid1, 1);
        assertEq(pid2, 2);
        assertEq(adv.nextPositionId(), 3);
    }

    function test_stake_revertsInvalidZone() public {
        uint256 tokenId = _mintHero(alice, 1, 0, 10, 10, 10);
        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.InvalidZone.selector);
        adv.stake(tokenId, 6);
    }

    function test_stake_revertsTokenIdTooLarge() public {
        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.InvalidParam.selector);
        adv.stake(uint256(type(uint32).max) + 1, 0);
    }

    function test_stake_revertsZoneDisabled() public {
        FrostbiteAdventures.Zone memory z = FrostbiteAdventures.Zone({
            ratePerSec: RATE0,
            minLevel: 1,
            minAtk: 0,
            minDef: 0,
            minSpd: 0,
            minWisdom: 0,
            favoredElement: 0,
            enabled: false
        });
        adv.setZone(0, z);

        uint256 tokenId = _mintHero(alice, 1, 0, 10, 10, 10);
        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.ZoneDisabled.selector);
        adv.stake(tokenId, 0);
    }

    function test_stake_revertsAlreadyStaked() public {
        (, uint256 tokenId) = _stakeDefault();
        // AlreadyStaked fires before the ownerOf check, for anyone
        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.AlreadyStaked.selector);
        adv.stake(tokenId, 1);
        vm.prank(bob);
        vm.expectRevert(FrostbiteAdventures.AlreadyStaked.selector);
        adv.stake(tokenId, 1);
    }

    function test_stake_revertsNotHeroController() public {
        uint256 tokenId = _mintHero(alice, 1, 0, 10, 10, 10);
        vm.prank(bob);
        vm.expectRevert(FrostbiteAdventures.NotHeroController.selector);
        adv.stake(tokenId, 0);
    }

    // zone 3: minLevel 10, minAtk 5, minWisdom 5 — isolate each gate

    function test_stake_revertsGateMinLevel() public {
        // level 5 < 10; every other gate would pass (atk 100, wisdom 5*5=25)
        uint256 tokenId = _mintHero(alice, 5, 4, 100, 100, 100);
        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.GateNotMet.selector);
        adv.stake(tokenId, 3);
    }

    function test_stake_revertsGateMinAtk() public {
        // level 10 ok, atk 4 < 5; wisdom 10*5=50 ok
        uint256 tokenId = _mintHero(alice, 10, 4, 4, 100, 100);
        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.GateNotMet.selector);
        adv.stake(tokenId, 3);
    }

    function test_stake_revertsGateMinDef() public {
        // zone 4: minLevel 15, minDef 5, minSpd 5. def 4 < 5 is the only failure
        uint256 tokenId = _mintHero(alice, 15, 4, 100, 4, 100);
        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.GateNotMet.selector);
        adv.stake(tokenId, 4);
    }

    function test_stake_revertsGateMinSpd() public {
        uint256 tokenId = _mintHero(alice, 15, 4, 100, 100, 4);
        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.GateNotMet.selector);
        adv.stake(tokenId, 4);
    }

    function test_stake_revertsGateMinWisdom() public {
        // Default zones can't fail wisdom while passing level (minWisdom <= minLevel
        // and wisdom = lvl*(rarity+1) >= lvl). Configure a wisdom-heavy zone.
        FrostbiteAdventures.Zone memory z = FrostbiteAdventures.Zone({
            ratePerSec: RATE0,
            minLevel: 1,
            minAtk: 0,
            minDef: 0,
            minSpd: 0,
            minWisdom: 1000,
            favoredElement: 0,
            enabled: true
        });
        adv.setZone(0, z);

        // level 10 common: wisdom = 10 * (0+1) = 10 < 1000
        uint256 tokenId = _mintHero(alice, 10, 0, 100, 100, 100);
        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.GateNotMet.selector);
        adv.stake(tokenId, 0);
    }

    function test_stake_wisdomUsesRarityMultiplier() public {
        // same zone gate as above but rarity 4 (legendary): wisdom = 200*(4+1) = 1000 passes
        FrostbiteAdventures.Zone memory z = FrostbiteAdventures.Zone({
            ratePerSec: RATE0,
            minLevel: 1,
            minAtk: 0,
            minDef: 0,
            minSpd: 0,
            minWisdom: 1000,
            favoredElement: 0,
            enabled: true
        });
        adv.setZone(0, z);

        uint256 tokenId = _mintHero(alice, 200, 4, 100, 100, 100);
        vm.prank(alice);
        uint256 pid = adv.stake(tokenId, 0);
        assertEq(adv.activePositionOf(tokenId), pid);
    }

    function test_stake_advLevelInitsFromHeroLevel() public {
        uint256 tokenId = _mintHero(alice, 7, 0, 10, 10, 10);
        vm.prank(alice);
        adv.stake(tokenId, 0);
        assertEq(adv.advLevel(tokenId), 7, "advLevel = hero.level on first touch");
    }

    function test_stake_advLevelInitsToOneForLevelZeroHero() public {
        uint256 tokenId = _mintHero(alice, 0, 0, 10, 10, 10);
        vm.prank(alice);
        adv.stake(tokenId, 0); // zone 0 minLevel 1 — passes because level 0 maps to 1
        assertEq(adv.advLevel(tokenId), 1, "level 0 hero -> advLevel 1");
    }

    function test_stake_advLevelPersistsOverHeroLevel() public {
        // once advLevel is initialized, later hero.level changes are ignored
        uint256 tokenId = _mintHero(alice, 1, 4, 100, 100, 100);
        vm.prank(alice);
        adv.levelUp(tokenId); // first touch: advLevel 1 -> 2
        assertEq(adv.advLevel(tokenId), 2);

        heroes.setLevel(tokenId, 50);
        // zone 3 needs advLevel >= 10; contract-local level 2 gates despite hero.level 50
        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.GateNotMet.selector);
        adv.stake(tokenId, 3);
    }

    // ─────────────────────────────── unstake ───────────────────────────────

    function test_unstake_returnsNftAndClosesPosition() public {
        (uint256 pid, uint256 tokenId) = _stakeDefault();
        vm.warp(block.timestamp + 100);

        vm.expectEmit(address(adv));
        emit FrostbiteAdventures.Unstaked(pid, alice, tokenId, 0);
        vm.prank(alice);
        adv.unstake(pid);

        assertEq(heroes.ownerOf(tokenId), alice, "NFT returned");
        assertEq(adv.activePositionOf(tokenId), 0, "active mapping cleared");
        FrostbiteAdventures.Position memory p = adv.getPosition(pid);
        assertEq(uint8(p.status), uint8(FrostbiteAdventures.PositionStatus.Closed));
        assertEq(p.closedAt, uint64(block.timestamp));
    }

    function test_unstake_revertsNotPositionOwner() public {
        (uint256 pid,) = _stakeDefault();
        vm.prank(bob);
        vm.expectRevert(FrostbiteAdventures.NotPositionOwner.selector);
        adv.unstake(pid);
    }

    function test_unstake_revertsUnknownOrClosed() public {
        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.NotActive.selector);
        adv.unstake(999);

        (uint256 pid,) = _stakeDefault();
        vm.prank(alice);
        adv.unstake(pid);
        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.NotActive.selector);
        adv.unstake(pid); // double-unstake
    }

    function test_unstake_allowsRestake() public {
        (uint256 pid, uint256 tokenId) = _stakeDefault();
        vm.prank(alice);
        adv.unstake(pid);

        vm.prank(alice);
        uint256 pid2 = adv.stake(tokenId, 2);
        assertEq(pid2, 2, "fresh position id");
        assertEq(adv.activePositionOf(tokenId), pid2);
        assertEq(heroes.ownerOf(tokenId), address(adv));
    }

    // ─────────────────────────────── levelUp ───────────────────────────────

    function test_costToNextLevel_exactCurveValues() public view {
        // (25 + 5*L^2) * 1e18
        assertEq(adv.costToNextLevel(1), 30e18, "L1");
        assertEq(adv.costToNextLevel(10), 525e18, "L10");
        assertEq(adv.costToNextLevel(50), 12_525e18, "L50");
        assertEq(adv.emissionCap(1), 90e18, "cap = 3x cost");
        assertEq(adv.emissionCap(10), 1_575e18);
    }

    function test_levelUp_burnsCostToDeadAddress() public {
        uint256 tokenId = _mintHero(alice, 1, 0, 10, 10, 10);
        uint256 aliceBefore = fsb.balanceOf(alice);

        vm.expectEmit(address(adv));
        emit FrostbiteAdventures.AdventureLevelUp(tokenId, 2, 30e18, alice);
        vm.prank(alice);
        adv.levelUp(tokenId);

        assertEq(fsb.balanceOf(adv.BURN()), 30e18, "burn address received cost");
        assertEq(fsb.balanceOf(alice), aliceBefore - 30e18);
        assertEq(adv.advLevel(tokenId), 2);
        assertEq(adv.burnedTotal(), 30e18);
    }

    function test_levelUp_costAtLevel10And50() public {
        uint256 t10 = _mintHero(alice, 10, 0, 10, 10, 10);
        vm.prank(alice);
        adv.levelUp(t10);
        assertEq(fsb.balanceOf(adv.BURN()), 525e18, "L10 cost");
        assertEq(adv.advLevel(t10), 11);

        uint256 t50 = _mintHero(alice, 50, 0, 10, 10, 10);
        vm.prank(alice);
        adv.levelUp(t50);
        assertEq(fsb.balanceOf(adv.BURN()), 525e18 + 12_525e18, "L50 cost added");
        assertEq(adv.advLevel(t50), 51);
    }

    function test_levelUp_initsFromHeroLevelWhenUntouched() public {
        // never staked: first levelUp initializes advLevel from hero level 7
        uint256 tokenId = _mintHero(alice, 7, 0, 10, 10, 10);
        vm.prank(alice);
        adv.levelUp(tokenId);
        assertEq(adv.advLevel(tokenId), 8);
        assertEq(fsb.balanceOf(adv.BURN()), (25 + 5 * 49) * 1e18, "cost at L7");
    }

    function test_levelUp_resetsCapCounter() public {
        (uint256 pid, uint256 tokenId) = _stakeDefault();
        vm.warp(block.timestamp + 1000);
        vm.prank(resolver);
        adv.settle(pid, 50e18, HASH);
        assertEq(adv.settledSinceLevel(tokenId), 50e18);
        assertEq(adv.capRemaining(tokenId), 90e18 - 50e18);

        vm.prank(alice);
        adv.levelUp(tokenId);

        assertEq(adv.settledSinceLevel(tokenId), 0, "cap counter reset");
        assertEq(adv.capRemaining(tokenId), adv.emissionCap(2), "cap now at L2 = 135e18");
        assertEq(adv.emissionCap(2), 135e18);
    }

    function test_levelUp_revertsMaxLevelReached() public {
        uint256 tokenId = _mintHero(alice, 100, 0, 10, 10, 10);
        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.MaxLevelReached.selector);
        adv.levelUp(tokenId);
    }

    function test_levelUp_reaches100ThenReverts() public {
        uint256 tokenId = _mintHero(alice, 99, 0, 10, 10, 10);
        vm.prank(alice);
        adv.levelUp(tokenId); // 99 -> 100
        assertEq(adv.advLevel(tokenId), 100);

        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.MaxLevelReached.selector);
        adv.levelUp(tokenId);
    }

    function test_levelUp_stakedControllerIsStaker() public {
        (, uint256 tokenId) = _stakeDefault();
        // NFT owner is now the contract; only the position player may level up
        vm.prank(bob);
        vm.expectRevert(FrostbiteAdventures.NotHeroController.selector);
        adv.levelUp(tokenId);

        vm.prank(alice);
        adv.levelUp(tokenId);
        assertEq(adv.advLevel(tokenId), 2, "staker levels up while custodied");
    }

    function test_levelUp_unstakedControllerIsErc721Owner() public {
        uint256 tokenId = _mintHero(alice, 1, 0, 10, 10, 10);
        vm.prank(alice);
        heroes.transferFrom(alice, bob, tokenId);

        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.NotHeroController.selector);
        adv.levelUp(tokenId);

        vm.prank(bob);
        adv.levelUp(tokenId);
        assertEq(adv.advLevel(tokenId), 2);
    }

    function test_levelUp_xpBridgeOff_noXpGranted() public {
        // even with the Heroes-side authorization in place, xpPerLevelUp == 0 skips the call
        heroes.setAuthorized(address(adv), true);
        uint256 tokenId = _mintHero(alice, 1, 0, 10, 10, 10);
        vm.prank(alice);
        adv.levelUp(tokenId);
        assertEq(heroes.getHero(tokenId).xp, 0, "no XP without bridge");
    }

    function test_levelUp_xpBridgeOn_grantsXp() public {
        adv.setXpPerLevelUp(500);
        heroes.setAuthorized(address(adv), true);
        uint256 tokenId = _mintHero(alice, 1, 0, 10, 10, 10);
        vm.prank(alice);
        adv.levelUp(tokenId);
        assertEq(heroes.getHero(tokenId).xp, 500, "bridge grants XP");
    }

    function test_levelUp_xpBridgeUnauthorized_stillSucceeds() public {
        // Heroes has NOT authorized the adventures contract: addXp reverts inside
        // try/catch, level-up itself must still succeed
        adv.setXpPerLevelUp(500);
        uint256 tokenId = _mintHero(alice, 1, 0, 10, 10, 10);
        vm.prank(alice);
        adv.levelUp(tokenId);
        assertEq(adv.advLevel(tokenId), 2, "levelUp survives addXp revert");
        assertEq(heroes.getHero(tokenId).xp, 0, "no XP granted");
    }

    // ──────────────────────────── withdrawPayout ───────────────────────────

    function test_withdrawPayout_revertsNoPayout() public {
        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.NoPayout.selector);
        adv.withdrawPayout();
    }

    function test_withdrawPayout_transfersExactAndClears() public {
        (uint256 pid,) = _stakeDefault();
        vm.warp(block.timestamp + 100);
        vm.prank(resolver);
        adv.settle(pid, 5e18, HASH);

        uint256 balBefore = fsb.balanceOf(alice);
        vm.expectEmit(address(adv));
        emit FrostbiteAdventures.PayoutWithdrawn(alice, 5e18);
        vm.prank(alice);
        adv.withdrawPayout();

        assertEq(fsb.balanceOf(alice), balBefore + 5e18, "exact transfer");
        assertEq(adv.pendingPayouts(alice), 0);
        assertEq(adv.totalPending(), 0, "totalPending decremented");

        vm.prank(alice);
        vm.expectRevert(FrostbiteAdventures.NoPayout.selector);
        adv.withdrawPayout(); // drained
    }

    // ──────────────────────────────── settle ───────────────────────────────

    function test_settle_happyPath_accounting() public {
        (uint256 pid, uint256 tokenId) = _stakeDefault();
        vm.warp(block.timestamp + 100); // rate bound = 1e17 * 100 = 10e18

        vm.expectEmit(address(adv));
        emit FrostbiteAdventures.ClaimSettled(pid, alice, 5e18, HASH);
        vm.prank(resolver);
        adv.settle(pid, 5e18, HASH);

        assertEq(adv.poolBalance(), POOL_FUND - 5e18);
        assertEq(adv.totalPending(), 5e18);
        assertEq(adv.pendingPayouts(alice), 5e18);
        assertEq(adv.settledSinceLevel(tokenId), 5e18);
        assertEq(adv.emittedTotal(), 5e18);
        assertEq(adv.getPosition(pid).lastSettledAt, uint64(block.timestamp));
    }

    function test_settle_ownerBypassesAuthorizedList() public {
        (uint256 pid,) = _stakeDefault();
        vm.warp(block.timestamp + 100);
        assertFalse(adv.authorized(address(this)), "owner not in authorized map");
        adv.settle(pid, 1e18, HASH); // msg.sender == owner passes onlyAuthorized
        assertEq(adv.pendingPayouts(alice), 1e18);
    }

    function test_settle_revertsNotAuthorized() public {
        (uint256 pid,) = _stakeDefault();
        vm.warp(block.timestamp + 100);
        vm.prank(bob);
        vm.expectRevert(FrostbiteAdventures.NotAuthorized.selector);
        adv.settle(pid, 1e18, HASH);
    }

    function test_settle_revertsUnknownPosition() public {
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.UnknownPosition.selector);
        adv.settle(999, 0, HASH);

        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.UnknownPosition.selector);
        adv.settle(0, 0, HASH); // sentinel id
    }

    function test_settle_revertsNothingToSettleWhenNoElapsed() public {
        (uint256 pid,) = _stakeDefault();
        // same timestamp as stake: elapsed == 0
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.NothingToSettle.selector);
        adv.settle(pid, 0, HASH);
    }

    function test_settle_revertsRateBoundExceeded() public {
        (uint256 pid,) = _stakeDefault();
        vm.warp(block.timestamp + 100); // bound = 10e18
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.RateBoundExceeded.selector);
        adv.settle(pid, 10e18 + 1, HASH);
    }

    function test_settle_rateBoundExactBoundaryPasses() public {
        (uint256 pid,) = _stakeDefault();
        vm.warp(block.timestamp + 100);
        vm.prank(resolver);
        adv.settle(pid, 10e18, HASH); // amount == ratePerSec * elapsed
        assertEq(adv.pendingPayouts(alice), 10e18);
    }

    function test_settle_revertsCapExceeded() public {
        (uint256 pid,) = _stakeDefault();
        vm.warp(block.timestamp + 1000); // rate bound 100e18 > cap(L1) = 90e18
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.CapExceeded.selector);
        adv.settle(pid, 90e18 + 1, HASH);
    }

    function test_settle_cumulativeCapEnforcedAcrossSettles() public {
        (uint256 pid, uint256 tokenId) = _stakeDefault();
        vm.warp(block.timestamp + 600);
        vm.prank(resolver);
        adv.settle(pid, 50e18, HASH);

        vm.warp(block.timestamp + 600);
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.CapExceeded.selector);
        adv.settle(pid, 45e18, HASH); // 50 + 45 = 95e18 > 90e18

        // == cap exactly passes
        vm.prank(resolver);
        adv.settle(pid, 40e18, HASH);
        assertEq(adv.settledSinceLevel(tokenId), 90e18);
        assertEq(adv.capRemaining(tokenId), 0);
    }

    function test_settle_revertsPoolInsufficient() public {
        (uint256 pid,) = _stakeDefault();
        adv.sweepUnallocated(POOL_FUND - 1e18, address(this)); // leave 1e18 in pool
        vm.warp(block.timestamp + 1000);
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.PoolInsufficient.selector);
        adv.settle(pid, 5e18, HASH); // within rate bound + cap, above pool
    }

    function test_settle_zeroAmountAdvancesCheckpointOnly() public {
        (uint256 pid, uint256 tokenId) = _stakeDefault();
        vm.warp(block.timestamp + 100);

        vm.expectEmit(address(adv));
        emit FrostbiteAdventures.ClaimSettled(pid, alice, 0, HASH);
        vm.prank(resolver);
        adv.settle(pid, 0, HASH);

        assertEq(adv.getPosition(pid).lastSettledAt, uint64(block.timestamp), "checkpoint moved");
        assertEq(adv.poolBalance(), POOL_FUND, "pool untouched");
        assertEq(adv.totalPending(), 0);
        assertEq(adv.pendingPayouts(alice), 0);
        assertEq(adv.settledSinceLevel(tokenId), 0);
        assertEq(adv.emittedTotal(), 0);

        // and the span was consumed
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.NothingToSettle.selector);
        adv.settle(pid, 0, HASH);
    }

    function test_settle_closedPositionWithinGrace() public {
        (uint256 pid,) = _stakeDefault();
        uint256 stakedAt = block.timestamp;
        vm.warp(stakedAt + 100);
        vm.prank(alice);
        adv.unstake(pid);
        uint64 closedAt = adv.getPosition(pid).closedAt;

        vm.warp(block.timestamp + 3 days); // inside grace
        vm.prank(resolver);
        adv.settle(pid, 10e18, HASH); // elapsed = closedAt - stakedAt = 100s, bound 10e18

        assertEq(adv.pendingPayouts(alice), 10e18);
        assertEq(adv.getPosition(pid).lastSettledAt, closedAt, "tEnd clamped to closedAt");
    }

    function test_settle_closedPositionAtGraceBoundaryPasses() public {
        (uint256 pid,) = _stakeDefault();
        vm.warp(block.timestamp + 100);
        vm.prank(alice);
        adv.unstake(pid);
        uint64 closedAt = adv.getPosition(pid).closedAt;

        vm.warp(uint256(closedAt) + 7 days); // == closedAt + SETTLE_GRACE: still open
        vm.prank(resolver);
        adv.settle(pid, 1e18, HASH);
        assertEq(adv.pendingPayouts(alice), 1e18);
    }

    function test_settle_revertsSettleWindowClosedAfterGrace() public {
        (uint256 pid,) = _stakeDefault();
        vm.warp(block.timestamp + 100);
        vm.prank(alice);
        adv.unstake(pid);
        uint64 closedAt = adv.getPosition(pid).closedAt;

        vm.warp(uint256(closedAt) + 7 days + 1);
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.SettleWindowClosed.selector);
        adv.settle(pid, 1e18, HASH);
    }

    function test_settle_closedPositionSecondSettleNothingToSettle() public {
        (uint256 pid,) = _stakeDefault();
        vm.warp(block.timestamp + 100);
        vm.prank(alice);
        adv.unstake(pid);

        vm.prank(resolver);
        adv.settle(pid, 5e18, HASH); // settles up to closedAt

        vm.warp(block.timestamp + 1 days); // still in grace, but elapsed == 0
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.NothingToSettle.selector);
        adv.settle(pid, 0, HASH);
    }

    // ────────────────────────────── settleBatch ────────────────────────────

    function test_settleBatch_revertsLengthMismatch() public {
        uint256[] memory ids = new uint256[](2);
        uint256[] memory amts = new uint256[](1);
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.LengthMismatch.selector);
        adv.settleBatch(ids, amts, HASH);
    }

    function test_settleBatch_revertsNotAuthorized() public {
        uint256[] memory ids = new uint256[](1);
        uint256[] memory amts = new uint256[](1);
        vm.prank(bob);
        vm.expectRevert(FrostbiteAdventures.NotAuthorized.selector);
        adv.settleBatch(ids, amts, HASH);
    }

    function test_settleBatch_settlesMultiplePositions() public {
        (uint256 pid1, uint256 token1) = _stakeDefault();
        uint256 token2 = _mintHero(bob, 1, 0, 10, 10, 10);
        vm.prank(bob);
        uint256 pid2 = adv.stake(token2, 0);

        vm.warp(block.timestamp + 100);
        uint256[] memory ids = new uint256[](2);
        uint256[] memory amts = new uint256[](2);
        ids[0] = pid1;
        ids[1] = pid2;
        amts[0] = 3e18;
        amts[1] = 4e18;

        vm.prank(resolver);
        adv.settleBatch(ids, amts, HASH);

        assertEq(adv.pendingPayouts(alice), 3e18);
        assertEq(adv.pendingPayouts(bob), 4e18);
        assertEq(adv.settledSinceLevel(token1), 3e18);
        assertEq(adv.settledSinceLevel(token2), 4e18);
        assertEq(adv.poolBalance(), POOL_FUND - 7e18);
        assertEq(adv.totalPending(), 7e18);
        assertEq(adv.getPosition(pid1).lastSettledAt, uint64(block.timestamp));
        assertEq(adv.getPosition(pid2).lastSettledAt, uint64(block.timestamp));
    }

    // ──────────────────────────────── pool ─────────────────────────────────

    function test_fundPool_revertsZeroAmount() public {
        vm.expectRevert(FrostbiteAdventures.InvalidParam.selector);
        adv.fundPool(0);
    }

    function test_fundPool_anyoneCanFund_accountingAndEvent() public {
        vm.expectEmit(address(adv));
        emit FrostbiteAdventures.PoolFunded(bob, 100e18);
        vm.prank(bob);
        adv.fundPool(100e18);

        assertEq(adv.poolBalance(), POOL_FUND + 100e18);
        assertEq(fsb.balanceOf(address(adv)), POOL_FUND + 100e18);
    }

    function test_sweepUnallocated_revertsNotOwner() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        adv.sweepUnallocated(1e18, bob);
    }

    function test_sweepUnallocated_revertsZeroAddress() public {
        vm.expectRevert(FrostbiteAdventures.ZeroAddress.selector);
        adv.sweepUnallocated(1e18, address(0));
    }

    function test_sweepUnallocated_revertsAbovePool() public {
        vm.expectRevert(FrostbiteAdventures.PoolInsufficient.selector);
        adv.sweepUnallocated(POOL_FUND + 1, address(this));
    }

    function test_sweepUnallocated_transfersAndDecrements() public {
        vm.expectEmit(address(adv));
        emit FrostbiteAdventures.PoolSwept(bob, 100e18);
        adv.sweepUnallocated(100e18, bob);

        assertEq(adv.poolBalance(), POOL_FUND - 100e18);
        assertEq(fsb.balanceOf(bob), 1_000_000e18 + 100e18);
    }

    function test_sweepUnallocated_cannotTouchPendingPayouts() public {
        (uint256 pid,) = _stakeDefault();
        vm.warp(block.timestamp + 100);
        vm.prank(resolver);
        adv.settle(pid, 5e18, HASH);

        // full pool sweep is bounded by poolBalance, which excludes the 5e18 owed
        vm.expectRevert(FrostbiteAdventures.PoolInsufficient.selector);
        adv.sweepUnallocated(POOL_FUND - 5e18 + 1, address(this));

        adv.sweepUnallocated(POOL_FUND - 5e18, address(this));
        assertEq(adv.poolBalance(), 0);

        // owed payout still withdrawable afterwards
        vm.prank(alice);
        adv.withdrawPayout();
        assertEq(adv.totalPending(), 0);
    }

    function test_sweepExcess_revertsNotOwner() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        adv.sweepExcess(bob);
    }

    function test_sweepExcess_revertsZeroAddress() public {
        vm.expectRevert(FrostbiteAdventures.ZeroAddress.selector);
        adv.sweepExcess(address(0));
    }

    function test_sweepExcess_revertsNothingToSweep() public {
        // balance == poolBalance + totalPending exactly
        vm.expectRevert(FrostbiteAdventures.NothingToSweep.selector);
        adv.sweepExcess(address(this));
    }

    function test_sweepExcess_transfersOnlyExcess() public {
        // credit a payout so accounted = poolBalance + totalPending is non-trivial
        (uint256 pid,) = _stakeDefault();
        vm.warp(block.timestamp + 100);
        vm.prank(resolver);
        adv.settle(pid, 5e18, HASH);

        fsb.mint(address(adv), 42e18); // stray FSB outside fundPool

        vm.expectEmit(address(adv));
        emit FrostbiteAdventures.ExcessSwept(bob, 42e18);
        adv.sweepExcess(bob);

        assertEq(fsb.balanceOf(bob), 1_000_000e18 + 42e18, "exactly the stray amount");
        assertEq(adv.poolBalance(), POOL_FUND - 5e18, "pool accounting untouched");
        assertEq(adv.totalPending(), 5e18, "pending accounting untouched");
    }

    // ──────────────────────────────── admin ────────────────────────────────

    function test_setAuthorized_revertsNotOwner() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        adv.setAuthorized(bob, true);
    }

    function test_setAuthorized_revertsZeroAddress() public {
        vm.expectRevert(FrostbiteAdventures.ZeroAddress.selector);
        adv.setAuthorized(address(0), true);
    }

    function test_setAuthorized_grantsRevokesAndEmits() public {
        vm.expectEmit(address(adv));
        emit FrostbiteAdventures.AuthorizedChanged(bob, true);
        adv.setAuthorized(bob, true);
        assertTrue(adv.authorized(bob));

        vm.expectEmit(address(adv));
        emit FrostbiteAdventures.AuthorizedChanged(resolver, false);
        adv.setAuthorized(resolver, false);
        assertFalse(adv.authorized(resolver));

        // revoked resolver can no longer settle
        (uint256 pid,) = _stakeDefault();
        vm.warp(block.timestamp + 100);
        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.NotAuthorized.selector);
        adv.settle(pid, 1e18, HASH);
    }

    function test_setZone_revertsNotOwner() public {
        FrostbiteAdventures.Zone memory z = _basicZone();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        adv.setZone(0, z);
    }

    function test_setZone_revertsInvalidZone() public {
        vm.expectRevert(FrostbiteAdventures.InvalidZone.selector);
        adv.setZone(6, _basicZone());
    }

    function test_setZone_revertsInvalidElement() public {
        FrostbiteAdventures.Zone memory z = _basicZone();
        z.favoredElement = 8; // valid range is 0..7
        vm.expectRevert(FrostbiteAdventures.InvalidParam.selector);
        adv.setZone(0, z);
    }

    function test_setZone_updatesAndEmits() public {
        FrostbiteAdventures.Zone memory z = FrostbiteAdventures.Zone({
            ratePerSec: 9e17,
            minLevel: 42,
            minAtk: 1,
            minDef: 2,
            minSpd: 3,
            minWisdom: 4,
            favoredElement: 7,
            enabled: false
        });
        vm.expectEmit(address(adv));
        emit FrostbiteAdventures.ZoneChanged(2);
        adv.setZone(2, z);
        _assertZone(2, 9e17, 42, 1, 2, 3, 4, 7, false);
    }

    function test_setCostUnit_revertsNotOwner() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        adv.setCostUnit(2e18);
    }

    function test_setCostUnit_revertsZero() public {
        vm.expectRevert(FrostbiteAdventures.InvalidParam.selector);
        adv.setCostUnit(0);
    }

    function test_setCostUnit_rescalesCurves() public {
        vm.expectEmit(address(adv));
        emit FrostbiteAdventures.CostUnitChanged(2e18);
        adv.setCostUnit(2e18);
        assertEq(adv.costUnit(), 2e18);
        assertEq(adv.costToNextLevel(1), 60e18, "cost doubled");
        assertEq(adv.emissionCap(1), 180e18, "cap doubled");
    }

    function test_setXpPerLevelUp_revertsNotOwner() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        adv.setXpPerLevelUp(1);
    }

    function test_setXpPerLevelUp_revertsAboveMax() public {
        vm.expectRevert(FrostbiteAdventures.InvalidParam.selector);
        adv.setXpPerLevelUp(1001); // MAX_XP_PER_LEVELUP = 1000
    }

    function test_setXpPerLevelUp_setsAndEmits() public {
        vm.expectEmit(address(adv));
        emit FrostbiteAdventures.XpPerLevelUpChanged(1000);
        adv.setXpPerLevelUp(1000); // boundary accepted
        assertEq(adv.xpPerLevelUp(), 1000);
    }

    function test_pause_revertsNotOwner() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        adv.pause();

        adv.pause();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        adv.unpause();
    }

    function _basicZone() internal pure returns (FrostbiteAdventures.Zone memory) {
        return FrostbiteAdventures.Zone({
            ratePerSec: RATE0,
            minLevel: 1,
            minAtk: 0,
            minDef: 0,
            minSpd: 0,
            minWisdom: 0,
            favoredElement: 0,
            enabled: true
        });
    }

    // ─────────────────────────────── pausing ───────────────────────────────

    function test_pause_blocksStakeSettleLevelUpBatch() public {
        (uint256 pid, uint256 tokenId) = _stakeDefault();
        uint256 token2 = _mintHero(alice, 1, 0, 10, 10, 10);
        vm.warp(block.timestamp + 100);

        adv.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        adv.stake(token2, 0);

        vm.prank(resolver);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        adv.settle(pid, 1e18, HASH);

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        adv.levelUp(tokenId);

        uint256[] memory ids = new uint256[](1);
        uint256[] memory amts = new uint256[](1);
        ids[0] = pid;
        vm.prank(resolver);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        adv.settleBatch(ids, amts, HASH);
    }

    function test_pause_unstakeAndWithdrawStillWork() public {
        (uint256 pid, uint256 tokenId) = _stakeDefault();
        vm.warp(block.timestamp + 100);
        vm.prank(resolver);
        adv.settle(pid, 5e18, HASH);

        adv.pause();

        vm.prank(alice);
        adv.unstake(pid); // escape hatch: never pausable
        assertEq(heroes.ownerOf(tokenId), alice);

        uint256 balBefore = fsb.balanceOf(alice);
        vm.prank(alice);
        adv.withdrawPayout(); // escape hatch: never pausable
        assertEq(fsb.balanceOf(alice), balBefore + 5e18);
    }

    function test_unpause_restoresOperations() public {
        adv.pause();
        adv.unpause();
        (uint256 pid,) = _stakeDefault();
        vm.warp(block.timestamp + 100);
        vm.prank(resolver);
        adv.settle(pid, 1e18, HASH);
        assertEq(adv.pendingPayouts(alice), 1e18);
    }

    // ──────────────────────────────── views ────────────────────────────────

    function test_canStake_mirrorsStakeGates() public {
        uint256 ok = _mintHero(alice, 1, 0, 10, 10, 10);
        assertTrue(adv.canStake(ok, 0));
        assertFalse(adv.canStake(ok, 6), "invalid zone");
        assertFalse(adv.canStake(ok, 3), "level gate");

        vm.prank(alice);
        adv.stake(ok, 0);
        assertFalse(adv.canStake(ok, 0), "already staked");
    }

    /// canStake wraps getHero in try/catch: nonexistent tokens return false
    /// instead of bubbling ERC721NonexistentToken (frontend-safe).
    function test_canStake_returnsFalseForNonexistentToken() public view {
        assertFalse(adv.canStake(999_999, 0));
    }

    // ──────────────────────────────── fuzz ─────────────────────────────────

    function test_fuzz_settle_withinBoundsSucceeds(uint256 amount, uint256 elapsed) public {
        elapsed = bound(elapsed, 1, 30 days);
        (uint256 pid, uint256 tokenId) = _stakeDefault();
        vm.warp(block.timestamp + elapsed);

        uint256 rateBound = uint256(RATE0) * elapsed;
        uint256 cap = adv.emissionCap(1); // 90e18 (< POOL_FUND, so pool never binds)
        uint256 maxOk = rateBound < cap ? rateBound : cap;
        amount = bound(amount, 0, maxOk);

        vm.prank(resolver);
        adv.settle(pid, amount, HASH);

        assertEq(adv.pendingPayouts(alice), amount);
        assertEq(adv.settledSinceLevel(tokenId), amount);
        assertEq(adv.poolBalance(), POOL_FUND - amount);
        assertEq(adv.totalPending(), amount);
    }

    function test_fuzz_settle_aboveRateBoundReverts(uint256 amount, uint256 elapsed) public {
        elapsed = bound(elapsed, 1, 1000); // keep rate bound below cap region irrelevant
        (uint256 pid,) = _stakeDefault();
        vm.warp(block.timestamp + elapsed);

        uint256 rateBound = uint256(RATE0) * elapsed;
        amount = bound(amount, rateBound + 1, type(uint128).max);

        vm.prank(resolver);
        vm.expectRevert(FrostbiteAdventures.RateBoundExceeded.selector);
        adv.settle(pid, amount, HASH);
    }

    function test_fuzz_levelUp_costMatchesCurve(uint16 level) public {
        level = uint16(bound(level, 1, 99));
        uint256 tokenId = _mintHero(alice, level, 0, 10, 10, 10);

        uint256 expected = (25 + 5 * uint256(level) * uint256(level)) * 1e18;
        vm.prank(alice);
        adv.levelUp(tokenId);

        assertEq(fsb.balanceOf(adv.BURN()), expected, "burned exact curve cost");
        assertEq(adv.advLevel(tokenId), uint32(level) + 1);
        assertEq(adv.settledSinceLevel(tokenId), 0);
    }
}
