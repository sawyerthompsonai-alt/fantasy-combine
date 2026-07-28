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
