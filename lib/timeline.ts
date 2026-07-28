import type { EventType, Outcomes } from './types';

export interface Segment {
  eventIndex: number;
  phase: 'intro' | 'run' | 'results';
  startMs: number;
  endMs: number;
}

export type BroadcastState =
  | { kind: 'pregame' }
  | { kind: 'event'; eventIndex: number; phase: Segment['phase'];
      phaseElapsedMs: number; phaseDurationMs: number }
  | { kind: 'final' };

export const INTRO_MS = 4000;
export const GAP_MS = 1200;
export const LOCK_MS = 1600;
export const RESULTS_BASE_MS = 3000;

export function runMs(type: EventType, competitorCount: number): number {
  switch (type) {
    case 'forty': return 11000;
    case 'champ40': return 14000;
    case 'threecone': return 12000;
    case 'shuttle': return 10000;
    case 'bench': return 16000;
    case 'gauntlet': return 13000;
    case 'vertical':
    case 'broad': return 4000 * competitorCount;
  }
}

export function buildTimeline(outcomes: Outcomes): { segments: Segment[]; totalMs: number } {
  const segments: Segment[] = [];
  let cursor = 0;
  outcomes.events.forEach((e, i) => {
    const push = (phase: Segment['phase'], dur: number) => {
      segments.push({ eventIndex: i, phase, startMs: cursor, endMs: cursor + dur });
      cursor += dur;
    };
    push('intro', INTRO_MS);
    push('run', runMs(e.type, e.competitors.length));
    push('results', RESULTS_BASE_MS + LOCK_MS * e.picksLocked.length);
    cursor += GAP_MS;
  });
  return { segments, totalMs: cursor - GAP_MS };
}

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
  };
}

export function lockedPicks(outcomes: Outcomes, elapsedMs: number): { pick: number; athlete: number }[] {
  const { segments } = buildTimeline(outcomes);
  const locks: { pick: number; athlete: number }[] = [];
  outcomes.events.forEach((e, i) => {
    const results = segments[i * 3 + 2];
    e.picksLocked.forEach((lock, k) => {
      if (elapsedMs >= results.startMs + (k + 1) * LOCK_MS) locks.push(lock);
    });
  });
  return locks;
}
