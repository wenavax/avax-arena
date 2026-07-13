# CAR(D) GAME — Scheduled Multiplayer Races Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace player-initiated MP matchmaking with server-opened races every 5 minutes (free reservations, first-4 pay at T-0), on a fresh Fuji MatchEscrow at 1 AVAX. Spec: `docs/superpowers/specs/2026-07-13-cardgame-scheduled-matches-design.md`.

**Architecture:** The hub (`server/cardgame-mp.mjs`) swaps its queue for an ordered reservation list + a slot scheduler driven by the already-injected `now()` clock inside `sweep()`. The existing `formMatch → paying → playing → settling` lifecycle is reused unchanged. A new `chain.cancelMatch` dep (wire → new Next `mp/cancel` route → owner-keyed `cancelMatch`) gives instant refunds on pay-window failure. UI turns "FIND MATCH" into a countdown lobby.

**Tech Stack:** Node ESM (hub + headless tests), socket.io wire, Next.js API routes + viem, Foundry (deploy only — zero Solidity changes).

**Files:**
- Modify: `server/cardgame-mp.mjs` (reserve list + slot scheduler + cancel-on-timeout)
- Modify: `server/cardgame-mp.test.mjs` (fake-clock scheduled suite)
- Modify: `server/cardgame-mp-wire.mjs` (reserve events, emitToAll, cancelMatch fetch, new sig text)
- Modify: `frontend/lib/cardgame/server.ts` (add `cancelMatchMP`)
- Create: `frontend/app/api/cardgame/mp/cancel/route.ts`
- Modify: `frontend/lib/cardgame/mpClient.ts` (reserve message)
- Modify: `frontend/app/cardgame/page.tsx` (scheduled lobby UI, dynamic fee)
- Modify: `frontend/lib/cardgame/mountMultiplayer.ts`, `frontend/lib/cardgame/mountStaked.ts` (fee via opts, drop ENTRY consts)
- Modify: `frontend/app/cardgame/cardgame.css` (lobby styles)
- Modify: `cardgame/contracts/script/Deploy.s.sol` (Fuji branch → 1 AVAX economics)

Design deviation from spec (simpler, noted): the `cardgame:slot` event carries `{ startsAt, reserved }` only; the UI reads `entryFee` straight from the contract (`ESCROW_ABI` already has the view) instead of piping it through the hub.

---

### Task 1: Hub — reservations + slot scheduler (TDD)

**Files:**
- Modify: `server/cardgame-mp.mjs`
- Test: `server/cardgame-mp.test.mjs`

- [ ] **Step 1: Adapt the harness and add the scheduled-flow tests**

In `server/cardgame-mp.test.mjs`:

1a. In `runMatch`, add an `emitToAll` capture and pass it to the hub, and replace the enqueue block:

```js
  // OLD:
  // const hub = createCardgameHub({ emitToPlayer, emitToRoom, chain, now: () => clock, log: () => {} });
  // NEW:
  const slotEvents = [];
  const emitToAll = (event, data) => { if (event === 'cardgame:slot') slotEvents.push(data); };
  const hub = createCardgameHub({ emitToPlayer, emitToRoom, emitToAll, chain, now: () => clock, log: () => {} });
```

```js
  // OLD:
  // for (const a of ADDRS) hub.enqueue(a);
  // await flush();
  // NEW: reserve all four, then advance the clock to the next 5-min slot boundary
  for (const a of ADDRS) hub.reserve(a);
  clock = 300_000; hub.sweep();
  await flush(); // let createMatch resolve + match-found fire (clients auto-pay + pick)
```

Also return `slotEvents` from `runMatch` (add to the return object).

1b. Append BEFORE the final `console.log(\`\\n${fail === 0 ...\`)` line:

