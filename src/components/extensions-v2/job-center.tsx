"use client";

import { useState } from "react";
import { RotateCw } from "lucide-react";

import type { V2JobRecord } from "@yard-core";

import { Alert, Button, StatusBadge } from "@/components/variant-i";
import {
  isV2JobLive,
  v2JobCenterCancellation,
  v2JobCenterOutcome,
  v2JobCenterPartial,
  v2JobCenterPhase,
  v2JobCenterProgress,
  type V2JobCenterPhase,
} from "@/lib/extensions-v2/job-center";
import { cn } from "@/lib/utils";

import { useV2JobCenter } from "./use-v2-job-center";

/**
 * Durable v2 job center (Application context, #281).
 *
 * A renderer lifecycle for long-running extension jobs: it lists the
 * durable server-side history (so closing a dialog, reloading the
 * renderer, or reopening the application reconnects to an active or
 * terminal job), polls active work for live progress, cancels
 * idempotently and only reports stopped once the server says the work
 * has unwound, and renders success, failure, cancellation, interruption,
 * and partial output distinctly.
 *
 * Renders nothing when there is no history and no problem, so the Tools
 * surface is unchanged for a user who has never run a job.
 */

const PHASE_LABEL: Record<V2JobCenterPhase, string> = {
  queued: "Queued",
  running: "Running",
  stopping: "Stopping",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};

const PHASE_TONE: Record<V2JobCenterPhase, "ready" | "processing" | "unavailable" | "error"> = {
  queued: "processing",
  running: "processing",
  stopping: "unavailable",
  succeeded: "ready",
  failed: "error",
  cancelled: "unavailable",
  interrupted: "error",
};

export function V2JobCenter({
  pollIntervalMs,
  limit,
  className,
}: {
  pollIntervalMs?: number;
  limit?: number;
  className?: string;
}) {
  const { jobs, error, persistence, refresh, cancel } = useV2JobCenter({
    ...(pollIntervalMs !== undefined ? { pollIntervalMs } : {}),
    ...(limit !== undefined ? { limit } : {}),
  });
  const [cancelling, setCancelling] = useState<string | null>(null);

  const historyPending = persistence !== null && !persistence.durable;
  if (jobs.length === 0 && error === null && !historyPending) return null;

  return (
    <section
      aria-label="Job center"
      className={cn(
        "mb-6 rounded-xl border border-[var(--vi-edge)] bg-black/25 p-4",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
          Jobs
        </h2>
        <span className="flex-1" />
        <Button
          tone="ghost"
          size="sm"
          aria-label="Refresh jobs"
          onClick={() => void refresh()}
        >
          <RotateCw className="size-3.5" />
          Refresh
        </Button>
      </div>

      {historyPending ? (
        <div className="mt-3">
          <Alert
            tone="warning"
            title="Job history is not durable yet"
            body={
              persistence.lastError ??
              "The snapshot write failed; it will be retried automatically."
            }
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-xs text-accent-text">
          {error}
        </p>
      ) : null}

      {jobs.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {jobs.map((job) => (
            <JobCenterRow
              key={job.jobId}
              job={job}
              cancelling={cancelling === job.jobId}
              onCancel={() => {
                setCancelling(job.jobId);
                void cancel(job.jobId).finally(() => setCancelling(null));
              }}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function JobCenterRow({
  job,
  cancelling,
  onCancel,
}: {
  job: V2JobRecord;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const phase = v2JobCenterPhase(job);
  const outcome = v2JobCenterOutcome(job);
  const partial = v2JobCenterPartial(job);
  const progress = v2JobCenterProgress(job);
  const cancellation = v2JobCenterCancellation(job);
  const showProgress =
    isV2JobLive(job) || job.progress.total !== null || job.progress.completed > 0;
  const canCancel = isV2JobLive(job) && cancellation === "none";

  return (
    <li
      data-job-id={job.jobId}
      className="min-w-0 rounded-lg border border-[var(--vi-edge)] bg-black/20 p-3"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-400">
          {job.extensionId} · {job.jobId}
        </span>
        {cancellation === "stopped" ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-500">
            Stopped
          </span>
        ) : null}
        <StatusBadge status={PHASE_LABEL[phase]} tone={PHASE_TONE[phase]} />
        {canCancel ? (
          <Button
            tone="ghost"
            size="sm"
            disabled={cancelling}
            aria-label={`Cancel job ${job.jobId}`}
            onClick={onCancel}
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </Button>
        ) : null}
      </div>

      {showProgress ? (
        <div className="mt-2">
          <div
            role="progressbar"
            aria-label={`Job progress: ${job.jobId}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent ?? 0}
            className="h-1 overflow-hidden rounded-full bg-white/[0.06]"
          >
            <div
              className="h-full rounded-full bg-accent-fill transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${progress.percent ?? (isV2JobLive(job) ? 8 : 100)}%` }}
            />
          </div>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-zinc-500">
            {progress.label}
          </p>
        </div>
      ) : null}

      {outcome.value !== undefined ? (
        <code className="mt-2 block truncate rounded bg-white/[0.03] px-2 py-1 font-mono text-[11px] text-zinc-300">
          {JSON.stringify(outcome.value)}
        </code>
      ) : null}
      {outcome.valueOmitted ? (
        <p className="mt-2 text-xs text-zinc-500">
          Result too large to display; see the outputs on disk.
        </p>
      ) : null}
      {outcome.diagnostic ? (
        <p className="mt-2 text-xs text-zinc-400">{outcome.diagnostic.message}</p>
      ) : null}

      {partial.hasOutput ? (
        <div className="mt-2 space-y-1 border-t border-[var(--vi-edge)] pt-2">
          <p className="text-xs text-zinc-400 tabular-nums">
            {partial.succeeded} succeeded
            {partial.failed.length > 0 ? ` · ${partial.failed.length} failed` : ""}
          </p>
          {partial.failed.length > 0 ? (
            <ul className="space-y-0.5">
              {partial.failed.map((failure) => (
                <li key={failure.id} className="font-mono text-[11px] text-zinc-500">
                  {failure.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {partial.incomplete ? (
            <p className="text-xs text-amber-200/80">
              {partial.incompleteReason ?? "Stopped early before finishing."}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
