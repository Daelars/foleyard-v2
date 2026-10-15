"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { v2PlanRoute, type V2JobRecord, type V2PlanReview } from "@yard-core";
import {
  FOLDER_JANITOR_V2_DELETE_FOLDERS,
  FOLDER_JANITOR_V2_ID,
  FOLDER_JANITOR_V2_REMOVE_FILES,
  FOLDER_JANITOR_V2_SCAN_FOLDER,
  FOLDER_JANITOR_V2_SCAN_LIBRARY,
} from "@foleyard/folder-janitor-v2";
import { getDesktopBridge } from "@/lib/desktop";
import { invokeV2Command } from "@/lib/extensions-v2/contributions";
import {
  pollV2JobUntilSettled,
  requestV2JobCancel,
} from "@/lib/extensions-v2/job-client";

export type JanitorIssueKind =
  | "duplicate"
  | "missing-file"
  | "broken"
  | "tiny-file"
  | "weird-format"
  | "empty-folder";

export interface JanitorIssue {
  kind: JanitorIssueKind;
  path: string;
  fileIds: string[];
  message: string;
}

export interface JanitorScanResult {
  scannedFiles: number;
  scannedRoots: string[];
  issues: JanitorIssue[];
  /** True when a scan bound cut the review short. */
  truncated: boolean;
  /** Why the review is incomplete; empty when `truncated` is false. */
  truncationReasons: string[];
  /** Total issues found, even when the detail list is transport-bounded. */
  issueTotal: number;
  /** Accurate per-kind counts as `"kind=count"` entries. */
  issueSummary: string[];
}

export type JanitorTarget = "library" | "folder";

type ScanValue = {
  scannedFiles?: number;
  scannedRoots?: string[];
  issueKinds?: string[];
  issuePaths?: string[];
  issueMessages?: string[];
  issueFileIds?: string[];
  issueTotal?: number;
  issueSummary?: string[];
  truncated?: boolean;
  truncationReasons?: string[];
};

type DeleteValue = {
  reviewed?: number;
  deleted?: number;
  deletedPaths?: string[];
  failedPaths?: string[];
  failedReasons?: string[];
};

type OutcomeBody = {
  ok?: boolean;
  error?: { message?: string };
  outcome?: { kind?: string; value?: unknown; planId?: string; jobId?: string };
};

function outcomeError(body: unknown, fallback: string): string {
  const parsed = body as OutcomeBody | null;
  if (parsed?.ok === false || parsed?.error) {
    return parsed?.error?.message ?? fallback;
  }
  return fallback;
}

/**
 * A succeeded job exposes its declared result through `result.value`
 * (bounded, schema-shaped per #279); `value` is the in-process spelling
 * that never crosses the transport. Prefer the projected value.
 */
function readJobValue<T>(job: V2JobRecord): T | null {
  const projected = job.result?.value;
  if (projected !== undefined && projected !== null) return projected as T;
  if (job.value !== undefined && job.value !== null) return job.value as T;
  return null;
}

function toIssues(value: ScanValue): JanitorIssue[] {
  const count = Math.max(
    value.issueKinds?.length ?? 0,
    value.issuePaths?.length ?? 0,
    value.issueMessages?.length ?? 0,
    value.issueFileIds?.length ?? 0,
  );
  const issues: JanitorIssue[] = [];
  for (let index = 0; index < count; index += 1) {
    issues.push({
      kind: (value.issueKinds?.[index] ?? "broken") as JanitorIssueKind,
      path: value.issuePaths?.[index] ?? "",
      fileIds: (value.issueFileIds?.[index] ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
      message: value.issueMessages?.[index] ?? "",
    });
  }
  return issues;
}

/** Parse `"kind=count"` summary entries into a per-kind count map. */
export function parseIssueSummary(summary: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of summary) {
    const separator = entry.lastIndexOf("=");
    if (separator <= 0) continue;
    const kind = entry.slice(0, separator);
    const value = Number.parseInt(entry.slice(separator + 1), 10);
    if (Number.isFinite(value)) counts[kind] = value;
  }
  return counts;
}

