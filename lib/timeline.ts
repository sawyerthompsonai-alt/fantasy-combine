import type { Outcomes } from './types';

export type EventPhase = 'intro' | 'turn' | 'results' | 'elimination' | 'run';
export type OpenPhase = 'title' | 'walkup';

export interface Segment {
  eventIndex: number;
  phase: EventPhase | OpenPhase;
  startMs: number;
  endMs: number;
  turnIndex?: number;
  athlete?: number;
}

export type BroadcastState =
  | { kind: 'pregame' }
  | { kind: 'open'; phase: OpenPhase; athlete?: number; walkupIndex?: number;
      phaseElapsedMs: number; phaseDurationMs: number }
  | { kind: 'event'; eventIndex: number; phase: EventPhase;
      phaseElapsedMs: number; phaseDurationMs: number;
      turnIndex?: number; athlete?: number }
  | { kind: 'final' };

// Pacing constants (ms). Per pre-finale event: intro -> one turn per
// competitor (lane order, ascending athlete index) -> results -> elimination
// (that event's single pick locks at the midpoint) -> gap. The finale
// (champ40) is simultaneous head-to-head: intro -> run -> results, with pick
// 2 locking partway through results and pick 1 locking later in results.
export const TITLE_MS = 4000;
export const WALKUP_MS = 2500;
export const INTRO_MS = 3000;
export const TURN_MS = 4000;
export const RESULTS_MS = 4000;
export const ELIMINATION_MS = 4000;
export const GAP_MS = 1500;
export const FINALE_RUN_MS = 12000;
export const FINALE_RESULTS_MS = 6000;
export const FINALE_PICK2_LOCK_OFFSET_MS = 1500;
export const FINALE_PICK1_LOCK_OFFSET_MS = 3500;
export const ELIMINATION_LOCK_OFFSET_MS = ELIMINATION_MS / 2;

/** Fraction of a turn's progress at which the final stat locks in and the
 * lower-third stops "counting" and shows the true result, bold. Shared by
 * every per-event scene (and the scoreboard selector) so the broadcast
 * rhythm (running number -> hard lock) reads consistently across event
 * types. Lives in lib/ (not components/scene/turnChoreo.ts, which
 * re-exports it) because lib/scoreboard.ts needs it and lib/ must not
 * import from components/. */
export const STAT_REVEAL_FRACTION = 0.7;

export function buildTimeline(
  outcomes: Outcomes
): { segments: Segment[]; totalMs: number; gaps: { startMs: number; endMs: number }[] } {
  const segments: Segment[] = [];
  const gaps: { startMs: number; endMs: number }[] = [];
  let cursor = 0;

  // Cold open: title card, then one walk-up per manager in athlete-index
  // order (0..n-1) — NOT outcomes.order, which is the show's secret draft
  // order and must not leak here.
  segments.push({ eventIndex: -1, phase: 'title', startMs: cursor, endMs: cursor + TITLE_MS });
  cursor += TITLE_MS;
  outcomes.order.forEach((_, i) => {
    segments.push({ eventIndex: -1, phase: 'walkup', startMs: cursor, endMs: cursor + WALKUP_MS, athlete: i, turnIndex: i });
    cursor += WALKUP_MS;
  });
  gaps.push({ startMs: cursor, endMs: cursor + GAP_MS });
  cursor += GAP_MS;

  outcomes.events.forEach((e, i) => {
    const push = (phase: EventPhase, dur: number, extra?: { turnIndex: number; athlete: number }) => {
      segments.push({ eventIndex: i, phase, startMs: cursor, endMs: cursor + dur, ...extra });
      cursor += dur;
    };
    if (e.type === 'champ40') {
      // Finale: simultaneous head-to-head, no per-athlete turns and no
      // trailing gap (it's always the last event).
      push('intro', INTRO_MS);
      push('run', FINALE_RUN_MS);
      push('results', FINALE_RESULTS_MS);
    } else {
      push('intro', INTRO_MS);
      const lanes = [...e.competitors].sort((a, b) => a - b);
      lanes.forEach((athlete, turnIndex) => push('turn', TURN_MS, { turnIndex, athlete }));
      push('results', RESULTS_MS);
      push('elimination', ELIMINATION_MS);
      gaps.push({ startMs: cursor, endMs: cursor + GAP_MS });
      cursor += GAP_MS;
    }
  });
  return { segments, totalMs: cursor, gaps };
}

