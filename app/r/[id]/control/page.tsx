'use client';
import { use, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRoom } from '@/lib/useRoom';
import { buildTimeline } from '@/lib/timeline';
import type { PublicRoom } from '@/lib/rooms';

/** "Broadcast in progress — about N min remaining", derived from the
 * server-corrected clock (`now`) and the room's own timeline — falls back to
 * a static estimate before outcomes/startTime exist. */
function remainingLabel(room: PublicRoom, now: () => number): string {
  if (!room.outcomes || room.startTime === undefined) return '~7 minute broadcast';
  const { totalMs } = buildTimeline(room.outcomes);
  const remainingMs = totalMs - (now() - room.startTime);
  if (remainingMs <= 30_000) return 'wrapping up any moment';
  const mins = Math.max(1, Math.round(remainingMs / 60_000));
  return `about ${mins} min remaining`;
}

function Control({ id }: { id: string }) {
  const params = useSearchParams();
  const { room, error, now } = useRoom(id);
  const [token, setToken] = useState<string | null>(null);
  const [tokenResolved, setTokenResolved] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setToken(params.get('token') ?? localStorage.getItem(`combine-admin-${id}`));
        setTokenResolved(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [params, id]);

  async function post(action: 'start' | 'reset') {
    setActionError(null);
    try {
      const res = await fetch(`/api/rooms/${id}/${action}`, {
        method: 'POST', headers: { 'x-admin-token': token ?? '' },
      });
      if (!res.ok) {
        let message = 'request failed';
        try {
          message = (await res.json()).error ?? message;
        } catch {
          // non-JSON error body — fall back to the generic message
        }
        setActionError(message);
      }
    } finally {
      setConfirmReset(false);
    }
  }

  if (error) return <p className="p-10 text-[var(--muted)]">{error}</p>;
  if (tokenResolved && !token) {
    return <p className="display p-10 text-[var(--muted)]">This page needs the control link with its token.</p>;
  }
  if (!room || !token) return <p className="display p-10 text-[var(--muted)]">Loading control room…</p>;

  const watch = `${window.location.origin}/r/${id}`;
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="display text-sm text-[var(--accent)]">Control room · status: {room.status} · {room.viewerCount} watching</p>
      <h1 className="display mb-8 text-3xl">Commissioner controls</h1>

      {room.status === 'lobby' && (
        <button onClick={() => post('start')}
          className="display w-full rounded bg-[var(--accent)] py-6 text-2xl text-black hover:brightness-110">
          ▶ Start the reveal
        </button>
      )}
      {room.status !== 'lobby' && (
        <div className="rounded border border-[var(--line)] p-4">
          <p className="mb-3 text-[var(--muted)]">
            {room.status === 'revealing'
              ? `Broadcast in progress — ${remainingLabel(room, now)}. Watch it on the link below.`
              : 'Reveal complete — the watch link now shows final results, with a ▶ Replay button so anyone can rewatch the broadcast anytime.'}
          </p>
          {!confirmReset ? (
            <button onClick={() => setConfirmReset(true)} className="rounded border border-red-400 px-4 py-2 text-red-400">
              Reset room…
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-red-400">Throws away this result and re-commits a new seed. Everyone will see the reset.</span>
              <button onClick={() => post('reset')} className="rounded bg-red-500 px-4 py-2 font-bold text-black">Confirm reset</button>
              <button onClick={() => setConfirmReset(false)} className="text-[var(--muted)]">Cancel</button>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 rounded border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="display mb-2 text-xs text-[var(--muted)]">Watch link — share with the league</p>
        <div className="flex items-center gap-3">
          <code className="stat flex-1 overflow-x-auto text-sm">{watch}</code>
          <button onClick={() => navigator.clipboard.writeText(watch)}
            className="rounded bg-[var(--accent)] px-3 py-1 text-sm font-bold text-black">Copy</button>
        </div>
      </div>
      {actionError && <p className="mt-4 text-red-400">{actionError}</p>}
      <a className="mt-6 inline-block text-[var(--accent)] underline" href={watch} target="_blank">Open the broadcast →</a>
    </main>
  );
}

export default function ControlPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><Control id={id} /></Suspense>;
}
