// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FrostbiteAccountV3 — Ultimate Secure ERC-6551 Token Bound Account
 * @notice Phase 4 upgrade: comprehensive security mechanisms for delegate management.
 *
 *         Security features:
 *         - Cumulative delegate budgets with per-tx spend limits
 *         - Delegate TTL (time-to-live / expiration)
 *         - ERC-20 function selector restriction for delegates
 *         - TBA lock / freeze with emergency protocol pause
 *         - Cooldown between delegate transactions
 *         - Guardian role for emergency freeze
 *         - Allowed target whitelist for delegates
 *         - Sweep function for quick AVAX withdrawal
 *
 *         Inherits all V2 audit fixes:
 *         - C-3: Dynamic bytecode offset
 *         - C-1: Delegate spend limits + allowed target whitelist
 *         - C-2: Delegate persistence across NFT transfers (authorizedBy check)
 */

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/* ---- ERC-6551 Interfaces ---- */

interface IERC6551Account {
    receive() external payable;
    function token() external view returns (uint256 chainId, address tokenContract, uint256 tokenId);
    function state() external view returns (uint256);
    function isValidSigner(address signer, bytes calldata context) external view returns (bytes4);
}

interface IERC6551Executable {
    function execute(address to, uint256 value, bytes calldata data, uint8 operation) external payable returns (bytes memory);
}

