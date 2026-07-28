'use client';
import Avatar from '../Avatar';
import { finishTimesMs } from '@/lib/race';
import { EVENT_META, type EventResult } from '@/lib/types';

export interface EventStageProps {
  event: EventResult;
  names: string[];
  colors: string[];
  phase: 'intro' | 'run' | 'results';
  phaseElapsedMs: number;
  phaseDurationMs: number;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 2.2);

export default function LaneRace({ event, names, colors, phase, phaseElapsedMs, phaseDurationMs }: EventStageProps) {
  const meta = EVENT_META[event.type];
  const finishes = finishTimesMs(event.ranking, phaseDurationMs);
  const lanes = [...event.competitors].sort((a, b) => a - b);
  const isFinale = event.type === 'champ40';

  return (
    <section>
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="display text-2xl text-[var(--accent)]">{meta.label}</h2>
        {phase === 'run' && (
          <span className="stat text-xl">{(Math.min(phaseElapsedMs, phaseDurationMs) / 1000).toFixed(2)}s</span>
        )}
      </header>

      {phase === 'intro' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {lanes.map(a => (
            <div key={a} className="flex items-center gap-2 rounded border border-[var(--line)] bg-[var(--panel)] p-3">
              <Avatar name={names[a]} color={colors[a]} size={36} />
              <span className="truncate font-semibold">{names[a]}</span>
            </div>
          ))}
        </div>
      )}

      {phase !== 'intro' && (
        <div className="space-y-2">
          {lanes.map(a => {
            const t = phase === 'run' ? Math.min(1, phaseElapsedMs / finishes[a]) : 1;
            const pct = easeOut(t) * 92;
            const eliminated = phase === 'results' && event.eliminated.includes(a) && !isFinale;
            return (
              <div key={a} className={`relative h-12 rounded border border-[var(--line)] bg-[var(--panel)] ${eliminated ? 'opacity-50' : ''}`}>
                <div className="absolute right-2 top-0 h-full w-1 bg-[var(--accent)] opacity-60" />
                <div className="absolute top-1"
                  style={{ left: `${pct}%`, transition: 'left 100ms linear' }}>
                  <Avatar name={names[a]} color={colors[a]} size={40} />
                </div>
                {phase === 'results' && (
                  <span className="stat absolute right-4 top-1/2 -translate-y-1/2 text-sm">
                    {event.performances[a].toFixed(EVENT_META[event.type].decimals)}{meta.unit}
                  </span>
                )}
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">{names[a]}</span>
              </div>
            );
          })}
        </div>
      )}

      {phase === 'results' && isFinale && (
        <p className="display mt-6 text-center text-3xl text-[var(--accent)]">
          🏆 {names[event.ranking[0]]} takes the #1 pick!
        </p>
      )}
    </section>
  );
}
