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
}
