import type { ReactNode } from 'react';
import Athlete from '../Athlete';
import LowerThird from '../LowerThird';
import { EVENT_META, type EventResult } from '@/lib/types';
import type { EventPhase } from '@/lib/timeline';
import type { AthleteBio } from '@/lib/jokes';
import { laneOrder, walkUpSubline, easeOut, clamp01 } from '../turnChoreo';

export interface TurnRenderCtx {
  athlete: number;
  turnIndex: number;
  lanes: number[];
  /** 0..1 progress through this athlete's TURN_MS spotlight window. */
  progress: number;
  /** Walk-up "nickname · measurable" line for the LowerThird's subline,
   * populated only during the early window (see `walkUpSubline`) —
   * `undefined` the rest of the turn. */
  subline?: string;
}

export interface EventFrameProps {
  event: EventResult;
  names: string[];
  colors: string[];
  phase: EventPhase;
  phaseElapsedMs: number;
  phaseDurationMs: number;
  turnIndex?: number;
  athlete?: number;
  /** Intro-phase blurb; defaults to "N athletes step up". */
  introMessage?: string;
  /** Only invoked while phase === 'turn' — the per-event scene supplies the
   * actual choreography (path, prop, pose) for that one spotlighted rep. */
  renderTurn: (ctx: TurnRenderCtx) => ReactNode;
  /** Results-phase leaderboard, e.g. `<Scoreboard mode="expanded" .../>`.
   * When supplied, replaces this component's own inline ranking list
   * (which still renders when the prop is absent, for backward
   * compatibility with any caller that doesn't pass one). */
  scoreboard?: ReactNode;
  /** Per-athlete comedy bios (Task 1/7's `athleteBios`) — drives the turn
   * walk-up subline. Absent renders no subline (e.g. any caller that
   * doesn't pass one). */
  bios?: AthleteBio[];
  /** Elimination farewell line for one cut athlete, e.g. Task 1's
   * `farewellLine` bound to the room's joke seed. Absent renders no roast
   * copy under the ELIMINATED beat. */
  roast?: (athlete: number) => string;
}

/**
 * The phases every non-finale event shares: `intro` (lineup), `turn`
 * (delegated to the caller's renderTurn), `results` (ranked leaderboard,
 * last place flagged), and the front half of `elimination` (eliminated
 * athlete spotlight — the back half hands off to BoardInterstitial). Keeps
 * DashScene/JumpScene/GauntletScene/BenchScene from re-deriving the same
 * lineup/leaderboard/cut chrome four times over.
 */
