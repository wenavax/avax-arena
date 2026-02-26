import { expect } from "chai";
import { network } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";

const { ethers, networkHelpers } = await network.connect();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Hash a move + salt exactly as the contract does. */
function commitHash(move: number, salt: string): string {
  return ethers.solidityPackedKeccak256(["uint8", "bytes32"], [move, salt]);
}

/** Generate a random bytes32 salt. */
function randomSalt(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

// ---------------------------------------------------------------------------
// Constants matching the contract
// ---------------------------------------------------------------------------
const MIN_STAKE = ethers.parseEther("0.01");
const PLATFORM_FEE_BPS = 250n;
const FEE_BASE = 10_000n;

// GameType enum values
const GameType = { CoinFlip: 0, DiceRoll: 1, RPS: 2, NumberGuess: 3 } as const;

// RPS moves
const RPS = { Rock: 1, Paper: 2, Scissors: 3 } as const;

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------
async function deployGameEngineFixture() {
  const [owner, player1, player2, other] = await ethers.getSigners();

  // Deploy ArenaToken
  const ArenaToken = await ethers.getContractFactory("ArenaToken");
  const arenaToken = await ArenaToken.deploy();
  await arenaToken.waitForDeployment();

  // Deploy Leaderboard
  const Leaderboard = await ethers.getContractFactory("Leaderboard");
  const leaderboard = await Leaderboard.deploy();
  await leaderboard.waitForDeployment();

  // Deploy RewardVault
  const RewardVault = await ethers.getContractFactory("RewardVault");
  const rewardVault = await RewardVault.deploy(await arenaToken.getAddress());
  await rewardVault.waitForDeployment();

  // Deploy GameEngine
  const GameEngine = await ethers.getContractFactory("GameEngine");
  const gameEngine = await GameEngine.deploy(
    await rewardVault.getAddress(),
    await leaderboard.getAddress(),
  );
  await gameEngine.waitForDeployment();

  // Set permissions
  await leaderboard.setGameEngine(await gameEngine.getAddress());

  return { arenaToken, leaderboard, rewardVault, gameEngine, owner, player1, player2, other };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("GameEngine", function () {
  // -----------------------------------------------------------------------
  // createGame
  // -----------------------------------------------------------------------
  describe("createGame", function () {
    it("should create a game with correct stake", async function () {
      const { gameEngine, player1 } = await networkHelpers.loadFixture(deployGameEngineFixture);

      const stake = ethers.parseEther("0.1");
      const tx = await gameEngine.connect(player1).createGame(GameType.RPS, { value: stake });

      await expect(tx)
        .to.emit(gameEngine, "GameCreated")
        .withArgs(1n, GameType.RPS, player1.address, stake);

      const game = await gameEngine.getGame(1);
      expect(game.player1).to.equal(player1.address);
      expect(game.stake).to.equal(stake);
      expect(game.state).to.equal(0); // Waiting
      expect(game.gameType).to.equal(GameType.RPS);
    });

    it("should revert with StakeTooLow when stake is below minimum", async function () {
      const { gameEngine, player1 } = await networkHelpers.loadFixture(deployGameEngineFixture);

      const lowStake = ethers.parseEther("0.001");

      await expect(
        gameEngine.connect(player1).createGame(GameType.RPS, { value: lowStake }),
      ).to.be.revertedWithCustomError(gameEngine, "StakeTooLow");
    });

    it("should accept exactly the minimum stake", async function () {
      const { gameEngine, player1 } = await networkHelpers.loadFixture(deployGameEngineFixture);

      await expect(
        gameEngine.connect(player1).createGame(GameType.CoinFlip, { value: MIN_STAKE }),
      ).to.not.be.revert(ethers);
    });
  });

  // -----------------------------------------------------------------------
  // joinGame
  // -----------------------------------------------------------------------
  describe("joinGame", function () {
    it("should allow a second player to join", async function () {
      const { gameEngine, player1, player2 } = await networkHelpers.loadFixture(deployGameEngineFixture);

      const stake = ethers.parseEther("0.1");
      await gameEngine.connect(player1).createGame(GameType.RPS, { value: stake });

      const tx = await gameEngine.connect(player2).joinGame(1, { value: stake });
      await expect(tx).to.emit(gameEngine, "GameJoined").withArgs(1n, player2.address);

      const game = await gameEngine.getGame(1);
      expect(game.player2).to.equal(player2.address);
      expect(game.state).to.equal(1); // Active
    });

    it("should revert with StakeMismatch when stake does not match", async function () {
      const { gameEngine, player1, player2 } = await networkHelpers.loadFixture(deployGameEngineFixture);

      const stake = ethers.parseEther("0.1");
      await gameEngine.connect(player1).createGame(GameType.RPS, { value: stake });

      const wrongStake = ethers.parseEther("0.05");
      await expect(
        gameEngine.connect(player2).joinGame(1, { value: wrongStake }),
      ).to.be.revertedWithCustomError(gameEngine, "StakeMismatch");
    });

    it("should revert with CannotJoinOwnGame when creator tries to join their own game", async function () {
      const { gameEngine, player1 } = await networkHelpers.loadFixture(deployGameEngineFixture);

      const stake = ethers.parseEther("0.1");
      await gameEngine.connect(player1).createGame(GameType.RPS, { value: stake });

      await expect(
        gameEngine.connect(player1).joinGame(1, { value: stake }),
      ).to.be.revertedWithCustomError(gameEngine, "CannotJoinOwnGame");
    });
  });

  // -----------------------------------------------------------------------
  // commitMove
  // -----------------------------------------------------------------------
  describe("commitMove", function () {
    it("should allow both players to commit their moves", async function () {
      const { gameEngine, player1, player2 } = await networkHelpers.loadFixture(deployGameEngineFixture);

      const stake = ethers.parseEther("0.1");
      await gameEngine.connect(player1).createGame(GameType.RPS, { value: stake });
      await gameEngine.connect(player2).joinGame(1, { value: stake });

      const salt1 = randomSalt();
      const salt2 = randomSalt();
      const commit1 = commitHash(RPS.Rock, salt1);
      const commit2 = commitHash(RPS.Scissors, salt2);

      const tx1 = await gameEngine.connect(player1).commitMove(1, commit1);
      await expect(tx1).to.emit(gameEngine, "MoveCommitted").withArgs(1n, player1.address);

      const tx2 = await gameEngine.connect(player2).commitMove(1, commit2);
      await expect(tx2).to.emit(gameEngine, "MoveCommitted").withArgs(1n, player2.address);
    });

    it("should revert with AlreadyCommitted when a player commits twice", async function () {
      const { gameEngine, player1, player2 } = await networkHelpers.loadFixture(deployGameEngineFixture);

      const stake = ethers.parseEther("0.1");
      await gameEngine.connect(player1).createGame(GameType.RPS, { value: stake });
      await gameEngine.connect(player2).joinGame(1, { value: stake });

      const salt = randomSalt();
      const commit = commitHash(RPS.Rock, salt);
      await gameEngine.connect(player1).commitMove(1, commit);

      await expect(
        gameEngine.connect(player1).commitMove(1, commit),
      ).to.be.revertedWithCustomError(gameEngine, "AlreadyCommitted");
    });

    it("should revert with NotAPlayer when a non-participant tries to commit", async function () {
      const { gameEngine, player1, player2, other } = await networkHelpers.loadFixture(deployGameEngineFixture);

      const stake = ethers.parseEther("0.1");
      await gameEngine.connect(player1).createGame(GameType.RPS, { value: stake });
      await gameEngine.connect(player2).joinGame(1, { value: stake });

      const salt = randomSalt();
      const commit = commitHash(RPS.Rock, salt);

      await expect(
        gameEngine.connect(other).commitMove(1, commit),
      ).to.be.revertedWithCustomError(gameEngine, "NotAPlayer");
    });
  });

  // -----------------------------------------------------------------------
  // revealMove and game resolution
  // -----------------------------------------------------------------------
  describe("revealMove", function () {
    it("should reveal moves and auto-resolve the game", async function () {
      const { gameEngine, player1, player2 } = await networkHelpers.loadFixture(deployGameEngineFixture);

      const stake = ethers.parseEther("0.1");
      await gameEngine.connect(player1).createGame(GameType.RPS, { value: stake });
      await gameEngine.connect(player2).joinGame(1, { value: stake });

      const salt1 = randomSalt();
      const salt2 = randomSalt();
      await gameEngine.connect(player1).commitMove(1, commitHash(RPS.Rock, salt1));
      await gameEngine.connect(player2).commitMove(1, commitHash(RPS.Scissors, salt2));

      // Reveal player 1 (Rock)
      const revealTx1 = await gameEngine.connect(player1).revealMove(1, RPS.Rock, salt1);
      await expect(revealTx1).to.emit(gameEngine, "MoveRevealed").withArgs(1n, player1.address, RPS.Rock);

      // Reveal player 2 (Scissors) -> triggers auto-resolution
      const revealTx2 = await gameEngine.connect(player2).revealMove(1, RPS.Scissors, salt2);
      await expect(revealTx2).to.emit(gameEngine, "MoveRevealed").withArgs(1n, player2.address, RPS.Scissors);
      // Rock beats Scissors -> player1 wins
      await expect(revealTx2).to.emit(gameEngine, "GameFinished");

      const game = await gameEngine.getGame(1);
      expect(game.state).to.equal(2); // Finished
      expect(game.winner).to.equal(player1.address);
    });

    it("should revert with InvalidReveal when salt does not match", async function () {
      const { gameEngine, player1, player2 } = await networkHelpers.loadFixture(deployGameEngineFixture);

      const stake = ethers.parseEther("0.1");
      await gameEngine.connect(player1).createGame(GameType.RPS, { value: stake });
      await gameEngine.connect(player2).joinGame(1, { value: stake });

      const salt1 = randomSalt();
      await gameEngine.connect(player1).commitMove(1, commitHash(RPS.Rock, salt1));
      await gameEngine.connect(player2).commitMove(1, commitHash(RPS.Paper, randomSalt()));

      // Try to reveal with a different salt
      const wrongSalt = randomSalt();
      await expect(
        gameEngine.connect(player1).revealMove(1, RPS.Rock, wrongSalt),
      ).to.be.revertedWithCustomError(gameEngine, "InvalidReveal");
    });
  });

  // -----------------------------------------------------------------------
  // Prize distribution
  // -----------------------------------------------------------------------
  describe("prize distribution", function () {
    it("should send 97.5% of pot to winner and 2.5% fee to rewardVault", async function () {
      const { gameEngine, rewardVault, player1, player2 } =
        await networkHelpers.loadFixture(deployGameEngineFixture);

      const stake = ethers.parseEther("1");
      await gameEngine.connect(player1).createGame(GameType.RPS, { value: stake });
      await gameEngine.connect(player2).joinGame(1, { value: stake });

      const salt1 = randomSalt();
      const salt2 = randomSalt();
      // Player1 = Rock, Player2 = Scissors => Player1 wins
      await gameEngine.connect(player1).commitMove(1, commitHash(RPS.Rock, salt1));
      await gameEngine.connect(player2).commitMove(1, commitHash(RPS.Scissors, salt2));

      await gameEngine.connect(player1).revealMove(1, RPS.Rock, salt1);

      const totalPot = stake * 2n;
      const expectedFee = (totalPot * PLATFORM_FEE_BPS) / FEE_BASE;
      const expectedPrize = totalPot - expectedFee;

      const vaultAddress = await rewardVault.getAddress();

      // Reveal player 2 triggers resolution
      await expect(
        gameEngine.connect(player2).revealMove(1, RPS.Scissors, salt2),
      ).to.changeEtherBalances(
        ethers,
        [player1, vaultAddress],
        [expectedPrize, expectedFee],
      );
    });
  });

  // -----------------------------------------------------------------------
  // RPS game logic
  // -----------------------------------------------------------------------
  describe("RPS game logic", function () {
    async function playRPS(
      fixture: Awaited<ReturnType<typeof deployGameEngineFixture>>,
      p1Move: number,
      p2Move: number,
    ) {
      const { gameEngine, player1, player2 } = fixture;
      const stake = ethers.parseEther("0.1");

      await gameEngine.connect(player1).createGame(GameType.RPS, { value: stake });
      const gameId = await gameEngine.gameCounter();
      await gameEngine.connect(player2).joinGame(gameId, { value: stake });

      const salt1 = randomSalt();
      const salt2 = randomSalt();
      await gameEngine.connect(player1).commitMove(gameId, commitHash(p1Move, salt1));
      await gameEngine.connect(player2).commitMove(gameId, commitHash(p2Move, salt2));

      await gameEngine.connect(player1).revealMove(gameId, p1Move, salt1);
      await gameEngine.connect(player2).revealMove(gameId, p2Move, salt2);

      return gameEngine.getGame(gameId);
    }

    it("Rock beats Scissors", async function () {
      const fixture = await networkHelpers.loadFixture(deployGameEngineFixture);
      const game = await playRPS(fixture, RPS.Rock, RPS.Scissors);
      expect(game.winner).to.equal(fixture.player1.address);
    });

    it("Scissors beats Paper", async function () {
      const fixture = await networkHelpers.loadFixture(deployGameEngineFixture);
      const game = await playRPS(fixture, RPS.Scissors, RPS.Paper);
      expect(game.winner).to.equal(fixture.player1.address);
    });

    it("Paper beats Rock", async function () {
      const fixture = await networkHelpers.loadFixture(deployGameEngineFixture);
      const game = await playRPS(fixture, RPS.Paper, RPS.Rock);
      expect(game.winner).to.equal(fixture.player1.address);
    });

    it("same move results in a draw (refund)", async function () {
      const fixture = await networkHelpers.loadFixture(deployGameEngineFixture);
      const game = await playRPS(fixture, RPS.Rock, RPS.Rock);
      expect(game.winner).to.equal(ethers.ZeroAddress);
    });

    it("Paper loses to Scissors", async function () {
      const fixture = await networkHelpers.loadFixture(deployGameEngineFixture);
      const game = await playRPS(fixture, RPS.Paper, RPS.Scissors);
      expect(game.winner).to.equal(fixture.player2.address);
    });
  });

  // -----------------------------------------------------------------------
  // CoinFlip game logic
  // -----------------------------------------------------------------------
  describe("CoinFlip game logic", function () {
    it("even sum means player1 wins (1+1=2)", async function () {
      const fixture = await networkHelpers.loadFixture(deployGameEngineFixture);
      const { gameEngine, player1, player2 } = fixture;

      const stake = ethers.parseEther("0.1");
      await gameEngine.connect(player1).createGame(GameType.CoinFlip, { value: stake });
      await gameEngine.connect(player2).joinGame(1, { value: stake });

      const salt1 = randomSalt();
      const salt2 = randomSalt();
      // Both choose Heads (1). Sum = 2, even => player1 wins
      await gameEngine.connect(player1).commitMove(1, commitHash(1, salt1));
      await gameEngine.connect(player2).commitMove(1, commitHash(1, salt2));

      await gameEngine.connect(player1).revealMove(1, 1, salt1);
      await gameEngine.connect(player2).revealMove(1, 1, salt2);

      const game = await gameEngine.getGame(1);
      expect(game.winner).to.equal(player1.address);
    });

    it("odd sum means player2 wins (1+2=3)", async function () {
      const fixture = await networkHelpers.loadFixture(deployGameEngineFixture);
      const { gameEngine, player1, player2 } = fixture;

      const stake = ethers.parseEther("0.1");
      await gameEngine.connect(player1).createGame(GameType.CoinFlip, { value: stake });
      await gameEngine.connect(player2).joinGame(1, { value: stake });

      const salt1 = randomSalt();
      const salt2 = randomSalt();
      // Player1 = Heads (1), Player2 = Tails (2). Sum = 3, odd => player2 wins
      await gameEngine.connect(player1).commitMove(1, commitHash(1, salt1));
      await gameEngine.connect(player2).commitMove(1, commitHash(2, salt2));

      await gameEngine.connect(player1).revealMove(1, 1, salt1);
      await gameEngine.connect(player2).revealMove(1, 2, salt2);

      const game = await gameEngine.getGame(1);
      expect(game.winner).to.equal(player2.address);
    });
  });

  // -----------------------------------------------------------------------
  // Leaderboard integration
  // -----------------------------------------------------------------------
  describe("leaderboard integration", function () {
    it("should update the leaderboard after a game is resolved", async function () {
      const { gameEngine, leaderboard, player1, player2 } =
        await networkHelpers.loadFixture(deployGameEngineFixture);

      const stake = ethers.parseEther("0.1");
      await gameEngine.connect(player1).createGame(GameType.RPS, { value: stake });
      await gameEngine.connect(player2).joinGame(1, { value: stake });

      const salt1 = randomSalt();
      const salt2 = randomSalt();
      // Rock beats Scissors -> player1 wins
      await gameEngine.connect(player1).commitMove(1, commitHash(RPS.Rock, salt1));
      await gameEngine.connect(player2).commitMove(1, commitHash(RPS.Scissors, salt2));

      await gameEngine.connect(player1).revealMove(1, RPS.Rock, salt1);
      await gameEngine.connect(player2).revealMove(1, RPS.Scissors, salt2);

      // Check leaderboard was updated for the winner
      const playerScore = await leaderboard.getPlayerScore(1, player1.address);
      expect(playerScore.score).to.be.gt(0n);
      expect(playerScore.gamesPlayed).to.equal(1n);
    });
  });

  // -----------------------------------------------------------------------
  // Stats tracking (playerWins, playerTotalGames)
  // -----------------------------------------------------------------------
  describe("stats tracking", function () {
    it("should increment playerWins and playerTotalGames correctly", async function () {
      const { gameEngine, player1, player2 } =
        await networkHelpers.loadFixture(deployGameEngineFixture);

      const stake = ethers.parseEther("0.1");
      await gameEngine.connect(player1).createGame(GameType.RPS, { value: stake });
      await gameEngine.connect(player2).joinGame(1, { value: stake });

      const salt1 = randomSalt();
      const salt2 = randomSalt();
      // Rock beats Scissors -> player1 wins
      await gameEngine.connect(player1).commitMove(1, commitHash(RPS.Rock, salt1));
      await gameEngine.connect(player2).commitMove(1, commitHash(RPS.Scissors, salt2));

      await gameEngine.connect(player1).revealMove(1, RPS.Rock, salt1);
      await gameEngine.connect(player2).revealMove(1, RPS.Scissors, salt2);

      expect(await gameEngine.playerWins(player1.address)).to.equal(1n);
      expect(await gameEngine.playerWins(player2.address)).to.equal(0n);
      expect(await gameEngine.playerTotalGames(player1.address)).to.equal(1n);
      expect(await gameEngine.playerTotalGames(player2.address)).to.equal(1n);
    });

    it("should track multiple games for the same players", async function () {
      const { gameEngine, player1, player2 } =
        await networkHelpers.loadFixture(deployGameEngineFixture);

      const stake = ethers.parseEther("0.1");

      // Game 1: Player1 wins (Rock vs Scissors)
      await gameEngine.connect(player1).createGame(GameType.RPS, { value: stake });
      await gameEngine.connect(player2).joinGame(1, { value: stake });
      let salt1 = randomSalt();
      let salt2 = randomSalt();
      await gameEngine.connect(player1).commitMove(1, commitHash(RPS.Rock, salt1));
      await gameEngine.connect(player2).commitMove(1, commitHash(RPS.Scissors, salt2));
      await gameEngine.connect(player1).revealMove(1, RPS.Rock, salt1);
      await gameEngine.connect(player2).revealMove(1, RPS.Scissors, salt2);

      // Game 2: Player2 wins (Rock vs Paper)
      await gameEngine.connect(player1).createGame(GameType.RPS, { value: stake });
      await gameEngine.connect(player2).joinGame(2, { value: stake });
      salt1 = randomSalt();
      salt2 = randomSalt();
      await gameEngine.connect(player1).commitMove(2, commitHash(RPS.Rock, salt1));
      await gameEngine.connect(player2).commitMove(2, commitHash(RPS.Paper, salt2));
      await gameEngine.connect(player1).revealMove(2, RPS.Rock, salt1);
      await gameEngine.connect(player2).revealMove(2, RPS.Paper, salt2);

      expect(await gameEngine.playerWins(player1.address)).to.equal(1n);
      expect(await gameEngine.playerWins(player2.address)).to.equal(1n);
      expect(await gameEngine.playerTotalGames(player1.address)).to.equal(2n);
      expect(await gameEngine.playerTotalGames(player2.address)).to.equal(2n);
    });
  });
});
