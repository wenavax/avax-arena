# CAR(D) GAME — Per-Value Card Abilities (Practice-first)

**Date:** 2026-07-13
**Status:** Approved design, pending implementation
**Scope:** Practice mode only (`frontend/lib/cardgame/mount.ts`). The shared
deterministic engine (`engine.ts`), server re-simulation, Staked and
Multiplayer modes, and the 108-test forge battery are **untouched**. Promotion
to the shared engine is explicitly out of scope (see Future Work).

## 1. Problem

Today only the 3 magic types (NITRO / NAIL / OIL) *do* anything when played.
Normal cards 1–10 contribute only their numeric value to combos, so low cards
(1–3) are dead weight the auto-discard trims, and playing a single low card is
never interesting. The user wants **every card to have a feature**.

## 2. Core model (user-approved)

- **Every card has exactly ONE ability.**
  - Magic card → its existing magic effect (NITRO / NAIL / OIL). Unchanged.
  - Normal card → a signature ability keyed by its **value** (1–10). All 18
    copies of a value share the same ability → 10 abilities to design and
    balance, not 200.
- **Trigger: on play, automatic.** No extra clicks, no target selection.
  Targets resolve automatically, like the existing magic targeting.
- **Combo interaction: each unique value once.** When a multi-card set is
  played, each distinct *normal-card* value in the set triggers its ability
  once (duplicates don't stack). Magic cards in the set trigger only their
  magic, never their printed value's ability (one-card-one-ability).
- **Bots use the same rules** — the bot's plays trigger abilities identically.
  (The practice bot AI is not taught to *seek* abilities in this phase; it
  simply benefits from whatever it plays.)
- **Balance philosophy:** low values (1–3) = utility/comeback, mid (4–7) =
  tempo/combo, high (8–10) = raw power.

## 3. The 10 abilities (user-approved; numbers are Practice-tunable)

| Value | Keyword | Effect (initial numbers) |
|---|---|---|
| 1 | SLIPSTREAM | Instant forward jump proportional to your gap to the leader: `min(15u, 12% of gap)`. Nothing if you lead. |
| 2 | DRAFT | Extend your currently running boost (`nm`) by +1.5s. Nothing without an active boost. |
| 3 | SCAVENGE | Draw 1 card (respects hand limit; nothing if hand full or deck empty). |
| 4 | TUNE | This play's cooldown is 1s shorter (2s instead of 3s). |
| 5 | DEICE | Remove all slow effects (mult < 1) and debuff mark from yourself. |
| 6 | BUMP | The racer immediately ahead of you gets −15% speed for 2s. Nothing if you lead. |
| 7 | SYNERGY | +0.25 to this play's multiplier (still capped at 5.0). |
| 8 | GRIP | Self +18% speed for 3s. |
| 9 | OVERTAKE | Self +22% for 2.5s **and** the racer immediately ahead gets −15% for 2s (self-boost still applies if you lead). |
| 10 | REDLINE | Self +30% speed for 4s (longest, strongest). |

**Guardrails (all Practice-tunable constants):**

- Per-play ability *speed-buff* budget: the product of ability-granted
  self-speed multipliers in one play is capped (initial cap ×1.6) so an
  8+9+10 straight doesn't explode. The play multiplier cap (5.0) is separate
  and still applies.
- SLIPSTREAM jump is capped at 15u and can never push a car across the finish
  line by itself past 999u (leave the finish to real speed).
- Ability slow effects reuse the existing `magics[]` effect mechanism (mult +
  endsAt), so DEICE and expiry logic need no new machinery.
- **"Immediately ahead"** = the unfinished racer with the smallest
  `dist > yours`; **"leader"** = the unfinished racer with the highest `dist`.
  Ties break by seat order (P1→P4), matching existing engine conventions.

## 4. UI

- **Card face:** normal cards gain a small keyword ribbon at the bottom (same
  `<small>` slot magic cards already use), with a subtle per-value tint. Cards
  stay readable at 62×88.
- **Play preview:** the preview pill appends the abilities the current
  selection will trigger, e.g. `PAIR → x1.50 · TUNE + GRIP`.
- **On trigger:** floating popup over the track (`SLIPSTREAM +12u`) + an event
  log line. Speed effects reuse the existing fx aura classes, so the 2D lanes
  and the 3D view need no new visuals.
- **How-to-play panel:** gains a compact 10-row ability legend.

## 5. Architecture

- **New file `frontend/lib/cardgame/abilities.ts`** — pure, self-contained:

  ```ts
  export interface AbilityCtx { /* player, players, tSec, capBudget, helpers */ }
  export interface Ability { key: string; icon: string; desc: string;
    apply(ctx: AbilityCtx): string | null /* popup text or null if no-op */ }
  export const ABILITIES: Record<number, Ability>
  ```

  No DOM, no engine import. Testable headless. This isolation is what makes a
  later promotion to `engine.ts` a copy, not a rewrite.
- **`mount.ts` (Practice only):** inside `applyPlay`, after the existing
  evaluate/magic handling, collect the distinct values of the played *normal*
  cards and invoke each ability once via a small adapter that maps the
  practice-local `Player`/state shape onto `AbilityCtx`. Returned popup texts
  render as popups + log lines (human plays) or log lines (bot plays).
- **Determinism note:** abilities as specified use no randomness. This is a
  hard requirement so the eventual engine promotion cannot fork client/server
  results.

## 6. Testing & verification

- Headless node test for `abilities.ts` (pure functions): each ability's
  effect, the no-op edges (leader SLIPSTREAM/BUMP, full-hand SCAVENGE, no-boost
  DRAFT), and the speed-buff budget cap.
- `next build` + `tsc` clean; manual play-test in Practice for balance feel.
- Existing forge/headless engine tests must stay green **unchanged** (nothing
  in `engine.ts`/server is modified — verified by diff scope).

## 7. Future work (explicitly out of scope now)

1. **Promote to shared engine** once balance settles: move the ability pass
   into `engine.ts` `applyPlay`, regenerate goldens, extend forge/headless
   parity tests, then Staked/MP get abilities. This is a separate, user-gated
   session (touches on-chain settle re-simulation).
2. Teach the practice/MP bots to *seek* ability synergies.
3. Per-ability sound cues.
