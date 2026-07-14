/**
 * CAR(D) GAME — post a settled race result to the Echo gate over ICM.
 * Manual PoC step (automation into the settle flow is future work).
 *
 *   ICM_HUB=0x… PRIVATE_KEY=0x… npx tsx scripts/icm-post-result.ts <matchId> <addr1> <addr2> <addr3> <addr4>
 */
import { createWalletClient, createPublicClient, http, parseAbi, isAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';

const HUB = process.env.ICM_HUB as Hex;
const PK = process.env.PRIVATE_KEY as Hex;
const [matchId, ...ranking] = process.argv.slice(2);
if (!HUB || !PK) { console.error('ICM_HUB and PRIVATE_KEY env required'); process.exit(1); }
if (!/^0x[0-9a-fA-F]{64}$/.test(matchId ?? '') || ranking.length !== 4 || !ranking.every((a) => isAddress(a))) {
  console.error('usage: icm-post-result.ts <bytes32 matchId> <addr1..addr4>'); process.exit(1);
}

const ABI = parseAbi(['function postResult(bytes32 matchId, address[4] ranking)']);
const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, chain: avalancheFuji, transport: http() });
const pub = createPublicClient({ chain: avalancheFuji, transport: http() });

const hash = await wallet.writeContract({
  address: HUB, abi: ABI, functionName: 'postResult',
  args: [matchId as Hex, ranking as [Hex, Hex, Hex, Hex]],
});
const rcpt = await pub.waitForTransactionReceipt({ hash });
console.log(`postResult ${rcpt.status} — tx ${hash}`);
