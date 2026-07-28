import Avatar from '../Avatar';

export interface BoardInterstitialProps {
  names: string[];
  colors: string[];
  locks: { pick: number; athlete: number }[];
  total: number;
  /** Pick number that just locked — its tile pulses. */
  justLocked?: number;
  /** Elimination farewell line for the just-locked athlete (Task 1's
   * `farewellLine`) — shown under the heading, italic, while that pick's
   * tile pulses. Absent renders no roast copy. */
  roastLine?: string;
}

/** Full-screen draft-board beat shown during the back half of an
 * elimination phase (and the gap that follows it). */
export default function BoardInterstitial({ names, colors, locks, total, justLocked, roastLine }: BoardInterstitialProps) {
  const byPick = new Map(locks.map(l => [l.pick, l.athlete]));

  return (
    <div className="board-in fixed inset-0 z-30 flex flex-col items-center overflow-y-auto bg-[var(--bg)]/97 px-4 py-8 backdrop-blur-md">
      <p className="display mb-1 text-xs text-[var(--accent)]">Draft board</p>
      <h2 className={`display text-center text-2xl sm:text-3xl ${roastLine ? 'mb-1' : 'mb-6'}`}>
        {locks.length} of {total} picks locked
      </h2>
      {roastLine && (
        <p className="mb-6 max-w-md truncate px-2 text-center text-xs italic text-[var(--muted)] sm:text-sm">
          {roastLine}
        </p>
      )}
      <ol className="grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: total }, (_, i) => {
          const pick = i + 1;
          const athlete = byPick.get(pick);
          const pulsing = pick === justLocked;
          return (
            <li
              key={pick}
              className={`flex items-center gap-2 rounded-lg border px-3 py-3 ${
                athlete !== undefined ? 'border-[var(--accent)] bg-[var(--panel)]' : 'border-[var(--line)] bg-transparent opacity-50'
              } ${pulsing ? 'tile-pulse' : ''}`}
            >
              <span className="stat w-9 text-right text-xl text-[var(--accent)]">{pick}</span>
              {athlete !== undefined ? (
                <>
                  <Avatar name={names[athlete]} color={colors[athlete]} size={36} />
                  <span className="truncate text-sm font-semibold sm:text-base">{names[athlete]}</span>
                </>
              ) : (
                <span className="text-sm text-[var(--muted)]">on the clock…</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
