'use client';
import Avatar from '../Avatar';
import { EVENT_META } from '@/lib/types';
import type { EventStageProps } from './LaneRace';

export default function Measure({ event, names, colors, phase, phaseElapsedMs }: EventStageProps) {
  const meta = EVENT_META[event.type];
  // v2-temp: under v2 the 'run' phase this renderer sees is actually a
  // single 4s per-athlete 'turn' segment (see Broadcast.tsx's legacyPhase
  // mapping), not one long multi-athlete race. This stays a stale
  // approximation until Tasks 3-4 replace Measure with a turn-aware scene.
  const perAthleteMs = 4000;
  const lanes = [...event.competitors].sort((a, b) => a - b);
  const activeIdx = phase === 'run' ? Math.min(lanes.length - 1, Math.floor(phaseElapsedMs / perAthleteMs)) : -1;
  const within = (phaseElapsedMs % perAthleteMs) / perAthleteMs;

  return (
    <section>
      <h2 className="display mb-4 text-2xl text-[var(--accent)]">{meta.label}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {lanes.map((a, i) => {
          const revealed = phase === 'results' || (phase === 'run' && (i < activeIdx || (i === activeIdx && within > 0.6)));
          const active = i === activeIdx;
          const out = phase === 'results' && event.eliminated.includes(a);
          return (
            <div key={a}
              className={`rounded border p-3 text-center transition-all ${
                active ? 'scale-105 border-[var(--accent)]' : 'border-[var(--line)]'} bg-[var(--panel)] ${out ? 'opacity-50' : ''}`}>
              <div style={active && within <= 0.6 ? { transform: `translateY(-${Math.sin(within / 0.6 * Math.PI) * 24}px)`, transition: 'transform 120ms' } : undefined}>
                <Avatar name={names[a]} color={colors[a]} size={40} />
              </div>
              <p className="mt-1 truncate text-sm font-semibold">{names[a]}</p>
              <p className="stat text-2xl">{revealed ? `${event.performances[a].toFixed(meta.decimals)}${meta.unit}` : '—'}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
