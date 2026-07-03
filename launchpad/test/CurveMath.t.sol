// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CurveMath} from "../src/libraries/CurveMath.sol";

contract CurveMathTest is Test {
    uint256 constant V_AVAX0 = 30e18;
    uint256 constant Y0 = 1_073_000_000e18;

    function test_tokensOut_increasesWithReserve_priceMonotone() public pure {
        uint256 dx = 1e18;
        uint256 outEarly = CurveMath.tokensOut(V_AVAX0, Y0, 0, dx);
        uint256 outLate = CurveMath.tokensOut(V_AVAX0, Y0, 100e18, dx);
        assertGt(outEarly, outLate, "price should rise with reserve");
    }

    function test_roundTrip_neverProfitable(uint96 avaxInRaw, uint96 realAvaxRaw) public view {
        uint256 realAvax = uint256(realAvaxRaw);
        uint256 avaxIn = bound(uint256(avaxInRaw), 1e12, 50e18);
        uint256 tokens = CurveMath.tokensOut(V_AVAX0, Y0, realAvax, avaxIn);
        vm.assume(tokens > 0);
        uint256 avaxBack = CurveMath.avaxOut(V_AVAX0, Y0, realAvax + avaxIn, tokens);
        assertLe(avaxBack, avaxIn, "round trip must not print AVAX");
    }

    function test_avaxOut_neverExceedsReserve(uint96 realAvaxRaw, uint96 tokensInRaw) public view {
        uint256 realAvax = bound(uint256(realAvaxRaw), 0, 1_000_000e18);
        uint256 tokensIn = bound(uint256(tokensInRaw), 1, Y0 / 4);
        uint256 out = CurveMath.avaxOut(V_AVAX0, Y0, realAvax, tokensIn);
        assertLe(out, realAvax, "cannot pay out more than the real reserve");
    }
}
