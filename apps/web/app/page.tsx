import { deriveGroupDisplayName } from '@armada/shared';

export default function Home() {
  // Proof the shared graph logic + tokens are wired end to end.
  const sample = deriveGroupDisplayName([
    { firstName: 'Kyle', lastName: 'Sullivan' },
    { firstName: 'Dillon', lastName: 'Everett' },
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <p className="font-expanded text-xs uppercase tracking-widest text-slate">
        Armada Discipleship
      </p>
      <h1 className="font-display text-4xl text-ink">Anchored.</h1>
      <p className="text-slate-dark">
        Relationship graph scaffold is live. Example derived group name:{' '}
        <span className="font-medium text-deep">{sample}</span>
      </p>
    </main>
  );
}
