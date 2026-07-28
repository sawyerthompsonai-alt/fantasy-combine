import type { ReactNode } from 'react';
import WeightRoom from './sets/WeightRoom';
import JumpStation from './sets/JumpStation';
import SidelineSet from './sets/SidelineSet';

const SIDELINE_NUMBERS = [10, 20, 30, 40, 50, 40, 30, 20, 10];

/** Backdrop for the scene stage. 'field' (default) is the outdoor stadium
 * turf with static yard lines — the original look. 'track' is the same turf
 * gradient + vignette with no static lines, for scenes that pan their own
 * yard-line layer (see `sets/TrackLines`). 'weightroom' / 'jumpstation' /
 * 'sideline' are indoor/practice-field broadcast sets. */
export type SceneSet = 'field' | 'track' | 'weightroom' | 'jumpstation' | 'sideline';

const INDOOR_SETS: ReadonlySet<SceneSet> = new Set(['weightroom', 'jumpstation', 'sideline']);

const TURF_GRADIENT = 'linear-gradient(180deg, #16321f 0%, #0f2216 55%, #0a1a10 100%)';

/**
 * Full-viewport combine scene chrome: a dark header band up top, a set-
 * specific ground below, and a vignette tying it together. `children` is
 * the stage content (athletes, lower thirds, etc); `furniture` is a slot
 * for event props (cones, rack, mat, pole) anchored near the bottom of the
 * ground. `set` swaps the ground (and, for indoor/sideline sets, the header
 * band too) — see `SceneSet`.
 */
export default function Field({
  children,
  furniture,
  set = 'field',
}: {
  children?: ReactNode;
  furniture?: ReactNode;
  set?: SceneSet;
}) {
  const indoor = INDOOR_SETS.has(set);

  return (
    <div className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-[var(--bg)]">
      <div aria-hidden className={`${indoor ? 'wall-band' : 'crowd-band'} h-16 shrink-0 sm:h-24`} />

      <div className="relative flex-1">
        {set === 'field' && (
          <>
            <div aria-hidden className="absolute inset-0" style={{ background: TURF_GRADIENT }} />

            <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {Array.from({ length: 9 }, (_, i) => (i + 1) * 10).map(x => (
                <line key={x} x1={x} x2={x} y1={0} y2={100} stroke="rgba(255,255,255,0.16)" strokeWidth="0.25" />
              ))}
              {Array.from({ length: 19 }, (_, i) => (i + 1) * 5)
                .filter(x => x % 10 !== 0)
                .map(x => (
                  <g key={x}>
                    <line x1={x} x2={x} y1="29" y2="33" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
                    <line x1={x} x2={x} y1="67" y2="71" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
                  </g>
                ))}
              {SIDELINE_NUMBERS.map((n, i) => (
                <text
                  key={i}
                  x={(i + 1) * 10}
                  y="16"
                  textAnchor="middle"
                  fontSize="5"
                  fontWeight="700"
                  fill="rgba(255,255,255,0.14)"
                >
                  {n}
                </text>
              ))}
            </svg>
          </>
        )}

        {set === 'track' && <div aria-hidden className="absolute inset-0" style={{ background: TURF_GRADIENT }} />}

        {set === 'weightroom' && <WeightRoom />}
        {set === 'jumpstation' && <JumpStation />}
        {set === 'sideline' && <SidelineSet />}

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 40%, transparent 40%, rgba(0,0,0,0.55) 100%)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 120% 60% at 50% -10%, rgba(245,166,35,0.1), transparent 55%)' }}
        />

        {furniture && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[8%] flex justify-center">{furniture}</div>
        )}

        <div className="relative z-10 flex h-full flex-col">{children}</div>
      </div>
    </div>
  );
}
