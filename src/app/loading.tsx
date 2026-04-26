export default function GlobalLoading() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[1480px] flex-col gap-6 px-4 py-10 sm:px-6 xl:px-8">
      <div className="h-10 w-52 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/70" />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="h-[420px] animate-pulse rounded-[30px] border border-zinc-800 bg-zinc-900/70" />
        <div className="grid gap-4">
          <div className="h-48 animate-pulse rounded-[28px] border border-zinc-800 bg-zinc-900/70" />
          <div className="h-48 animate-pulse rounded-[28px] border border-zinc-800 bg-zinc-900/70" />
        </div>
      </div>
    </div>
  );
}