```js
console.log('\n[mp-scheduled] under-filled slot skips and reservations roll over');
{
  let clock = 0;
  const hub = createCardgameHub({
    emitToPlayer: () => {}, emitToRoom: () => {}, emitToAll: () => {},
    chain: { createMatch: async () => { throw new Error('must not create'); }, settle: async () => ({}) },
    now: () => clock, log: () => {},
  });
  hub.reserve(ADDRS[0]); hub.reserve(ADDRS[1]);
  clock = 300_000; hub.sweep();
  await flush();
  ok(hub.stats().rooms === 0, 'no room formed with 2 reservations');
  ok(hub.stats().reserved === 2, 'both reservations survive to the next slot');
  clock = 600_000; hub.sweep(); await flush();
  ok(hub.stats().reserved === 2, 'still reserved after a second empty slot');
}

console.log('\n[mp-scheduled] overflow — 5 reserved: 4 race, 5th rolls to next slot');
{
  const FIFTH = '0xEEee000000000000000000000000000000000005';
  let clock = 0;
  const hub = createCardgameHub({
    emitToPlayer: () => {}, emitToRoom: () => {}, emitToAll: () => {},
    chain: { createMatch: async () => ({ matchId: '0xM2', seed: 's', entryFee: '1000000000000000000' }), settle: async () => ({}) },
    now: () => clock, log: () => {},
  });
  for (const a of [...ADDRS, FIFTH]) hub.reserve(a);
  clock = 300_000; hub.sweep(); await flush();
  ok(hub.stats().rooms === 1, 'one room formed');
  ok(hub.stats().reserved === 1, 'fifth player still reserved');
  ok(hub._reserved[0].address === FIFTH, 'fifth player is first for the next slot');
}

console.log('\n[mp-scheduled] no-payer → on-chain cancel + connected payers re-reserved at front');
{
  let clock = 0;
  const cancelled = [];
  const hub = createCardgameHub({
    emitToPlayer: () => {}, emitToRoom: () => {}, emitToAll: () => {},
    chain: {
      createMatch: async () => ({ matchId: '0xM3', seed: 's', entryFee: '1000000000000000000' }),
      settle: async () => ({}),
      cancelMatch: async (matchId) => { cancelled.push(matchId); },
    },
    now: () => clock, log: () => {},
  });
  for (const a of ADDRS) hub.reserve(a);
  clock = 300_000; hub.sweep(); await flush();
  ok(hub.stats().rooms === 1, 'room formed');
  // three pay, ADDRS[3] never does
  hub.markPaid(ADDRS[0]); hub.markPaid(ADDRS[1]); hub.markPaid(ADDRS[2]);
  clock = 300_000 + 90_001; // past PAY_WINDOW_MS
  hub.sweep(); await flush();
  ok(cancelled.length === 1 && cancelled[0] === '0xM3', 'chain.cancelMatch called for the room');
  ok(hub.stats().rooms === 0, 'room destroyed');
  ok(hub.stats().reserved === 3, 'three connected payers re-reserved');
  ok(hub._reserved[0].address === ADDRS[0], 'payers are at the FRONT (order kept)');
}
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `node server/cardgame-mp.test.mjs`
Expected: crashes with `hub.reserve is not a function`.

- [ ] **Step 3: Implement in `server/cardgame-mp.mjs`**

3a. Add after the `SEATS` export:

```js
export const SLOT_MS = 300_000; // a scheduled race every 5 minutes (wall clock)
```

3b. Add `emitToAll` to the deps (after `const emitToRoom = deps.emitToRoom;`):

```js
  const emitToAll = deps.emitToAll || (() => {});
```

3c. Replace the whole matchmaking block (`const queue = []` line, and the `enqueue`/`dequeue` functions) with:

```js
  /** Ordered reservation list for the next scheduled slot. A reservation dies
   *  with its socket (disconnect() drops it) — no ghost seats. */
  const reserved = [];
  let nextSlotAt = 0;

  function slotAfter(t) { return Math.floor(t / SLOT_MS) * SLOT_MS + SLOT_MS; }
  function broadcastSlot() {
    if (!nextSlotAt) nextSlotAt = slotAfter(now());
    emitToAll('cardgame:slot', { startsAt: nextSlotAt, reserved: reserved.length });
  }

  // ── scheduled matchmaking: players reserve, the clock opens the race ──
  function reserve(address) {
    const key = address.toLowerCase();
    if (byAddress.has(key)) return { error: 'already in a match' };
    if (reserved.some((r) => r.address.toLowerCase() === key)) return { error: 'already reserved' };
    reserved.push({ address });
    broadcastSlot();
    return { ok: true, position: reserved.length, startsAt: nextSlotAt };
  }
  function unreserve(address) {
    const key = address.toLowerCase();
    const i = reserved.findIndex((r) => r.address.toLowerCase() === key);
    if (i >= 0) { reserved.splice(i, 1); broadcastSlot(); }
  }
