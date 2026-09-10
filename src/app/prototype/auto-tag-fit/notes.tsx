// PROTOTYPE ONLY — annotation primitives for /prototype/auto-tag-fit.
// Amber and dashed on purpose: visibly designer notes, not part of the UI
// being evaluated.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Numbered amber pin marking a finding on the annotated "current" variant. */
export function FindingPin({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-label={`Finding ${n}`}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-amber-400 align-middle font-mono text-[9px] font-bold text-zinc-950",
        className,
      )}
    >
      {n}
    </span>
  );
}

/** Dashed-border note strip at the top of a variant: the reasoning behind it. */
export function VariantNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="rounded-xl border border-dashed border-amber-400/40 bg-amber-400/[0.04] px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-amber-300">{title}</p>
      <div className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-zinc-300">{children}</div>
    </aside>
  );
}
