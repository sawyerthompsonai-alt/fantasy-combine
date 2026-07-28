'use client';
import Avatar from '../Avatar';
import { EVENT_META } from '@/lib/types';
import type { EventStageProps } from './LaneRace';

export default function Gauntlet({ event, names, colors, phase, phaseElapsedMs, phaseDurationMs }: EventStageProps) {
  const lanes = [...event.competitors].sort((a, b) => a - b);
  const BALLS = 7;
  const progress = phase === 'run' ? Math.min(1, phaseElapsedMs / phaseDurationMs) : phase === 'results' ? 1 : 0;
  const thrown = Math.floor(progress * BALLS);

  return (
    <section>
      <h2 className="display mb-4 text-2xl text-[var(--accent)]">{EVENT_META.gauntlet.label} · catch everything</h2>
      <div className="space-y-2">
        {lanes.map(a => {
          const drops = event.performances[a];
          const out = phase === 'results' && event.eliminated.includes(a);
          return (
            <div key={a} className={`flex items-center gap-3 rounded border border-[var(--line)] bg-[var(--panel)] px-3 py-2 ${out ? 'opacity-50' : ''}`}>
              <Avatar name={names[a]} color={colors[a]} size={36} />
              <span className="w-32 truncate text-sm font-semibold">{names[a]}</span>
              <span className="flex gap-1 text-lg">
                {Array.from({ length: thrown }, (_, b) => (
                  // last `drops` balls are the drops — deterministic, no rng needed
                  <span key={b}>{b >= BALLS - drops ? '❌' : '🏈'}</span>
                ))}
              </span>
              {phase === 'results' && (
                <span className="stat ml-auto text-sm">{drops}{EVENT_META.gauntlet.unit}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
