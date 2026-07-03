// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {CurveMath} from "./libraries/CurveMath.sol";
import {IJoeRouter} from "./interfaces/IJoeRouter.sol";
import {IPausableFactory} from "./interfaces/IPausableFactory.sol";

/// @title BondingCurvePool
/// @notice One AVAX bonding-curve pool per launched token. Custodies only this
///         token's reserve; no owner path to those funds. Graduates to Trader
///         Joe V1 with burned LP once realAvax reaches the threshold.
contract BondingCurvePool is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address internal constant BURN = 0x000000000000000000000000000000000000dEaD;
    uint16 internal constant MAX_FEE_BPS = 1000; // 10% hard ceiling

    enum State { Trading, Graduated }

    struct InitParams {
        address factory;
        address token;
        uint256 vAvax0;
        uint256 y0;
        uint256 curveSupply;
        uint256 lpReserve;
        uint256 graduationThreshold;
        uint16 tradingFeeBps;
        address treasury;
        address joeRouter;
    }

    address public factory;
    IERC20 public token;
    uint256 public vAvax0;
    uint256 public y0;
    uint256 public curveSupply;
    uint256 public lpReserve;
    uint256 public graduationThreshold;
    uint16 public tradingFeeBps;
    address public treasury;
    address public joeRouter;

    uint256 public realAvax;
    uint256 public tokensSold;
    State public state;

    error Expired();
    error Halted();
    error Slippage();
    error NotTrading();
    error ZeroAmount();
    error ExceedsCurveSupply();
    error ExceedsSold();
    error TransferFailed();
    error ZeroAddress();
    error FeeTooHigh();
    error BadCurveParams();

    event Buy(address indexed buyer, uint256 avaxIn, uint256 fee, uint256 tokensOut, uint256 reserveAfter);
    event Sell(address indexed seller, uint256 tokensIn, uint256 fee, uint256 avaxOut, uint256 reserveAfter);
    event Graduated(uint256 avaxToLp, uint256 tokensToLp);

    constructor() {
        _disableInitializers();
    }

    function initialize(InitParams calldata p) external initializer {
        if (p.factory == address(0) || p.token == address(0) || p.treasury == address(0) || p.joeRouter == address(0)) revert ZeroAddress();
        if (p.tradingFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        if (p.y0 <= p.curveSupply) revert BadCurveParams();
        // Graduation must be reachable BEFORE the curve exhausts its supply, else
        // buys would revert (ExceedsCurveSupply) and graduation could never fire.
        // R_exhaust = vAvax0 * curveSupply / (y0 - curveSupply).
        if (p.graduationThreshold > Math.mulDiv(p.vAvax0, p.curveSupply, p.y0 - p.curveSupply)) revert BadCurveParams();
        factory = p.factory;
        token = IERC20(p.token);
        vAvax0 = p.vAvax0;
        y0 = p.y0;
        curveSupply = p.curveSupply;
        lpReserve = p.lpReserve;
        graduationThreshold = p.graduationThreshold;
        tradingFeeBps = p.tradingFeeBps;
        treasury = p.treasury;
        joeRouter = p.joeRouter;
        state = State.Trading;
    }

    function buy(uint256 minTokensOut, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 out)
    {
        if (block.timestamp > deadline) revert Expired();
        if (state != State.Trading) revert NotTrading();
        if (IPausableFactory(factory).paused()) revert Halted();
        if (msg.value == 0) revert ZeroAmount();

        uint256 fee = (msg.value * tradingFeeBps) / 10000;
        uint256 avaxIn = msg.value - fee;
        out = CurveMath.tokensOut(vAvax0, y0, realAvax, avaxIn);
        if (out == 0) revert ZeroAmount();
        if (out < minTokensOut) revert Slippage();
        if (tokensSold + out > curveSupply) revert ExceedsCurveSupply();

        realAvax += avaxIn;
        tokensSold += out;

        if (fee > 0) _sendAvax(treasury, fee);
        token.safeTransfer(msg.sender, out);
        emit Buy(msg.sender, avaxIn, fee, out, realAvax);

        if (realAvax >= graduationThreshold || tokensSold >= curveSupply) _graduate();
    }

    function sell(uint256 tokenIn, uint256 minAvaxOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 net)
    {
        if (block.timestamp > deadline) revert Expired();
        if (state != State.Trading) revert NotTrading();
        if (tokenIn == 0) revert ZeroAmount();
        if (tokenIn > tokensSold) revert ExceedsSold();

        uint256 gross = CurveMath.avaxOut(vAvax0, y0, realAvax, tokenIn);
        uint256 fee = (gross * tradingFeeBps) / 10000;
        net = gross - fee;
        if (net < minAvaxOut) revert Slippage();

        realAvax -= gross;
        tokensSold -= tokenIn;

        token.safeTransferFrom(msg.sender, address(this), tokenIn);
        if (fee > 0) _sendAvax(treasury, fee);
        _sendAvax(msg.sender, net);
        emit Sell(msg.sender, tokenIn, fee, net, realAvax);
    }

    function _graduate() internal {
        state = State.Graduated; // effects before external calls
        uint256 avaxToLp = realAvax;
        uint256 tokensToLp = lpReserve;

        token.forceApprove(joeRouter, tokensToLp);
        IJoeRouter(joeRouter).addLiquidityAVAX{value: avaxToLp}(
            address(token), tokensToLp, tokensToLp, avaxToLp, BURN, block.timestamp
        );
        // Burn unsold curve tokens (curveSupply - tokensSold) so none are stranded.
        uint256 leftover = token.balanceOf(address(this));
        if (leftover > 0) token.safeTransfer(BURN, leftover);
        emit Graduated(avaxToLp, tokensToLp);
    }

    function _sendAvax(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
