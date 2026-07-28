'use client';
import { useState } from 'react';
import type { ScoreboardData } from '@/lib/scoreboard';
import Athlete from './scene/Athlete';

const DOCKED_ROWS = 5;

function fmt(mark: number, decimals: number, unit: string): string {
  return `${mark.toFixed(decimals)}${unit}`;
}

interface ScoreboardProps {
  data: ScoreboardData;
  names: string[];
  colors: string[];
  mode: 'docked' | 'expanded' | 'ticker';
  /** Task 14 engagement punch: flashes an accent "NEW LEADER" chip across
   * the docked header the moment the board's leader changes mid-event.
   * Only `mode="docked"` renders it — the ticker/expanded views don't have
   * (or need) a persistent header to punch. */
  leaderChangedRecently?: boolean;
}

/** Persistent stadium-jumbotron scoreboard — a pure view over ScoreboardData
 * (itself a pure function of outcomes + elapsed time), so every viewer sees
 * identical rows at any given moment. Three presentations of the same data:
 * a small docked panel for desktop (never covers the athlete — right edge,
 * below the header), a slim tap-to-expand ticker for mobile, and a
 * full-board "expanded" view used in place of EventFrame's inline
 * leaderboard during the results phase. */
export default function Scoreboard({ data, names, colors, mode, leaderChangedRecently }: ScoreboardProps) {
  if (mode === 'docked') return <DockedBoard data={data} names={names} colors={colors} leaderChangedRecently={leaderChangedRecently} />;
  if (mode === 'ticker') return <TickerBoard data={data} names={names} colors={colors} />;
  return <ExpandedBoard data={data} names={names} colors={colors} />;
}

function DockedBoard({ data, names, colors, leaderChangedRecently }: Omit<ScoreboardProps, 'mode'>) {
  const leader = data.board[0]?.athlete;
  const rows = data.board.slice(0, DOCKED_ROWS);

  return (
    <div className="fixed right-3 top-16 z-30 hidden w-[190px] flex-col overflow-hidden rounded-md border border-[var(--accent)]/50 bg-[var(--panel)]/95 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-sm sm:flex">
      <div className="relative flex items-center justify-between gap-1.5 overflow-hidden border-b border-[var(--line)] px-2.5 py-1.5">
        <span className="display truncate text-[10px] text-[var(--accent)]">{data.label}</span>
        {data.round !== undefined && data.round > 1 && (
          <span className="display shrink-0 rounded border border-[var(--line)] px-1 py-0.5 text-[8px] text-[var(--muted)]">
            RD {data.round}
          </span>
        )}
        {leaderChangedRecently && leader !== undefined && (
          <span
            key={leader}
            aria-hidden
            className="new-leader-chip display pointer-events-none absolute inset-y-0 right-0 flex items-center rounded-l-sm bg-[var(--accent)] px-2 text-[9px] font-extrabold tracking-wider text-[var(--bg)]"
          >
            NEW LEADER
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="display px-2.5 py-3 text-center text-[10px] text-[var(--muted)]">Warming up…</p>
      ) : (
        <ol key={leader} className="flex flex-col">
          {rows.map((row, i) => {
            const isLeader = i === 0;
            return (
              <li
                key={row.athlete}
                className={`flex items-center gap-1.5 px-2.5 py-1 ${isLeader ? 'tile-pulse bg-[var(--accent)]/10' : ''}`}
              >
                <span className={`stat w-3.5 shrink-0 text-right text-[10px] ${isLeader ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}>
                  {i + 1}
                </span>
                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colors[row.athlete] }} />
                <span className={`flex-1 truncate text-[11px] ${isLeader ? 'font-semibold text-[var(--accent)]' : 'text-[var(--text)]'}`}>
                  {names[row.athlete]}
                </span>
                <span className={`stat shrink-0 text-[11px] ${isLeader ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
                  {fmt(row.mark, data.decimals, data.unit)}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="display mt-auto border-t border-[var(--line)] px-2.5 py-1.5 text-[9px] text-[var(--muted)]">
        {data.remaining} REMAIN · {data.picksLocked}/{data.totalPicks} LOCKED
      </div>
    </div>
  );
}

function TickerBoard({ data, names, colors }: Omit<ScoreboardProps, 'mode'>) {
  const [open, setOpen] = useState(false);
  const leader = data.board[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="fixed inset-x-0 top-14 z-30 flex w-full items-center gap-2 border-b border-[var(--line)] bg-[var(--panel)]/95 px-3 py-1.5 text-left backdrop-blur-sm sm:hidden"
      >
        <span className="display shrink-0 text-[10px] text-[var(--accent)]">{data.label}</span>
        {leader ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px]">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colors[leader.athlete] }} />
            <span className="truncate font-semibold">{names[leader.athlete]}</span>
            <span className="stat shrink-0 text-[var(--accent)]">{fmt(leader.mark, data.decimals, data.unit)}</span>
          </span>
        ) : (
          <span className="display flex-1 truncate text-[10px] text-[var(--muted)]">Warming up…</span>
        )}
        <span className="display shrink-0 text-[9px] text-[var(--muted)]">{data.remaining} REMAIN</span>
        <span aria-hidden className="shrink-0 text-[var(--muted)]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-[var(--bg)]/97 px-3 pb-8 pt-20 backdrop-blur-md sm:hidden">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="display mx-auto mb-3 rounded-full border border-[var(--line)] px-4 py-1.5 text-[10px] text-[var(--muted)]"
          >
            Close ▲
          </button>
          <ExpandedBoard data={data} names={names} colors={colors} />
        </div>
      )}
    </>
  );
}

function ExpandedBoard({ data, names, colors }: Omit<ScoreboardProps, 'mode'>) {
  const unmarked = data.entries.filter(e => e.mark === null);
  const rows: { athlete: number; mark: number | null }[] = [...data.board, ...unmarked];

  return (
    <div className="w-full">
      <div className="mx-auto mb-3 flex max-w-xl items-center justify-between gap-2 px-1">
        <span className="display text-sm text-[var(--accent)] sm:text-base">{data.label}</span>
        {data.round !== undefined && data.round > 1 && (
          <span className="display rounded border border-[var(--line)] px-1.5 py-0.5 text-[9px] text-[var(--muted)]">
            ROUND {data.round}
          </span>
        )}
      </div>
      <ol className="mx-auto flex max-w-xl flex-col gap-1.5">
        {rows.map((row, i) => (
          <li
            key={row.athlete}
            className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
              i === 0 && row.mark !== null
                ? 'border-[var(--accent)]/60 bg-[var(--accent)]/10'
                : 'border-[var(--line)] bg-[var(--panel)]/90'
            }`}
          >
            <span className={`stat w-6 text-right ${i === 0 && row.mark !== null ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}>
              {i + 1}
            </span>
            <Athlete name={names[row.athlete]} color={colors[row.athlete]} pose="idle" size={40} showName={false} />
            <span className="flex-1 truncate text-sm font-semibold sm:text-base">{names[row.athlete]}</span>
            <span className="stat text-sm sm:text-base">
              {row.mark !== null ? fmt(row.mark, data.decimals, data.unit) : '—'}
            </span>
          </li>
        ))}
      </ol>
      <p className="display mx-auto mt-3 max-w-xl px-1 text-[10px] text-[var(--muted)]">
        {data.remaining} REMAIN · {data.picksLocked}/{data.totalPicks} LOCKED
      </p>
    </div>
  );
}
