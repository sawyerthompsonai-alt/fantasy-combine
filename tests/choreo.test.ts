import { describe, it, expect } from 'vitest';
import {
  DASH_BEATS, SPRINT_START_FRAC, cameraX, STAT_REVEAL_FRACTION,
  smoothstep, cumulativeDist, easedPathPosition, nearestPlant, routeU,
  benchLockouts, staggeredSpin, doublePumpScaleY, dampedKeyframes,
  type Point,
} from '@/components/scene/turnChoreo';

describe('cameraX', () => {
  it('holds at 0 while the runner is behind the viewport anchor', () => {
    expect(cameraX(0)).toBe(0);
  });

  it('tracks the runner once past the anchor', () => {
    expect(cameraX(120)).toBe(82);
  });

  it('clamps to the track max', () => {
    expect(cameraX(500)).toBe(200);
  });
});

describe('DASH_BEATS', () => {
  it('has strictly increasing beat boundaries', () => {
    const marks = [
      DASH_BEATS.walkIn[0], DASH_BEATS.walkIn[1],
      DASH_BEATS.stance[1], DASH_BEATS.sprint[1],
      DASH_BEATS.through[1], DASH_BEATS.jogOff[0], DASH_BEATS.jogOff[1],
    ];
    for (let i = 1; i < marks.length; i++) {
      expect(marks[i]).toBeGreaterThan(marks[i - 1]);
    }
  });

  it('lines the official stamp up with the shared stat-reveal fraction', () => {
    expect(DASH_BEATS.official).toBe(STAT_REVEAL_FRACTION);
  });

  it('exposes the sprint start as SPRINT_START_FRAC', () => {
    expect(SPRINT_START_FRAC).toBe(DASH_BEATS.sprint[0]);
  });
});

describe('smoothstep', () => {
  it('returns 0 at the start and 1 at the end', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
  });

  it('returns exactly 0.5 at the midpoint (symmetric cubic)', () => {
    expect(smoothstep(0.5)).toBe(0.5);
  });

  it('eases — slower than linear near the start, faster than linear approaching the middle', () => {
    // A pure ease-in/ease-out cubic sits below the y=x line for 0<u<0.5.
    expect(smoothstep(0.25)).toBeLessThan(0.25);
    expect(smoothstep(0.75)).toBeGreaterThan(0.75);
  });

  it('clamps outside [0, 1]', () => {
    expect(smoothstep(-0.5)).toBe(0);
    expect(smoothstep(1.5)).toBe(1);
  });
});

