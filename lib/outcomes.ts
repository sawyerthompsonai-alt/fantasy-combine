import { seededShuffle } from './shuffle';
import { eliminationBatches } from './gauntlet';
import { createRng } from './rng';
import type { EventResult, EventType, Outcomes } from './types';
import { EVENT_META } from './types';

const POOL: EventType[] = ['forty', 'bench', 'vertical', 'threecone', 'shuttle', 'gauntlet', 'broad'];

const STAT_BASE: Record<EventType, { base: number; step: number }> = {
  forty:     { base: 4.31, step: 0.08 },
  champ40:   { base: 4.28, step: 0.06 },
  threecone: { base: 6.68, step: 0.12 },
  shuttle:   { base: 3.98, step: 0.1 },
  bench:     { base: 34,   step: -2 },
  vertical:  { base: 43.5, step: -1.5 },
  broad:     { base: 141,  step: -3 },
  gauntlet:  { base: 0,    step: 1 },
};

function buildEvent(
  type: EventType,
  competitors: number[],
  ranking: number[],
  eliminated: number[],            // worst pick first (reveal order)
  order: number[],
  seed: string,
  eventIndex: number,
  round?: number,
): EventResult {
  const rng = createRng(`${seed}:perf:${eventIndex}`);
  const { base, step } = STAT_BASE[type];
  const { decimals, lowerBetter } = EVENT_META[type];
  const performances: Record<number, number> = {};
  ranking.forEach((athlete, i) => {
    // jitter < 0.5*|step| in the "worse" direction keeps ordering strict
    const jitter = decimals > 0 ? rng() * 0.4 * Math.abs(step) * (lowerBetter ? 1 : -1) : 0;
    const raw = base + step * i + jitter;
    // count-like stats must stay physically plausible regardless of room size:
    // bench reps can't go negative, and gauntlet drops can't exceed the balls thrown.
    const clamped =
      type === 'bench' ? Math.max(raw, 1) :
      type === 'gauntlet' ? Math.min(raw, 7) :
      raw;
    performances[athlete] = Number(clamped.toFixed(decimals));
  });
  const pickOf = (athlete: number) => order.indexOf(athlete) + 1;
  const event: EventResult = {
    type,
    competitors,
    ranking,
    performances,
    eliminated,
    picksLocked: eliminated.map(a => ({ pick: pickOf(a), athlete: a })),
  };
  if (round !== undefined) event.round = round;
  return event;
}

// Builds a length-P lineup by cycling the 7-type pool: each cycle is an
// independent seeded shuffle of the full pool, so types repeat only once
// every 7 events. The seam between cycles is checked so a type never
// immediately repeats back-to-back.
function buildLineup(seed: string, p: number): EventType[] {
  const lineup: EventType[] = [];
  let cycle = 0;
  while (lineup.length < p) {
    let shuffled = seededShuffle(POOL, seed, `lineup:${cycle}`);
    const prev = lineup[lineup.length - 1];
    if (prev !== undefined && shuffled[0] === prev) {
      // rotate left by one: guaranteed to differ from prev since prev
      // appears exactly once in the permutation.
      shuffled = [...shuffled.slice(1), shuffled[0]];
    }
    lineup.push(...shuffled);
    cycle += 1;
  }
  return lineup.slice(0, p);
}

// Parallel to a lineup: undefined for a type's first appearance, otherwise
// the 1-indexed count of how many times that type has appeared so far.
function computeRounds(lineup: EventType[]): (number | undefined)[] {
  const counts: Partial<Record<EventType, number>> = {};
  return lineup.map(type => {
    const count = (counts[type] ?? 0) + 1;
    counts[type] = count;
    return count >= 2 ? count : undefined;
  });
}

export function deriveOutcomes(seed: string, names: string[]): Outcomes {
  const n = names.length;
  const order = seededShuffle(names.map((_, i) => i), seed, 'order');
  const batches = eliminationBatches(n);
  const p = batches.length;
  const lineup = buildLineup(seed, p);
  const rounds = computeRounds(lineup);
  const events: EventResult[] = [];

  let alive = [...order]; // best pick first
  batches.forEach((k, e) => {
    const survivors = alive.slice(0, alive.length - k);
    const cut = alive.slice(alive.length - k);        // best pick first among cut
    const eliminated = [...cut].reverse();            // reveal worst pick first
    const rankedSurvivors = seededShuffle(survivors, seed, `event:${e}`);
    const ranking = [...rankedSurvivors, ...cut];     // last place = worst pick
    events.push(buildEvent(lineup[e], [...alive], ranking, eliminated, order, seed, e, rounds[e]));
    alive = survivors;
  });

  // finale: alive === [order[0], order[1]]
  events.push(
    buildEvent('champ40', [...alive], [...alive], [alive[1], alive[0]], order, seed, batches.length)
  );

  return { order, events };
}
