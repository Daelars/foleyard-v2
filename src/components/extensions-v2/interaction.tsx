"use client";

import { useEffect, useRef, useState } from "react";

import {
  inputFieldsForSchema,
  validateV2Value,
  type ExtensionV2ValueSchema,
  type V2JobRecord,
  type V2PlanReview,
} from "@yard-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  fetchV2JobStatus,
  pollV2JobUntilSettled,
  requestV2JobCancel,
} from "@/lib/extensions-v2/job-client";

import { v2FocusRing, v2PanelClass } from "./shared";

/**
 * Generic v2 interaction adapters: forms, previews, results
 * (Application context, R6 + #169 review payloads).
 *
 * - `V2FieldControls`: generic inputs derived from the command input
 *   schema (data only), with schema validation errors surfaced inline.
 * - `V2PlanPreviewView`: renders the reviewed plan payload — summary,
 *   preview tables, notices, serializable details, reversibility note —
 *   with host-stamped review/apply actions (a client confirmed flag is
 *   never sufficient; the host owns the stamp).
 * - `V2JobProgress`: progress for a submitted job, consuming
 *   `fetchV2JobStatus`/`pollV2JobUntilSettled` with reconnect-safe
 *   polling and cooperative cancellation.
 * - `V2ResultDetails`: typed result details for immediate values and
 *   settled jobs (counts, reasons, output location).
 */

// --- Forms ---