describe('easedPathPosition', () => {
  // A right-angle path: (0,0) -> (10,0) -> (10,10).
  const waypoints: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  const cumDist = cumulativeDist(waypoints);

  it('returns the first waypoint at t=0', () => {
    const p = easedPathPosition(waypoints, cumDist, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });

  it('returns the last waypoint at t=1', () => {
    const p = easedPathPosition(waypoints, cumDist, 1);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(10);
  });

  it('advances monotonically along the path (never backtracks)', () => {
    // This L-shaped path only ever increases x (first leg, y pinned at 0)
    // or increases y (second leg, x pinned at 10), so x+y is a monotonic
    // proxy for distance travelled along the whole polyline.
    const samples = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map(
      u => easedPathPosition(waypoints, cumDist, u),
    );
    let prevPathLen = -1;
    for (const p of samples) {
      const pathLen = p.x + p.y;
      expect(pathLen).toBeGreaterThanOrEqual(prevPathLen - 1e-9);
      prevPathLen = pathLen;
    }
  });

  it('reports the correct direction (dx/dy) on each known segment', () => {
    // u=0.25 -> target = 0.25 * 20 = 5, inside the first (horizontal) leg.
    const onFirstLeg = easedPathPosition(waypoints, cumDist, 0.25);
    expect(onFirstLeg.dx).toBeCloseTo(10);
    expect(onFirstLeg.dy).toBeCloseTo(0);
    expect(onFirstLeg.x).toBeCloseTo(5); // smoothstep(0.5) === 0.5 exactly
    expect(onFirstLeg.y).toBeCloseTo(0);

    // u=0.75 -> target = 15, inside the second (vertical) leg.
    const onSecondLeg = easedPathPosition(waypoints, cumDist, 0.75);
    expect(onSecondLeg.dx).toBeCloseTo(0);
    expect(onSecondLeg.dy).toBeCloseTo(10);
    expect(onSecondLeg.x).toBeCloseTo(10);
    expect(onSecondLeg.y).toBeCloseTo(5);
  });
});

describe('nearestPlant', () => {
  it('reads sign 0 (no lean) for a straight-line reversal', () => {
    // Out-and-back: (0,0) -> (10,0) -> (0,0) — the interior waypoint is a
    // dead-straight reversal, exactly like the 3-cone's C1<->C2 legs or a
    // shuttle touch line.
    const waypoints: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }];
    const cumDist = cumulativeDist(waypoints);
    const plant = nearestPlant(waypoints, cumDist, 0.5); // target lands exactly on the interior waypoint
    expect(plant.dist).toBeCloseTo(0);
    expect(plant.sign).toBe(0);
  });

  it('reads a nonzero sign for a genuine angular cut', () => {
    // A 90-degree corner: (0,0) -> (10,0) -> (10,10).
    const waypoints: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const cumDist = cumulativeDist(waypoints);
    const plant = nearestPlant(waypoints, cumDist, 0.5);
    expect(plant.dist).toBeCloseTo(0);
    expect(plant.sign).not.toBe(0);
  });

  it('gives mirror-image turns opposite signs', () => {
    const left: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const right: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: -10 }];
    const leftCum = cumulativeDist(left);
    const rightCum = cumulativeDist(right);
    const leftSign = nearestPlant(left, leftCum, 0.5).sign;
    const rightSign = nearestPlant(right, rightCum, 0.5).sign;
    expect(leftSign).not.toBe(0);
    expect(rightSign).not.toBe(0);
    expect(leftSign).toBe(-rightSign);
  });

  it('regression: the 3-cone hook-around-C2 waypoint is a real turn, not a phantom straight reversal', () => {
    // Mirrors the corner of components/scene/events/DashScene.tsx's
    // THREE_CONE_WAYPOINTS around C2 (62,78) -> (68,73) -> C3 (62,50). The
    // original waypoint here was (62,73), collinear with C2->C3 (both at
    // x=62), which made this register as sign 0 — a cadence-slowing
    // "plant" window in the middle of what should read as one continuous
    // hook. Off the line, it must register as a genuine angular cut.
    const waypoints: Point[] = [{ x: 62, y: 78 }, { x: 68, y: 73 }, { x: 62, y: 50 }];
    const cumDist = cumulativeDist(waypoints);
    const plant = nearestPlant(waypoints, cumDist, 0.5);
    expect(plant.sign).not.toBe(0);
  });

  it('increases dist away from the plant (falls off outside the interior waypoint)', () => {
    const waypoints: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const cumDist = cumulativeDist(waypoints);
    const atPlant = nearestPlant(waypoints, cumDist, 0.5).dist;
    const awayFromPlant = nearestPlant(waypoints, cumDist, 0.1).dist;
    expect(awayFromPlant).toBeGreaterThan(atPlant);
  });
});

describe('routeU', () => {
  it('maps the start of the route window (stance end) to 0', () => {
    expect(routeU(DASH_BEATS.stance[1])).toBe(0);
  });

  it('maps the end of the route window (official reveal) to 1', () => {
    expect(routeU(DASH_BEATS.official)).toBe(1);
  });

  it('maps the midpoint of the window to 0.5', () => {
    const mid = (DASH_BEATS.stance[1] + DASH_BEATS.official) / 2;
    expect(routeU(mid)).toBeCloseTo(0.5);
  });

  it('clamps below the window to 0', () => {
    expect(routeU(0)).toBe(0);
    expect(routeU(DASH_BEATS.stance[1] - 0.5)).toBe(0);
  });

  it('clamps above the window to 1', () => {
    expect(routeU(1)).toBe(1);
    expect(routeU(DASH_BEATS.official + 0.5)).toBe(1);
  });
});

