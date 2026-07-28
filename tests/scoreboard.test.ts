import { describe, it, expect } from 'vitest';
import { deriveOutcomes } from '@/lib/outcomes';
import { buildTimeline, lockedPicks, ELIMINATION_LOCK_OFFSET_MS, STAT_REVEAL_FRACTION } from '@/lib/timeline';
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

  it('during elimination, every lane still has a mark', () => {
    const elimination0 = segments.find(s => s.eventIndex === 0 && s.phase === 'elimination')!;
    const sb = scoreboardAt(outcomes, elimination0.startMs + 10)!;
    expect(sb.entries.every(e => e.mark !== null)).toBe(true);
  });

  it('picksLocked increments after an elimination midpoint, and totalPicks is the full field', () => {
    const elimination0 = segments.find(s => s.eventIndex === 0 && s.phase === 'elimination')!;
    const lockAt = elimination0.startMs + ELIMINATION_LOCK_OFFSET_MS;
    const before = scoreboardAt(outcomes, lockAt - 1)!;
    const after = scoreboardAt(outcomes, lockAt)!;
    expect(after.picksLocked).toBe(before.picksLocked + lockedPicks(outcomes, lockAt).length - lockedPicks(outcomes, lockAt - 1).length);
    expect(after.picksLocked).toBe(lockedPicks(outcomes, lockAt).length);
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
