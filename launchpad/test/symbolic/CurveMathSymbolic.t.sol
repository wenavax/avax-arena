// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CurveMath} from "../../src/libraries/CurveMath.sol";

/// @notice Halmos symbolic proofs of the curve's core safety properties. Unlike
///         fuzzing (which samples inputs), Halmos proves these hold for ALL inputs
///         in the stated bounds (or returns a concrete counterexample).
///         Params are uint128 to keep the symbolic search tractable; the whole
///         deployed range fits (1e24 AVAX < 2^80, 2e27 tokens < 2^92 < 2^128).
///         Run: halmos --function check_ --match-contract CurveMathSymbolic
contract CurveMathSymbolic is Test {
    uint256 constant MAX_AVAX = 1e24;   // 1,000,000 AVAX
    uint256 constant MAX_TOK = 2e27;    // 2,000,000,000 tokens

    /// SOLVENCY: a sell can never withdraw more than the real AVAX reserve.
    function check_avaxOut_neverExceedsReserve(uint128 vAvax0, uint128 y0, uint128 realAvax, uint128 tokensIn)
        public
        pure
    {
        vm.assume(vAvax0 > 0 && vAvax0 <= MAX_AVAX);
        vm.assume(y0 > 0 && y0 <= MAX_TOK);
        vm.assume(realAvax <= MAX_AVAX);
        vm.assume(tokensIn <= y0);
        uint256 out = CurveMath.avaxOut(vAvax0, y0, realAvax, tokensIn);
        assert(out <= realAvax);
    }

    /// NO FREE MONEY: buying then immediately selling the tokens back at the
    /// post-buy reserve never returns more AVAX than was paid in.
    function check_roundTrip_neverProfitable(uint128 vAvax0, uint128 y0, uint128 realAvax, uint128 avaxIn)
        public
        pure
    {
        vm.assume(vAvax0 > 0 && vAvax0 <= MAX_AVAX);
        vm.assume(y0 > 0 && y0 <= MAX_TOK);
        vm.assume(realAvax <= MAX_AVAX);
        vm.assume(avaxIn > 0 && avaxIn <= MAX_AVAX);
        uint256 tokens = CurveMath.tokensOut(vAvax0, y0, realAvax, avaxIn);
        vm.assume(tokens > 0 && tokens < y0);
        uint256 back = CurveMath.avaxOut(vAvax0, y0, uint256(realAvax) + avaxIn, tokens);
        assert(back <= avaxIn);
    }

    /// BOUNDED OUTPUT: a buy can never mint more tokens than the token-side
    /// virtual reserve (a stronger no-inflation bound than the supply guard).
    function check_tokensOut_boundedByReserve(uint128 vAvax0, uint128 y0, uint128 realAvax, uint128 avaxIn)
        public
        pure
    {
        vm.assume(vAvax0 > 0 && vAvax0 <= MAX_AVAX);
        vm.assume(y0 > 0 && y0 <= MAX_TOK);
        vm.assume(realAvax <= MAX_AVAX);
        vm.assume(avaxIn <= MAX_AVAX);
        uint256 out = CurveMath.tokensOut(vAvax0, y0, realAvax, avaxIn);
        assert(out <= y0);
    }
}