export function V2FieldControls({
  schema,
  values,
  onChange,
}: {
  schema: ExtensionV2ValueSchema | undefined;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}) {
  const fields = inputFieldsForSchema(schema);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (fields.length === 0) {
    return <p className="text-xs text-zinc-500">This command needs no input.</p>;
  }

  const commitField = (name: string, raw: unknown) => {
    const field = fields.find((entry) => entry.name === name);
    if (!field) return;
    const invalid = validateV2Value(field.schema, raw, name);
    setErrors((prev) => {
      const next = { ...prev };
      if (invalid) next[name] = invalid;
      else delete next[name];
      return next;
    });
    onChange({ ...values, [name]: raw });
  };

  return (
    <div className="grid min-w-0 gap-3">
      {fields.map((field) => {
        const inputId = `v2-field-${field.name}`;
        const error = errors[field.name];
        const current = values[field.name] ?? field.defaultValue;
        return (
          <div key={field.name} className="min-w-0">
            <label htmlFor={inputId} className="text-sm font-medium text-zinc-100">
              {field.name}
              {field.required ? <span aria-hidden="true" className="text-destructive"> *</span> : null}
            </label>
            {field.schema.kind === "boolean" ? (
              <div className="mt-1">
                <Switch
                  id={inputId}
                  checked={current === true}
                  onCheckedChange={(checked) => commitField(field.name, checked)}
                />
              </div>
            ) : field.schema.kind === "enum" ? (
              <select
                id={inputId}
                value={String(current ?? "")}
                onChange={(event) => commitField(field.name, event.target.value)}
                aria-invalid={error !== undefined}
                className="mt-1 h-9 w-full min-w-0 rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {field.schema.values.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            ) : field.schema.kind === "string-array" ? (
              <Input
                id={inputId}
                value={Array.isArray(current) ? current.join(", ") : ""}
                placeholder="comma, separated, values"
                aria-invalid={error !== undefined}
                onChange={(event) =>
                  commitField(
                    field.name,
                    event.target.value.split(",").map((part) => part.trim()).filter(Boolean),
                  )
                }
              />
            ) : (
              <Input
                id={inputId}
                type={field.schema.kind === "number" ? "number" : "text"}
                value={current === null || current === undefined ? "" : String(current)}
                aria-invalid={error !== undefined}
                onChange={(event) =>
                  commitField(
                    field.name,
                    field.schema.kind === "number"
                      ? Number.parseFloat(event.target.value)
                      : event.target.value,
                  )
                }
              />
            )}
            {error ? (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// --- Previews (reviewed plans) ---

const noticeToneClass: Record<string, string> = {
  info: "border-white/10 bg-white/[0.04] text-zinc-300",
  warning: "border-accent-fill/40 bg-accent-fill/10 text-accent-text",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function V2PlanPreviewView({
  review,
  busy = false,
  onApply,
}: {
  review: V2PlanReview;
  busy?: boolean;
  onApply: (review: V2PlanReview) => void;
}) {
  return (
    <div className={cn(v2PanelClass, "min-w-0 p-4")}>
      <h3 className="text-sm font-semibold text-zinc-100">{review.summary}</h3>
      <p className="mt-1 font-mono text-[10px] text-zinc-600">
        Plan {review.planId} · reviewed {review.reviewedAt} · expires {review.expiresAt}
      </p>
      {review.notices.length > 0 ? (
        <ul className="mt-3 grid min-w-0 gap-1.5" aria-label="Notices">
          {review.notices.map((notice, index) => (
            <li
              key={index}
              role={notice.tone === "error" ? "alert" : "status"}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs",
                noticeToneClass[notice.tone] ?? noticeToneClass.info,
              )}
            >
              {notice.message}
            </li>
          ))}
        </ul>
      ) : null}
      {review.tables.map((table) => (
        <div key={table.id} className="mt-3 min-w-0">
          {table.title ? (
            <h4 className="mb-1 text-xs font-semibold text-zinc-300">{table.title}</h4>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-96 border-collapse text-xs">
              <thead>
                <tr className="bg-white/[0.04]">
                  {table.columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="border-b border-white/10 px-2.5 py-1.5 text-left font-semibold text-zinc-400"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="odd:bg-white/[0.02]">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="max-w-64 truncate px-2.5 py-1.5 text-zinc-300" title={cell}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {review.details !== undefined ? (
        <details className="mt-3 min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <summary className={cn("cursor-pointer text-xs text-zinc-400", v2FocusRing)}>
            Details
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto font-mono text-[11px] text-zinc-300">
            {JSON.stringify(review.details, null, 2)}
          </pre>
        </details>
      ) : null}
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[11px] text-zinc-500">
          {review.destructive ? "Destructive — " : ""}
          {review.reversibilityNote}
        </p>
        <Button
          type="button"
          variant={review.destructive ? "outline" : "default"}
          size="sm"
          disabled={busy}
          onClick={() => onApply(review)}
          className={cn(review.destructive && "border-destructive/50 text-destructive", v2FocusRing)}
        >
          {busy ? "Applying…" : review.destructive ? "Review and apply" : "Apply plan"}
        </Button>
      </div>
    </div>
  );
}

// --- Jobs ---

const TERMINAL_JOB = new Set(["succeeded", "failed", "cancelled", "interrupted"]);

export function V2JobProgress({
  jobId,
  autoStart = true,
  onSettled,
}: {
  jobId: string;
  autoStart?: boolean;
  onSettled?: (job: V2JobRecord) => void;
}) {
  const [job, setJob] = useState<V2JobRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const settledRef = useRef(false);

  useEffect(() => {
    if (!autoStart) return;
    settledRef.current = false;
    let cancelled = false;
    void pollV2JobUntilSettled(jobId, { intervalMs: 500, maxAttempts: 600 }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      settledRef.current = true;
      setJob(result.job);
      onSettled?.(result.job);
    });
    void fetchV2JobStatus(jobId).then((result) => {
      if (!cancelled && result.ok && !TERMINAL_JOB.has(result.job.state)) {
        setJob(result.job);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, autoStart]);

  const progress = job?.progress;
  const percent =
    progress && progress.total !== null && progress.total > 0
      ? Math.max(0, Math.min(100, Math.round((progress.completed / progress.total) * 100)))
      : null;
  const terminal = job !== null && TERMINAL_JOB.has(job.state);

  return (
    <div
      className={cn(v2PanelClass, "min-w-0 p-4")}
      role="status"
      aria-label={`Job ${jobId} ${job?.state ?? "loading"}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-400">
          {jobId} · {job?.state ?? "loading…"}
        </p>
        {!terminal && job ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={cancelling}
            onClick={() => {
              setCancelling(true);
              void requestV2JobCancel(jobId)
                .then((result) => {
                  if (result.ok) setJob(result.job);
                  else setError(result.message);
                })
                .finally(() => setCancelling(false));
            }}
            className={v2FocusRing}
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? 0}
        aria-label="Job progress"
      >
        <div
          className="h-full rounded-full bg-accent-fill transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${percent ?? (terminal ? 100 : 8)}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-zinc-500">
        {progress
          ? progress.total !== null
            ? `${progress.completed}/${progress.total}`
            : `${progress.completed} done`
          : "Waiting for first report…"}
      </p>
    </div>
  );
}

// --- Results ---

export function V2ResultDetails({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-xs text-zinc-500">No result details.</p>;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <p className="text-sm text-zinc-200">{String(value)}</p>;
  }
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    text = String(value);
  }
  return (
    <pre className="max-h-64 min-w-0 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[11px] text-zinc-300">
      {text}
    </pre>
  );
}
