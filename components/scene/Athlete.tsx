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
  /** Forward/backward body lean in degrees (negative = leaning forward),
   * applied ONLY to the SVG figure's own box — never to the name chip
   * below it. Scene callers (DashScene's sprint burst, FinaleScene's gun
   * start, 3-cone's plant cuts) used to get this effect by wrapping the
   * *entire* Athlete (figure + name chip) in an external rotating div, but
   * the chip is wide and short (up to `max-w-[8rem]`), so rotating it swept
   * a much taller axis-aligned bounding box than the narrow figure alone —
   * at a short viewport that bounding box could overlap an adjacent lane
   * even though the figure itself had plenty of clearance. Composed with
   * `facing === 'left' -> scaleX(-1)` on this same inner div, in the same
   * outer-then-inner order the old nested-wrapper version applied them
   * (rotate around the screen-space box, then mirror within it), so the
   * visual lean direction is unchanged for existing callers that pass
   * `facing` but not `leanDeg`. Defaults to 0 (no lean) — fully backward
   * compatible with every existing call site. */
  leanDeg?: number;
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
  leanDeg = 0,
  className = '',
}: AthleteProps) {
  const sizeStyle = typeof size === 'number'
    ? { width: size * (44 / 92), height: size }
    : { height: size, aspectRatio: '44 / 92' };

  // Order matters: rotate first (outer, screen-space), scaleX second (inner,
  // local-space) — matches the old nested-wrapper structure this replaces
  // (an outer div doing the lean rotation, wrapping Athlete's own inner div
  // doing the facing mirror), so existing lean+facing-left combinations
  // (e.g. the 3-cone drill's plant cuts) read identically to before.
  const figureTransforms: string[] = [];
  if (leanDeg) figureTransforms.push(`rotate(${leanDeg}deg)`);
  if (facing === 'left') figureTransforms.push('scaleX(-1)');

  return (
    <div className={`inline-flex flex-col items-center gap-1 transition-opacity duration-300 ${dimmed ? 'opacity-40' : 'opacity-100'} ${className}`}>
      <div
        style={{
          ...sizeStyle,
          transform: figureTransforms.length > 0 ? figureTransforms.join(' ') : undefined,
          // Bottom-center of the figure's own box, as a percentage rather
          // than a fixed px value — tracks whatever `size` actually
          // resolves to at runtime (including vh-clamped/string sizes),
          // unlike the old external wrapper's fixed `center 80px`-style
          // origin, which silently drifted out of sync whenever a caller
          // used a viewport-relative size.
          transformOrigin: '50% 100%',
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
