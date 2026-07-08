/**
 * CAR(D) GAME — bot bankroll recycler (Fuji). Bots stake entry fees each match;
 * when they finish in a paying position their winnings sit in the escrow's
 * pendingPayouts. This drains those winnings back to each bot's spendable
 * balance so the house bankroll recycles instead of monotonically depleting.
 *
 * Also refunds the operator's exposure by reporting balances so top-ups are
 * visible. Does NOT touch player funds (withdrawPayout is per-caller).
 *
 * Env: CARDGAME_BOT_PKS (comma-separated), CARDGAME_OPERATOR_PK (optional, for
 * a balance report), NEXT_PUBLIC_CARDGAME_ESCROW.
 * Run: node server/cardgame-bot-recycle.mjs   (cron-friendly, --quiet to suppress ok logs)
 */
import { ethers } from 'ethers';

const RPCS = [
  'https://avalanche-fuji-c-chain-rpc.publicnode.com',
  'https://api.avax-test.network/ext/bc/C/rpc',
  'https://avalanche-fuji.drpc.org',
];
const ESCROW = process.env.NEXT_PUBLIC_CARDGAME_ESCROW || '0xb25Eec9D2C2b4FA5AB099677233A86BD9Aa6EE50';
const BOT_PKS = (process.env.CARDGAME_BOT_PKS || '').split(',').filter(Boolean);
const OP_PK = process.env.CARDGAME_OPERATOR_PK;
if (!BOT_PKS.length) { console.error('CARDGAME_BOT_PKS gerekli'); process.exit(1); }

const ABI = [
  'function pendingPayouts(address) view returns (uint256)',
  'function withdrawPayout()',
];

async function provider() {
  for (const url of RPCS) {
    try { const p = new ethers.JsonRpcProvider(url); await p.getBlockNumber(); return p; } catch {}
  }
  throw new Error('no Fuji RPC reachable');
}

async function main() {
  const p = await provider();
  const escrow = new ethers.Contract(ESCROW, ABI, p);
  let recycled = 0n;

  for (const pk of BOT_PKS) {
    const w = new ethers.Wallet(pk, p);
    const pending = await escrow.pendingPayouts(w.address);
    const bal = await p.getBalance(w.address);
    if (pending > 0n) {
      try {
        const tx = await new ethers.Contract(ESCROW, ABI, w).withdrawPayout();
        await tx.wait();
        recycled += pending;
        console.log(`  ${w.address}: withdrew ${ethers.formatEther(pending)} (bal ${ethers.formatEther(bal)} → +)`);
      } catch (e) {
        console.error(`  ${w.address}: withdraw failed — ${e.message.slice(0, 80)}`);
      }
    } else if (!process.argv.includes('--quiet')) {
      console.log(`  ${w.address}: no pending, bal ${ethers.formatEther(bal)}`);
    }
    // low-balance warning
    if (bal < ethers.parseEther('0.03')) console.warn(`  ⚠ ${w.address} LOW (${ethers.formatEther(bal)} AVAX) — top up`);
  }

  if (OP_PK) {
    const op = new ethers.Wallet(OP_PK, p);
    const b = await p.getBalance(op.address);
    console.log(`operator ${op.address}: ${ethers.formatEther(b)} AVAX${b < ethers.parseEther('0.05') ? ' ⚠ LOW' : ''}`);
  }
  console.log(`recycled ${ethers.formatEther(recycled)} AVAX back to bots`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
