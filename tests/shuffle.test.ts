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
