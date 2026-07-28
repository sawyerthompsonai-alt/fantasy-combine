import { describe, it, expect } from 'vitest';
import { athleteBios, farewellLine, JOKE_POOLS } from '@/lib/jokes';

// The joke rule is G-rated ribbing about fantasy football habits, never
// about the real person beyond their name — a manager is identified by name
// only, so no pool entry may attach a gendered honorific or pronoun to
// whoever gets assigned it (a woman in the league could be handed a "Mr."
// nickname on the cold-open card otherwise). Deferred from Task 1, added
// here after Task 16's review caught 'Mr. Autodraft' / 'FAAB Daddy'.
const GENDERED = /\b(mr|mrs|ms|sir|madam|king|queen|bro|dude|guy|gal|man|woman|boy|girl|he|she|his|her|him|hers|guys|gentleman|lady)\b/i;

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

describe('joke pools are free of gendered honorifics and pronouns', () => {
  it('every entry in every pool passes', () => {
    Object.entries(JOKE_POOLS).forEach(([poolName, pool]) => {
      pool.forEach(entry => {
        expect(entry, `${poolName}: "${entry}"`).not.toMatch(GENDERED);
      });
    });
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
