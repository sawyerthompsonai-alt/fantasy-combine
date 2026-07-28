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
  return {
    type,
    competitors,
    ranking,
    performances,
    eliminated,
    picksLocked: eliminated.map(a => ({ pick: pickOf(a), athlete: a })),
  };
}

export function deriveOutcomes(seed: string, names: string[]): Outcomes {
  const n = names.length;
  const order = seededShuffle(names.map((_, i) => i), seed, 'order');
  const batches = eliminationBatches(n);
  const lineup = seededShuffle(POOL, seed, 'lineup').slice(0, batches.length);
  const events: EventResult[] = [];

  let alive = [...order]; // best pick first
  batches.forEach((k, e) => {
    const survivors = alive.slice(0, alive.length - k);
    const cut = alive.slice(alive.length - k);        // best pick first among cut
    const eliminated = [...cut].reverse();            // reveal worst pick first
    const rankedSurvivors = seededShuffle(survivors, seed, `event:${e}`);
    const ranking = [...rankedSurvivors, ...cut];     // last place = worst pick
    events.push(buildEvent(lineup[e], [...alive], ranking, eliminated, order, seed, e));
    alive = survivors;
  });

  // finale: alive === [order[0], order[1]]
  events.push(
    buildEvent('champ40', [...alive], [...alive], [alive[1], alive[0]], order, seed, batches.length)
  );

  return { order, events };
}
