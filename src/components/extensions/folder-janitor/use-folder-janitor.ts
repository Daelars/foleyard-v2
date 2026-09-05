"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { readProgressResponse } from "@/lib/client-progress";
import { getDesktopBridge } from "@/lib/desktop";
import { executeExtensionCommand } from "@/lib/extension-client";

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

/** Generic execute-endpoint payload for a janitor scan (#82: no bespoke routes). */
export function buildJanitorScanRequest(
  initialTarget: JanitorTarget,
  initialFolderPath: string | undefined,
) {
  const isFolderScan =
    initialTarget === "folder" && Boolean(initialFolderPath);
  return isFolderScan
    ? {
        extensionId: "folder-janitor",
        commandId: "folder-janitor.scan-folder",
        input: { folderPath: initialFolderPath },
      }
    : {
        extensionId: "folder-janitor",
        commandId: "folder-janitor.scan-library",
        input: {},
      };
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

export function useFolderJanitor({
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
      const res = await fetch("/api/extensions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildJanitorScanRequest(initialTarget, initialFolderPath),
        ),
      });

      const outcome = await readProgressResponse<{
        ok: boolean;
        type?: string;
        value?: JanitorScanResult;
        message?: string;
      }>(res, setProgress);

      if (!outcome.ok || outcome.type !== "value" || !outcome.value) {
        throw new Error(outcome.message ?? "Scan failed");
      }

      setResult(outcome.value);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scan failed");
    } finally {
      setIsScanning(false);
    }
  }, [initialFolderPath, initialTarget]);

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
        const data = await executeExtensionCommand<{ removed: number }>({
          extensionId: "folder-janitor",
          commandId: "folder-janitor.remove-files",
          selection: { fileIds },
        });

        toast.success(
          `Removed ${data.removed} file${data.removed !== 1 ? "s" : ""}`,
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
        const data = await executeExtensionCommand<{
          results: Array<{ ok: boolean }>;
        }>({
          extensionId: "folder-janitor",
          commandId: "folder-janitor.delete-folders",
          input: { paths },
        });

        const deleted = data.results.filter((r) => r.ok).length;
        toast.success(
          `Deleted ${deleted} empty folder${deleted !== 1 ? "s" : ""}`,
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
