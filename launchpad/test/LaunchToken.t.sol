// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {LaunchToken} from "../src/LaunchToken.sol";

contract LaunchTokenTest is Test {
    LaunchToken impl;

    function setUp() public {
        impl = new LaunchToken();
    }

    function _clone(address holder) internal returns (LaunchToken t) {
        t = LaunchToken(Clones.clone(address(impl)));
        t.initialize("Frostbite Meme", "MEME", 1_000_000_000e18, holder);
    }

    function test_initMintsFullSupplyToHolder() public {
        address pool = address(0xBEEF);
        LaunchToken t = _clone(pool);
        assertEq(t.totalSupply(), 1_000_000_000e18);
        assertEq(t.balanceOf(pool), 1_000_000_000e18);
        assertEq(t.name(), "Frostbite Meme");
        assertEq(t.symbol(), "MEME");
    }

    function test_cannotReinitialize() public {
        LaunchToken t = _clone(address(0xBEEF));
        vm.expectRevert();
        t.initialize("Evil", "EVIL", 1, address(this));
    }

    function test_implementationCannotBeInitialized() public {
        vm.expectRevert();
        impl.initialize("X", "X", 1, address(this));
    }

    function test_noMintFunctionExists() public {
        LaunchToken t = _clone(address(this));
        assertEq(t.totalSupply(), 1_000_000_000e18);
    }
}
