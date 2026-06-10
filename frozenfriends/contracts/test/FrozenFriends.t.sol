// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../src/FrozenFriends.sol";

contract FrozenFriendsTest is Test {
    FrozenFriends ff;
    address owner = address(0xA11CE);
    address alice = address(0xA1);
    address bob = address(0xB0B);

    function setUp() public {
        vm.prank(owner);
        ff = new FrozenFriends("ipfs://baseuri/");
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);
    }

    function test_MintSuccess() public {
        vm.prank(alice);
        uint256 id = ff.mint{value: 0.0005 ether}();
        assertEq(id, 1);
        assertEq(ff.ownerOf(1), alice);
        assertTrue(ff.hasMinted(alice));
    }

    function test_RevertOnDoubleMint() public {
        vm.prank(alice);
        ff.mint{value: 0.0005 ether}();
        vm.prank(alice);
        vm.expectRevert(FrozenFriends.AlreadyMinted.selector);
        ff.mint{value: 0.0005 ether}();
    }

    function test_RevertOnInsufficientPayment() public {
        vm.prank(alice);
        vm.expectRevert(FrozenFriends.InsufficientPayment.selector);
        ff.mint{value: 0.0001 ether}();
    }

    function test_SeedIsDeterministicallyDifferent() public {
        vm.prank(alice);
        ff.mint{value: 0.0005 ether}();
        vm.prank(bob);
        ff.mint{value: 0.0005 ether}();
        assertTrue(ff.seedOf(1) != ff.seedOf(2));
    }

    function test_OnlyOwnerCanWithdraw() public {
        vm.prank(alice);
        ff.mint{value: 0.0005 ether}();
        vm.prank(alice);
        vm.expectRevert();
        ff.withdraw(payable(alice));
    }

    function test_OwnerWithdrawsBalance() public {
        vm.prank(alice);
        ff.mint{value: 0.0005 ether}();
        uint256 ownerBalanceBefore = owner.balance;
        vm.prank(owner);
        ff.withdraw(payable(owner));
        assertEq(owner.balance, ownerBalanceBefore + 0.0005 ether);
    }

    function test_TokenURIUsesBaseURI() public {
        vm.prank(alice);
        ff.mint{value: 0.0005 ether}();
        assertEq(ff.tokenURI(1), "ipfs://baseuri/1");
    }
}
