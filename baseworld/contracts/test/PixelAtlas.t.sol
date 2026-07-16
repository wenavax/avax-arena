// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PixelAtlas} from "../src/PixelAtlas.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract PixelAtlasTest is Test {
    PixelAtlas atlas;
    MockUSDC usdc;
    address treasury = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant PRICE = 1_000_000; // 1 USDC

    function setUp() public {
        usdc = new MockUSDC();
        atlas = new PixelAtlas(address(usdc), treasury, bytes32(0));
        usdc.mint(alice, 100 * PRICE);
        usdc.mint(bob, 100 * PRICE);
    }

    // ============== coords ==============

    function test_tokenIdOf_roundTrip() public view {
        uint16 x = 123;
        uint16 y = 45;
        uint256 id = atlas.tokenIdOf(x, y);
        assertEq(id, uint256(y) * 640 + uint256(x));
        (uint16 rx, uint16 ry) = atlas.coordsOf(id);
        assertEq(rx, x);
        assertEq(ry, y);
    }

    function test_tokenIdOf_revertsOutOfBounds() public {
        vm.expectRevert(bytes("out of bounds"));
        atlas.tokenIdOf(640, 0);
        vm.expectRevert(bytes("out of bounds"));
        atlas.tokenIdOf(0, 320);
    }

    function test_coordsOf_revertsOutOfGrid() public {
        // 640 * 320 = 204800
        vm.expectRevert(bytes("tokenId out of grid"));
        atlas.coordsOf(204800);
    }

    // ============== constructor ==============

    function test_constructor_revertsZeroUsdc() public {
        vm.expectRevert(PixelAtlas.InvalidAddress.selector);
        new PixelAtlas(address(0), treasury, bytes32(0));
    }

    function test_constructor_revertsZeroTreasury() public {
        vm.expectRevert(PixelAtlas.InvalidAddress.selector);
        new PixelAtlas(address(usdc), address(0), bytes32(0));
    }

    function test_usdc_isImmutable() public {
        // No setter exists — selector wouldn't compile if there was a function
        // setUsdc. Compile-time guarantee.
        assertEq(address(atlas.usdc()), address(usdc));
    }

    // ============== mint ==============

    function test_mint_happyPath() public {
        vm.startPrank(alice);
        usdc.approve(address(atlas), PRICE);
        atlas.mint(10, 10, PRICE, new bytes32[](0));
        vm.stopPrank();

        uint256 id = atlas.tokenIdOf(10, 10);
        assertEq(atlas.ownerOf(id), alice);
        assertEq(usdc.balanceOf(treasury), PRICE);
        assertTrue(atlas.isMinted(id));
    }

    function test_mint_revertsAlreadyMinted() public {
        vm.startPrank(alice);
        usdc.approve(address(atlas), PRICE);
        atlas.mint(10, 10, PRICE, new bytes32[](0));
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(atlas), PRICE);
        vm.expectRevert(bytes("already minted"));
        atlas.mint(10, 10, PRICE, new bytes32[](0));
        vm.stopPrank();
    }

    function test_mint_revertsWithoutAllowance() public {
        vm.prank(alice);
        vm.expectRevert(); // SafeERC20FailedOperation
        atlas.mint(10, 10, PRICE, new bytes32[](0));
    }

    // ============== mint: maxPrice sandwich protection ==============

    function test_mint_revertsWhenPriceAboveMax() public {
        // Owner spikes price after Alice approves but before her tx lands
        atlas.setMintPrice(50 * PRICE);

        vm.startPrank(alice);
        usdc.approve(address(atlas), type(uint256).max);
        vm.expectRevert(
            abi.encodeWithSelector(PixelAtlas.PriceAboveMax.selector, 50 * PRICE, PRICE)
        );
        atlas.mint(10, 10, PRICE, new bytes32[](0));
        vm.stopPrank();
    }

    function test_mint_succeedsAtMaxPrice() public {
        atlas.setMintPrice(2 * PRICE);
        vm.startPrank(alice);
        usdc.approve(address(atlas), 2 * PRICE);
        atlas.mint(10, 10, 2 * PRICE, new bytes32[](0));
        vm.stopPrank();
        assertEq(usdc.balanceOf(treasury), 2 * PRICE);
    }

    // ============== mint: events ==============

    function test_PixelMinted_emitsPricePaid() public {
        vm.startPrank(alice);
        usdc.approve(address(atlas), PRICE);
        uint256 id = atlas.tokenIdOf(7, 9);
        vm.expectEmit(true, true, false, true, address(atlas));
        emit PixelAtlas.PixelMinted(id, alice, 7, 9, PRICE);
        atlas.mint(7, 9, PRICE, new bytes32[](0));
        vm.stopPrank();
    }

    // ============== setPixelImage: URI validation ==============

    function _mintAlice(uint16 x, uint16 y) internal returns (uint256 id) {
        id = atlas.tokenIdOf(x, y);
        vm.startPrank(alice);
        usdc.approve(address(atlas), PRICE);
        atlas.mint(x, y, PRICE, new bytes32[](0));
        vm.stopPrank();
    }

    function test_setPixelImage_ownerOnly() public {
        uint256 id = _mintAlice(5, 5);
        vm.prank(alice);
        atlas.setPixelImage(id, "ipfs://abc");
        assertEq(atlas.pixelImage(id), "ipfs://abc");

        vm.prank(bob);
        vm.expectRevert(bytes("not pixel owner"));
        atlas.setPixelImage(id, "ipfs://evil");
    }

    function test_setPixelImage_acceptsValidSchemes() public {
        uint256 id = _mintAlice(1, 1);
        vm.startPrank(alice);
        atlas.setPixelImage(id, "ipfs://QmAbc");
        atlas.setPixelImage(id, "https://example.com/x.png");
        atlas.setPixelImage(id, "ar://abc");
        atlas.setPixelImage(id, "data:image/png;base64,AAAA");
        atlas.setPixelImage(id, "data:image/jpeg;base64,AAAA");
        atlas.setPixelImage(id, "data:image/webp;base64,AAAA");
        atlas.setPixelImage(id, "data:image/gif;base64,AAAA");
        atlas.setPixelImage(id, "data:image/svg+xml;base64,AAAA");
        vm.stopPrank();
    }

    function test_setPixelImage_rejectsHttp() public {
        uint256 id = _mintAlice(1, 1);
        vm.prank(alice);
        vm.expectRevert(PixelAtlas.InvalidUriScheme.selector);
        atlas.setPixelImage(id, "http://insecure.example/x.png");
    }

    function test_setPixelImage_rejectsJavascriptScheme() public {
        uint256 id = _mintAlice(1, 1);
        vm.prank(alice);
        vm.expectRevert(PixelAtlas.InvalidUriScheme.selector);
        atlas.setPixelImage(id, "javascript:alert(1)");
    }

    function test_setPixelImage_rejectsDataHtml() public {
        uint256 id = _mintAlice(1, 1);
        vm.prank(alice);
        vm.expectRevert(PixelAtlas.InvalidUriScheme.selector);
        atlas.setPixelImage(id, "data:text/html,<script>alert(1)</script>");
    }

    function test_setPixelImage_rejectsJsonInjectionQuote() public {
        uint256 id = _mintAlice(1, 1);
        vm.prank(alice);
        vm.expectRevert(PixelAtlas.InvalidUriScheme.selector);
        // The '"' character would break JSON
        atlas.setPixelImage(id, 'ipfs://abc","name":"FAKE","x":"');
    }

    function test_setPixelImage_rejectsBackslash() public {
        uint256 id = _mintAlice(1, 1);
        vm.prank(alice);
        vm.expectRevert(PixelAtlas.InvalidUriScheme.selector);
        atlas.setPixelImage(id, "ipfs://abc\\xyz");
    }

    function test_setPixelImage_rejectsHtmlBracket() public {
        uint256 id = _mintAlice(1, 1);
        vm.prank(alice);
        vm.expectRevert(PixelAtlas.InvalidUriScheme.selector);
        atlas.setPixelImage(id, "ipfs://<scriptish");
    }

    function test_setPixelImage_rejectsControlChars() public {
        uint256 id = _mintAlice(1, 1);
        vm.prank(alice);
        vm.expectRevert(PixelAtlas.InvalidUriScheme.selector);
        atlas.setPixelImage(id, "ipfs://abc\nbreak");
    }

    function test_setPixelImage_rejectsTooLong() public {
        uint256 id = _mintAlice(1, 1);
        bytes memory long = new bytes(600);
        for (uint256 i; i < 7; i++) long[i] = bytes("ipfs://")[i];
        for (uint256 i = 7; i < 600; i++) long[i] = "x";
        vm.prank(alice);
        vm.expectRevert(PixelAtlas.UriTooLong.selector);
        atlas.setPixelImage(id, string(long));
    }

    function test_setPixelImage_rejectsEmpty() public {
        uint256 id = _mintAlice(1, 1);
        vm.prank(alice);
        vm.expectRevert(PixelAtlas.UriTooLong.selector);
        atlas.setPixelImage(id, "");
    }

    // ============== image cleared on transfer ==============

    function test_imageCleared_onTransfer() public {
        uint256 id = _mintAlice(11, 11);
        vm.prank(alice);
        atlas.setPixelImage(id, "ipfs://art");
        assertEq(atlas.pixelImage(id), "ipfs://art");

        vm.expectEmit(true, true, false, true, address(atlas));
        emit PixelAtlas.PixelImageCleared(id, alice);
        vm.prank(alice);
        atlas.transferFrom(alice, bob, id);

        assertEq(atlas.pixelImage(id), "");
    }

    // ============== pixelsInfo: batch cap ==============

    function test_pixelsInfo_revertsAboveBatchCap() public {
        uint256[] memory ids = new uint256[](1025);
        vm.expectRevert(PixelAtlas.BatchTooLarge.selector);
        atlas.pixelsInfo(ids);
    }

    // ============== tokenURI ==============

    function test_tokenURI_returnsDataUri() public {
        uint256 id = atlas.tokenIdOf(1, 2);
        vm.startPrank(alice);
        usdc.approve(address(atlas), PRICE);
        atlas.mint(1, 2, PRICE, new bytes32[](0));
        vm.stopPrank();
        string memory uri = atlas.tokenURI(id);
        bytes memory uriBytes = bytes(uri);
        assertGt(uriBytes.length, 30);
        assertEq(uriBytes[0], bytes1("d"));
    }

    // ============== pausable ==============

    function test_pause_blocksMint() public {
        atlas.pause();
        vm.startPrank(alice);
        usdc.approve(address(atlas), PRICE);
        vm.expectRevert(); // EnforcedPause
        atlas.mint(10, 10, PRICE, new bytes32[](0));
        vm.stopPrank();
    }

    function test_pause_blocksSetPixelImage() public {
        uint256 id = _mintAlice(3, 3);
        atlas.pause();
        vm.prank(alice);
        vm.expectRevert(); // EnforcedPause
        atlas.setPixelImage(id, "ipfs://abc");
    }

    function test_unpause_restoresMint() public {
        atlas.pause();
        atlas.unpause();
        vm.startPrank(alice);
        usdc.approve(address(atlas), PRICE);
        atlas.mint(10, 10, PRICE, new bytes32[](0));
        vm.stopPrank();
    }

    // ============== admin ==============

    function test_setMintPrice_capsAtMax() public {
        // MAX = 10_000 USDC = 1e10
        atlas.setMintPrice(10_000 * PRICE);
        assertEq(atlas.mintPrice(), 10_000 * PRICE);
        vm.expectRevert(PixelAtlas.InvalidPrice.selector);
        atlas.setMintPrice(10_001 * PRICE);
    }

    function test_setTreasury_rejectsZero() public {
        vm.expectRevert(PixelAtlas.InvalidAddress.selector);
        atlas.setTreasury(address(0));
    }

    function test_setTreasury_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(); // OwnableUnauthorizedAccount
        atlas.setTreasury(alice);
    }

    function test_pause_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        atlas.pause();
    }

    // ============== merkle gating (double-hash leaf) ==============

    function test_merkleGating_validProofMints_invalidReverts() public {
        uint256[4] memory ids = [uint256(0), uint256(1), uint256(640), uint256(641)];
        bytes32[4] memory leaves;
        for (uint256 i = 0; i < 4; ++i) {
            // OZ StandardMerkleTree pattern: double-hash
            leaves[i] = keccak256(bytes.concat(keccak256(abi.encode(ids[i]))));
        }
        _sort4(leaves);

        bytes32 p01 = _hashPair(leaves[0], leaves[1]);
        bytes32 p23 = _hashPair(leaves[2], leaves[3]);
        bytes32 root = _hashPair(p01, p23);

        PixelAtlas gated = new PixelAtlas(address(usdc), treasury, root);
        assertTrue(gated.landCheck());
        assertEq(gated.landRoot(), root);

        bytes32[] memory proof0 = new bytes32[](2);
        proof0[0] = leaves[1];
        proof0[1] = p23;

        uint256 leaf0Id = _idForLeaf(ids, leaves[0]);
        (uint16 x0, uint16 y0) = _coordsOf(leaf0Id);

        vm.startPrank(alice);
        usdc.approve(address(gated), PRICE);
        gated.mint(x0, y0, PRICE, proof0);
        vm.stopPrank();
        assertEq(gated.ownerOf(leaf0Id), alice);

        // Empty proof for non-leaf id → revert
        vm.startPrank(bob);
        usdc.approve(address(gated), PRICE);
        vm.expectRevert(bytes("not a land pixel"));
        gated.mint(15, 15, PRICE, new bytes32[](0));
        vm.stopPrank();
    }

    // ============== ownable2step ==============

    function test_ownership_twoStep() public {
        atlas.transferOwnership(alice);
        // Alice not yet accepted → owner still test contract
        assertEq(atlas.owner(), address(this));
        assertEq(atlas.pendingOwner(), alice);
        vm.prank(alice);
        atlas.acceptOwnership();
        assertEq(atlas.owner(), alice);
    }

    // ============== merkle helpers ==============

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function _sort4(bytes32[4] memory arr) internal pure {
        for (uint256 i = 0; i < 4; ++i) {
            for (uint256 j = i + 1; j < 4; ++j) {
                if (arr[i] > arr[j]) {
                    bytes32 t = arr[i];
                    arr[i] = arr[j];
                    arr[j] = t;
                }
            }
        }
    }

    function _idForLeaf(uint256[4] memory ids, bytes32 leaf) internal pure returns (uint256) {
        for (uint256 i = 0; i < 4; ++i) {
            bytes32 h = keccak256(bytes.concat(keccak256(abi.encode(ids[i]))));
            if (h == leaf) return ids[i];
        }
        revert("leaf not in id set");
    }

    function _coordsOf(uint256 tokenId) internal pure returns (uint16 x, uint16 y) {
        x = uint16(tokenId % 640);
        y = uint16(tokenId / 640);
    }
}
