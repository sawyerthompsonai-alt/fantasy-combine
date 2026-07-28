'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { PublicRoom } from '@/lib/rooms';
import { lockedPicks, stateAt, transitionAt, type BroadcastState, type EventPhase } from '@/lib/timeline';
import { scoreboardAt, leaderAt, leaderChangedRecently } from '@/lib/scoreboard';
import type { EventResult } from '@/lib/types';
import { athleteBios, farewellLine, type AthleteBio } from '@/lib/jokes';
import { sound } from '@/lib/sound';
import { useAnimationNow } from '@/lib/useAnimationNow';
import { STAT_REVEAL_FRACTION, SPRINT_START_FRAC, FINALE_GUN_FRACTION } from './scene/turnChoreo';
import Field, { type SceneSet } from './scene/Field';
import ShowOpen from './scene/ShowOpen';
import BoardInterstitial from './scene/BoardInterstitial';
import WipeOverlay from './scene/WipeOverlay';
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
  bios?: AthleteBio[];
  roast?: (athlete: number) => string;
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
  const [nowMs, setClockActive] = useAnimationNow();

  const outcomes = room.outcomes!;
  const elapsed = replay ? nowMs - mountTime : now() - (room.startTime ?? now());
  const state = stateAt(outcomes, elapsed);
  // Gates the rAF loop off once the derived state has settled into `final`
  // — otherwise it free-runs forever on the replay end screen (the room is
  // already 'complete', so nothing ever unmounts Broadcast the way the live
  // path's 5s status poll does), re-rendering the whole tree 60x/sec with
  // zero visual change. `setClockActive` mutates a ref inside
  // useAnimationNow rather than triggering a re-render itself, so calling
  // it here is just telling the already-running loop whether to keep
  // scheduling itself — not a state update that needs its own dependency
  // dance. Effect (not render-body) because refs must never be
  // read/written during render.
  useEffect(() => {
    setClockActive(state.kind !== 'final');
  }, [state.kind, setClockActive]);
  const locks = lockedPicks(outcomes, elapsed);
  // Broadcast wipe (Task 15): non-null for a WIPE_MS window straddling each
  // inter-block gap's end — see lib/timeline.ts's transitionAt. Pure
  // function of (outcomes, elapsed), so a late joiner lands on the correct
  // sweep position instead of a replayed animation.
  const wipe = transitionAt(outcomes, elapsed);
  const allLocked = locks.length === room.names.length;
  // Stable identity for Confetti's colors prop: `room.colors` is a fresh
  // array on every poll (live) or on every parent re-render (replay), and
  // Confetti's one-time piece generation keys off that array's identity
  // (see components/Confetti.tsx's `useEffect(..., [colors])`) — without
  // this, all 120 pieces silently restarted from the top on every poll,
  // forever, on the replay end screen. Same fix Task 13 applied to
  // FinaleScene's championConfettiColors. `colorsKey` is the joined values
  // (a plain string, recomputed every render but only ever *changing* when
  // the actual colors do) so `confettiColors` only produces a new array
  // identity when the content genuinely changes — colors are '#rrggbb' hex
  // strings (see lib/rooms.ts's COLORS), so a ',' join/split round-trips
  // safely. Written this way (deriving the returned array from the same
  // primitive listed in the deps array) rather than `[room.colors.join(',')]`
  // directly in the deps position so react-hooks/exhaustive-deps can
  // statically verify it — that rule requires deps to be simple expressions.
  const colorsKey = room.colors.join(',');
  const confettiColors = useMemo(() => colorsKey.split(','), [colorsKey]);

  // Joke seed: `room.seedHash` (not `room.seed`, which is only revealed once
  // the room is `complete`) is present from the lobby onward, identical for
  // every viewer, stable across replays of the same room, and reveals
  // nothing about the outcome — safe to use for the cold open's bios here
  // and for Task 14's farewell lines later. Memoized so identity is stable
  // across renders (bios is passed down as a prop).
  const bios = useMemo(() => athleteBios(room.seedHash, room.names.length), [room.seedHash, room.names.length]);
  // Same seed source as `bios` above — elimination farewell lines are just
  // as safe to derive pre-completion as the cold-open bios are.
  const roast = (a: number) => farewellLine(room.seedHash, a, room.names[a]);

  const event = state.kind === 'event' ? outcomes.events[state.eventIndex] : undefined;

  const prevRef = useRef({
    turnKey: '', poppedKey: '', whistledKey: '', locks: 0, finalFired: false,
    leaderAthlete: undefined as number | undefined,
  });
  useEffect(() => {
    const prev = prevRef.current;
    const turnKey =
      state.kind === 'event' ? `${state.eventIndex}:${state.phase}:${state.turnIndex ?? ''}`
      : state.kind === 'open' && state.phase === 'walkup' ? `open:walkup:${state.walkupIndex}`
      : state.kind;

    // Dash-type turns (forty/threecone/shuttle) fire the whistle at the gun
    // — turn progress crossing SPRINT_START_FRAC — instead of at turn start,
    // so it lands on DashScene's stance-hold beat instead of the walk-in.
    // Every other turn/run-phase event keeps the original turn-start cue.
    const isDashTurn =
      state.kind === 'event' && state.phase === 'turn' && event &&
      (event.type === 'forty' || event.type === 'threecone' || event.type === 'shuttle');

    // The finale's head-to-head fires its gun at FINALE_GUN_FRACTION into
    // the `run` phase (the hold/"SET…" beat before it), same edge-trigger
    // shape as the dash gun above but champ40-specific.
    const isFinaleRun = state.kind === 'event' && state.phase === 'run' && event?.type === 'champ40';

    if (isDashTurn) {
      const progress = state.phaseDurationMs > 0 ? state.phaseElapsedMs / state.phaseDurationMs : 1;
      if (progress >= SPRINT_START_FRAC && prev.whistledKey !== turnKey) {
        sound.whistle();
        prev.whistledKey = turnKey;
      }
    } else if (isFinaleRun) {
      const progress = state.phaseDurationMs > 0 ? state.phaseElapsedMs / state.phaseDurationMs : 1;
      if (progress >= FINALE_GUN_FRACTION && prev.whistledKey !== turnKey) {
        sound.whistle();
        prev.whistledKey = turnKey;
      }
    } else if (turnKey !== prev.turnKey && state.kind === 'event' && (state.phase === 'run' || state.phase === 'turn')) {
      sound.whistle();
    }

    // Cold open: a swell as the title card comes up, a pop as each walk-up
    // starts (edge-triggered on turnKey, same guard pattern as the rest of
    // this effect — it runs every animation frame).
    if (turnKey !== prev.turnKey && state.kind === 'open') {
      if (state.phase === 'title') sound.swell();
      else sound.pop();
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

    // NEW LEADER punch: a pop the instant the current event's leader
    // identity actually changes — edge-triggered on the stored previous
    // leader, same prevRef pattern as every other cue above (this whole
    // effect runs every animation frame). Guarded the same way as the
    // visual chip's `leaderChangedRecently` (see lib/scoreboard.ts): a
    // leader merely *appearing* (prev undefined -> some athlete, e.g. a
    // turn's first mark posting) never fires, only a genuine change of
    // who's on top.
    const currentLeader = leaderAt(outcomes, elapsed);
    if (currentLeader !== undefined && prev.leaderAthlete !== undefined && currentLeader !== prev.leaderAthlete) {
      sound.pop();
    }

    prevRef.current = {
      turnKey, poppedKey: prev.poppedKey, whistledKey: prev.whistledKey, locks: locks.length, finalFired: prev.finalFired,
      leaderAthlete: currentLeader,
    };
  });

  const showBoardInterstitial =
    state.kind === 'event' && state.phase === 'elimination' && state.phaseElapsedMs / state.phaseDurationMs >= 0.5;
  const justLockedEntry = event?.picksLocked.length ? event.picksLocked[event.picksLocked.length - 1] : undefined;
  const justLocked = justLockedEntry?.pick;

  // Persistent jumbotron scoreboard — pure function of (outcomes, elapsed),
  // so it reads identically for every viewer. Docked (desktop) + ticker
  // (mobile) ride alongside the action during intro/turn; during results,
  // its expanded form is handed to EventFrame in place of the inline
  // leaderboard (FinaleScene ignores it and keeps its own champion banner).
  const sb = scoreboardAt(outcomes, elapsed);
  const showDockedTicker = sb !== null && state.kind === 'event' && (state.phase === 'intro' || state.phase === 'turn');
  // Engagement punch: a purely elapsed-derived flag (no stored state — see
  // lib/scoreboard.ts's leaderChangedRecently) driving the docked
  // scoreboard's "NEW LEADER" chip. Reads correctly for a late joiner: they
  // land somewhere in this ~600ms window exactly as often as a continuous
  // viewer would, rather than never seeing it because they missed the
  // instant the change happened.
  const newLeader = leaderChangedRecently(outcomes, elapsed);
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

        {state.kind === 'open' && (
          <ShowOpen
            phase={state.phase}
            athlete={state.athlete}
            walkupIndex={state.walkupIndex}
            phaseElapsedMs={state.phaseElapsedMs}
            phaseDurationMs={state.phaseDurationMs}
            names={room.names}
            colors={room.colors}
            bios={bios}
          />
        )}

        {state.kind === 'event' && event && (
          // Phase crossfade (Task 15): a keyed wrapper remounts on every
          // phase change (and every turn->turn change within a phase, via
          // the turnIndex segment of the key) so `.fade-in-phase`'s 280ms
          // opacity animation replays — a quick crossfade instead of a hard
          // cut between segments. Opacity-only (see globals.css) so this
          // wrapper never becomes a transform containing block for
          // LowerThird (`fixed`) or TrackLines (`absolute inset-0`, the
          // Task 5/13 trap) nested inside EventScene.
          <div
            key={`${state.eventIndex}:${state.phase}:${state.turnIndex ?? ''}`}
            className="flex flex-1 flex-col fade-in-phase"
          >
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
              bios={bios}
              roast={roast}
            />
          </div>
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
          <Scoreboard data={sb} names={room.names} colors={room.colors} mode="docked" leaderChangedRecently={newLeader} />
          <Scoreboard data={sb} names={room.names} colors={room.colors} mode="ticker" />
        </>
      )}

      {showBoardInterstitial && event && (
        <BoardInterstitial
          names={room.names}
          colors={room.colors}
          locks={locks}
          total={room.names.length}
          justLocked={justLocked}
          roastLine={justLockedEntry ? roast(justLockedEntry.athlete) : undefined}
        />
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

      {allLocked && <Confetti colors={confettiColors} />}

      {wipe && <WipeOverlay t={wipe.t} />}
    </div>
  );
}
