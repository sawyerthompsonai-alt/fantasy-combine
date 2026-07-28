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
