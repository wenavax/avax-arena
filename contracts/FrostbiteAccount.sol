// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FrostbiteAccount — ERC-6551 Token Bound Account for Frostbite Warriors
 * @notice Each warrior NFT gets its own smart contract wallet.
 *         The wallet is controlled by whoever owns the warrior.
 *         It can hold AVAX, ERC-20 tokens, and execute arbitrary calls.
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

contract FrostbiteAccount is IERC6551Account, IERC6551Executable, IERC165 {
    /* ---- State ---- */
    uint256 private _state;
    bool private _locked;

    /* ---- Events ---- */
    event Executed(address indexed to, uint256 value, bytes data, uint256 newState);
    event Received(address indexed from, uint256 amount);

    /* ---- Errors ---- */
    error NotAuthorized();
    error OnlyCallOperation();
    error ExecutionFailed();
    error ReentrancyGuard();

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
     * @dev The token info is stored in the bytecode of the clone (appended by the ERC-6551 Registry).
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
     * @dev Returns the magic value if the signer is the NFT owner.
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
     */
    function execute(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation
    ) external payable nonReentrant returns (bytes memory result) {
        if (!_isValidSigner(msg.sender)) revert NotAuthorized();
        if (operation != 0) revert OnlyCallOperation();

        ++_state;

        bool success;
        (success, result) = to.call{value: value}(data);
        if (!success) revert ExecutionFailed();

        emit Executed(to, value, data, _state);
    }

    /* ---- ERC-165 ---- */

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IERC6551Account).interfaceId ||
            interfaceId == type(IERC6551Executable).interfaceId;
    }

    /* ---- Internal ---- */

    function _isValidSigner(address signer) internal view returns (bool) {
        return signer == owner();
    }
}
