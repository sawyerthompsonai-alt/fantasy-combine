import type { ReactNode } from 'react';

const SIDELINE_NUMBERS = [10, 20, 30, 40, 50, 40, 30, 20, 10];

/**
 * Full-viewport combine scene chrome: a dark stadium band up top, turf with
 * SVG yard lines/hash marks/sideline numbers below, and a vignette tying it
 * together. `children` is the stage content (athletes, lower thirds, etc);
 * `furniture` is a slot for event props (cones, rack, mat, pole) anchored
 * near the bottom of the turf.
 */
export default function Field({ children, furniture }: { children?: ReactNode; furniture?: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-[var(--bg)]">
      <div aria-hidden className="crowd-band h-16 shrink-0 sm:h-24" />

      <div className="relative flex-1">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, #16321f 0%, #0f2216 55%, #0a1a10 100%)' }}
        />

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
