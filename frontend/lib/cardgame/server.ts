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
  createPublicClient, createWalletClient, http, fallback, parseAbi, parseAbiItem, keccak256,
  encodeAbiParameters, type Hex, type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';
import { CARDGAME_ESCROW } from './escrow';
import { simulateMatch, simulateMatchMP, type MatchInput, type MPInput, type Pid } from './engine';

// Server secret binds the match seed. The client needs the seed to play (returned
// at seat time) but CANNOT predict it before committing its nonce, so it can't
// grind for a favorable deck. Recomputed at settle — no per-match storage needed.
const SEED_SECRET = process.env.CARDGAME_SEED_SECRET || (process.env.CARDGAME_OPERATOR_PK || 'dev-seed-secret');

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

/** Open a match [player, bot1, bot2, bot3] — createMatch ONLY (operator gas).
 *  Bots are seated later, after the player has actually paid, so an
 *  unauthenticated caller cannot lock up bot funds. */
export async function openMatch(player: Address, nonce: number): Promise<{ matchId: Hex; bots: Address[]; entryFee: string }> {
  const bots = botAddresses();
  const players: [Address, Address, Address, Address] = [player, bots[0], bots[1], bots[2]];
  const matchId = matchIdFor(player, nonce);
  const fee = await entryFee();

  const status = await pub.readContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'getStatus', args: [matchId] });
  if (status === 0) {
    await waitOk(await opWallet().writeContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'createMatch', args: [matchId, players] }));
  }
  return { matchId, bots, entryFee: fee.toString() };
}

/** Seat the 3 bots — ONLY if the player has already paid their entry. This is
 *  the gate that prevents draining bot funds without a real stake. */
export async function seatBots(matchId: Hex, player: Address): Promise<{ seated: boolean; seed: string }> {
  // the player MUST be a listed player AND have paid before we spend bot AVAX
  const [isP, paid] = await Promise.all([
    pub.readContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'isPlayer', args: [matchId, player] }),
    pub.readContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'hasPaid', args: [matchId, player] }),
  ]);
  if (!isP) throw new Error('player is not in this match');
  if (!paid) throw new Error('player has not paid entry yet');

  const fee = await entryFee();
  for (const pk of BOT_PKS) {
    const botAcct = privateKeyToAccount(pk);
    const already = await pub.readContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'hasPaid', args: [matchId, botAcct.address] });
    if (already) continue;
    const botWallet = createWalletClient({ chain: avalancheFuji, transport: transport(), account: botAcct });
    await waitOk(await botWallet.writeContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'joinMatch', args: [matchId], value: fee }));
  }
  // reveal the authoritative seed so the client can play the deterministic match
  return { seated: true, seed: matchSeed(matchId) };
}

// ── Live spectator feed: aggregate escrow events into match objects ──────────

const DEPLOY_BLOCK = 56878556n;
const EV = {
  created: parseAbiItem('event MatchCreated(bytes32 indexed matchId, address[4] players)'),
  joined: parseAbiItem('event PlayerJoined(bytes32 indexed matchId, address indexed player, uint8 paidCount)'),
  locked: parseAbiItem('event MatchLocked(bytes32 indexed matchId)'),
  settled: parseAbiItem('event MatchSettled(bytes32 indexed matchId, address[4] ranking)'),
};

export interface LiveMatch {
  matchId: Hex;
  status: 'Open' | 'Locked' | 'Settled';
  players: Address[];
  paidCount: number;
  createdBlock: number;
  ranking?: Address[];
  block: number; // latest activity block (for ordering)
}

/** Read recent escrow events and fold them into a list of matches (newest first). */
export async function getRecentMatches(lookback = 2000n, limit = 24): Promise<{ matches: LiveMatch[]; entryFee: string; rewards: string[]; head: number }> {
  // Public Fuji RPCs cap eth_getLogs at ~2048 blocks; keep the window small so a
  // single request succeeds (a "live" feed only needs recent activity anyway).
  const head = await pub.getBlockNumber();
  const from = head - lookback > DEPLOY_BLOCK ? head - lookback : DEPLOY_BLOCK;

  const [fee, rewards, created, joined, locked, settled] = await Promise.all([
    entryFee(),
    pub.readContract({ address: CARDGAME_ESCROW, abi: parseAbi(['function getRewards() view returns (uint256[4])']), functionName: 'getRewards' }),
    pub.getLogs({ address: CARDGAME_ESCROW, event: EV.created, fromBlock: from, toBlock: head }),
    pub.getLogs({ address: CARDGAME_ESCROW, event: EV.joined, fromBlock: from, toBlock: head }),
    pub.getLogs({ address: CARDGAME_ESCROW, event: EV.locked, fromBlock: from, toBlock: head }),
    pub.getLogs({ address: CARDGAME_ESCROW, event: EV.settled, fromBlock: from, toBlock: head }),
  ]);

  const byId = new Map<Hex, LiveMatch>();
  for (const l of created) {
    const id = l.args.matchId as Hex;
    byId.set(id, {
      matchId: id, status: 'Open', players: [...(l.args.players ?? [])],
      paidCount: 0, createdBlock: Number(l.blockNumber), block: Number(l.blockNumber),
    });
  }
  for (const l of joined) {
    const m = byId.get(l.args.matchId as Hex);
    if (m) { m.paidCount = Number(l.args.paidCount); m.block = Math.max(m.block, Number(l.blockNumber)); }
  }
  for (const l of locked) {
    const m = byId.get(l.args.matchId as Hex);
    if (m && m.status === 'Open') { m.status = 'Locked'; m.paidCount = 4; m.block = Math.max(m.block, Number(l.blockNumber)); }
  }
  for (const l of settled) {
    const m = byId.get(l.args.matchId as Hex);
    if (m) { m.status = 'Settled'; m.ranking = [...(l.args.ranking ?? [])]; m.block = Math.max(m.block, Number(l.blockNumber)); }
  }

  const matches = [...byId.values()].sort((a, b) => b.block - a.block).slice(0, limit);
  return { matches, entryFee: fee.toString(), rewards: rewards.map((r) => r.toString()), head: Number(head) };
}

