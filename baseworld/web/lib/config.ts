// Frontend + serverless paylaşımlı config. Asla server-only secret eklenmemeli.

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.base.org";
export const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER ?? "https://sepolia.basescan.org";
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC ??
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e") as `0x${string}`;
export const DEPLOY_BLOCK = Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? 0);
export const IS_DEMO = (process.env.NEXT_PUBLIC_DEMO ?? "true") === "true";

// Canonical grid — KONTRATLAR İLE BİREBİR AYNI OLMALI
export const GRID_W = 640;
export const GRID_H = 320;

// Land coverage threshold — yayında dondurulmuş
export const EDGE_THRESHOLD = 0.55;

// USDC base unit (6 decimals) — 1 USDC
export const MINT_PRICE_BASE = 1_000_000n;

export const CHAIN_NAME = CHAIN_ID === 8453 ? "Base" : "Base Sepolia";
