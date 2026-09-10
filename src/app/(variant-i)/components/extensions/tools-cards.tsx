"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

import {
  validateV2SettingValue,
  type V2JobRecord,
} from "@yard-core";
import {
  Button,
  Dialog,
  DialogDescription,
  DialogDivider,
  DialogTitle,
  Field,
  Select,
  SettingRow,
  StatusBadge,
  Switch,
  ToolCard,
} from "@/components/variant-i";
import { cn } from "@/lib/utils";
import { V2_RUN_LABELS } from "@/components/extensions-v2/run-labels";
import { useV2ExtensionEntries } from "@/components/extensions-v2/use-v2-extension-entries";
import type { V2ExtensionSettingsEntry, V2SettingRow } from "@/components/extensions-v2/settings";
import {
  fetchV2JobStatus,
  pollV2JobUntilSettled,
  requestV2JobCancel,
} from "@/lib/extensions-v2/job-client";

/**
 * v2 extension cards for the Tools grid, rendered with the library
 * `ToolCard`. Info opens a details dialog mirroring the original v2
 * details dialog (permissions with approval, settings, actions); the
 * card chrome itself is the shared ToolCard.
 */
export function V3ToolsCards({
  onRunExtension,
  onEnabledToggle,
}: {
  onRunExtension?: (extensionId: string) => void;
  /** Fired after an enable/disable write settles so the route catalog refreshes. */
  onEnabledToggle?: (extensionId: string, enabled: boolean) => void;
}) {
  const { entries, loading, toggle, updateSetting, reset, approve } =
    useV2ExtensionEntries();
  const [detailsId, setDetailsId] = useState<string | null>(null);

  // Keep the current entries visible while a write-triggered refresh is in
  // flight (stale-while-revalidate): toggling an extension reloads its
  // settings/permissions, but the grid should not blank for that. Only the
  // first load, with nothing to show, renders nothing.
  if (loading && entries.length === 0) {
    return null;
  }
  const details = entries.find((entry) => entry.id === detailsId) ?? null;
  return (
    <>
      {entries.map((entry) => (
        <ToolCard
          key={entry.id}
          monogram={entry.name.slice(0, 2).toUpperCase()}
          name={entry.name}
          version={entry.version}
          description={entry.description}
          perms={entry.declaredPermissions}
          approved={
            entry.declaredPermissions.length > 0 &&
            entry.declaredPermissions.every((permission) =>
              entry.effectivePermissions.includes(permission),
            )
          }
          enabled={entry.enabled}
          canRun={Boolean(V2_RUN_LABELS[entry.id]) && Boolean(onRunExtension)}
          runLabel={V2_RUN_LABELS[entry.id]}
          onRun={
            V2_RUN_LABELS[entry.id] && onRunExtension
              ? () => onRunExtension(entry.id)
              : undefined
          }
          onToggle={(checked) => {
            void toggle(entry.id, checked).then(() =>
              onEnabledToggle?.(entry.id, checked),
            );
          }}
          onToggleInfo={() => setDetailsId(entry.id)}
          expanded={false}
        />
      ))}

      <V3ExtensionDetailsDialog
        entry={details}
        onOpenChange={(open) => {
          if (!open) setDetailsId(null);
        }}
        onUpdateSetting={(settingId, value) =>
          details && void updateSetting(details.id, settingId, value)
        }
        onReset={() => details && void reset(details.id)}
        onApprove={(permissions) =>
          details && void approve(details.id, permissions)
        }
        onRun={
          details && V2_RUN_LABELS[details.id] && onRunExtension
            ? {
                label: V2_RUN_LABELS[details.id] as string,
                run: () => {
                  setDetailsId(null);
                  onRunExtension(details.id);
                },
              }
            : undefined
        }
      />
    </>
  );
}

