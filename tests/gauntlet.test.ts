import { describe, it, expect } from 'vitest';
import { eliminationBatches } from '@/lib/gauntlet';

describe('eliminationBatches', () => {
  it('handles spec examples', () => {
    expect(eliminationBatches(2)).toEqual([]);
    expect(eliminationBatches(3)).toEqual([1]);
    expect(eliminationBatches(4)).toEqual([1, 1]);
    expect(eliminationBatches(5)).toEqual([1, 1, 1]);
    expect(eliminationBatches(12)).toEqual(Array(10).fill(1));
    expect(eliminationBatches(20)).toEqual([2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1]);
  });

  it('sums to n-2 with at most 11 batches, non-increasing, for all n in 2..20', () => {
    for (let n = 2; n <= 20; n++) {
      const b = eliminationBatches(n);
      expect(b.reduce((s, x) => s + x, 0)).toBe(n - 2);
      expect(b.length).toBe(Math.min(11, n - 2));
      for (let i = 1; i < b.length; i++) expect(b[i]).toBeLessThanOrEqual(b[i - 1]);
    }
  });

  it('rejects out-of-range sizes', () => {
    expect(() => eliminationBatches(1)).toThrow();
    expect(() => eliminationBatches(21)).toThrow();
  });
});
