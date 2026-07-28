import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 text-center">
      <p className="display text-sm text-[var(--accent)]">Live from the combine floor</p>
      <h1 className="display text-5xl leading-tight sm:text-6xl">Fantasy Draft Combine</h1>
      <p className="max-w-xl text-lg text-[var(--muted)]">
        Randomize your league&apos;s draft order with a live, synchronized broadcast:
        your managers&apos; athletes sprint, lift, and drop passes through an elimination
        gauntlet until two remain for the #1 pick. Provably fair. No accounts.
      </p>
      <Link href="/new"
        className="display rounded bg-[var(--accent)] px-8 py-4 text-lg text-black hover:brightness-110">
        Create a reveal room
      </Link>
    </main>
  );
}