contract FrostbiteAccountV3 is IERC6551Account, IERC6551Executable, IERC165 {

    // ═══════════════════════════════════════════════════════════════════
    //                              TYPES
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Full delegate info with TTL, budget, and authorization tracking
    struct DelegateInfo {
        bool active;
        address authorizedBy;
        uint256 expiresAt;      // timestamp when delegation expires (0 = no expiry)
        uint256 budgetTotal;    // total AVAX budget in wei
        uint256 budgetSpent;    // AVAX spent so far
    }

    // ═══════════════════════════════════════════════════════════════════
    //                             ERRORS
    // ═══════════════════════════════════════════════════════════════════

    error NotAuthorized();
    error OnlyCallOperation();
    error ExecutionFailed();
    error ReentrancyGuard();
    error AccountLocked();
    error AccountFrozen();
    error TargetNotAllowed();
    error SelectorNotAllowed();
    error SpendLimitExceeded();
    error BudgetExceeded();
    error CooldownActive();
    error DelegateExpired();
    error LockDurationExceeded();
    error ZeroAddress();
    error SweepFailed();

    // ═══════════════════════════════════════════════════════════════════
    //                             EVENTS
    // ═══════════════════════════════════════════════════════════════════

    event DelegateAdded(address indexed delegate, uint256 expiresAt, uint256 budget);
    event DelegateRemoved(address indexed delegate);
    event DelegateBudgetSet(address indexed delegate, uint256 budget);
    event Locked(uint256 until);
    event Unlocked();
    event EmergencyFrozen(address indexed by);
    event EmergencyUnfrozen();
    event Swept(address indexed to, uint256 amount);
    event GuardianSet(address indexed guardian);
    event Executed(address indexed to, uint256 value, bytes data, uint256 newState);
    event Received(address indexed from, uint256 amount);

    // ═══════════════════════════════════════════════════════════════════
    //                           CONSTANTS
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Maximum lock duration: 30 days
    uint256 public constant MAX_LOCK_DURATION = 30 days;

    /// @notice Blocked ERC-20 selectors for delegates by default
    bytes4 private constant TRANSFER_SELECTOR = 0xa9059cbb;
    bytes4 private constant TRANSFER_FROM_SELECTOR = 0x23b872dd;
    bytes4 private constant APPROVE_SELECTOR = 0x095ea7b3;

    // ═══════════════════════════════════════════════════════════════════
    //                             STATE
    // ═══════════════════════════════════════════════════════════════════

    uint256 private _state;
    bool private _reentrancyLock;

    // ── Delegate Core ──
    mapping(address => DelegateInfo) private _delegates;
    mapping(address => bool) private _allowedTargets;
    uint256 public delegateSpendLimit;       // per-tx AVAX limit for delegates

    // ── Selector Restriction ──
    /// @notice Explicitly allowed selectors per target for delegates
    mapping(address => mapping(bytes4 => bool)) private _delegateAllowedSelectors;

    // ── Lock & Freeze ──
    uint256 public lockedUntil;              // 0 = unlocked
    bool public emergencyFrozen;

    // ── Cooldown ──
    uint256 public delegateCooldown;         // seconds between delegate txs
    mapping(address => uint256) public lastDelegateExecTime;

    // ── Guardian ──
    address public guardian;

    // ═══════════════════════════════════════════════════════════════════
    //                           MODIFIERS
    // ═══════════════════════════════════════════════════════════════════

    modifier nonReentrant() {
        if (_reentrancyLock) revert ReentrancyGuard();
        _reentrancyLock = true;
        _;
        _reentrancyLock = false;
    }

    modifier onlyOwner() {
        if (msg.sender != owner()) revert NotAuthorized();
        _;
    }

    // ═══════════════════════════════════════════════════════════════════
    //                         RECEIVE AVAX
    // ═══════════════════════════════════════════════════════════════════

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                        ERC-6551 CORE
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Returns the token this account is bound to.
     * @dev Dynamic extcodesize offset (C-3 fix).
     */
    function token() public view returns (uint256 chainId, address tokenContract, uint256 tokenId) {
        bytes memory footer = new bytes(3 * 32);
        assembly {
            extcodecopy(address(), add(footer, 0x20), sub(extcodesize(address()), 0x60), 0x60)
        }
        return abi.decode(footer, (uint256, address, uint256));
    }

    /// @notice State counter — increments on every execute() call.
    function state() external view returns (uint256) {
        return _state;
    }

    /// @notice Returns the owner of this account (= owner of the bound NFT).
    function owner() public view returns (address) {
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        if (chainId != block.chainid) return address(0);
        return IERC721(tokenContract).ownerOf(tokenId);
    }

    /**
     * @notice Checks if a signer is authorized to act on behalf of this account.
     * @dev Returns the magic value if the signer is the NFT owner OR a valid delegate.
     */
    function isValidSigner(address signer, bytes calldata) external view returns (bytes4) {
        if (_isValidSigner(signer)) {
            return IERC6551Account.isValidSigner.selector;
        }
        return bytes4(0);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                          EXECUTE
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Execute a call from this account.
     * @dev Check order:
     *      1. nonReentrant
     *      2. Not frozen/locked
     *      3. Signer validity (owner or valid delegate)
     *      4. Delegate restrictions (target, selector, spend, budget, cooldown)
     *      5. Update budget/cooldown state
     *      6. Execute call
     *      7. Increment state
     *      8. Emit event
     */
    function execute(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation
    ) external payable nonReentrant returns (bytes memory result) {
        // 2. Check NOT frozen/locked
        if (emergencyFrozen) revert AccountFrozen();
        if (block.timestamp < lockedUntil) revert AccountLocked();

        // 3. Check signer validity
        if (!_isValidSigner(msg.sender)) revert NotAuthorized();
        if (operation != 0) revert OnlyCallOperation();

        address currentOwner = owner();
        bool callerIsDelegate = msg.sender != currentOwner;

        // 4. Delegate restrictions
        if (callerIsDelegate) {
            DelegateInfo storage d = _delegates[msg.sender];

            // Target whitelist
            if (!_allowedTargets[to]) revert TargetNotAllowed();

            // Function selector restriction
            if (data.length >= 4) {
                bytes4 selector = bytes4(data[:4]);
                if (_isBlockedSelector(selector) && !_delegateAllowedSelectors[to][selector]) {
                    revert SelectorNotAllowed();
                }
            }

            // Per-tx spend limit
            if (value > 0 && value > delegateSpendLimit) revert SpendLimitExceeded();

            // Cumulative budget check
            if (value > 0) {
                uint256 remaining = d.budgetTotal - d.budgetSpent;
                if (value > remaining) revert BudgetExceeded();
            }

            // Cooldown check
            if (delegateCooldown > 0) {
                if (block.timestamp < lastDelegateExecTime[msg.sender] + delegateCooldown) {
                    revert CooldownActive();
                }
            }

            // 5. Update delegate state
            if (value > 0) {
                d.budgetSpent += value;
            }
            lastDelegateExecTime[msg.sender] = block.timestamp;
        }

        // 6. Execute the call
        bool success;
        (success, result) = to.call{value: value}(data);
        if (!success) revert ExecutionFailed();

        // 7. Increment state
        ++_state;

        // 8. Emit event
        emit Executed(to, value, data, _state);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     DELEGATION MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Add a delegate with optional TTL and budget.
     * @param delegate Address to authorize
     * @param expiresAt Timestamp when delegation expires (0 = no expiry)
     * @param budget Total AVAX budget in wei (0 = no budget)
     */
    function addDelegate(address delegate, uint256 expiresAt, uint256 budget) external onlyOwner {
        if (delegate == address(0)) revert ZeroAddress();
        _delegates[delegate] = DelegateInfo({
            active: true,
            authorizedBy: msg.sender,
            expiresAt: expiresAt,
            budgetTotal: budget,
            budgetSpent: 0
        });
        emit DelegateAdded(delegate, expiresAt, budget);
    }

    /**
     * @notice Remove a delegate's authorization.
     * @param delegate Address to de-authorize
     */
    function removeDelegate(address delegate) external onlyOwner {
        delete _delegates[delegate];
        emit DelegateRemoved(delegate);
    }

    /**
     * @notice Set cumulative AVAX budget for a delegate.
     * @dev Resets budgetSpent to 0 and sets new total.
     * @param delegate The delegate address
     * @param budget New total budget in wei
     */
    function setDelegateBudget(address delegate, uint256 budget) external onlyOwner {
        DelegateInfo storage d = _delegates[delegate];
        d.budgetTotal = budget;
        d.budgetSpent = 0;
        emit DelegateBudgetSet(delegate, budget);
    }

    /**
     * @notice Check if an address is currently a valid delegate.
     * @param addr Address to check
     * @return True if addr is a valid, non-expired delegate authorized by current owner
     */
    function isDelegate(address addr) external view returns (bool) {
        DelegateInfo memory d = _delegates[addr];
        if (!d.active || d.authorizedBy != owner()) return false;
        if (d.expiresAt != 0 && block.timestamp >= d.expiresAt) return false;
        return true;
    }

    /**
     * @notice Get full delegate info.
     * @param addr Delegate address
     */
    function getDelegateInfo(address addr) external view returns (DelegateInfo memory) {
        return _delegates[addr];
    }

    /**
     * @notice Get remaining budget for a delegate.
     * @param delegate Delegate address
     * @return Remaining budget in wei
     */
    function delegateBudgetRemaining(address delegate) external view returns (uint256) {
        DelegateInfo memory d = _delegates[delegate];
        if (d.budgetTotal <= d.budgetSpent) return 0;
        return d.budgetTotal - d.budgetSpent;
    }

    // ═══════════════════════════════════════════════════════════════════
    //                   TARGET & SELECTOR MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Set whether a target address is allowed for delegate calls.
     * @param target The target contract address
     * @param allowed Whether the target should be allowed
     */
    function setAllowedTarget(address target, bool allowed) external onlyOwner {
        _allowedTargets[target] = allowed;
    }

    /// @notice Check if a target address is allowed for delegate calls.
    function isAllowedTarget(address target) external view returns (bool) {
        return _allowedTargets[target];
    }

    /**
     * @notice Set the maximum AVAX a delegate can send per execute() call.
     * @param limit The maximum AVAX value in wei
     */
    function setDelegateSpendLimit(uint256 limit) external onlyOwner {
        delegateSpendLimit = limit;
    }

    /**
     * @notice Allow or block a specific function selector for delegates on a target.
     * @dev By default, transfer/transferFrom/approve are blocked for delegates.
     *      Use this to explicitly allow them on specific targets if needed.
     * @param target Target contract address
     * @param selector 4-byte function selector
     * @param allowed Whether to allow this selector
     */
    function setDelegateAllowedSelector(address target, bytes4 selector, bool allowed) external onlyOwner {
        _delegateAllowedSelectors[target][selector] = allowed;
    }

    /// @notice Check if a selector is allowed for delegates on a specific target.
    function isDelegateAllowedSelector(address target, bytes4 selector) external view returns (bool) {
        return _delegateAllowedSelectors[target][selector];
    }

    // ═══════════════════════════════════════════════════════════════════
    //                        LOCK & FREEZE
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Lock the account for a given duration.
     * @param duration Lock duration in seconds (max 30 days)
     */
    function lock(uint256 duration) external onlyOwner {
        if (duration > MAX_LOCK_DURATION) revert LockDurationExceeded();
        lockedUntil = block.timestamp + duration;
        emit Locked(lockedUntil);
    }

    /// @notice Unlock the account immediately.
    function unlock() external onlyOwner {
        lockedUntil = 0;
        emit Unlocked();
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     GUARDIAN & EMERGENCY
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Set the guardian address (can freeze but not unfreeze).
     * @param _guardian New guardian address
     */
    function setGuardian(address _guardian) external onlyOwner {
        guardian = _guardian;
        emit GuardianSet(_guardian);
    }

    /// @notice Emergency freeze — callable by guardian or owner.
    function emergencyFreeze() external {
        if (msg.sender != guardian && msg.sender != owner()) revert NotAuthorized();
        emergencyFrozen = true;
        emit EmergencyFrozen(msg.sender);
    }

    /// @notice Emergency unfreeze — only owner (not guardian).
    function emergencyUnfreeze() external onlyOwner {
        emergencyFrozen = false;
        emit EmergencyUnfrozen();
    }

    // ═══════════════════════════════════════════════════════════════════
    //                          COOLDOWN
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Set cooldown period between delegate transactions.
     * @param seconds_ Cooldown in seconds (0 = disabled)
     */
    function setDelegateCooldown(uint256 seconds_) external onlyOwner {
        delegateCooldown = seconds_;
    }

    // ═══════════════════════════════════════════════════════════════════
    //                           SWEEP
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Sweep all AVAX to a given address. Useful before selling/fusing.
     * @param to Recipient address
     */
    function sweepAVAX(address payable to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = address(this).balance;
        if (bal == 0) return;
        (bool ok,) = to.call{value: bal}("");
        if (!ok) revert SweepFailed();
        emit Swept(to, bal);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                          ERC-165
    // ═══════════════════════════════════════════════════════════════════

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IERC6551Account).interfaceId ||
            interfaceId == type(IERC6551Executable).interfaceId;
    }

    // ═══════════════════════════════════════════════════════════════════
    //                          INTERNAL
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @dev Returns true if the signer is the NFT owner OR a valid, non-expired delegate
     *      authorized by the current owner.
     */
    function _isValidSigner(address signer) internal view returns (bool) {
        address currentOwner = owner();
        if (signer == currentOwner) return true;

        DelegateInfo memory d = _delegates[signer];
        if (!d.active) return false;
        if (d.authorizedBy != currentOwner) return false;
        if (d.expiresAt != 0 && block.timestamp >= d.expiresAt) revert DelegateExpired();
        return true;
    }

    /**
     * @dev Check if a selector is one of the blocked ERC-20 selectors.
     */
    function _isBlockedSelector(bytes4 selector) internal pure returns (bool) {
        return selector == TRANSFER_SELECTOR ||
               selector == TRANSFER_FROM_SELECTOR ||
               selector == APPROVE_SELECTOR;
    }
}
