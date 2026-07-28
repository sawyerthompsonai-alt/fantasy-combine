import { describe, it, expect } from 'vitest';
import { athleteBios, farewellLine } from '@/lib/jokes';

describe('athleteBios', () => {
  it('is deterministic: same seed → identical bios', () => {
    expect(athleteBios('seed-a', 12)).toEqual(athleteBios('seed-a', 12));
  });
  it('different seeds → different assignments', () => {
    const a = athleteBios('seed-a', 12).map(b => b.nickname);
    const b = athleteBios('seed-b', 12).map(b => b.nickname);
    expect(a).not.toEqual(b);
  });
  it('no duplicate nicknames or colleges within a room (max 20 managers)', () => {
    const bios = athleteBios('seed-a', 20);
    expect(new Set(bios.map(b => b.nickname)).size).toBe(20);
    expect(new Set(bios.map(b => b.college)).size).toBe(20);
  });
  it('every bio has exactly 3 measurables with label and value', () => {
    for (const b of athleteBios('x', 8)) {
      expect(b.measurables).toHaveLength(3);
      b.measurables.forEach(m => {
        expect(m.label).toBeTruthy();
        expect(m.value).toBeTruthy();
      });
    }
  });
});

describe('farewellLine', () => {
  it('is deterministic and includes the athlete name', () => {
    expect(farewellLine('s', 3, 'Casey')).toBe(farewellLine('s', 3, 'Casey'));
    expect(farewellLine('s', 3, 'Casey')).toContain('Casey');
  });
  it('adjacent athletes usually get different lines', () => {
    const lines = Array.from({ length: 12 }, (_, i) => farewellLine('s', i, `P${i}`));
    expect(new Set(lines.map(l => l.replace(/P\d+/g, 'X'))).size).toBeGreaterThan(4);
  });
});
