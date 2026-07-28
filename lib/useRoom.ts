'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicRoom } from '@/lib/rooms';

export function useRoom(id: string) {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const [viewerId] = useState<string>(() =>
    typeof window === 'undefined' ? '' : crypto.randomUUID()
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch(`/api/rooms/${id}?viewer=${viewerId}`, { cache: 'no-store' });
        if (res.status === 404) { setError('This room doesn’t exist or has expired.'); return; }
        const body: PublicRoom = await res.json();
        offsetRef.current = body.serverNow - Date.now();
        setError(null);
        setRoom(body);
        if (stopped) return;
        const delay = body.status === 'lobby' ? 2000 : body.status === 'revealing' ? 5000 : 15000;
        timer = setTimeout(poll, delay);
      } catch {
        if (!stopped) timer = setTimeout(poll, 4000); // backoff-and-retry on blips
      }
    }
    poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [id, viewerId]);

  const now = useCallback(() => Date.now() + offsetRef.current, []);
  return { room, error, now };
}
