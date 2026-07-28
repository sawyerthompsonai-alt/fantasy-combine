import { describe, it, expect } from 'vitest';
import { deriveOutcomes } from '@/lib/outcomes';
import {
  buildTimeline, stateAt, lockedPicks,
  INTRO_MS, TURN_MS, RESULTS_MS, ELIMINATION_MS, GAP_MS,
  FINALE_RUN_MS, FINALE_RESULTS_MS,
  FINALE_PICK2_LOCK_OFFSET_MS, FINALE_PICK1_LOCK_OFFSET_MS,
  ELIMINATION_LOCK_OFFSET_MS,
} from '@/lib/timeline';

const names12 = Array.from({ length: 12 }, (_, i) => `T${i}`);
const outcomes = deriveOutcomes('tl-seed', names12);

describe('buildTimeline (pre-finale events)', () => {
  it('produces intro -> one turn per competitor (ascending lane order) -> results -> elimination -> gap, contiguous', () => {
    const { segments } = buildTimeline(outcomes);
    let cursor = 0;
    outcomes.events.forEach((e, i) => {
      if (e.type === 'champ40') return; // finale covered separately
      const eventSegs = segments.filter(s => s.eventIndex === i);
      const lanes = [...e.competitors].sort((a, b) => a - b);
      expect(eventSegs.length).toBe(3 + lanes.length); // intro + turns + results + elimination

      const intro = eventSegs[0];
      expect(intro).toMatchObject({ phase: 'intro', startMs: cursor });
      expect(intro.endMs - intro.startMs).toBe(INTRO_MS);
      cursor = intro.endMs;

      const turns = eventSegs.slice(1, 1 + lanes.length);
      turns.forEach((t, k) => {
        expect(t).toMatchObject({ phase: 'turn', startMs: cursor, turnIndex: k, athlete: lanes[k] });
        expect(t.endMs - t.startMs).toBe(TURN_MS);
        cursor = t.endMs;
      });

      const results = eventSegs[1 + lanes.length];
      expect(results).toMatchObject({ phase: 'results', startMs: cursor });
      expect(results.endMs - results.startMs).toBe(RESULTS_MS);
      cursor = results.endMs;

      const elimination = eventSegs[2 + lanes.length];
      expect(elimination).toMatchObject({ phase: 'elimination', startMs: cursor });
      expect(elimination.endMs - elimination.startMs).toBe(ELIMINATION_MS);
      cursor = elimination.endMs + GAP_MS; // gap before the next event's intro
    });
  });

  it('lane order is competitors sorted ascending by athlete index, not ranking order', () => {
    const { segments } = buildTimeline(outcomes);
    const event0Turns = segments.filter(s => s.eventIndex === 0 && s.phase === 'turn');
    const expectedLanes = [...outcomes.events[0].competitors].sort((a, b) => a - b);
    expect(event0Turns.map(t => t.athlete)).toEqual(expectedLanes);
    expect(event0Turns.map(t => t.turnIndex)).toEqual(expectedLanes.map((_, k) => k));
  });
});

describe('buildTimeline (finale)', () => {
  it('is intro -> run -> results with no per-athlete turns and no trailing gap', () => {
    const { segments, totalMs } = buildTimeline(outcomes);
    const finaleIndex = outcomes.events.length - 1;
    expect(outcomes.events[finaleIndex].type).toBe('champ40');
    const finaleSegs = segments.filter(s => s.eventIndex === finaleIndex);
    expect(finaleSegs.map(s => s.phase)).toEqual(['intro', 'run', 'results']);

    const [intro, run, results] = finaleSegs;
    expect(intro.endMs - intro.startMs).toBe(INTRO_MS);
    expect(run.startMs).toBe(intro.endMs);
    expect(run.endMs - run.startMs).toBe(FINALE_RUN_MS);
    expect(results.startMs).toBe(run.endMs);
    expect(results.endMs - results.startMs).toBe(FINALE_RESULTS_MS);
    // finale is the last event: timeline ends exactly at its results end, no gap
    expect(results.endMs).toBe(totalMs);
  });
});

describe('stateAt', () => {
  it('handles pregame, an athlete turn mid-phase, and post-end', () => {
    const { segments, totalMs } = buildTimeline(outcomes);
    expect(stateAt(outcomes, -50)).toEqual({ kind: 'pregame' });

    const turn0 = segments.find(s => s.eventIndex === 0 && s.phase === 'turn')!;
    const mid = stateAt(outcomes, turn0.startMs + 500);
    expect(mid).toMatchObject({
      kind: 'event', eventIndex: 0, phase: 'turn', phaseElapsedMs: 500,
      turnIndex: turn0.turnIndex, athlete: turn0.athlete,
    });

    expect(stateAt(outcomes, totalMs + 1)).toEqual({ kind: 'final' });
  });

  it('during a gap, state sticks to the previous event\'s elimination phase, clamped to its full duration', () => {
    const { segments } = buildTimeline(outcomes);
    const elimination0 = segments.find(s => s.eventIndex === 0 && s.phase === 'elimination')!;
    const gapState = stateAt(outcomes, elimination0.endMs + 10);
    expect(gapState).toMatchObject({
      kind: 'event', eventIndex: 0, phase: 'elimination',
      phaseElapsedMs: ELIMINATION_MS, phaseDurationMs: ELIMINATION_MS,
    });
  });

  it('turn state exposes no turnIndex/athlete for non-turn phases', () => {
    const { segments } = buildTimeline(outcomes);
    const results0 = segments.find(s => s.eventIndex === 0 && s.phase === 'results')!;
    const s = stateAt(outcomes, results0.startMs + 10);
    expect(s).toMatchObject({ phase: 'results' });
    if (s.kind === 'event') {
      expect(s.turnIndex).toBeUndefined();
      expect(s.athlete).toBeUndefined();
    }
  });
});

