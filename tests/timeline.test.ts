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
    // number of picks that lock within event 1's own results phase by time t
    const k = Math.min(2, outcomes.events[1].picksLocked.length);
    const t = results1.startMs + k * LOCK_MS + 10;
    const locks = lockedPicks(outcomes, t);
    const batch0 = outcomes.events[0].picksLocked.length;
    expect(locks.length).toBe(batch0 + k);
  });
});
