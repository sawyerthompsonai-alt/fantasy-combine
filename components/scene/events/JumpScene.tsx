'use client';
import Athlete from '../Athlete';
import LowerThird from '../LowerThird';
import EventFrame from './EventFrame';
import { poseFor, laneOrder, countUpStat, clamp01, easeOut, STAT_REVEAL_FRACTION } from '../turnChoreo';
import { EVENT_META, type EventResult } from '@/lib/types';
import type { EventPhase } from '@/lib/timeline';

type JumpType = 'vertical' | 'broad';

// Plausible display ranges used only to scale the chalk mark / tape reading
// visually — the real stat shown always comes from event.performances.
const VERTICAL_RANGE: [number, number] = [10, 48];
const BROAD_RANGE: [number, number] = [78, 148];

function scalePct(value: number, [lo, hi]: [number, number], [outLo, outHi]: [number, number]): number {
  const t = clamp01((value - lo) / (hi - lo));
  return outLo + (outHi - outLo) * t;
}

export default function JumpScene(props: {
  event: EventResult; names: string[]; colors: string[]; phase: EventPhase;
  phaseElapsedMs: number; phaseDurationMs: number; turnIndex?: number; athlete?: number;
}) {
  const { event, names, colors } = props;
  const type = event.type as JumpType;
  const meta = EVENT_META[event.type];

  return (
    <EventFrame
      {...props}
      introMessage={`${laneOrder(event.competitors).length} athletes chalk up for the ${meta.label.toLowerCase()}`}
      renderTurn={({ athlete: a, turnIndex, lanes, progress }) => {
        const finalValue = event.performances[a];
        const locked = progress >= STAT_REVEAL_FRACTION;
        const displayValue = countUpStat(progress, finalValue);
        const laneLabel = (
          <p className="display absolute left-4 top-4 text-[10px] text-[var(--muted)] sm:text-xs">
            LANE {turnIndex + 1} / {lanes.length}
          </p>
        );

        if (type === 'vertical') {
          const heightPct = scalePct(finalValue, VERTICAL_RANGE, [6, 62]);
          return (
            <>
              <div className="relative flex-1 px-4 pb-28 pt-6">
                {laneLabel}
                {/* measuring pole */}
                <div className="absolute bottom-[10%] left-1/2 h-[64%] w-1.5 -translate-x-[64px] rounded-full bg-gradient-to-t from-[#3a2f1c] to-[#6b5638]" />
                {/* chalk swipe mark, revealed at the stat lock */}
                <div
                  className="absolute left-1/2 w-4 -translate-x-[72px] rounded-sm bg-white transition-all duration-300 ease-out"
                  style={{ bottom: `${10 + heightPct}%`, height: locked ? '10px' : '0px', opacity: locked ? 1 : 0 }}
                />
                <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2">
                  <Athlete name={names[a]} color={colors[a]} pose={poseFor(event.type)} size={90} spotlight />
                </div>
              </div>
              <LowerThird
                visible
                label={meta.label}
                round={event.round}
                athleteName={names[a]}
                athleteColor={colors[a]}
                statLabel={locked ? undefined : 'REACH'}
                statValue={`${displayValue.toFixed(meta.decimals)}${meta.unit}`}
              />
            </>
          );
        }

        // broad jump: crouch -> arc through the air -> land at distance
        const startX = 20;
        const landX = scalePct(finalValue, BROAD_RANGE, [32, 82]);
        let x = startX;
        let arc = 0;
        if (progress < 0.3) {
          x = startX;
        } else if (progress < 0.55) {
          const t = (progress - 0.3) / 0.25;
          x = startX + (landX - startX) * easeOut(t);
          arc = Math.sin(Math.PI * t) * 18;
        } else {
          x = landX;
        }
        const tapeWidth = locked ? landX - startX : Math.max(0, x - startX);

        return (
          <>
            <div className="relative flex-1 px-4 pb-28 pt-6">
              {laneLabel}
              {/* tape measure, extends as the jump resolves */}
              <div className="absolute bottom-[14%] h-0.5 bg-white/30" style={{ left: `${startX}%`, width: `${tapeWidth}%` }} />
              <div className="absolute bottom-[12%] h-3 w-0.5 bg-white/50" style={{ left: `${startX}%` }} />
              {/* landing mat */}
              <div
                className="absolute bottom-[8%] w-16 -translate-x-1/2 rounded-sm bg-[var(--panel)]/70"
                style={{ left: `${landX}%`, height: '6%' }}
              />
              <div
                className="absolute bottom-[10%]"
                style={{
                  left: `${x}%`,
                  transform: `translate(-50%, ${-arc}px)`,
                  transition: progress >= 0.55 ? 'left 200ms ease-out' : undefined,
                }}
              >
                <Athlete name={names[a]} color={colors[a]} pose={poseFor(event.type)} size={82} spotlight />
              </div>
            </div>
            <LowerThird
              visible
              label={meta.label}
              round={event.round}
              athleteName={names[a]}
              athleteColor={colors[a]}
              statLabel={locked ? undefined : 'DISTANCE'}
              statValue={`${displayValue.toFixed(meta.decimals)}${meta.unit}`}
            />
          </>
        );
      }}
    />
  );
}
