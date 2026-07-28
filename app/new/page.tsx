'use client';
import { useState } from 'react';
import Avatar from '@/components/Avatar';

const COLORS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
  '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000',
  '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080',
];

export default function NewRoom() {
  const [names, setNames] = useState<string[]>(['', '']);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; adminToken: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (i: number, v: string) => setNames(ns => ns.map((n, j) => (j === i ? v : n)));
  const remove = (i: number) => setNames(ns => ns.filter((_, j) => j !== i));

  async function create() {
    setBusy(true); setError(null);
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ names: names.map(n => n.trim()).filter(Boolean) }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { setError(body.error ?? 'something went wrong'); return; }
    localStorage.setItem(`combine-admin-${body.id}`, body.adminToken);
    setCreated({ id: body.id, adminToken: body.adminToken });
  }

  if (created) {
    const origin = window.location.origin;
    const watch = `${origin}/r/${created.id}`;
    const control = `${origin}/r/${created.id}/control?token=${created.adminToken}`;
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="display mb-8 text-3xl">Room created</h1>
        {[
          { label: 'Watch link — share with the league', url: watch },
          { label: 'Control link — keep this private', url: control },
        ].map(({ label, url }) => (
          <div key={url} className="mb-6 rounded border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="display mb-2 text-xs text-[var(--muted)]">{label}</p>
            <div className="flex items-center gap-3">
              <code className="stat flex-1 overflow-x-auto text-sm">{url}</code>
              <button onClick={() => navigator.clipboard.writeText(url)}
                className="rounded bg-[var(--accent)] px-3 py-1 text-sm font-bold text-black">Copy</button>
            </div>
          </div>
        ))}
        <a className="text-[var(--accent)] underline" href={control}>Go to your control room →</a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="display mb-2 text-3xl">Enter your managers</h1>
      <p className="mb-8 text-[var(--muted)]">2–20 team or manager names. Order here doesn&apos;t matter — the combine decides everything.</p>
      <ul className="mb-6 space-y-3">
        {names.map((n, i) => (
          <li key={i} className="flex items-center gap-3">
            <Avatar name={n || `M ${i + 1}`} color={COLORS[i % COLORS.length]} size={36} />
            <input value={n} onChange={e => set(i, e.target.value)} maxLength={24}
              placeholder={`Manager ${i + 1}`}
              className="flex-1 rounded border border-[var(--line)] bg-[var(--panel)] px-3 py-2 outline-none focus:border-[var(--accent)]" />
            {names.length > 2 && (
              <button onClick={() => remove(i)} aria-label={`remove manager ${i + 1}`}
                className="text-[var(--muted)] hover:text-red-400">✕</button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-4">
        <button onClick={() => setNames(ns => [...ns, ''])} disabled={names.length >= 20}
          className="rounded border border-[var(--line)] px-4 py-2 text-sm hover:border-[var(--accent)] disabled:opacity-40">
          + Add manager
        </button>
        <button onClick={create} disabled={busy || names.filter(n => n.trim()).length < 2}
          className="display rounded bg-[var(--accent)] px-6 py-2 text-black disabled:opacity-40">
          {busy ? 'Creating…' : 'Create room'}
        </button>
      </div>
      {error && <p className="mt-4 text-red-400">{error}</p>}
    </main>
  );
}