describe('lockedPicks (pre-finale elimination locks)', () => {
  it('starts empty and locks an event\'s pick(s) exactly at the elimination phase midpoint', () => {
    const { segments } = buildTimeline(outcomes);
    expect(lockedPicks(outcomes, 0)).toEqual([]);

    const elimination0 = segments.find(s => s.eventIndex === 0 && s.phase === 'elimination')!;
    const lockAt = elimination0.startMs + ELIMINATION_LOCK_OFFSET_MS;
    expect(lockedPicks(outcomes, lockAt - 1)).toEqual([]);
    const locked = lockedPicks(outcomes, lockAt);
    expect(locked.length).toBe(outcomes.events[0].picksLocked.length);
    expect(locked).toEqual(outcomes.events[0].picksLocked);
  });

  it('locks n..1 in order and completes at totalMs, including the finale offsets', () => {
    const { totalMs } = buildTimeline(outcomes);
    const all = lockedPicks(outcomes, totalMs);
    expect(all.map(l => l.pick)).toEqual(Array.from({ length: 12 }, (_, i) => 12 - i));
  });

  it('finale locks pick 2 at +1500 and pick 1 at +3500 into results', () => {
    const { segments } = buildTimeline(outcomes);
    const finaleIndex = outcomes.events.length - 1;
    const results = segments.find(s => s.eventIndex === finaleIndex && s.phase === 'results')!;
    const [pick2Entry, pick1Entry] = outcomes.events[finaleIndex].picksLocked;
    expect(pick2Entry.pick).toBe(2);
    expect(pick1Entry.pick).toBe(1);

    const beforeAny = lockedPicks(outcomes, results.startMs + FINALE_PICK2_LOCK_OFFSET_MS - 1);
    expect(beforeAny.find(l => l.pick === 2)).toBeUndefined();
    expect(beforeAny.find(l => l.pick === 1)).toBeUndefined();

    const afterPick2 = lockedPicks(outcomes, results.startMs + FINALE_PICK2_LOCK_OFFSET_MS);
    expect(afterPick2.find(l => l.pick === 2)).toEqual(pick2Entry);
    expect(afterPick2.find(l => l.pick === 1)).toBeUndefined();

    const afterPick1 = lockedPicks(outcomes, results.startMs + FINALE_PICK1_LOCK_OFFSET_MS);
    expect(afterPick1.find(l => l.pick === 1)).toEqual(pick1Entry);
  });

  it('a latecomer at time T sees exactly the picks locked by T', () => {
    const { segments } = buildTimeline(outcomes);
    const elimination1 = segments.find(s => s.eventIndex === 1 && s.phase === 'elimination')!;
    const t = elimination1.startMs + ELIMINATION_LOCK_OFFSET_MS + 10; // just after event 1's lock instant
    const locks = lockedPicks(outcomes, t);
    const batch0 = outcomes.events[0].picksLocked.length;
    const batch1 = outcomes.events[1].picksLocked.length;
    expect(locks.length).toBe(batch0 + batch1);
    // later events (and the finale) aren't reached yet
    outcomes.events.slice(2).forEach(e => {
      e.picksLocked.forEach(l => expect(locks).not.toContainEqual(l));
    });
  });
});

describe('totalMs scaling', () => {
  it('n=12 lands in the 5.5-8.5 minute target window', () => {
    const { totalMs } = buildTimeline(outcomes);
    expect(totalMs).toBeGreaterThanOrEqual(5.5 * 60 * 1000);
    expect(totalMs).toBeLessThanOrEqual(8.5 * 60 * 1000);
  });

  it('n=2 is finale-only: a single champ40 event, intro+run+results, no gap', () => {
    const outcomes2 = deriveOutcomes('tl-seed-2', ['A', 'B']);
    expect(outcomes2.events.length).toBe(1);
    expect(outcomes2.events[0].type).toBe('champ40');
    const { segments, totalMs } = buildTimeline(outcomes2);
    expect(segments.map(s => s.phase)).toEqual(['intro', 'run', 'results']);
    expect(totalMs).toBe(INTRO_MS + FINALE_RUN_MS + FINALE_RESULTS_MS);
  });

  it('n=20 caps at 12 total events (11 pre-finale + finale)', () => {
    const outcomes20 = deriveOutcomes('tl-seed-20', Array.from({ length: 20 }, (_, i) => `M${i}`));
    expect(outcomes20.events.length).toBe(12);
    expect(outcomes20.events[11].type).toBe('champ40');
    const { totalMs } = buildTimeline(outcomes20);
    expect(totalMs).toBeGreaterThan(0);
    // every pick 20..1 still locks exactly once, in descending order, by totalMs
    const all = lockedPicks(outcomes20, totalMs);
    expect(all.map(l => l.pick)).toEqual(Array.from({ length: 20 }, (_, i) => 20 - i));
  });
});
