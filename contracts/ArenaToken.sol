// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title FrostbiteToken
/// @notice ERC-20 platform token for the Frostbite ecosystem.
///         Used as a reward token minted by the GameEngine and Tournament contracts.
contract FrostbiteToken is ERC20, Ownable {
    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    /// @notice Hard cap on total supply: 100 million tokens (18 decimals).
    uint256 public constant MAX_SUPPLY = 100_000_000 ether;

    /// @notice Initial mint allocated to the deployer for liquidity, treasury, etc.
    uint256 public constant INITIAL_SUPPLY = 10_000_000 ether;

    // -----------------------------------------------------------------------
    // State variables
    // -----------------------------------------------------------------------

    /// @notice Address of the GameEngine contract authorised to mint reward tokens.
    address public gameEngine;

    /// @notice Address of the Tournament contract authorised to mint reward tokens.
    address public tournament;

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error ZeroAddress();
    error UnauthorizedMinter();
    error ExceedsMaxSupply();

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event GameEngineUpdated(address indexed oldEngine, address indexed newEngine);
    event TournamentUpdated(address indexed oldTournament, address indexed newTournament);
    event RewardMinted(address indexed to, uint256 amount);

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /// @notice Deploys the token, sets the deployer as owner, and mints 10M
    ///         tokens to the deployer's address.
    constructor()
        ERC20("Frostbite", "FSB")
        Ownable(msg.sender)
    {
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    // -----------------------------------------------------------------------
    // Owner functions
    // -----------------------------------------------------------------------

    /// @notice Set or update the GameEngine address that is allowed to mint rewards.
    /// @param _gameEngine The new GameEngine contract address.
    function setGameEngine(address _gameEngine) external onlyOwner {
        if (_gameEngine == address(0)) revert ZeroAddress();
        address old = gameEngine;
        gameEngine = _gameEngine;
        emit GameEngineUpdated(old, _gameEngine);
    }

    /// @notice Set or update the Tournament address that is allowed to mint rewards.
    /// @param _tournament The new Tournament contract address.
    function setTournament(address _tournament) external onlyOwner {
        if (_tournament == address(0)) revert ZeroAddress();
        address old = tournament;
        tournament = _tournament;
        emit TournamentUpdated(old, _tournament);
    }

    // -----------------------------------------------------------------------
    // Minting
    // -----------------------------------------------------------------------

    /// @notice Mint reward tokens to a recipient. Only the GameEngine or
    ///         Tournament contracts may call this function.
    /// @param _to     The address to receive the newly minted tokens.
    /// @param _amount The number of tokens to mint (in wei / 18-decimal units).
    function mintReward(address _to, uint256 _amount) external {
        if (msg.sender != gameEngine && msg.sender != tournament) {
            revert UnauthorizedMinter();
        }
        if (_to == address(0)) revert ZeroAddress();
        if (totalSupply() + _amount > MAX_SUPPLY) revert ExceedsMaxSupply();

        _mint(_to, _amount);

        emit RewardMinted(_to, _amount);
    }
}