/** Tally of scanned issues, one count per issue kind. */
export function countIssuesByKind(
  issues: JanitorIssue[],
): Record<string, number> {
  return issues.reduce(
    (acc, issue) => {
      acc[issue.kind] = (acc[issue.kind] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

async function applyDeletePlan(
  review: V2PlanReview,
): Promise<{ reviewed: number; deleted: number; failed: number }> {
  const response = await fetch(
    `/api/extensions-v2/plans/${encodeURIComponent(review.planId)}/apply`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targets: review.targets, options: review.options }),
    },
  );
  const body = (await response.json().catch(() => null)) as OutcomeBody;
  if (!response.ok || !body?.ok) {
    throw new Error(outcomeError(body, "Failed to delete folders"));
  }
  const value = (body.outcome as { value?: DeleteValue } | undefined)?.value;
  return {
    reviewed: typeof value?.reviewed === "number" ? value.reviewed : 0,
    deleted: typeof value?.deleted === "number" ? value.deleted : 0,
    failed: Array.isArray(value?.failedPaths) ? value.failedPaths.length : 0,
  };
}

export function useFolderJanitorV2({
  open,
  initialTarget = "library",
  initialFolderPath,
}: {
  open: boolean;
  initialTarget?: JanitorTarget;
  initialFolderPath?: string;
}) {
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [isScanning, setIsScanning] = useState(false);
  const [scanJobId, setScanJobId] = useState<string | null>(null);
  const [result, setResult] = useState<JanitorScanResult | null>(null);
  const [allowCleanup, setAllowCleanup] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [confirmingCleanup, setConfirmingCleanup] = useState(false);
  /** The reviewed, not-yet-applied delete plan; deletion waits for a separate apply. */
  const [pendingDelete, setPendingDelete] = useState<V2PlanReview | null>(null);

  // Reset extension-local workflow state each time this modal opens.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResult(null);
      setAllowCleanup(false);
      setIsScanning(false);
      setScanJobId(null);
      setIsRemoving(false);
      setConfirmingCleanup(false);
      setPendingDelete(null);
    }
  }, [open ]);

  const isFolderScan = initialTarget === "folder" && Boolean(initialFolderPath);
  const scanLabel = isFolderScan ? "Scan folder" : "Scan library";
  const scanDescription = isFolderScan
    ? initialFolderPath
    : "Scans every indexed file across your configured library roots.";

  const handleScan = useCallback(async () => {
    setIsScanning(true);
    setProgress({ completed: 0, total: 0 });
    setResult(null);
    setScanJobId(null);

    try {
      // Scans are host-owned jobs: live progress and cooperative
      // cancellation, so a large review never blocks the dialog.
      const response = await fetch("/api/extensions-v2/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          extensionId: FOLDER_JANITOR_V2_ID,
          commandId: isFolderScan
            ? FOLDER_JANITOR_V2_SCAN_FOLDER
            : FOLDER_JANITOR_V2_SCAN_LIBRARY,
          selection: {
            fileIds: [],
            ...(isFolderScan && initialFolderPath
              ? { folderPath: initialFolderPath }
              : {}),
          },
          input: {},
        }),
      });
      const body = (await response.json().catch(() => null)) as OutcomeBody;
      if (!response.ok || !body?.ok) {
        throw new Error(outcomeError(body, "Scan failed"));
      }
      if (body.outcome?.kind !== "job" || !body.outcome.jobId) {
        throw new Error("Scan did not start as a background job.");
      }
      const jobId = body.outcome.jobId;
      setScanJobId(jobId);
      const settled = await pollV2JobUntilSettled(jobId, {
        intervalMs: 400,
        onUpdate: (job) =>
          setProgress({
            completed: job.progress.completed,
            total: job.progress.total ?? job.progress.completed,
          }),
      });
      if (!settled.ok) throw new Error(settled.message);
      const job = settled.job;
      if (job.state === "cancelled") {
        toast.message("Scan cancelled. Nothing was changed.");
        return;
      }
      if (job.state !== "succeeded") {
        throw new Error(
          job.error?.message ?? job.result?.diagnostic?.message ?? `Scan ${job.state}.`,
        );
      }
      const value = readJobValue<ScanValue>(job);
      if (!value) {
        if (job.result?.valueOmitted) {
          throw new Error(
            "The scan found more issues than one report can carry; scan a folder or narrow the scope and try again.",
          );
        }
        throw new Error("Scan did not return a report.");
      }
      const issues = toIssues(value);
      const issueSummary = value.issueSummary ?? [];
      setResult({
        scannedFiles: value.scannedFiles ?? 0,
        scannedRoots: value.scannedRoots ?? [],
        issues,
        truncated: value.truncated === true,
        truncationReasons: value.truncationReasons ?? [],
        issueTotal:
          typeof value.issueTotal === "number"
            ? value.issueTotal
            : Object.values(parseIssueSummary(issueSummary)).reduce(
                (sum, count) => sum + count,
                issues.length,
              ),
        issueSummary,
      });
      setProgress((current) => ({
        completed: job.progress.completed || current.completed,
        total: job.progress.total ?? current.total,
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scan failed");
    } finally {
      setIsScanning(false);
      setScanJobId(null);
    }
  }, [initialFolderPath, isFolderScan]);

  const handleCancelScan = useCallback(async () => {
    if (!scanJobId) return;
    await requestV2JobCancel(scanJobId);
  }, [scanJobId]);

  const handleReveal = useCallback(async (fileId?: string, path?: string) => {
    const bridge = getDesktopBridge();
    if (bridge) {
      if (fileId) {
        await bridge.revealInExplorer(fileId);
      } else if (path) {
        await bridge.revealPath(path);
      }
    }
  }, []);

  const handleRemove = useCallback(
    async (fileIds: string[]) => {
      setIsRemoving(true);
      try {
        const invoked = await invokeV2Command({
          extensionId: FOLDER_JANITOR_V2_ID,
          commandId: FOLDER_JANITOR_V2_REMOVE_FILES,
          fileIds,
        });
        if (!invoked.ok) {
          throw new Error(invoked.message);
        }
        const body = invoked.body as OutcomeBody;
        if (!body?.ok) {
          throw new Error(outcomeError(body, "Failed to remove files"));
        }
        const value = (body.outcome as { value?: { removed?: number; unknownIds?: string[] } } | undefined)
          ?.value;
        const removed = typeof value?.removed === "number" ? value.removed : fileIds.length;
        const unknown = value?.unknownIds?.length ?? 0;
        toast.success(
          unknown > 0
            ? `Removed ${removed} file${removed !== 1 ? "s" : ""}; ${unknown} were already gone.`
            : `Removed ${removed} file${removed !== 1 ? "s" : ""}`,
        );
        await handleScan();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to remove files",
        );
      } finally {
        setIsRemoving(false);
      }
    },
    [handleScan],
  );

  /**
   * Prepare and review a deletion, then stop. Nothing is removed until
   * the separate apply action; the reviewed plan is the exact scope.
   */
  const handleDeleteFolders = useCallback(async (paths: string[]) => {
    setIsRemoving(true);
    try {
      const invoked = await invokeV2Command({
        extensionId: FOLDER_JANITOR_V2_ID,
        commandId: FOLDER_JANITOR_V2_DELETE_FOLDERS,
        commandInput: { folders: paths },
      });
      if (!invoked.ok) {
        throw new Error(invoked.message);
      }
      const body = invoked.body as OutcomeBody;
      if (!body?.ok) {
        throw new Error(outcomeError(body, "Failed to prepare the delete review"));
      }
      if (body.outcome?.kind !== "review-required" || !body.outcome.planId) {
        throw new Error("Delete did not return a review plan.");
      }
      const reviewResponse = await fetch(v2PlanRoute(body.outcome.planId));
      const reviewBody = (await reviewResponse.json().catch(() => null)) as {
        ok?: boolean;
        review?: V2PlanReview;
        error?: { message?: string };
      } | null;
      if (!reviewResponse.ok || !reviewBody?.ok || !reviewBody.review) {
        throw new Error(reviewBody?.error?.message ?? "Could not load the delete preview.");
      }
      setPendingDelete(reviewBody.review);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to prepare the delete review",
      );
    } finally {
      setIsRemoving(false);
    }
  }, []);

  const handleCancelDelete = useCallback(() => {
    setPendingDelete(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setIsRemoving(true);
    try {
      const applied = await applyDeletePlan(pendingDelete);
      setPendingDelete(null);
      if (applied.failed > 0) {
        toast.warning(
          `Deleted ${applied.deleted} of ${applied.reviewed} reviewed folder${applied.reviewed !== 1 ? "s" : ""}; ${applied.failed} could not be deleted and were left in place.`,
        );
      } else {
        toast.success(
          `Deleted ${applied.deleted} empty folder${applied.deleted !== 1 ? "s" : ""}`,
        );
      }
      await handleScan();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete folders",
      );
    } finally {
      setIsRemoving(false);
    }
  }, [pendingDelete, handleScan]);

  const handleAllowCleanupChange = useCallback((checked: boolean) => {
    if (checked) {
      setConfirmingCleanup(true);
    } else {
      setAllowCleanup(false);
    }
  }, []);

  const handleConfirmCleanup = useCallback(() => {
    setAllowCleanup(true);
    setConfirmingCleanup(false);
  }, []);

  // Prefer the accurate per-kind summary; fall back to counting the
  // bounded detail list only when the summary is absent.
  const issueCounts: Record<string, number> = result
    ? result.issueSummary.length > 0
      ? parseIssueSummary(result.issueSummary)
      : countIssuesByKind(result.issues)
    : {};

  return {
    progress,
    isScanning,
    scanJobId,
    result,
    issueCounts,
    allowCleanup,
    isRemoving,
    confirmingCleanup,
    setConfirmingCleanup,
    pendingDelete,
    isFolderScan,
    scanLabel,
    scanDescription,
    handleScan,
    handleCancelScan,
    handleReveal,
    handleRemove,
    handleDeleteFolders,
    handleConfirmDelete,
    handleCancelDelete,
    handleAllowCleanupChange,
    handleConfirmCleanup,
  };
}
