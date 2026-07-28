'use client';
import { useEffect, useState } from 'react';
import type { PublicRoom } from '@/lib/rooms';
import { lockedPicks, stateAt } from '@/lib/timeline';
import { EVENT_META } from '@/lib/types';
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
  useEffect(() => {
    const t = setInterval(() => tick(x => x + 1), 100);
    return () => clearInterval(t);
  }, []);

  const outcomes = room.outcomes!;
  const elapsed = now() - (room.startTime ?? now());
  const state = stateAt(outcomes, elapsed);
  const locks = lockedPicks(outcomes, elapsed);
  const allLocked = locks.length === room.names.length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8" style={{ containerType: 'inline-size' }}>
      <header className="mb-6 flex items-center justify-between border-b border-[var(--line)] pb-3">
        <span className="display text-sm text-[var(--accent)]">● Live · Fantasy Draft Combine</span>
        <span className="stat text-sm text-[var(--muted)]">
          {state.kind === 'event' ? EVENT_META[outcomes.events[state.eventIndex].type].label : 'Draft Board'}
        </span>
      </header>

      {state.kind === 'event' && (
        <EventStage
          event={outcomes.events[state.eventIndex]}
          names={room.names} colors={room.colors}
          phase={state.phase} phaseElapsedMs={state.phaseElapsedMs} phaseDurationMs={state.phaseDurationMs}
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
