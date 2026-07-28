'use client';
import DraftBoard from './DraftBoard';
import type { PublicRoom } from '@/lib/rooms';

export function resultsText(room: PublicRoom): string {
  const order = room.outcomes!.order;
  const lines = order.map((athlete, i) => `${i + 1}. ${room.names[athlete]}`);
  return [
    '🏈 Draft order — decided at the Fantasy Draft Combine',
    ...lines,
    `Fairness: seed ${room.seed} · sha256 → ${room.seedHash}`,
  ].join('\n');
}

export default function FinalBoard({ room }: { room: PublicRoom }) {
  const locks = room.outcomes!.order.map((athlete, i) => ({ pick: i + 1, athlete }));
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <p className="display text-sm text-[var(--accent)]">Final results</p>
      <h1 className="display mb-6 text-4xl">The draft order</h1>
      <DraftBoard names={room.names} colors={room.colors} locks={locks} total={room.names.length} />
      <button onClick={() => navigator.clipboard.writeText(resultsText(room))}
        className="display mt-6 rounded bg-[var(--accent)] px-6 py-3 text-black">
        Copy for the group chat
      </button>
      <div className="mt-8 rounded border border-[var(--line)] p-4 text-sm text-[var(--muted)]">
        <p className="display mb-1 text-xs text-[var(--text)]">Fairness verified</p>
        <p>Committed hash: <code className="stat">{room.seedHash}</code></p>
        <p>Revealed seed: <code className="stat">{room.seed}</code></p>
        <p className="mt-1">sha256(seed) must equal the hash shown in the lobby before the reveal.</p>
      </div>
    </main>
  );
}
