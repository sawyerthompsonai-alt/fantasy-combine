import { lockedPicks, stateAt, STAT_REVEAL_FRACTION } from './timeline';
import { EVENT_META, type Outcomes } from './types';

export interface ScoreboardData {
  eventIndex: number; label: string; round?: number;
  unit: string; decimals: number; lowerBetter: boolean;
  /** lane-ordered athletes with their mark if already posted this event */
  entries: { athlete: number; mark: number | null }[];
  /** entries with marks, sorted best→worst */
  board: { athlete: number; mark: number }[];
  remaining: number;       // athletes not yet eliminated before this event resolves
  picksLocked: number; totalPicks: number;
}

/**
 * Pure jumbotron selector: given the show's outcomes and an elapsed clock
 * reading, derives the persistent scoreboard state everyone in the room
 * sees identically. `null` while there's no live event to show a board for
 * (cold open, pregame, or after the finale). During a turn, marks post lane
 * by lane as each athlete's turn crosses STAT_REVEAL_FRACTION — matching
 * the per-scene countUpStat lock point so the jumbotron and the lower-third
 * "pop" together. The champ40 finale has no per-athlete turns (it's
 * simultaneous), so its `run` phase reveals all marks at once, at the same
 * reveal fraction, rather than lane by lane.
 */
export function scoreboardAt(outcomes: Outcomes, elapsedMs: number): ScoreboardData | null {
  const state = stateAt(outcomes, elapsedMs);
  if (state.kind !== 'event') return null;

  const event = outcomes.events[state.eventIndex];
  const meta = EVENT_META[event.type];
  const lanes = [...event.competitors].sort((a, b) => a - b);

  let posted: Set<number>;
  if (state.phase === 'intro') {
    posted = new Set();
  } else if (state.phase === 'turn') {
    const k = state.turnIndex ?? 0;
    const progress = state.phaseDurationMs > 0 ? state.phaseElapsedMs / state.phaseDurationMs : 1;
    const currentPosted = progress >= STAT_REVEAL_FRACTION;
    posted = new Set(lanes.slice(0, k));
    if (currentPosted) posted.add(lanes[k]);
  } else if (state.phase === 'run') {
    // Finale: simultaneous head-to-head, no per-athlete turns — all marks
    // post together once the race crosses the shared reveal fraction.
    const progress = state.phaseDurationMs > 0 ? state.phaseElapsedMs / state.phaseDurationMs : 1;
    posted = progress >= STAT_REVEAL_FRACTION ? new Set(lanes) : new Set();
  } else {
    // results / elimination: the event has already fully resolved.
    posted = new Set(lanes);
  }

  const entries = lanes.map(athlete => ({
    athlete,
    mark: posted.has(athlete) ? event.performances[athlete] : null,
  }));

  const board = entries
    .filter((e): e is { athlete: number; mark: number } => e.mark !== null)
    .sort((a, b) => (meta.lowerBetter ? a.mark - b.mark : b.mark - a.mark));

  return {
    eventIndex: state.eventIndex,
    label: meta.label,
    ...(event.round !== undefined ? { round: event.round } : {}),
    unit: meta.unit,
    decimals: meta.decimals,
    lowerBetter: meta.lowerBetter,
    entries,
    board,
    remaining: event.competitors.length,
    picksLocked: lockedPicks(outcomes, elapsedMs).length,
    totalPicks: outcomes.order.length,
  };
}

/** The current event's leading athlete, or `undefined` while there's no
 * live board yet (cold open, pregame, after the finale) or no mark has
 * posted this event yet. Thin convenience wrapper over `scoreboardAt` —
 * used both for the docked scoreboard's edge-triggered "NEW LEADER" sound
 * cue and (via `leaderChangedRecently` below) its purely elapsed-derived
 * visual flash. */
export function leaderAt(outcomes: Outcomes, elapsedMs: number): number | undefined {
  return scoreboardAt(outcomes, elapsedMs)?.board[0]?.athlete;
}

/** True exactly while the current event's leader differs from the leader
 * `windowMs` ago, *and* both instants actually have a leader — excluding
 * the "no leader -> first leader" transition (a turn's first mark posting,
 * or crossing into a fresh event's still-empty board), which is a leader
 * *appearing*, not *changing*. Pure function of (outcomes, elapsedMs) with
 * no stored state: a viewer who joins mid-window still derives the same
 * true/false a continuous viewer would at that instant, so the "NEW
 * LEADER" flash it drives reads correctly for late joiners and replays
 * alike. */
export function leaderChangedRecently(outcomes: Outcomes, elapsedMs: number, windowMs = 600): boolean {
  const now = leaderAt(outcomes, elapsedMs);
  const before = leaderAt(outcomes, elapsedMs - windowMs);
  return now !== undefined && before !== undefined && now !== before;
}
