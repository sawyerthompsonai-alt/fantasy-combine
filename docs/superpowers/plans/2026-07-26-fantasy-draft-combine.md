# Fantasy Draft Combine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web app where a commissioner creates a room and a remote fantasy league watches a synchronized, NFL-Combine-style animated elimination gauntlet that fairly randomizes their draft order.

**Architecture:** Next.js (App Router) on Vercel. A single Room record in a KV store holds names, a secret seed (committed via SHA-256 hash), and — once started — deterministically derived outcomes plus a server-stamped start time. Every client renders the broadcast as a pure function of `(outcomes, now − startTime)`, so all viewers stay in sync via simple polling. Spec: `docs/superpowers/specs/2026-07-26-fantasy-draft-combine-design.md`.

**Tech Stack:** Next.js 16 (App Router, TypeScript, Tailwind), Vitest for tests, Vercel Marketplace KV store (provider chosen via marketplace discovery in Task 9), Node runtime only (no edge).

## Global Constraints

- Managers per room: 2–20 (validate everywhere).
- Room TTL: 48 hours from creation.
- No accounts. Two links only: watch link `/r/:id`, control link `/r/:id/control?token=:adminToken`.
- Sound starts muted; one tap enables.
- Seed is NEVER exposed by any API until `status === 'complete'`. `adminToken` is never in public room payloads.
- All randomness derives from the room seed via `createRng` — no `Math.random()` anywhere in outcome/derivation code (UI-only sparkle like confetti may use `Math.random()`).
- Finale event is always `champ40`; picks lock last-to-first.
- Node runtime for all route handlers (no `runtime = 'edge'`).
- `node:crypto` only in server-only modules (`lib/hash.ts`, `lib/rooms.ts`, stores); never import those from client components.

---

### Task 1: Scaffold Next.js app + Vitest

**Files:**
- Create: Next.js scaffold at repo root (`app/`, `package.json`, `tsconfig.json`, `next.config.ts`, …)
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: working `npm run dev`, `npm test` (Vitest, node environment, `@/` alias → repo root), `npm run build`.

- [ ] **Step 1: Scaffold in a temp dir and move into repo root**

`create-next-app` refuses non-empty dirs and the capitalized dir name "Fantasy", so scaffold beside and move:

```bash
cd /Users/sawyerthompsonai/repos/Fantasy
npx create-next-app@latest combine-tmp --yes --typescript --tailwind --app --eslint --no-src-dir --import-alias "@/*"
rm -rf combine-tmp/.git
rsync -a combine-tmp/ . && rm -rf combine-tmp
```

Then edit `package.json`: set `"name": "fantasy-combine"`.

- [ ] **Step 2: Verify dev server boots**

Run: `npm run dev -- --port 3123` (then curl `http://localhost:3123` in another shell, expect HTTP 200, then stop the server).

- [ ] **Step 3: Add Vitest**

```bash
npm i -D vitest
```

Add to `package.json` scripts: `"test": "vitest run"`.

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname) } },
});
```

Create `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run tests and build**

Run: `npm test` → expect 1 passing. Run: `npm run build` → expect success.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with Vitest"
```

---

### Task 2: SHA-256 hash helper + seeded RNG

**Files:**
- Create: `lib/hash.ts` (server-only, node:crypto)
- Create: `lib/rng.ts` (pure, client-safe)
- Test: `tests/rng.test.ts`

**Interfaces:**
- Produces: `sha256Hex(input: string): string`; `createRng(seed: string): () => number` (deterministic, returns floats in [0,1)).

- [ ] **Step 1: Write the failing test**

`tests/rng.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createRng } from '@/lib/rng';
import { sha256Hex } from '@/lib/hash';

