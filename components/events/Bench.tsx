'use client';
import Avatar from '../Avatar';
import { EVENT_META } from '@/lib/types';
import type { EventStageProps } from './LaneRace';

export default function Bench({ event, names, colors, phase, phaseElapsedMs, phaseDurationMs }: EventStageProps) {
  const lanes = [...event.competitors].sort((a, b) => a - b);
  return (
    <section>
      <h2 className="display mb-4 text-2xl text-[var(--accent)]">{EVENT_META.bench.label} · 225 lbs</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {lanes.map(a => {
          const finalReps = event.performances[a];
          // each athlete's counter climbs and stalls at their final rep count
          const progress = phase === 'intro' ? 0 : phase === 'results' ? 1
            : Math.min(1, phaseElapsedMs / (phaseDurationMs * (0.5 + 0.5 * (finalReps / 40))));
          const reps = Math.floor(finalReps * progress);
          const done = phase === 'results' || reps >= finalReps;
          const out = phase === 'results' && event.eliminated.includes(a);
          return (
            <div key={a} className={`rounded border border-[var(--line)] bg-[var(--panel)] p-3 text-center ${out ? 'opacity-50' : ''}`}>
              <Avatar name={names[a]} color={colors[a]} size={40} />
              <p className="mt-1 truncate text-sm font-semibold">{names[a]}</p>
              <p className={`stat text-3xl ${done ? '' : 'animate-pulse'}`}>{reps}</p>
              <p className="text-xs text-[var(--muted)]">{done ? 'RACKED' : 'lifting…'}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
