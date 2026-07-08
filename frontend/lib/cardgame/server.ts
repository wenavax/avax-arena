/**
 * CAR(D) GAME — server-side escrow operator (Fuji). SERVER ONLY — never import
 * from a client component. Holds the operator/trustedSigner key + 3 bot wallets.
 *
 * The operator (0x3C05…b9E5) is authorized to createMatch and is the escrow's
 * trustedSigner. It bankrolls 3 bot seats so a single human can play a real
 * staked testnet match against them.
 */
import 'server-only';
import {
  createPublicClient, createWalletClient, http, fallback, parseAbi, keccak256,
  encodeAbiParameters, type Hex, type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';
import { CARDGAME_ESCROW } from './escrow';

// The default public RPC (api.avax-test.network) Cloudflare-blocks some server
// IPs (the VPS), so use a rotating fallback of Fuji endpoints for reliability.
const FUJI_RPCS = [
  'https://avalanche-fuji-c-chain-rpc.publicnode.com',
  'https://api.avax-test.network/ext/bc/C/rpc',
  'https://avalanche-fuji.drpc.org',
  'https://rpc.ankr.com/avalanche_fuji',
];
const transport = () => fallback(FUJI_RPCS.map((u) => http(u, { timeout: 15_000 })));

const OPERATOR_PK = process.env.CARDGAME_OPERATOR_PK as Hex | undefined;
const BOT_PKS = (process.env.CARDGAME_BOT_PKS || '').split(',').filter(Boolean) as Hex[];

export function operatorConfigured(): boolean {
  return !!OPERATOR_PK && BOT_PKS.length === 3;
}

const ABI = parseAbi([
  'function entryFee() view returns (uint256)',
  'function createMatch(bytes32 matchId, address[4] players)',
  'function joinMatch(bytes32 matchId) payable',
  'function settle(bytes32 matchId, address[4] ranking, bytes signature)',
  'function settleDigest(bytes32 matchId, address[4] ranking) view returns (bytes32)',
  'function getStatus(bytes32 matchId) view returns (uint8)',
  'function getPlayers(bytes32 matchId) view returns (address[4])',
  'function hasPaid(bytes32 matchId, address p) view returns (bool)',
  'function isPlayer(bytes32 matchId, address p) view returns (bool)',
]);

export const pub = createPublicClient({ chain: avalancheFuji, transport: transport() });

function op() {
  if (!OPERATOR_PK) throw new Error('CARDGAME_OPERATOR_PK not set');
  return privateKeyToAccount(OPERATOR_PK);
}
function opWallet() {
  return createWalletClient({ chain: avalancheFuji, transport: transport(), account: op() });
}
export function botAddresses(): Address[] {
  return BOT_PKS.map((pk) => privateKeyToAccount(pk).address);
}

async function waitOk(hash: Hex) {
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`tx reverted: ${hash}`);
  return r;
}

/** Deterministic per-player match id (one live staked match per player at a time). */
export function matchIdFor(player: Address, nonce: number): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: 'string' }, { type: 'address' }, { type: 'uint256' }],
    ['cardgame-staked', player, BigInt(nonce)],
  ));
}

export async function entryFee(): Promise<bigint> {
  return pub.readContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'entryFee' });
}

/** Create a match [player, bot1, bot2, bot3] and join the 3 bots. Player joins client-side. */
export async function createStakedMatch(player: Address, nonce: number): Promise<{ matchId: Hex; bots: Address[]; entryFee: string }> {
  const bots = botAddresses();
  const players: [Address, Address, Address, Address] = [player, bots[0], bots[1], bots[2]];
  const matchId = matchIdFor(player, nonce);

  const fee = await entryFee();
  const wallet = opWallet();

  // createMatch (operator)
  const status = await pub.readContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'getStatus', args: [matchId] });
  if (status === 0) {
    await waitOk(await wallet.writeContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'createMatch', args: [matchId, players] }));
  }

  // join the 3 bots (each from its own wallet)
  for (const pk of BOT_PKS) {
    const botAcct = privateKeyToAccount(pk);
    const paid = await pub.readContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'hasPaid', args: [matchId, botAcct.address] });
    if (paid) continue;
    const botWallet = createWalletClient({ chain: avalancheFuji, transport: transport(), account: botAcct });
    await waitOk(await botWallet.writeContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'joinMatch', args: [matchId], value: fee }));
  }

  return { matchId, bots, entryFee: fee.toString() };
}

/** Sign the final ranking and submit settle (operator = trustedSigner). */
export async function settleMatch(matchId: Hex, ranking: Address[]): Promise<{ txHash: Hex }> {
  if (ranking.length !== 4) throw new Error('ranking must have 4 entries');
  const rk = ranking as [Address, Address, Address, Address];

  // validate it's a permutation of the escrowed players (the contract re-checks too)
  const players = await pub.readContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'getPlayers', args: [matchId] });
  const set = new Set(players.map((a) => a.toLowerCase()));
  const rset = new Set(rk.map((a) => a.toLowerCase()));
  if (rset.size !== 4 || [...rset].some((a) => !set.has(a))) throw new Error('ranking is not a permutation of the match players');

  const account = op();
  const digest = keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'address[4]' }, { type: 'address' }, { type: 'uint256' }],
    [matchId, rk, CARDGAME_ESCROW, BigInt(avalancheFuji.id)],
  ));
  const signature = await account.signMessage({ message: { raw: digest } });

  const wallet = opWallet();
  const hash = await wallet.writeContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'settle', args: [matchId, rk, signature] });
  await waitOk(hash);
  return { txHash: hash };
}
