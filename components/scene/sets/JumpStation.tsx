/**
 * Backdrop for the vertical/broad jump events: a padded indoor-facility wall
 * with two sponsor-style signage boards, a bright center light pool, and an
 * indoor turf strip along the bottom. Pure presentational background — no
 * state, absolute-fill, `aria-hidden`.
 */
export default function JumpStation() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {/* padded wall backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.045) 0 3px, transparent 3px 46px),' +
            'linear-gradient(180deg, #111c2c 0%, #0b1420 55%, #08101a 100%)',
        }}
      />

      {/* bright center light pool */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 70% 55% at 50% 16%, rgba(255,250,232,0.24), transparent 60%)' }}
      />

      {/* sponsor-style signage */}
      <div className="absolute left-[6%] top-[10%] rounded-sm border border-[var(--line)] bg-[var(--panel)]/80 px-3 py-1.5 sm:top-[12%]">
        <span className="display text-[9px] tracking-widest text-[var(--accent)] sm:text-[11px]">COMBINE 3.0</span>
      </div>
      <div className="absolute right-[6%] top-[10%] rounded-sm border border-[var(--line)] bg-[var(--panel)]/80 px-3 py-1.5 sm:top-[12%]">
        <span className="display text-[9px] tracking-widest text-[var(--text)] sm:text-[11px]">GRIDIRON STATE</span>
      </div>

      {/* indoor turf strip */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{ height: '40%', background: 'linear-gradient(180deg, #1c3a24 0%, #123320 45%, #0c2417 100%)' }}
      />
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: '40%',
          background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 26px)',
        }}
      />
    </div>
  );
}
