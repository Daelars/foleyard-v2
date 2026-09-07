"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { v2PanelClass } from "@/components/extensions-v2/shared";

import { redactV2Json, redactV2Text, V2_DIAGNOSTIC_MAX_RECORDS } from "./redact";

/**
 * Execution inspector log (prototype workbench, dev-only, R9).
 *
 * Records invocation/job IDs, state transitions, availability
 * reasons, denied permission names, and error details for every
 * workbench invocation, including the `runMode` (`direct`/`apply`/
 * `job`) that shows how the run was reached. Storage is bounded to
 * the newest `V2_DIAGNOSTIC_MAX_RECORDS` entries with per-string caps.
 *
 * Privacy split: the local detail view keeps what the user needs to
 * diagnose their own operation (their own paths may appear); the
 * exported JSON is projected through the redactor first, so paths,
 * settings values, tokens, secrets, and stacks never leave in an
 * export.
 */

export type V2InspectorKind = "availability" | "invocation" | "job" | "error";

export type V2InspectorEntry = {
  seq: number;
  at: string;
  kind: V2InspectorKind;
  extensionId: string;
  commandId: string;
  invocationId?: string;
  jobId?: string;
  runMode?: string;
  available?: boolean;
  reason?: string;
  deniedPermissions?: string[];
  code?: string;
  /** Local detail (bounded, unredacted); redacted on export. */
  detail?: string;
  transitions?: string[];
};

export type V2InspectorInput = Omit<V2InspectorEntry, "seq" | "at">;

export function exportV2InspectorLog(entries: readonly V2InspectorEntry[]): unknown[] {
  return entries.map((entry) =>
    redactV2Json({
      seq: entry.seq,
      at: entry.at,
      kind: entry.kind,
      extensionId: entry.extensionId,
      commandId: entry.commandId,
      ...(entry.invocationId ? { invocationId: entry.invocationId } : {}),
      ...(entry.jobId ? { jobId: entry.jobId } : {}),
      ...(entry.runMode ? { runMode: entry.runMode } : {}),
      ...(entry.available !== undefined ? { available: entry.available } : {}),
      ...(entry.reason ? { reason: redactV2Text(entry.reason, 500) } : {}),
      ...(entry.deniedPermissions ? { deniedPermissions: entry.deniedPermissions } : {}),
      ...(entry.code ? { code: entry.code } : {}),
      ...(entry.detail ? { message: redactV2Text(entry.detail, 500) } : {}),
      ...(entry.transitions ? { transitions: entry.transitions.slice(-20) } : {}),
    }),
  );
}

export function useV2InspectorLog() {
  const seq = useRef(0);
  const [entries, setEntries] = useState<V2InspectorEntry[]>([]);

  const record = useCallback((input: V2InspectorInput) => {
    seq.current += 1;
    const entry: V2InspectorEntry = {
      ...input,
      seq: seq.current,
      at: new Date().toISOString(),
      ...(input.detail ? { detail: input.detail.slice(0, 2000) } : {}),
    };
    setEntries((previous) =>
      [...previous, entry].slice(-V2_DIAGNOSTIC_MAX_RECORDS),
    );
  }, []);

  const appendTransition = useCallback((jobId: string, transition: string) => {
    setEntries((previous) =>
      previous.map((entry) =>
        entry.jobId === jobId
          ? { ...entry, transitions: [...(entry.transitions ?? []), transition].slice(-20) }
          : entry,
      ),
    );
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
  }, []);

  const download = useCallback(() => {
    const blob = new Blob([JSON.stringify(exportV2InspectorLog(entries), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "v2-inspector-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [entries]);

  return useMemo(
    () => ({ entries, record, appendTransition, clear, download }),
    [entries, record, appendTransition, clear, download],
  );
}

export type V2InspectorLog = ReturnType<typeof useV2InspectorLog>;

export function V2ExecutionInspector({ log }: { log: V2InspectorLog }) {
  return (
    <section aria-label="Execution inspector" className={`${v2PanelClass} p-4`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Execution inspector</h2>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={log.clear}>
            Clear
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={log.download}
            disabled={log.entries.length === 0}
          >
            Export sanitized JSON
          </Button>
        </div>
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        Invocation/job IDs, state transitions, availability reasons, denied
        permissions, and error details. Exports redact paths, settings
        values, tokens, secrets, and stacks; storage is bounded to the
        newest {V2_DIAGNOSTIC_MAX_RECORDS} records.
      </p>
      {log.entries.length === 0 ? (
        <p className="text-xs text-zinc-500">No invocations recorded yet.</p>
      ) : (
        <ol className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {log.entries.map((entry) => (
            <li
              key={entry.seq}
              className="min-w-0 rounded-lg border border-white/10 p-2 text-xs"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-zinc-400">#{entry.seq}</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-medium">
                  {entry.kind}
                </span>
                {entry.runMode ? (
                  <span className="rounded bg-white/10 px-1.5 py-0.5 font-medium">
                    {entry.runMode}
                  </span>
                ) : null}
                <span className="truncate font-medium">
                  {entry.extensionId} · {entry.commandId}
                </span>
              </div>
              {entry.invocationId || entry.jobId ? (
                <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-zinc-400">
                  {entry.invocationId ? <span>inv {entry.invocationId}</span> : null}
                  {entry.jobId ? <span>job {entry.jobId}</span> : null}
                </div>
              ) : null}
              {entry.reason ? (
                <p className="mt-1 break-words text-zinc-300">{entry.reason}</p>
              ) : null}
              {entry.deniedPermissions && entry.deniedPermissions.length > 0 ? (
                <p className="mt-1 break-words text-zinc-300">
                  denied: {entry.deniedPermissions.join(", ")}
                </p>
              ) : null}
              {entry.code ? (
                <p className="mt-1 font-mono text-[11px] text-zinc-400">{entry.code}</p>
              ) : null}
              {entry.transitions && entry.transitions.length > 0 ? (
                <p className="mt-1 break-words font-mono text-[11px] text-zinc-400">
                  {entry.transitions.join(" → ")}
                </p>
              ) : null}
              {entry.detail ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-zinc-400">
                    Local detail
                  </summary>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-zinc-300">
                    {entry.detail}
                  </pre>
                </details>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
