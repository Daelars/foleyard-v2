"use client";

// Inline failure surface for the Library (#276). A failed view load must
// present a retry affordance instead of leaving the previous view's rows
// actionable under the new heading.
import { RotateCw } from "lucide-react";

import { Button } from "@/components/variant-i";

export function V3LoadFailure({
  message,
  onRetry,
  variant = "page",
}: {
  message: string;
  onRetry?: () => void;
  variant?: "page" | "inline";
}) {
  if (variant === "inline") {
    return (
      <div
        role="alert"
        className="mb-3 flex items-center gap-3 rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)] px-3.5 py-2.5"
      >
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-100">
          {message}
        </p>
        {onRetry ? (
          <Button tone="secondary" size="sm" className="gap-2" onClick={onRetry}>
            <RotateCw />
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <p className="text-2xl font-semibold text-zinc-200">{message}</p>
      <p className="max-w-sm text-sm text-zinc-500">
        This view could not load. The previous view&apos;s sounds are not shown.
      </p>
      {onRetry ? (
        <Button tone="secondary" size="sm" className="mt-1 gap-2" onClick={onRetry}>
          <RotateCw />
          Retry
        </Button>
      ) : null}
    </div>
  );
}
