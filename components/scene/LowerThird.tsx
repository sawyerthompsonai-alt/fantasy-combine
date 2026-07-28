export interface LowerThirdProps {
  /** Phase-driven: controls the slide-in/out transition. */
  visible: boolean;
  label: string;
  round?: number;
  athleteName?: string;
  athleteColor?: string;
  /** Small muted secondary segment rendered inline after `athleteName`
   * (e.g. the walk-up "nickname · measurable" line) — stays on the bar's
   * single line, truncating alongside the name rather than adding a
   * second row, so the bar's height never changes (see Task 11-13's
   * single-line/overlap fixes this bar exists to preserve). Only rendered
   * at `sm:` and up — below that there isn't reliably enough room for it
   * without crowding out `athleteName`, which always takes priority (see
   * the render below). */
  subline?: string;
  statLabel?: string;
  statValue?: string;
  /** Overrides the name/stat row with a single broadcast message, e.g.
   * "ELIMINATED · PICK #7 LOCKED". */
  message?: string;
  tone?: 'default' | 'alert';
}

export default function LowerThird({
  visible,
  label,
  round,
  athleteName,
  athleteColor,
  subline,
  statLabel,
  statValue,
  message,
  tone = 'default',
}: LowerThirdProps) {
  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-all duration-500 ease-out ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      }`}
    >
      <div
        className={`flex w-full max-w-2xl items-stretch overflow-hidden rounded-md border shadow-[0_10px_30px_rgba(0,0,0,0.55)] ${
          tone === 'alert' ? 'border-red-500/50' : 'border-[var(--line)]'
        }`}
      >
        <div className={`w-1.5 shrink-0 ${tone === 'alert' ? 'bg-red-500' : 'bg-[var(--accent)]'}`} />
        <div className="flex flex-1 flex-nowrap items-center gap-x-3 overflow-hidden bg-[var(--panel)]/95 px-3 py-2 backdrop-blur-sm">
          {/* `min-w-0 shrink` (not `shrink-0`) for the same reason as the
              ROUND badge below: at the genuine worst case (round 2+, the
              longest event label, a 24-char name, and a full stat value,
              all at 390px) the round badge alone can't give up enough
              width even after shrinking to its own true minimum — the
              label giving up a couple of characters it will basically
              never need to in practice is a far better trade than letting
              the bar overflow. `max-w-[45%]` keeps it from being the thing
              that swallows all the room in more ordinary cases. */}
          <span className="display min-w-0 max-w-[45%] shrink truncate text-[11px] text-[var(--accent)] sm:text-xs">{label}</span>
          {round !== undefined && round > 1 && (
            // Shrinkable (not `shrink-0`) as of the Task 14 truncation-
            // priority fix: LABEL identifies the event and the name is the
            // person, both take precedence over this decorative badge — at
            // the genuine worst case (round 2+, the longest event label,
            // a 24-char name, and a full stat value all at once, 390px)
            // this pill is the only other negotiable-enough chunk of fixed
            // chrome to give up before the name's own floor would overflow
            // the bar. `min-w-0` lets it truncate down toward "RO…" (or
            // narrower) rather than holding its full "ROUND N" width
            // unconditionally.
            <span className="display min-w-0 shrink truncate rounded border border-[var(--line)] px-1.5 py-0.5 text-[9px] text-[var(--muted)]">
              ROUND {round}
            </span>
          )}

          {message ? (
            <span className={`display min-w-0 flex-1 truncate text-sm sm:text-base ${tone === 'alert' ? 'text-red-400' : 'text-[var(--text)]'}`}>
              {message}
            </span>
          ) : (
            <>
              {/* athleteColor/athleteName/subline are direct children of
                  this row (not wrapped in their own inner flex-1 span, as
                  an earlier version had it) — that nesting was the actual
                  bug behind illegible worst-case truncation: the inner
                  wrapper had `min-w-0`, so the *wrapper* would shrink
                  arbitrarily small, but the name's hard min-width floor
                  (below) still forced the name itself wider than that
                  now-tiny wrapper. With no `overflow-hidden` on the
                  wrapper, the name visually spilled out of it and *behind*
                  the stat block instead of being contained — a real
                  overlap, confirmed via getBoundingClientRect (name's box
                  right edge past its wrapper's, overlapping the stat
                  block's left edge). Flattening removes the extra
                  min-w-0 container the floor could escape from: every
                  child here now negotiates space directly against this
                  row's own single `overflow-hidden` boundary. */}
              {athleteName && athleteColor && (
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: athleteColor }} />
              )}
              {athleteName && (
                // The name is the essential information; `subline` is
                // garnish — it must lose the truncation fight first.
                // `min-w-[8ch]` is a hard CSS floor (min-width overrides
                // flex-shrink's automatic minimum, so no sibling can
                // negotiate it away) guaranteeing the name keeps enough
                // width for a recognizable lead-in before it ellipsizes.
                <span className="min-w-[8ch] flex-1 shrink truncate text-sm font-semibold text-[var(--text)] sm:text-base">
                  {athleteName}
                </span>
              )}
              {subline && (
                // `hidden sm:inline-block`: below the `sm` breakpoint there
                // just isn't reliably enough room in this bar for LABEL +
                // ROUND + the name's own floor + the stat *and* a subline
                // at any width worth showing — measured live at 390px with
                // the worst realistic combination (longest event label,
                // round 2+, a 24-char name, the longest nickname +
                // measurable). Below `sm` the subline simply isn't
                // rendered (not shrunk to ~0-width — actually removed from
                // the flex line, so it stops claiming its two flanking
                // gaps too), which is what lets LABEL/ROUND/name settle
                // without a fight over space that doesn't exist. At `sm`+
                // widths the row has comfortably more room than this fixed
                // overhead requires, so the subline shows normally.
                <span className="hidden min-w-0 shrink truncate text-[11px] font-normal italic text-[var(--muted)] sm:inline-block sm:max-w-[220px]">
                  {subline}
                </span>
              )}
              {statValue && (
                <span className="stat ml-auto shrink-0 text-base text-[var(--accent)] sm:text-lg">
                  {statLabel && <span className="mr-1 text-[10px] text-[var(--muted)]">{statLabel}</span>}
                  {statValue}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