```

3d. `formMatch` now receives the group. Change its signature/first lines:

```js
  // OLD:
  // async function formMatch() {
  //   const group = queue.splice(0, SEATS);
  //   const room = new Room(group.map((g) => g.address));
  // NEW:
  async function formMatch(addresses) {
    const room = new Room(addresses);
```

And in its catch block, roll the group back to the reservation list so a
transient createMatch failure doesn't eat four reservations:

```js
    } catch (e) {
      log('[cardgame] createMatch failed', e?.message);
      for (const p of room.players) emitToPlayer(p.address, 'cardgame:error', { error: 'match open failed — you stay reserved for the next race' });
      destroyRoom(room);
      for (const p of [...room.players].reverse()) reserved.unshift({ address: p.address });
      broadcastSlot();
    }
```

3e. Cancel-with-refund helper — add above `cancelRoom`:

```js
  /** Cancel a room still in 'paying': flips the on-chain match to Cancelled so
   *  payers can withdraw instantly, and puts CONNECTED payers back at the front
   *  of the reservation list for the next slot. */
  function cancelPaying(room, reason) {
    const payers = room.players.filter((p) => p.paid && p.connected).map((p) => p.address);
    if (room.matchId && chain.cancelMatch) {
      Promise.resolve(chain.cancelMatch(room.matchId)).catch((e) => log('[cardgame] cancelMatch failed', e?.message));
    }
    cancelRoom(room, reason);
    for (const a of payers.reverse()) reserved.unshift({ address: a });
    broadcastSlot();
  }
```

3f. In `disconnect(address)`: replace `dequeue(address);` with `unreserve(address);`
and replace the paying-state branch:

```js
    if (room.state === 'paying') {
      // pre-lock drop cancels the match; whoever already paid gets an instant
      // on-chain refund credit and stays reserved for the next race
      cancelPaying(room, 'a player left before lock');
    }
```

3g. In `sweep()`: add the slot check at the top and switch the pay-timeout to `cancelPaying`:

```js
  function sweep() {
    const t = now();
    // scheduled slots: at each 5-min boundary, the first four reservations race
    if (!nextSlotAt) nextSlotAt = slotAfter(t);
    if (t >= nextSlotAt) {
      if (reserved.length >= SEATS) {
        const group = reserved.splice(0, SEATS).map((g) => g.address);
        void formMatch(group);
      }
      nextSlotAt = slotAfter(t);
      broadcastSlot();
    }
    for (const room of rooms.values()) {
      if (room.state === 'paying' && t >= room.payDeadline) {
        cancelPaying(room, 'not all players paid in time');
      } else if (room.state === 'playing') {
        for (const p of room.players) {
          if (!p.connected && !p.bot && p.droppedAt && t - p.droppedAt >= RECONNECT_GRACE_MS) {
            p.bot = true;
            emitToRoom(room.id, 'cardgame:seat-botted', { pid: p.pid });
          }
        }
      }
    }
  }
```

3h. Update the return object:

```js
  return {
    reserve, unreserve, markPaid, chooseVehicle, submitPlay, disconnect, reconnect,
    tickAll, sweep, broadcastSlot,
    _rooms: rooms, _reserved: reserved, _byAddress: byAddress, Room,
    stats: () => ({ reserved: reserved.length, rooms: rooms.size }),
  };
