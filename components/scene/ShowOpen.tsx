'use client';
import type { CSSProperties } from 'react';
import Athlete from './Athlete';
import { easeOut, clamp01 } from './turnChoreo';
import type { AthleteBio } from '@/lib/jokes';
import type { OpenPhase } from '@/lib/timeline';

export interface ShowOpenProps {
  phase: OpenPhase;
  athlete?: number;
  walkupIndex?: number;
  phaseElapsedMs: number;
  phaseDurationMs: number;
  names: string[];
  colors: string[];
  bios: AthleteBio[];
}

// Title-card stagger thresholds (ms into the 'title' phase) — kicker, then
// headline, then the LIVE chip. Each line's own fade/slide is driven purely
// by `phaseElapsedMs` vs these thresholds (no CSS animation tied to mount
// time), so a viewer who lands mid-title sees every earlier line already
// settled and only the later ones still animating in.
const KICKER_AT_MS = 600;
const HEADLINE_AT_MS = 1400;
const CHIP_AT_MS = 2200;
const LINE_FADE_MS = 650;

function lineStyle(elapsedMs: number, startMs: number): CSSProperties {
  const t = easeOut(clamp01((elapsedMs - startMs) / LINE_FADE_MS));
  return { opacity: t, transform: `translateY(${(1 - t) * 18}px)` };
}

// Walk-up beats, as fractions of the 2.5s WALKUP_MS phase.
const WALK_FRAC = 0.4; // athlete travel finishes at 40% of the phase
const WALK_OFFSET_PX = 180; // how far off-frame the figure starts
const CARD_START_FRAC = 0.15;
const CARD_END_FRAC = 0.55;

/**
 * Broadcast cold open: a 4s title card, then one 2.5s walk-up per manager
 * (athlete-index order — see lib/timeline.ts). Everything here is a pure
 * function of (phase, phaseElapsedMs, bios) so a late-joining viewer lands
 * mid-sequence in exactly the right visual state.
 */
export default function ShowOpen({
  phase, athlete, walkupIndex, phaseElapsedMs, phaseDurationMs, names, colors, bios,
}: ShowOpenProps) {
  if (phase === 'title') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center sm:gap-5">
        <p
          className="display text-xs text-[var(--accent)] sm:text-sm"
          style={lineStyle(phaseElapsedMs, KICKER_AT_MS)}
        >
          LIVE FROM GRIDIRON STATE
        </p>
        <h1
          className="display text-3xl leading-tight sm:text-6xl"
          style={lineStyle(phaseElapsedMs, HEADLINE_AT_MS)}
        >
          THE FANTASY DRAFT COMBINE
        </h1>
        <span
          className="live-dot display flex items-center gap-1.5 text-[11px] text-[var(--accent)] sm:text-sm"
          style={lineStyle(phaseElapsedMs, CHIP_AT_MS)}
        >
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          LIVE
        </span>
      </div>
    );
  }

  // phase === 'walkup'
  const a = athlete ?? 0;
  const wIdx = walkupIndex ?? 0;
  const bio = bios[a];
  const name = names[a];
  const color = colors[a];
  const measurable = bio.measurables[wIdx % 3];

  const progress = phaseDurationMs > 0 ? clamp01(phaseElapsedMs / phaseDurationMs) : 1;
  const walkT = clamp01(progress / WALK_FRAC);
  const walkEased = easeOut(walkT);
  const arrived = walkT >= 1;

  const cardT = clamp01((progress - CARD_START_FRAC) / (CARD_END_FRAC - CARD_START_FRAC));
  const cardEased = easeOut(cardT);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-10 pt-6 sm:flex-row sm:gap-14">
      <div
        style={{ transform: `translateX(${-WALK_OFFSET_PX * (1 - walkEased)}px)` }}
      >
        <Athlete name={name} color={color} pose={arrived ? 'idle' : 'walk'} size={112} facing="right" spotlight />
      </div>

      <div
        className="w-full max-w-sm rounded-md border border-[var(--line)] bg-[var(--panel)]/95 px-5 py-4 shadow-[0_10px_30px_rgba(0,0,0,0.55)] backdrop-blur-sm sm:max-w-md"
        style={{ opacity: cardEased, transform: `translateX(${(1 - cardEased) * 48}px)` }}
      >
        <p className="display text-[10px] text-[var(--accent)]">STARTING LINEUP · {wIdx + 1} / {names.length}</p>
        <p className="mt-1 flex items-center gap-2 text-2xl font-bold text-[var(--text)] sm:text-3xl">
          <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate">{name}</span>
        </p>
        <p className="mt-0.5 text-sm italic text-[var(--accent)] sm:text-base">&ldquo;{bio.nickname}&rdquo;</p>
        <p className="display mt-1 text-[10px] text-[var(--muted)]">{bio.college}</p>
        <p className="stat mt-2 text-sm text-[var(--text)]">
          <span className="mr-1.5 text-[10px] text-[var(--muted)]">{measurable.label}</span>
          {measurable.value}
        </p>
        <p className="mt-2 text-xs italic text-[var(--muted)] sm:text-sm">{bio.scoutingLine}</p>
      </div>
    </div>
  );
}
