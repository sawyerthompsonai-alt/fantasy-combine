import type { ReactNode } from 'react';
import Athlete from '../Athlete';
import LowerThird from '../LowerThird';
import { EVENT_META, type EventResult } from '@/lib/types';
import type { EventPhase } from '@/lib/timeline';
import { laneOrder } from '../turnChoreo';

export interface TurnRenderCtx {
  athlete: number;
  turnIndex: number;
  lanes: number[];
  /** 0..1 progress through this athlete's TURN_MS spotlight window. */
  progress: number;
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
  event, names, colors, phase, phaseElapsedMs, phaseDurationMs, turnIndex, athlete, introMessage, renderTurn,
}: EventFrameProps) {
  const meta = EVENT_META[event.type];
  const lanes = laneOrder(event.competitors);

  if (phase === 'intro') {
    return (
      <>
        <div className="flex flex-1 flex-wrap content-center items-center justify-center gap-4 px-4 pb-28 pt-6 sm:gap-6">
          {lanes.map(a => (
            <Athlete key={a} name={names[a]} color={colors[a]} pose="idle" size={72} />
          ))}
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
    return <>{renderTurn({ athlete: a, turnIndex: k, lanes, progress })}</>;
  }

  if (phase === 'results') {
    return (
      <>
        <div className="flex-1 overflow-y-auto px-3 pb-32 pt-6 sm:px-6">
          <ol className="mx-auto flex max-w-xl flex-col gap-1.5">
            {event.ranking.map((a, i) => {
              const eliminated = event.eliminated.includes(a);
              return (
                <li
                  key={a}
                  className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                    eliminated ? 'border-red-500/40 bg-red-950/20' : 'border-[var(--line)] bg-[var(--panel)]/90'
                  }`}
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
      <div className="flex flex-1 items-center justify-center gap-6 px-4 pb-28 pt-6">
        {cut.map(a => (
          <Athlete key={a} name={names[a]} color={colors[a]} pose="idle" size={96} dimmed />
        ))}
      </div>
      <LowerThird visible tone="alert" label={meta.label} message={message} />
    </>
  );
}
