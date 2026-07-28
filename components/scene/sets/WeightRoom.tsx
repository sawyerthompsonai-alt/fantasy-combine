/**
 * Backdrop for the bench-press event: a near-black wall with faint panel
 * seams, a dim overhead light pool, a power-rack silhouette stage left, a
 * red motivational banner top-right, and a rubber-tile floor. Pure
 * presentational background — no state, absolute-fill, `aria-hidden`.
 */
export default function WeightRoom() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {/* wall: near-black with faint horizontal panel lines */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'repeating-linear-gradient(180deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 48px),' +
            'linear-gradient(180deg, #191c22 0%, #0e1015 55%, #0a0b0e 100%)',
        }}
      />

      {/* dim overhead light pool */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 55% 45% at 50% 10%, rgba(255,241,214,0.16), transparent 62%)' }}
      />

      {/* motivational banner, top-right */}
      <div
        className="absolute right-[4%] top-[6%] rounded-sm border px-3 py-1.5 sm:right-[5%] sm:top-[8%]"
        style={{ borderColor: 'rgba(180,40,40,0.55)', background: 'rgba(64,10,10,0.6)' }}
      >
        <span className="display text-[9px] tracking-widest text-red-200/80 sm:text-[11px]">NO DAYS OFF</span>
      </div>

      {/* rubber-tile floor */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: '38%',
          background:
            'repeating-linear-gradient(90deg, rgba(0,0,0,0.35) 0 2px, transparent 2px 34px),' +
            'repeating-linear-gradient(180deg, rgba(0,0,0,0.25) 0 2px, transparent 2px 34px),' +
            'linear-gradient(180deg, #241c19 0%, #140f0d 100%)',
        }}
      />

      {/* power-rack silhouette, stage left */}
      <svg
        className="absolute bottom-0 left-[2%] h-[72%] w-[30%]"
        viewBox="0 0 60 100"
        preserveAspectRatio="xMinYMax meet"
      >
        <g fill="none" stroke="#05060a" strokeWidth="3.4" strokeLinecap="square">
          <line x1="8" y1="6" x2="8" y2="100" />
          <line x1="32" y1="0" x2="32" y2="100" />
          <line x1="8" y1="6" x2="32" y2="0" />
          <line x1="8" y1="30" x2="32" y2="25" />
          <line x1="8" y1="54" x2="32" y2="50" />
          <line x1="8" y1="78" x2="32" y2="75" />
        </g>
        <g fill="#05060a">
          <rect x="5.5" y="27" width="7" height="3.4" />
          <rect x="29" y="22" width="7" height="3.4" />
        </g>
        <g fill="#12141a" stroke="#000" strokeWidth="0.6">
          <ellipse cx="44" cy="92" rx="10" ry="10" />
          <ellipse cx="52" cy="94" rx="7.5" ry="7.5" />
        </g>
      </svg>
    </div>
  );
}