```

Also update the file's doc comment lifecycle line to `reserve → slot → forming → paying → playing → settling → done`.

- [ ] **Step 4: Run the hub tests**

Run: `node server/cardgame-mp.test.mjs`
Expected: all PASS (2 original suites through the new reserve/sweep path + 3 new scheduled suites). If the full-match test hangs, check that `clock = 300_000; hub.sweep()` runs before the pump and that the pump's `clock += 100` starts from 300_000 (it does — `clock` is shared).

- [ ] **Step 5: Commit**

```bash
git add server/cardgame-mp.mjs server/cardgame-mp.test.mjs
git commit -m "feat(cardgame): hub slot scheduler — reservations replace the queue"
```

---

### Task 2: Wire — socket events + cancelMatch dep

**Files:**
- Modify: `server/cardgame-mp-wire.mjs`
- Modify: `frontend/lib/cardgame/mpClient.ts`

- [ ] **Step 1: New signature message (both sides)**

`server/cardgame-mp-wire.mjs` — replace `verifyQueueSig` body's message line:

```js
    const msg = `Frostbite CAR(D) GAME — join scheduled race\naddress: ${String(address).toLowerCase()}\nnonce: ${nonce}`;
```

(rename the function to `verifyReserveSig` and update both call sites).

`frontend/lib/cardgame/mpClient.ts` — replace `queueMessage` with:

```ts
/** Message the player signs to reserve a seat / reconnect (proves wallet
 *  ownership). Mirrors the mp server's verifyReserveSig. */
export function reserveMessage(address: string, nonce: number): string {
  return `Frostbite CAR(D) GAME — join scheduled race\naddress: ${address.toLowerCase()}\nnonce: ${nonce}`;
}
```

- [ ] **Step 2: chain.cancelMatch + emitToAll in the wire**

In `registerCardgame`, add to the `chain` object:

```js
    async cancelMatch(matchId) {
      const r = await fetch(`${NEXT_BASE}/api/cardgame/mp/cancel`, { method: 'POST', headers, body: JSON.stringify({ matchId }) });
      if (!r.ok) throw new Error(`mp/cancel ${r.status}`);
      return r.json(); // { cancelled: true, txHash }
    },
```

And add `emitToAll` to the hub deps:

```js
    emitToAll: (event, data) => io.emit(event, data),
```

- [ ] **Step 3: Socket events — reserve/unreserve replace queue/leave**

Replace the `cardgame:queue` handler with:

```js
    socket.on('cardgame:reserve', (d = {}) => {
      const { address, nonce, sig } = d;
      if (!address || !ethers.isAddress(address)) return socket.emit('cardgame:error', { error: 'valid address required' });
      if (!Number.isInteger(nonce) || !sig || !verifyReserveSig(address, nonce, sig)) {
        return socket.emit('cardgame:error', { error: 'sign to reserve (wallet ownership)' });
      }
      bind(address);
      const res = hub.reserve(address);
      if (res?.error) socket.emit('cardgame:error', { error: res.error });
      else socket.emit('cardgame:reserved', { position: res.position, startsAt: res.startsAt });
    });
    socket.on('cardgame:unreserve', () => { const a = me(); if (a) hub.unreserve(a); });
    // every new socket immediately learns the next race time
    hub.broadcastSlot();
```

(the `hub.broadcastSlot()` line goes inside the `io.on('connection', …)` callback, after the handlers). Update `cardgame:leave` to call `hub.unreserve(a); hub.disconnect(a);` (replaces `hub.dequeue`).

- [ ] **Step 4: Commit**

```bash
git add server/cardgame-mp-wire.mjs frontend/lib/cardgame/mpClient.ts
git commit -m "feat(cardgame): wire scheduled reservations + on-chain cancel dep"
```

---

### Task 3: Next — `cancelMatchMP` + `mp/cancel` route

**Files:**
- Modify: `frontend/lib/cardgame/server.ts`
- Create: `frontend/app/api/cardgame/mp/cancel/route.ts`

- [ ] **Step 1: Add `cancelMatchMP` to `frontend/lib/cardgame/server.ts`**

Add next to `openMatchMP` (same op-wallet pattern as `openMatch`; `cancelMatch(bytes32)` is `onlyOwner`, and on Fuji owner == the operator/deployer key):

```ts
/** Force a not-yet-settled match to Cancelled so payers can refund instantly.
 *  Owner-gated on-chain; on Fuji the operator key IS the owner. */
