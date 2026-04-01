// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FrostbiteAccountV2 — ERC-6551 Token Bound Account with Delegation
 * @notice Phase 3 upgrade: adds delegate support so an external operator
 *         (e.g., an autonomous battle agent) can call execute() on the TBA
 *         without being the NFT owner.
 *
 *         Audit fixes applied:
 *         - C-3: Dynamic bytecode offset instead of hardcoded 0x4d
 *         - C-1: Delegate spend limits + allowed target whitelist
 *         - C-2: Delegate persistence across NFT transfers (authorizedBy check)
 *
 *         New TBAs should be created with this implementation via the
 *         canonical ERC-6551 Registry. Existing V1 TBAs remain unchanged.
 */

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/* ---- ERC-6551 Interfaces (inline to avoid external dependency) ---- */

interface IERC6551Account {
    receive() external payable;
    function token() external view returns (uint256 chainId, address tokenContract, uint256 tokenId);
    function state() external view returns (uint256);
    function isValidSigner(address signer, bytes calldata context) external view returns (bytes4);
}

interface IERC6551Executable {
    function execute(address to, uint256 value, bytes calldata data, uint8 operation) external payable returns (bytes memory);
}

contract FrostbiteAccountV2 is IERC6551Account, IERC6551Executable, IERC165 {
    /* ---- Types ---- */

    /// @notice Delegate info — tracks who authorized the delegate (C-2 fix)
    struct DelegateInfo {
        bool active;
        address authorizedBy;
    }

    /* ---- State ---- */
    uint256 private _state;
    bool private _locked;

    /// @notice Delegate info per address (C-2: includes authorizedBy for transfer safety)
    mapping(address => DelegateInfo) private _delegates;

    /// @notice Whitelisted target addresses for delegate calls (C-1 fix)
    mapping(address => bool) private _allowedTargets;

    /// @notice Maximum AVAX a delegate can send per execute() call (C-1 fix)
    uint256 public delegateSpendLimit;

    /* ---- Events ---- */
    event Executed(address indexed to, uint256 value, bytes data, uint256 newState);
    event Received(address indexed from, uint256 amount);
    event DelegateAdded(address indexed delegate);
    event DelegateRemoved(address indexed delegate);
    event AllowedTargetSet(address indexed target, bool allowed);
    event DelegateSpendLimitSet(uint256 limit);

    /* ---- Errors ---- */
    error NotAuthorized();
    error OnlyCallOperation();
    error ExecutionFailed();
    error ReentrancyGuard();
    error NotOwner();
    error TargetNotAllowed();
    error SpendLimitExceeded();

    /* ---- Modifiers ---- */
    modifier nonReentrant() {
        if (_locked) revert ReentrancyGuard();
        _locked = true;
        _;
        _locked = false;
    }

    /* ---- Receive AVAX ---- */
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /* ---- ERC-6551 Core ---- */

    /**
     * @notice Returns the token that this account is bound to.
     * @dev C-3 fix: uses dynamic extcodesize offset instead of hardcoded 0x4d.
     *      The token info is stored in the last 96 bytes of the clone bytecode
     *      (appended by the ERC-6551 Registry).
     */
    function token() public view returns (uint256 chainId, address tokenContract, uint256 tokenId) {
        bytes memory footer = new bytes(3 * 32);
        assembly {
            extcodecopy(address(), add(footer, 0x20), sub(extcodesize(address()), 0x60), 0x60)
        }
        return abi.decode(footer, (uint256, address, uint256));
    }

    /**
     * @notice State counter — increments on every execute() call.
     */
    function state() external view returns (uint256) {
        return _state;
    }

    /**
     * @notice Returns the owner of this account (= owner of the bound NFT).
     */
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

    /**
     * @notice Execute a call from this account.
     * @param to Target address
     * @param value AVAX to send
     * @param data Calldata
     * @param operation Must be 0 (CALL). DELEGATECALL not supported.
     * @dev C-1 fix: delegates are restricted to allowed targets and spend limits.
     */
    function execute(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation
    ) external payable nonReentrant returns (bytes memory result) {
        if (!_isValidSigner(msg.sender)) revert NotAuthorized();
        if (operation != 0) revert OnlyCallOperation();

        // C-1: Delegate spend restrictions
        if (msg.sender != owner()) {
            // Caller is a delegate — restrict targets
            if (!_allowedTargets[to]) revert TargetNotAllowed();
            // Enforce per-tx spend limit for AVAX transfers
            if (value > 0 && value > delegateSpendLimit) revert SpendLimitExceeded();
        }

        ++_state;

        bool success;
        (success, result) = to.call{value: value}(data);
        if (!success) revert ExecutionFailed();

        emit Executed(to, value, data, _state);
    }

    /* ---- Delegation Management ---- */

    /**
     * @notice Add a delegate who can call execute() on this TBA.
     * @dev C-2 fix: records msg.sender (owner) as authorizedBy. If the NFT is
     *      transferred, the delegate becomes invalid because authorizedBy != new owner.
     * @param delegate The address to authorize
     */
    function addDelegate(address delegate) external {
        if (msg.sender != owner()) revert NotOwner();
        _delegates[delegate] = DelegateInfo(true, msg.sender);
        emit DelegateAdded(delegate);
    }

    /**
     * @notice Remove a delegate's authorization.
     * @param delegate The address to de-authorize
     */
    function removeDelegate(address delegate) external {
        if (msg.sender != owner()) revert NotOwner();
        delete _delegates[delegate];
        emit DelegateRemoved(delegate);
    }

    /**
     * @notice Check if an address is currently a valid delegate on this TBA.
     * @dev C-2 fix: checks that the delegate was authorized by the current owner.
     * @param addr The address to check
     * @return True if the address is a valid delegate
     */
    function isDelegate(address addr) external view returns (bool) {
        DelegateInfo memory d = _delegates[addr];
        return d.active && d.authorizedBy == owner();
    }

    /* ---- C-1: Allowed Target Management ---- */

    /**
     * @notice Set whether a target address is allowed for delegate calls.
     * @param target The target contract address
     * @param allowed Whether the target should be allowed
     */
    function setAllowedTarget(address target, bool allowed) external {
        if (msg.sender != owner()) revert NotOwner();
        _allowedTargets[target] = allowed;
        emit AllowedTargetSet(target, allowed);
    }

    /**
     * @notice Check if a target address is allowed for delegate calls.
     * @param target The target address to check
     * @return True if the target is allowed
     */
    function isAllowedTarget(address target) external view returns (bool) {
        return _allowedTargets[target];
    }

    /**
     * @notice Set the maximum AVAX a delegate can send per execute() call.
     * @param limit The maximum AVAX value in wei
     */
    function setDelegateSpendLimit(uint256 limit) external {
        if (msg.sender != owner()) revert NotOwner();
        delegateSpendLimit = limit;
        emit DelegateSpendLimitSet(limit);
    }

    /* ---- ERC-165 ---- */

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IERC6551Account).interfaceId ||
            interfaceId == type(IERC6551Executable).interfaceId;
    }

    /* ---- Internal ---- */

    /**
     * @dev Returns true if the signer is the NFT owner OR a valid delegate.
     *      C-2 fix: delegate must have been authorized by the current owner.
     */
    function _isValidSigner(address signer) internal view returns (bool) {
        address currentOwner = owner();
        if (signer == currentOwner) return true;
        DelegateInfo memory d = _delegates[signer];
        return d.active && d.authorizedBy == currentOwner;
    }
}
