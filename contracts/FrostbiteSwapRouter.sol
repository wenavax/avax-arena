// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FrostbiteSwapRouter
 * @notice Wraps Trader Joe LBRouter V2.1 swaps with a protocol fee.
 *         Fee is taken from input amount before forwarding to LBRouter.
 */
contract FrostbiteSwapRouter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ── Types ─────────────────────────────────────────────── */

    struct Path {
        uint256[] pairBinSteps;
        uint8[] versions;
        address[] tokenPath;
    }

    /* ── State ─────────────────────────────────────────────── */

    address public immutable lbRouter;
    address public feeRecipient;
    uint256 public feeBps; // basis points (e.g. 30 = 0.30%)

    uint256 public constant MAX_FEE_BPS = 300; // 3% hard cap

    /* ── Events ────────────────────────────────────────────── */

    event FeeCollected(address indexed token, uint256 amount, address indexed recipient);
    event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);

    /* ── Constructor ───────────────────────────────────────── */

    constructor(
        address _lbRouter,
        address _feeRecipient,
        uint256 _feeBps
    ) Ownable(msg.sender) {
        require(_lbRouter != address(0), "Invalid router");
        require(_feeRecipient != address(0), "Invalid fee recipient");
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");

        lbRouter = _lbRouter;
        feeRecipient = _feeRecipient;
        feeBps = _feeBps;
    }

    /* ── Admin ─────────────────────────────────────────────── */

    function setFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");
        emit FeeUpdated(feeBps, _feeBps);
        feeBps = _feeBps;
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        emit FeeRecipientUpdated(feeRecipient, _feeRecipient);
        feeRecipient = _feeRecipient;
    }

    /* ── AVAX → Token ──────────────────────────────────────── */

    function swapExactNATIVEForTokens(
        uint256 amountOutMin,
        Path calldata path,
        address to,
        uint256 deadline
    ) external payable nonReentrant returns (uint256 amountOut) {
        require(msg.value > 0, "No AVAX sent");

        // Take fee from AVAX
        uint256 fee = (msg.value * feeBps) / 10000;
        uint256 swapAmount = msg.value - fee;

        if (fee > 0) {
            (bool sent, ) = feeRecipient.call{value: fee}("");
            require(sent, "Fee transfer failed");
            emit FeeCollected(address(0), fee, feeRecipient);
        }

        // Forward to LBRouter
        (bool success, bytes memory result) = lbRouter.call{value: swapAmount}(
            abi.encodeWithSignature(
                "swapExactNATIVEForTokens(uint256,(uint256[],uint8[],address[]),address,uint256)",
                amountOutMin,
                path,
                to,
                deadline
            )
        );
        require(success, _getRevertMsg(result));

        amountOut = abi.decode(result, (uint256));
    }

    /* ── Token → AVAX ──────────────────────────────────────── */

    function swapExactTokensForNATIVE(
        uint256 amountIn,
        uint256 amountOutMinNATIVE,
        Path calldata path,
        address to,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "Zero amount");
        require(path.tokenPath.length >= 2, "Invalid path");

        address tokenIn = path.tokenPath[0];

        // Take fee from input token
        uint256 fee = (amountIn * feeBps) / 10000;
        uint256 swapAmount = amountIn - fee;

        // Pull tokens from sender
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        if (fee > 0) {
            IERC20(tokenIn).safeTransfer(feeRecipient, fee);
            emit FeeCollected(tokenIn, fee, feeRecipient);
        }

        // Approve LBRouter
        IERC20(tokenIn).forceApprove(lbRouter, swapAmount);

        // Forward to LBRouter
        (bool success, bytes memory result) = lbRouter.call(
            abi.encodeWithSignature(
                "swapExactTokensForNATIVE(uint256,uint256,(uint256[],uint8[],address[]),address,uint256)",
                swapAmount,
                amountOutMinNATIVE,
                path,
                to,
                deadline
            )
        );
        require(success, _getRevertMsg(result));

        amountOut = abi.decode(result, (uint256));
    }

    /* ── Token → Token ─────────────────────────────────────── */

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Path calldata path,
        address to,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "Zero amount");
        require(path.tokenPath.length >= 2, "Invalid path");

        address tokenIn = path.tokenPath[0];

        // Take fee from input token
        uint256 fee = (amountIn * feeBps) / 10000;
        uint256 swapAmount = amountIn - fee;

        // Pull tokens from sender
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        if (fee > 0) {
            IERC20(tokenIn).safeTransfer(feeRecipient, fee);
            emit FeeCollected(tokenIn, fee, feeRecipient);
        }

        // Approve LBRouter
        IERC20(tokenIn).forceApprove(lbRouter, swapAmount);

        // Forward to LBRouter
        (bool success, bytes memory result) = lbRouter.call(
            abi.encodeWithSignature(
                "swapExactTokensForTokens(uint256,uint256,(uint256[],uint8[],address[]),address,uint256)",
                swapAmount,
                amountOutMin,
                path,
                to,
                deadline
            )
        );
        require(success, _getRevertMsg(result));

        amountOut = abi.decode(result, (uint256));
    }

    /* ── Recovery ──────────────────────────────────────────── */

    function rescueTokens(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool sent, ) = owner().call{value: amount}("");
            require(sent, "Transfer failed");
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }

    /* ── Internal ──────────────────────────────────────────── */

    function _getRevertMsg(bytes memory returnData) internal pure returns (string memory) {
        if (returnData.length < 68) return "Swap failed";
        assembly {
            returnData := add(returnData, 0x04)
        }
        return abi.decode(returnData, (string));
    }

    receive() external payable {}
}
