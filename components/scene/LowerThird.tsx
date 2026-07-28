export interface LowerThirdProps {
  /** Phase-driven: controls the slide-in/out transition. */
  visible: boolean;
  label: string;
  round?: number;
  athleteName?: string;
  athleteColor?: string;
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
        <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 bg-[var(--panel)]/95 px-3 py-2 backdrop-blur-sm">
          <span className="display text-[11px] text-[var(--accent)] sm:text-xs">{label}</span>
          {round !== undefined && round > 1 && (
            <span className="display rounded border border-[var(--line)] px-1.5 py-0.5 text-[9px] text-[var(--muted)]">
              ROUND {round}
            </span>
          )}

          {message ? (
            <span className={`display text-sm sm:text-base ${tone === 'alert' ? 'text-red-400' : 'text-[var(--text)]'}`}>
              {message}
            </span>
          ) : (
            <>
              {athleteName && (
                <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text)] sm:text-base">
                  {athleteColor && (
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: athleteColor }} />
                  )}
                  <span className="truncate">{athleteName}</span>
                </span>
              )}
              {statValue && (
                <span className="stat ml-auto text-base text-[var(--accent)] sm:text-lg">
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
