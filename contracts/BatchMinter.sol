// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BatchMinter
 * @notice Stateless helper that calls ArenaWarrior.mint() N times in a single
 *         transaction, collects the minted NFTs, and transfers them to the caller.
 */
contract BatchMinter is ERC721Holder, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 public constant MINT_PRICE = 0.01 ether;
    uint256 public constant MAX_BATCH_SIZE = 20;

    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    /// @notice The ArenaWarrior NFT contract.
    IERC721 public immutable arenaWarrior;

    /// @notice The ArenaWarrior address (for low-level mint calls).
    address public immutable arenaWarriorAddress;

    // -------------------------------------------------------------------------
    // Transient storage (within a single TX)
    // -------------------------------------------------------------------------

    /// @dev Token IDs received via onERC721Received during the current batchMint.
    uint256[] private _mintedTokenIds;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event BatchMinted(address indexed to, uint256 quantity, uint256[] tokenIds);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error InvalidQuantity();
    error InsufficientPayment();
    error MintFailed();
    error TransferFailed();
    error UnauthorizedNFT();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _arenaWarrior) {
        arenaWarrior = IERC721(_arenaWarrior);
        arenaWarriorAddress = _arenaWarrior;
    }

    // -------------------------------------------------------------------------
    // Batch Mint
    // -------------------------------------------------------------------------

    /**
     * @notice Mint `quantity` warriors in a single transaction.
     * @param quantity Number of warriors to mint (1-20).
     */
    function batchMint(uint256 quantity) external payable nonReentrant {
        if (quantity == 0 || quantity > MAX_BATCH_SIZE) revert InvalidQuantity();
        if (msg.value < quantity * MINT_PRICE) revert InsufficientPayment();

        // Clear any stale data
        delete _mintedTokenIds;

        // Mint N warriors sequentially
        for (uint256 i = 0; i < quantity; i++) {
            (bool success, ) = arenaWarriorAddress.call{value: MINT_PRICE}(
                abi.encodeWithSignature("mint()")
            );
            if (!success) revert MintFailed();
        }

        // Transfer all minted NFTs to the caller
        uint256[] memory tokenIds = _mintedTokenIds;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            arenaWarrior.safeTransferFrom(address(this), msg.sender, tokenIds[i]);
        }

        emit BatchMinted(msg.sender, quantity, tokenIds);

        // Refund excess payment
        uint256 excess = msg.value - (quantity * MINT_PRICE);
        if (excess > 0) {
            (bool refundSuccess, ) = payable(msg.sender).call{value: excess}("");
            if (!refundSuccess) revert TransferFailed();
        }

        // Clean up
        delete _mintedTokenIds;
    }

    // -------------------------------------------------------------------------
    // ERC721Holder override — record received token IDs
    // -------------------------------------------------------------------------

    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes memory
    ) public override returns (bytes4) {
        // Only accept NFTs from the ArenaWarrior contract
        if (msg.sender != arenaWarriorAddress) revert UnauthorizedNFT();
        _mintedTokenIds.push(tokenId);
        return this.onERC721Received.selector;
    }

    // -------------------------------------------------------------------------
    // Receive — accept refunds from ArenaWarrior
    // -------------------------------------------------------------------------

    receive() external payable {}
}
