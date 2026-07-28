'use client';
import Athlete from '../Athlete';
import LowerThird from '../LowerThird';
import { finishTimesMs } from '@/lib/race';
import {
  FINALE_PICK2_LOCK_OFFSET_MS, FINALE_PICK1_LOCK_OFFSET_MS, type EventPhase,
} from '@/lib/timeline';
import { easeOut, clamp01 } from '../turnChoreo';
import { EVENT_META, type EventResult } from '@/lib/types';

/** Progress fraction of the `run` phase at which the race visually freezes
 * for the photo finish beat. */
const FREEZE_FRACTION = 0.85;
/** Progress fraction at which the camera begins zooming in toward the
 * finish line, reaching full zoom at FREEZE_FRACTION. */
const ZOOM_START_FRACTION = 0.68;

/**
 * The champ40 finale: simultaneous head-to-head over the `run` phase (no
 * per-athlete turns, no elimination phase — see lib/timeline.ts), a
 * near-tie race that freezes into a photo finish near the end, then a
 * champion banner during `results` as picks #2 and #1 lock in sequence.
 */
export default function FinaleScene({
  event, names, colors, phase, phaseElapsedMs, phaseDurationMs,
}: {
  event: EventResult; names: string[]; colors: string[]; phase: EventPhase;
  phaseElapsedMs: number; phaseDurationMs: number;
}) {
  const meta = EVENT_META.champ40;
  const lanes = [...event.competitors].sort((a, b) => a - b);
  const champion = event.ranking[0];
  const runnerUp = event.ranking[1];

  if (phase === 'intro') {
    return (
      <>
        <div className="relative flex flex-1 items-center justify-center gap-10 px-4 pb-28 pt-6 sm:gap-20">
          {lanes.map(a => (
            <Athlete key={a} name={names[a]} color={colors[a]} pose="idle" size={96} spotlight />
          ))}
          <p className="display pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl text-[var(--accent)]/70 sm:text-5xl">
            VS
          </p>
        </div>
        <LowerThird visible tone="alert" label={meta.label} round={event.round} message="HEAD-TO-HEAD · FINAL TWO PICKS" />
      </>
    );
  }

  if (phase === 'run') {
    const progress = phaseDurationMs > 0 ? clamp01(phaseElapsedMs / phaseDurationMs) : 1;
    const framedProgress = Math.min(progress, FREEZE_FRACTION);
    const finishes = finishTimesMs(event.ranking, phaseDurationMs);
    const frozen = progress >= FREEZE_FRACTION;
    const zoomT = clamp01((framedProgress - ZOOM_START_FRACTION) / (FREEZE_FRACTION - ZOOM_START_FRACTION));
    const zoomScale = 1 + zoomT * 0.16;

    return (
      <>
        <div
          className="relative flex-1 overflow-hidden px-4 pb-28 pt-6 transition-transform duration-300 ease-out"
          style={{ transform: `scale(${zoomScale})`, transformOrigin: '82% 55%' }}
        >
          {lanes.map((a, i) => {
            const t = Math.min(1, (phaseDurationMs * framedProgress) / finishes[a]);
            const travelPct = 8 + easeOut(t) * 76;
            return (
              <div
                key={a}
                className="absolute"
                style={{ left: `${travelPct}%`, top: `${26 + i * 36}%`, transform: 'translateX(-50%)', transition: 'left 100ms linear' }}
              >
                <Athlete name={names[a]} color={colors[a]} pose="run" size={80} spotlight />
              </div>
            );
          })}
          {frozen && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="display animate-pulse text-2xl text-white/90 sm:text-4xl">📸 PHOTO FINISH</p>
            </div>
          )}
        </div>
        <LowerThird
          visible
          tone="alert"
          label={meta.label}
          message={frozen ? 'PHOTO FINISH…' : 'HEAD-TO-HEAD FOR PICK #1'}
        />
      </>
    );
  }

  // results: champion banner while pick #2 then pick #1 lock in sequence.
  const pick2Locked = phaseElapsedMs >= FINALE_PICK2_LOCK_OFFSET_MS;
  const pick1Locked = phaseElapsedMs >= FINALE_PICK1_LOCK_OFFSET_MS;

  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-28 pt-6 text-center">
        <div className="flex items-center gap-8 sm:gap-14">
          <Athlete name={names[champion]} color={colors[champion]} pose="idle" size={110} spotlight />
          <Athlete name={names[runnerUp]} color={colors[runnerUp]} pose="idle" size={90} dimmed={pick2Locked} />
        </div>
        {pick1Locked ? (
          <p className="display text-2xl text-[var(--accent)] sm:text-4xl">🏆 {names[champion]} locks the #1 pick!</p>
        ) : pick2Locked ? (
          <p className="display text-xl text-[var(--text)] sm:text-2xl">{names[runnerUp]} locks pick #2…</p>
        ) : (
          <p className="display text-lg text-[var(--muted)] sm:text-xl">tabulating the finish…</p>
        )}
      </div>
      <LowerThird
        visible
        tone={pick1Locked ? 'default' : 'alert'}
        label="FINAL RESULTS"
        message={
          pick1Locked
            ? `${names[champion]} · PICK #1`
            : pick2Locked
            ? `${names[runnerUp]} · PICK #2 LOCKED`
            : `${meta.label} · RESULTS`
        }
      />
    </>
  );
}
