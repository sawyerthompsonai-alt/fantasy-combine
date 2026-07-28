import Avatar from './Avatar';
import type { PublicRoom } from '@/lib/rooms';

export default function Lobby({ room }: { room: PublicRoom }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="display text-sm text-[var(--accent)]">Pre-game · {room.viewerCount} watching</p>
      <h1 className="display mb-6 text-4xl">Waiting for the commissioner…</h1>
      <ul className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {room.names.map((n, i) => (
          <li key={i} className="flex items-center gap-2 rounded border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
            <Avatar name={n} color={room.colors[i]} size={32} />
            <span className="truncate font-semibold">{n}</span>
          </li>
        ))}
      </ul>
      <div className="rounded border border-[var(--line)] p-4 text-sm text-[var(--muted)]">
        <p className="display mb-1 text-xs text-[var(--text)]">Fairness commitment</p>
        <p>The draft order is locked to a secret seed. Its fingerprint is published now,
          and the seed is revealed after the show so anyone can verify nothing was re-rolled.
          {room.resetCount > 0 && ` (Room has been reset ${room.resetCount}×.)`}</p>
        <code className="stat mt-2 block overflow-x-auto text-xs">{room.seedHash}</code>
      </div>
    </main>
  );
}
