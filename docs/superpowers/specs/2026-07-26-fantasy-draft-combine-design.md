# Fantasy Draft Combine — Design Spec

**Date:** 2026-07-26
**Status:** Approved pending user review

## Overview

A web app that turns fantasy league draft-order randomization into a live, synchronized,
NFL-Combine-style broadcast spectacle. A commissioner creates a room, enters manager names,
and shares a watch link. When the commissioner starts the reveal, every viewer — in any
state, on any device — watches the same animated elimination gauntlet at the same moment.
Managers' avatar "athletes" compete through combine events; eliminations lock in draft
picks from last to first until a head-to-head finale decides the #1 pick.

The randomization is a fair, server-side seeded shuffle. The athletic competition is
deterministic theater layered on top of that result.

## Goals

- Fair, tamper-evident draft order randomization (provable via seed hash).
- Genuinely simultaneous shared viewing experience for a remote group.
- Zero friction: no accounts, no installs. Two links: control (commissioner) and watch (everyone).
- A show worth watching: broadcast-styled, funny, suspenseful, different lineup each year.

## Non-Goals

- Playable/skill-based mini-games (spectacle only; nobody "plays").
- Accounts, league persistence, year-over-year history.
- Weighted lottery odds (pure uniform shuffle in v1).
- Spoiler-proofing against users who inspect network traffic mid-reveal (outcomes are
  delivered to clients when the reveal starts; a determined viewer can only spoil themselves).

## User Flow

1. **Home page** — pitch + "Create a Reveal Room."
2. **Setup (commissioner)** — add 2–20 manager/team names; edit, reorder, assign auto
   team colors. "Create Room" produces:
   - **Control link** (contains a secret admin token) — start, reset, re-run.
   - **Watch link** — public, pasted into the league group chat.
3. **Lobby (watch page)** — roster display, live viewer count, the seed hash
   ("commitment") shown with a one-line explanation, "waiting for commissioner."
4. **Reveal** — commissioner hits Start on the control page. All clients play the
   synchronized broadcast (see The Show). Latecomers land mid-broadcast at the correct
   moment.
5. **Results** — full draft board, seed revealed for fairness verification,
   copy-as-text button for the group chat. Room and results remain viewable until expiry.

## The Show

### Presentation

Sports-broadcast aesthetic: dark set, score bug, lower-third graphics, stylized 2D
jersey-wearing avatars in team colors with manager names. Sound effects (crowd, whistle,
airhorn) exist but start muted; one tap enables.

### Event pool (8 events, shared animation framework)

1. **40-Yard Dash** — lane sprint, photo-finish timing to the hundredth. Slowest eliminated.
2. **Bench Press (225 lbs)** — side-by-side rep counters; athletes fail out one by one. Fewest reps eliminated.
3. **Vertical Jump** — one athlete at a time leaps at a measuring pole; height flashes on the bug. Lowest eliminated.
4. **3-Cone Drill** — timed cone weave with wipeout/cone-clip comedy. Slowest eliminated.
5. **20-Yard Shuttle** — lateral scramble with split timers. Slowest eliminated.
6. **The Gauntlet** — catching drill; drops shown in slow-mo replay. Most drops eliminated.
7. **Broad Jump** — standing leap, sand-pit marker, measuring-tape graphic. Shortest eliminated.
8. **Championship 40** *(finale, always runs)* — last two survivors re-run the 40
   head-to-head for the #1 pick: slow-mo photo finish, replay angle, confetti.

Each reveal, the seed selects which pool events run (variety is part of the show).
Between events, an "elimination locked" graphic updates an always-visible draft board.

### Gauntlet structure (scales 2–20 managers)

- The finale is always the last 2 athletes competing for picks 1–2.
- Let `R = N − 2` (eliminations needed before the finale).
- Pre-finale event count `P = min(3, R)`; total events = `P + 1`.
  (N=2 → finale only; N=3 → 1 event + finale; N≥5 → 3 events + finale.)
- Distribute `R` eliminations across the `P` events as evenly as possible, larger
  batches in earlier events. Example, N=12: eliminate 4 / 3 / 3, then finale.
  Eliminated athletes lock the worst remaining picks, ordered by their in-event finish.

## Architecture

### Stack

- **Next.js (App Router)** deployed on Vercel; Node runtime (Fluid Compute), no edge runtime.
- **Key-value store** provisioned through the Vercel Marketplace (provider chosen via
  marketplace discovery during implementation setup — not hardcoded in this spec).
- **Sync:** client polling of room status (~2s in lobby, less often mid-reveal since the
  timeline is self-driving). No WebSockets — unnecessary at this scale.

### Fairness & determinism model

- On room creation, the server generates a secret random seed, stores it server-side,
  and publishes `SHA-256(seed)` to the lobby (the commitment).
- On Start, the server derives everything from the seed deterministically:
  event lineup, final draft order (uniform Fisher–Yates shuffle), per-event
  performances/eliminations consistent with that order, and stamps `startTime`.
- The complete outcome + timeline data is stored in the room and delivered to clients,
  who render the broadcast as a pure function of `(outcomes, now − startTime)`.
  All viewers stay in sync within polling/clock tolerance (~1–2s); joins mid-reveal
  resolve to the correct instant.
- On completion (or when the timeline's end time passes), the seed is revealed so anyone
  can verify the hash and re-derive the order.
- The commissioner has no path to see or influence the order before Start; Reset
  generates a fresh seed and fresh commitment (a reset is publicly visible in the lobby).

### Data model (single room record)

```
Room {
  id                 // short public id (watch link)
  adminToken         // secret (control link only)
  names[]            // 2–20 managers, with assigned colors
  status             // lobby | revealing | complete
  seedHash           // public commitment
  seed               // returned by the API only once status = complete
  outcomes           // event lineup, timelines, eliminations, final order (set at Start)
  startTime          // server-stamped epoch ms (set at Start)
  resetCount         // publicly visible
  createdAt / TTL    // rooms expire ~48h after creation
}
```

### API surface (route handlers)

- `POST /api/rooms` — create room (names) → id, adminToken, seedHash.
- `GET /api/rooms/:id` — public room state (seed included only when complete).
- `POST /api/rooms/:id/start` — admin token required; idempotent; derives outcomes, stamps startTime.
- `POST /api/rooms/:id/reset` — admin token required; back to lobby with a new seed/commitment.

## Error Handling

- Store blip / lost connectivity: clients keep polling with backoff; because the reveal is
  a pure function of shared data + time, recovery is automatic and cannot desync viewers.
- Double-click Start / concurrent Start: idempotent — first write wins, others return the
  same started state.
- Invalid/expired room: friendly "room not found or expired" page.
- Reset mid-reveal: allowed (dog-on-keyboard clause); publicly visible via resetCount.
- Room expiry: ~48h TTL on the store record.

## Testing

- **Unit:** seeded shuffle (deterministic per seed, uniform across seeds, hash
  verifiable); gauntlet math (event count, elimination batches, pick assignment for
  N = 2…20); timeline function (what is visible at time T, including boundaries,
  latecomer joins, and post-end state).
- **API:** create/start/reset lifecycle, admin-token auth, idempotent start.
- **Manual:** two-browser sync check on a deployed preview; mobile layout pass.

## Build Priorities

1. Core loop: room lifecycle, seeded shuffle, one event (40-Yard Dash) + finale, sync, results.
2. Remaining events on the shared animation framework.
3. Polish: sounds, confetti, replay flourishes, copy-to-chat formatting.
