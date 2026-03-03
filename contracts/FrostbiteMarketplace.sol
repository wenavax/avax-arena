// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title FrostbiteMarketplace
 * @notice Full-featured NFT marketplace for ArenaWarrior (ERC721Enumerable) NFTs.
 *         Supports fixed-price listings, offers on any NFT, and timed auctions.
 */
contract FrostbiteMarketplace is Ownable, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 public constant FEE_BASIS_POINTS = 250; // 2.5%
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant MIN_AUCTION_DURATION = 1 hours;
    uint256 public constant MAX_AUCTION_DURATION = 7 days;
    uint256 public constant MIN_BID_INCREMENT_BP = 500; // 5% minimum bid increment
    uint256 public constant MAX_OFFERS_PER_TOKEN = 50;

    // -------------------------------------------------------------------------
    // Data Structures
    // -------------------------------------------------------------------------

    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }

    struct Offer {
        address offerer;
        uint256 amount;
        uint256 timestamp;
    }

    struct Auction {
        address seller;
        uint256 startPrice;
        uint256 highestBid;
        address highestBidder;
        uint256 startTime;
        uint256 endTime;
        bool active;
        bool settled;
    }

    // -------------------------------------------------------------------------
    // State Variables
    // -------------------------------------------------------------------------

    IERC721 public nftContract;
    address public feeRecipient;
    uint256 public accumulatedFees;

    // tokenId => Listing
    mapping(uint256 => Listing) public listings;

    // tokenId => offerer => Offer
    mapping(uint256 => mapping(address => Offer)) public offers;
    // tokenId => offerers array (for enumeration)
    mapping(uint256 => address[]) private _offerersOf;

    // tokenId => Auction
    mapping(uint256 => Auction) public auctions;

    // Active listing tracking (swap-and-pop)
    uint256[] private _activeListingIds;
    mapping(uint256 => uint256) private _listingIndex; // tokenId => index

    // Active auction tracking (swap-and-pop)
    uint256[] private _activeAuctionIds;
    mapping(uint256 => uint256) private _auctionIndex; // tokenId => index

    // Pull-payment for outbid auction returns
    mapping(address => uint256) public pendingReturns;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ItemListed(
        uint256 indexed tokenId,
        address indexed seller,
        uint256 price
    );

    event ListingCancelled(
        uint256 indexed tokenId,
        address indexed seller
    );

    event ItemSold(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 price
    );

    event OfferMade(
        uint256 indexed tokenId,
        address indexed offerer,
        uint256 amount
    );

    event OfferCancelled(
        uint256 indexed tokenId,
        address indexed offerer
    );

    event OfferAccepted(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed offerer,
        uint256 amount
    );

    event AuctionCreated(
        uint256 indexed tokenId,
        address indexed seller,
        uint256 startPrice,
        uint256 endTime
    );

    event BidPlaced(
        uint256 indexed tokenId,
        address indexed bidder,
        uint256 amount
    );

    event AuctionEnded(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed winner,
        uint256 amount
    );

    event AuctionCancelled(
        uint256 indexed tokenId,
        address indexed seller
    );

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotNFTOwner();
    error PriceZero();
    error AlreadyListed();
    error NotListed();
    error NotSeller();
    error InsufficientPayment();
    error TransferFailed();
    error NoFeesToWithdraw();
    error InvalidAddress();
    error OfferTooLow();
    error NoOffer();
    error CannotBuyOwnItem();
    error AuctionAlreadyActive();
    error InvalidDuration();
    error AuctionNotActive();
    error AuctionNotEnded();
    error AuctionAlreadyEnded();
    error BidTooLow();
    error CannotBidOnOwnAuction();
    error AuctionHasBids();
    error NotAuctionSeller();
    error ItemInAuction();
    error TooManyOffers();
    error NoPendingReturns();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address _nftContract,
        address _feeRecipient
    ) Ownable(msg.sender) {
        if (_nftContract == address(0) || _feeRecipient == address(0)) revert InvalidAddress();
        nftContract = IERC721(_nftContract);
        feeRecipient = _feeRecipient;
    }

    // -------------------------------------------------------------------------
    // Fixed-Price Listings
    // -------------------------------------------------------------------------

    /**
     * @notice List an NFT for sale at a fixed price.
     * @dev Seller must have approved this contract for the token.
     * @param tokenId The token to list.
     * @param price   The sale price in wei.
     */
    function listItem(uint256 tokenId, uint256 price) external nonReentrant {
        if (nftContract.ownerOf(tokenId) != msg.sender) revert NotNFTOwner();
        if (price == 0) revert PriceZero();
        if (listings[tokenId].active) revert AlreadyListed();
        if (auctions[tokenId].active) revert ItemInAuction();

        // Transfer NFT to marketplace (escrow)
        nftContract.transferFrom(msg.sender, address(this), tokenId);

        listings[tokenId] = Listing({
            seller: msg.sender,
            price: price,
            active: true
        });

        _listingIndex[tokenId] = _activeListingIds.length;
        _activeListingIds.push(tokenId);

        emit ItemListed(tokenId, msg.sender, price);
    }

    /**
     * @notice Cancel a fixed-price listing and return the NFT.
     * @param tokenId The listed token to delist.
     */
    function cancelListing(uint256 tokenId) external nonReentrant {
        Listing storage listing = listings[tokenId];
        if (!listing.active) revert NotListed();
        if (listing.seller != msg.sender) revert NotSeller();

        listing.active = false;
        _removeActiveListing(tokenId);

        // Return NFT to seller
        nftContract.transferFrom(address(this), msg.sender, tokenId);

        emit ListingCancelled(tokenId, msg.sender);
    }

    /**
     * @notice Buy a listed NFT at its asking price.
     * @param tokenId The token to purchase.
     */
    function buyItem(uint256 tokenId) external payable nonReentrant {
        Listing storage listing = listings[tokenId];
        if (!listing.active) revert NotListed();
        if (listing.seller == msg.sender) revert CannotBuyOwnItem();
        if (msg.value < listing.price) revert InsufficientPayment();

        address seller = listing.seller;
        uint256 price = listing.price;

        // Deactivate listing
        listing.active = false;
        _removeActiveListing(tokenId);

        // Calculate fee
        uint256 fee = (price * FEE_BASIS_POINTS) / BASIS_POINTS;
        uint256 sellerProceeds = price - fee;
        accumulatedFees += fee;

        // Transfer NFT to buyer
        nftContract.transferFrom(address(this), msg.sender, tokenId);

        // Pay seller
        (bool success, ) = seller.call{value: sellerProceeds}("");
        if (!success) revert TransferFailed();

        // Refund overpayment
        if (msg.value > price) {
            (bool refunded, ) = msg.sender.call{value: msg.value - price}("");
            if (!refunded) revert TransferFailed();
        }

        // Refund all existing offers (exclude buyer in case they had an offer)
        _refundAllOffers(tokenId, msg.sender);

        emit ItemSold(tokenId, seller, msg.sender, price);
    }

    // -------------------------------------------------------------------------
    // Offers
    // -------------------------------------------------------------------------

    /**
     * @notice Make an offer on any NFT (listed or not). Replaces previous offer.
     * @param tokenId The token to make an offer on.
     */
    function makeOffer(uint256 tokenId) external payable nonReentrant {
        if (msg.value == 0) revert OfferTooLow();
        if (nftContract.ownerOf(tokenId) == msg.sender && !listings[tokenId].active && !auctions[tokenId].active) {
            // If it's in escrow (listed/auction), ownerOf is this contract, so skip this check
            revert CannotBuyOwnItem();
        }

        // Refund previous offer if exists
        Offer storage existing = offers[tokenId][msg.sender];
        uint256 refundAmount = existing.amount;

        if (refundAmount == 0) {
            // New offerer — enforce limit to prevent DoS via unbounded array
            if (_offerersOf[tokenId].length >= MAX_OFFERS_PER_TOKEN) revert TooManyOffers();
            _offerersOf[tokenId].push(msg.sender);
        }

        offers[tokenId][msg.sender] = Offer({
            offerer: msg.sender,
            amount: refundAmount + msg.value, // stack on top of existing
            timestamp: block.timestamp
        });

        emit OfferMade(tokenId, msg.sender, refundAmount + msg.value);
    }

    /**
     * @notice Cancel your offer and get refunded.
     * @param tokenId The token your offer is on.
     */
    function cancelOffer(uint256 tokenId) external nonReentrant {
        Offer storage offer = offers[tokenId][msg.sender];
        uint256 amount = offer.amount;
        if (amount == 0) revert NoOffer();

        // Clear offer
        offer.amount = 0;

        emit OfferCancelled(tokenId, msg.sender);

        // Refund
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Accept an offer on your NFT. Works for listed and unlisted NFTs.
     * @param tokenId The token to sell.
     * @param offerer The address whose offer to accept.
     */
    function acceptOffer(uint256 tokenId, address offerer) external nonReentrant {
        Offer storage offer = offers[tokenId][offerer];
        uint256 amount = offer.amount;
        if (amount == 0) revert NoOffer();

        bool isListed = listings[tokenId].active && listings[tokenId].seller == msg.sender;

        if (isListed) {
            // Delist first
            listings[tokenId].active = false;
            _removeActiveListing(tokenId);
        } else {
            // Must own the NFT directly
            if (nftContract.ownerOf(tokenId) != msg.sender) revert NotNFTOwner();
        }

        // Clear offer
        offer.amount = 0;

        // Calculate fee
        uint256 fee = (amount * FEE_BASIS_POINTS) / BASIS_POINTS;
        uint256 sellerProceeds = amount - fee;
        accumulatedFees += fee;

        // Transfer NFT
        if (isListed) {
            nftContract.transferFrom(address(this), offerer, tokenId);
        } else {
            nftContract.transferFrom(msg.sender, offerer, tokenId);
        }

        // Pay seller
        (bool success, ) = msg.sender.call{value: sellerProceeds}("");
        if (!success) revert TransferFailed();

        // Refund remaining offers (exclude the accepted offerer)
        _refundAllOffers(tokenId, offerer);

        emit OfferAccepted(tokenId, msg.sender, offerer, amount);
    }

    // -------------------------------------------------------------------------
    // Auctions
    // -------------------------------------------------------------------------

    /**
     * @notice Create a timed auction for an NFT.
     * @param tokenId    The token to auction.
     * @param startPrice The minimum starting bid in wei.
     * @param duration   Auction duration in seconds (1 hour – 7 days).
     */
    function createAuction(
        uint256 tokenId,
        uint256 startPrice,
        uint256 duration
    ) external nonReentrant {
        if (nftContract.ownerOf(tokenId) != msg.sender) revert NotNFTOwner();
        if (startPrice == 0) revert PriceZero();
        if (duration < MIN_AUCTION_DURATION || duration > MAX_AUCTION_DURATION)
            revert InvalidDuration();
        if (listings[tokenId].active) revert AlreadyListed();
        if (auctions[tokenId].active) revert AuctionAlreadyActive();

        // Transfer NFT to marketplace (escrow)
        nftContract.transferFrom(msg.sender, address(this), tokenId);

        uint256 endTime = block.timestamp + duration;

        auctions[tokenId] = Auction({
            seller: msg.sender,
            startPrice: startPrice,
            highestBid: 0,
            highestBidder: address(0),
            startTime: block.timestamp,
            endTime: endTime,
            active: true,
            settled: false
        });

        _auctionIndex[tokenId] = _activeAuctionIds.length;
        _activeAuctionIds.push(tokenId);

        emit AuctionCreated(tokenId, msg.sender, startPrice, endTime);
    }

    /**
     * @notice Place a bid on an active auction.
     * @param tokenId The auctioned token.
     */
    function placeBid(uint256 tokenId) external payable nonReentrant {
        Auction storage auction = auctions[tokenId];
        if (!auction.active) revert AuctionNotActive();
        if (block.timestamp >= auction.endTime) revert AuctionAlreadyEnded();
        if (auction.seller == msg.sender) revert CannotBidOnOwnAuction();

        uint256 minBid;
        if (auction.highestBid == 0) {
            minBid = auction.startPrice;
        } else {
            minBid = auction.highestBid +
                (auction.highestBid * MIN_BID_INCREMENT_BP) / BASIS_POINTS;
        }
        if (msg.value < minBid) revert BidTooLow();

        // Refund previous highest bidder
        address prevBidder = auction.highestBidder;
        uint256 prevBid = auction.highestBid;

        auction.highestBid = msg.value;
        auction.highestBidder = msg.sender;

        emit BidPlaced(tokenId, msg.sender, msg.value);

        // Use pull-payment pattern so a malicious bidder cannot block new bids
        if (prevBidder != address(0) && prevBid > 0) {
            pendingReturns[prevBidder] += prevBid;
        }
    }

    /**
     * @notice Withdraw pending returns from outbid auction bids.
     */
    function withdrawPendingReturn() external nonReentrant {
        uint256 amount = pendingReturns[msg.sender];
        if (amount == 0) revert NoPendingReturns();

        pendingReturns[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice End an auction after its duration has elapsed. Transfers NFT and
     *         pays the seller. Anyone can call this.
     * @param tokenId The auctioned token.
     */
    function endAuction(uint256 tokenId) external nonReentrant {
        Auction storage auction = auctions[tokenId];
        if (!auction.active) revert AuctionNotActive();
        if (block.timestamp < auction.endTime) revert AuctionNotEnded();

        auction.active = false;
        auction.settled = true;
        _removeActiveAuction(tokenId);

        if (auction.highestBidder != address(0)) {
            // Auction had bids — transfer NFT to winner, pay seller
            uint256 fee = (auction.highestBid * FEE_BASIS_POINTS) / BASIS_POINTS;
            uint256 sellerProceeds = auction.highestBid - fee;
            accumulatedFees += fee;

            nftContract.transferFrom(address(this), auction.highestBidder, tokenId);

            (bool success, ) = auction.seller.call{value: sellerProceeds}("");
            if (!success) revert TransferFailed();

            // Refund any standing offers (exclude the auction winner)
            _refundAllOffers(tokenId, auction.highestBidder);

            emit AuctionEnded(tokenId, auction.seller, auction.highestBidder, auction.highestBid);
        } else {
            // No bids — return NFT to seller
            nftContract.transferFrom(address(this), auction.seller, tokenId);

            // Refund any standing offers
            _refundAllOffers(tokenId, address(0));

            emit AuctionCancelled(tokenId, auction.seller);
        }
    }

    /**
     * @notice Cancel an auction that has no bids yet.
     * @param tokenId The auctioned token.
     */
    function cancelAuction(uint256 tokenId) external nonReentrant {
        Auction storage auction = auctions[tokenId];
        if (!auction.active) revert AuctionNotActive();
        if (auction.seller != msg.sender) revert NotAuctionSeller();
        if (auction.highestBidder != address(0)) revert AuctionHasBids();

        auction.active = false;
        _removeActiveAuction(tokenId);

        // Return NFT to seller
        nftContract.transferFrom(address(this), msg.sender, tokenId);

        emit AuctionCancelled(tokenId, msg.sender);
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    function withdrawFees() external onlyOwner {
        uint256 fees = accumulatedFees;
        if (fees == 0) revert NoFeesToWithdraw();
        accumulatedFees = 0;

        (bool success, ) = feeRecipient.call{value: fees}("");
        if (!success) revert TransferFailed();
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert InvalidAddress();
        feeRecipient = _feeRecipient;
    }

    function setNftContract(address _nftContract) external onlyOwner {
        if (_nftContract == address(0)) revert InvalidAddress();
        nftContract = IERC721(_nftContract);
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    function getListing(uint256 tokenId) external view returns (Listing memory) {
        return listings[tokenId];
    }

    function getAuction(uint256 tokenId) external view returns (Auction memory) {
        return auctions[tokenId];
    }

    function getOffers(uint256 tokenId) external view returns (Offer[] memory) {
        address[] storage offerers = _offerersOf[tokenId];
        uint256 count = 0;

        // Count active offers
        for (uint256 i = 0; i < offerers.length; i++) {
            if (offers[tokenId][offerers[i]].amount > 0) {
                count++;
            }
        }

        Offer[] memory result = new Offer[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < offerers.length; i++) {
            Offer storage o = offers[tokenId][offerers[i]];
            if (o.amount > 0) {
                result[idx] = o;
                idx++;
            }
        }
        return result;
    }

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

    function getActiveListingCount() external view returns (uint256) {
        return _activeListingIds.length;
    }

    function getActiveAuctions(
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory ids) {
        uint256 total = _activeAuctionIds.length;
        if (offset >= total) return new uint256[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;

        uint256 count = end - offset;
        ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = _activeAuctionIds[offset + i];
        }
    }

    function getActiveAuctionCount() external view returns (uint256) {
        return _activeAuctionIds.length;
    }

    // -------------------------------------------------------------------------
    // Internal Helpers
    // -------------------------------------------------------------------------

    function _removeActiveListing(uint256 tokenId) internal {
        uint256 index = _listingIndex[tokenId];
        uint256 lastIndex = _activeListingIds.length - 1;

        if (index != lastIndex) {
            uint256 lastId = _activeListingIds[lastIndex];
            _activeListingIds[index] = lastId;
            _listingIndex[lastId] = index;
        }

        _activeListingIds.pop();
        delete _listingIndex[tokenId];
    }

    function _removeActiveAuction(uint256 tokenId) internal {
        uint256 index = _auctionIndex[tokenId];
        uint256 lastIndex = _activeAuctionIds.length - 1;

        if (index != lastIndex) {
            uint256 lastId = _activeAuctionIds[lastIndex];
            _activeAuctionIds[index] = lastId;
            _auctionIndex[lastId] = index;
        }

        _activeAuctionIds.pop();
        delete _auctionIndex[tokenId];
    }

    /**
     * @dev Refund all active offers on a token after it has been sold/transferred.
     *      Uses a try-catch pattern so a single failing refund does not block the sale.
     *      Skips the buyer (excludedAddress) if they had an existing offer.
     */
    function _refundAllOffers(uint256 tokenId, address excludedAddress) internal {
        address[] storage offerers = _offerersOf[tokenId];
        for (uint256 i = 0; i < offerers.length; i++) {
            address offerer = offerers[i];
            uint256 amount = offers[tokenId][offerer].amount;
            if (amount > 0 && offerer != excludedAddress) {
                offers[tokenId][offerer].amount = 0;
                // Use low-level call; ignore failure so one bad refund
                // does not revert the entire sale. Offerer can still
                // call cancelOffer() to retry.
                (bool sent, ) = offerer.call{value: amount}("");
                if (!sent) {
                    // Restore amount so offerer can claim manually
                    offers[tokenId][offerer].amount = amount;
                }
            }
        }
    }
}
