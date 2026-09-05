"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { getDesktopBridge, isDesktopApp } from "@/lib/desktop";
import { executeExtensionCommand } from "@/lib/extension-client";

export interface GatherFile {
  sourcePath: string;
  outputPath: string;
  skipped: boolean;
  reason: string | null;
}

export interface GatherPreviewResult {
  copied: number;
  skipped: number;
  files: GatherFile[];
  reportPath: string;
}

export interface GatherCompletedResult {
  copied: number;
  skipped: number;
  reportPath: string;
}

/** Validation message for the gather inputs, or null when ready to run. */
export function validateGatherInputs(
  sourceFolders: string[],
  destDir: string,
): string | null {
  if (sourceFolders.length === 0) {
    return "Add at least one source folder";
  }
  if (!destDir.trim()) {
    return "Choose a destination directory";
  }
  return null;
}

export function useLibraryGatherer() {
  const [sourceFolders, setSourceFolders] = useState<string[]>([]);
  const [newFolderPath, setNewFolderPath] = useState("");
  const [destinationGrant, setDestinationGrant] = useState("");
  const [destDir, setDestDir] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [previewResult, setPreviewResult] =
    useState<GatherPreviewResult | null>(null);
  const [completedResult, setCompletedResult] =
    useState<GatherCompletedResult | null>(null);

  const reset = useCallback(() => {
    setSourceFolders([]);
    setNewFolderPath("");
    setDestinationGrant("");
    setDestDir("");
    setIsLoading(false);
    setPreviewResult(null);
    setCompletedResult(null);
  }, []);

  const handleAddFolder = useCallback(() => {
    const path = newFolderPath.trim();
    if (!path) return;

    if (sourceFolders.includes(path)) {
      toast.error("Folder already added");
      return;
    }

    setSourceFolders((prev) => [...prev, path]);
    setNewFolderPath("");
  }, [newFolderPath, sourceFolders]);

  const handlePickFolder = useCallback(async () => {
    if (!isDesktopApp()) {
      toast.error("Folder picker requires the desktop app");
      return;
    }

    const result = await getDesktopBridge()?.pickFolder();
    if (result?.ok && result.path) {
      setNewFolderPath(result.path);
    }
  }, []);

  const handleRemoveFolder = useCallback((path: string) => {
    setSourceFolders((prev) => prev.filter((p) => p !== path));
  }, []);

  const handlePickDest = useCallback(async () => {
    if (!isDesktopApp()) {
      toast.error("Folder picker requires the desktop app");
      return;
    }

    const result = await getDesktopBridge()?.pickFolder();
    if (result?.ok && result.path) {
      setDestDir(result.path);
      setDestinationGrant(result.grantToken ?? "");
    }
  }, []);

  const handlePreview = useCallback(async () => {
    const error = validateGatherInputs(sourceFolders, destDir);
    if (error) {
      toast.error(error);
      return;
    }

    setIsLoading(true);
    setPreviewResult(null);
    setCompletedResult(null);

    try {
      const data = await executeExtensionCommand<GatherPreviewResult>({
        extensionId: "library-gatherer",
        commandId: "library-gatherer.preview-gather",
        input: {
          sourceDirectories: sourceFolders,
          destinationDirectory: destDir.trim(),
        },
        destinationGrant,
      });

      setPreviewResult(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preview failed");
    } finally {
      setIsLoading(false);
    }
  }, [sourceFolders, destDir, destinationGrant]);

  const handleGather = useCallback(async () => {
    if (sourceFolders.length === 0 || !destDir.trim()) return;

    setIsLoading(true);

    try {
      const data = await executeExtensionCommand<GatherCompletedResult>({
        extensionId: "library-gatherer",
        commandId: "library-gatherer.gather",
        input: {
          sourceDirectories: sourceFolders,
          destinationDirectory: destDir.trim(),
        },
        destinationGrant,
      });

      setCompletedResult(data);
      setPreviewResult(null);
      toast.success(`Gathered ${data.copied} files (${data.skipped} skipped)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gather failed");
    } finally {
      setIsLoading(false);
    }
  }, [sourceFolders, destDir, destinationGrant]);

  return {
    sourceFolders,
    newFolderPath,
    setNewFolderPath,
    destDir,
    setDestDir,
    isLoading,
    previewResult,
    completedResult,
    reset,
    handleAddFolder,
    handlePickFolder,
    handleRemoveFolder,
    handlePickDest,
    handlePreview,
    handleGather,
  };
}
