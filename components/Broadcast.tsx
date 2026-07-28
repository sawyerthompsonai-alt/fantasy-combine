'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { PublicRoom } from '@/lib/rooms';
import { lockedPicks, stateAt, type BroadcastState, type EventPhase } from '@/lib/timeline';
import { scoreboardAt } from '@/lib/scoreboard';
import type { EventResult } from '@/lib/types';
import { sound } from '@/lib/sound';
import { useAnimationNow } from '@/lib/useAnimationNow';
import { STAT_REVEAL_FRACTION } from './scene/turnChoreo';
import Field, { type SceneSet } from './scene/Field';
import BoardInterstitial from './scene/BoardInterstitial';
import Scoreboard from './Scoreboard';
import DashScene from './scene/events/DashScene';
import JumpScene from './scene/events/JumpScene';
import GauntletScene from './scene/events/GauntletScene';
import BenchScene from './scene/events/BenchScene';
import FinaleScene from './scene/events/FinaleScene';
import DraftBoard from './DraftBoard';
import Confetti from './Confetti';

interface EventSceneProps {
  event: EventResult; names: string[]; colors: string[]; phase: EventPhase;
  phaseElapsedMs: number; phaseDurationMs: number; turnIndex?: number; athlete?: number;
  /** Results-phase leaderboard passed through to EventFrame (see
   * EventFrameProps.scoreboard) — FinaleScene (champ40) ignores it, since
   * the finale keeps its own champion-banner results screen. */
  scoreboard?: ReactNode;
}

/** Routes each event to its per-event choreography by type: straight/weave/
 * shuttle sprints, the two jump events, the ball gauntlet, the bench rack,
 * and the champ40 head-to-head finale. */
function EventScene(props: EventSceneProps) {
  switch (props.event.type) {
    case 'champ40': return <FinaleScene {...props} />;
    case 'bench': return <BenchScene {...props} />;
    case 'vertical':
    case 'broad': return <JumpScene {...props} />;
    case 'gauntlet': return <GauntletScene {...props} />;
    default: return <DashScene {...props} />; // forty, threecone, shuttle
  }
}

/** Picks the Field backdrop for the current broadcast state: each event
 * type gets its own set (bench → weight room, vertical/broad → jump
 * station, gauntlet → sideline); the sprint/finale events run on the
 * panning track set only while athletes are actually moving (`turn`/`run`)
 * and fall back to the static field otherwise; open/pregame/final always
 * use the static field. */
function setFor(state: BroadcastState, event: EventResult | undefined): SceneSet {
  if (state.kind !== 'event' || !event) return 'field';
  switch (event.type) {
    case 'bench': return 'weightroom';
    case 'vertical':
    case 'broad': return 'jumpstation';
    case 'gauntlet': return 'sideline';
    default: // forty, threecone, shuttle, champ40
      return state.phase === 'turn' || state.phase === 'run' ? 'track' : 'field';
  }
}

