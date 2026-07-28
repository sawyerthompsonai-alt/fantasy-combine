/**
 * Backdrop for the gauntlet event: a practice field shot from a low sideline
 * angle — dusk sky, a blurred band of bench/cooler silhouettes, one sideline
 * boundary line, and turf filling the bottom 60%. Pure presentational
 * background — no state, absolute-fill, `aria-hidden`.
 */
export default function SidelineSet() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {/* dusk sky above the sideline */}
      <div
        className="absolute inset-x-0 top-0"
        style={{ height: '40%', background: 'linear-gradient(180deg, #1a2438 0%, #263349 60%, #33405a 100%)' }}
      />

      {/* blurred bench / cooler band, out of focus */}
      <div className="absolute inset-x-0" style={{ top: '28%', height: '20%', filter: 'blur(3px)', opacity: 0.75 }}>
        <div className="absolute bottom-0 left-[8%] h-[70%] w-[22%] rounded-sm bg-[#1c2230]" />
        <div className="absolute bottom-0 left-[34%] h-[55%] w-[9%] rounded-sm bg-[#c25a1f]" />
        <div className="absolute bottom-0 left-[47%] h-[70%] w-[26%] rounded-sm bg-[#1c2230]" />
        <div className="absolute bottom-0 left-[78%] h-[50%] w-[9%] rounded-sm bg-[#c25a1f]" />
      </div>

      {/* sideline boundary line */}
      <div className="absolute inset-x-0" style={{ top: '48%', height: '2px', background: 'rgba(255,255,255,0.35)' }} />

      {/* turf, low angle */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{ height: '60%', background: 'linear-gradient(180deg, #17301d 0%, #0e2013 55%, #091709 100%)' }}
      />
    </div>
  );
}
