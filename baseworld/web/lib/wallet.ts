"use client";

import {BrowserProvider, Contract, type JsonRpcSigner} from "ethers";
import {CHAIN_ID, CHAIN_NAME, CONTRACT_ADDRESS, EXPLORER, RPC_URL, USDC_ADDRESS} from "./config";
import {PIXEL_ATLAS_ABI, USDC_ABI} from "./abi";

export type WalletConn = {
  account: string;
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  atlas: Contract;
  usdc: Contract;
};

type Eip1193 = {
  request: (args: {method: string; params?: unknown[]}) => Promise<unknown>;
  on?: (event: string, handler: (...a: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...a: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

export const hasInjectedWallet = () => typeof window !== "undefined" && !!window.ethereum;

export async function ensureChain(): Promise<void> {
  const eth = window.ethereum;
  if (!eth) throw new Error("No injected wallet");
  const hex = "0x" + CHAIN_ID.toString(16);
  try {
    await eth.request({method: "wallet_switchEthereumChain", params: [{chainId: hex}]});
  } catch (err) {
    const code = (err as {code?: number}).code;
    if (code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName: CHAIN_NAME,
            nativeCurrency: {name: "ETH", symbol: "ETH", decimals: 18},
            rpcUrls: [RPC_URL],
            blockExplorerUrls: [EXPLORER],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export async function connectWallet(): Promise<WalletConn> {
  const eth = window.ethereum;
  if (!eth) throw new Error("No injected wallet");
  const provider = new BrowserProvider(eth);
  await ensureChain();
  const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
  const account = accounts[0];
  const signer = await provider.getSigner();
  const atlas = new Contract(CONTRACT_ADDRESS, PIXEL_ATLAS_ABI, signer);
  const usdc = new Contract(USDC_ADDRESS, USDC_ABI, signer);
  return {account, provider, signer, atlas, usdc};
}

export function watchAccount(handler: (accounts: string[]) => void): () => void {
  const eth = window.ethereum;
  if (!eth?.on) return () => {};
  const h = (...a: unknown[]) => handler(a[0] as string[]);
  eth.on("accountsChanged", h);
  return () => eth.removeListener?.("accountsChanged", h);
}

export function watchChain(handler: (chainHex: string) => void): () => void {
  const eth = window.ethereum;
  if (!eth?.on) return () => {};
  const h = (...a: unknown[]) => handler(a[0] as string);
  eth.on("chainChanged", h);
  return () => eth.removeListener?.("chainChanged", h);
}
