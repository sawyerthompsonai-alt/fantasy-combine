import { describe, it, expect } from 'vitest';
import { DASH_BEATS, SPRINT_START_FRAC, cameraX, STAT_REVEAL_FRACTION } from '@/components/scene/turnChoreo';

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