describe('benchLockouts', () => {
  it('returns an empty schedule for 0 reps', () => {
    expect(benchLockouts(0)).toEqual([]);
  });

  it('returns one entry per rep', () => {
    for (const reps of [1, 2, 3, 5, 10]) {
      expect(benchLockouts(reps)).toHaveLength(reps);
    }
  });

  it('is strictly increasing', () => {
    const fracs = benchLockouts(6);
    for (let i = 1; i < fracs.length; i++) {
      expect(fracs[i]).toBeGreaterThan(fracs[i - 1]);
    }
  });

  it('ends exactly at 1', () => {
    for (const reps of [1, 2, 3, 8]) {
      const fracs = benchLockouts(reps);
      expect(fracs[fracs.length - 1]).toBe(1);
    }
  });

  it('struggles on the last two reps: their gap exceeds a normal rep gap, and the very last exceeds the second-to-last', () => {
    for (const reps of [3, 4, 5, 8]) {
      const fracs = benchLockouts(reps);
      const gap = (i: number) => fracs[i] - (i === 0 ? 0 : fracs[i - 1]);
      const first = gap(0);
      const secondLast = gap(reps - 2);
      const last = gap(reps - 1);
      expect(last).toBeGreaterThan(secondLast);
      expect(secondLast).toBeGreaterThan(first);
    }
  });
});

describe('staggeredSpin', () => {
  it('holds at u=0/eased=0 before an item\'s own window starts', () => {
    expect(staggeredSpin(0.1, 3, 0.46, 0.0075, 0.05)).toEqual({ u: 0, eased: 0 });
  });

  it('reaches u=1/eased=1 once an item\'s own window is complete, and holds there', () => {
    const early = staggeredSpin(0.46 + 0 * 0.0075 + 0.05, 0, 0.46, 0.0075, 0.05);
    expect(early.u).toBeCloseTo(1);
    expect(early.eased).toBeCloseTo(1);
    const later = staggeredSpin(0.9, 0, 0.46, 0.0075, 0.05);
    expect(later.u).toBe(1);
    expect(later.eased).toBe(1);
  });

  it('staggers later indices to start later — same progress, higher index means earlier in its own window', () => {
    const progress = 0.46 + 0.0075 * 1 + 0.01; // just past item 1's start, well before item 3's
    const item1 = staggeredSpin(progress, 1, 0.46, 0.0075, 0.05);
    const item3 = staggeredSpin(progress, 3, 0.46, 0.0075, 0.05);
    expect(item1.u).toBeGreaterThan(item3.u);
  });

  it('is monotonically increasing in progress for a fixed item', () => {
    const a = staggeredSpin(0.5, 2, 0.46, 0.0075, 0.05);
    const b = staggeredSpin(0.52, 2, 0.46, 0.0075, 0.05);
    expect(b.u).toBeGreaterThanOrEqual(a.u);
  });
});

describe('doublePumpScaleY', () => {
  it('starts at 1 (neutral, no dip yet)', () => {
    expect(doublePumpScaleY(0, 0.12, 0.14)).toBeCloseTo(1);
  });

  it('bottoms out the first dip at the quarter mark', () => {
    expect(doublePumpScaleY(0.25, 0.12, 0.14)).toBeCloseTo(1 - 0.12);
  });

  it('recovers to neutral at the half mark, between the two pumps', () => {
    expect(doublePumpScaleY(0.5, 0.12, 0.14)).toBeCloseTo(1);
  });

  it('ends at the second, deeper dip at u=1 — the launch crouch, no recoil back to neutral', () => {
    expect(doublePumpScaleY(1, 0.12, 0.14)).toBeCloseTo(1 - 0.14);
  });

  it('clamps outside [0, 1]', () => {
    expect(doublePumpScaleY(-1, 0.12, 0.14)).toBeCloseTo(1);
    expect(doublePumpScaleY(2, 0.12, 0.14)).toBeCloseTo(1 - 0.14);
  });
});

describe('dampedKeyframes', () => {
  const points: Array<[number, number]> = [[0, 6], [1 / 3, -4], [2 / 3, 2], [1, 0]];

  it('returns 0 for an empty keyframe list', () => {
    expect(dampedKeyframes(0.5, [])).toBe(0);
  });

  it('hits each authored keyframe value exactly at its u', () => {
    for (const [u, v] of points) {
      expect(dampedKeyframes(u, points)).toBeCloseTo(v);
    }
  });

  it('interpolates smoothly (monotonically toward the next keyframe) mid-segment', () => {
    // Between u=0 (6) and u=1/3 (-4), values should be strictly decreasing.
    const a = dampedKeyframes(0.05, points);
    const b = dampedKeyframes(0.15, points);
    const c = dampedKeyframes(0.3, points);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it('clamps outside [0, 1] to the nearest endpoint value', () => {
    expect(dampedKeyframes(-0.5, points)).toBeCloseTo(6);
    expect(dampedKeyframes(1.5, points)).toBeCloseTo(0);
  });
});
