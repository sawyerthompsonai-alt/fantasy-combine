'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { PublicRoom } from '@/lib/rooms';
import { lockedPicks, stateAt, type EventPhase } from '@/lib/timeline';
import type { EventResult } from '@/lib/types';
import { sound } from '@/lib/sound';
import { STAT_REVEAL_FRACTION } from './scene/turnChoreo';
import Field from './scene/Field';
import BoardInterstitial from './scene/BoardInterstitial';
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

export default function Broadcast({ room, now, replay = false }: { room: PublicRoom; now: () => number; replay?: boolean }) {
  const [, tick] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  // Replay's local clock: elapsed runs from 0 as of mount, ignoring
  // startTime/serverNow entirely. `Date.now()` is only ever read inside the
  // interval effect below (never during render) to keep the component pure;
  // `mountTime`/`replayNowMs` are the render-safe snapshots of it.
  const [mountTime] = useState(() => Date.now());
  const [replayNowMs, setReplayNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      tick(x => x + 1);
      setReplayNowMs(Date.now());
    }, 100);
    return () => clearInterval(t);
  }, []);

  const outcomes = room.outcomes!;
  const elapsed = replay ? replayNowMs - mountTime : now() - (room.startTime ?? now());
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
          <EventScene
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
