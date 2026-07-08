// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title MatchEscrow — on-chain entry-fee escrow + signed-result settlement for CAR(D) GAME
///
/// Blockchain handles ONLY money: it escrows 4 players' entry fees and pays out
/// against a ranking signed by the trusted game server. All gameplay stays
/// off-chain and server-authoritative; the on-chain seed/audit trail lives in
/// the game's own indexer.
///
/// Hardened vs the starter (real funds — see cardgame/contracts/AUDIT.md):
///  - PULL PAYMENTS everywhere (pendingPayouts + withdrawPayout). A player or the
///    treasury being a contract that reverts on receive can NEVER brick a match's
///    settlement — the repo-wide convention (BattleRoyale/Adventures).
///  - OZ ECDSA.recover (rejects s-malleability and the ecrecover(0) footgun),
///    over a digest bound to matchId + ranking + address(this) + chainid so a
///    signature cannot be replayed across matches, deployments or chains.
///  - Ownable2Step owner (Gnosis Safe on mainnet) for admin; a separate
///    `authorized` operator role opens matches, so the admin key stays cold.
///    settle() is PERMISSIONLESS — anyone can submit the signed result, so a
///    silent server cannot strand escrowed funds (refund is the other exit).
///  - Pausable (blocks createMatch/joinMatch) but refund() and withdrawPayout()
///    are NEVER pausable — players can always exit.
///  - Payout config is owner-tunable but structurally exact:
///    platformFee + Σ rewards == PLAYERS * entryFee, so a match's pool is always
///    fully and only distributed — no dust accrues, no shortfall is possible.
///
/// Accounting invariant (see invariant tests):
///   address(this).balance == escrowed + totalPending
contract MatchEscrow is Ownable2Step, Pausable, ReentrancyGuard {
    // ─────────────────────────────── Constants ───────────────────────────────

    uint256 public constant PLAYERS = 4;

    // ───────────────────────────────── Types ─────────────────────────────────

    enum Status {
        None,
        Open,
        Locked,
        Settled,
        Cancelled
    }

    struct Match {
        Status status;
        uint64 createdAt;
        uint8 paidCount;
        address[4] players;
        mapping(address => bool) isPlayer;
        mapping(address => bool) hasPaid;
    }

    // ───────────────────────────────── State ─────────────────────────────────

    /// @dev Fixed at deploy; small on Fuji, 1 AVAX on mainnet.
    uint256 public immutable entryFee;

    address public trustedSigner; // server key that signs final rankings
    address public treasury; // receives platform fee (via pull)
    uint256 public settleWindow; // seconds before a stuck match becomes refundable

    /// @dev platformFee + Σ rewards == PLAYERS * entryFee (enforced on every set)
    uint256 public platformFee;
    uint256[4] public rewards; // index 0..3 => finishing position 1..4

    mapping(bytes32 => Match) private matches;
    mapping(address => bool) public authorized; // operators that may open matches

    /// @dev AVAX held for not-yet-resolved matches (Open/Locked deposits)
    uint256 public escrowed;
    /// @dev AVAX owed to addresses via pull payment (rewards, fee, refunds)
    uint256 public totalPending;
    mapping(address => uint256) public pendingPayouts;

    // ───────────────────────────────── Events ────────────────────────────────

    event MatchCreated(bytes32 indexed matchId, address[4] players);
    event PlayerJoined(bytes32 indexed matchId, address indexed player, uint8 paidCount);
    event MatchLocked(bytes32 indexed matchId);
    event MatchSettled(bytes32 indexed matchId, address[4] ranking);
    event RewardCredited(bytes32 indexed matchId, address indexed player, uint256 amount, uint8 position);
    event FeeCredited(bytes32 indexed matchId, address indexed treasury, uint256 amount);
    event MatchCancelled(bytes32 indexed matchId);
    event RefundCredited(bytes32 indexed matchId, address indexed player, uint256 amount);
    event PayoutWithdrawn(address indexed to, uint256 amount);
    event AuthorizedChanged(address indexed operator, bool auth);
    event TrustedSignerChanged(address indexed signer);
    event TreasuryChanged(address indexed treasury);
    event SettleWindowChanged(uint256 window);
    event PayoutConfigChanged(uint256 platformFee, uint256[4] rewards);

    // ───────────────────────────────── Errors ────────────────────────────────

    error ZeroAddress();
    error NotAuthorized();
    error MatchExists();
    error DuplicatePlayer();
    error MatchNotOpen();
    error NotListedPlayer();
    error AlreadyPaid();
    error WrongEntryFee();
    error MatchNotLocked();
    error BadSignature();
    error RankingNotPermutation();
    error NotRefundable();
    error RefundTooEarly();
    error NothingToRefund();
    error NoPayout();
    error InvalidPayoutConfig();
    error RenounceDisabled();

    // ──────────────────────────────── Modifiers ──────────────────────────────

    modifier onlyAuthorized() {
        if (!authorized[msg.sender] && msg.sender != owner()) revert NotAuthorized();
        _;
    }

    // ─────────────────────────────── Constructor ─────────────────────────────

    /// @param platformFee_ / rewards_ must satisfy platformFee_ + Σrewards_ == PLAYERS*entryFee_
    constructor(
        address owner_,
        address trustedSigner_,
        address treasury_,
        uint256 entryFee_,
        uint256 settleWindow_,
        uint256 platformFee_,
        uint256[4] memory rewards_
    ) Ownable(owner_) {
        if (trustedSigner_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (entryFee_ == 0) revert InvalidPayoutConfig();
        entryFee = entryFee_;
        trustedSigner = trustedSigner_;
        treasury = treasury_;
        settleWindow = settleWindow_;
        _setPayoutConfig(platformFee_, rewards_);
    }

    // ───────────────────────────── Match lifecycle ───────────────────────────

    /// @notice Open an escrow for four known players. Operator-gated.
    function createMatch(bytes32 matchId, address[4] calldata players)
        external
        onlyAuthorized
        whenNotPaused
    {
        Match storage m = matches[matchId];
        if (m.status != Status.None) revert MatchExists();
        m.status = Status.Open;
        m.createdAt = uint64(block.timestamp);
        m.players = players;
        for (uint256 i = 0; i < PLAYERS; i++) {
            address p = players[i];
            if (p == address(0)) revert ZeroAddress();
            if (m.isPlayer[p]) revert DuplicatePlayer();
            m.isPlayer[p] = true;
        }
        emit MatchCreated(matchId, players);
    }

    /// @notice Deposit exactly entryFee to take your seat. 4th deposit locks the match.
    function joinMatch(bytes32 matchId) external payable nonReentrant whenNotPaused {
        Match storage m = matches[matchId];
        if (m.status != Status.Open) revert MatchNotOpen();
        if (!m.isPlayer[msg.sender]) revert NotListedPlayer();
        if (m.hasPaid[msg.sender]) revert AlreadyPaid();
        if (msg.value != entryFee) revert WrongEntryFee();

        m.hasPaid[msg.sender] = true;
        m.paidCount += 1;
        escrowed += msg.value;
        emit PlayerJoined(matchId, msg.sender, m.paidCount);

        if (m.paidCount == PLAYERS) {
            m.status = Status.Locked;
            emit MatchLocked(matchId);
        }
    }

    /// @notice Settle a locked match with the server-signed final ranking.
    ///         Permissionless: anyone holding a valid signature can trigger payout.
    /// @param ranking positions 1..4 (index 0 = winner); must be a permutation of the escrowed players
    /// @param signature server signature over keccak256(abi.encode(matchId, ranking, address(this), chainid))
    function settle(bytes32 matchId, address[4] calldata ranking, bytes calldata signature)
        external
        nonReentrant
    {
        Match storage m = matches[matchId];
        if (m.status != Status.Locked) revert MatchNotLocked();

        bytes32 digest = keccak256(abi.encode(matchId, ranking, address(this), block.chainid));
        bytes32 ethSigned = MessageHashUtils.toEthSignedMessageHash(digest);
        if (ECDSA.recover(ethSigned, signature) != trustedSigner) revert BadSignature();

        // ranking must be exactly the four escrowed players, no repeats
        for (uint256 i = 0; i < PLAYERS; i++) {
            if (!m.isPlayer[ranking[i]]) revert RankingNotPermutation();
            for (uint256 j = i + 1; j < PLAYERS; j++) {
                if (ranking[i] == ranking[j]) revert RankingNotPermutation();
            }
        }

        m.status = Status.Settled;

        // Move the whole pool from escrow into pull-payment credits. By config
        // invariant platformFee + Σrewards == PLAYERS*entryFee, so this is exact.
        uint256 pool = PLAYERS * entryFee;
        escrowed -= pool;
        totalPending += pool;

        pendingPayouts[treasury] += platformFee;
        emit FeeCredited(matchId, treasury, platformFee);
        for (uint256 i = 0; i < PLAYERS; i++) {
            pendingPayouts[ranking[i]] += rewards[i];
            emit RewardCredited(matchId, ranking[i], rewards[i], uint8(i + 1));
        }
        emit MatchSettled(matchId, ranking);
    }

    /// @notice Reclaim your deposit if the match never settled within settleWindow
    ///         (or was cancelled by the owner). First caller flips it to Cancelled;
    ///         every paid player then pulls their own entry. Never pausable.
    function refund(bytes32 matchId) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.status == Status.Open || m.status == Status.Locked) {
            if (block.timestamp <= uint256(m.createdAt) + settleWindow) revert RefundTooEarly();
            m.status = Status.Cancelled;
            emit MatchCancelled(matchId);
        } else if (m.status != Status.Cancelled) {
            revert NotRefundable();
        }
        if (!m.hasPaid[msg.sender]) revert NothingToRefund();

        m.hasPaid[msg.sender] = false;
        escrowed -= entryFee;
        totalPending += entryFee;
        pendingPayouts[msg.sender] += entryFee;
        emit RefundCredited(matchId, msg.sender, entryFee);
    }

    /// @notice Pull-payment drain. Never pausable — the guaranteed exit.
    function withdrawPayout() external nonReentrant {
        uint256 amount = pendingPayouts[msg.sender];
        if (amount == 0) revert NoPayout();
        pendingPayouts[msg.sender] = 0;
        totalPending -= amount;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert("transfer failed");
        emit PayoutWithdrawn(msg.sender, amount);
    }

    // ──────────────────────────────── Admin ──────────────────────────────────

    /// @notice Force a not-yet-settled match into Cancelled so players can refund
    ///         immediately (e.g. the server crashed before it filled).
    function cancelMatch(bytes32 matchId) external onlyOwner {
        Match storage m = matches[matchId];
        if (m.status != Status.Open && m.status != Status.Locked) revert NotRefundable();
        m.status = Status.Cancelled;
        emit MatchCancelled(matchId);
    }

    function setAuthorized(address operator, bool auth) external onlyOwner {
        if (operator == address(0)) revert ZeroAddress();
        authorized[operator] = auth;
        emit AuthorizedChanged(operator, auth);
    }

    function setTrustedSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        trustedSigner = signer;
        emit TrustedSignerChanged(signer);
    }

    function setTreasury(address t) external onlyOwner {
        if (t == address(0)) revert ZeroAddress();
        treasury = t;
        emit TreasuryChanged(t);
    }

    function setSettleWindow(uint256 window) external onlyOwner {
        settleWindow = window;
        emit SettleWindowChanged(window);
    }

    /// @notice Retune fee/rewards. Only affects matches settled AFTER this call.
    function setPayoutConfig(uint256 platformFee_, uint256[4] calldata rewards_) external onlyOwner {
        _setPayoutConfig(platformFee_, rewards_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Ownership is load-bearing (signer, treasury, payout config, pause,
    ///         operator gating) — renouncing it is permanently disabled.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ──────────────────────────────── Views ──────────────────────────────────

    function getStatus(bytes32 matchId) external view returns (Status) {
        return matches[matchId].status;
    }

    function getPlayers(bytes32 matchId) external view returns (address[4] memory) {
        return matches[matchId].players;
    }

    function isPlayer(bytes32 matchId, address p) external view returns (bool) {
        return matches[matchId].isPlayer[p];
    }

    function hasPaid(bytes32 matchId, address p) external view returns (bool) {
        return matches[matchId].hasPaid[p];
    }

    function paidCount(bytes32 matchId) external view returns (uint8) {
        return matches[matchId].paidCount;
    }

    function createdAt(bytes32 matchId) external view returns (uint64) {
        return matches[matchId].createdAt;
    }

    function getRewards() external view returns (uint256[4] memory) {
        return rewards;
    }

    /// @notice The exact digest a signer must sign for `settle` (off-chain helper).
    function settleDigest(bytes32 matchId, address[4] calldata ranking) external view returns (bytes32) {
        return MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encode(matchId, ranking, address(this), block.chainid))
        );
    }

    // ─────────────────────────────── Internal ────────────────────────────────

    function _setPayoutConfig(uint256 platformFee_, uint256[4] memory rewards_) internal {
        uint256 sum = platformFee_;
        for (uint256 i = 0; i < PLAYERS; i++) sum += rewards_[i];
        if (sum != PLAYERS * entryFee) revert InvalidPayoutConfig();
        platformFee = platformFee_;
        rewards = rewards_;
        emit PayoutConfigChanged(platformFee_, rewards_);
    }
}
