/**
 * Panning yard-line layer for the 'track' set: a 300%-wide SVG strip of yard
 * lines, translated by camera position. `offsetPct` is in viewport-width
 * percent (what the parent scene's camera math is already in); the /3
 * conversion to the 300%-wide layer's own coordinate space lives here so
 * callers never have to think about the layer's width.
 *
 * `position: absolute` (not `fixed`) — Field's stage layer (the `children`
 * wrapper) is itself `absolute inset-0` against the ground, so it has real
 * height and this can size normally against it. `fixed` would break under a
 * transformed ancestor (e.g. FinaleScene's run-phase camera-zoom wrapper),
 * since a CSS `transform` establishes a new containing block that `fixed`
 * resolves against instead of the viewport.
 */
export default function TrackLines({ offsetPct }: { offsetPct: number }) {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <svg
        className="absolute inset-y-0 h-full"
        viewBox="0 0 300 100"
        preserveAspectRatio="none"
        style={{ width: '300%', transform: `translateX(${-offsetPct / 3}%)` }}
      >
        {Array.from({ length: 29 }, (_, i) => (i + 1) * 10).map(x => (
          <g key={x}>
            <line x1={x} x2={x} y1={0} y2={100} stroke="rgba(255,255,255,0.16)" strokeWidth="0.25" />
            <text x={x} y="14" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="rgba(255,255,255,0.13)">
              {[10, 20, 30, 40, 50, 40, 30, 20, 10][((x / 10 - 1) % 9 + 9) % 9]}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
