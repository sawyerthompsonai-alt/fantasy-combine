# Combine 3.0 — Realism, Smoothness, Scoreboard, Funny Intros

Improve the Fantasy Draft Combine broadcast (fantasy-combine.vercel.app, repo root) from "animated shapes on a field" to "watching NFL Network combine coverage." Keep every architectural invariant: the whole show remains a pure deterministic function of (outcomes, seed, elapsed time); all viewers stay frame-synced; all randomness (including jokes) derives from the room seed via createRng — never Math.random outside pure UI sparkle; lint 0/0, tests green, build green on every commit; pacing stays ~6–8 minutes for 12 managers.

## 1. Smoothness (applies everywhere)

- No element may teleport. Every positional change interpolates with easing; every phase change crossfades or wipes (broadcast-style diagonal wipe between events, quick fade within phases).
- Drive animation with a requestAnimationFrame clock (still derived from the shared elapsed time), not 100ms interval jumps — motion must be 60fps-fluid.
- Athletes walk in from the sideline, settle into a start stance, perform, and jog off — never pop in/out, never clip into the stadium band (fix the current spawn-at-top bug).
- Camera feel: on running drills, the field background pans with the runner (translate the scene, keep the athlete center-frame) so sprints read fast without the character crossing the whole viewport in 2 seconds.

## 2. Drill realism — each event gets its own authentic set and motion

- **40-Yard Dash:** athlete crouches in a 3-point stance at the start line; whistle → explosive start with body lean that eases upright; arm/leg cycle speed matches ground speed; runs THROUGH the finish; clock freezes at the official time with a broadcast "OFFICIAL" stamp. Field pans alongside.
- **Bench Press:** indoor weight-room scene (dark walls, rubber floor, rack), side view: bench, barbell with visible 45s, athlete lying down, spotter figure standing over. Bar travels a real press arc; plates make the bar flex slightly; last 2 reps slow down with a struggle shake; racks the bar at the end. Rep counter ticks on lockout, not on time.
- **3-Cone Drill:** correct L-drill geometry (3 cones, 5 yards apart), athlete runs the actual route: out-and-back, around the second cone, figure-eight the third, sharp plants with body lean at each turn.
- **20-Yard Shuttle:** 5-10-5 layout with visible lines; athlete starts straddling the middle line, hand-touches down at each line (arm reaches, body dips) before reversing.
- **Vertical Jump:** vertec pole with a rack of swattable flags; approach, load (deep crouch, arm swing back), explode up, swat — flags above the reached height stay, the swatted ones spin away; measured height counts up the flag rack.
- **Broad Jump:** takeoff board + landing mat with distance markings; double-arm swing rhythm (two pumps), leap with arc and tucked knees, stick the landing with an arm-balance wobble; tape-measure graphic extends to the mark.
- **Gauntlet:** a JUGS machine (or QB silhouette) fires spirals (rotating ball) at the athlete jogging a line; catches = hands up, ball tucks under arm; drops = ball bounces off hands and tumbles away with a broadcast "DROP" flash.
- **Championship 40 finale:** both athletes in stances side by side, dramatic hold, whistle, panning head-to-head sprint, photo-finish freeze-frame with a white flash at the line, slow zoom on the winner, then the champion celebration (arms up pose + confetti).

## 3. Persistent scoreboard

- A stadium-jumbotron-style scoreboard, always available during the show: current event name + round, live event leaderboard (times/marks so far this event), athletes remaining, and picks locked so far.
- Docked compact along the top or side during turns (never covering the athlete), expanding to full leaderboard during results. On mobile it collapses to a slim ticker bar that can be tapped open.
- The elimination beat still gets its full-screen draft-board moment.

## 4. Funny intros

- **Show open (before event 1):** broadcast cold-open — title card ("THE FANTASY DRAFT COMBINE · LIVE"), then a starting-lineup intro sequence: each manager's athlete gets ~2.5s: walk-up pose + intro card with a funny, seed-deterministic bio. Build a joke system in lib (pure, seeded): nickname pools ("The Waiver Wire Wizard", "Mr. Autodraft"), fake colleges (Gridiron State, University of Mock Drafts), absurd measurables (hands: 17 inches / vertical: undisclosed / bench: "declined to answer"), and scouting one-liners ("Elite trash talker. Questionable roster management."). Same seed → same jokes for every viewer and every replay. Add its length to the timeline (~30s for 12; total still ≤ 8.5 min — trim per-turn or results padding to compensate).
- **Per-turn walk-ups:** the lower-third shows the athlete's nickname + one bio stat during their walk-in.
- **Elimination roasts:** eliminated athlete gets a seeded farewell line ("Casey's combine ends here — scouts cite 'vibes.'") on the elimination card.
- Keep jokes G-rated ribbing about fantasy football habits, never about the real person beyond their name.

## 5. Scene variety

Each drill type gets a visually distinct set (not one identical green field): outdoor field for dash/cones/shuttle/finale (different framing/zoom per drill), weight room for bench, indoor jump station backdrop with vertec/mat for the jumps, practice-field sideline with the JUGS machine for the gauntlet. Shared component library (Field, IndoorRoom, props) — variety through composition, not copy-paste.

## 6. Process requirements

- Iterate task-by-task with tests where logic changes (timeline additions for the intro sequence, joke-generator determinism) and per-task review; deploy at the end and visually verify each scene type in a real browser at desktop AND ~390px mobile width before calling it done.
- Update the existing timeline/scene code in place; keep replay mode, sound (opt-in, whistle/crowd/horn), lobby, fairness verification, and the control page working untouched unless a change is required by the above.