describe('sha256Hex', () => {
  it('matches known vector', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng('seed-1'), b = createRng('seed-1');
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it('differs across seeds', () => {
    const a = createRng('seed-1'), b = createRng('seed-2');
    const av = Array.from({ length: 10 }, a);
    const bv = Array.from({ length: 10 }, b);
    expect(av).not.toEqual(bv);
  });
  it('emits floats in [0,1)', () => {
    const rng = createRng('range');
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test` → FAIL (cannot resolve `@/lib/rng`).

- [ ] **Step 3: Implement**

`lib/hash.ts`:

```ts
import { createHash } from 'node:crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
```

`lib/rng.ts` (xmur3 string hash seeding an sfc32 generator — no node deps, safe in client bundles):

```ts
export function createRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const seedWord = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
  let a = seedWord(), b = seedWord(), c = seedWord(), d = seedWord();
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Run tests** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/hash.ts lib/rng.ts tests/rng.test.ts
git commit -m "feat: sha256 commitment helper and seeded rng"
```

---

### Task 3: Seeded shuffle

**Files:**
- Create: `lib/shuffle.ts`
- Test: `tests/shuffle.test.ts`

**Interfaces:**
- Consumes: `createRng` from Task 2.
- Produces: `seededShuffle<T>(items: T[], seed: string, label?: string): T[]` — pure (doesn't mutate input), deterministic per `(seed, label)`.

- [ ] **Step 1: Write the failing test**

`tests/shuffle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { seededShuffle } from '@/lib/shuffle';

describe('seededShuffle', () => {
  const items = [0, 1, 2, 3, 4, 5, 6, 7];

  it('is deterministic per seed+label', () => {
    expect(seededShuffle(items, 's1', 'x')).toEqual(seededShuffle(items, 's1', 'x'));
  });

  it('differs across labels for the same seed', () => {
    expect(seededShuffle(items, 's1', 'a')).not.toEqual(seededShuffle(items, 's1', 'b'));
  });

  it('returns a permutation and does not mutate input', () => {
    const input = [...items];
    const out = seededShuffle(input, 's2');
    expect(input).toEqual(items);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
  });

  it('is roughly uniform over 3-element permutations', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 6000; i++) {
      const key = seededShuffle([0, 1, 2], `seed-${i}`).join(',');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const c of counts.values()) {
      expect(c).toBeGreaterThan(700);   // expected 1000 ± tolerance
      expect(c).toBeLessThan(1300);
    }
  });
});
```

- [ ] **Step 2: Run test** → FAIL (module missing).

- [ ] **Step 3: Implement** — `lib/shuffle.ts`:

```ts
import { createRng } from './rng';

export function seededShuffle<T>(items: readonly T[], seed: string, label = 'shuffle'): T[] {
  const rng = createRng(`${seed}:${label}`);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
```

- [ ] **Step 4: Run tests** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/shuffle.ts tests/shuffle.test.ts
git commit -m "feat: seeded Fisher-Yates shuffle"
```

---

### Task 4: Gauntlet elimination math

**Files:**
- Create: `lib/gauntlet.ts`
- Test: `tests/gauntlet.test.ts`

**Interfaces:**
- Produces: `eliminationBatches(n: number): number[]` — per spec: `R = n − 2`, `P = min(3, R)` pre-finale events, `R` split evenly with larger batches first. Throws on n outside 2–20.

- [ ] **Step 1: Write the failing test**

`tests/gauntlet.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { eliminationBatches } from '@/lib/gauntlet';

describe('eliminationBatches', () => {
  it('handles spec examples', () => {
    expect(eliminationBatches(2)).toEqual([]);
    expect(eliminationBatches(3)).toEqual([1]);
    expect(eliminationBatches(4)).toEqual([1, 1]);
    expect(eliminationBatches(5)).toEqual([1, 1, 1]);
    expect(eliminationBatches(12)).toEqual([4, 3, 3]);
    expect(eliminationBatches(20)).toEqual([6, 6, 6]);
  });

  it('sums to n-2 with at most 3 batches, non-increasing, for all n in 2..20', () => {
    for (let n = 2; n <= 20; n++) {
      const b = eliminationBatches(n);
      expect(b.reduce((s, x) => s + x, 0)).toBe(n - 2);
      expect(b.length).toBe(Math.min(3, n - 2));
      for (let i = 1; i < b.length; i++) expect(b[i]).toBeLessThanOrEqual(b[i - 1]);
    }
  });

  it('rejects out-of-range sizes', () => {
    expect(() => eliminationBatches(1)).toThrow();
    expect(() => eliminationBatches(21)).toThrow();
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement** — `lib/gauntlet.ts`:

```ts
export function eliminationBatches(n: number): number[] {
  if (!Number.isInteger(n) || n < 2 || n > 20) {
    throw new Error('manager count must be an integer between 2 and 20');
  }
  const r = n - 2;
  const p = Math.min(3, r);
  if (p === 0) return [];
  const base = Math.floor(r / p);
  const extra = r % p;
  return Array.from({ length: p }, (_, i) => base + (i < extra ? 1 : 0));
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/gauntlet.ts tests/gauntlet.test.ts
git commit -m "feat: elimination batch math for gauntlet structure"
```

---

### Task 5: Types + outcome derivation

**Files:**
- Create: `lib/types.ts`
- Create: `lib/outcomes.ts`
- Test: `tests/outcomes.test.ts`

**Interfaces:**
- Consumes: `seededShuffle`, `eliminationBatches`, `createRng`.
- Produces (exact shapes later tasks rely on):

```ts
// lib/types.ts
export type EventType =
  | 'forty' | 'bench' | 'vertical' | 'threecone'
  | 'shuttle' | 'gauntlet' | 'broad' | 'champ40';

export interface EventResult {
  type: EventType;
  competitors: number[];                 // athlete indices in this event
  ranking: number[];                     // best → worst finish (theater)
  performances: Record<number, number>;  // athleteIdx → stat value
  eliminated: number[];                  // reveal order: worst pick first
  picksLocked: { pick: number; athlete: number }[]; // same order as eliminated
}

export interface Outcomes {
  order: number[];        // order[k] = athlete index holding pick k+1
  events: EventResult[];  // chronological; last is always type 'champ40'
}

export type RoomStatus = 'lobby' | 'revealing' | 'complete';

export interface Room {
  id: string;
  adminToken: string;
  names: string[];
  colors: string[];
  status: RoomStatus;
  seedHash: string;
  seed: string;
  outcomes?: Outcomes;
  startTime?: number;   // epoch ms
  resetCount: number;
  createdAt: number;    // epoch ms
}

export const EVENT_META: Record<EventType, {
  label: string; unit: string; decimals: number; lowerBetter: boolean;
}> = {
  forty:     { label: '40-Yard Dash',     unit: 's',      decimals: 2, lowerBetter: true },
  champ40:   { label: 'Championship 40',  unit: 's',      decimals: 2, lowerBetter: true },
  threecone: { label: '3-Cone Drill',     unit: 's',      decimals: 2, lowerBetter: true },
  shuttle:   { label: '20-Yard Shuttle',  unit: 's',      decimals: 2, lowerBetter: true },
  bench:     { label: 'Bench Press',      unit: ' reps',  decimals: 0, lowerBetter: false },
  vertical:  { label: 'Vertical Jump',    unit: '"',      decimals: 1, lowerBetter: false },
  broad:     { label: 'Broad Jump',       unit: '"',      decimals: 0, lowerBetter: false },
  gauntlet:  { label: 'The Gauntlet',     unit: ' drops', decimals: 0, lowerBetter: true },
};
```

- `deriveOutcomes(seed: string, names: string[]): Outcomes`

- [ ] **Step 1: Write the failing test**

`tests/outcomes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveOutcomes } from '@/lib/outcomes';
import { eliminationBatches } from '@/lib/gauntlet';
import { EVENT_META } from '@/lib/types';

const names12 = Array.from({ length: 12 }, (_, i) => `Team ${i}`);

describe('deriveOutcomes', () => {
  it('is deterministic', () => {
    expect(deriveOutcomes('s', names12)).toEqual(deriveOutcomes('s', names12));
  });

  it('order is a permutation of all athletes', () => {
    const { order } = deriveOutcomes('s', names12);
    expect([...order].sort((a, b) => a - b)).toEqual(names12.map((_, i) => i));
  });

  it('has batches.length + 1 events ending in champ40, no duplicate event types', () => {
    for (const n of [2, 3, 5, 8, 12, 20]) {
      const names = Array.from({ length: n }, (_, i) => `T${i}`);
      const { events } = deriveOutcomes('seed', names);
      expect(events.length).toBe(eliminationBatches(n).length + 1);
      expect(events[events.length - 1].type).toBe('champ40');
      const types = events.map(e => e.type);
      expect(new Set(types).size).toBe(types.length);
    }
  });

  it('locks every pick exactly once, from pick n down to pick 1', () => {
    const { events, order } = deriveOutcomes('s2', names12);
    const locks = events.flatMap(e => e.picksLocked);
    expect(locks.map(l => l.pick)).toEqual(
      Array.from({ length: 12 }, (_, i) => 12 - i)
    );
    for (const { pick, athlete } of locks) expect(order[pick - 1]).toBe(athlete);
  });

  it('eliminated athletes hold the worst remaining picks each round', () => {
    const { events } = deriveOutcomes('s3', names12);
    const batches = eliminationBatches(12);
    batches.forEach((k, i) => {
      expect(events[i].eliminated.length).toBe(k);
      expect(events[i].picksLocked.length).toBe(k);
    });
    // finale locks picks 2 then 1
    const finale = events[events.length - 1];
    expect(finale.picksLocked.map(l => l.pick)).toEqual([2, 1]);
  });

  it('performances are consistent with ranking direction', () => {
    const { events } = deriveOutcomes('s4', names12);
    for (const e of events) {
      const meta = EVENT_META[e.type];
      for (let i = 1; i < e.ranking.length; i++) {
        const prev = e.performances[e.ranking[i - 1]];
        const cur = e.performances[e.ranking[i]];
        if (meta.lowerBetter) expect(cur).toBeGreaterThanOrEqual(prev);
        else expect(cur).toBeLessThanOrEqual(prev);
      }
    }
  });

  it('n=2 is finale-only', () => {
    const { events } = deriveOutcomes('s5', ['A', 'B']);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('champ40');
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement**

Create `lib/types.ts` exactly as in the Interfaces block above.

`lib/outcomes.ts`:

```ts
import { seededShuffle } from './shuffle';
import { eliminationBatches } from './gauntlet';
import { createRng } from './rng';
import type { EventResult, EventType, Outcomes } from './types';
import { EVENT_META } from './types';

const POOL: EventType[] = ['forty', 'bench', 'vertical', 'threecone', 'shuttle', 'gauntlet', 'broad'];

const STAT_BASE: Record<EventType, { base: number; step: number }> = {
  forty:     { base: 4.31, step: 0.08 },
  champ40:   { base: 4.28, step: 0.06 },
  threecone: { base: 6.68, step: 0.12 },
  shuttle:   { base: 3.98, step: 0.1 },
  bench:     { base: 34,   step: -2 },
  vertical:  { base: 43.5, step: -1.5 },
  broad:     { base: 141,  step: -3 },
  gauntlet:  { base: 0,    step: 1 },
};

function buildEvent(
  type: EventType,
  competitors: number[],
  ranking: number[],
  eliminated: number[],            // worst pick first (reveal order)
  order: number[],
  seed: string,
  eventIndex: number,
): EventResult {
  const rng = createRng(`${seed}:perf:${eventIndex}`);
  const { base, step } = STAT_BASE[type];
  const { decimals, lowerBetter } = EVENT_META[type];
  const performances: Record<number, number> = {};
  ranking.forEach((athlete, i) => {
    // jitter < 0.5*|step| in the "worse" direction keeps ordering strict
    const jitter = decimals > 0 ? rng() * 0.4 * Math.abs(step) * (lowerBetter ? 1 : -1) : 0;
    const raw = base + step * i + jitter;
    performances[athlete] = Number(raw.toFixed(decimals));
  });
  const pickOf = (athlete: number) => order.indexOf(athlete) + 1;
  return {
    type,
    competitors,
    ranking,
    performances,
    eliminated,
    picksLocked: eliminated.map(a => ({ pick: pickOf(a), athlete: a })),
  };
}

export function deriveOutcomes(seed: string, names: string[]): Outcomes {
  const n = names.length;
  const order = seededShuffle(names.map((_, i) => i), seed, 'order');
  const batches = eliminationBatches(n);
  const lineup = seededShuffle(POOL, seed, 'lineup').slice(0, batches.length);
  const events: EventResult[] = [];

  let alive = [...order]; // best pick first
  batches.forEach((k, e) => {
    const survivors = alive.slice(0, alive.length - k);
    const cut = alive.slice(alive.length - k);        // best pick first among cut
    const eliminated = [...cut].reverse();            // reveal worst pick first
    const rankedSurvivors = seededShuffle(survivors, seed, `event:${e}`);
    const ranking = [...rankedSurvivors, ...cut];     // last place = worst pick
    events.push(buildEvent(lineup[e], [...alive], ranking, eliminated, order, seed, e));
    alive = survivors;
  });

  // finale: alive === [order[0], order[1]]
  events.push(
    buildEvent('champ40', [...alive], [...alive], [alive[1], alive[0]], order, seed, batches.length)
  );

  return { order, events };
}
```

- [ ] **Step 4: Run tests** → PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/outcomes.ts tests/outcomes.test.ts
git commit -m "feat: derive full combine outcomes from seed"
```

---

### Task 6: Broadcast timeline

**Files:**
- Create: `lib/timeline.ts`
- Test: `tests/timeline.test.ts`

**Interfaces:**
- Consumes: `Outcomes`, `EventResult` from Task 5.
- Produces:

```ts
export interface Segment {
  eventIndex: number;
  phase: 'intro' | 'run' | 'results';
  startMs: number;
  endMs: number;
}
export type BroadcastState =
  | { kind: 'pregame' }
  | { kind: 'event'; eventIndex: number; phase: Segment['phase'];
      phaseElapsedMs: number; phaseDurationMs: number }
  | { kind: 'final' };

export const INTRO_MS = 4000, GAP_MS = 1200, LOCK_MS = 1600, RESULTS_BASE_MS = 3000;
export function runMs(type: EventType, competitorCount: number): number;
export function buildTimeline(outcomes: Outcomes): { segments: Segment[]; totalMs: number };
export function stateAt(outcomes: Outcomes, elapsedMs: number): BroadcastState;
export function lockedPicks(outcomes: Outcomes, elapsedMs: number): { pick: number; athlete: number }[];
```

Timing rules: events run in order; each event = intro (INTRO_MS) → run (`runMs`) → results (RESULTS_BASE_MS + LOCK_MS × picksLocked.length), then GAP_MS before the next. The k-th pick of an event (0-based) locks at `resultsStart + (k + 1) * LOCK_MS`. After the last segment ends, state is `final` and all picks are locked. Negative elapsed → `pregame`.

- [ ] **Step 1: Write the failing test**

`tests/timeline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveOutcomes } from '@/lib/outcomes';
import {
  buildTimeline, stateAt, lockedPicks, runMs,
  INTRO_MS, GAP_MS, LOCK_MS, RESULTS_BASE_MS,
} from '@/lib/timeline';

const outcomes = deriveOutcomes('tl-seed', Array.from({ length: 12 }, (_, i) => `T${i}`));

describe('buildTimeline', () => {
  it('produces intro/run/results per event, in order, gap-separated', () => {
    const { segments } = buildTimeline(outcomes);
    expect(segments.length).toBe(outcomes.events.length * 3);
    let cursor = 0;
    outcomes.events.forEach((e, i) => {
      const [intro, run, results] = segments.slice(i * 3, i * 3 + 3);
      expect(intro).toMatchObject({ eventIndex: i, phase: 'intro', startMs: cursor });
      expect(intro.endMs - intro.startMs).toBe(INTRO_MS);
      expect(run.startMs).toBe(intro.endMs);
      expect(run.endMs - run.startMs).toBe(runMs(e.type, e.competitors.length));
      expect(results.startMs).toBe(run.endMs);
      expect(results.endMs - results.startMs).toBe(RESULTS_BASE_MS + LOCK_MS * e.picksLocked.length);
      cursor = results.endMs + GAP_MS;
    });
  });
});

describe('stateAt', () => {
  it('handles pregame, mid-phase, gaps, and post-end', () => {
    const { segments, totalMs } = buildTimeline(outcomes);
    expect(stateAt(outcomes, -50)).toEqual({ kind: 'pregame' });
    const run0 = segments[1];
    const mid = stateAt(outcomes, run0.startMs + 500);
    expect(mid).toMatchObject({ kind: 'event', eventIndex: 0, phase: 'run', phaseElapsedMs: 500 });
    // inside a gap, state sticks to the previous results phase
    const gapState = stateAt(outcomes, segments[2].endMs + 10);
    expect(gapState).toMatchObject({ kind: 'event', eventIndex: 0, phase: 'results' });
    expect(stateAt(outcomes, totalMs + 1)).toEqual({ kind: 'final' });
  });
});

describe('lockedPicks', () => {
  it('starts empty, locks in order worst pick to pick 1, complete at end', () => {
    const { segments, totalMs } = buildTimeline(outcomes);
    expect(lockedPicks(outcomes, 0)).toEqual([]);
    const results0 = segments[2];
    const oneLock = lockedPicks(outcomes, results0.startMs + LOCK_MS);
    expect(oneLock.length).toBe(1);
    expect(oneLock[0].pick).toBe(12);
    const all = lockedPicks(outcomes, totalMs);
    expect(all.map(l => l.pick)).toEqual(Array.from({ length: 12 }, (_, i) => 12 - i));
  });

  it('a latecomer at time T sees exactly the picks locked by T', () => {
    const { segments } = buildTimeline(outcomes);
    const results1 = segments[5]; // event 1 results
    const t = results1.startMs + 2 * LOCK_MS + 10;
    const locks = lockedPicks(outcomes, t);
    const batch0 = outcomes.events[0].picksLocked.length;
    expect(locks.length).toBe(batch0 + 2);
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement** — `lib/timeline.ts`:

```ts
import type { EventType, Outcomes } from './types';

export interface Segment {
  eventIndex: number;
  phase: 'intro' | 'run' | 'results';
  startMs: number;
  endMs: number;
}

export type BroadcastState =
  | { kind: 'pregame' }
  | { kind: 'event'; eventIndex: number; phase: Segment['phase'];
      phaseElapsedMs: number; phaseDurationMs: number }
  | { kind: 'final' };

export const INTRO_MS = 4000;
export const GAP_MS = 1200;
export const LOCK_MS = 1600;
export const RESULTS_BASE_MS = 3000;

export function runMs(type: EventType, competitorCount: number): number {
  switch (type) {
    case 'forty': return 11000;
    case 'champ40': return 14000;
    case 'threecone': return 12000;
    case 'shuttle': return 10000;
    case 'bench': return 16000;
    case 'gauntlet': return 13000;
    case 'vertical':
    case 'broad': return 4000 * competitorCount;
  }
}

export function buildTimeline(outcomes: Outcomes): { segments: Segment[]; totalMs: number } {
  const segments: Segment[] = [];
  let cursor = 0;
  outcomes.events.forEach((e, i) => {
    const push = (phase: Segment['phase'], dur: number) => {
      segments.push({ eventIndex: i, phase, startMs: cursor, endMs: cursor + dur });
      cursor += dur;
    };
    push('intro', INTRO_MS);
    push('run', runMs(e.type, e.competitors.length));
    push('results', RESULTS_BASE_MS + LOCK_MS * e.picksLocked.length);
    cursor += GAP_MS;
  });
  return { segments, totalMs: cursor - GAP_MS };
}

export function stateAt(outcomes: Outcomes, elapsedMs: number): BroadcastState {
  if (elapsedMs < 0) return { kind: 'pregame' };
  const { segments, totalMs } = buildTimeline(outcomes);
  if (elapsedMs > totalMs) return { kind: 'final' };
  let current: Segment = segments[0];
  for (const s of segments) {
    if (elapsedMs >= s.startMs) current = s;
    else break;
  }
  return {
    kind: 'event',
    eventIndex: current.eventIndex,
    phase: current.phase,
    phaseElapsedMs: Math.min(elapsedMs, current.endMs) - current.startMs,
    phaseDurationMs: current.endMs - current.startMs,
  };
}

export function lockedPicks(outcomes: Outcomes, elapsedMs: number): { pick: number; athlete: number }[] {
  const { segments } = buildTimeline(outcomes);
  const locks: { pick: number; athlete: number }[] = [];
  outcomes.events.forEach((e, i) => {
    const results = segments[i * 3 + 2];
    e.picksLocked.forEach((lock, k) => {
      if (elapsedMs >= results.startMs + (k + 1) * LOCK_MS) locks.push(lock);
    });
  });
  return locks;
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/timeline.ts tests/timeline.test.ts
git commit -m "feat: deterministic broadcast timeline and pick locking"
```

---

### Task 7: Room store (interface + memory implementation)

**Files:**
- Create: `lib/store.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: `Room` from Task 5.
- Produces:

```ts
export const ROOM_TTL_MS = 48 * 60 * 60 * 1000;
export const PRESENCE_WINDOW_MS = 10_000;
export interface RoomStore {
  getRoom(id: string, now: number): Promise<Room | null>;   // null if missing/expired
  putRoom(room: Room): Promise<void>;
  touchPresence(roomId: string, viewerId: string, now: number): Promise<void>;
  presenceCount(roomId: string, now: number): Promise<number>;
}
export function getStore(): RoomStore;          // memory now; Task 9 adds Redis switch
export function __resetStoreForTests(): void;
```

- [ ] **Step 1: Write the failing test**

`tests/store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getStore, __resetStoreForTests, ROOM_TTL_MS, PRESENCE_WINDOW_MS } from '@/lib/store';
import type { Room } from '@/lib/types';

const room = (over: Partial<Room> = {}): Room => ({
  id: 'r1', adminToken: 't', names: ['A', 'B'], colors: ['#f00', '#00f'],
  status: 'lobby', seedHash: 'h', seed: 's', resetCount: 0, createdAt: 1000, ...over,
});

describe('memory RoomStore', () => {
  beforeEach(() => __resetStoreForTests());

  it('round-trips a room', async () => {
    const store = getStore();
    await store.putRoom(room());
    expect(await store.getRoom('r1', 2000)).toEqual(room());
  });

  it('returns null for missing and for expired rooms', async () => {
    const store = getStore();
    expect(await store.getRoom('nope', 0)).toBeNull();
    await store.putRoom(room());
    expect(await store.getRoom('r1', 1000 + ROOM_TTL_MS + 1)).toBeNull();
  });

  it('counts only fresh presence', async () => {
    const store = getStore();
    await store.touchPresence('r1', 'v1', 1000);
    await store.touchPresence('r1', 'v2', 5000);
    await store.touchPresence('r1', 'v2', 8000); // same viewer, refreshed
    expect(await store.presenceCount('r1', 9000)).toBe(2);
    expect(await store.presenceCount('r1', 1000 + PRESENCE_WINDOW_MS + 1)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement** — `lib/store.ts`:

```ts
import type { Room } from './types';

export const ROOM_TTL_MS = 48 * 60 * 60 * 1000;
export const PRESENCE_WINDOW_MS = 10_000;

export interface RoomStore {
  getRoom(id: string, now: number): Promise<Room | null>;
  putRoom(room: Room): Promise<void>;
  touchPresence(roomId: string, viewerId: string, now: number): Promise<void>;
  presenceCount(roomId: string, now: number): Promise<number>;
}

class MemoryStore implements RoomStore {
  rooms = new Map<string, Room>();
  presence = new Map<string, Map<string, number>>();

  async getRoom(id: string, now: number): Promise<Room | null> {
    const room = this.rooms.get(id);
    if (!room) return null;
    if (now > room.createdAt + ROOM_TTL_MS) {
      this.rooms.delete(id);
      return null;
    }
    return structuredClone(room);
  }
  async putRoom(room: Room): Promise<void> {
    this.rooms.set(room.id, structuredClone(room));
  }
  async touchPresence(roomId: string, viewerId: string, now: number): Promise<void> {
    const m = this.presence.get(roomId) ?? new Map<string, number>();
    m.set(viewerId, now);
    this.presence.set(roomId, m);
  }
  async presenceCount(roomId: string, now: number): Promise<number> {
    const m = this.presence.get(roomId);
    if (!m) return 0;
    let count = 0;
    for (const [viewer, ts] of m) {
      if (now - ts <= PRESENCE_WINDOW_MS) count++;
      else m.delete(viewer);
    }
    return count;
  }
}

// globalThis keeps one store across Next dev hot reloads
const g = globalThis as unknown as { __combineStore?: MemoryStore };

export function getStore(): RoomStore {
  g.__combineStore ??= new MemoryStore();
  return g.__combineStore;
}

export function __resetStoreForTests(): void {
  g.__combineStore = new MemoryStore();
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/store.ts tests/store.test.ts
git commit -m "feat: room store interface with in-memory implementation"
```

---

### Task 8: Room lifecycle + API routes

**Files:**
- Create: `lib/rooms.ts` (server-only)
- Create: `app/api/rooms/route.ts`
- Create: `app/api/rooms/[id]/route.ts`
- Create: `app/api/rooms/[id]/start/route.ts`
- Create: `app/api/rooms/[id]/reset/route.ts`
- Test: `tests/api.test.ts`

**Interfaces:**
- Consumes: `getStore`, `deriveOutcomes`, `buildTimeline`, `sha256Hex`, types.
- Produces:

```ts
// lib/rooms.ts
export interface PublicRoom {
  id: string; names: string[]; colors: string[]; status: RoomStatus;
  seedHash: string; resetCount: number; serverNow: number; viewerCount: number;
  startTime?: number; outcomes?: Outcomes;   // present when status !== 'lobby'
  seed?: string;                             // present only when status === 'complete'
}
export const COLORS: string[];                       // 20 hex colors
export function validateNames(input: unknown): string[];  // throws Error with user message
export function createRoom(names: string[], now: number): Room;
export function startRoom(room: Room, now: number): Room;   // throws if not lobby
export function resetRoom(room: Room): Room;
export function publicRoom(room: Room, serverNow: number, viewerCount: number): PublicRoom;
export function maybeComplete(room: Room, now: number): Room; // revealing → complete when timeline over
```

- HTTP API (all JSON):
  - `POST /api/rooms` body `{ names: string[] }` → 201 `{ id, adminToken, seedHash }`; 400 `{ error }` on bad names.
  - `GET /api/rooms/:id?viewer=<uuid>` → 200 `PublicRoom`; 404 `{ error }`. Passing `viewer` registers lobby presence.
  - `POST /api/rooms/:id/start` header `x-admin-token` → 200 `PublicRoom` (idempotent: repeat calls return same startTime); 403 bad token; 404 missing.
  - `POST /api/rooms/:id/reset` header `x-admin-token` → 200 `PublicRoom` (fresh seed/hash, status lobby, resetCount+1); 403/404 as above.

- [ ] **Step 1: Write the failing test**

`tests/api.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { __resetStoreForTests } from '@/lib/store';
import { POST as createPost } from '@/app/api/rooms/route';
import { GET as roomGet } from '@/app/api/rooms/[id]/route';
import { POST as startPost } from '@/app/api/rooms/[id]/start/route';
import { POST as resetPost } from '@/app/api/rooms/[id]/reset/route';
import { buildTimeline } from '@/lib/timeline';

const jsonReq = (url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const names = ['Alpha', 'Bravo', 'Charlie', 'Delta'];

async function makeRoom() {
  const res = await createPost(jsonReq('http://t/api/rooms', { names }));
  expect(res.status).toBe(201);
  return res.json() as Promise<{ id: string; adminToken: string; seedHash: string }>;
}

beforeEach(() => __resetStoreForTests());

describe('POST /api/rooms', () => {
  it('creates a room and returns credentials', async () => {
    const { id, adminToken, seedHash } = await makeRoom();
    expect(id).toMatch(/^[a-z0-9]{8}$/);
    expect(adminToken).toMatch(/^[a-f0-9]{48}$/);
    expect(seedHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects bad rosters', async () => {
    for (const bad of [undefined, [], ['Solo'], Array(21).fill('x'), ['A', 'A'], ['A', '']]) {
      const res = await createPost(jsonReq('http://t/api/rooms', { names: bad }));
      expect(res.status).toBe(400);
    }
  });
});

describe('GET /api/rooms/:id', () => {
  it('returns public state without secrets, counts viewers', async () => {
    const { id } = await makeRoom();
    const res = await roomGet(new Request(`http://t/api/rooms/${id}?viewer=v-1`), ctx(id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('lobby');
    expect(body.seed).toBeUndefined();
    expect(body.adminToken).toBeUndefined();
    expect(body.outcomes).toBeUndefined();
    expect(body.viewerCount).toBe(1);
    expect(typeof body.serverNow).toBe('number');
  });
  it('404s unknown rooms', async () => {
    const res = await roomGet(new Request('http://t/api/rooms/zzzzzzzz'), ctx('zzzzzzzz'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/rooms/:id/start', () => {
  it('requires the admin token', async () => {
    const { id } = await makeRoom();
    const res = await startPost(jsonReq(`http://t/api/rooms/${id}/start`, undefined, { 'x-admin-token': 'wrong' }), ctx(id));
    expect(res.status).toBe(403);
  });
  it('starts the reveal, exposes outcomes but not seed, and is idempotent', async () => {
    const { id, adminToken } = await makeRoom();
    const h = { 'x-admin-token': adminToken };
    const r1 = await (await startPost(jsonReq(`http://t/r/${id}/s`, undefined, h), ctx(id))).json();
    expect(r1.status).toBe('revealing');
    expect(r1.outcomes.order).toHaveLength(4);
    expect(r1.seed).toBeUndefined();
    const r2 = await (await startPost(jsonReq(`http://t/r/${id}/s`, undefined, h), ctx(id))).json();
    expect(r2.startTime).toBe(r1.startTime);
  });
  it('flips to complete and reveals seed after the timeline ends', async () => {
    const { id, adminToken } = await makeRoom();
    const started = await (await startPost(
      jsonReq(`http://t/s`, undefined, { 'x-admin-token': adminToken }), ctx(id))).json();
    const { totalMs } = buildTimeline(started.outcomes);
    // simulate time passing by rewinding startTime in the store
    const { getStore } = await import('@/lib/store');
    const raw = await getStore().getRoom(id, Date.now());
    raw!.startTime = Date.now() - totalMs - 1000;
    await getStore().putRoom(raw!);
    const done = await (await roomGet(new Request(`http://t/api/rooms/${id}`), ctx(id))).json();
    expect(done.status).toBe('complete');
    expect(done.seed).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('POST /api/rooms/:id/reset', () => {
  it('returns to lobby with a fresh commitment', async () => {
    const { id, adminToken } = await makeRoom();
    const h = { 'x-admin-token': adminToken };
    const before = await (await roomGet(new Request(`http://t/api/rooms/${id}`), ctx(id))).json();
    await startPost(jsonReq('http://t/s', undefined, h), ctx(id));
    const after = await (await resetPost(jsonReq('http://t/r', undefined, h), ctx(id))).json();
    expect(after.status).toBe('lobby');
    expect(after.resetCount).toBe(1);
    expect(after.seedHash).not.toBe(before.seedHash);
    expect(after.outcomes).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement**

`lib/rooms.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { sha256Hex } from './hash';
import { deriveOutcomes } from './outcomes';
import { buildTimeline } from './timeline';
import type { Outcomes, Room, RoomStatus } from './types';

export const COLORS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
  '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000',
  '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080',
];

export interface PublicRoom {
  id: string; names: string[]; colors: string[]; status: RoomStatus;
  seedHash: string; resetCount: number; serverNow: number; viewerCount: number;
  startTime?: number; outcomes?: Outcomes; seed?: string;
}

export function validateNames(input: unknown): string[] {
  if (!Array.isArray(input)) throw new Error('names must be a list');
  const names = input.map(n => String(n ?? '').trim());
  if (names.some(n => n.length === 0)) throw new Error('every manager needs a name');
  if (names.some(n => n.length > 24)) throw new Error('names must be 24 characters or fewer');
  if (names.length < 2 || names.length > 20) throw new Error('rooms need 2-20 managers');
  const lower = names.map(n => n.toLowerCase());
  if (new Set(lower).size !== lower.length) throw new Error('names must be unique');
  return names;
}

export function createRoom(names: string[], now: number): Room {
  const seed = randomBytes(32).toString('hex');
  return {
    id: randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, 'x').slice(0, 8),
    adminToken: randomBytes(24).toString('hex'),
    names,
    colors: names.map((_, i) => COLORS[i % COLORS.length]),
    status: 'lobby',
    seed,
    seedHash: sha256Hex(seed),
    resetCount: 0,
    createdAt: now,
  };
}

export function startRoom(room: Room, now: number): Room {
  if (room.status !== 'lobby') return room; // idempotent
  return { ...room, status: 'revealing', startTime: now, outcomes: deriveOutcomes(room.seed, room.names) };
}

export function resetRoom(room: Room): Room {
  const seed = randomBytes(32).toString('hex');
  return {
    ...room, seed, seedHash: sha256Hex(seed), status: 'lobby',
    outcomes: undefined, startTime: undefined, resetCount: room.resetCount + 1,
  };
}

export function maybeComplete(room: Room, now: number): Room {
  if (room.status !== 'revealing' || !room.outcomes || room.startTime === undefined) return room;
  const { totalMs } = buildTimeline(room.outcomes);
  if (now >= room.startTime + totalMs) return { ...room, status: 'complete' };
  return room;
}

export function publicRoom(room: Room, serverNow: number, viewerCount: number): PublicRoom {
  return {
    id: room.id, names: room.names, colors: room.colors, status: room.status,
    seedHash: room.seedHash, resetCount: room.resetCount, serverNow, viewerCount,
    ...(room.status !== 'lobby' ? { startTime: room.startTime, outcomes: room.outcomes } : {}),
    ...(room.status === 'complete' ? { seed: room.seed } : {}),
  };
}
```

`app/api/rooms/route.ts`:

```ts
import { getStore } from '@/lib/store';
import { createRoom, validateNames } from '@/lib/rooms';

export async function POST(req: Request) {
  let names: string[];
  try {
    const body = await req.json();
    names = validateNames(body?.names);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'invalid request' }, { status: 400 });
  }
  const room = createRoom(names, Date.now());
  await getStore().putRoom(room);
  return Response.json(
    { id: room.id, adminToken: room.adminToken, seedHash: room.seedHash },
    { status: 201 },
  );
}
```

`app/api/rooms/[id]/route.ts`:

```ts
import { getStore } from '@/lib/store';
import { maybeComplete, publicRoom } from '@/lib/rooms';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const now = Date.now();
  const store = getStore();
  let room = await store.getRoom(id, now);
  if (!room) return Response.json({ error: 'room not found or expired' }, { status: 404 });

  const completed = maybeComplete(room, now);
  if (completed !== room) {
    await store.putRoom(completed);
    room = completed;
  }

  const viewer = new URL(req.url).searchParams.get('viewer');
  if (viewer) await store.touchPresence(id, viewer, now);
  const viewerCount = await store.presenceCount(id, now);

  return Response.json(publicRoom(room, now, viewerCount));
}
```

`app/api/rooms/[id]/start/route.ts`:

```ts
import { getStore } from '@/lib/store';
import { publicRoom, startRoom } from '@/lib/rooms';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const now = Date.now();
  const store = getStore();
  const room = await store.getRoom(id, now);
  if (!room) return Response.json({ error: 'room not found or expired' }, { status: 404 });
  if (req.headers.get('x-admin-token') !== room.adminToken) {
    return Response.json({ error: 'invalid admin token' }, { status: 403 });
  }
  const started = startRoom(room, now);
  if (started !== room) await store.putRoom(started);
  return Response.json(publicRoom(started, now, await store.presenceCount(id, now)));
}
```

`app/api/rooms/[id]/reset/route.ts`:

```ts
import { getStore } from '@/lib/store';
import { publicRoom, resetRoom } from '@/lib/rooms';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const now = Date.now();
  const store = getStore();
  const room = await store.getRoom(id, now);
  if (!room) return Response.json({ error: 'room not found or expired' }, { status: 404 });
  if (req.headers.get('x-admin-token') !== room.adminToken) {
    return Response.json({ error: 'invalid admin token' }, { status: 403 });
  }
  const reset = resetRoom(room);
  await store.putRoom(reset);
  return Response.json(publicRoom(reset, now, await store.presenceCount(id, now)));
}
```

- [ ] **Step 4: Run tests** → PASS. Also run `npm run build` → success.

- [ ] **Step 5: Commit**

```bash
git add lib/rooms.ts app/api tests/api.test.ts
git commit -m "feat: room lifecycle API (create/get/start/reset)"
```

---

### Task 9: Marketplace KV provisioning + Redis store adapter

**Files:**
- Modify: `lib/store.ts` (add Redis-backed implementation + env switch in `getStore`)
- Create: `.env.local` via `vercel env pull` (never committed)

**Interfaces:**
- Consumes: `RoomStore` interface from Task 7.
- Produces: `getStore()` returns the Redis-backed store when the provisioned env vars are present, memory store otherwise (dev/tests unchanged).

- [ ] **Step 1: Provision the store via Vercel Marketplace**

Load the `vercel:marketplace` skill and follow its discovery flow for a Redis-compatible KV store; link the project (`vercel link`) and install the integration it recommends. Then `vercel env pull .env.local`. **Adapt the env var names below to whatever the provisioned integration actually exposes** (commonly `KV_REST_API_URL`/`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`), and install the client SDK the integration documents (commonly `npm i @upstash/redis`).

- [ ] **Step 2: Add the Redis adapter**

Append to `lib/store.ts` and update `getStore` (adapter shown for an Upstash-style REST client; keep key layout exactly as shown):

```ts
import { Redis } from '@upstash/redis';
import { ROOM_TTL_MS, PRESENCE_WINDOW_MS } from './store'; // (same-file constants; shown for clarity)

class RedisStore implements RoomStore {
  constructor(private redis: Redis) {}

  async getRoom(id: string, _now: number): Promise<Room | null> {
    return ((await this.redis.get<Room>(`room:${id}`)) as Room | null) ?? null;
  }
  async putRoom(room: Room): Promise<void> {
    const ttlSec = Math.max(60, Math.ceil((room.createdAt + ROOM_TTL_MS - Date.now()) / 1000));
    await this.redis.set(`room:${room.id}`, room, { ex: ttlSec });
  }
  async touchPresence(roomId: string, viewerId: string, now: number): Promise<void> {
    await this.redis.hset(`presence:${roomId}`, { [viewerId]: now });
    await this.redis.expire(`presence:${roomId}`, 60);
  }
  async presenceCount(roomId: string, now: number): Promise<number> {
    const all = (await this.redis.hgetall<Record<string, number>>(`presence:${roomId}`)) ?? {};
    return Object.values(all).filter(ts => now - Number(ts) <= PRESENCE_WINDOW_MS).length;
  }
}

export function getStore(): RoomStore {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const g2 = globalThis as unknown as { __combineRedis?: RedisStore };
    g2.__combineRedis ??= new RedisStore(new Redis({ url, token }));
    return g2.__combineRedis;
  }
  g.__combineStore ??= new MemoryStore();
  return g.__combineStore;
}
```

(Vitest runs without these env vars, so all existing tests keep using MemoryStore.)

- [ ] **Step 3: Verify tests still pass** — `npm test` → PASS (memory path).

- [ ] **Step 4: Smoke-test the Redis path**

```bash
npm run dev -- --port 3123
# in another shell:
curl -s -X POST localhost:3123/api/rooms -H 'content-type: application/json' \
  -d '{"names":["A","B","C","D"]}'
# copy the id, then:
curl -s localhost:3123/api/rooms/<id>
```

Expected: 201 then 200 with `status: "lobby"`; confirm the key exists in the provider's dashboard.

- [ ] **Step 5: Commit**

```bash
git add lib/store.ts package.json package-lock.json
git commit -m "feat: marketplace KV-backed room store with env switch"
```

---

### Task 10: UI foundation — theme, Avatar, home page, setup page

**Files:**
- Modify: `app/globals.css`, `app/layout.tsx`, `app/page.tsx`
- Create: `components/Avatar.tsx`
- Create: `app/new/page.tsx` (client component)

**Interfaces:**
- Consumes: `POST /api/rooms`.
- Produces: `Avatar({ name, color, size? })` component used by all event renderers; `/new` stores the admin token in `localStorage` under key `combine-admin-<roomId>` and shows watch/control links.

Design intent for this and all UI tasks (execution should load the `frontend-design:frontend-design` skill): dark broadcast studio look — near-black background, one bold accent (amber/gold), condensed uppercase display type for lower-thirds, monospace for stats/timers. No generic centered-card AI look.

- [ ] **Step 1: Theme + layout**

`app/globals.css` — keep Tailwind import, set CSS vars and base:

```css
@import "tailwindcss";

:root {
  --bg: #0a0c10;
  --panel: #12161d;
  --line: #232a35;
  --accent: #f5a623;
  --text: #e8eaed;
  --muted: #8a93a3;
}
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}
.stat { font-family: var(--font-geist-mono), monospace; font-variant-numeric: tabular-nums; }
.display {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 800;
}
```

`app/layout.tsx` — keep scaffold fonts; set metadata:

```ts
export const metadata: Metadata = {
  title: 'Fantasy Draft Combine',
  description: 'A live, synchronized draft-order reveal your whole league watches together.',
};
```

- [ ] **Step 2: Avatar component**

`components/Avatar.tsx`:

```tsx
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export default function Avatar({ name, color, size = 48 }: { name: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={name}>
      {/* jersey */}
      <path d="M14 8 L20 4 H28 L34 8 L42 14 L37 21 L34 18 V44 H14 V18 L11 21 L6 14 Z"
        fill={color} stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      <text x="24" y="32" textAnchor="middle" fontSize="13" fontWeight="800"
        fill="#0a0c10" fontFamily="inherit">{initials(name)}</text>
    </svg>
  );
}
```

- [ ] **Step 3: Home page**

Replace `app/page.tsx`:

```tsx
import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 text-center">
      <p className="display text-sm text-[var(--accent)]">Live from the combine floor</p>
      <h1 className="display text-5xl leading-tight sm:text-6xl">Fantasy Draft Combine</h1>
      <p className="max-w-xl text-lg text-[var(--muted)]">
        Randomize your league&apos;s draft order with a live, synchronized broadcast:
        your managers&apos; athletes sprint, lift, and drop passes through an elimination
        gauntlet until two remain for the #1 pick. Provably fair. No accounts.
      </p>
      <Link href="/new"
        className="display rounded bg-[var(--accent)] px-8 py-4 text-lg text-black hover:brightness-110">
        Create a reveal room
      </Link>
    </main>
  );
}
```

- [ ] **Step 4: Setup page**

`app/new/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import Avatar from '@/components/Avatar';

const COLORS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
  '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000',
  '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080',
];

export default function NewRoom() {
  const [names, setNames] = useState<string[]>(['', '']);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; adminToken: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (i: number, v: string) => setNames(ns => ns.map((n, j) => (j === i ? v : n)));
  const remove = (i: number) => setNames(ns => ns.filter((_, j) => j !== i));

  async function create() {
    setBusy(true); setError(null);
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ names: names.map(n => n.trim()).filter(Boolean) }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { setError(body.error ?? 'something went wrong'); return; }
    localStorage.setItem(`combine-admin-${body.id}`, body.adminToken);
    setCreated({ id: body.id, adminToken: body.adminToken });
  }

  if (created) {
    const origin = window.location.origin;
    const watch = `${origin}/r/${created.id}`;
    const control = `${origin}/r/${created.id}/control?token=${created.adminToken}`;
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="display mb-8 text-3xl">Room created</h1>
        {[
          { label: 'Watch link — share with the league', url: watch },
          { label: 'Control link — keep this private', url: control },
        ].map(({ label, url }) => (
          <div key={url} className="mb-6 rounded border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="display mb-2 text-xs text-[var(--muted)]">{label}</p>
            <div className="flex items-center gap-3">
              <code className="stat flex-1 overflow-x-auto text-sm">{url}</code>
              <button onClick={() => navigator.clipboard.writeText(url)}
                className="rounded bg-[var(--accent)] px-3 py-1 text-sm font-bold text-black">Copy</button>
            </div>
          </div>
        ))}
        <a className="text-[var(--accent)] underline" href={control}>Go to your control room →</a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="display mb-2 text-3xl">Enter your managers</h1>
      <p className="mb-8 text-[var(--muted)]">2–20 team or manager names. Order here doesn&apos;t matter — the combine decides everything.</p>
      <ul className="mb-6 space-y-3">
        {names.map((n, i) => (
          <li key={i} className="flex items-center gap-3">
            <Avatar name={n || `M ${i + 1}`} color={COLORS[i % COLORS.length]} size={36} />
            <input value={n} onChange={e => set(i, e.target.value)} maxLength={24}
              placeholder={`Manager ${i + 1}`}
              className="flex-1 rounded border border-[var(--line)] bg-[var(--panel)] px-3 py-2 outline-none focus:border-[var(--accent)]" />
            {names.length > 2 && (
              <button onClick={() => remove(i)} aria-label={`remove manager ${i + 1}`}
                className="text-[var(--muted)] hover:text-red-400">✕</button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-4">
        <button onClick={() => setNames(ns => [...ns, ''])} disabled={names.length >= 20}
          className="rounded border border-[var(--line)] px-4 py-2 text-sm hover:border-[var(--accent)] disabled:opacity-40">
          + Add manager
        </button>
        <button onClick={create} disabled={busy || names.filter(n => n.trim()).length < 2}
          className="display rounded bg-[var(--accent)] px-6 py-2 text-black disabled:opacity-40">
          {busy ? 'Creating…' : 'Create room'}
        </button>
      </div>
      {error && <p className="mt-4 text-red-400">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 5: Manual verification**

Run `npm run dev -- --port 3123`. Check: home renders, `/new` adds/removes rows, creating with 4 names shows both links, bad input (1 name) shows the API error. Then `npm run build` → success.

- [ ] **Step 6: Commit**

```bash
git add app components
git commit -m "feat: broadcast theme, home page, and room setup flow"
```

---

### Task 11: Polling hook, watch page (lobby + results), draft board

**Files:**
- Create: `lib/useRoom.ts`
- Create: `components/DraftBoard.tsx`
- Create: `components/Lobby.tsx`
- Create: `components/FinalBoard.tsx`
- Create: `app/r/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/rooms/:id`, `PublicRoom` shape from Task 8, `lockedPicks` from Task 6.
- Produces:
  - `useRoom(id: string): { room: PublicRoom | null; error: string | null; now: () => number }` — polls every 2s (lobby) / 5s (revealing) / 15s (complete); `now()` is server-offset-corrected epoch ms.
  - `DraftBoard({ names, colors, locks, total })` where `locks: { pick: number; athlete: number }[]`.
  - `Broadcast` placeholder slot: this task renders lobby + final states; Task 12 fills the `revealing` state.

- [ ] **Step 1: Polling hook**

`lib/useRoom.ts`:

```ts
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicRoom } from '@/lib/rooms';

export function useRoom(id: string) {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const viewerRef = useRef<string>('');
  if (!viewerRef.current && typeof window !== 'undefined') {
    viewerRef.current = crypto.randomUUID();
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch(`/api/rooms/${id}?viewer=${viewerRef.current}`, { cache: 'no-store' });
        if (res.status === 404) { setError('This room doesn’t exist or has expired.'); return; }
        const body: PublicRoom = await res.json();
        offsetRef.current = body.serverNow - Date.now();
        setError(null);
        setRoom(body);
        if (stopped) return;
        const delay = body.status === 'lobby' ? 2000 : body.status === 'revealing' ? 5000 : 15000;
        timer = setTimeout(poll, delay);
      } catch {
        if (!stopped) timer = setTimeout(poll, 4000); // backoff-and-retry on blips
      }
    }
    poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [id]);

  const now = useCallback(() => Date.now() + offsetRef.current, []);
  return { room, error, now };
}
```

- [ ] **Step 2: DraftBoard**

`components/DraftBoard.tsx`:

```tsx
import Avatar from './Avatar';

export default function DraftBoard({ names, colors, locks, total }: {
  names: string[]; colors: string[];
  locks: { pick: number; athlete: number }[]; total: number;
}) {
  const byPick = new Map(locks.map(l => [l.pick, l.athlete]));
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: total }, (_, i) => {
        const pick = i + 1;
        const athlete = byPick.get(pick);
        return (
          <li key={pick}
            className={`flex items-center gap-2 rounded border px-3 py-2 ${
              athlete !== undefined
                ? 'border-[var(--accent)] bg-[var(--panel)]'
                : 'border-[var(--line)] bg-transparent opacity-60'}`}>
            <span className="stat w-8 text-right text-lg text-[var(--accent)]">{pick}</span>
            {athlete !== undefined ? (
              <>
                <Avatar name={names[athlete]} color={colors[athlete]} size={28} />
                <span className="truncate text-sm font-semibold">{names[athlete]}</span>
              </>
            ) : (
              <span className="text-sm text-[var(--muted)]">—</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 3: Lobby + FinalBoard**

`components/Lobby.tsx`:

```tsx
import Avatar from './Avatar';
import type { PublicRoom } from '@/lib/rooms';

export default function Lobby({ room }: { room: PublicRoom }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="display text-sm text-[var(--accent)]">Pre-game · {room.viewerCount} watching</p>
      <h1 className="display mb-6 text-4xl">Waiting for the commissioner…</h1>
      <ul className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {room.names.map((n, i) => (
          <li key={i} className="flex items-center gap-2 rounded border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
            <Avatar name={n} color={room.colors[i]} size={32} />
            <span className="truncate font-semibold">{n}</span>
          </li>
        ))}
      </ul>
      <div className="rounded border border-[var(--line)] p-4 text-sm text-[var(--muted)]">
        <p className="display mb-1 text-xs text-[var(--text)]">Fairness commitment</p>
        <p>The draft order is locked to a secret seed. Its fingerprint is published now,
          and the seed is revealed after the show so anyone can verify nothing was re-rolled.
          {room.resetCount > 0 && ` (Room has been reset ${room.resetCount}×.)`}</p>
        <code className="stat mt-2 block overflow-x-auto text-xs">{room.seedHash}</code>
      </div>
    </main>
  );
}
```

`components/FinalBoard.tsx`:

```tsx
'use client';
import DraftBoard from './DraftBoard';
import type { PublicRoom } from '@/lib/rooms';

export function resultsText(room: PublicRoom): string {
  const order = room.outcomes!.order;
  const lines = order.map((athlete, i) => `${i + 1}. ${room.names[athlete]}`);
  return [
    '🏈 Draft order — decided at the Fantasy Draft Combine',
    ...lines,
    `Fairness: seed ${room.seed} · sha256 → ${room.seedHash}`,
  ].join('\n');
}

export default function FinalBoard({ room }: { room: PublicRoom }) {
  const locks = room.outcomes!.order.map((athlete, i) => ({ pick: i + 1, athlete }));
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <p className="display text-sm text-[var(--accent)]">Final results</p>
      <h1 className="display mb-6 text-4xl">The draft order</h1>
      <DraftBoard names={room.names} colors={room.colors} locks={locks} total={room.names.length} />
      <button onClick={() => navigator.clipboard.writeText(resultsText(room))}
        className="display mt-6 rounded bg-[var(--accent)] px-6 py-3 text-black">
        Copy for the group chat
      </button>
      <div className="mt-8 rounded border border-[var(--line)] p-4 text-sm text-[var(--muted)]">
        <p className="display mb-1 text-xs text-[var(--text)]">Fairness verified</p>
        <p>Committed hash: <code className="stat">{room.seedHash}</code></p>
        <p>Revealed seed: <code className="stat">{room.seed}</code></p>
        <p className="mt-1">sha256(seed) must equal the hash shown in the lobby before the reveal.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Watch page shell**

`app/r/[id]/page.tsx`:

```tsx
'use client';
import { use } from 'react';
import { useRoom } from '@/lib/useRoom';
import Lobby from '@/components/Lobby';
import FinalBoard from '@/components/FinalBoard';
import Broadcast from '@/components/Broadcast';

export default function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { room, error, now } = useRoom(id);
  if (error) return <main className="grid min-h-screen place-items-center px-6"><p className="text-lg text-[var(--muted)]">{error}</p></main>;
  if (!room) return <main className="grid min-h-screen place-items-center"><p className="display text-[var(--muted)]">Tuning in…</p></main>;
  if (room.status === 'lobby') return <Lobby room={room} />;
  if (room.status === 'complete') return <FinalBoard room={room} />;
  return <Broadcast room={room} now={now} />;
}
```

For this task, create a placeholder `components/Broadcast.tsx` that Task 12 replaces — it must still compile and show live sync working:

```tsx
'use client';
import type { PublicRoom } from '@/lib/rooms';
import { lockedPicks } from '@/lib/timeline';
import { useEffect, useState } from 'react';
import DraftBoard from './DraftBoard';

export default function Broadcast({ room, now }: { room: PublicRoom; now: () => number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(x => x + 1), 250);
    return () => clearInterval(t);
  }, []);
  const elapsed = now() - (room.startTime ?? now());
  const locks = lockedPicks(room.outcomes!, elapsed);
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="display mb-6 text-3xl">Broadcast in progress…</h1>
      <DraftBoard names={room.names} colors={room.colors} locks={locks} total={room.names.length} />
    </main>
  );
}
```

- [ ] **Step 5: Manual verification**

`npm run dev -- --port 3123`. Create a room at `/new`, open the watch link in TWO browser windows; confirm both show the lobby with viewer count 2. Start the reveal via curl:

```bash
curl -s -X POST localhost:3123/api/rooms/<id>/start -H "x-admin-token: <token>"
```

Confirm both windows fill the draft board in lockstep (placeholder view), and flip to the final board with matching seed/hash at the end. `npm run build` → success.

- [ ] **Step 6: Commit**

```bash
git add app components lib/useRoom.ts
git commit -m "feat: watch page with synced polling, lobby, and final board"
```

---

### Task 12: Broadcast engine + race events (40, 3-cone, shuttle) + finale + confetti

**Files:**
- Create: `lib/race.ts`
- Replace: `components/Broadcast.tsx`
- Create: `components/events/LaneRace.tsx`
- Create: `components/Confetti.tsx`
- Test: `tests/race.test.ts`

**Interfaces:**
- Consumes: `stateAt`, `lockedPicks`, `runMs`, `EVENT_META`, `EventResult`, `PublicRoom`.
- Produces:
  - `finishTimesMs(ranking: number[], runDurationMs: number): Record<number, number>` — winner ≈ 60% of duration, last ≈ 95%.
  - `Broadcast({ room, now })` — full engine: score bug, event stage, persistent mini draft board, confetti on final lock.
  - `LaneRace({ event, names, colors, phase, phaseElapsedMs, phaseDurationMs, photoFinish })` — renders forty/threecone/shuttle/champ40.
  - Every event renderer added in Task 13 uses this same props shape: `{ event: EventResult; names: string[]; colors: string[]; phase: 'intro'|'run'|'results'; phaseElapsedMs: number; phaseDurationMs: number }`.

- [ ] **Step 1: Write the failing test for race math**

`tests/race.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { finishTimesMs } from '@/lib/race';

describe('finishTimesMs', () => {
  it('orders finishes by ranking within the run window', () => {
    const times = finishTimesMs([7, 2, 5], 10000);
    expect(times[7]).toBeLessThan(times[2]);
    expect(times[2]).toBeLessThan(times[5]);
    expect(times[7]).toBeCloseTo(6000, -2);
    expect(times[5]).toBeLessThanOrEqual(9500);
  });
  it('handles a single competitor', () => {
    expect(finishTimesMs([3], 8000)[3]).toBeCloseTo(4800, -2);
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement race math** — `lib/race.ts`:

```ts
export function finishTimesMs(ranking: number[], runDurationMs: number): Record<number, number> {
  const k = ranking.length;
  return Object.fromEntries(
    ranking.map((athlete, i) => [
      athlete,
      runDurationMs * (0.6 + (k <= 1 ? 0 : 0.35 * (i / (k - 1)))),
    ]),
  );
}
```

Run `npm test` → PASS.

- [ ] **Step 4: Confetti**

`components/Confetti.tsx` (UI sparkle — `Math.random` allowed here):

```tsx
'use client';
import { useMemo } from 'react';

export default function Confetti({ colors }: { colors: string[] }) {
  const pieces = useMemo(() =>
    Array.from({ length: 120 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 2.5 + Math.random() * 2,
      color: colors[i % colors.length],
      spin: Math.random() * 720 - 360,
    })), [colors]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span key={i}
          className="absolute top-[-2%] block h-3 w-2"
          style={{
            left: `${p.left}%`, background: p.color,
            animation: `confetti-fall ${p.duration}s linear ${p.delay}s forwards`,
            ['--spin' as string]: `${p.spin}deg`,
          }} />
      ))}
      <style>{`@keyframes confetti-fall {
        to { transform: translateY(110vh) rotate(var(--spin)); opacity: 0.9; }
      }`}</style>
    </div>
  );
}
```

- [ ] **Step 5: LaneRace renderer**

`components/events/LaneRace.tsx`:

```tsx
'use client';
import Avatar from '../Avatar';
import { finishTimesMs } from '@/lib/race';
import { EVENT_META, type EventResult } from '@/lib/types';

export interface EventStageProps {
  event: EventResult;
  names: string[];
  colors: string[];
  phase: 'intro' | 'run' | 'results';
  phaseElapsedMs: number;
  phaseDurationMs: number;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 2.2);

export default function LaneRace({ event, names, colors, phase, phaseElapsedMs, phaseDurationMs }: EventStageProps) {
  const meta = EVENT_META[event.type];
  const finishes = finishTimesMs(event.ranking, phaseDurationMs);
  const lanes = [...event.competitors].sort((a, b) => a - b);
  const isFinale = event.type === 'champ40';

  return (
    <section>
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="display text-2xl text-[var(--accent)]">{meta.label}</h2>
        {phase === 'run' && (
          <span className="stat text-xl">{(Math.min(phaseElapsedMs, phaseDurationMs) / 1000).toFixed(2)}s</span>
        )}
      </header>

      {phase === 'intro' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {lanes.map(a => (
            <div key={a} className="flex items-center gap-2 rounded border border-[var(--line)] bg-[var(--panel)] p-3">
              <Avatar name={names[a]} color={colors[a]} size={36} />
              <span className="truncate font-semibold">{names[a]}</span>
            </div>
          ))}
        </div>
      )}

      {phase !== 'intro' && (
        <div className="space-y-2">
          {lanes.map(a => {
            const t = phase === 'run' ? Math.min(1, phaseElapsedMs / finishes[a]) : 1;
            const pct = easeOut(t) * 92;
            const eliminated = phase === 'results' && event.eliminated.includes(a) && !isFinale;
            return (
              <div key={a} className={`relative h-12 rounded border border-[var(--line)] bg-[var(--panel)] ${eliminated ? 'opacity-50' : ''}`}>
                <div className="absolute right-2 top-0 h-full w-1 bg-[var(--accent)] opacity-60" />
                <div className="absolute top-1 transition-transform duration-100 ease-linear"
                  style={{ transform: `translateX(${pct}cqw)` } as React.CSSProperties}>
                  <Avatar name={names[a]} color={colors[a]} size={40} />
                </div>
                {phase === 'results' && (
                  <span className="stat absolute right-4 top-1/2 -translate-y-1/2 text-sm">
                    {event.performances[a].toFixed(EVENT_META[event.type].decimals)}{meta.unit}
                  </span>
                )}
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">{names[a]}</span>
              </div>
            );
          })}
        </div>
      )}

      {phase === 'results' && isFinale && (
        <p className="display mt-6 text-center text-3xl text-[var(--accent)]">
          🏆 {names[event.ranking[0]]} takes the #1 pick!
        </p>
      )}
    </section>
  );
}
```

Note: lane width uses container-query units; add `container-type: inline-size` via a wrapper class in Broadcast (Step 6) — the lane track div gets `style={{ containerType: 'inline-size' }}` on its parent. If `cqw` proves fiddly in execution, swap `translateX(${pct}cqw)` for `left: ${pct}%` with `position:absolute` — visual equivalence is fine.

- [ ] **Step 6: Broadcast engine**

Replace `components/Broadcast.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import type { PublicRoom } from '@/lib/rooms';
import { lockedPicks, stateAt } from '@/lib/timeline';
import { EVENT_META } from '@/lib/types';
import DraftBoard from './DraftBoard';
import Confetti from './Confetti';
import LaneRace, { type EventStageProps } from './events/LaneRace';

const RACE_TYPES = new Set(['forty', 'threecone', 'shuttle', 'champ40']);

function EventStage(props: EventStageProps) {
  if (RACE_TYPES.has(props.event.type)) return <LaneRace {...props} />;
  // Task 13 adds bench/vertical/broad/gauntlet renderers here.
  return <LaneRace {...props} />;
}

export default function Broadcast({ room, now }: { room: PublicRoom; now: () => number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(x => x + 1), 100);
    return () => clearInterval(t);
  }, []);

  const outcomes = room.outcomes!;
  const elapsed = now() - (room.startTime ?? now());
  const state = stateAt(outcomes, elapsed);
  const locks = lockedPicks(outcomes, elapsed);
  const allLocked = locks.length === room.names.length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8" style={{ containerType: 'inline-size' }}>
      <header className="mb-6 flex items-center justify-between border-b border-[var(--line)] pb-3">
        <span className="display text-sm text-[var(--accent)]">● Live · Fantasy Draft Combine</span>
        <span className="stat text-sm text-[var(--muted)]">
          {state.kind === 'event' ? EVENT_META[outcomes.events[state.eventIndex].type].label : 'Draft Board'}
        </span>
      </header>

      {state.kind === 'event' && (
        <EventStage
          event={outcomes.events[state.eventIndex]}
          names={room.names} colors={room.colors}
          phase={state.phase} phaseElapsedMs={state.phaseElapsedMs} phaseDurationMs={state.phaseDurationMs}
        />
      )}
      {state.kind !== 'event' && (
        <p className="display py-10 text-center text-2xl text-[var(--muted)]">
          {state.kind === 'pregame' ? 'On the clock…' : 'That’s a wrap!'}
        </p>
      )}

      <section className="mt-10">
        <h3 className="display mb-3 text-sm text-[var(--muted)]">Draft board</h3>
        <DraftBoard names={room.names} colors={room.colors} locks={locks} total={room.names.length} />
      </section>

      {allLocked && <Confetti colors={room.colors} />}
    </main>
  );
}
```

- [ ] **Step 7: Manual verification**

Create a 6-manager room, start it, watch in two windows: intro cards → animated race → results with stats → eliminations dim + picks lock on the board → finale → confetti; both windows within ~1s of each other. Refresh one window mid-race: it must resume at the correct moment. `npm test` and `npm run build` → PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/race.ts components tests/race.test.ts
git commit -m "feat: broadcast engine with lane races, finale, and confetti"
```

---

### Task 13: Bench, Vertical/Broad, Gauntlet renderers

**Files:**
- Create: `components/events/Bench.tsx`
- Create: `components/events/Measure.tsx`
- Create: `components/events/Gauntlet.tsx`
- Modify: `components/Broadcast.tsx` (EventStage switch)

**Interfaces:**
- Consumes: `EventStageProps` from Task 12 (identical props shape for all renderers).
- Produces: renderers for `bench`, `vertical`, `broad`, `gauntlet`.

- [ ] **Step 1: Bench** — `components/events/Bench.tsx`:

```tsx
'use client';
import Avatar from '../Avatar';
import { EVENT_META } from '@/lib/types';
import type { EventStageProps } from './LaneRace';

export default function Bench({ event, names, colors, phase, phaseElapsedMs, phaseDurationMs }: EventStageProps) {
  const lanes = [...event.competitors].sort((a, b) => a - b);
  return (
    <section>
      <h2 className="display mb-4 text-2xl text-[var(--accent)]">{EVENT_META.bench.label} · 225 lbs</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {lanes.map(a => {
          const finalReps = event.performances[a];
          // each athlete's counter climbs and stalls at their final rep count
          const progress = phase === 'intro' ? 0 : phase === 'results' ? 1
            : Math.min(1, phaseElapsedMs / (phaseDurationMs * (0.5 + 0.5 * (finalReps / 40))));
          const reps = Math.floor(finalReps * progress);
          const done = phase === 'results' || reps >= finalReps;
          const out = phase === 'results' && event.eliminated.includes(a);
          return (
            <div key={a} className={`rounded border border-[var(--line)] bg-[var(--panel)] p-3 text-center ${out ? 'opacity-50' : ''}`}>
              <Avatar name={names[a]} color={colors[a]} size={40} />
              <p className="mt-1 truncate text-sm font-semibold">{names[a]}</p>
              <p className={`stat text-3xl ${done ? '' : 'animate-pulse'}`}>{reps}</p>
              <p className="text-xs text-[var(--muted)]">{done ? 'RACKED' : 'lifting…'}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Measure (vertical + broad, sequential spotlight)** — `components/events/Measure.tsx`:

```tsx
'use client';
import Avatar from '../Avatar';
import { EVENT_META } from '@/lib/types';
import type { EventStageProps } from './LaneRace';

export default function Measure({ event, names, colors, phase, phaseElapsedMs }: EventStageProps) {
  const meta = EVENT_META[event.type];
  const perAthleteMs = 4000; // matches runMs() = 4000 * competitors
  const lanes = [...event.competitors].sort((a, b) => a - b);
  const activeIdx = phase === 'run' ? Math.min(lanes.length - 1, Math.floor(phaseElapsedMs / perAthleteMs)) : -1;
  const within = (phaseElapsedMs % perAthleteMs) / perAthleteMs;

  return (
    <section>
      <h2 className="display mb-4 text-2xl text-[var(--accent)]">{meta.label}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {lanes.map((a, i) => {
          const revealed = phase === 'results' || (phase === 'run' && (i < activeIdx || (i === activeIdx && within > 0.6)));
          const active = i === activeIdx;
          const out = phase === 'results' && event.eliminated.includes(a);
          return (
            <div key={a}
              className={`rounded border p-3 text-center transition-all ${
                active ? 'scale-105 border-[var(--accent)]' : 'border-[var(--line)]'} bg-[var(--panel)] ${out ? 'opacity-50' : ''}`}>
              <div style={active && within <= 0.6 ? { transform: `translateY(-${Math.sin(within / 0.6 * Math.PI) * 24}px)`, transition: 'transform 120ms' } : undefined}>
                <Avatar name={names[a]} color={colors[a]} size={40} />
              </div>
              <p className="mt-1 truncate text-sm font-semibold">{names[a]}</p>
              <p className="stat text-2xl">{revealed ? `${event.performances[a].toFixed(meta.decimals)}${meta.unit}` : '—'}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Gauntlet** — `components/events/Gauntlet.tsx`:

```tsx
'use client';
import Avatar from '../Avatar';
import { EVENT_META } from '@/lib/types';
import type { EventStageProps } from './LaneRace';

export default function Gauntlet({ event, names, colors, phase, phaseElapsedMs, phaseDurationMs }: EventStageProps) {
  const lanes = [...event.competitors].sort((a, b) => a - b);
  const BALLS = 7;
  const progress = phase === 'run' ? Math.min(1, phaseElapsedMs / phaseDurationMs) : phase === 'results' ? 1 : 0;
  const thrown = Math.floor(progress * BALLS);

  return (
    <section>
      <h2 className="display mb-4 text-2xl text-[var(--accent)]">{EVENT_META.gauntlet.label} · catch everything</h2>
      <div className="space-y-2">
        {lanes.map(a => {
          const drops = event.performances[a];
          const out = phase === 'results' && event.eliminated.includes(a);
          return (
            <div key={a} className={`flex items-center gap-3 rounded border border-[var(--line)] bg-[var(--panel)] px-3 py-2 ${out ? 'opacity-50' : ''}`}>
              <Avatar name={names[a]} color={colors[a]} size={36} />
              <span className="w-32 truncate text-sm font-semibold">{names[a]}</span>
              <span className="flex gap-1 text-lg">
                {Array.from({ length: thrown }, (_, b) => (
                  // last `drops` balls are the drops — deterministic, no rng needed
                  <span key={b}>{b >= BALLS - drops ? '❌' : '🏈'}</span>
                ))}
              </span>
              {phase === 'results' && (
                <span className="stat ml-auto text-sm">{drops}{EVENT_META.gauntlet.unit}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire into EventStage**

In `components/Broadcast.tsx` replace the `EventStage` function:

```tsx
import Bench from './events/Bench';
import Measure from './events/Measure';
import Gauntlet from './events/Gauntlet';

function EventStage(props: EventStageProps) {
  switch (props.event.type) {
    case 'bench': return <Bench {...props} />;
    case 'vertical':
    case 'broad': return <Measure {...props} />;
    case 'gauntlet': return <Gauntlet {...props} />;
    default: return <LaneRace {...props} />;
  }
}
```

- [ ] **Step 5: Manual verification across seeds**

Because the seed picks the lineup, create and run ~4 rooms (12 managers each) until all 7 pool events have been seen at least once. Verify each renderer animates, shows stats in results, dims eliminated athletes, and locks picks. `npm test` + `npm run build` → PASS.

- [ ] **Step 6: Commit**

```bash
git add components
git commit -m "feat: bench, vertical/broad, and gauntlet event renderers"
```

---

### Task 14: Commissioner control page

**Files:**
- Create: `app/r/[id]/control/page.tsx`

**Interfaces:**
- Consumes: `useRoom`, `POST start`/`reset` endpoints. Token from `?token=` query param, falling back to `localStorage['combine-admin-<id>']`.
- Produces: control page with Start/Reset, live status, and both share links.

- [ ] **Step 1: Implement**

`app/r/[id]/control/page.tsx`:

```tsx
'use client';
import { use, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRoom } from '@/lib/useRoom';

function Control({ id }: { id: string }) {
  const params = useSearchParams();
  const { room, error } = useRoom(id);
  const [token, setToken] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setToken(params.get('token') ?? localStorage.getItem(`combine-admin-${id}`));
  }, [params, id]);

  async function post(action: 'start' | 'reset') {
    setActionError(null);
    const res = await fetch(`/api/rooms/${id}/${action}`, {
      method: 'POST', headers: { 'x-admin-token': token ?? '' },
    });
    if (!res.ok) setActionError((await res.json()).error ?? 'request failed');
    setConfirmReset(false);
  }

  if (error) return <p className="p-10 text-[var(--muted)]">{error}</p>;
  if (!room || !token) return <p className="display p-10 text-[var(--muted)]">Loading control room…</p>;

  const watch = `${window.location.origin}/r/${id}`;
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="display text-sm text-[var(--accent)]">Control room · status: {room.status} · {room.viewerCount} watching</p>
      <h1 className="display mb-8 text-3xl">Commissioner controls</h1>

      {room.status === 'lobby' && (
        <button onClick={() => post('start')}
          className="display w-full rounded bg-[var(--accent)] py-6 text-2xl text-black hover:brightness-110">
          ▶ Start the reveal
        </button>
      )}
      {room.status !== 'lobby' && (
        <div className="rounded border border-[var(--line)] p-4">
          <p className="mb-3 text-[var(--muted)]">
            {room.status === 'revealing' ? 'Broadcast in progress — watch it on the watch link.' : 'Reveal complete.'}
          </p>
          {!confirmReset ? (
            <button onClick={() => setConfirmReset(true)} className="rounded border border-red-400 px-4 py-2 text-red-400">
              Reset room…
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-red-400">Throws away this result and re-commits a new seed. Everyone will see the reset.</span>
              <button onClick={() => post('reset')} className="rounded bg-red-500 px-4 py-2 font-bold text-black">Confirm reset</button>
              <button onClick={() => setConfirmReset(false)} className="text-[var(--muted)]">Cancel</button>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 rounded border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="display mb-2 text-xs text-[var(--muted)]">Watch link — share with the league</p>
        <div className="flex items-center gap-3">
          <code className="stat flex-1 overflow-x-auto text-sm">{watch}</code>
          <button onClick={() => navigator.clipboard.writeText(watch)}
            className="rounded bg-[var(--accent)] px-3 py-1 text-sm font-bold text-black">Copy</button>
        </div>
      </div>
      {actionError && <p className="mt-4 text-red-400">{actionError}</p>}
      <a className="mt-6 inline-block text-[var(--accent)] underline" href={watch} target="_blank">Open the broadcast →</a>
    </main>
  );
}

export default function ControlPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><Control id={id} /></Suspense>;
}
```

- [ ] **Step 2: Manual verification**

Full commissioner flow with no curl: `/new` → control room → Start → watch broadcast in another window → after completion, Reset (confirm step) → lobby again with new seed hash and `resetCount` visible in lobby copy. Wrong token in URL → start returns 403 error message on screen. `npm run build` → PASS.

- [ ] **Step 3: Commit**

```bash
git add app/r
git commit -m "feat: commissioner control page with start and guarded reset"
```

---

### Task 15: Sound, client-side fairness verify, polish

**Files:**
- Create: `lib/sound.ts`
- Modify: `components/Broadcast.tsx` (mute toggle + cues)
- Modify: `components/FinalBoard.tsx` (verify button)

**Interfaces:**
- Consumes: `BroadcastState` transitions.
- Produces: `sound.enable() / disable() / whistle() / horn() / lock()`; a `Verify` button that recomputes sha256(seed) in-browser via `crypto.subtle` and shows match/mismatch.

- [ ] **Step 1: Sound manager (WebAudio synth — no assets)**

`lib/sound.ts`:

```ts
'use client';

class SoundFx {
  enabled = false;
  private ctx: AudioContext | null = null;

  enable() { this.enabled = true; this.ctx ??= new AudioContext(); }
  disable() { this.enabled = false; }

  private tone(freq: number, durMs: number, type: OscillatorType, gainV = 0.08) {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(gainV, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + durMs / 1000);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(); osc.stop(this.ctx.currentTime + durMs / 1000);
  }
  whistle() { this.tone(2200, 350, 'square', 0.05); }
  horn()    { this.tone(220, 900, 'sawtooth', 0.1); this.tone(277, 900, 'sawtooth', 0.06); }
  lock()    { this.tone(880, 150, 'triangle', 0.09); }
}

export const sound = new SoundFx();
```

- [ ] **Step 2: Wire cues + mute toggle into Broadcast**

In `components/Broadcast.tsx`: add state `const [soundOn, setSoundOn] = useState(false)`; a header button `🔇/🔊` toggling `sound.enable()/disable()`; track previous `state`/`locks.length` in refs and fire `sound.whistle()` when a run phase begins, `sound.lock()` when `locks.length` increases, `sound.horn()` when all picks lock:

```tsx
const prevRef = useRef({ phaseKey: '', locks: 0 });
useEffect(() => {
  const phaseKey = state.kind === 'event' ? `${state.eventIndex}:${state.phase}` : state.kind;
  if (phaseKey !== prevRef.current.phaseKey && state.kind === 'event' && state.phase === 'run') sound.whistle();
  if (locks.length > prevRef.current.locks) sound.lock();
  if (locks.length === room.names.length && prevRef.current.locks < room.names.length) sound.horn();
  prevRef.current = { phaseKey, locks: locks.length };
});
```

Header button:

```tsx
<button onClick={() => { soundOn ? sound.disable() : sound.enable(); setSoundOn(!soundOn); }}
  aria-label="toggle sound" className="text-lg">{soundOn ? '🔊' : '🔇'}</button>
```

- [ ] **Step 3: Client-side verify button**

In `components/FinalBoard.tsx` add:

```tsx
const [verdict, setVerdict] = useState<string | null>(null);
async function verify() {
  const bytes = new TextEncoder().encode(room.seed!);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  setVerdict(hex === room.seedHash ? '✅ Verified: hash matches the pre-reveal commitment.' : '❌ MISMATCH — this should never happen.');
}
```

with a "Verify in your browser" button and `{verdict && <p className="mt-2">{verdict}</p>}` in the fairness panel.

- [ ] **Step 4: Manual verification**

Run a reveal with sound enabled in one window, muted in another (default). Whistle at each run start, tick per pick lock, horn + confetti at the end; no sound before opting in. Verify button shows ✅. `npm test` + `npm run build` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sound.ts components
git commit -m "feat: opt-in sound cues and in-browser fairness verification"
```

---

### Task 16: Deploy + two-browser sync verification

**Files:**
- None new (deployment).

- [ ] **Step 1: Deploy a preview**

Use the `vercel:deploy` skill (preview deployment). Confirm env vars for the KV store are present in the Vercel project (they were provisioned in Task 9; `vercel env ls`).

- [ ] **Step 2: End-to-end on the preview URL**

On the deployed URL: create a 10-manager room; open the watch link on two different devices/browsers (ideally one phone); start from the control page; verify both stay within ~1–2s through all events; join a third browser mid-reveal and confirm it lands at the correct moment; verify final board, copy button, seed verification.

- [ ] **Step 3: Fix anything found, commit, redeploy**

Any sync/layout bugs found on real devices get fixed and committed before calling this done.

- [ ] **Step 4: Production deploy (only if the user says go)**

`vercel:deploy` skill with "production" — ask the user first.

---

## Plan Self-Review Notes

- **Spec coverage:** create/lobby/reveal/results flows (Tasks 8, 10–14), 8 events incl. always-champ40 finale (5, 12, 13), seed commitment + reveal + client verify (2, 8, 15), scaling 2–20 (4, 5), sync/latecomers (6, 11, 12), presence count (7, 8, 11), TTL + 404 page copy (7, 8, 11), reset visibility (8, 11, 14), sound muted by default (15), marketplace KV (9), deploy + manual two-browser test (16). Copy-for-group-chat (11). ✓
- **Known simplification:** read-modify-write on start/reset has a benign race at this scale (idempotent start returns first-write state on the retry path); noted, accepted in spec's error-handling scope.
- **Type consistency:** all renderers share `EventStageProps` (defined once in LaneRace, Task 12); stores share `RoomStore` (Task 7); API payloads all flow through `publicRoom` (Task 8).
