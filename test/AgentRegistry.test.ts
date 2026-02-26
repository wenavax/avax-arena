import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

// ---------------------------------------------------------------------------
// StrategyType enum (mirrors the contract)
// ---------------------------------------------------------------------------
const StrategyType = {
  Aggressive: 0,
  Defensive: 1,
  Analytical: 2,
  Random: 3,
} as const;

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------
async function deployAgentRegistryFixture() {
  const [owner, agentOwner1, agentOwner2, wallet1, wallet2, gameEngine, other] =
    await ethers.getSigners();

  const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
  const agentRegistry = await AgentRegistry.deploy();
  await agentRegistry.waitForDeployment();

  // Authorise gameEngine as a caller for recordGameResult
  await agentRegistry.setAuthorizedCaller(gameEngine.address, true);

  return {
    agentRegistry,
    owner,
    agentOwner1,
    agentOwner2,
    wallet1,
    wallet2,
    gameEngine,
    other,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("AgentRegistry", function () {
  // -----------------------------------------------------------------------
  // registerAgent
  // -----------------------------------------------------------------------
  describe("registerAgent", function () {
    it("should register an agent and emit AgentRegistered", async function () {
      const { agentRegistry, agentOwner1, wallet1 } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      const tx = await agentRegistry
        .connect(agentOwner1)
        .registerAgent(wallet1.address, "AlphaBot", StrategyType.Aggressive);

      await expect(tx)
        .to.emit(agentRegistry, "AgentRegistered")
        .withArgs(1n, agentOwner1.address, wallet1.address, "AlphaBot", StrategyType.Aggressive);

      const agent = await agentRegistry.getAgent(1);
      expect(agent.owner).to.equal(agentOwner1.address);
      expect(agent.agentWallet).to.equal(wallet1.address);
      expect(agent.name).to.equal("AlphaBot");
      expect(agent.strategy).to.equal(StrategyType.Aggressive);
      expect(agent.active).to.be.true;
      expect(agent.wins).to.equal(0n);
      expect(agent.losses).to.equal(0n);
      expect(agent.totalGames).to.equal(0n);
    });

    it("should revert with OwnerAlreadyRegistered when an owner registers twice", async function () {
      const { agentRegistry, agentOwner1, wallet1, wallet2 } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await agentRegistry
        .connect(agentOwner1)
        .registerAgent(wallet1.address, "AlphaBot", StrategyType.Aggressive);

      await expect(
        agentRegistry
          .connect(agentOwner1)
          .registerAgent(wallet2.address, "BetaBot", StrategyType.Defensive),
      ).to.be.revertedWithCustomError(agentRegistry, "OwnerAlreadyRegistered");
    });

    it("should revert with WalletAlreadyRegistered when a wallet address is reused", async function () {
      const { agentRegistry, agentOwner1, agentOwner2, wallet1 } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await agentRegistry
        .connect(agentOwner1)
        .registerAgent(wallet1.address, "AlphaBot", StrategyType.Aggressive);

      await expect(
        agentRegistry
          .connect(agentOwner2)
          .registerAgent(wallet1.address, "GammaBot", StrategyType.Random),
      ).to.be.revertedWithCustomError(agentRegistry, "WalletAlreadyRegistered");
    });

    it("should revert with EmptyName when an empty name is provided", async function () {
      const { agentRegistry, agentOwner1, wallet1 } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await expect(
        agentRegistry
          .connect(agentOwner1)
          .registerAgent(wallet1.address, "", StrategyType.Aggressive),
      ).to.be.revertedWithCustomError(agentRegistry, "EmptyName");
    });

    it("should revert with ZeroAddress when wallet is the zero address", async function () {
      const { agentRegistry, agentOwner1 } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await expect(
        agentRegistry
          .connect(agentOwner1)
          .registerAgent(ethers.ZeroAddress, "BotZero", StrategyType.Aggressive),
      ).to.be.revertedWithCustomError(agentRegistry, "ZeroAddress");
    });
  });

  // -----------------------------------------------------------------------
  // grantSessionKey
  // -----------------------------------------------------------------------
  describe("grantSessionKey", function () {
    it("should set the session key expiry", async function () {
      const { agentRegistry, agentOwner1, wallet1 } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await agentRegistry
        .connect(agentOwner1)
        .registerAgent(wallet1.address, "AlphaBot", StrategyType.Aggressive);

      const duration = 3600; // 1 hour
      const tx = await agentRegistry.connect(agentOwner1).grantSessionKey(duration);

      await expect(tx).to.emit(agentRegistry, "SessionKeyGranted");

      const agent = await agentRegistry.getAgent(1);
      expect(agent.sessionKeyExpiry).to.be.gt(0n);
    });

    it("should revert with InvalidDuration when duration is zero", async function () {
      const { agentRegistry, agentOwner1, wallet1 } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await agentRegistry
        .connect(agentOwner1)
        .registerAgent(wallet1.address, "AlphaBot", StrategyType.Aggressive);

      await expect(
        agentRegistry.connect(agentOwner1).grantSessionKey(0),
      ).to.be.revertedWithCustomError(agentRegistry, "InvalidDuration");
    });

    it("should revert with AgentNotFound when caller has no agent", async function () {
      const { agentRegistry, other } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await expect(
        agentRegistry.connect(other).grantSessionKey(3600),
      ).to.be.revertedWithCustomError(agentRegistry, "AgentNotFound");
    });
  });

  // -----------------------------------------------------------------------
  // isAgentAuthorized
  // -----------------------------------------------------------------------
  describe("isAgentAuthorized", function () {
    it("should return true when agent is active and session key is valid", async function () {
      const { agentRegistry, agentOwner1, wallet1 } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await agentRegistry
        .connect(agentOwner1)
        .registerAgent(wallet1.address, "AlphaBot", StrategyType.Aggressive);

      // Grant a session key for 1 hour
      await agentRegistry.connect(agentOwner1).grantSessionKey(3600);

      expect(await agentRegistry.isAgentAuthorized(wallet1.address)).to.be.true;
    });

    it("should return false when the session key has expired", async function () {
      const { agentRegistry, agentOwner1, wallet1 } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await agentRegistry
        .connect(agentOwner1)
        .registerAgent(wallet1.address, "AlphaBot", StrategyType.Aggressive);

      // Grant a session key for 1 hour
      await agentRegistry.connect(agentOwner1).grantSessionKey(3600);

      // Advance time by 2 hours
      await networkHelpers.time.increase(7200);

      expect(await agentRegistry.isAgentAuthorized(wallet1.address)).to.be.false;
    });

    it("should return false when no session key has been granted", async function () {
      const { agentRegistry, agentOwner1, wallet1 } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await agentRegistry
        .connect(agentOwner1)
        .registerAgent(wallet1.address, "AlphaBot", StrategyType.Aggressive);

      // No session key granted -> sessionKeyExpiry is 0 -> expired
      expect(await agentRegistry.isAgentAuthorized(wallet1.address)).to.be.false;
    });

    it("should return false for an unregistered wallet", async function () {
      const { agentRegistry, other } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      expect(await agentRegistry.isAgentAuthorized(other.address)).to.be.false;
    });
  });

  // -----------------------------------------------------------------------
  // updateStrategy
  // -----------------------------------------------------------------------
  describe("updateStrategy", function () {
    it("should update the strategy for the owner's agent", async function () {
      const { agentRegistry, agentOwner1, wallet1 } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await agentRegistry
        .connect(agentOwner1)
        .registerAgent(wallet1.address, "AlphaBot", StrategyType.Aggressive);

      const tx = await agentRegistry
        .connect(agentOwner1)
        .updateStrategy(StrategyType.Defensive);

      await expect(tx)
        .to.emit(agentRegistry, "StrategyUpdated")
        .withArgs(1n, StrategyType.Aggressive, StrategyType.Defensive);

      const agent = await agentRegistry.getAgent(1);
      expect(agent.strategy).to.equal(StrategyType.Defensive);
    });

    it("should revert with AgentNotFound when called by a non-registered owner", async function () {
      const { agentRegistry, other } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await expect(
        agentRegistry.connect(other).updateStrategy(StrategyType.Random),
      ).to.be.revertedWithCustomError(agentRegistry, "AgentNotFound");
    });
  });

  // -----------------------------------------------------------------------
  // recordGameResult
  // -----------------------------------------------------------------------
  describe("recordGameResult", function () {
    it("should update stats when called by an authorized caller (win)", async function () {
      const { agentRegistry, agentOwner1, wallet1, gameEngine } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await agentRegistry
        .connect(agentOwner1)
        .registerAgent(wallet1.address, "AlphaBot", StrategyType.Aggressive);

      const tx = await agentRegistry
        .connect(gameEngine)
        .recordGameResult(wallet1.address, true);

      await expect(tx).to.emit(agentRegistry, "AgentStatsUpdated").withArgs(1n, 1n, 0n, 1n);

      const agent = await agentRegistry.getAgent(1);
      expect(agent.wins).to.equal(1n);
      expect(agent.losses).to.equal(0n);
      expect(agent.totalGames).to.equal(1n);
    });

    it("should update stats when called by an authorized caller (loss)", async function () {
      const { agentRegistry, agentOwner1, wallet1, gameEngine } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await agentRegistry
        .connect(agentOwner1)
        .registerAgent(wallet1.address, "AlphaBot", StrategyType.Aggressive);

      await agentRegistry.connect(gameEngine).recordGameResult(wallet1.address, false);

      const agent = await agentRegistry.getAgent(1);
      expect(agent.wins).to.equal(0n);
      expect(agent.losses).to.equal(1n);
      expect(agent.totalGames).to.equal(1n);
    });

    it("should accumulate results over multiple games", async function () {
      const { agentRegistry, agentOwner1, wallet1, gameEngine } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await agentRegistry
        .connect(agentOwner1)
        .registerAgent(wallet1.address, "AlphaBot", StrategyType.Aggressive);

      await agentRegistry.connect(gameEngine).recordGameResult(wallet1.address, true);
      await agentRegistry.connect(gameEngine).recordGameResult(wallet1.address, true);
      await agentRegistry.connect(gameEngine).recordGameResult(wallet1.address, false);

      const agent = await agentRegistry.getAgent(1);
      expect(agent.wins).to.equal(2n);
      expect(agent.losses).to.equal(1n);
      expect(agent.totalGames).to.equal(3n);
      expect(agent.totalTxGenerated).to.equal(3n);
    });

    it("should revert with UnauthorizedCaller when called by a non-authorized address", async function () {
      const { agentRegistry, agentOwner1, wallet1, other } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await agentRegistry
        .connect(agentOwner1)
        .registerAgent(wallet1.address, "AlphaBot", StrategyType.Aggressive);

      await expect(
        agentRegistry.connect(other).recordGameResult(wallet1.address, true),
      ).to.be.revertedWithCustomError(agentRegistry, "UnauthorizedCaller");
    });

    it("should revert with AgentNotFound for an unregistered wallet", async function () {
      const { agentRegistry, gameEngine, other } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await expect(
        agentRegistry.connect(gameEngine).recordGameResult(other.address, true),
      ).to.be.revertedWithCustomError(agentRegistry, "AgentNotFound");
    });
  });

  // -----------------------------------------------------------------------
  // setAuthorizedCaller (owner-only)
  // -----------------------------------------------------------------------
  describe("setAuthorizedCaller", function () {
    it("should allow the owner to authorise a new caller", async function () {
      const { agentRegistry, owner, other } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await agentRegistry.connect(owner).setAuthorizedCaller(other.address, true);
      expect(await agentRegistry.authorizedCallers(other.address)).to.be.true;
    });

    it("should allow the owner to revoke an authorized caller", async function () {
      const { agentRegistry, owner, gameEngine } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await agentRegistry.connect(owner).setAuthorizedCaller(gameEngine.address, false);
      expect(await agentRegistry.authorizedCallers(gameEngine.address)).to.be.false;
    });

    it("should revert when a non-owner tries to set an authorized caller", async function () {
      const { agentRegistry, other } =
        await networkHelpers.loadFixture(deployAgentRegistryFixture);

      await expect(
        agentRegistry.connect(other).setAuthorizedCaller(other.address, true),
      ).to.be.revertedWithCustomError(agentRegistry, "OwnableUnauthorizedAccount");
    });
  });
});
