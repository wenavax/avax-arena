// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";
import {BondingCurvePool} from "../../src/BondingCurvePool.sol";
import {IJoeRouter, IJoeFactoryLike} from "../../src/interfaces/IJoeRouter.sol";

contract StubFactoryF { function paused() external pure returns (bool) { return false; } }
interface IWAVAXf { function deposit() external payable; function transfer(address,uint256) external returns (bool); function balanceOf(address) external view returns (uint256); }
interface IERC20f { function balanceOf(address) external view returns (uint256); function transfer(address,uint256) external returns (bool); }
interface IPairFull {
    function mint(address to) external returns (uint256);
    function getReserves() external view returns (uint112 r0, uint112 r1, uint32);
    function token0() external view returns (address);
    function totalSupply() external view returns (uint256);
    function balanceOf(address) external view returns (uint256);
}

contract GraduationForkTest is Test {
    address constant JOE_ROUTER = 0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901; // Fuji V1 (verified)
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint256 constant TOTAL = 1_000_000_000e18;
    uint256 constant CURVE = 800_000_000e18;
    uint256 constant LP = 200_000_000e18;

    BondingCurvePool poolImpl;
    LaunchToken tokenImpl;
    address wavax;
    address jfactory;
    address buyer = address(0xB0B);

    function setUp() public {
        vm.createSelectFork(vm.envString("FUJI_RPC_URL"));
        wavax = IJoeRouter(JOE_ROUTER).WAVAX();
        jfactory = IJoeRouter(JOE_ROUTER).factory();
        poolImpl = new BondingCurvePool();
        tokenImpl = new LaunchToken();
    }

    function _fresh() internal returns (LaunchToken token, BondingCurvePool pool) {
        StubFactoryF f = new StubFactoryF();
        token = LaunchToken(Clones.clone(address(tokenImpl)));
        pool = BondingCurvePool(payable(Clones.clone(address(poolImpl))));
        token.initialize("ForkMeme", "FMEME", TOTAL, address(pool));
        pool.initialize(BondingCurvePool.InitParams({
            factory: address(f), token: address(token), vAvax0: 30e18, y0: 1_073_000_000e18,
            curveSupply: CURVE, lpReserve: LP, graduationThreshold: 60e18,
            tradingFeeBps: 100, treasury: address(0x7), joeRouter: JOE_ROUTER
        }));
    }

    function test_fork_graduationSeedsRealPair() public {
        (LaunchToken token, BondingCurvePool pool) = _fresh();
        vm.deal(buyer, 1000e18);
        vm.prank(buyer);
        pool.buy{value: 70e18}(0, block.timestamp);

        assertEq(uint256(pool.state()), uint256(BondingCurvePool.State.Graduated), "graduated");
        address pair = IJoeFactoryLike(jfactory).getPair(address(token), wavax);
        assertTrue(pair != address(0), "real TJ pair created");
        assertEq(token.balanceOf(pair), LP, "pair holds LP token reserve");
        assertGe(IWAVAXf(wavax).balanceOf(pair), 60e18, "pair holds WAVAX >= threshold");
        assertGt(IERC20f(pair).balanceOf(DEAD), 0, "LP minted to burn");
        assertEq(token.balanceOf(address(pool)), 0, "no tokens stranded");
    }

    // Realistic griefing: attacker pre-creates + moderately skews the pair, then
    // graduation must still succeed (no permanent DoS).
    function test_fork_graduationSurvivesModerateSkew() public {
        (LaunchToken token, BondingCurvePool pool) = _fresh();
        vm.deal(buyer, 1000e18);
        // attacker buys some tokens to donate
        vm.prank(buyer);
        uint256 got = pool.buy{value: 3e18}(0, block.timestamp);
        // create + skew the pair with a moderate lopsided donation
        address pair = IJoeFactoryLike(jfactory).createPair(address(token), wavax);
        vm.prank(buyer);
        IERC20f(address(token)).transfer(pair, got);
        vm.deal(address(this), 1e18);
        IWAVAXf(wavax).deposit{value: 1e18}();
        IWAVAXf(wavax).transfer(pair, 1e18);
        // push over threshold
        vm.prank(buyer);
        pool.buy{value: 70e18}(0, block.timestamp);
        assertEq(uint256(pool.state()), uint256(BondingCurvePool.State.Graduated), "survived moderate skew");
        assertGt(IERC20f(pair).balanceOf(DEAD), 0, "LP still minted to burn");
    }

    // F6 residual: empirically test whether an attacker who pre-creates the pair AND
    // sets EXTREME reserves (massive token side, 1-wei WAVAX) before graduation causes
    // a DoS (revert) or merely dilution/price-skew.
    function test_fork_graduationVsExtremeReserveSkew() public {
        (LaunchToken token, BondingCurvePool pool) = _fresh();
        vm.deal(buyer, 2000e18);
        address attacker = address(0xA77ACC);
        vm.deal(attacker, 100e18);

        // 1. attacker creates the pair
        address pair = IJoeFactoryLike(jfactory).createPair(address(token), wavax);

        // 2. attacker buys a large token inventory on the curve.
        //    10e18 gross (9.9e18 net) → ~266M tokens (33% of 800M curve supply).
        //    NOTE: 40e18 was originally specified but that depletes the curve to the
        //    point where the subsequent 70e18 graduation buy overshoots (841M > 800M
        //    curveSupply) and reverts ExceedsCurveSupply — a separate invariant, NOT
        //    the F6 pair.mint DoS. 10e18 leaves ~778M total tokens used, safely under
        //    the 800M limit, so this test correctly isolates the F6 hypothesis.
        vm.prank(attacker);
        uint256 inv = pool.buy{value: 10e18}(0, block.timestamp);
        emit log_named_uint("attacker token inventory", inv);

        // 3. attacker sets EXTREME reserves: many tokens, almost no WAVAX
        vm.prank(attacker);
        IERC20f(address(token)).transfer(pair, inv);            // huge token side
        vm.prank(attacker);
        IWAVAXf(wavax).deposit{value: 1}();                     // 1 wei AVAX -> 1 wei WAVAX
        vm.prank(attacker);
        IWAVAXf(wavax).transfer(pair, 1);                       // tiny wavax side
        vm.prank(attacker);
        try IPairFull(pair).mint(attacker) returns (uint256 lp) {
            emit log_named_uint("attacker LP minted", lp);
        } catch Error(string memory reason) {
            emit log_named_string("attacker mint reverted", reason);
        }
        (uint112 r0, uint112 r1,) = IPairFull(pair).getReserves();
        emit log_named_uint("reserve0 after attacker skew", r0);
        emit log_named_uint("reserve1 after attacker skew", r1);

        // 4. a normal buyer graduates the pool
        vm.prank(buyer);
        try pool.buy{value: 70e18}(0, block.timestamp) {
            emit log_string("graduation buy SUCCEEDED");
        } catch Error(string memory reason) {
            emit log_named_string("graduation buy REVERTED", reason);
        } catch (bytes memory) {
            emit log_string("graduation buy REVERTED (low-level)");
        }

        // Record the empirical outcome
        bool graduated = uint256(pool.state()) == uint256(BondingCurvePool.State.Graduated);
        emit log_named_uint("graduated (1=yes)", graduated ? 1 : 0);
        if (graduated) {
            emit log_named_uint("protocol LP burned to DEAD", IPairFull(pair).balanceOf(DEAD));
            (uint112 a0, uint112 a1,) = IPairFull(pair).getReserves();
            emit log_named_uint("final reserve0", a0);
            emit log_named_uint("final reserve1", a1);
        }
        // KEY assertion: graduation must NOT be permanently DoS'd by extreme reserve skew.
        assertTrue(graduated, "graduation should not be DoS'd even by extreme reserve skew");
    }
}
