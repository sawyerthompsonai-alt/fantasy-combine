'use client';
import { useEffect, useRef, useState } from 'react';
import type { PublicRoom } from '@/lib/rooms';
import { lockedPicks, stateAt, type EventPhase } from '@/lib/timeline';
import { finishTimesMs } from '@/lib/race';
import { EVENT_META, type EventResult, type EventType } from '@/lib/types';
import { sound } from '@/lib/sound';
import Field from './scene/Field';
import Athlete, { type AthletePose } from './scene/Athlete';
import LowerThird from './scene/LowerThird';
import BoardInterstitial from './scene/BoardInterstitial';
import DraftBoard from './DraftBoard';
import Confetti from './Confetti';

const easeOut = (t: number) => 1 - Math.pow(1 - t, 2.2);

function poseFor(type: EventType): AthletePose {
  switch (type) {
    case 'bench': return 'lift';
    case 'vertical':
    case 'broad': return 'jump';
    case 'gauntlet': return 'catch';
    default: return 'run'; // forty, threecone, shuttle, champ40
  }
}

/**
 * The turn-based scene shared by every pre-Task-4 event type: a spotlighted
 * performer during `turn`, a ranked leaderboard during `results`, an
 * eliminated-athlete callout during the front half of `elimination` (the
 * back half hands off to BoardInterstitial), and a simultaneous two-lane
 * sprint for the finale's `run` phase. Task 4 replaces this with
 * per-event choreography (DashScene, JumpScene, GauntletScene, BenchScene,
 * FinaleScene); this is the placeholder scene router described in Task 3.
 */
