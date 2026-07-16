// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AtlasTreasury} from "../src/AtlasTreasury.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract AtlasTreasuryTest is Test {
    AtlasTreasury vault;
    MockUSDC usdc;
    address destination = address(0xDE57);
    address random = address(0xBABE);

    uint256 constant THRESHOLD = 50_000_000; // 50 USDC

    function setUp() public {
        usdc = new MockUSDC();
        vault = new AtlasTreasury(address(usdc), destination, THRESHOLD);
    }

    function test_constructor_revertsZeroUsdc() public {
        vm.expectRevert(AtlasTreasury.ZeroAddress.selector);
        new AtlasTreasury(address(0), destination, THRESHOLD);
    }

    function test_constructor_revertsZeroDestination() public {
        vm.expectRevert(AtlasTreasury.ZeroAddress.selector);
        new AtlasTreasury(address(usdc), address(0), THRESHOLD);
    }

    function test_constructor_revertsZeroThreshold() public {
        vm.expectRevert(AtlasTreasury.ZeroThreshold.selector);
        new AtlasTreasury(address(usdc), destination, 0);
    }

    function test_destinationImmutable() public view {
        assertEq(vault.destination(), destination);
        // No setDestination function → compile-time guarantee.
    }

    function test_sweep_revertsBelowThreshold() public {
        usdc.mint(address(vault), THRESHOLD - 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                AtlasTreasury.BelowThreshold.selector,
                THRESHOLD - 1,
                THRESHOLD
            )
        );
        vault.sweep();
    }

    function test_sweep_happyPath() public {
        usdc.mint(address(vault), THRESHOLD);
        assertTrue(vault.canSweep());

        vm.expectEmit(true, false, false, true, address(vault));
        emit AtlasTreasury.Swept(random, THRESHOLD);
        vm.prank(random);
        vault.sweep();

        assertEq(usdc.balanceOf(destination), THRESHOLD);
        assertEq(vault.balance(), 0);
        assertFalse(vault.canSweep());
    }

    function test_sweep_forwardsExcess() public {
        usdc.mint(address(vault), THRESHOLD * 3);
        vault.sweep();
        assertEq(usdc.balanceOf(destination), THRESHOLD * 3);
        assertEq(vault.balance(), 0);
    }

    function test_sweep_permissionless() public {
        usdc.mint(address(vault), THRESHOLD);
        vm.prank(random);
        vault.sweep();
        assertEq(usdc.balanceOf(destination), THRESHOLD);
    }

    function test_canSweep() public {
        assertFalse(vault.canSweep());
        usdc.mint(address(vault), THRESHOLD - 1);
        assertFalse(vault.canSweep());
        usdc.mint(address(vault), 1);
        assertTrue(vault.canSweep());
    }

    function test_balance() public {
        assertEq(vault.balance(), 0);
        usdc.mint(address(vault), 123);
        assertEq(vault.balance(), 123);
    }
}
