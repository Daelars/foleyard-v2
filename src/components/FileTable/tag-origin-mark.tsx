"use client";

import type { TagOrigin } from "@yard-core";

import { cn } from "@/lib/utils";

/**
 * Inline provenance mark for a tag attachment (#193). Same language as
 * the throwaway origins prototype: M for manual, D for deterministic
 * filename rules, AI plus confidence for semantic suggestions.
 */
export function TagOriginMark({
  origin,
  confidence,
  className,
}: {
  origin?: TagOrigin | null;
  confidence?: number | null;
  className?: string;
}) {
  if (!origin) return null;
  if (origin === "manual") {
    return (
      <span
        title="Added by hand"
        className={cn("font-mono text-[10px] font-bold text-zinc-100", className)}
      >
        M
      </span>
    );
  }
  if (origin === "deterministic") {
    return (
      <span
        title="Fired by a filename rule"
        className={cn("font-mono text-[10px] font-bold text-accent-text", className)}
      >
        D
      </span>
    );
  }
  return (
    <span
      title={
        confidence == null
          ? "Suggested automatically"
          : `Suggested automatically at ${confidence.toFixed(2)} confidence`
      }
      className={cn("font-mono text-[10px] font-bold text-chart-3", className)}
    >
      AI{confidence == null ? "" : ` ${confidence.toFixed(2)}`}
    </span>
  );
}
