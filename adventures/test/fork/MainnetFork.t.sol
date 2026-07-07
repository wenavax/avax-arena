// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FrostbiteAdventures} from "../../src/FrostbiteAdventures.sol";
import {IFrostbiteHeroes} from "../../src/interfaces/IFrostbiteHeroes.sol";

/// @dev Live-contract surface not covered by IFrostbiteHeroes but needed here:
///      standard ERC-721 approve + the Ownable/authorized admin seam.
interface IHeroesLive {
    function approve(address to, uint256 tokenId) external;
    function owner() external view returns (address);
    function setAuthorized(address addr, bool status) external;
    function authorized(address addr) external view returns (bool);
}

/// @title Avalanche MAINNET fork tests for FrostbiteAdventures
///
/// Forks C-Chain (chainId 43114) and exercises the contract against the REAL
/// FrostbiteHeroes + REAL FSB bytecode/state — no mocks:
///   1. getHero(1) decodes through our IFrostbiteHeroes interface (proves the
///      10-field Hero struct order matches the live ABI, cross-checked against
///      a raw staticcall).
///   2. The real holder of hero #1 stakes it custodially into a tier-1 zone.
///   3. Full lifecycle vs real tokens: fundPool (real FSB transferFrom) ->
///      warp 1h -> settle -> withdrawPayout -> levelUp burn -> cap reset.
///   4. Bonus: the xpPerLevelUp bridge grants XP on the REAL Heroes contract
///      once its owner authorizes our fork-deployed Adventures.
///
/// Suite skips gracefully (vm.skip) when AVALANCHE_RPC_URL / the public RPC is
/// unreachable, so `forge test` stays green offline.
contract MainnetForkTest is Test {
    // ── Live mainnet addresses ──────────────────────────────────────────────
    address constant HEROES_ADDR = 0x8b43A80A8EeBC2bf27EAa934B870AF1742f1e523;
    address constant FSB_ADDR = 0x96D9fB6BD38f1E0D9b1A9a9f763595F928B56214;
    /// @dev FSB deployer — initial 10M FSB minted here; used as the whale.
    address constant FSB_WHALE = 0xC45dcA28FC9FA278b1d229d05ABc3BAa624FfbB8;
    address constant BURN = 0x000000000000000000000000000000000000dEaD;
    string constant DEFAULT_RPC = "https://api.avax.network/ext/bc/C/rpc";

    uint256 constant HERO_ID = 1;
    uint128 constant RATE = 1e16; // 0.01 FSB/sec => 36 FSB/hour rate bound
    uint256 constant FUND = 1_000e18;
    uint256 constant SETTLE_AMT = 9e18; // < rate bound (36e18) and < min cap (90e18)

    IFrostbiteHeroes heroes = IFrostbiteHeroes(HEROES_ADDR);
    IERC20 fsb = IERC20(FSB_ADDR);
    FrostbiteAdventures adv;

    bool forked;
    address holder; // real mainnet owner of hero #1

    function setUp() public {
        string memory url = vm.envOr("AVALANCHE_RPC_URL", string(DEFAULT_RPC));
        try vm.createSelectFork(url) returns (uint256) {
            forked = true;
        } catch {
            forked = false; // offline / RPC unreachable -> every test skips
            return;
        }

        holder = heroes.ownerOf(HERO_ID);
        uint128[6] memory rates = [RATE, RATE, RATE, RATE, RATE, RATE];
        adv = new FrostbiteAdventures(fsb, heroes, address(this), rates);
    }

    modifier onlyFork() {
        if (!forked) vm.skip(true);
        _;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /// @dev Zones 0-2 are tier-1 (minLevel 1, no stat gates) so any live hero
    ///      qualifies; scan anyway per the mirrored canStake() view.
    function _pickTier1Zone() internal view returns (uint8) {
        for (uint8 z = 0; z < 3; z++) {
            if (adv.canStake(HERO_ID, z)) return z;
        }
        revert("no tier-1 zone stakeable for hero #1");
    }

    function _stakeHero1() internal returns (uint256 positionId, uint8 zoneId) {
        zoneId = _pickTier1Zone();
        vm.startPrank(holder);
        IHeroesLive(HEROES_ADDR).approve(address(adv), HERO_ID);
        positionId = adv.stake(HERO_ID, zoneId);
        vm.stopPrank();
    }

    /// @dev Real FSB from the deployer whale when it still holds enough,
    ///      falling back to deal() if mainnet balances have moved.
    function _giveFsb(address to, uint256 amount) internal {
        if (fsb.balanceOf(FSB_WHALE) >= amount) {
            vm.prank(FSB_WHALE);
            fsb.transfer(to, amount);
        } else {
            deal(FSB_ADDR, to, fsb.balanceOf(to) + amount);
        }
    }

    // ── (1) ABI / struct-order proof against live bytecode ──────────────────

    function test_fork_getHero1_decodesValidStructFromLiveBytecode() public onlyFork {
        IFrostbiteHeroes.Hero memory h = heroes.getHero(HERO_ID);

        // Bounds documented on the live contract (element 0-7, rarity 0-4,
        // level 1-69). Garbage from a mis-ordered struct would break these.
        assertLe(h.element, 7, "element in 0..7");
        assertLe(h.rarity, 4, "rarity in 0..4");
        assertGe(h.level, 1, "level >= 1");
        assertLe(h.level, 69, "level <= live MAX_LEVEL");
        // Live levelUp only ever adds +1 to a stat, so current >= base.
        assertGe(h.atk, h.baseAtk, "atk >= baseAtk");
        assertGe(h.def, h.baseDef, "def >= baseDef");
        assertGe(h.spd, h.baseSpd, "spd >= baseSpd");
        assertGt(h.atk, 0, "minted atk nonzero");

        // Raw ABI cross-check: a static 10-field value-type tuple must encode
        // to exactly 320 bytes, and positional decoding must match the
        // interface decoding field-for-field.
        (bool ok, bytes memory ret) =
            HEROES_ADDR.staticcall(abi.encodeWithSignature("getHero(uint256)", HERO_ID));
        assertTrue(ok, "raw getHero call succeeds");
        assertEq(ret.length, 320, "static tuple: 10 words");
        (
            uint8 element,
            uint8 rarity,
            uint16 level,
            uint32 xp,
            uint16 atk,
            uint16 def,
            uint16 spd,
            uint16 baseAtk,
            uint16 baseDef,
            uint16 baseSpd
        ) = abi.decode(ret, (uint8, uint8, uint16, uint32, uint16, uint16, uint16, uint16, uint16, uint16));
        assertEq(element, h.element, "element order");
        assertEq(rarity, h.rarity, "rarity order");
        assertEq(level, h.level, "level order");
        assertEq(xp, h.xp, "xp order");
        assertEq(atk, h.atk, "atk order");
        assertEq(def, h.def, "def order");
        assertEq(spd, h.spd, "spd order");
        assertEq(baseAtk, h.baseAtk, "baseAtk order");
        assertEq(baseDef, h.baseDef, "baseDef order");
        assertEq(baseSpd, h.baseSpd, "baseSpd order");
    }

    // ── (2) Real holder stakes hero #1 custodially ──────────────────────────

    function test_fork_stake_realHolderEscrowsHero1() public onlyFork {
        uint16 liveLevel = heroes.getHero(HERO_ID).level;

        (uint256 pid, uint8 zoneId) = _stakeHero1();

        assertEq(pid, 1, "first position id");
        assertEq(heroes.ownerOf(HERO_ID), address(adv), "hero escrowed in Adventures");
        assertEq(adv.activePositionOf(HERO_ID), pid, "active position indexed");

        FrostbiteAdventures.Position memory p = adv.getPosition(pid);
        assertEq(p.player, holder, "player = real mainnet holder");
        assertEq(uint256(p.tokenId), HERO_ID, "tokenId recorded");
        assertEq(p.zoneId, zoneId, "zoneId recorded");
        assertEq(uint8(p.status), uint8(FrostbiteAdventures.PositionStatus.Active), "active");
        assertEq(p.stakedAt, uint64(block.timestamp), "stakedAt = fork timestamp");
        assertEq(p.lastSettledAt, uint64(block.timestamp), "lastSettledAt initialized");

        // advLevel seeded from the LIVE hero level (max(1, level))
        uint32 expected = liveLevel == 0 ? 1 : uint32(liveLevel);
        assertEq(adv.advLevel(HERO_ID), expected, "advLevel init from live hero level");
    }

    // ── (3) Full lifecycle against real FSB + real Heroes ───────────────────

    function test_fork_fullLifecycle_fundSettleWithdrawLevelUpCapReset() public onlyFork {
        (uint256 pid,) = _stakeHero1();

        // fundPool with REAL FSB via transferFrom
        _giveFsb(address(this), FUND); // route through the test so fundPool's transferFrom is exercised
        fsb.approve(address(adv), FUND);
        adv.fundPool(FUND);
        assertEq(adv.poolBalance(), FUND, "pool funded");
        assertEq(fsb.balanceOf(address(adv)), FUND, "real FSB held by contract");

        // accrue 1 hour, settle as owner (test contract passes onlyAuthorized)
        vm.warp(block.timestamp + 1 hours);
        adv.settle(pid, SETTLE_AMT, keccak256("fork-settle-1"));
        assertEq(adv.poolBalance(), FUND - SETTLE_AMT, "pool debited");
        assertEq(adv.totalPending(), SETTLE_AMT, "pending tracked");
        assertEq(adv.pendingPayouts(holder), SETTLE_AMT, "payout credited to real holder");
        assertEq(adv.settledSinceLevel(HERO_ID), SETTLE_AMT, "cap counter advanced");
        assertEq(adv.emittedTotal(), SETTLE_AMT, "emission counter");

        // withdrawPayout: real FSB lands in the real holder's wallet
        uint256 balBefore = fsb.balanceOf(holder);
        vm.prank(holder);
        adv.withdrawPayout();
        assertEq(fsb.balanceOf(holder) - balBefore, SETTLE_AMT, "real FSB withdrawn");
        assertEq(adv.pendingPayouts(holder), 0, "payout zeroed");
        assertEq(adv.totalPending(), 0, "totalPending zeroed");

        // levelUp: burn real FSB to 0xdEaD, cap counter resets
        uint32 lvl = adv.advLevel(HERO_ID);
        uint256 cost = adv.costToNextLevel(lvl);
        _giveFsb(holder, cost);
        uint256 burnBefore = fsb.balanceOf(BURN);
        vm.startPrank(holder);
        fsb.approve(address(adv), cost);
        adv.levelUp(HERO_ID);
        vm.stopPrank();
        assertEq(adv.advLevel(HERO_ID), lvl + 1, "adventure level up");
        assertEq(fsb.balanceOf(BURN) - burnBefore, cost, "real FSB burned to dEaD");
        assertEq(adv.burnedTotal(), cost, "burn counter");
        assertEq(adv.settledSinceLevel(HERO_ID), 0, "CAP RESET after levelUp");
        assertEq(adv.capRemaining(HERO_ID), adv.emissionCap(lvl + 1), "full cap at new level");

        // cap counter usable again post-reset
        vm.warp(block.timestamp + 1 hours);
        adv.settle(pid, SETTLE_AMT, keccak256("fork-settle-2"));
        assertEq(adv.settledSinceLevel(HERO_ID), SETTLE_AMT, "fresh cap accrual post-reset");

        // unstake returns the hero to the real mainnet holder
        vm.prank(holder);
        adv.unstake(pid);
        assertEq(heroes.ownerOf(HERO_ID), holder, "hero back with real holder");
        assertEq(adv.activePositionOf(HERO_ID), 0, "position index cleared");
    }

    // ── (4) xpPerLevelUp bridge against the REAL Heroes admin seam ──────────

    function test_fork_levelUpXpBridge_grantsXpOnRealHeroesContract() public onlyFork {
        uint32 xpGrant = 250;
        adv.setXpPerLevelUp(xpGrant);

        // Impersonate the live Heroes owner to authorize our fork deployment
        address heroesOwner = IHeroesLive(HEROES_ADDR).owner();
        vm.prank(heroesOwner);
        IHeroesLive(HEROES_ADDR).setAuthorized(address(adv), true);
        assertTrue(IHeroesLive(HEROES_ADDR).authorized(address(adv)), "adventures authorized on live Heroes");

        uint32 xpBefore = heroes.getHero(HERO_ID).xp;
        uint32 lvl = adv.advLevel(HERO_ID); // 0 => _initLevel picks live level inside levelUp
        uint256 cost = adv.costToNextLevel(lvl == 0 ? uint32(heroes.getHero(HERO_ID).level) : lvl);

        _giveFsb(holder, cost);
        vm.startPrank(holder); // unstaked hero: controller = live ownerOf
        fsb.approve(address(adv), cost);
        adv.levelUp(HERO_ID);
        vm.stopPrank();

        // live addXp is a pure `xp += amount` (no auto-level), so exact delta holds
        assertEq(heroes.getHero(HERO_ID).xp, xpBefore + xpGrant, "XP granted on REAL Heroes contract");
    }
}
