'use client';
import Athlete from '../Athlete';
import LowerThird from '../LowerThird';
import EventFrame from './EventFrame';
import { poseFor, laneOrder, easeOut, edgeFade, clamp01, STAT_REVEAL_FRACTION } from '../turnChoreo';
import { EVENT_META, type EventResult } from '@/lib/types';
import type { EventPhase } from '@/lib/timeline';

const BALLS = 7;
const THROWER = { x: 50, y: 16 };

export default function GauntletScene(props: {
  event: EventResult; names: string[]; colors: string[]; phase: EventPhase;
  phaseElapsedMs: number; phaseDurationMs: number; turnIndex?: number; athlete?: number;
}) {
  const { event, names, colors } = props;
  const meta = EVENT_META.gauntlet;

  return (
    <EventFrame
      {...props}
      introMessage={`${laneOrder(event.competitors).length} athletes run the gauntlet`}
      renderTurn={({ athlete: a, turnIndex, lanes, progress }) => {
        // Deterministic, matching the pre-v2 renderer: the *last* `drops`
        // balls in the 7-ball sequence are the drops, the rest are catches.
        const drops = Math.min(BALLS, event.performances[a]);
        const runwayX = 15 + 70 * progress;
        const opacity = edgeFade(progress);
        const thrown = Math.min(BALLS, Math.floor(progress * BALLS));
        const dropsSoFar = Array.from({ length: thrown }, (_, b) => b).filter(b => b >= BALLS - drops).length;
        const revealed = progress >= STAT_REVEAL_FRACTION;

        return (
          <>
            <div className="relative flex-1 px-4 pb-28 pt-6" style={{ opacity }}>
              <p className="display absolute left-4 top-4 text-[10px] text-[var(--muted)] sm:text-xs">
                LANE {turnIndex + 1} / {lanes.length}
              </p>

              {/* the machine firing balls downfield */}
              <div className="absolute -translate-x-1/2" style={{ left: `${THROWER.x}%`, top: `${THROWER.y}%` }}>
                <div className="h-6 w-6 rounded-sm border-2 border-[var(--accent)]/60 bg-[var(--panel)]" />
              </div>

              {Array.from({ length: BALLS }, (_, b) => {
                const windowStart = b / BALLS;
                const windowEnd = (b + 1) / BALLS;
                if (progress < windowStart || progress >= windowEnd + 0.02) return null;
                const localT = clamp01((progress - windowStart) / (windowEnd - windowStart));
                const isDrop = b >= BALLS - drops;
                const targetX = 15 + 70 * windowEnd;
                const flightT = Math.min(localT, 0.75) / 0.75;
                let bx = THROWER.x + (targetX - THROWER.x) * easeOut(flightT);
                let by = THROWER.y + (74 - THROWER.y) * easeOut(flightT);
                if (localT > 0.75) {
                  const bounceT = (localT - 0.75) / 0.25;
                  if (isDrop) {
                    // dropped: bounces away and down instead of tucking in
                    bx += bounceT * 8;
                    by += bounceT * 14;
                  } else {
                    // caught: settles slightly as it tucks in
                    by -= bounceT * 2;
                  }
                }
                const fadeOut = localT > 0.9 ? 1 - (localT - 0.9) * 10 : 1;
                return (
                  <div
                    key={b}
                    className="absolute -translate-x-1/2 -translate-y-1/2 text-lg"
                    style={{ left: `${bx}%`, top: `${by}%`, opacity: fadeOut }}
                  >
                    {isDrop && localT > 0.75 ? '💥' : '🏈'}
                  </div>
                );
              })}

              <div className="absolute bottom-[16%] left-[6%] flex gap-1">
                {Array.from({ length: thrown }, (_, b) => (
                  <span key={b} className="text-sm opacity-80">{b >= BALLS - drops ? '❌' : '🏈'}</span>
                ))}
              </div>

              <div className="absolute bottom-[16%] -translate-x-1/2" style={{ left: `${runwayX}%` }}>
                <Athlete name={names[a]} color={colors[a]} pose={poseFor('gauntlet')} size={84} spotlight />
              </div>
            </div>
            <LowerThird
              visible
              label={meta.label}
              round={event.round}
              athleteName={names[a]}
              athleteColor={colors[a]}
              statLabel={revealed ? undefined : 'DROPS'}
              statValue={`${revealed ? drops : dropsSoFar}${meta.unit}`}
            />
          </>
        );
      }}
    />
  );
}
