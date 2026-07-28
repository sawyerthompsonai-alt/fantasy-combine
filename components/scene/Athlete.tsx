import { initials } from '../Avatar';

/** Skeletal animation cycle the figure performs. Each maps to a set of CSS
 * keyframes in app/globals.css (`.ath-pose-*`) — purely declarative, no
 * timers or randomness, so the same pose always renders identically. */
export type AthletePose = 'idle' | 'run' | 'jump' | 'catch' | 'lift' | 'stance' | 'walk' | 'celebrate';

export interface AthleteProps {
  name: string;
  color: string;
  pose: AthletePose;
  /** Rendered height. A plain number is px (the common case, ~70-90px tall
   * by default). A string is used as the CSS `height` value verbatim (e.g.
   * a container-query length like `"48cqh"`) — width is then derived via
   * `aspect-ratio` instead of a JS-computed px width, so the figure can
   * scale with a fluid container without any JS measurement. */
  size?: number | string;
  /** Which way the figure faces / travels. Mirrors the rig. */
  facing?: 'left' | 'right';
  /** Eliminated / inactive — fades the figure and its name chip. */
  dimmed?: boolean;
  /** Adds a warm rim-light glow, used for the athlete currently on turn. */
  spotlight?: boolean;
  /** Show the name chip below the figure. Defaults to true. */
  showName?: boolean;
  /** Duration (seconds) of one run/walk limb cycle — lets callers match the
   * rig's stride rate to the athlete's actual ground speed. Defaults to the
   * base sprint cadence (0.42s). */
  runCycleSec?: number;
  className?: string;
}

const SKIN = '#d9a878';
const SHORTS = '#1c2028';

export default function Athlete({
  name,
  color,
  pose,
  size = 80,
  facing = 'right',
  dimmed = false,
  spotlight = false,
  showName = true,
  runCycleSec = 0.42,
  className = '',
}: AthleteProps) {
  const sizeStyle = typeof size === 'number'
    ? { width: size * (44 / 92), height: size }
    : { height: size, aspectRatio: '44 / 92' };

  return (
    <div className={`inline-flex flex-col items-center gap-1 transition-opacity duration-300 ${dimmed ? 'opacity-40' : 'opacity-100'} ${className}`}>
      <div
        style={{
          ...sizeStyle,
          transform: facing === 'left' ? 'scaleX(-1)' : undefined,
          ['--run-cycle' as string]: `${runCycleSec}s`,
        }}
        className={spotlight ? 'drop-shadow-[0_0_16px_rgba(245,166,35,0.55)]' : ''}
      >
        <svg viewBox="0 0 44 92" width="100%" height="100%" role="img" aria-label={name}>
          <g className={`ath-figure ath-pose-${pose}`}>
            <g className="ath-leg-back" style={{ transformOrigin: '18.5px 49px' }}>
              <rect x="15" y="49" width="7" height="32" rx="3" fill={SHORTS} />
              <ellipse cx="18.5" cy="82" rx="4.5" ry="2.4" fill="#05070a" />
            </g>
            <g className="ath-arm-back" style={{ transformOrigin: '11.5px 20px' }}>
              <rect x="9" y="20" width="5" height="22" rx="2.5" fill={SKIN} />
            </g>

            <path
              d="M12 17 L16 13 H28 L32 17 L32 49 H12 Z"
              fill={color}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
            />
            <text x="22" y="34" textAnchor="middle" fontSize="9" fontWeight="800" fill="#0a0c10">
              {initials(name)}
            </text>

            <g className="ath-arm-front" style={{ transformOrigin: '32.5px 20px' }}>
              <rect x="30" y="20" width="5" height="22" rx="2.5" fill={SKIN} />
            </g>
            <g className="ath-leg-front" style={{ transformOrigin: '25.5px 49px' }}>
              <rect x="22" y="49" width="7" height="32" rx="3" fill="#262c38" />
              <ellipse cx="25.5" cy="82" rx="4.5" ry="2.4" fill="#05070a" />
            </g>

            <g className="ath-head" style={{ transformOrigin: '22px 11px' }}>
              <circle cx="22" cy="10" r="7" fill={SKIN} />
              <path d="M15 8 a7 7 0 0 1 14 0 Z" fill={color} opacity="0.85" />
            </g>
          </g>
        </svg>
      </div>

      {showName && (
        <span className="display flex max-w-[8rem] items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--panel)]/90 px-2 py-0.5 text-[10px] leading-none text-[var(--text)]">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate">{name}</span>
        </span>
      )}
    </div>
  );
}
