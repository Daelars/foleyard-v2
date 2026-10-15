"use client";

import { FileWarning, ShieldAlert } from "lucide-react";

import {
  Alert,
  Button,
  Dialog,
  DialogDescription,
  DialogDivider,
  DialogFooter,
  DialogTitle,
} from "@/components/variant-i";
import { cn } from "@/lib/utils";

import { useV2PlanReview } from "@/components/extensions-v2/use-v2-plan-review";

/**
 * Generic review + apply dialog for a host-prepared plan (#294).
 *
 * Every review-producing command returns `review-required` with a plan
 * ID. This dialog renders the plan's summary, tables, notices, and
 * reversibility note, then applies the exact reviewed plan. It is the
 * fallback surface for plans that arrive through a generic entry point
 * (palette or context menu); dedicated dialogs still render their own.
 */

const TITLE_ID = "v3-plan-review-title";
const DESC_ID = "v3-plan-review-desc";

const REVERSIBILITY_LABEL: Record<string, string> = {
  "reversible-app-change": "Reversible application change",
  "job-temp-cleanup": "Only temporary files are removed",
  "irreversible-files": "Files leave the app",
};

export function V3V2PlanReviewDialog({
  open,
  onOpenChange,
  planId,
  title = "Review changes",
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string | null;
  title?: string;
  onApplied?: (value: unknown) => void;
}) {
  const { review, loading, applying, error, apply } = useV2PlanReview({
    planId: open ? planId : null,
    onApplied: (value) => {
      onApplied?.(value);
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      labelledBy={TITLE_ID}
      describedBy={DESC_ID}
      maxWidth="max-w-2xl"
    >
      <DialogTitle id={TITLE_ID}>
        <span className="inline-flex items-center gap-2">
          <ShieldAlert className="size-4 text-accent-text" />
          {title}
        </span>
      </DialogTitle>
      <DialogDescription id={DESC_ID}>
        {review?.summary ?? "Loading the prepared plan…"}
      </DialogDescription>
      <DialogDivider />

      <div className="vi-scroll max-h-[60vh] space-y-4 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-zinc-500">Loading review…</p>
        ) : null}

        {error ? <Alert tone="error" title="Review unavailable" body={error} /> : null}

        {review ? (
          <>
            {review.tables.map((table) => (
              <section
                key={table.id}
                className="overflow-hidden rounded-lg border border-[var(--vi-edge)]"
              >
                {table.title ? (
                  <p className="border-b border-[var(--vi-edge)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                    {table.title}
                  </p>
                ) : null}
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--vi-edge)] text-zinc-500">
                      {table.columns.map((column) => (
                        <th
                          key={column}
                          className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, index) => (
                      <tr
                        key={index}
                        className="border-b border-[var(--vi-edge)] last:border-b-0"
                      >
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="px-3 py-1.5 font-mono text-xs text-zinc-300"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}

            {review.notices.map((notice, index) =>
              notice.tone === "info" ? (
                <p
                  key={index}
                  className="rounded-lg border border-[var(--vi-edge)] bg-white/[0.02] px-3.5 py-2.5 text-xs text-zinc-400"
                >
                  {notice.message}
                </p>
              ) : (
                <Alert
                  key={index}
                  tone={notice.tone}
                  title={notice.tone === "warning" ? "Heads up" : "Problem"}
                  body={notice.message}
                />
              ),
            )}

            <div className="flex items-start gap-2 rounded-lg border border-[var(--vi-edge)] bg-white/[0.02] px-3 py-2.5">
              <FileWarning className="mt-0.5 size-4 shrink-0 text-zinc-500" />
              <div>
                <p className="text-xs font-medium text-zinc-300">
                  {REVERSIBILITY_LABEL[review.reversibility] ?? review.reversibility}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {review.reversibilityNote}
                </p>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <DialogFooter>
        <Button tone="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          tone={review?.destructive ? "danger" : "primary"}
          onClick={() => void apply()}
          disabled={!review || loading || applying}
          loading={applying}
          className={cn(!review && "opacity-60")}
        >
          {review?.destructive ? "Delete" : "Apply"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
