"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { v2PlanRoute, type V2PlanReview } from "@yard-core";
import {
  FOLDER_JANITOR_V2_DELETE_FOLDERS,
  FOLDER_JANITOR_V2_ID,
  FOLDER_JANITOR_V2_REMOVE_FILES,
  FOLDER_JANITOR_V2_SCAN_FOLDER,
  FOLDER_JANITOR_V2_SCAN_LIBRARY,
} from "@foleyard/folder-janitor-v2";
import { getDesktopBridge } from "@/lib/desktop";
import { invokeV2Command } from "@/lib/extensions-v2/contributions";

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
}

export type JanitorTarget = "library" | "folder";

type ScanValue = {
  scannedFiles?: number;
  scannedRoots?: string[];
  issueKinds?: string[];
  issuePaths?: string[];
  issueMessages?: string[];
  issueFileIds?: string[];
};

type OutcomeBody = {
  ok?: boolean;
  error?: { message?: string };
  outcome?: { kind?: string; value?: unknown; planId?: string };
};

function outcomeError(body: unknown, fallback: string): string {
  const parsed = body as OutcomeBody | null;
  if (parsed?.ok === false || parsed?.error) {
    return parsed?.error?.message ?? fallback;
  }
  return fallback;
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

async function applyDeletePlan(review: V2PlanReview): Promise<{ deleted: number }> {
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
  const value = (body.outcome as { value?: { deleted?: number } } | undefined)?.value;
  return { deleted: typeof value?.deleted === "number" ? value.deleted : 0 };
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
  const [result, setResult] = useState<JanitorScanResult | null>(null);
  const [allowCleanup, setAllowCleanup] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [confirmingCleanup, setConfirmingCleanup] = useState(false);

  // Reset extension-local workflow state each time this modal opens.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResult(null);
      setAllowCleanup(false);
      setIsScanning(false);
      setIsRemoving(false);
      setConfirmingCleanup(false);
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

    try {
      const invoked = await invokeV2Command({
        extensionId: FOLDER_JANITOR_V2_ID,
        commandId: isFolderScan
          ? FOLDER_JANITOR_V2_SCAN_FOLDER
          : FOLDER_JANITOR_V2_SCAN_LIBRARY,
        ...(isFolderScan && initialFolderPath
          ? { folderPath: initialFolderPath }
          : {}),
      });
      if (!invoked.ok) {
        throw new Error(invoked.message);
      }
      const body = invoked.body as OutcomeBody;
      if (!body?.ok) {
        throw new Error(outcomeError(body, "Scan failed"));
      }
      const value = (body.outcome as { value?: ScanValue } | undefined)?.value;
      if (!value) {
        throw new Error("Scan did not return a report.");
      }
      setResult({
        scannedFiles: value.scannedFiles ?? 0,
        scannedRoots: value.scannedRoots ?? [],
        issues: toIssues(value),
      });
      setProgress({ completed: 1, total: 1 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scan failed");
    } finally {
      setIsScanning(false);
    }
  }, [initialFolderPath, isFolderScan]);

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
        const value = (body.outcome as { value?: { removed?: number } } | undefined)?.value;
        const removed = typeof value?.removed === "number" ? value.removed : fileIds.length;
        toast.success(
          `Removed ${removed} file${removed !== 1 ? "s" : ""}`,
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

  const handleDeleteFolders = useCallback(
    async (paths: string[]) => {
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
          throw new Error(outcomeError(body, "Failed to delete folders"));
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
        const applied = await applyDeletePlan(reviewBody.review);
        toast.success(
          `Deleted ${applied.deleted} empty folder${applied.deleted !== 1 ? "s" : ""}`,
        );
        await handleScan();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to delete folders",
        );
      } finally {
        setIsRemoving(false);
      }
    },
    [handleScan],
  );

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

  const issueCounts: Record<string, number> = result
    ? countIssuesByKind(result.issues)
    : {};

  return {
    progress,
    isScanning,
    result,
    issueCounts,
    allowCleanup,
    isRemoving,
    confirmingCleanup,
    setConfirmingCleanup,
    isFolderScan,
    scanLabel,
    scanDescription,
    handleScan,
    handleReveal,
    handleRemove,
    handleDeleteFolders,
    handleAllowCleanupChange,
    handleConfirmCleanup,
  };
}
