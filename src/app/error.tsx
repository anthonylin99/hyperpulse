"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("HyperPulse route error", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-6 text-center">
      <div className="rounded-full border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-rose-300">
        Something broke
      </div>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight text-zinc-50">
        HyperPulse hit an unexpected route error.
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-400">
        The public demo should fail gracefully. Retry the view, or jump back into the market directory while we recover.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-medium text-[#071915] transition hover:bg-emerald-300"
        >
          Retry
        </button>
        <Link
          href="/markets"
          className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-5 py-3 text-sm font-medium text-zinc-100 transition hover:border-zinc-700"
        >
          Back to Markets
        </Link>
      </div>
      {error.digest ? (
        <div className="mt-6 font-mono text-xs text-zinc-600">Digest {error.digest}</div>
      ) : null}
    </div>
  );
}
