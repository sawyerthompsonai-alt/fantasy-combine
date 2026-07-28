import Avatar from './Avatar';

export default function DraftBoard({ names, colors, locks, total }: {
  names: string[]; colors: string[];
  locks: { pick: number; athlete: number }[]; total: number;
}) {
  const byPick = new Map(locks.map(l => [l.pick, l.athlete]));

  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: total }, (_, i) => {
        const pick = i + 1;
        const athlete = byPick.get(pick);
        return (
          <li key={pick}
            className={`flex items-center gap-2 rounded border px-3 py-2 ${
              athlete !== undefined
                ? 'border-[var(--accent)] bg-[var(--panel)]'
                : 'border-[var(--line)] bg-transparent opacity-60'}`}>
            <span className="stat w-8 text-right text-lg text-[var(--accent)]">{pick}</span>
            {athlete !== undefined ? (
              <>
                <Avatar name={names[athlete]} color={colors[athlete]} size={28} />
                <span className="truncate text-sm font-semibold">{names[athlete]}</span>
              </>
            ) : (
              <span className="text-sm text-[var(--muted)]">—</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
