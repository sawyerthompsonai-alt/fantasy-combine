import type { Outcomes } from './types';

export type EventPhase = 'intro' | 'turn' | 'results' | 'elimination' | 'run';

export interface Segment {
  eventIndex: number;
  phase: EventPhase;
  startMs: number;
  endMs: number;
  turnIndex?: number;
  athlete?: number;
}

export type BroadcastState =
  | { kind: 'pregame' }
  | { kind: 'event'; eventIndex: number; phase: EventPhase;
      phaseElapsedMs: number; phaseDurationMs: number;
      turnIndex?: number; athlete?: number }
  | { kind: 'final' };

// Pacing constants (ms). Per pre-finale event: intro -> one turn per
// competitor (lane order, ascending athlete index) -> results -> elimination
// (that event's single pick locks at the midpoint) -> gap. The finale
// (champ40) is simultaneous head-to-head: intro -> run -> results, with pick
// 2 locking partway through results and pick 1 locking later in results.
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

export function buildTimeline(outcomes: Outcomes): { segments: Segment[]; totalMs: number } {
  const segments: Segment[] = [];
  let cursor = 0;
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
      cursor += GAP_MS;
    }
  });
  return { segments, totalMs: cursor };
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
  return {
    kind: 'event',
    eventIndex: current.eventIndex,
    phase: current.phase,
    phaseElapsedMs: Math.min(elapsedMs, current.endMs) - current.startMs,
    phaseDurationMs: current.endMs - current.startMs,
    ...(current.turnIndex !== undefined ? { turnIndex: current.turnIndex } : {}),
    ...(current.athlete !== undefined ? { athlete: current.athlete } : {}),
  };
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
