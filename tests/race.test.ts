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