/** Server-authoritative match seed (client can't predict pre-commit, can't grind). */
export function matchSeed(matchId: Hex): string {
  return keccak256(encodeAbiParameters([{ type: 'string' }, { type: 'bytes32' }], [SEED_SECRET, matchId]));
}

/**
 * Authoritative settle: re-derive the ranking from (seed, client input) with the
 * shared deterministic engine and settle with THAT — the client-reported result
 * is never trusted. Returns the derived ranking + validity. Rejects tampered input.
 */
export async function settleFromInput(matchId: Hex, input: MatchInput): Promise<{ txHash: Hex; ranking: Address[]; valid: boolean }> {
  const seed = matchSeed(matchId);
  const sim = simulateMatch(seed, input);
  if (!sim.valid) throw new Error('invalid play log: ' + (sim.reason || 'rejected'));

  // map engine Pids (P1..P4) → the escrow's player order [player, bot1, bot2, bot3]
  const players = await pub.readContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'getPlayers', args: [matchId] });
  const pidToAddr: Record<Pid, Address> = { P1: players[0], P2: players[1], P3: players[2], P4: players[3] };
  const ranking = sim.ranking.map((pid) => pidToAddr[pid]);

  const { txHash } = await settleMatch(matchId, ranking);
  return { txHash, ranking, valid: true };
}

// ── Real 4-player multiplayer (all seats are humans; no bots) ────────────────
// The multiplayer server (frostbite-mp) runs the authoritative live loop and
// calls these server-to-server. createMatch takes the four real addresses in
// seat order [P1,P2,P3,P4]; each player pays their own entry; settle re-derives
// the ranking from the recorded action log with the SAME engine the loop ran.

/** Deterministic matchId for a multiplayer room (four players + a room salt). */
export function matchIdForMP(players: Address[], salt: number | string): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: 'string' }, { type: 'address[4]' }, { type: 'string' }],
    ['cardgame-mp', players.slice(0, 4) as unknown as readonly [Address, Address, Address, Address], String(salt)],
  ));
}

/** Open a 4-real-player match (createMatch only; each player joins/pays on their
 *  own). Returns the matchId, the authoritative seed, and the entry fee. */
export async function openMatchMP(players: Address[], salt: number | string): Promise<{ matchId: Hex; seed: string; entryFee: string }> {
  if (players.length !== 4) throw new Error('need exactly 4 players');
  const four = players as [Address, Address, Address, Address];
  const matchId = matchIdForMP(players, salt);
  const fee = await entryFee();
  const status = await pub.readContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'getStatus', args: [matchId] });
  if (status === 0) {
    await waitOk(await opWallet().writeContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'createMatch', args: [matchId, four] }));
  }
  return { matchId, seed: matchSeed(matchId), entryFee: fee.toString() };
}

/** Authoritative multiplayer settle: re-derive the ranking from the recorded MP
 *  action log (server owns the loop, so this just confirms + signs the result). */
export async function settleMPFromInput(matchId: Hex, input: MPInput): Promise<{ txHash: Hex; ranking: Address[]; valid: boolean }> {
  const seed = matchSeed(matchId);
  const sim = simulateMatchMP(seed, input);
  if (!sim.valid) throw new Error('invalid MP action log: ' + (sim.reason || 'rejected'));
  const players = await pub.readContract({ address: CARDGAME_ESCROW, abi: ABI, functionName: 'getPlayers', args: [matchId] });
  const pidToAddr: Record<Pid, Address> = { P1: players[0], P2: players[1], P3: players[2], P4: players[3] };
  const ranking = sim.ranking.map((pid) => pidToAddr[pid]);
  const { txHash } = await settleMatch(matchId, ranking);
  return { txHash, ranking, valid: true };
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
