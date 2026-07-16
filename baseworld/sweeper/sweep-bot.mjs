#!/usr/bin/env node
/**
 * Sweep bot — AtlasTreasury.sweep() otomatik tetikleyici.
 *
 * - Her N saniyede bir vault.canSweep() okur
 * - true ise sweep() çağırır (tx atar)
 * - Hata olursa log ve devam
 *
 * Çalışma modları:
 *   - One-shot:    node sweep-bot.mjs                 (bir kez kontrol et + çık)
 *   - Watch:       LOOP=1 node sweep-bot.mjs          (sonsuz döngü)
 *   - PM2 cron:    ecosystem.config.js → cron pattern
 *
 * Env (zorunlu):
 *   SWEEPER_PK         — sweep çağrısı atacak cüzdanın PK'sı (ETH'i olmalı)
 *   RPC_URL            — Base RPC (Alchemy önerilir, public OK)
 *   VAULT_ADDRESS      — AtlasTreasury kontrat adresi
 *
 * Env (opsiyonel):
 *   LOOP=1             — sonsuz döngü modu
 *   POLL_SECONDS=60    — döngüde kaç saniyede bir kontrol
 *   DRY_RUN=1          — tx atmaz, sadece kontrol eder
 */
import {Contract, formatUnits, JsonRpcProvider, Wallet} from "ethers";

const VAULT_ABI = [
  "function canSweep() view returns (bool)",
  "function balance() view returns (uint256)",
  "function threshold() view returns (uint256)",
  "function destination() view returns (address)",
  "function sweep()",
  "event Swept(address indexed by, uint256 amount)",
];

const required = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`[sweep-bot] missing env: ${k}`);
    process.exit(1);
  }
  return v;
};

const PK = required("SWEEPER_PK");
const RPC = required("RPC_URL");
const VAULT = required("VAULT_ADDRESS");
const POLL_SECONDS = Number(process.env.POLL_SECONDS ?? 60);
const LOOP = process.env.LOOP === "1";
const DRY_RUN = process.env.DRY_RUN === "1";

const ts = () => new Date().toISOString();
const log = (...a) => console.log(`[${ts()}]`, ...a);

const provider = new JsonRpcProvider(RPC);
const wallet = new Wallet(PK, provider);
const vault = new Contract(VAULT, VAULT_ABI, wallet);

async function tick() {
  try {
    const [bal, threshold, can, dest, gasPrice, ethBal] = await Promise.all([
      vault.balance(),
      vault.threshold(),
      vault.canSweep(),
      vault.destination(),
      provider.getFeeData().then((d) => d.gasPrice ?? 0n),
      provider.getBalance(wallet.address),
    ]);
    log(
      `bal=${formatUnits(bal, 6)} USDC` +
        ` / threshold=${formatUnits(threshold, 6)}` +
        ` / canSweep=${can}` +
        ` / sweeper ETH=${formatUnits(ethBal, 18)}`
    );

    if (!can) return;

    // Sanity: do we have enough ETH for gas? (~50K gas typical)
    const estGas = 70_000n;
    const cost = estGas * gasPrice;
    if (ethBal < cost * 2n) {
      log(`⚠️  Sweeper ETH low (${formatUnits(ethBal, 18)} ETH), need ~${formatUnits(cost * 2n, 18)} ETH`);
    }

    if (DRY_RUN) {
      log(`DRY_RUN: would sweep ${formatUnits(bal, 6)} USDC → ${dest}`);
      return;
    }

    log(`→ Sweeping ${formatUnits(bal, 6)} USDC to ${dest}…`);
    const tx = await vault.sweep();
    log(`  tx: ${tx.hash}`);
    const rcpt = await tx.wait();
    log(`  ✓ confirmed block ${rcpt.blockNumber}, gas ${rcpt.gasUsed}`);
  } catch (e) {
    const msg = e?.shortMessage ?? e?.message ?? String(e);
    log(`✗ tick error: ${msg.slice(0, 120)}`);
  }
}

async function main() {
  log(`Sweep bot starting — vault=${VAULT}, sweeper=${wallet.address}`);
  log(`RPC=${RPC}, LOOP=${LOOP}, POLL=${POLL_SECONDS}s, DRY_RUN=${DRY_RUN}`);
  if (LOOP) {
    while (true) {
      await tick();
      await new Promise((r) => setTimeout(r, POLL_SECONDS * 1000));
    }
  } else {
    await tick();
  }
}

main().catch((e) => {
  console.error("[sweep-bot] fatal:", e);
  process.exit(1);
});
