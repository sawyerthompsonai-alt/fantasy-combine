'use client';
import { useEffect, useState } from 'react';

/** Re-renders every animation frame with a render-safe Date.now() snapshot.
 * Replaces the old 100ms interval so motion is 60fps-fluid; determinism is
 * preserved because everything on screen is still a pure function of the
 * elapsed time this returns. */
export function useAnimationNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let raf = 0;
    const loop = () => { setNow(Date.now()); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return now;
}
