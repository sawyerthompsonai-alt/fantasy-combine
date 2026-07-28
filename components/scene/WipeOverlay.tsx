/**
 * Broadcast-style diagonal wipe played across every inter-block boundary
 * (see `lib/timeline.ts`'s `transitionAt`, one window per `buildTimeline`
 * gap): a skewed dark band sweeps right-to-left across the whole viewport,
 * fully covering it right around `t === 0.5` — exactly the instant the
 * underlying phase actually flips — so the old scene wipes out and the new
 * scene (already the correct frame underneath, per Broadcast's normal
 * elapsed-driven render) wipes in from behind it.
 *
 * `t` is the only input and it's progress-derived from `transitionAt`, never
 * time/mount-driven — so a late joiner who lands mid-sweep sees the sweep at
 * the correct position on first paint, not a replayed CSS animation from t=0.
 * `fixed inset-0` and a sibling of the scene (not a wrapper around it), so
 * it carries no transform on any ancestor of the scene — nothing here can
 * trip the TrackLines `absolute inset-0` collapse (Task 5/13).
 */
export default function WipeOverlay({ t }: { t: number }) {
  const clamped = Math.min(1, Math.max(0, t));
  // 120vw (fully off-screen right, band width included) at t=0 -> -140vw
  // (fully off-screen left) at t=1. Band is 140vw wide, so it spans the
  // entire viewport width right around the midpoint of that 260vw travel,
  // i.e. t=0.5 — which is exactly where `transitionAt` places the segment
  // boundary.
  const translateX = 120 - clamped * 260;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <div
        className="absolute -top-[30vh] -bottom-[30vh] w-[140vw] bg-[#05070a]"
        style={{ left: 0, transform: `translateX(${translateX}vw) skewX(-12deg)` }}
      >
        {/* faint diagonal texture, broadcast-graphics style */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'repeating-linear-gradient(115deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 2px, transparent 2px, transparent 22px)',
          }}
        />
        {/* accent leading edge — the edge in the direction of travel
            (leftward), i.e. the front of the sweep as it covers new ground */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-1"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, var(--accent) 50%, transparent 100%)',
            boxShadow: '0 0 24px 4px rgba(245,166,35,0.75)',
          }}
        />
      </div>
    </div>
  );
}
