'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Re-renders every animation frame with a render-safe Date.now() snapshot.
 * Replaces the old 100ms interval so motion is 60fps-fluid; determinism is
 * preserved because everything on screen is still a pure function of the
 * elapsed time this returns.
 *
 * Returns `[now, setActive]`. `setActive(false)` gates the rAF loop off —
 * call it once the derived broadcast state has stopped changing (e.g.
 * replay's `final` end screen) so the loop stops scheduling frames instead
 * of re-rendering the whole tree 60x/sec forever with zero visual change.
 * `setActive` is a stable ref-mutating callback, not a `useState` setter —
 * it's meant to be called from the *caller's own* effect (see Broadcast.tsx),
 * which necessarily runs one render after the `now` value it reacts to, but
 * costs at most one extra scheduled frame past the point the caller decided
 * to stop, not a real regression. This split (rather than a plain `active`
 * argument read inside this hook's own effect body) exists because React's
 * `react-hooks/refs` and `react-hooks/set-state-in-effect` rules forbid
 * reading/writing a ref during render and forbid calling a `useState`
 * setter synchronously inside an effect, respectively — both of which a
 * same-render "derive active from the state this hook just produced" would
 * require. Mutating a plain ref from inside the *caller's* effect avoids
 * both: the mutation isn't during render, and it isn't a React state
 * setter, so it doesn't trigger a cascading re-render either. */
export function useAnimationNow(): [number, (active: boolean) => void] {
  const [now, setNow] = useState(() => Date.now());
  const activeRef = useRef(true);
  const setActive = useCallback((active: boolean) => { activeRef.current = active; }, []);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setNow(Date.now());
      // Checked *after* scheduling this frame's update, right before
      // deciding whether to queue the next one — so the loop can stop
      // itself without ever needing to re-run this effect (whose own
      // deps are `[]`, i.e. it mounts the loop exactly once).
      if (activeRef.current) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return [now, setActive];
}
