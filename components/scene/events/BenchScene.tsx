'use client';
import Athlete from '../Athlete';
import LowerThird from '../LowerThird';
import EventFrame from './EventFrame';
import { poseFor, laneOrder, strainEase, turnWindow, edgeFade, clamp01, STAT_REVEAL_FRACTION } from '../turnChoreo';
import { EVENT_META, type EventResult } from '@/lib/types';
import type { EventPhase } from '@/lib/timeline';

export default function BenchScene(props: {
  event: EventResult; names: string[]; colors: string[]; phase: EventPhase;
  phaseElapsedMs: number; phaseDurationMs: number; turnIndex?: number; athlete?: number;
}) {
  const { event, names, colors } = props;
  const meta = EVENT_META.bench;

  return (
    <EventFrame
      {...props}
      introMessage={`${laneOrder(event.competitors).length} athletes chalk their hands · 225 lbs`}
      renderTurn={({ athlete: a, turnIndex, lanes, progress }) => {
        const finalReps = event.performances[a];
        const u = clamp01(progress / STAT_REVEAL_FRACTION);
        const reps = Math.min(finalReps, Math.floor(finalReps * strainEase(u)));
        const locked = progress >= STAT_REVEAL_FRACTION;
        const { stage } = turnWindow(progress);
        // the bar bends under strain while actively being lifted, and
        // settles flat once the rep count has locked in ("racked")
        const bendDeg = stage !== 'walk-in' && !locked ? 2.5 : 0;
        const opacity = edgeFade(progress);

        return (
          <>
            <div className="relative flex-1 px-4 pb-28 pt-6" style={{ opacity }}>
              <p className="display absolute left-4 top-4 text-[10px] text-[var(--muted)] sm:text-xs">
                LANE {turnIndex + 1} / {lanes.length}
              </p>

              <div className="flex h-full items-center justify-center">
                <div className="relative">
                  {/* rack uprights */}
                  <div className="absolute -left-16 top-2 h-24 w-2 rounded-full bg-[#3a3f4a]" />
                  <div className="absolute -right-16 top-2 h-24 w-2 rounded-full bg-[#3a3f4a]" />
                  {/* bar, bends slightly under strain */}
                  <div
                    className="absolute left-1/2 top-6 h-1.5 w-40 -translate-x-1/2 rounded-full bg-[#8a93a3] transition-transform duration-300"
                    style={{ transform: `translateX(-50%) rotate(${bendDeg}deg)` }}
                  />
                  <Athlete name={names[a]} color={colors[a]} pose={poseFor('bench')} size={92} spotlight />
                </div>
              </div>

              <p
                className={`display pointer-events-none absolute bottom-[26%] left-1/2 -translate-x-1/2 text-4xl sm:text-5xl ${
                  locked ? 'text-[var(--accent)]' : 'text-[var(--text)]'
                }`}
              >
                {reps}
              </p>
            </div>
            <LowerThird
              visible
              label={meta.label}
              round={event.round}
              athleteName={names[a]}
              athleteColor={colors[a]}
              statLabel={locked ? undefined : 'REPS'}
              statValue={`${reps}${meta.unit}`}
            />
          </>
        );
      }}
    />
  );
}