export default function EventFrame({
  event, names, colors, phase, phaseElapsedMs, phaseDurationMs, turnIndex, athlete, introMessage, renderTurn, scoreboard,
  bios, roast,
}: EventFrameProps) {
  const meta = EVENT_META[event.type];
  const lanes = laneOrder(event.competitors);

  if (phase === 'intro') {
    // No-teleport walk-in (Task 15): each lane walks on from the left
    // sideline instead of popping in place. The lineup renders in normal
    // flex-wrap flow (not absolute % coordinates, unlike the per-event
    // turn choreography), so "from the sideline" here is a px offset
    // applied via transform — same convention ShowOpen's walk-up uses
    // (WALK_OFFSET_PX) — rather than a stage-relative percentage, which
    // wouldn't mean anything against a flex layout.
    //
    // Stagger start times scale with lane count (0.5 of phaseDurationMs
    // spread across all lanes) so the *last* lane always has its full
    // travel window left before the intro phase ends, however many
    // competitors are lined up (as few as 2, as many as a full field).
    // Pure function of (phaseElapsedMs, phaseDurationMs, lane index) — no
    // timers, no CSS animation-delay tied to mount time — so a late joiner
    // lands on exactly the walk-in frame a continuous viewer would see.
    const staggerMs = phaseDurationMs > 0 ? (0.5 * phaseDurationMs) / Math.max(lanes.length, 1) : 0;
    const travelMs = phaseDurationMs * 0.35;
    return (
      <>
        <div className="flex flex-1 flex-wrap content-center items-center justify-center gap-4 px-4 pb-28 pt-6 sm:gap-6">
          {lanes.map((a, i) => {
            const startMs = i * staggerMs;
            const u = travelMs > 0 ? clamp01((phaseElapsedMs - startMs) / travelMs) : 1;
            const eased = easeOut(u);
            return (
              <div key={a} style={{ transform: `translateX(${-90 * (1 - eased)}px)`, opacity: eased }}>
                <Athlete name={names[a]} color={colors[a]} pose={u >= 1 ? 'idle' : 'walk'} size={72} />
              </div>
            );
          })}
        </div>
        <LowerThird
          visible
          label={meta.label}
          round={event.round}
          message={introMessage ?? `${lanes.length} athletes step up`}
        />
      </>
    );
  }

  if (phase === 'turn') {
    const a = athlete ?? lanes[0];
    const k = turnIndex ?? 0;
    const progress = phaseDurationMs > 0 ? Math.min(1, phaseElapsedMs / phaseDurationMs) : 1;
    const subline = walkUpSubline(progress, event.type, bios?.[a], k);
    return <>{renderTurn({ athlete: a, turnIndex: k, lanes, progress, subline })}</>;
  }

  if (phase === 'results') {
    return (
      <>
        <div className="flex-1 overflow-y-auto px-3 pb-32 pt-6 sm:px-6">
          {scoreboard ?? (
            // Task 15 review (Finding 2): this `.row-in` stagger is inert in
            // production today — Broadcast.tsx always supplies a populated
            // `scoreboard` (Scoreboard.tsx's ExpandedBoard) for real events'
            // results phase, so this inline `<ol>` fallback only actually
            // renders for a caller that doesn't pass one (e.g. a future
            // integration, or a test). Left as-is rather than wired into
            // ExpandedBoard: Scoreboard.tsx is outside this task's file
            // scope, and the real results screen already gets a non-pop
            // entrance from Broadcast's Step 3 phase crossfade wrapping the
            // whole results block. Tracked as a follow-up, not a bug.
            <ol className="mx-auto flex max-w-xl flex-col gap-1.5">
              {event.ranking.map((a, i) => {
                const eliminated = event.eliminated.includes(a);
                return (
                  <li
                    key={a}
                    className={`row-in flex items-center gap-3 rounded-md border px-3 py-2 ${
                      eliminated ? 'border-red-500/40 bg-red-950/20' : 'border-[var(--line)] bg-[var(--panel)]/90'
                    }`}
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <span className="stat w-6 text-right text-[var(--muted)]">{i + 1}</span>
                    <Athlete name={names[a]} color={colors[a]} pose="idle" size={40} showName={false} dimmed={eliminated} />
                    <span className="flex-1 truncate text-sm font-semibold sm:text-base">{names[a]}</span>
                    <span className="stat text-sm sm:text-base">
                      {event.performances[a].toFixed(meta.decimals)}{meta.unit}
                    </span>
                    {eliminated && <span className="display text-[10px] text-red-400">CUT</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <LowerThird visible label={`${meta.label} · RESULTS`} round={event.round} />
      </>
    );
  }

  // phase === 'elimination' (this component is never rendered during the
  // finale's 'run' phase — champ40 uses FinaleScene instead).
  const progress = phaseDurationMs > 0 ? Math.min(1, phaseElapsedMs / phaseDurationMs) : 1;
  if (progress >= 0.5) return null; // second half hands off to BoardInterstitial
  const cut = event.eliminated;
  const pickFor = (a: number) => event.picksLocked.find(l => l.athlete === a)?.pick;
  const message =
    cut.length === 1
      ? `ELIMINATED · PICK #${pickFor(cut[0])} LOCKED`
      : `${cut.length} ELIMINATED · PICKS LOCKED`;
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pb-28 pt-6">
        <div className="flex flex-wrap items-center justify-center gap-6">
          {cut.map((a, i) => (
            <div key={a} className="row-in" style={{ animationDelay: `${i * 40}ms` }}>
              <Athlete name={names[a]} color={colors[a]} pose="idle" size={96} dimmed />
            </div>
          ))}
        </div>
        {roast && (
          <div className="flex max-w-md flex-col items-center gap-1 text-center">
            {cut.map(a => (
              <p key={a} className="max-w-full truncate px-2 text-xs italic text-[var(--muted)] sm:text-sm">
                {roast(a)}
              </p>
            ))}
          </div>
        )}
      </div>
      <LowerThird visible tone="alert" label={meta.label} message={message} />
    </>
  );
}
