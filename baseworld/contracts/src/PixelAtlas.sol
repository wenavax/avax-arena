// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title  Base Atlas (PixelAtlas v2) — one pixel of the world map = one NFT on Base
/// @notice 640x320 fixed grid over the world map; minting a land pixel costs a
///         capped USDC amount (default 1 USDC). The pixel owner can attach an
///         image URI from a fixed allowlist of schemes. The URI is JSON-escaped
///         before being placed in tokenURI metadata.
/// @dev    v2 audit-hardened. Findings folded in:
///           - mint() takes maxPrice to block owner-spike sandwich attack
///           - usdc address is IMMUTABLE (set in constructor only)
///           - URI scheme allowlist + length cap + JSON-escape
///           - Pausable emergency stop
///           - SafeERC20 for resilient token transfers
///           - Ownable2Step for safe ownership handoff
///           - _update() hook clears image on transfer (no stale art)
///           - PixelMinted emits pricePaid; PixelImageSet emits owner
///           - Merkle leaf uses double-hash domain separation (OZ standard)
///           - pixelsInfo array length cap
contract PixelAtlas is ERC721, Ownable2Step, ReentrancyGuard, Pausable {
    using Strings for uint256;
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- constants
    uint16 public constant GRID_W = 640;
    uint16 public constant GRID_H = 320;
    /// @notice Hard cap on mintPrice (10,000 USDC = 1e10 base units) — guards
    ///         against admin typos / runaway-finger setMintPrice.
    uint256 public constant MAX_MINT_PRICE = 10_000 * 1e6;
    /// @notice Max bytes for a pixel image URI. Keeps tokenURI cheap and
    ///         prevents 100KB data-URI griefing.
    uint256 public constant MAX_URI_LENGTH = 512;
    /// @notice Max pixels per pixelsInfo() batch read.
    uint256 public constant MAX_BATCH_READ = 1024;

    // ----------------------------------------------------------------- storage
    /// @notice Payment token. IMMUTABLE — cannot be rugged via setUsdc.
    IERC20 public immutable usdc;
    address public treasury;
    uint256 public mintPrice;

    bytes32 public landRoot;
    bool public landCheck;

    mapping(uint256 => string) private _pixelImage;

    // ------------------------------------------------------------------ events
    event PixelMinted(
        uint256 indexed tokenId,
        address indexed owner,
        uint16 x,
        uint16 y,
        uint256 pricePaid
    );
    event PixelImageSet(uint256 indexed tokenId, address indexed owner, string uri);
    event PixelImageCleared(uint256 indexed tokenId, address indexed fromOwner);
    event TreasuryChanged(address indexed previousTreasury, address indexed newTreasury);
    event MintPriceChanged(uint256 previousPrice, uint256 newPrice);
    event LandRootChanged(bytes32 previousRoot, bytes32 newRoot, bool enabled);

    // ---------------------------------------------------------------- modifier
    error InvalidAddress();
    error InvalidPrice();
    error UriTooLong();
    error InvalidUriScheme();
    error PriceAboveMax(uint256 mintPrice_, uint256 maxPrice);
    error BatchTooLarge();

    // ----------------------------------------------------------------- ctor
    constructor(address _usdc, address _treasury, bytes32 _landRoot)
        ERC721("Base Atlas", "BATLAS")
        Ownable(msg.sender)
    {
        if (_usdc == address(0) || _treasury == address(0)) revert InvalidAddress();
        usdc = IERC20(_usdc);
        treasury = _treasury;
        mintPrice = 1_000_000; // 1 USDC
        landRoot = _landRoot;
        landCheck = _landRoot != bytes32(0);
        emit TreasuryChanged(address(0), _treasury);
        emit MintPriceChanged(0, 1_000_000);
        if (landCheck) emit LandRootChanged(bytes32(0), _landRoot, true);
    }

    // ---------------------------------------------------------------- coords
    function tokenIdOf(uint16 x, uint16 y) public pure returns (uint256) {
        require(x < GRID_W && y < GRID_H, "out of bounds");
        return uint256(y) * GRID_W + uint256(x);
    }

    function coordsOf(uint256 tokenId) public pure returns (uint16 x, uint16 y) {
        require(tokenId < uint256(GRID_W) * uint256(GRID_H), "tokenId out of grid");
        x = uint16(tokenId % GRID_W);
        y = uint16(tokenId / GRID_W);
    }

    function isMinted(uint256 tokenId) public view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    // ------------------------------------------------------------------ mint
    /// @notice Mint a land pixel.
    /// @param  x         pixel x-coordinate (0 ≤ x < GRID_W)
    /// @param  y         pixel y-coordinate (0 ≤ y < GRID_H)
    /// @param  maxPrice  caller's accepted ceiling for mintPrice (in USDC base units).
    ///                   Reverts if current mintPrice > maxPrice — blocks owner
    ///                   sandwich attack against a MAX-USDC approval.
    /// @param  proof     merkle proof that (x,y) is a land pixel. Empty when
    ///                   landCheck is disabled.
    function mint(uint16 x, uint16 y, uint256 maxPrice, bytes32[] calldata proof)
        external
        nonReentrant
        whenNotPaused
    {
        uint256 tokenId = tokenIdOf(x, y);
        require(_ownerOf(tokenId) == address(0), "already minted");

        uint256 price = mintPrice;
        if (price > maxPrice) revert PriceAboveMax(price, maxPrice);

        if (landCheck) {
            // Double-hash domain separation (OZ StandardMerkleTree pattern):
            // prevents intermediate-node second-preimage on a 32-byte tree.
            bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(tokenId))));
            require(MerkleProof.verify(proof, landRoot, leaf), "not a land pixel");
        }

        usdc.safeTransferFrom(msg.sender, treasury, price);

        _safeMint(msg.sender, tokenId);
        emit PixelMinted(tokenId, msg.sender, x, y, price);
    }

    // --------------------------------------------------------------- imagery
    function setPixelImage(uint256 tokenId, string calldata uri)
        external
        whenNotPaused
    {
        require(ownerOf(tokenId) == msg.sender, "not pixel owner");
        _validateUri(uri);
        _pixelImage[tokenId] = uri;
        emit PixelImageSet(tokenId, msg.sender, uri);
    }

    function pixelImage(uint256 tokenId) external view returns (string memory) {
        return _pixelImage[tokenId];
    }

    /// @notice Batch read for rendering the map. Capped to MAX_BATCH_READ.
    function pixelsInfo(uint256[] calldata ids)
        external
        view
        returns (address[] memory owners, string[] memory images)
    {
        if (ids.length > MAX_BATCH_READ) revert BatchTooLarge();
        owners = new address[](ids.length);
        images = new string[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            owners[i] = _ownerOf(ids[i]);
            images[i] = _pixelImage[ids[i]];
        }
    }

    // -------------------------------------------------------------- metadata
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "nonexistent token");
        (uint16 x, uint16 y) = coordsOf(tokenId);

        string memory img = _pixelImage[tokenId];
        if (bytes(img).length == 0) img = _defaultImage(x, y);

        // img is already validated by _validateUri (no ", \, newline, ctrl).
        // Belt-and-suspenders: keep building JSON via abi.encodePacked.
        string memory json = string(
            abi.encodePacked(
                '{"name":"Pixel (', uint256(x).toString(), ",", uint256(y).toString(), ')",',
                '"description":"A pixel on the Base Atlas world map, minted on Base.",',
                '"image":"', img, '",',
                '"attributes":[',
                    '{"trait_type":"X","value":', uint256(x).toString(), "},",
                    '{"trait_type":"Y","value":', uint256(y).toString(), "}]}"
            )
        );
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function _defaultImage(uint16 x, uint16 y) internal pure returns (string memory) {
        string memory svg = string(
            abi.encodePacked(
                "<svg xmlns='http://www.w3.org/2000/svg' width='480' height='480'>",
                "<rect width='480' height='480' fill='#0c1a24'/>",
                "<rect x='10' y='10' width='460' height='460' fill='none' stroke='#6fd6e8' stroke-width='3'/>",
                "<text x='240' y='220' fill='#f4a259' font-family='monospace' font-size='46' text-anchor='middle'>PIXEL</text>",
                "<text x='240' y='280' fill='#dce8ee' font-family='monospace' font-size='38' text-anchor='middle'>",
                uint256(x).toString(), " , ", uint256(y).toString(),
                "</text></svg>"
            )
        );
        return string(abi.encodePacked("data:image/svg+xml;base64,", Base64.encode(bytes(svg))));
    }

    // --------------------------------------------------------- uri validation
    /// @dev Reject URIs not matching one of the allowed schemes, exceeding the
    ///      length cap, or containing JSON-special characters that would let
    ///      an owner inject into tokenURI metadata.
    function _validateUri(string calldata uri) internal pure {
        bytes memory b = bytes(uri);
        if (b.length == 0 || b.length > MAX_URI_LENGTH) revert UriTooLong();

        // 1) JSON-special characters
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            // forbid: '"' (0x22)  '\' (0x5C)  '<' (0x3C, defense vs HTML render)
            // forbid: all control chars (< 0x20) including \n, \r, \t, \0
            if (c == 0x22 || c == 0x5C || c == 0x3C || uint8(c) < 0x20) {
                revert InvalidUriScheme();
            }
        }

        // 2) Scheme allowlist
        if (_startsWith(b, "ipfs://")) return;
        if (_startsWith(b, "https://")) return;
        if (_startsWith(b, "ar://")) return;
        if (_startsWith(b, "data:image/png;base64,")) return;
        if (_startsWith(b, "data:image/jpeg;base64,")) return;
        if (_startsWith(b, "data:image/webp;base64,")) return;
        if (_startsWith(b, "data:image/gif;base64,")) return;
        if (_startsWith(b, "data:image/svg+xml;base64,")) return;
        revert InvalidUriScheme();
    }

    function _startsWith(bytes memory b, string memory prefix) private pure returns (bool) {
        bytes memory p = bytes(prefix);
        if (b.length < p.length) return false;
        for (uint256 i; i < p.length; ++i) if (b[i] != p[i]) return false;
        return true;
    }

    // ------------------------------------------------------- transfer cleanup
    /// @dev OZ v5 hook. Clear pixel image on every transfer so the new owner
    ///      doesn't inherit (potentially offensive) art from the seller.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address from)
    {
        from = super._update(to, tokenId, auth);
        // Skip on mint (from == 0) and clear on transfer + burn.
        if (from != address(0) && bytes(_pixelImage[tokenId]).length != 0) {
            delete _pixelImage[tokenId];
            emit PixelImageCleared(tokenId, from);
        }
    }

    // ------------------------------------------------------------------ admin
    function setMintPrice(uint256 newPrice) external onlyOwner {
        if (newPrice > MAX_MINT_PRICE) revert InvalidPrice();
        uint256 prev = mintPrice;
        mintPrice = newPrice;
        emit MintPriceChanged(prev, newPrice);
    }

    function setTreasury(address t) external onlyOwner {
        if (t == address(0)) revert InvalidAddress();
        address prev = treasury;
        treasury = t;
        emit TreasuryChanged(prev, t);
    }

    function setLandRoot(bytes32 r, bool enabled) external onlyOwner {
        bytes32 prev = landRoot;
        landRoot = r;
        landCheck = enabled;
        emit LandRootChanged(prev, r, enabled);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
