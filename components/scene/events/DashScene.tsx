'use client';
import Athlete from '../Athlete';
import LowerThird from '../LowerThird';
import EventFrame from './EventFrame';
import {
  poseFor, laneOrder, countUpStat, pathPosition, facingFromDx, edgeFade, STAT_REVEAL_FRACTION, type Point,
} from '../turnChoreo';
import { EVENT_META, type EventResult } from '@/lib/types';
import type { EventPhase } from '@/lib/timeline';

type DashType = 'forty' | 'threecone' | 'shuttle';

interface DashConfig {
  /** Percent-space waypoints the runner travels through, in order. */
  waypoints: Point[];
  /** Cone markers (3-cone drill). */
  cones?: Point[];
  /** Touch-line markers, x percentages (shuttle). */
  touchLines?: number[];
  intro: string;
}

const DASH_CONFIG: Record<DashType, DashConfig> = {
  forty: {
    waypoints: [{ x: 6, y: 80 }, { x: 90, y: 80 }],
    intro: 'athletes step up to the line',
  },
  threecone: {
    waypoints: [{ x: 14, y: 82 }, { x: 46, y: 82 }, { x: 46, y: 50 }, { x: 14, y: 82 }, { x: 88, y: 58 }],
    cones: [{ x: 14, y: 82 }, { x: 46, y: 82 }, { x: 46, y: 50 }],
    intro: 'athletes eye the cones',
  },
  shuttle: {
    waypoints: [{ x: 50, y: 80 }, { x: 76, y: 80 }, { x: 24, y: 80 }, { x: 52, y: 80 }],
    touchLines: [24, 50, 76],
    intro: 'athletes set for the shuttle',
  },
};

function Cone({ x, y }: Point) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-full" style={{ left: `${x}%`, top: `${y}%` }}>
      <div
        className="h-3 w-3 bg-[var(--accent)] shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
        style={{ clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' }}
      />
    </div>
  );
}

function TouchLine({ x }: { x: number }) {
  return <div className="absolute bottom-[12%] h-8 w-0.5 -translate-x-1/2 bg-white/25" style={{ left: `${x}%` }} />;
}

export default function DashScene(props: {
  event: EventResult; names: string[]; colors: string[]; phase: EventPhase;
  phaseElapsedMs: number; phaseDurationMs: number; turnIndex?: number; athlete?: number;
}) {
  const { event, names, colors } = props;
  const type = event.type as DashType;
  const meta = EVENT_META[event.type];
  const cfg = DASH_CONFIG[type];

  return (
    <EventFrame
      {...props}
      introMessage={`${laneOrder(event.competitors).length} ${cfg.intro}`}
      renderTurn={({ athlete: a, turnIndex, lanes, progress }) => {
        const pos = pathPosition(cfg.waypoints, progress);
        const facing = facingFromDx(pos.dx);
        const finalValue = event.performances[a];
        const displayValue = countUpStat(progress, finalValue);
        const locked = progress >= STAT_REVEAL_FRACTION;
        const opacity = edgeFade(progress);

        return (
          <>
            <div className="relative flex-1 px-4 pb-28 pt-6">
              <p className="display absolute left-4 top-4 text-[10px] text-[var(--muted)] sm:text-xs">
                LANE {turnIndex + 1} / {lanes.length}
              </p>

              <svg
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <polyline
                  points={cfg.waypoints.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="rgba(245,166,35,0.28)"
                  strokeWidth="0.6"
                  strokeDasharray="1.6 1.4"
                />
              </svg>
              {cfg.cones?.map((c, i) => <Cone key={i} x={c.x} y={c.y} />)}
              {cfg.touchLines?.map(x => <TouchLine key={x} x={x} />)}

              <div
                className="absolute"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: 'translate(-50%, -100%)',
                  opacity,
                  transition: 'left 100ms linear, top 100ms linear, opacity 200ms linear',
                }}
              >
                <Athlete name={names[a]} color={colors[a]} pose={poseFor(event.type)} size={84} facing={facing} spotlight />
              </div>
            </div>
            <LowerThird
              visible
              label={meta.label}
              round={event.round}
              athleteName={names[a]}
              athleteColor={colors[a]}
              statLabel={locked ? undefined : 'CLOCK'}
              statValue={`${displayValue.toFixed(meta.decimals)}${meta.unit}`}
            />
          </>
        );
      }}
    />
  );
}