export default function Broadcast({ room, now, replay = false }: { room: PublicRoom; now: () => number; replay?: boolean }) {
  const [soundOn, setSoundOn] = useState(false);
  // Replay's local clock: elapsed runs from 0 as of mount, ignoring
  // startTime/serverNow entirely. `Date.now()` is only ever read inside the
  // rAF loop in useAnimationNow (never during render) to keep the component
  // pure; `mountTime`/`nowMs` are the render-safe snapshots of it.
  const [mountTime] = useState(() => Date.now());
  const nowMs = useAnimationNow();

  const outcomes = room.outcomes!;
  const elapsed = replay ? nowMs - mountTime : now() - (room.startTime ?? now());
  const state = stateAt(outcomes, elapsed);
  const locks = lockedPicks(outcomes, elapsed);
  const allLocked = locks.length === room.names.length;

  const prevRef = useRef({ turnKey: '', poppedKey: '', locks: 0, finalFired: false });
  useEffect(() => {
    const prev = prevRef.current;
    const turnKey = state.kind === 'event' ? `${state.eventIndex}:${state.phase}:${state.turnIndex ?? ''}` : state.kind;

    // Whistle at each turn/run start.
    if (turnKey !== prev.turnKey && state.kind === 'event' && (state.phase === 'run' || state.phase === 'turn')) {
      sound.whistle();
    }

    // Stat "pop" once a turn crosses the shared reveal fraction (matches the
    // per-scene countUpStat lock point) — fires once per turn.
    if (state.kind === 'event' && state.phase === 'turn') {
      const progress = state.phaseDurationMs > 0 ? state.phaseElapsedMs / state.phaseDurationMs : 1;
      if (progress >= STAT_REVEAL_FRACTION && prev.poppedKey !== turnKey) {
        sound.pop();
        prev.poppedKey = turnKey;
      }
    }

    // Elimination horn at that event's lock; a subtler chime for any other
    // pick lock (the finale's pick-#2 lock mid-results).
    if (locks.length > prev.locks) {
      if (state.kind === 'event' && state.phase === 'elimination') sound.horn();
      else sound.lock();
    }

    // Finale crowd swell + the existing confetti horn once the broadcast
    // resolves to the champion screen.
    if (state.kind === 'final' && !prev.finalFired) {
      sound.swell();
      sound.horn();
      prev.finalFired = true;
    }

    prevRef.current = { turnKey, poppedKey: prev.poppedKey, locks: locks.length, finalFired: prev.finalFired };
  });

  const event = state.kind === 'event' ? outcomes.events[state.eventIndex] : undefined;
  const showBoardInterstitial =
    state.kind === 'event' && state.phase === 'elimination' && state.phaseElapsedMs / state.phaseDurationMs >= 0.5;
  const justLocked = event?.picksLocked.length ? event.picksLocked[event.picksLocked.length - 1].pick : undefined;

  // Persistent jumbotron scoreboard — pure function of (outcomes, elapsed),
  // so it reads identically for every viewer. Docked (desktop) + ticker
  // (mobile) ride alongside the action during intro/turn; during results,
  // its expanded form is handed to EventFrame in place of the inline
  // leaderboard (FinaleScene ignores it and keeps its own champion banner).
  const sb = scoreboardAt(outcomes, elapsed);
  const showDockedTicker = sb !== null && state.kind === 'event' && (state.phase === 'intro' || state.phase === 'turn');
  const scoreboardNode: ReactNode | undefined =
    sb !== null && state.kind === 'event' && state.phase === 'results'
      ? <Scoreboard data={sb} names={room.names} colors={room.colors} mode="expanded" />
      : undefined;

  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden">
      <Field set={setFor(state, event)}>
        {state.kind === 'pregame' && (
          <div className="flex flex-1 items-center justify-center px-4">
            <p className="display text-xl text-[var(--muted)] sm:text-3xl">On the clock…</p>
          </div>
        )}

        {/* Temporary placeholder — Task 7 replaces this with the real
            ShowOpen scene (title card + per-manager walk-up). */}
        {state.kind === 'open' && (
          <div className="flex flex-1 items-center justify-center">
            <p className="display text-2xl">THE FANTASY DRAFT COMBINE</p>
          </div>
        )}

        {state.kind === 'event' && event && (
          <EventScene
            event={event}
            names={room.names}
            colors={room.colors}
            phase={state.phase}
            phaseElapsedMs={state.phaseElapsedMs}
            phaseDurationMs={state.phaseDurationMs}
            turnIndex={state.turnIndex}
            athlete={state.athlete}
            scoreboard={scoreboardNode}
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

      {showDockedTicker && sb && (
        <>
          <Scoreboard data={sb} names={room.names} colors={room.colors} mode="docked" />
          <Scoreboard data={sb} names={room.names} colors={room.colors} mode="ticker" />
        </>
      )}

      {showBoardInterstitial && event && (
        <BoardInterstitial names={room.names} colors={room.colors} locks={locks} total={room.names.length} justLocked={justLocked} />
      )}

      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-3 pt-[max(0.6rem,env(safe-area-inset-top))] sm:px-5">
        <div className="flex items-center gap-2">
          {replay ? (
            <span className="display flex items-center gap-1.5 rounded-full border border-[var(--accent)]/50 bg-[var(--bg)]/70 px-3 py-1.5 text-[11px] text-[var(--accent)] backdrop-blur-sm sm:text-xs">
              <span aria-hidden>▶</span> REPLAY
            </span>
          ) : (
            <span className="live-dot display flex items-center gap-1.5 text-[11px] text-[var(--accent)] sm:text-xs">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
              LIVE
            </span>
          )}
          {replay && (
            <Link
              href={`/r/${room.id}`}
              className="display text-[10px] text-[var(--muted)] underline underline-offset-2 sm:text-xs"
            >
              Exit replay
            </Link>
          )}
        </div>
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
