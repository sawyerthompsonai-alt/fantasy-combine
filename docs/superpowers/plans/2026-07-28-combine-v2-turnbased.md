# Combine 2.0 — Turn-Based Broadcast Implementation Plan

> **For agentic workers:** Executed via subagent-driven development. Iteration on a shipped app — existing code in lib/ and components/ is the pattern reference. Each task: implement, keep `npm run lint` 0/0, `npm test` green (update tests where behavior intentionally changed), `npm run build` passing, commit to main, push (auto-deploys).

**Goal:** Rebuild the reveal show as a slow, cinematic, turn-based combine: one elimination per event, full-screen scenes, articulated animated athletes performing each drill one at a time. Target runtime ~6–8 min for 12 managers.

**User-approved requirements (2026-07-28):**
- One elimination per event; up to 12 events total; finale is head-to-head champ40 locking picks 2 then 1. Larger leagues (N > 13) fold extra eliminations into the earliest events so total events ≤ 12.
- Athletes perform ONE AT A TIME (spotlight turns) in every event type.
- Full-screen scene per event, transition between events, draft board gets its own interstitial beat.
- Combine field look: turf, yard lines, hash marks, event props, stadium-dark backdrop, lower-thirds.
- Live sync model unchanged (host starts; all viewers synced; latecomers land correctly). Post-show local Replay button.
- Sound stays opt-in/muted by default; make the toggle prominent; add per-turn whistle, crowd, elimination horn.

## Global Constraints (unchanged from v1)

- All randomness via createRng/seededShuffle from the room seed; Math.random only in pure-sparkle UI (confetti).
- Everything on screen is a pure function of (outcomes, serverNow-corrected elapsed); no client state that can desync.
- Client components: type-only imports from lib/rooms; no node-only imports.
- lint 0/0 (react-hooks purity rules), tests green, build green — every commit.

## Pacing constants (Task 2 owns; renderers consume phase durations from state)

INTRO_MS=3000, TURN_MS=4000, RESULTS_MS=4000, ELIMINATION_MS=4000, GAP_MS=1500, FINALE_RUN_MS=12000.
N=12 → 10 events × (3+4k+4+4+1.5)s + finale ≈ 7 min. ✓ target.

---

### Task 1: Derivation rework — one elimination per event

**Files:** lib/gauntlet.ts, lib/outcomes.ts, tests/gauntlet.test.ts, tests/outcomes.test.ts

- `eliminationBatches(n)`: R=n−2 eliminations over P=min(11, R) events; batches all 1 except earliest events absorb the remainder (n=12 → [1×10]; n=20 → [4,3,2,1,1,1,1,1,1,1,1] — any split totalling R with P≤11, non-increasing, works; keep it deterministic and tested). n=2 → [] (finale only). Total events = P+1 ≤ 12.
- `deriveOutcomes`: event lineup now length P — cycle the 7-type pool with seed-shuffled order per cycle, no immediate repeats at cycle seams; EventResult gains `round?: number` (2 for second appearance of a type, etc.).
- Everything else (ranking construction, performances, picksLocked worst-first) unchanged in shape. EventResult interface change: add optional `round`.
- Update tests: spec examples above; picks n..1 locked exactly once across events+finale invariant must still pass for n=2..20.

### Task 2: Timeline rework — per-athlete turns

**Files:** lib/timeline.ts, tests/timeline.test.ts

New phase model per event: `intro` → one `turn` segment per competitor (in lane order, each TURN_MS; the state exposes `turnIndex` and the performing athlete) → `results` (RESULTS_MS) → `elimination` (ELIMINATION_MS; the event's pick locks at its midpoint) → GAP_MS. Finale: intro → two turn segments? NO — finale is simultaneous head-to-head: intro → `run` (FINALE_RUN_MS) → results (locks pick 2 at +1500, pick 1 at +3500, duration 6000).

- `BroadcastState` event kind gains: `phase: 'intro'|'turn'|'results'|'elimination'|'run'`, `turnIndex?: number`, `athlete?: number`.
- `lockedPicks` timing per above; all picks locked by totalMs. Keep pregame/final semantics.
- Rewrite tests for the new segment math (contiguity, turn athlete mapping, latecomer, lock ordering n..1, totalMs for n=12 between 5.5 and 8.5 min).

### Task 3: Scene framework + animated athlete

**Files:** components/scene/Field.tsx, components/scene/Athlete.tsx, components/scene/LowerThird.tsx, components/scene/BoardInterstitial.tsx, components/Broadcast.tsx (rework shell)

- `Field`: full-viewport (min-h-dvh) scene — turf gradient with SVG yard lines + hash marks + sideline numbers, dark stadium vignette above the field, subtle crowd-texture band. Accepts `prop` slot for event furniture (cones, bench rack, jump mat, measuring pole).
- `Athlete`: articulated SVG figure (~70px tall: head, torso in jersey color, two arms, two legs) with CSS-keyframe skeletal cycles driven by a `pose` prop: `idle` (breathing sway), `run` (leg/arm cycle, translates across field), `jump` (crouch→extend→air→land), `catch` (side-shuffle + arm reach + ball tuck or drop), `lift` (bench press arm extension reps). Name chip + jersey initials below. No Math.random.
- `LowerThird`: broadcast graphic bar (event name · ROUND k · ATHLETE NAME · live stat), amber-on-dark, slides in/out by phase.
- `BoardInterstitial`: full-screen draft board shown during `elimination` phase second half + gaps — big pick tiles, newly locked pick pulses.
- `Broadcast.tsx`: full-screen scene router (no more max-w column for the stage): renders Field + per-event scene by state, BoardInterstitial on elimination/gap, prominent sound toggle top-right, LIVE bug top-left, mini board rail only in results phase. Confetti + champion banner at final.

### Task 4: Per-event scenes (turn choreography)

**Files:** components/scene/events/DashScene.tsx (forty/threecone/shuttle variants via config: straight sprint vs cone weave path vs lateral shuttle), JumpScene.tsx (vertical: pole + chalk mark; broad: mat + tape measure), GauntletScene.tsx (balls fired in sequence, catch/drop per outcome — drops determined by performances), BenchScene.tsx (rack + bar bend + rep counter), FinaleScene.tsx (two lanes head-to-head, photo-finish freeze, slow-mo zoom, champion banner). Replace/retire old components/events/*.

Turn choreography per scene: walk-in (athlete enters from sideline) → perform (pose animation timed to TURN_MS, stat counts up/reveals at ~70%) → walk-off/fade. Current leader shown on the lower-third. During `results`: leaderboard table overlay ranked with stats; last place highlighted red. During `elimination`: eliminated athlete spotlight + "ELIMINATED · PICK #k LOCKED" lower-third, then BoardInterstitial.

### Task 5: Replay, sound upgrade, control-page copy

**Files:** components/FinalBoard.tsx (+Replay), lib/replay context or prop drill (client-only elapsed override in Broadcast: `Broadcast room now replayFrom?`), lib/sound.ts (crowd noise loop via filtered noise buffer, turn whistle, stat "pop", elimination horn; still opt-in), app/r/[id]/page.tsx wiring for replay mode (?replay=1 renders Broadcast with local clock from 0 when complete).

### Task 6: Deploy + live visual verification

Push → auto-deploy → controller verifies in real browser (scene layout at desktop + mobile width, turn animation, elimination flow, replay button, sound toggle visibility) with screenshots; fix-loop anything broken.
