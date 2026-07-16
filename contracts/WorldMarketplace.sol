// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";

/**
 * @title WorldMarketplace
 * @author Frostbite Team
 * @notice Dual-NFT marketplace supporting ERC-721 (FrostbiteHeroes) and ERC-1155
 *         (FrostbiteItems) with full security hardening.
 *
 * @dev Security improvements over FrostbiteMarketplace:
 *  - [HIGH-1] All refunds use pull-payment exclusively; no AVAX pushes in loops.
 *  - [HIGH-2] Front-running protection via `maxPrice` parameter on buys.
 *  - [HIGH-3] Offer stacking fixed; previous amount is cleared before recalculating.
 *  - [MED-4]  Pausable in emergencies.
 *  - [MED-5]  Fees sent directly to feeRecipient on each sale; never accumulated.
 *  - [MED-6]  Approval checked explicitly before transfer with clear errors.
 *  - [MED-7]  Offerer arrays cleaned up on cancellation to prevent unbounded growth.
 *  - [LOW-8]  Events emitted for all admin actions.
 *  - [LOW-9]  Indexed fields on all events where beneficial.
 */
contract WorldMarketplace is Ownable, Pausable, ReentrancyGuard, IERC1155Receiver {
    // =========================================================================
    //                              CONSTANTS
    // =========================================================================

    /// @notice Marketplace fee: 2.5% (250 basis points out of 10,000).
    uint256 public constant FEE_BASIS_POINTS = 250;
    uint256 public constant BASIS_POINTS = 10_000;

    /// @notice Maximum number of concurrent offers per listing to prevent DoS.
    uint256 public constant MAX_OFFERS_PER_LISTING = 50;

    /// @notice Maximum listings returned by getMyListings to bound gas.
    uint256 public constant MAX_MY_LISTINGS = 100;

    // =========================================================================
    //                           DATA STRUCTURES
    // =========================================================================

    /// @notice Distinguishes between ERC-721 heroes and ERC-1155 items.
    enum NftType {
        Hero,
        Item
    }

    /// @notice A marketplace listing. Uses a global listingId counter to support
    ///         multiple ERC-1155 listings for the same tokenId.
    struct Listing {
        NftType nftType;
        address seller;
        uint256 tokenId;
        uint256 amount; // 1 for ERC-721, 1+ for ERC-1155
        uint256 price;
        bool active;
    }

    /// @notice An offer on a specific listing.
    struct Offer {
        address offerer;
        uint256 amount;
        uint256 timestamp;
    }

    // =========================================================================
    //                           STATE VARIABLES
    // =========================================================================

    /// @notice FrostbiteHeroes ERC-721 contract.
    IERC721 public heroContract;

    /// @notice FrostbiteItems ERC-1155 contract.
    IERC1155 public itemContract;

    /// @notice Address that receives marketplace fees on each sale.
    address public feeRecipient;

    /// @notice Monotonically increasing listing ID counter.
    uint256 public nextListingId;

    /// @notice All listings by their ID.
    mapping(uint256 => Listing) public listings;

    /// @notice listingId => offerer => Offer
    mapping(uint256 => mapping(address => Offer)) public offers;

    /// @notice listingId => array of offerer addresses (for enumeration).
    mapping(uint256 => address[]) private _offerersOf;

    /// @notice listingId => offerer => index in _offerersOf array (1-based to
    ///         distinguish from default 0). 0 means not present.
    mapping(uint256 => mapping(address => uint256)) private _offererIndex;

    /// @notice Active listing tracking (swap-and-pop for O(1) removal).
    uint256[] private _activeListingIds;
    mapping(uint256 => uint256) private _listingIndex; // listingId => index in array

    /// @notice Pull-payment ledger for failed/pending refunds.
    ///         [HIGH-1] All offer refunds are credited here; users withdraw themselves.
    mapping(address => uint256) public pendingReturns;

    // =========================================================================
    //                               EVENTS
    // =========================================================================

    /// @notice Emitted when an ERC-721 hero is listed.
    event HeroListed(
        uint256 indexed listingId,
        address indexed seller,
        uint256 indexed tokenId,
        uint256 price
    );

    /// @notice Emitted when ERC-1155 items are listed.
    event ItemListed(
        uint256 indexed listingId,
        address indexed seller,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 price
    );

    /// @notice Emitted when a listing is cancelled.
    event ListingCancelled(
        uint256 indexed listingId,
        address indexed seller
    );

    /// @notice Emitted when a listing is purchased.
    event ListingSold(
        uint256 indexed listingId,
        address indexed seller,
        address indexed buyer,
        uint256 price,
        uint256 fee
    );

    /// @notice Emitted when an offer is made on a listing.
    event OfferMade(
        uint256 indexed listingId,
        address indexed offerer,
        uint256 amount
    );

    /// @notice Emitted when an offer is cancelled.
    event OfferCancelled(
        uint256 indexed listingId,
        address indexed offerer,
        uint256 amount
    );

    /// @notice Emitted when a seller accepts an offer.
    event OfferAccepted(
        uint256 indexed listingId,
        address indexed seller,
        address indexed offerer,
        uint256 amount,
        uint256 fee
    );

    /// @notice Emitted when pending returns are withdrawn.
    event PendingReturnWithdrawn(
        address indexed recipient,
        uint256 amount
    );

    /// @notice [LOW-8] Emitted when the fee recipient is changed.
    event FeeRecipientUpdated(
        address indexed oldRecipient,
        address indexed newRecipient
    );

    /// @notice Emitted when NFT contract addresses are updated.
    event ContractsUpdated(
        address indexed heroContract,
        address indexed itemContract
    );

    // =========================================================================
    //                            CUSTOM ERRORS
    // =========================================================================

    /// @notice Caller does not own the NFT they are trying to list.
    error NotNFTOwner();

    /// @notice Price must be greater than zero.
    error PriceZero();

    /// @notice Amount must be greater than zero (ERC-1155).
    error AmountZero();

    /// @notice The listing is not active.
    error ListingNotActive();

    /// @notice Caller is not the seller of this listing.
    error NotSeller();

    /// @notice Buyer sent less AVAX than the listing price.
    error InsufficientPayment();

    /// @notice [HIGH-2] Listing price exceeds the buyer's maxPrice (front-run protection).
    error PriceExceedsMaximum();

    /// @notice AVAX transfer failed.
    error TransferFailed();

    /// @notice Address is the zero address.
    error InvalidAddress();

    /// @notice Offer amount must be greater than zero.
    error OfferTooLow();

    /// @notice No active offer exists from this address.
    error NoOffer();

    /// @notice Cannot buy or bid on your own listing.
    error CannotBuyOwnListing();

    /// @notice Too many offers on this listing (DoS protection).
    error TooManyOffers();

    /// @notice No pending returns available for withdrawal.
    error NoPendingReturns();

    /// @notice [MED-6] NFT contract has not been approved for marketplace transfers.
    error NotApprovedForMarketplace();

    /// @notice Cannot update contracts while listings are active.
    error ActiveListingsExist();

    // =========================================================================
    //                            CONSTRUCTOR
    // =========================================================================

    /**
     * @notice Deploy the WorldMarketplace.
     * @param _heroContract  Address of the FrostbiteHeroes ERC-721 contract.
     * @param _itemContract  Address of the FrostbiteItems ERC-1155 contract.
     * @param _feeRecipient  Address that receives the 2.5% marketplace fee.
     */
    constructor(
        address _heroContract,
        address _itemContract,
        address _feeRecipient
    ) Ownable(msg.sender) {
        if (
            _heroContract == address(0) ||
            _itemContract == address(0) ||
            _feeRecipient == address(0)
        ) revert InvalidAddress();

        heroContract = IERC721(_heroContract);
        itemContract = IERC1155(_itemContract);
        feeRecipient = _feeRecipient;
    }

    // =========================================================================
    //                          LISTING FUNCTIONS
    // =========================================================================

    /**
     * @notice List an ERC-721 hero for sale. The hero is transferred into escrow.
     * @dev    [MED-6] Checks approval before attempting the transfer.
     * @param tokenId The hero token ID to list.
     * @param price   Sale price in wei (must be > 0).
     */
    function listHero(
        uint256 tokenId,
        uint256 price
    ) external nonReentrant whenNotPaused {
        if (heroContract.ownerOf(tokenId) != msg.sender) revert NotNFTOwner();
        if (price == 0) revert PriceZero();

        // [MED-6] Explicit approval check with clear error
        if (
            heroContract.getApproved(tokenId) != address(this) &&
            !heroContract.isApprovedForAll(msg.sender, address(this))
        ) revert NotApprovedForMarketplace();

        // Escrow: transfer hero to marketplace
        heroContract.transferFrom(msg.sender, address(this), tokenId);

        uint256 listingId = nextListingId++;
        listings[listingId] = Listing({
            nftType: NftType.Hero,
            seller: msg.sender,
            tokenId: tokenId,
            amount: 1,
            price: price,
            active: true
        });

        _listingIndex[listingId] = _activeListingIds.length;
        _activeListingIds.push(listingId);

        emit HeroListed(listingId, msg.sender, tokenId, price);
    }

    /**
     * @notice List ERC-1155 items for sale. Items are transferred into escrow.
     * @dev    [MED-6] Checks approval before attempting the transfer.
     * @param tokenId The item token ID to list.
     * @param amount  Number of items to list (must be > 0).
     * @param price   Total sale price in wei for all items (must be > 0).
     */
    function listItem(
        uint256 tokenId,
        uint256 amount,
        uint256 price
    ) external nonReentrant whenNotPaused {
        if (amount == 0) revert AmountZero();
        if (price == 0) revert PriceZero();
        if (itemContract.balanceOf(msg.sender, tokenId) < amount)
            revert NotNFTOwner();

        // [MED-6] Explicit approval check with clear error
        if (!itemContract.isApprovedForAll(msg.sender, address(this)))
            revert NotApprovedForMarketplace();

        // Escrow: transfer items to marketplace
        itemContract.safeTransferFrom(msg.sender, address(this), tokenId, amount, "");

        uint256 listingId = nextListingId++;
        listings[listingId] = Listing({
            nftType: NftType.Item,
            seller: msg.sender,
            tokenId: tokenId,
            amount: amount,
            price: price,
            active: true
        });

        _listingIndex[listingId] = _activeListingIds.length;
        _activeListingIds.push(listingId);

        emit ItemListed(listingId, msg.sender, tokenId, amount, price);
    }

    /**
     * @notice Cancel a listing and return the escrowed NFT to the seller.
     * @param listingId The listing to cancel.
     */
    function cancelListing(uint256 listingId) external nonReentrant whenNotPaused {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (listing.seller != msg.sender) revert NotSeller();

        listing.active = false;
        _removeActiveListing(listingId);

        // Return escrowed NFT
        _transferNftTo(listing, msg.sender);

        // [HIGH-1] Credit all offerers via pull-payment (no AVAX push in loop)
        _creditAllOffersToPendingReturns(listingId, address(0));

        emit ListingCancelled(listingId, msg.sender);
    }

    // =========================================================================
    //                           BUY FUNCTION
    // =========================================================================

    /**
     * @notice Buy a listed NFT at its asking price.
     * @dev    [HIGH-2] maxPrice parameter prevents front-running attacks where an
     *         attacker relists at a higher price after seeing the buy TX in mempool.
     * @param listingId The listing to purchase.
     * @param maxPrice  Maximum price the buyer is willing to pay (slippage protection).
     */
    function buyListing(
        uint256 listingId,
        uint256 maxPrice
    ) external payable nonReentrant whenNotPaused {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (listing.seller == msg.sender) revert CannotBuyOwnListing();

        // [HIGH-2] Front-running protection
        if (listing.price > maxPrice) revert PriceExceedsMaximum();
        if (msg.value < listing.price) revert InsufficientPayment();

        address seller = listing.seller;
        uint256 price = listing.price;

        // Deactivate listing BEFORE external calls (CEI pattern)
        listing.active = false;
        _removeActiveListing(listingId);

        // [MED-5] Calculate and send fee directly to feeRecipient
        uint256 fee = (price * FEE_BASIS_POINTS) / BASIS_POINTS;
        uint256 sellerProceeds = price - fee;

        // Transfer NFT to buyer
        _transferNftTo(listing, msg.sender);

        // Pay fee directly to feeRecipient
        (bool feeSent, ) = feeRecipient.call{value: fee}("");
        if (!feeSent) revert TransferFailed();

        // Pay seller
        (bool sellerPaid, ) = seller.call{value: sellerProceeds}("");
        if (!sellerPaid) {
            // If seller payment fails, credit to pull-payment
            pendingReturns[seller] += sellerProceeds;
        }

        // Refund overpayment
        if (msg.value > price) {
            uint256 refund = msg.value - price;
            (bool refunded, ) = msg.sender.call{value: refund}("");
            if (!refunded) {
                pendingReturns[msg.sender] += refund;
            }
        }

        // [HIGH-1] Credit all remaining offerers via pull-payment
        _creditAllOffersToPendingReturns(listingId, msg.sender);

        emit ListingSold(listingId, seller, msg.sender, price, fee);
    }

    // =========================================================================
    //                          OFFER FUNCTIONS
    // =========================================================================

    /**
     * @notice Make an offer on a listing. Replaces any previous offer from the
     *         same address on the same listing.
     * @dev    [HIGH-3] Previous offer amount is credited to pendingReturns before
     *         recording the new offer, preventing stacking vulnerabilities.
     * @param listingId The listing to make an offer on.
     */
    function makeOffer(
        uint256 listingId
    ) external payable nonReentrant whenNotPaused {
        if (msg.value == 0) revert OfferTooLow();

        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (listing.seller == msg.sender) revert CannotBuyOwnListing();

        Offer storage existing = offers[listingId][msg.sender];

        if (existing.amount > 0) {
            // [HIGH-3] Credit previous offer to pendingReturns BEFORE setting new amount.
            // This prevents the stacking vulnerability where amount = old + new could
            // lead to accounting errors if called twice in the same block.
            pendingReturns[msg.sender] += existing.amount;
        } else {
            // New offerer: enforce limit to prevent DoS via unbounded array
            if (_offerersOf[listingId].length >= MAX_OFFERS_PER_LISTING)
                revert TooManyOffers();

            // Track position for O(1) cleanup
            _offerersOf[listingId].push(msg.sender);
            _offererIndex[listingId][msg.sender] = _offerersOf[listingId].length; // 1-based
        }

        offers[listingId][msg.sender] = Offer({
            offerer: msg.sender,
            amount: msg.value, // Only the new value, not stacked
            timestamp: block.timestamp
        });

        emit OfferMade(listingId, msg.sender, msg.value);
    }

    /**
     * @notice Cancel your offer on a listing. The offer amount is credited to
     *         pendingReturns for withdrawal via withdrawPendingReturn().
     * @dev    [HIGH-1] Uses pull-payment instead of direct transfer.
     *         [MED-7]  Removes the offerer from the array to prevent unbounded growth.
     * @param listingId The listing your offer is on.
     */
    function cancelOffer(uint256 listingId) external nonReentrant whenNotPaused {
        Offer storage offer = offers[listingId][msg.sender];
        uint256 amount = offer.amount;
        if (amount == 0) revert NoOffer();

        // Clear offer state BEFORE crediting (CEI)
        offer.amount = 0;

        // [MED-7] Remove offerer from array (swap-and-pop)
        _removeOfferer(listingId, msg.sender);

        // [HIGH-1] Credit to pull-payment instead of direct transfer
        pendingReturns[msg.sender] += amount;

        emit OfferCancelled(listingId, msg.sender, amount);
    }

    /**
     * @notice Accept an offer on your listing. Transfers the NFT to the offerer
     *         and pays the seller minus the marketplace fee.
     * @dev    [MED-5] Fee sent directly to feeRecipient.
     *         [HIGH-1] Remaining offers credited to pendingReturns.
     * @param listingId The listing to sell.
     * @param offerer   The address whose offer to accept.
     */
    function acceptOffer(
        uint256 listingId,
        address offerer
    ) external nonReentrant whenNotPaused {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (listing.seller != msg.sender) revert NotSeller();

        Offer storage offer = offers[listingId][offerer];
        uint256 amount = offer.amount;
        if (amount == 0) revert NoOffer();

        // Clear state BEFORE external calls (CEI)
        offer.amount = 0;
        listing.active = false;
        _removeActiveListing(listingId);

        // [MED-5] Calculate and send fee directly
        uint256 fee = (amount * FEE_BASIS_POINTS) / BASIS_POINTS;
        uint256 sellerProceeds = amount - fee;

        // Transfer NFT to offerer
        _transferNftTo(listing, offerer);

        // Pay fee directly to feeRecipient
        (bool feeSent, ) = feeRecipient.call{value: fee}("");
        if (!feeSent) revert TransferFailed();

        // Pay seller
        (bool sellerPaid, ) = msg.sender.call{value: sellerProceeds}("");
        if (!sellerPaid) {
            pendingReturns[msg.sender] += sellerProceeds;
        }

        // [HIGH-1] Credit all remaining offerers via pull-payment (exclude accepted)
        _creditAllOffersToPendingReturns(listingId, offerer);

        emit OfferAccepted(listingId, msg.sender, offerer, amount, fee);
    }

    // =========================================================================
    //                        PULL-PAYMENT WITHDRAWAL
    // =========================================================================

    /**
     * @notice Withdraw any AVAX credited to your pendingReturns balance.
     *         This covers: outbid offers, cancelled listing refunds, failed
     *         direct transfers, and offer refunds after a sale.
     */
    function withdrawPendingReturn() external nonReentrant {
        uint256 amount = pendingReturns[msg.sender];
        if (amount == 0) revert NoPendingReturns();

        // Zero balance BEFORE transfer (CEI)
        pendingReturns[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit PendingReturnWithdrawn(msg.sender, amount);
    }

    // =========================================================================
    //                          ADMIN FUNCTIONS
    // =========================================================================

    /**
     * @notice Pause all marketplace operations in case of emergency.
     *         [MED-4] Pausable pattern for circuit-breaker capability.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Resume marketplace operations.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Update the fee recipient address.
     *         [LOW-8] Emits FeeRecipientUpdated event.
     * @param _feeRecipient New fee recipient address.
     */
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert InvalidAddress();
        address old = feeRecipient;
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(old, _feeRecipient);
    }

    /**
     * @notice Update the NFT contract addresses. Can only be called when no
     *         listings are active to prevent orphaned escrow.
     * @param _heroContract New ERC-721 hero contract address.
     * @param _itemContract New ERC-1155 item contract address.
     */
    function setContracts(
        address _heroContract,
        address _itemContract
    ) external onlyOwner {
        if (_heroContract == address(0) || _itemContract == address(0))
            revert InvalidAddress();
        if (_activeListingIds.length > 0) revert ActiveListingsExist();

        heroContract = IERC721(_heroContract);
        itemContract = IERC1155(_itemContract);

        emit ContractsUpdated(_heroContract, _itemContract);
    }

    // =========================================================================
    //                          VIEW FUNCTIONS
    // =========================================================================

    /**
     * @notice Get the details of a listing by its ID.
     * @param listingId The listing ID to query.
     * @return The Listing struct.
     */
    function getListing(uint256 listingId) external view returns (Listing memory) {
        return listings[listingId];
    }

    /**
     * @notice Get a paginated slice of active listing IDs.
     * @param offset Starting index in the active listings array.
     * @param limit  Maximum number of listing IDs to return.
     * @return ids   Array of active listing IDs.
     */
    function getActiveListings(
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory ids) {
        uint256 total = _activeListingIds.length;
        if (offset >= total) return new uint256[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;

        uint256 count = end - offset;
        ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = _activeListingIds[offset + i];
        }
    }

    /**
     * @notice Get the total number of currently active listings.
     * @return The count of active listings.
     */
    function getActiveListingCount() external view returns (uint256) {
        return _activeListingIds.length;
    }

    /**
     * @notice Get all active listing IDs for a specific seller.
     * @dev    Returns at most MAX_MY_LISTINGS (100) to bound gas usage.
     * @param seller The seller address to query.
     * @return ids   Array of active listing IDs belonging to the seller.
     */
    function getMyListings(
        address seller
    ) external view returns (uint256[] memory ids) {
        uint256 total = _activeListingIds.length;
        uint256[] memory temp = new uint256[](
            total < MAX_MY_LISTINGS ? total : MAX_MY_LISTINGS
        );
        uint256 count = 0;

        for (uint256 i = 0; i < total && count < MAX_MY_LISTINGS; i++) {
            uint256 lid = _activeListingIds[i];
            if (listings[lid].seller == seller) {
                temp[count] = lid;
                count++;
            }
        }

        // Trim to actual count
        ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = temp[i];
        }
    }

    /**
     * @notice Get all active offers on a listing.
     * @param listingId The listing to query offers for.
     * @return result   Array of active Offer structs.
     */
    function getOffers(
        uint256 listingId
    ) external view returns (Offer[] memory result) {
        address[] storage offerers = _offerersOf[listingId];
        uint256 len = offerers.length;
        uint256 count = 0;

        // Count active offers
        for (uint256 i = 0; i < len; i++) {
            if (offers[listingId][offerers[i]].amount > 0) {
                count++;
            }
        }

        result = new Offer[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < len; i++) {
            Offer storage o = offers[listingId][offerers[i]];
            if (o.amount > 0) {
                result[idx] = o;
                idx++;
            }
        }
    }

    // =========================================================================
    //                      ERC-1155 RECEIVER INTERFACE
    // =========================================================================

    /**
     * @notice Handle receipt of a single ERC-1155 token type. Required to accept
     *         ERC-1155 safeTransferFrom calls during listing escrow.
     * @return The function selector `IERC1155Receiver.onERC1155Received.selector`.
     */
    function onERC1155Received(
        address /* operator */,
        address /* from */,
        uint256 /* id */,
        uint256 /* value */,
        bytes calldata /* data */
    ) external pure override returns (bytes4) {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    /**
     * @notice Handle receipt of multiple ERC-1155 token types. Required by the
     *         IERC1155Receiver interface.
     * @return The function selector `IERC1155Receiver.onERC1155BatchReceived.selector`.
     */
    function onERC1155BatchReceived(
        address /* operator */,
        address /* from */,
        uint256[] calldata /* ids */,
        uint256[] calldata /* values */,
        bytes calldata /* data */
    ) external pure override returns (bytes4) {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    /**
     * @notice ERC-165 interface detection. Reports support for IERC1155Receiver
     *         and ERC-165 itself.
     * @param interfaceId The interface identifier to check.
     * @return True if the interface is supported.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) external pure override returns (bool) {
        return
            interfaceId == type(IERC1155Receiver).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }

    // =========================================================================
    //                         INTERNAL HELPERS
    // =========================================================================

    /**
     * @dev Transfer an escrowed NFT to the given recipient based on listing type.
     * @param listing The listing containing NFT details (type, tokenId, amount).
     * @param to      The recipient address.
     */
    function _transferNftTo(Listing storage listing, address to) internal {
        if (listing.nftType == NftType.Hero) {
            heroContract.transferFrom(address(this), to, listing.tokenId);
        } else {
            itemContract.safeTransferFrom(
                address(this),
                to,
                listing.tokenId,
                listing.amount,
                ""
            );
        }
    }

    /**
     * @dev Remove a listing ID from the active listings array using swap-and-pop
     *      for O(1) gas cost.
     * @param listingId The listing ID to remove.
     */
    function _removeActiveListing(uint256 listingId) internal {
        uint256 index = _listingIndex[listingId];
        uint256 lastIndex = _activeListingIds.length - 1;

        if (index != lastIndex) {
            uint256 lastId = _activeListingIds[lastIndex];
            _activeListingIds[index] = lastId;
            _listingIndex[lastId] = index;
        }

        _activeListingIds.pop();
        delete _listingIndex[listingId];
    }

    /**
     * @dev [HIGH-1] Credit all active offers on a listing to pendingReturns.
     *      Never sends AVAX directly; offerers must call withdrawPendingReturn().
     *      This eliminates the reentrancy vector from the original _refundAllOffers.
     *
     * @param listingId       The listing whose offers to refund.
     * @param excludedAddress An address to skip (e.g., the buyer or accepted offerer).
     *                        Pass address(0) to refund everyone.
     */
    function _creditAllOffersToPendingReturns(
        uint256 listingId,
        address excludedAddress
    ) internal {
        address[] storage offerers = _offerersOf[listingId];
        uint256 len = offerers.length;

        for (uint256 i = 0; i < len; i++) {
            address offerer = offerers[i];
            uint256 amount = offers[listingId][offerer].amount;

            if (amount > 0 && offerer != excludedAddress) {
                // Clear offer state
                offers[listingId][offerer].amount = 0;

                // Credit to pull-payment ledger (NO external call)
                pendingReturns[offerer] += amount;
            }
        }
    }

    /**
     * @dev [MED-7] Remove an offerer from the _offerersOf array using swap-and-pop.
     *      This prevents unbounded array growth from cancelled offers.
     * @param listingId The listing the offerer is being removed from.
     * @param offerer   The address to remove.
     */
    function _removeOfferer(uint256 listingId, address offerer) internal {
        uint256 oneBasedIdx = _offererIndex[listingId][offerer];
        if (oneBasedIdx == 0) return; // Not tracked (shouldn't happen)

        uint256 idx = oneBasedIdx - 1;
        address[] storage arr = _offerersOf[listingId];
        uint256 lastIdx = arr.length - 1;

        if (idx != lastIdx) {
            address lastOfferer = arr[lastIdx];
            arr[idx] = lastOfferer;
            _offererIndex[listingId][lastOfferer] = oneBasedIdx; // Keep 1-based
        }

        arr.pop();
        delete _offererIndex[listingId][offerer];
    }
}
