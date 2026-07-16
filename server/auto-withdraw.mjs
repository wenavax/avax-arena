// ─── Auto Withdraw: Mint Revenue → Treasury ───
// Runs hourly via PM2 cron. Withdraws AVAX from Hero + Item contracts,
// then forwards all deployer balance (minus gas reserve) to treasury.

import { ethers } from 'ethers';
import 'dotenv/config';

const RPC = 'https://api.avax.network/ext/bc/C/rpc';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const TREASURY = '0x301b013280317a75f808a3c0d23e82e9027a6b77';
const GAS_RESERVE = ethers.parseEther('0.01'); // Keep 0.01 AVAX for gas

const HERO_CONTRACT = '0x8b43A80A8EeBC2bf27EAa934B870AF1742f1e523';
const ITEM_CONTRACT = '0xA121AD68f54347215C67AD9A254c8dbBD653d5e6';

const WITHDRAW_ABI = ['function withdraw() external'];

async function run() {
  if (!PRIVATE_KEY) {
    console.error('[Withdraw] PRIVATE_KEY not set');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const ts = new Date().toISOString();

  console.log(`\n[${ts}] Auto-withdraw started`);
  console.log(`  Deployer: ${wallet.address}`);

  // 1. Withdraw from Hero contract
  try {
    const heroBalance = await provider.getBalance(HERO_CONTRACT);
    if (heroBalance > 0n) {
      console.log(`  Hero contract balance: ${ethers.formatEther(heroBalance)} AVAX`);
      const hero = new ethers.Contract(HERO_CONTRACT, WITHDRAW_ABI, wallet);
      const tx = await hero.withdraw();
      await tx.wait();
      console.log(`  Hero withdraw TX: ${tx.hash}`);
    } else {
      console.log('  Hero contract: 0 AVAX (skip)');
    }
  } catch (e) {
    console.error('  Hero withdraw error:', e.message);
  }

  // 2. Withdraw from Item contract
  try {
    const itemBalance = await provider.getBalance(ITEM_CONTRACT);
    if (itemBalance > 0n) {
      console.log(`  Item contract balance: ${ethers.formatEther(itemBalance)} AVAX`);
      const item = new ethers.Contract(ITEM_CONTRACT, WITHDRAW_ABI, wallet);
      const tx = await item.withdraw();
      await tx.wait();
      console.log(`  Item withdraw TX: ${tx.hash}`);
    } else {
      console.log('  Item contract: 0 AVAX (skip)');
    }
  } catch (e) {
    console.error('  Item withdraw error:', e.message);
  }

  // 3. Forward deployer balance to treasury
  try {
    const balance = await provider.getBalance(wallet.address);
    console.log(`  Deployer balance: ${ethers.formatEther(balance)} AVAX`);

    if (balance > GAS_RESERVE) {
      const feeData = await provider.getFeeData();
      const gasLimit = 21000n;
      const gasCost = gasLimit * (feeData.gasPrice || ethers.parseUnits('25', 'gwei'));
      const sendAmount = balance - GAS_RESERVE - gasCost;

      if (sendAmount > 0n) {
        console.log(`  Sending ${ethers.formatEther(sendAmount)} AVAX → ${TREASURY}`);
        const tx = await wallet.sendTransaction({
          to: TREASURY,
          value: sendAmount,
          gasLimit,
        });
        await tx.wait();
        console.log(`  Transfer TX: ${tx.hash}`);
        console.log(`  Done! Sent ${ethers.formatEther(sendAmount)} AVAX to treasury`);
      } else {
        console.log('  Balance too low after gas costs (skip transfer)');
      }
    } else {
      console.log('  Balance below reserve threshold (skip transfer)');
    }
  } catch (e) {
    console.error('  Transfer error:', e.message);
  }

  console.log(`[${ts}] Auto-withdraw complete\n`);
}

run().catch(console.error);
