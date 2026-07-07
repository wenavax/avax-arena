// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IFrostbiteHeroes} from "./interfaces/IFrostbiteHeroes.sol";

/// @title FrostbiteAdventures — idle NFT staking for FrostbiteHeroes (Hoppers-style)
///
/// Trust model (Phase 1, mirrors docs/EXPEDITIONS_PHASE1.md):
///  - Players stake Heroes custodially into frozen-biome zones. Accrual is computed
///    OFF-CHAIN by an authorized resolver from on-chain events + timestamps, then
///    settled here. The resolver is trusted for LIVENESS and FAIR SPLIT only —
///    it can never exceed three on-chain bounds per settle:
///      (1) amount <= zone.ratePerSec * elapsed          (a position can never earn
///          more than the WHOLE zone pool over its span)
///      (2) settledSinceLevel + amount <= emissionCap()  (Hoppers cap: 3x next-level
///          cost, cumulative per adventure-level; resets ONLY on levelUp burn)
///      (3) amount <= poolBalance                        (pre-funded pool; this
///          contract has NO mint path — FSB.mintReward is locked to other contracts)
///  - FSB has no burn()/burnFrom(): burns are transfers to 0x...dEaD. They reduce
///    circulating supply, not totalSupply().
///  - Escape hatches: unstake() and withdrawPayout() are NEVER pausable and never
///    depend on the resolver. A dead resolver can only cost unsettled accrual
///    (settle window on closed positions: SETTLE_GRACE).
///  - Adventure level (advLevel) is contract-local progression, deliberately
///    separate from FrostbiteHeroes.level (P0 engine treats them separately too;
///    escrowed heroes cannot call Heroes.levelUp anyway). Optional bridge:
///    xpPerLevelUp > 0 grants Heroes XP on each levelUp via the authorized[] seam.
///
/// Economics: curves mirror frontend/lib/game/adventures/engine.ts at 1x time —
///   costToNextLevel(L) = (25 + 5*L^2) * costUnit
///   emissionCap(L)     = 3 * costToNextLevel(L)
/// Zone rates are placeholders until Phase-2 calibration; all knobs are owner-set
/// (owner = Gnosis Safe on mainnet).
contract FrostbiteAdventures is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────── Constants ───────────────────────────────

    uint8 public constant ZONE_COUNT = 6;
    uint32 public constant MAX_ADV_LEVEL = 100;
    uint64 public constant SETTLE_GRACE = 7 days;
    /// @dev FrostbiteHeroes.MAX_XP_PER_CALL — addXp reverts above this.
    uint32 public constant MAX_XP_PER_LEVELUP = 1000;
    /// @dev FSB is not burnable; OZ ERC20 reverts on transfer to address(0).
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    // ───────────────────────────────── Types ─────────────────────────────────

    struct Zone {
        uint128 ratePerSec;     // FSB wei/sec — TOTAL zone pool, shared pro-rata off-chain
        uint16 minLevel;        // gate on advLevel
        uint16 minAtk;          // gates on live Heroes stats
        uint16 minDef;
        uint16 minSpd;
        uint16 minWisdom;       // wisdom = advLevel * (rarity + 1)
        uint8 favoredElement;   // +35% weight off-chain (informational on-chain)
        bool enabled;
    }

    enum PositionStatus {
        None,
        Active,
        Closed
    }

    struct Position {
        address player;
        uint32 tokenId;
        uint8 zoneId;
        PositionStatus status;
        uint64 stakedAt;
        uint64 lastSettledAt;
        uint64 closedAt;
        bytes32 seed; // keccak256(blockhash(n-1), positionId, player) — resolver RNG root
    }

    // ───────────────────────────────── State ─────────────────────────────────

    IERC20 public immutable fsb;
    IFrostbiteHeroes public immutable heroes;

    mapping(uint8 => Zone) public zones;

    uint256 public nextPositionId = 1; // 0 = "no position" sentinel
    mapping(uint256 => Position) public positions;
    /// @dev tokenId => active positionId (0 when unstaked)
    mapping(uint256 => uint256) public activePositionOf;

    /// @dev Contract-local adventure level; 0 = uninitialized (set from hero level on first touch)
    mapping(uint256 => uint32) public advLevel;
    /// @dev FSB settled since last level-up; the Hoppers emission-cap counter
    mapping(uint256 => uint256) public settledSinceLevel;

    /// @dev Defense-in-depth vs a leaked resolver key: a zone's ALL-TIME emission
    ///      can never exceed its rate integrated over wall-clock time, regardless
    ///      of how many positions are staked in it.
    ///        budget(z) = zoneBudgetAccrued[z] + ratePerSec * (now - zoneRateSince[z])
    ///        invariant: zoneEmitted[z] + amount <= budget(z)
    mapping(uint8 => uint256) public zoneEmitted;
    mapping(uint8 => uint256) public zoneBudgetAccrued; // folded on every rate change
    mapping(uint8 => uint64) public zoneRateSince;

    /// @dev Unallocated reward pool (pre-funded; the ONLY source of settlements)
    uint256 public poolBalance;
    /// @dev Sum of all pendingPayouts (owed, no longer part of the pool)
    uint256 public totalPending;
    mapping(address => uint256) public pendingPayouts;

    mapping(address => bool) public authorized;

    /// @dev 1 "shard" in FSB wei; scales cost/cap curves
    uint256 public costUnit = 1e18;
    /// @dev Heroes XP granted per levelUp (0 = bridge off; needs Heroes.setAuthorized(this))
    uint32 public xpPerLevelUp = 0;

    // Net-deflation guardrail counters (EXPEDITIONS_PHASE1 §güvenlik)
    uint256 public burnedTotal;
    uint256 public emittedTotal;

    // ───────────────────────────────── Events ────────────────────────────────

    event Staked(uint256 indexed positionId, address indexed player, uint256 indexed tokenId, uint8 zoneId, bytes32 seed);
    event Unstaked(uint256 indexed positionId, address indexed player, uint256 indexed tokenId, uint8 zoneId);
    event ClaimSettled(uint256 indexed positionId, address indexed player, uint256 amount, bytes32 resultHash);
    event AdventureLevelUp(uint256 indexed tokenId, uint32 newLevel, uint256 fsbBurned, address indexed payer);
    event PayoutWithdrawn(address indexed player, uint256 amount);
    event PoolFunded(address indexed funder, uint256 amount);
    event PoolSwept(address indexed to, uint256 amount);
    event ExcessSwept(address indexed to, uint256 amount);
    event AuthorizedChanged(address indexed addr, bool auth);
    event ZoneChanged(uint8 indexed zoneId);
    event CostUnitChanged(uint256 costUnit);
    event XpPerLevelUpChanged(uint32 xp);

    // ───────────────────────────────── Errors ────────────────────────────────

    error ZeroAddress();
    error InvalidZone();
    error ZoneDisabled();
    error AlreadyStaked();
    error NotHeroController();
    error GateNotMet();
    error UnknownPosition();
    error NotActive();
    error NotPositionOwner();
    error NotAuthorized();
    error NothingToSettle();
    error SettleWindowClosed();
    error RateBoundExceeded();
    error ZoneBudgetExceeded();
    error CapExceeded();
    error PoolInsufficient();
    error MaxLevelReached();
    error NoPayout();
    error NothingToSweep();
    error InvalidParam();
    error LengthMismatch();

    // ──────────────────────────────── Modifiers ──────────────────────────────

    modifier onlyAuthorized() {
        if (!authorized[msg.sender] && msg.sender != owner()) revert NotAuthorized();
        _;
    }

    // ─────────────────────────────── Constructor ─────────────────────────────

    /// @param ratesPerSec FSB wei/sec per zone, index order below (P0 zones.ts order)
    constructor(IERC20 fsb_, IFrostbiteHeroes heroes_, address owner_, uint128[6] memory ratesPerSec)
        Ownable(owner_)
    {
        if (address(fsb_) == address(0) || address(heroes_) == address(0)) revert ZeroAddress();
        fsb = fsb_;
        heroes = heroes_;

        // Gates mirror frontend/lib/game/adventures/zones.ts; element indices are
        // the FrostbiteHeroes uint8 encoding (fire0 wind2 ice3 earth4 thunder5 shadow6).
        zones[0] = Zone(ratesPerSec[0], 1, 0, 0, 0, 0, 0, true); // Frostpond (fire)
        zones[1] = Zone(ratesPerSec[1], 1, 0, 0, 0, 0, 2, true); // Glacier Stream (wind)
        zones[2] = Zone(ratesPerSec[2], 1, 0, 0, 0, 0, 4, true); // Frozen Marsh (earth)
        zones[3] = Zone(ratesPerSec[3], 10, 5, 0, 0, 5, 3, true); // Rime River (ice)
        zones[4] = Zone(ratesPerSec[4], 15, 0, 5, 5, 5, 6, true); // Whitewood Forest (shadow)
        zones[5] = Zone(ratesPerSec[5], 20, 5, 5, 5, 5, 5, true); // Great Frostlake (thunder)

        for (uint8 i = 0; i < ZONE_COUNT; i++) {
            zoneRateSince[i] = uint64(block.timestamp);
        }
    }

    // ────────────────────────────── Player: stake ────────────────────────────

    function stake(uint256 tokenId, uint8 zoneId) external nonReentrant whenNotPaused returns (uint256 positionId) {
        if (zoneId >= ZONE_COUNT) revert InvalidZone();
        if (tokenId > type(uint32).max) revert InvalidParam();
        Zone memory z = zones[zoneId];
        if (!z.enabled) revert ZoneDisabled();
        if (activePositionOf[tokenId] != 0) revert AlreadyStaked();
        if (heroes.ownerOf(tokenId) != msg.sender) revert NotHeroController();

        uint32 lvl = _initLevel(tokenId);
        IFrostbiteHeroes.Hero memory h = heroes.getHero(tokenId);
        if (lvl < z.minLevel) revert GateNotMet();
        if (h.atk < z.minAtk || h.def < z.minDef || h.spd < z.minSpd) revert GateNotMet();
        if (uint256(lvl) * (uint256(h.rarity) + 1) < z.minWisdom) revert GateNotMet();

        positionId = nextPositionId++;
        bytes32 seed = keccak256(abi.encodePacked(blockhash(block.number - 1), positionId, msg.sender));
        positions[positionId] = Position({
            player: msg.sender,
            tokenId: uint32(tokenId),
            zoneId: zoneId,
            status: PositionStatus.Active,
            stakedAt: uint64(block.timestamp),
            lastSettledAt: uint64(block.timestamp),
            closedAt: 0,
            seed: seed
        });
        activePositionOf[tokenId] = positionId;

        // plain transferFrom (not safeTransferFrom): no receiver callback surface
        heroes.transferFrom(msg.sender, address(this), tokenId);

        emit Staked(positionId, msg.sender, tokenId, zoneId, seed);
    }

    /// @notice Always available — never pausable, never resolver-dependent.
    ///         Unsettled accrual remains settleable for SETTLE_GRACE after close.
    function unstake(uint256 positionId) external nonReentrant {
        Position storage p = positions[positionId];
        if (p.status != PositionStatus.Active) revert NotActive();
        if (p.player != msg.sender) revert NotPositionOwner();

        p.status = PositionStatus.Closed;
        p.closedAt = uint64(block.timestamp);
        activePositionOf[p.tokenId] = 0;

        heroes.transferFrom(address(this), msg.sender, p.tokenId);

        emit Unstaked(positionId, msg.sender, p.tokenId, p.zoneId);
    }

    // ─────────────────────────── Player: level & payout ──────────────────────

    /// @notice Burn FSB to raise the hero's adventure level, resetting the
    ///         emission-cap counter (the load-bearing re-investment sink).
    ///         Callable by the staker while staked, else by the hero's owner.
    function levelUp(uint256 tokenId) external nonReentrant whenNotPaused {
        if (_controllerOf(tokenId) != msg.sender) revert NotHeroController();
        uint32 lvl = _initLevel(tokenId);
        if (lvl >= MAX_ADV_LEVEL) revert MaxLevelReached();

        uint256 cost = costToNextLevel(lvl);
        fsb.safeTransferFrom(msg.sender, BURN, cost);
        burnedTotal += cost;

        advLevel[tokenId] = lvl + 1;
        settledSinceLevel[tokenId] = 0;

        uint32 xp = xpPerLevelUp;
        if (xp != 0) {
            // best-effort bridge; inert until Heroes.setAuthorized(address(this), true)
            try heroes.addXp(tokenId, xp) {} catch {}
        }

        emit AdventureLevelUp(tokenId, lvl + 1, cost, msg.sender);
    }

    /// @notice Pull-payment drain. Never pausable.
    function withdrawPayout() external nonReentrant {
        uint256 amount = pendingPayouts[msg.sender];
        if (amount == 0) revert NoPayout();
        pendingPayouts[msg.sender] = 0;
        totalPending -= amount;
        fsb.safeTransfer(msg.sender, amount);
        emit PayoutWithdrawn(msg.sender, amount);
    }

    // ─────────────────────────── Resolver: settlement ────────────────────────

    /// @notice Credit off-chain-computed accrual to the position's player,
    ///         bounded by zone rate, emission cap, and pool balance.
    ///         amount == 0 is allowed and just advances lastSettledAt
    ///         (used to checkpoint cap-locked positions).
    function settle(uint256 positionId, uint256 amount, bytes32 resultHash)
        public
        onlyAuthorized
        whenNotPaused
    {
        Position storage p = positions[positionId];
        if (p.status == PositionStatus.None) revert UnknownPosition();

        uint64 tEnd;
        if (p.status == PositionStatus.Active) {
            tEnd = uint64(block.timestamp);
        } else {
            if (block.timestamp > uint256(p.closedAt) + SETTLE_GRACE) revert SettleWindowClosed();
            tEnd = p.closedAt;
        }
        uint64 elapsed = tEnd - p.lastSettledAt;
        if (elapsed == 0) revert NothingToSettle();
        p.lastSettledAt = tEnd;

        if (amount != 0) {
            uint8 zoneId = p.zoneId;
            if (amount > uint256(zones[zoneId].ratePerSec) * elapsed) revert RateBoundExceeded();
            uint256 newZoneEmitted = zoneEmitted[zoneId] + amount;
            if (newZoneEmitted > _zoneBudget(zoneId)) revert ZoneBudgetExceeded();
            uint256 tokenId = p.tokenId;
            uint256 newSettled = settledSinceLevel[tokenId] + amount;
            if (newSettled > emissionCap(_levelOrDefault(tokenId))) revert CapExceeded();
            if (amount > poolBalance) revert PoolInsufficient();

            zoneEmitted[zoneId] = newZoneEmitted;
            settledSinceLevel[tokenId] = newSettled;
            poolBalance -= amount;
            totalPending += amount;
            pendingPayouts[p.player] += amount;
            emittedTotal += amount;
        }

        emit ClaimSettled(positionId, p.player, amount, resultHash);
    }

    function settleBatch(uint256[] calldata positionIds, uint256[] calldata amounts, bytes32 resultHash)
        external
        onlyAuthorized
        whenNotPaused
    {
        if (positionIds.length != amounts.length) revert LengthMismatch();
        for (uint256 i = 0; i < positionIds.length; i++) {
            settle(positionIds[i], amounts[i], resultHash);
        }
    }

    // ──────────────────────────────── Pool ───────────────────────────────────

    /// @notice Anyone can fund (Safe/treasury in practice). The ONLY way FSB
    ///         enters settlement accounting.
    function fundPool(uint256 amount) external {
        if (amount == 0) revert InvalidParam();
        fsb.safeTransferFrom(msg.sender, address(this), amount);
        poolBalance += amount;
        emit PoolFunded(msg.sender, amount);
    }

    /// @notice Reclaim UNALLOCATED pool (e.g. season end). Cannot touch owed payouts.
    function sweepUnallocated(uint256 amount, address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount > poolBalance) revert PoolInsufficient();
        poolBalance -= amount;
        fsb.safeTransfer(to, amount);
        emit PoolSwept(to, amount);
    }

    /// @notice Rescue FSB sent directly to the contract (outside fundPool).
    function sweepExcess(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = fsb.balanceOf(address(this));
        uint256 accounted = poolBalance + totalPending;
        if (bal <= accounted) revert NothingToSweep();
        uint256 excess = bal - accounted;
        fsb.safeTransfer(to, excess);
        emit ExcessSwept(to, excess);
    }

    // ──────────────────────────────── Admin ──────────────────────────────────

    function setAuthorized(address addr, bool auth) external onlyOwner {
        if (addr == address(0)) revert ZeroAddress();
        authorized[addr] = auth;
        emit AuthorizedChanged(addr, auth);
    }

    /// @dev Resolver MUST settle all positions in a zone before a rate change,
    ///      or the rate bound of unsettled spans is evaluated at the new rate.
    ///      The zone's all-time budget is folded at the old rate up to now.
    function setZone(uint8 zoneId, Zone calldata z) external onlyOwner {
        if (zoneId >= ZONE_COUNT) revert InvalidZone();
        if (z.favoredElement > 7) revert InvalidParam();
        zoneBudgetAccrued[zoneId] = _zoneBudget(zoneId);
        zoneRateSince[zoneId] = uint64(block.timestamp);
        zones[zoneId] = z;
        emit ZoneChanged(zoneId);
    }

    /// @dev Rescales cost AND cap curves; only sensible at season boundaries.
    function setCostUnit(uint256 unit) external onlyOwner {
        if (unit == 0) revert InvalidParam();
        costUnit = unit;
        emit CostUnitChanged(unit);
    }

    function setXpPerLevelUp(uint32 xp) external onlyOwner {
        if (xp > MAX_XP_PER_LEVELUP) revert InvalidParam();
        xpPerLevelUp = xp;
        emit XpPerLevelUpChanged(xp);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ──────────────────────────────── Views ──────────────────────────────────

    /// @dev P0 curve: 25 + 5*L^2 shards (engine.ts costToNextLevel)
    function costToNextLevel(uint32 level) public view returns (uint256) {
        return (25 + 5 * uint256(level) * uint256(level)) * costUnit;
    }

    /// @dev Hoppers cap: 3x next-level cost (engine.ts emissionCap)
    function emissionCap(uint32 level) public view returns (uint256) {
        return 3 * costToNextLevel(level);
    }

    function capRemaining(uint256 tokenId) external view returns (uint256) {
        uint256 cap = emissionCap(_levelOrDefault(tokenId));
        uint256 used = settledSinceLevel[tokenId];
        return used >= cap ? 0 : cap - used;
    }

    /// @notice Frontend helper: mirrors stake()'s gate checks without state changes.
    ///         Returns false (instead of reverting) for nonexistent tokens.
    function canStake(uint256 tokenId, uint8 zoneId) external view returns (bool) {
        if (zoneId >= ZONE_COUNT || tokenId > type(uint32).max) return false;
        Zone memory z = zones[zoneId];
        if (!z.enabled || activePositionOf[tokenId] != 0) return false;
        try heroes.getHero(tokenId) returns (IFrostbiteHeroes.Hero memory h) {
            uint32 lvl = advLevel[tokenId];
            if (lvl == 0) lvl = h.level == 0 ? 1 : uint32(h.level);
            if (lvl < z.minLevel) return false;
            if (h.atk < z.minAtk || h.def < z.minDef || h.spd < z.minSpd) return false;
            return uint256(lvl) * (uint256(h.rarity) + 1) >= z.minWisdom;
        } catch {
            return false;
        }
    }

    /// @notice Remaining all-time emission headroom for a zone (resolver clamp input).
    function zoneBudgetRemaining(uint8 zoneId) external view returns (uint256) {
        if (zoneId >= ZONE_COUNT) return 0;
        uint256 budget = _zoneBudget(zoneId);
        uint256 emitted = zoneEmitted[zoneId];
        return emitted >= budget ? 0 : budget - emitted;
    }

    function getPosition(uint256 positionId) external view returns (Position memory) {
        return positions[positionId];
    }

    // ─────────────────────────────── Internal ────────────────────────────────

    /// @dev Initialize advLevel from the live hero level on first touch.
    function _initLevel(uint256 tokenId) internal returns (uint32 lvl) {
        lvl = advLevel[tokenId];
        if (lvl == 0) {
            IFrostbiteHeroes.Hero memory h = heroes.getHero(tokenId);
            lvl = h.level == 0 ? 1 : uint32(h.level);
            advLevel[tokenId] = lvl;
        }
    }

    function _levelOrDefault(uint256 tokenId) internal view returns (uint32) {
        uint32 lvl = advLevel[tokenId];
        return lvl == 0 ? 1 : lvl;
    }

    /// @dev Staked hero => position player; otherwise the ERC-721 owner.
    function _controllerOf(uint256 tokenId) internal view returns (address) {
        uint256 pid = activePositionOf[tokenId];
        return pid == 0 ? heroes.ownerOf(tokenId) : positions[pid].player;
    }

    /// @dev All-time emission budget of a zone at the current timestamp.
    function _zoneBudget(uint8 zoneId) internal view returns (uint256) {
        return zoneBudgetAccrued[zoneId]
            + uint256(zones[zoneId].ratePerSec) * (block.timestamp - zoneRateSince[zoneId]);
    }
}
