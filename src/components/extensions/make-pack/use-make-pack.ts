"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { getDesktopBridge, isDesktopApp } from "@/lib/desktop";
import { executeExtensionCommand } from "@/lib/extension-client";

export type MakePackSource = "selection" | "shelf" | "recent";
export type MakePackOutputFormat = "folder" | "zip";

export interface MakePackResult {
  fileCount: number;
  outputPath: string;
}

/** Default pack name for one pack source. */
export function defaultPackName(source: MakePackSource): string {
  if (source === "selection") {
    return "Selected Sounds Pack";
  }
  if (source === "shelf") {
    return "Shelf Pack";
  }
  return "Recent Sounds Pack";
}

/** Validation message for the pack inputs, or null when ready to run. */
export function validatePackInputs(
  destDir: string,
  packName: string,
): string | null {
  if (!destDir.trim()) {
    return "Choose a destination folder";
  }
  if (!packName.trim()) {
    return "Enter a pack name";
  }
  return null;
}

export function useMakePack({
  open,
  initialSource = "selection",
  initialFileIds = [],
  initialOutputFormat = "zip",
}: {
  open: boolean;
  initialSource?: MakePackSource;
  initialFileIds?: string[];
  initialOutputFormat?: MakePackOutputFormat;
}) {
  const [source, setSource] = useState<MakePackSource>(initialSource);
  const [packName, setPackName] = useState("");
  const [destinationGrant, setDestinationGrant] = useState("");
  const [destDir, setDestDir] = useState("");
  const [outputFormat, setOutputFormat] =
    useState<MakePackOutputFormat>(initialOutputFormat);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<MakePackResult | null>(null);

  // Reset extension-local workflow state each time this modal opens.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSource(initialSource);
      setPackName(defaultPackName(initialSource));
      setDestinationGrant("");
      setDestDir("");
      setOutputFormat(initialOutputFormat);
      setIsLoading(false);
      setResult(null);
    }
  }, [open, initialSource, initialOutputFormat]);

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

  const handleMakePack = useCallback(async () => {
    const error = validatePackInputs(destDir, packName);
    if (error) {
      toast.error(error);
      return;
    }

    setIsLoading(true);

    try {
      const data = await executeExtensionCommand<MakePackResult>({
        extensionId: "make-pack",
        commandId: `make-pack.from-${source}`,
        selection: { fileIds: initialFileIds },
        input: {
          fileIds: initialFileIds,
          destinationDirectory: destDir.trim(),
          packName: packName.trim(),
          outputFormat,
        },
        destinationGrant,
      });

      setResult(data);
      toast.success(`Packed ${data.fileCount} sounds`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to make pack",
      );
    } finally {
      setIsLoading(false);
    }
  }, [source, initialFileIds, destDir, destinationGrant, packName, outputFormat]);

  return {
    source,
    setSource,
    packName,
    setPackName,
    destDir,
    setDestDir,
    outputFormat,
    setOutputFormat,
    isLoading,
    result,
    handlePickDest,
    handleMakePack,
  };
}
