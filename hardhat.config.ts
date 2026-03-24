import "dotenv/config";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.24",
        settings: {
          evmVersion: "cancun",
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
        },
      },
    },
  },
  networks: {
    fuji: {
      type: "http",
      chainType: "l1",
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      accounts: [configVariable("PRIVATE_KEY")],
    },
    avalanche: {
      type: "http",
      chainType: "l1",
      url: "https://api.avax.network/ext/bc/C/rpc",
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },
  chainDescriptors: {
    43114: {
      name: "Avalanche",
      chainType: "generic",
      blockExplorers: {
        etherscan: {
          name: "SnowTrace",
          url: "https://snowtrace.io",
          apiUrl:
            "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan",
        },
      },
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("SNOWTRACE_API_KEY"),
    },
  },
});