// A gap between events isn't its own segment: once elapsedMs passes an
// event's last segment (elimination) and hasn't yet reached the next
// event's intro, `current` in the loop below stays pinned to that last
// segment, and phaseElapsedMs is clamped to phaseDurationMs. So a gap
// renders as "stuck" on the tail end of the previous phase rather than a
// distinct neutral state — documented and covered by a stateAt test below.
export function stateAt(outcomes: Outcomes, elapsedMs: number): BroadcastState {
  if (elapsedMs < 0) return { kind: 'pregame' };
  const { segments, totalMs } = buildTimeline(outcomes);
  if (elapsedMs > totalMs) return { kind: 'final' };
  let current: Segment = segments[0];
  for (const s of segments) {
    if (elapsedMs >= s.startMs) current = s;
    else break;
  }
  if (current.eventIndex === -1) {
    return {
      kind: 'open',
      phase: current.phase as OpenPhase,
      phaseElapsedMs: Math.min(elapsedMs, current.endMs) - current.startMs,
      phaseDurationMs: current.endMs - current.startMs,
      ...(current.athlete !== undefined ? { athlete: current.athlete } : {}),
      ...(current.turnIndex !== undefined ? { walkupIndex: current.turnIndex } : {}),
    };
  }
  return {
    kind: 'event',
    eventIndex: current.eventIndex,
    phase: current.phase as EventPhase,
    phaseElapsedMs: Math.min(elapsedMs, current.endMs) - current.startMs,
    phaseDurationMs: current.endMs - current.startMs,
    ...(current.turnIndex !== undefined ? { turnIndex: current.turnIndex } : {}),
    ...(current.athlete !== undefined ? { athlete: current.athlete } : {}),
  };
}

/** Duration (ms) of the broadcast wipe that plays across every inter-block
 * gap (see `buildTimeline`'s `gaps`) — the diagonal band in
 * `components/scene/WipeOverlay.tsx`. */
export const WIPE_MS = 1200;

/**
 * Non-null while `elapsedMs` sits inside a wipe window: one window per gap,
 * straddling that gap's END (i.e. the next block's start) so the wipe is
 * fully covering the viewport exactly at the segment boundary — the old
 * scene wipes out on the way in, the new scene is already underneath and
 * wipes into view on the way out. `t` runs 0 (window open) -> 0.5 (exactly
 * at the boundary) -> 1 (window closed), a pure function of
 * (outcomes, elapsedMs) so a late joiner who lands mid-wipe sees the
 * correct sweep position, not a replayed animation. `null` outside every
 * window (the overwhelmingly common case — windows are WIPE_MS wide against
 * gaps/events that run for seconds).
 */
export function transitionAt(outcomes: Outcomes, elapsedMs: number): { t: number } | null {
  const { gaps } = buildTimeline(outcomes);
  for (const g of gaps) {
    const start = g.endMs - WIPE_MS / 2;
    const end = g.endMs + WIPE_MS / 2;
    if (elapsedMs >= start && elapsedMs <= end) {
      return { t: (elapsedMs - start) / WIPE_MS };
    }
  }
  return null;
}

export function lockedPicks(outcomes: Outcomes, elapsedMs: number): { pick: number; athlete: number }[] {
  const { segments } = buildTimeline(outcomes);
  const locks: { pick: number; athlete: number }[] = [];
  outcomes.events.forEach((e, i) => {
    if (e.type === 'champ40') {
      const results = segments.find(s => s.eventIndex === i && s.phase === 'results')!;
      const offsets = [FINALE_PICK2_LOCK_OFFSET_MS, FINALE_PICK1_LOCK_OFFSET_MS];
      e.picksLocked.forEach((lock, k) => {
        if (elapsedMs >= results.startMs + offsets[k]) locks.push(lock);
      });
    } else {
      const elimination = segments.find(s => s.eventIndex === i && s.phase === 'elimination')!;
      const lockAt = elimination.startMs + ELIMINATION_LOCK_OFFSET_MS;
      e.picksLocked.forEach(lock => {
        if (elapsedMs >= lockAt) locks.push(lock);
      });
    }
  });
  return locks;
}
