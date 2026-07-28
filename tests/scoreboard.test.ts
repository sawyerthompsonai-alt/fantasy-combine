import { describe, it, expect } from 'vitest';
import { deriveOutcomes } from '@/lib/outcomes';
import { buildTimeline, ELIMINATION_LOCK_OFFSET_MS, STAT_REVEAL_FRACTION } from '@/lib/timeline';
import { EVENT_META } from '@/lib/types';
import { scoreboardAt } from '@/lib/scoreboard';

const names12 = Array.from({ length: 12 }, (_, i) => `T${i}`);
const outcomes = deriveOutcomes('sb-seed', names12);
const { segments } = buildTimeline(outcomes);

describe('scoreboardAt', () => {
  it('is null before the show starts and throughout the cold open', () => {
    expect(scoreboardAt(outcomes, -50)).toBeNull();
    expect(scoreboardAt(outcomes, 0)).toBeNull();
    const firstIntro = segments.find(s => s.eventIndex === 0 && s.phase === 'intro')!;
    expect(scoreboardAt(outcomes, firstIntro.startMs - 10)).toBeNull();
  });

  it('is null once the show is over (kind final)', () => {
    const { totalMs } = buildTimeline(outcomes);
    expect(scoreboardAt(outcomes, totalMs + 1)).toBeNull();
  });

  it('has an empty board during intro, with all lanes unmarked', () => {
    const intro = segments.find(s => s.eventIndex === 0 && s.phase === 'intro')!;
    const sb = scoreboardAt(outcomes, intro.startMs + 10)!;
    expect(sb).not.toBeNull();
    expect(sb.eventIndex).toBe(0);
    expect(sb.label).toBe(EVENT_META[outcomes.events[0].type].label);
    expect(sb.board).toEqual([]);
    expect(sb.entries.every(e => e.mark === null)).toBe(true);
    const lanes = [...outcomes.events[0].competitors].sort((a, b) => a - b);
    expect(sb.entries.map(e => e.athlete)).toEqual(lanes);
  });

  it('after turn 0 ends, exactly lane 0 has a posted mark', () => {
    const turn0 = segments.find(s => s.eventIndex === 0 && s.phase === 'turn' && s.turnIndex === 0)!;
    const sb = scoreboardAt(outcomes, turn0.endMs)!;
    const marked = sb.entries.filter(e => e.mark !== null);
    expect(marked.length).toBe(1);
    expect(marked[0].athlete).toBe(turn0.athlete);
    expect(sb.board.length).toBe(1);
    expect(sb.board[0].athlete).toBe(turn0.athlete);
  });

  it('mid-turn-1, before the reveal fraction the lane has no mark yet; after, it does', () => {
    const turn1 = segments.find(s => s.eventIndex === 0 && s.phase === 'turn' && s.turnIndex === 1)!;
    const dur = turn1.endMs - turn1.startMs;
    const before = scoreboardAt(outcomes, turn1.startMs + Math.floor(dur * STAT_REVEAL_FRACTION) - 5)!;
    expect(before.entries.filter(e => e.mark !== null).length).toBe(1);

    const after = scoreboardAt(outcomes, turn1.startMs + Math.ceil(dur * STAT_REVEAL_FRACTION) + 5)!;
    expect(after.entries.filter(e => e.mark !== null).length).toBe(2);
    expect(after.entries.find(e => e.athlete === turn1.athlete)?.mark).not.toBeNull();
  });

  it('at the exact boundary elapsed where progress === STAT_REVEAL_FRACTION, the mark IS already posted (>= is inclusive)', () => {
    const turn1 = segments.find(s => s.eventIndex === 0 && s.phase === 'turn' && s.turnIndex === 1)!;
    const dur = turn1.endMs - turn1.startMs;
    // dur (TURN_MS = 4000) * STAT_REVEAL_FRACTION (0.7) === 2800 exactly in
    // IEEE754 (verified: (dur*0.7)/dur === 0.7), so this elapsed instant
    // hits progress === STAT_REVEAL_FRACTION on the nose — no ±ms fuzz —
    // which would catch a `>` vs `>=` regression that ±5ms fuzzing can't.
    const exactBoundary = turn1.startMs + dur * STAT_REVEAL_FRACTION;
    const atBoundary = scoreboardAt(outcomes, exactBoundary)!;
    expect(atBoundary.entries.find(e => e.athlete === turn1.athlete)?.mark).not.toBeNull();
  });

  it('during results, every lane has a mark and the board is sorted respecting lowerBetter', () => {
    const results0 = segments.find(s => s.eventIndex === 0 && s.phase === 'results')!;
    const sb = scoreboardAt(outcomes, results0.startMs + 10)!;
    const event0 = outcomes.events[0];
    const lanes = [...event0.competitors].sort((a, b) => a - b);
    expect(sb.entries.every(e => e.mark !== null)).toBe(true);
    expect(sb.board.length).toBe(lanes.length);

    const meta = EVENT_META[event0.type];
    for (let i = 1; i < sb.board.length; i++) {
      const prev = sb.board[i - 1].mark;
      const cur = sb.board[i].mark;
      if (meta.lowerBetter) expect(prev).toBeLessThanOrEqual(cur);
      else expect(prev).toBeGreaterThanOrEqual(cur);
    }
  });

  it('board sorts descending (best→worst) for a higher-is-better event — the ascending branch is covered above, but seed \'sb-seed\' happens to open on \'shuttle\' (lowerBetter), so nothing else in this suite ever exercises the b.mark - a.mark descending comparator', () => {
    // Search rather than hardcode the index, so this stays correct if the
    // seed/lineup ever changes — but fail loudly (not skip) if no such
    // event exists, so the assertion below always actually runs. For
    // seed 'sb-seed' with 12 managers this is event index 2 ('broad').
    const idx = outcomes.events.findIndex(e => EVENT_META[e.type].lowerBetter === false);
    expect(idx).toBeGreaterThanOrEqual(0);
    const event = outcomes.events[idx];
    expect(EVENT_META[event.type].lowerBetter).toBe(false);

    const results = segments.find(s => s.eventIndex === idx && s.phase === 'results')!;
    const sb = scoreboardAt(outcomes, results.startMs + 10)!;
    const lanes = [...event.competitors].sort((a, b) => a - b);
    expect(sb.board.length).toBe(lanes.length);

    for (let i = 1; i < sb.board.length; i++) {
      expect(sb.board[i - 1].mark).toBeGreaterThanOrEqual(sb.board[i].mark);
    }
    const maxMark = Math.max(...lanes.map(a => event.performances[a]));
    const maxAthlete = lanes.find(a => event.performances[a] === maxMark)!;
    expect(sb.board[0].mark).toBe(maxMark);
    expect(sb.board[0].athlete).toBe(maxAthlete);
  });

  it('during elimination, every lane still has a mark', () => {
    const elimination0 = segments.find(s => s.eventIndex === 0 && s.phase === 'elimination')!;
    const sb = scoreboardAt(outcomes, elimination0.startMs + 10)!;
    expect(sb.entries.every(e => e.mark !== null)).toBe(true);
  });

  it('picksLocked jumps from 0 to this event\'s cut count exactly at the elimination lock instant, and totalPicks is the full field', () => {
    const elimination0 = segments.find(s => s.eventIndex === 0 && s.phase === 'elimination')!;
    const lockAt = elimination0.startMs + ELIMINATION_LOCK_OFFSET_MS;
    const before = scoreboardAt(outcomes, lockAt - 1)!;
    const after = scoreboardAt(outcomes, lockAt)!;
    // Concrete before/after values (not just a restatement of lockedPicks'
    // own length) — this is the very first lock of the show, so it's an
    // actual 0 -> N transition, not just "some number >= some other number".
    expect(before.picksLocked).toBe(0);
    expect(after.picksLocked).toBe(outcomes.events[0].picksLocked.length);
    expect(after.picksLocked).toBeGreaterThan(before.picksLocked);
    expect(before.totalPicks).toBe(names12.length);
    expect(after.totalPicks).toBe(names12.length);
  });

  it('remaining equals the competitor count for that event', () => {
    const results1 = segments.find(s => s.eventIndex === 1 && s.phase === 'results')!;
    const sb = scoreboardAt(outcomes, results1.startMs + 10)!;
    expect(sb.remaining).toBe(outcomes.events[1].competitors.length);
  });

  it('the finale run phase reveals no marks before the reveal fraction, then both after', () => {
    const finaleIndex = outcomes.events.length - 1;
    const run = segments.find(s => s.eventIndex === finaleIndex && s.phase === 'run')!;
    const dur = run.endMs - run.startMs;
    const before = scoreboardAt(outcomes, run.startMs + Math.floor(dur * STAT_REVEAL_FRACTION) - 5)!;
    expect(before.entries.every(e => e.mark === null)).toBe(true);
    const after = scoreboardAt(outcomes, run.startMs + Math.ceil(dur * STAT_REVEAL_FRACTION) + 50)!;
    expect(after.entries.every(e => e.mark !== null)).toBe(true);
  });
});
