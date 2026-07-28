'use client';
import type { PublicRoom } from '@/lib/rooms';
import { lockedPicks } from '@/lib/timeline';
import { useEffect, useState } from 'react';
import DraftBoard from './DraftBoard';

export default function Broadcast({ room, now }: { room: PublicRoom; now: () => number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(x => x + 1), 250);
    return () => clearInterval(t);
  }, []);
  const elapsed = now() - (room.startTime ?? now());
  const locks = lockedPicks(room.outcomes!, elapsed);
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="display mb-6 text-3xl">Broadcast in progress…</h1>
      <DraftBoard names={room.names} colors={room.colors} locks={locks} total={room.names.length} />
    </main>
  );
}