function V3ExtensionDetailsDialog({
  entry,
  onOpenChange,
  onUpdateSetting,
  onReset,
  onApprove,
  onRun,
}: {
  entry: V2ExtensionSettingsEntry | null;
  onOpenChange: (open: boolean) => void;
  onUpdateSetting: (settingId: string, value: unknown) => void;
  onReset: () => void;
  onApprove: (permissions: string[]) => void;
  onRun?: { label: string; run: () => void };
}) {
  const denied =
    entry?.declaredPermissions.filter(
      (permission) => !entry.effectivePermissions.includes(permission),
    ) ?? [];
  return (
    <Dialog open={entry !== null} onClose={() => onOpenChange(false)} maxWidth="max-w-xl">
      <DialogTitle>{entry?.name ?? "Extension details"}</DialogTitle>
      {entry ? (
        <>
          <DialogDescription>
            <span className="block">{entry.description}</span>
            <span className="mt-1 block font-mono text-xs text-zinc-600">
              Foleyard · v{entry.version} · v2
            </span>
          </DialogDescription>
          <DialogDivider />
          <div className="vi-scroll max-h-[70vh] space-y-5 overflow-y-auto pr-1 text-sm">
            {onRun ? (
              <div className="min-w-0 space-y-2">
                <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                  Actions
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Button tone="secondary" size="sm" onClick={onRun.run} title={`Run: ${onRun.label}`}>
                    <ArrowUpRight />
                    {onRun.label}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="min-w-0 space-y-2">
              <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                Permissions
              </h3>
              {entry.declaredPermissions.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {entry.declaredPermissions.map((permission) => {
                    const granted =
                      entry.effectivePermissions.includes(permission);
                    return (
                      <span
                        key={permission}
                        className={cn(
                          "rounded border px-1.5 py-0.5 font-mono text-[10.5px]",
                          granted
                            ? "border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-200"
                            : "border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)] text-accent-text",
                        )}
                        title={
                          granted
                            ? `Permission "${permission}" is granted; the host authorizes each operation.`
                            : `Permission "${permission}" is declared but not granted; commands needing it stay disabled with a reason.`
                        }
                      >
                        {permission}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No permissions declared.</p>
              )}
              {denied.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] text-zinc-500">
                    {denied.length} declared permission(s) not granted —
                    affected commands show why they are unavailable instead of
                    failing.
                  </p>
                  <Button
                    tone="secondary"
                    size="sm"
                    onClick={() => onApprove(entry.declaredPermissions)}
                  >
                    Approve all
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                  Settings
                </h3>
                <Button
                  tone="ghost"
                  size="sm"
                  onClick={onReset}
                  title="Reset all settings to declared defaults"
                >
                  Reset
                </Button>
              </div>
              {entry.rows.length ? (
                <div
                  className={cn(
                    "space-y-2",
                    !entry.enabled && "pointer-events-none opacity-50",
                  )}
                  aria-disabled={!entry.enabled}
                >
                  {entry.rows.map((row) => (
                    <V3SettingControl
                      key={row.declaration.id}
                      extensionId={entry.id}
                      row={row}
                      disabled={!entry.enabled}
                      onUpdate={(settingId, value) =>
                        onUpdateSetting(settingId, value)
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No settings declared.</p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}

/**
 * Validated v2 setting control with the I treatment: boolean rows as
 * `SettingSwitchRow`, enum rows as `SettingRow` + `Select`, and
 * string/number/path rows as `SettingRow` + `Field` with commit on
 * blur/Enter. Writes validate against the declaration before calling
 * through.
 */
export function V3SettingControl({
  extensionId,
  row,
  disabled,
  onUpdate,
}: {
  extensionId: string;
  row: V2SettingRow;
  disabled: boolean;
  onUpdate: (settingId: string, value: unknown) => void;
}) {
  const { declaration } = row;
  const inputId = `v3-${extensionId}-${declaration.id}`;
  const current =
    row.value !== undefined && row.value !== null
      ? String(row.value)
      : String(declaration.defaultValue ?? "");
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);

  const commit = (raw: string) => {
    const value =
      declaration.type === "number" ? Number.parseFloat(raw)
      : declaration.type === "boolean" ? raw === "true"
      : raw;
    const invalid = validateV2SettingValue(declaration, value);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    onUpdate(declaration.id, value);
  };

  return (
    <SettingRow
      title={declaration.label}
      description={
        <>
          {declaration.description ? (
            <span className="block">{declaration.description}</span>
          ) : null}
          <span className="mt-0.5 block font-mono text-[10px] text-zinc-600">
            Default: {String(declaration.defaultValue ?? "—")}
          </span>
          {error ? (
            <span role="alert" className="mt-1 block text-xs text-accent-text">
              {error}
            </span>
          ) : null}
        </>
      }
    >
      {declaration.type === "boolean" ? (
        <div className="flex justify-end">
          <Switch
            label={declaration.label}
            checked={row.value === true}
            onCheckedChange={(checked) => {
              setError(null);
              onUpdate(declaration.id, checked);
            }}
          />
        </div>
      ) : declaration.type === "enum" ? (
        <Select
          label={declaration.label}
          value={String(row.value ?? declaration.defaultValue ?? "")}
          onChange={(value) => {
            const invalid = validateV2SettingValue(declaration, value);
            if (invalid) {
              setError(invalid);
              return;
            }
            setError(null);
            onUpdate(declaration.id, value);
          }}
          options={(declaration.options ?? []).map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
      ) : (
        <Field
          id={inputId}
          disabled={disabled}
          type={declaration.type === "number" ? "number" : "text"}
          value={draft}
          aria-invalid={error !== null}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit((event.target as HTMLInputElement).value);
            }
          }}
        />
      )}
    </SettingRow>
  );
}

const TERMINAL_JOB = new Set(["succeeded", "failed", "cancelled", "interrupted"]);

type JobStatusTone = "ready" | "processing" | "unavailable" | "error";

function jobTone(job: V2JobRecord | null, hasError: boolean): JobStatusTone {
  if (hasError) return "error";
  if (!job) return "processing";
  if (job.state === "succeeded") return "ready";
  if (job.state === "failed" || job.state === "interrupted") return "error";
  if (job.state === "cancelled" || job.state === "cancellation-requested") {
    return "unavailable";
  }
  return "processing";
}

/**
 * I-styled job feedback for the Tools view: thin `h-1` progress bar with
 * accent fill and glow, job state through `StatusBadge`, cooperative
 * cancellation. Same polling contract as the original `V2JobProgress`.
 */
export function V3JobProgress({
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
    void pollV2JobUntilSettled(jobId, { intervalMs: 500, maxAttempts: 600 }).then(
      (result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.message);
          return;
        }
        settledRef.current = true;
        setJob(result.job);
        onSettled?.(result.job);
      },
    );
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
  const stateLabel = job?.state ?? "loading";

  return (
    <div
      role="status"
      aria-label={`Job ${jobId} ${stateLabel}`}
      className="min-w-0 rounded-lg border border-[var(--vi-edge)] bg-black/25 p-3"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-400">
          {jobId} · {stateLabel}
        </p>
        <StatusBadge status={stateLabel} tone={jobTone(job, error !== null)} />
        {!terminal && job ? (
          <Button
            tone="ghost"
            size="sm"
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
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-accent-text">
          {error}
        </p>
      ) : null}
      <div
        className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? 0}
        aria-label="Job progress"
      >
        <div
          className="h-full rounded-full bg-accent-fill shadow-[0_0_12px_color-mix(in_oklab,var(--accent-fill)_40%,transparent)] transition-[width] duration-300 motion-reduce:transition-none"
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