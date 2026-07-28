'use client';
import { useState } from 'react';
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
  const [verdict, setVerdict] = useState<string | null>(null);

  async function verify() {
    const bytes = new TextEncoder().encode(room.seed!);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    setVerdict(
      hex === room.seedHash
        ? '✅ Verified: hash matches the pre-reveal commitment.'
        : '❌ MISMATCH — this should never happen.'
    );
  }

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
        <button
          onClick={verify}
          className="display mt-3 rounded border border-[var(--line)] px-4 py-2 text-xs text-[var(--text)]"
        >
          Verify in your browser
        </button>
        {verdict && <p className="mt-2">{verdict}</p>}
      </div>
    </main>
  );
}
