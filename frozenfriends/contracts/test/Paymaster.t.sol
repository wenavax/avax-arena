// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../src/Paymaster.sol";

contract PaymasterTest is Test {
    Paymaster pm;
    address owner = address(0xA11CE);
    address alice = address(0xA1);

    function setUp() public {
        vm.prank(owner);
        pm = new Paymaster();
    }

    function test_InitiallyCanSponsor() public {
        assertTrue(pm.canSponsor(alice));
    }

    function test_OwnerCanRecord() public {
        vm.prank(owner);
        pm.recordSponsoredTx(alice);
        assertEq(pm.sponsoredTxCount(alice), 1);
    }

    function test_NonOwnerCannotRecord() public {
        vm.prank(alice);
        vm.expectRevert();
        pm.recordSponsoredTx(alice);
    }

    function test_CannotSponsorAfterLimit() public {
        for (uint256 i = 0; i < 20; i++) {
            vm.prank(owner);
            pm.recordSponsoredTx(alice);
        }
        assertFalse(pm.canSponsor(alice));
    }

    function test_ToggleSponsorshipOff() public {
        vm.prank(owner);
        pm.toggleSponsorship();
        assertFalse(pm.canSponsor(alice));
    }
}
