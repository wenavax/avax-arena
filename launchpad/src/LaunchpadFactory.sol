// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {LaunchToken} from "./LaunchToken.sol";
import {BondingCurvePool} from "./BondingCurvePool.sol";

/// @title LaunchpadFactory
/// @notice Paid-permissionless factory. Each createToken clones an isolated
///         LaunchToken + BondingCurvePool. Config changes affect FUTURE launches
///         only; launched pools snapshot their params at init and are immutable.
///         paused() gates new launches and (read by pools) buys — never sells.
contract LaunchpadFactory is Ownable, Pausable, ReentrancyGuard {
    struct Config {
        uint256 launchFee;
        uint16 tradingFeeBps;
        uint256 graduationThreshold;
        uint256 vAvax0;
        uint256 y0;
        uint256 totalSupply;
        uint256 curveSupply;
        uint256 lpReserve;
        address treasury;
        address joeRouter;
    }

    struct Launch {
        address token;
        address pool;
        address creator;
    }

    address public immutable tokenImpl;
    address public immutable poolImpl;
    Config public config;
    Launch[] public launches;

    error InsufficientFee();
    error RefundFailed();
    error FeePayoutFailed();

    event TokenLaunched(uint256 indexed id, address indexed token, address indexed pool, address creator, string metadataURI);
    event ConfigUpdated();

    function _validateConfig(Config memory c) internal pure {
        require(c.vAvax0 > 0 && c.curveSupply > 0 && c.lpReserve > 0 && c.graduationThreshold > 0, "zero param");
        require(c.curveSupply <= type(uint112).max && c.lpReserve <= type(uint112).max, "reserve too large");
        require(c.treasury != address(0) && c.joeRouter != address(0), "zero addr");
        require(c.tradingFeeBps <= 500, "fee too high");
        require(c.y0 > c.curveSupply, "y0<=curveSupply");
        require(c.totalSupply == c.curveSupply + c.lpReserve, "supply mismatch");
        require(c.graduationThreshold <= Math.mulDiv(c.vAvax0, c.curveSupply, c.y0 - c.curveSupply), "threshold unreachable");
    }

    constructor(Config memory c) Ownable(msg.sender) {
        _validateConfig(c);
        tokenImpl = address(new LaunchToken());
        poolImpl = address(new BondingCurvePool());
        config = c;
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }

    function createToken(string calldata name, string calldata symbol, string calldata metadataURI)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (address token, address pool)
    {
        Config memory c = config; // snapshot
        if (msg.value < c.launchFee) revert InsufficientFee();

        token = Clones.clone(tokenImpl);
        pool = Clones.clone(poolImpl);

        LaunchToken(token).initialize(name, symbol, c.totalSupply, pool);
        BondingCurvePool(payable(pool)).initialize(BondingCurvePool.InitParams({
            factory: address(this),
            token: token,
            vAvax0: c.vAvax0,
            y0: c.y0,
            curveSupply: c.curveSupply,
            lpReserve: c.lpReserve,
            graduationThreshold: c.graduationThreshold,
            tradingFeeBps: c.tradingFeeBps,
            treasury: c.treasury,
            joeRouter: c.joeRouter
        }));

        launches.push(Launch(token, pool, msg.sender));
        emit TokenLaunched(launches.length - 1, token, pool, msg.sender, metadataURI);

        if (c.launchFee > 0) {
            (bool ok,) = c.treasury.call{value: c.launchFee}("");
            if (!ok) revert FeePayoutFailed();
        }
        uint256 refund = msg.value - c.launchFee;
        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            if (!ok) revert RefundFailed();
        }
    }

    // --- owner (Safe) governance: FUTURE launches only ---
    function setLaunchFee(uint256 v) external onlyOwner { config.launchFee = v; emit ConfigUpdated(); }
    function setTradingFeeBps(uint16 v) external onlyOwner { require(v <= 500, "fee too high"); config.tradingFeeBps = v; emit ConfigUpdated(); }
    function setGraduationThreshold(uint256 v) external onlyOwner { config.graduationThreshold = v; emit ConfigUpdated(); _validateConfig(config); }
    function setCurveParams(uint256 vAvax0_, uint256 y0_) external onlyOwner { config.vAvax0 = vAvax0_; config.y0 = y0_; emit ConfigUpdated(); _validateConfig(config); }
    function setTreasury(address v) external onlyOwner { require(v != address(0)); config.treasury = v; emit ConfigUpdated(); }
    function setJoeRouter(address v) external onlyOwner { require(v != address(0)); config.joeRouter = v; emit ConfigUpdated(); }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
