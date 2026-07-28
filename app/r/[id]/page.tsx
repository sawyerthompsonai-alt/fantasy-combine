'use client';
import { use } from 'react';
import { useRoom } from '@/lib/useRoom';
import Lobby from '@/components/Lobby';
import FinalBoard from '@/components/FinalBoard';
import Broadcast from '@/components/Broadcast';

export default function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { room, error, now } = useRoom(id);
  if (error) return <main className="grid min-h-screen place-items-center px-6"><p className="text-lg text-[var(--muted)]">{error}</p></main>;
  if (!room) return <main className="grid min-h-screen place-items-center"><p className="display text-[var(--muted)]">Tuning in…</p></main>;
  if (room.status === 'lobby') return <Lobby room={room} />;
  if (room.status === 'complete') return <FinalBoard room={room} />;
  return <Broadcast room={room} now={now} />;
}
