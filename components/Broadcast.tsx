'use client';
import { useEffect, useRef, useState } from 'react';
import type { PublicRoom } from '@/lib/rooms';
import { lockedPicks, stateAt } from '@/lib/timeline';
import { EVENT_META } from '@/lib/types';
import { sound } from '@/lib/sound';
import DraftBoard from './DraftBoard';
import Confetti from './Confetti';
import LaneRace, { type EventStageProps } from './events/LaneRace';
import Bench from './events/Bench';
import Measure from './events/Measure';
import Gauntlet from './events/Gauntlet';

function EventStage(props: EventStageProps) {
  switch (props.event.type) {
    case 'bench': return <Bench {...props} />;
    case 'vertical':
    case 'broad': return <Measure {...props} />;
    case 'gauntlet': return <Gauntlet {...props} />;
    default: return <LaneRace {...props} />;
  }
}

export default function Broadcast({ room, now }: { room: PublicRoom; now: () => number }) {
  const [, tick] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  useEffect(() => {
    const t = setInterval(() => tick(x => x + 1), 100);
    return () => clearInterval(t);
  }, []);

  const outcomes = room.outcomes!;
  const elapsed = now() - (room.startTime ?? now());
  const state = stateAt(outcomes, elapsed);
  const locks = lockedPicks(outcomes, elapsed);
  const allLocked = locks.length === room.names.length;

  const prevRef = useRef({ phaseKey: '', locks: 0 });
  useEffect(() => {
    const prev = prevRef.current;
    const phaseKey = state.kind === 'event' ? `${state.eventIndex}:${state.phase}` : state.kind;
    // v2-temp: 'turn' is the new per-athlete action phase (pre-finale);
    // 'run' remains the finale's simultaneous head-to-head phase. Both cue
    // the whistle until Tasks 3-4 give turns their own sound cues.
    if (phaseKey !== prev.phaseKey && state.kind === 'event' && (state.phase === 'run' || state.phase === 'turn')) sound.whistle();
    if (locks.length > prev.locks) sound.lock();
    if (locks.length === room.names.length && prev.locks < room.names.length) sound.horn();
    prevRef.current = { phaseKey, locks: locks.length };
  });

  // v2-temp: the v1 event renderers (LaneRace/Bench/Measure/Gauntlet) only
  // understand 'intro' | 'run' | 'results'. Map the v2 per-athlete phases
  // onto their nearest v1 equivalent so those renderers keep compiling and
  // render something plausible: 'turn' (per-athlete action) -> 'run'
  // (action phase), 'elimination' (post-results lock beat) -> 'results'
  // (final-state phase, eliminated athletes already dimmed). Tasks 3-4
  // replace these renderers with turn-aware scenes and this mapping goes
  // away with them.
  const legacyPhase: EventStageProps['phase'] =
    state.kind === 'event'
      ? state.phase === 'turn' ? 'run' : state.phase === 'elimination' ? 'results' : state.phase
      : 'intro';

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between border-b border-[var(--line)] pb-3">
        <span className="display text-sm text-[var(--accent)]">● Live · Fantasy Draft Combine</span>
        <span className="stat text-sm text-[var(--muted)]">
          {state.kind === 'event' ? EVENT_META[outcomes.events[state.eventIndex].type].label : 'Draft Board'}
        </span>
        <button
          onClick={() => {
            if (soundOn) sound.disable();
            else sound.enable();
            setSoundOn(!soundOn);
          }}
          aria-label="toggle sound"
          className="text-lg"
        >
          {soundOn ? '🔊' : '🔇'}
        </button>
      </header>

      {state.kind === 'event' && (
        <EventStage
          event={outcomes.events[state.eventIndex]}
          names={room.names} colors={room.colors}
          phase={legacyPhase} phaseElapsedMs={state.phaseElapsedMs} phaseDurationMs={state.phaseDurationMs}
        />
      )}
      {state.kind !== 'event' && (
        <p className="display py-10 text-center text-2xl text-[var(--muted)]">
          {state.kind === 'pregame' ? 'On the clock…' : 'That’s a wrap!'}
        </p>
      )}

      <section className="mt-10">
        <h3 className="display mb-3 text-sm text-[var(--muted)]">Draft board</h3>
        <DraftBoard names={room.names} colors={room.colors} locks={locks} total={room.names.length} />
      </section>

      {allLocked && <Confetti colors={room.colors} />}
    </main>
  );
}
