'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-deep text-2xl text-cream">
        ⚓
      </div>
      <h1 className="font-display text-xl text-ink">Something went off course</h1>
      <p className="text-sm text-slate">An unexpected error occurred.</p>
      <button onClick={reset} className="min-h-[44px] rounded-lg bg-deep px-4 text-cream">
        Try again
      </button>
    </main>
  );
}