export async function cancelMatchMP(matchId: Hex): Promise<{ cancelled: boolean; txHash: Hex }> {
  const hash = await opWallet().writeContract({
    address: CARDGAME_ESCROW,
    abi: parseAbi(['function cancelMatch(bytes32 matchId)']),
    functionName: 'cancelMatch',
    args: [matchId],
  });
  await waitOk(hash);
  return { cancelled: true, txHash: hash };
}
```

(match the file's existing `opWallet()` / `waitOk()` helpers and `parseAbi` import style — extend the existing ABI const instead if the file keeps one central `ABI`).

- [ ] **Step 2: Create `frontend/app/api/cardgame/mp/cancel/route.ts`**

```ts
import { NextResponse } from 'next/server';
import type { Hex } from 'viem';
import { cancelMatchMP, operatorConfigured } from '@/lib/cardgame/server';
import { globalLimit } from '@/lib/cardgame/guard';
import { mpAuthorized } from '../secret';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SERVER-TO-SERVER (frostbite-mp → Next). POST { matchId } → cancelMatch so
 * payers of a failed scheduled race can withdraw their entry instantly.
 * Gated by CARDGAME_MP_SECRET — never callable from a browser.
 */
export async function POST(req: Request) {
  if (!operatorConfigured()) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  if (!mpAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!globalLimit('mpCancel', 30, 60_000)) return NextResponse.json({ error: 'busy' }, { status: 429 });

  let body: { matchId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!body.matchId || !/^0x[0-9a-fA-F]{64}$/.test(body.matchId)) {
    return NextResponse.json({ error: 'matchId must be a bytes32 hex' }, { status: 400 });
  }
  try {
    return NextResponse.json(await cancelMatchMP(body.matchId as Hex));
  } catch {
    return NextResponse.json({ error: 'cancel failed' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep cardgame | grep -v three` → expect only the two pre-existing track3d TS7006 lines.

```bash
git add frontend/lib/cardgame/server.ts frontend/app/api/cardgame/mp/cancel/route.ts
git commit -m "feat(cardgame): owner cancelMatch route for failed scheduled races"
```

---

### Task 4: UI — scheduled lobby

**Files:**
- Modify: `frontend/app/cardgame/page.tsx`
- Modify: `frontend/lib/cardgame/mountMultiplayer.ts`, `frontend/lib/cardgame/mountStaked.ts`
- Modify: `frontend/app/cardgame/cardgame.css`

- [ ] **Step 1: Dynamic fee plumbing in the mounts**

`mountMultiplayer.ts`: delete the `const ENTRY = 0.01;` block; add `entryFee: string` (wei) to `MpRenderOpts`; compute:

```ts
const entryAvax = Number(opts.entryFee) / 1e18;
const payoutStr = (rank: number) => String(+(entryAvax * (PAYOUT_X[rank] ?? 0)).toFixed(4));
```

and replace both `entry ${ENTRY} AVAX` strings with `entry ${entryAvax} AVAX`.
`mountStaked.ts`: same change — `entryFee: string` added to `StakedOpts`, `ENTRY` const deleted, `payoutStr`/labels derive from `entryAvax`.

- [ ] **Step 2: page.tsx — MP mode becomes a scheduled lobby**

Replace the `startMp` flow: a `useEffect` on `mode === 'mp' && authenticated` opens the socket immediately and subscribes; `JOIN RACE` only signs + emits.

```tsx
  const [slot, setSlot] = useState<{ startsAt: number; reserved: number } | null>(null);
  const [slotLeft, setSlotLeft] = useState('');
  const [feeWei, setFeeWei] = useState<bigint | null>(null);
  const feeRef = useRef<string>('0');

  // read the entry fee straight from the escrow (single source of truth)
  useEffect(() => {
    if (!publicClient) return;
    publicClient.readContract({ address: CARDGAME_ESCROW, abi: ESCROW_ABI, functionName: 'entryFee' })
      .then((f) => { setFeeWei(f); feeRef.current = String(f); }).catch(() => {});
  }, [publicClient]);

  // countdown ticker
  useEffect(() => {
    if (!slot) return;
    const id = setInterval(() => {
      const ms = Math.max(0, slot.startsAt - Date.now());
      const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
      setSlotLeft(`${m}:${String(s).padStart(2, '0')}`);
    }, 500);
    return () => clearInterval(id);
  }, [slot]);

  // MP mode: connect + listen as soon as the tab is active (lobby needs live slot data)
  useEffect(() => {
    if (mode !== 'mp' || !authenticated || !address || !publicClient) return;
    const socket = createCardgameSocket();
    socketRef.current = socket;
    socket.on('cardgame:slot', (d: { startsAt: number; reserved: number }) => setSlot(d));
    socket.on('cardgame:reserved', () => { setMpPhase('reserved'); setMpNote('Seat reserved — the race locks in the first four when the countdown hits zero.'); });
    socket.on('cardgame:error', (d: { error?: string }) => setMpNote(`Error: ${d?.error || 'unknown'}`));
    socket.on('cardgame:cancelled', (d: { reason?: string }) => {
      setMpNote(`Race cancelled: ${d?.reason || 'a player left'}. Paid entries are instantly refundable — you're still reserved for the next race.`);
      setMpPhase('reserved');
    });
    socket.on('cardgame:match-found', async (d: { matchId: Hex; entryFee: string; seat: Seat['pid']; seats: Seat[] }) => {
      try {
        setMpPhase('paying');
        setMpNote(`Race starting — confirm your ${formatEther(BigInt(d.entryFee))} AVAX entry…`);
        await ensureFuji();
        const hash = await writeContractAsync({
          address: CARDGAME_ESCROW, abi: ESCROW_ABI, functionName: 'joinMatch',
          args: [d.matchId], value: BigInt(d.entryFee), chainId: CARDGAME_CHAIN_ID,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        socket.emit('cardgame:paid');
        setMpPhase('waiting'); setMpNote('Paid — waiting for all four to lock in…');
      } catch (e) {
        const msg = (e as { shortMessage?: string; message?: string }).shortMessage || (e as Error).message;
        setMpNote(/rejected|denied/i.test(msg) ? 'Entry declined — your seat was released.' : `Pay error: ${msg.slice(0, 120)}`);
        socket.emit('cardgame:leave'); setMpPhase('idle');
      }
    });
    socket.on('cardgame:locked', (d: { seats: Seat[] }) => {
      setMpPhase('playing'); setMpNote('');
      cleanupRef.current?.();
      if (rootRef.current) {
        cleanupRef.current = mountMultiplayer(rootRef.current, {
          socket, myAddress: address, seats: d.seats, entryFee: feeRef.current,
          onFinished: () => setMpNote('Match over — settling on-chain…'),
          onSettled: async () => {
            const p = await readPending(); setPayout(p); setMpPhase('settled');
            setMpNote(p > 0n ? `You won ◆ ${formatEther(p)} AVAX — withdraw below.` : 'Settled — no payout this time.');
          },
        });
      }
    });
    return () => { socket.disconnect(); socketRef.current = null; setSlot(null); };
  }, [mode, authenticated, address, publicClient, ensureFuji, writeContractAsync, readPending]);

  const joinRace = useCallback(async () => {
    if (!address || !socketRef.current) return;
    try {
      const nonce = Math.floor(Math.random() * 2_000_000_000);
      const sig = (await signMessageAsync({ message: reserveMessage(address, nonce) })) as Hex;
      socketRef.current.emit('cardgame:reserve', { address, nonce, sig });
    } catch { /* user declined the signature */ }
  }, [address, signMessageAsync]);
  const leaveRace = useCallback(() => { socketRef.current?.emit('cardgame:unreserve'); setMpPhase('idle'); setMpNote(''); }, []);
```

The MP panel JSX (replacing the FIND MATCH block):

```tsx
        <div className="cg-stakebar-l">
          <Coins size={18} className="gold-ic" />
          <div>
            <div className="cg-stake-title">Scheduled Race <span className="tn">FUJI TESTNET</span></div>
            <div className="cg-stake-sub">
              A race starts <b>every 5 minutes</b> · first four reserved seats play ·
              entry <b>{feeWei !== null ? formatEther(feeWei) : '…'} AVAX</b> · winner takes <b>{feeWei !== null ? formatEther(feeWei * 2n) : '…'}</b>
            </div>
            {slot && (
              <div className="cg-slot">
                <span className="cg-slot-count">{slotLeft || '…'}</span>
                <span className="cg-slot-seats">{Array.from({ length: 4 }, (_, i) => (
                  <i key={i} className={i < slot.reserved ? 'on' : ''} />
                ))} {slot.reserved}/4 reserved</span>
              </div>
            )}
          </div>
        </div>
        <div className="cg-stakebar-r">
          {mpPhase === 'settled' && payout > 0n ? (
            <button className="btn" onClick={withdraw}><Trophy size={15} /> WITHDRAW ◆ {formatEther(payout)}</button>
          ) : mpPhase === 'idle' || mpPhase === 'settled' ? (
            <button className="btn" onClick={joinRace}>JOIN RACE</button>
          ) : mpPhase === 'reserved' ? (
            <button className="btn ghost" onClick={leaveRace}>RESERVED ✓ · LEAVE</button>
          ) : (
            <button className="btn ghost" onClick={teardownMp}>
              {(mpPhase === 'waiting') && <Loader2 size={15} className="cg-spin" />}
              {mpPhase === 'paying' ? 'PAYING…' : mpPhase === 'waiting' ? 'WAITING…' : 'LEAVE'}
            </button>
          )}
        </div>
```

Housekeeping in page.tsx: `mpPhase` union gains `'reserved'` (replaces `'queuing'`), the old `startMp` callback and `mpQueue` state are deleted, `queueMessage` import becomes `reserveMessage`, and `mountStaked(...)` gains `entryFee: String(fee)` (the staked flow already holds `fee`).

- [ ] **Step 3: Lobby CSS** (append to `cardgame.css`)

```css
/* scheduled-race lobby */
.cgroot .cg-slot{display:flex;align-items:center;gap:14px;margin-top:8px}
.cgroot .cg-slot-count{font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:26px;letter-spacing:2px;color:var(--cg-ice);text-shadow:0 0 14px rgba(77,208,225,.45)}
.cgroot .cg-slot-seats{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--cg-muted);font-family:'JetBrains Mono',monospace}
.cgroot .cg-slot-seats i{width:14px;height:8px;border-radius:3px;background:rgba(255,255,255,.08);border:1px solid var(--cg-line)}
.cgroot .cg-slot-seats i.on{background:linear-gradient(90deg,var(--cg-ice),var(--cg-gold));border-color:transparent;box-shadow:0 0 8px rgba(77,208,225,.5)}
```

- [ ] **Step 4: Typecheck + build + commit**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep cardgame | grep -v three` (only pre-existing track3d lines) then `npx next build` → `✓ Compiled successfully`.

```bash
git add frontend/app/cardgame/page.tsx frontend/lib/cardgame/mountMultiplayer.ts frontend/lib/cardgame/mountStaked.ts frontend/app/cardgame/cardgame.css
git commit -m "feat(cardgame): scheduled-race lobby UI — countdown, seat pips, dynamic fee"
```

---

### Task 5: New Fuji deployment at 1 AVAX

**Files:**
- Modify: `cardgame/contracts/script/Deploy.s.sol`

- [ ] **Step 1: Fuji branch → 1 AVAX economics**

In `Deploy.s.sol` replace the 43113 branch body:

```solidity
        if (block.chainid == 43113) {
            entryFee = 1 ether; // pool 4 — matches the mainnet economics
            platformFee = 0.2 ether;
            rewards = [uint256(2 ether), 1 ether, 0.5 ether, 0.3 ether]; // Σ 3.8 + 0.2 = 4.0
            owner_ = deployer; // deployer keeps admin (cancelMatch) on testnet
            signer_ = deployer;
        } else if (block.chainid == 43114) {
```

- [ ] **Step 2: Forge suite still green (source untouched)**

Run: `cd cardgame/contracts && forge test`
Expected: 108 passed.

- [ ] **Step 3: Deploy (operator key = deployer = owner)**

Keys: `~/Desktop/cardgame-operator-keys.json` (same operator PK as the VPS `CARDGAME_OPERATOR_PK`).

```bash
cd cardgame/contracts
export FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
forge script script/Deploy.s.sol --rpc-url $FUJI_RPC_URL                      # dry run first
forge script script/Deploy.s.sol --rpc-url $FUJI_RPC_URL --broadcast --private-key $DEPLOYER_PK
```

Record the new address from the log. Verify:

```bash
cast call <NEW_ESCROW> "entryFee()(uint256)" --rpc-url $FUJI_RPC_URL   # 1000000000000000000
cast call <NEW_ESCROW> "owner()(address)"    --rpc-url $FUJI_RPC_URL   # == operator address
```

- [ ] **Step 4: Point everything at the new address**

- Local: `frontend/.env.local` → `NEXT_PUBLIC_CARDGAME_ESCROW=<NEW_ESCROW>` (and `.env.testnet` if it pins the old one).
- VPS: same var in `/opt/frostbite/mainnet/frontend/.env.local`, then the normal build+rsync+pm2 deploy.
- Nothing to change in the mp-server env (it only talks to Next).

- [ ] **Step 5: Fund the actors + commit**

- Operator: keep ≥2 AVAX for gas (createMatch/cancel/settle).
- Staked house bots (`CARDGAME_BOT_PKS`): each needs ≥1 AVAX per concurrent staked match, recycled by `server/cardgame-bot-recycle.mjs` — top each up to ~10 test-AVAX (`cast balance` each; fund from operator or the Fuji faucet).

```bash
git add cardgame/contracts/script/Deploy.s.sol
git commit -m "feat(cardgame): Fuji deploy config — 1 AVAX entry, mainnet economics"
```

---

### Task 6: Rollout + end-to-end verification

- [ ] **Step 1: Full test sweep**

```bash
node server/cardgame-mp.test.mjs                       # scheduled hub suite
cd frontend
npx tsx scripts/cardgame-abilities-test.ts             # 28/28
npx tsx scripts/cardgame-bestplay-test.ts              # 21/21
npx tsx scripts/cardgame-engine-parity.ts              # engine untouched → parity holds
npx next build                                         # ✓ Compiled successfully
cd ../cardgame/contracts && forge test                 # 108/108
```

- [ ] **Step 2: Deploy the frontend** (normal flow: local build → rsync → `pm2 restart frostbite-mainnet`).

- [ ] **Step 3: Deploy the mp server** — rsync `server/cardgame-mp.mjs`, `server/cardgame-mp-wire.mjs` into `/opt/frostbite/mp-server/` and `pm2 restart frostbite-mp`; confirm `/mp/health` and the hub-registered log line.

- [ ] **Step 4: Manual E2E checklist (user or dev, real wallet on Fuji)**

- MP tab shows `NEXT RACE` countdown + `0/4 reserved` without touching anything.
- JOIN RACE → one signature → pip lights up, `1/4 reserved`; LEAVE releases it.
- With <4 reserved, the countdown hits 0:00 → nothing locks, next slot appears, reservation survives.
- (When 4 wallets are available) slot fires → pay prompt at 1 AVAX → race → settle; a deliberate no-pay run shows the cancel + instant refundability (`pendingPayouts` > 0 for payers) + auto re-reservation.
- Staked tab now reads 1 AVAX (dynamic) and still completes a bot match.

- [ ] **Step 5: Report** — new escrow address, what changed, and that the old 0.01 contract remains deployed for history.