function GenericTurnScene({
  event, names, colors, phase, phaseElapsedMs, phaseDurationMs, turnIndex, athlete,
}: {
  event: EventResult; names: string[]; colors: string[]; phase: EventPhase;
  phaseElapsedMs: number; phaseDurationMs: number; turnIndex?: number; athlete?: number;
}) {
  const meta = EVENT_META[event.type];
  const isFinale = event.type === 'champ40';
  const lanes = [...event.competitors].sort((a, b) => a - b);
  const progress = phaseDurationMs > 0 ? Math.min(1, phaseElapsedMs / phaseDurationMs) : 1;

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
          message={isFinale ? 'HEAD-TO-HEAD · FINAL TWO PICKS' : `${lanes.length} athletes step up`}
        />
      </>
    );
  }

  if (phase === 'turn') {
    const a = athlete ?? lanes[0];
    const pose = poseFor(event.type);
    const revealed = progress >= 0.7;
    const statValue = revealed ? `${event.performances[a].toFixed(meta.decimals)}${meta.unit}` : undefined;
    const travelPct = pose === 'run' ? 8 + easeOut(progress) * 76 : 42;

    return (
      <>
        <div className="relative flex-1 px-4 pb-28 pt-6">
          <p className="display absolute left-4 top-4 text-[10px] text-[var(--muted)] sm:text-xs">
            LANE {(turnIndex ?? 0) + 1} / {lanes.length}
          </p>
          <div
            className="absolute bottom-[16%] transition-[left] duration-100 ease-linear"
            style={{ left: `${travelPct}%`, transform: 'translateX(-50%)' }}
          >
            <Athlete name={names[a]} color={colors[a]} pose={pose} size={88} spotlight />
          </div>
        </div>
        <LowerThird
          visible
          label={meta.label}
          round={event.round}
          athleteName={names[a]}
          athleteColor={colors[a]}
          statValue={statValue}
        />
      </>
    );
  }

  if (phase === 'results') {
    return (
      <>
        <div className="flex-1 overflow-y-auto px-3 pb-32 pt-6 sm:px-6">
          <ol className="mx-auto flex max-w-xl flex-col gap-1.5">
            {event.ranking.map((a, i) => {
              const eliminated = !isFinale && event.eliminated.includes(a);
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
          {isFinale && (
            <p className="display mt-6 text-center text-xl text-[var(--accent)] sm:text-3xl">
              🏆 {names[event.ranking[0]]} locks the #1 pick!
            </p>
          )}
        </div>
        <LowerThird visible label={isFinale ? 'FINAL RESULTS' : `${meta.label} · RESULTS`} round={event.round} />
      </>
    );
  }

  if (phase === 'elimination') {
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

  // phase === 'run' — only ever the finale's simultaneous head-to-head.
  const finishes = finishTimesMs(event.ranking, phaseDurationMs);
  return (
    <>
      <div className="relative flex-1 px-4 pb-28 pt-6">
        {lanes.map((a, i) => {
          const t = Math.min(1, phaseElapsedMs / finishes[a]);
          const travelPct = 8 + easeOut(t) * 76;
          return (
            <div
              key={a}
              className="absolute transition-[left] duration-100 ease-linear"
              style={{ left: `${travelPct}%`, top: `${24 + i * 34}%`, transform: 'translateX(-50%)' }}
            >
              <Athlete name={names[a]} color={colors[a]} pose="run" size={76} spotlight />
            </div>
          );
        })}
      </div>
      <LowerThird visible tone="alert" label="CHAMPIONSHIP 40" message="HEAD-TO-HEAD FOR PICK #1" />
    </>
  );
}

export default function Broadcast({ room, now }: { room: PublicRoom; now: () => number }) {
  const [, tick] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  useEffect(() => {
    const t = setInterval(() => tick(x => x + 1), 100);
    return () => clearInterval(t);
  }, []);

  const outcomes = room.outcomes!;
  const elapsed = now() - (room.startTime ?? now());
  const state = stateAt(outcomes, elapsed);
  const locks = lockedPicks(outcomes, elapsed);
  const allLocked = locks.length === room.names.length;

  const prevRef = useRef({ phaseKey: '', locks: 0 });
  useEffect(() => {
    const prev = prevRef.current;
    const phaseKey = state.kind === 'event' ? `${state.eventIndex}:${state.phase}:${state.turnIndex ?? ''}` : state.kind;
    if (phaseKey !== prev.phaseKey && state.kind === 'event' && (state.phase === 'run' || state.phase === 'turn')) sound.whistle();
    if (locks.length > prev.locks) sound.lock();
    if (locks.length === room.names.length && prev.locks < room.names.length) sound.horn();
    prevRef.current = { phaseKey, locks: locks.length };
  });

  const event = state.kind === 'event' ? outcomes.events[state.eventIndex] : undefined;
  const showMiniRail = state.kind === 'event' && state.phase === 'results';
  const showBoardInterstitial =
    state.kind === 'event' && state.phase === 'elimination' && state.phaseElapsedMs / state.phaseDurationMs >= 0.5;
  const justLocked = event?.picksLocked.length ? event.picksLocked[event.picksLocked.length - 1].pick : undefined;

  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden">
      <Field>
        {state.kind === 'pregame' && (
          <div className="flex flex-1 items-center justify-center px-4">
            <p className="display text-xl text-[var(--muted)] sm:text-3xl">On the clock…</p>
          </div>
        )}

        {state.kind === 'event' && event && (
          <GenericTurnScene
            event={event}
            names={room.names}
            colors={room.colors}
            phase={state.phase}
            phaseElapsedMs={state.phaseElapsedMs}
            phaseDurationMs={state.phaseDurationMs}
            turnIndex={state.turnIndex}
            athlete={state.athlete}
          />
        )}

        {state.kind === 'final' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
            <p className="display text-xs text-[var(--accent)]">That’s a wrap</p>
            <h2 className="display text-3xl sm:text-5xl">🏆 {room.names[outcomes.order[0]]}</h2>
            <p className="display text-sm text-[var(--muted)] sm:text-base">takes the #1 pick</p>
            <div className="mt-4 w-full max-w-3xl">
              <DraftBoard names={room.names} colors={room.colors} locks={locks} total={room.names.length} />
            </div>
          </div>
        )}
      </Field>

      {showMiniRail && (
        <div className="pointer-events-none fixed inset-x-0 top-14 z-10 px-3 sm:top-16">
          <div className="pointer-events-auto mx-auto max-w-3xl overflow-x-auto rounded-md border border-[var(--line)] bg-[var(--bg)]/85 px-2 py-1.5 backdrop-blur-sm">
            <DraftBoard names={room.names} colors={room.colors} locks={locks} total={room.names.length} compact />
          </div>
        </div>
      )}

      {showBoardInterstitial && event && (
        <BoardInterstitial names={room.names} colors={room.colors} locks={locks} total={room.names.length} justLocked={justLocked} />
      )}

      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-3 pt-[max(0.6rem,env(safe-area-inset-top))] sm:px-5">
        <span className="live-dot display flex items-center gap-1.5 text-[11px] text-[var(--accent)] sm:text-xs">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          LIVE
        </span>
        <button
          onClick={() => {
            if (soundOn) sound.disable();
            else sound.enable();
            setSoundOn(!soundOn);
          }}
          className="display flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--bg)]/70 px-3 py-1.5 text-[10px] text-[var(--text)] backdrop-blur-sm sm:text-xs"
        >
          <span aria-hidden>{soundOn ? '🔊' : '🔇'}</span>
          Sound {soundOn ? 'on' : 'off'}
        </button>
      </header>

      {allLocked && <Confetti colors={room.colors} />}
    </div>
  );
}
