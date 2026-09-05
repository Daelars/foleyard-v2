"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { getDesktopBridge, useDesktopApp } from "@/lib/desktop";

import type { FileTableFileRecord } from "./types";

export function useFileTableDesktopActions(
  onSelect: (file: FileTableFileRecord, index: number) => void,
  selectedIds: string[],
) {
  const [draggingFile, setDraggingFile] = useState<string | null>(null);
  const desktop = useDesktopApp();

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      return;
    }

    return bridge.onActionError((message) => {
      toast.error(message);
      setDraggingFile(null);
    });
  }, []);

  const handleCopyPath = useCallback(
    async (file: FileTableFileRecord) => {
      if (desktop) {
        const result = await getDesktopBridge()?.copyFilePath(file.id);
        if (result?.ok) {
          toast.success("File path copied", {
            action: {
              label: "Copy",
              onClick: () => navigator.clipboard.writeText(file.path),
            },
          });
          return;
        }

        toast.error(result?.error ?? "Failed to copy file path");
        return;
      }

      try {
        await navigator.clipboard.writeText(file.path);
        toast.success("File path copied");
      } catch {
        toast.error("Failed to copy file path");
      }
    },
    [desktop],
  );

  const handleRevealInExplorer = useCallback(
    async (file: FileTableFileRecord) => {
      const result = await getDesktopBridge()?.revealInExplorer(file.id);
      if (!result?.ok) {
        toast.error(result?.error ?? "Failed to reveal file in Explorer");
      }
    },
    [],
  );

  const handleOpenFile = useCallback(async (file: FileTableFileRecord) => {
    const result = await getDesktopBridge()?.openFileExternally(file.id);
    if (!result?.ok) {
      toast.error(result?.error ?? "Failed to open file");
    }
  }, []);

  const handleNativeDragStart = useCallback(
    (
      event: React.DragEvent<HTMLElement>,
      file: FileTableFileRecord,
      index: number,
    ) => {
      if (!desktop) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/plain", file.filename);
      const dragIds = selectedIds.includes(file.id) ? selectedIds : [file.id];
      if (!selectedIds.includes(file.id)) onSelect(file, index);
      setDraggingFile(file.id);
      getDesktopBridge()?.startDragFiles(dragIds);
    },
    [desktop, onSelect, selectedIds],
  );

  const handleDragEnd = useCallback(() => setDraggingFile(null), []);

  return useMemo(
    () => ({
      desktop,
      draggingFile,
      handleCopyPath,
      handleDragEnd,
      handleNativeDragStart,
      handleOpenFile,
      handleRevealInExplorer,
    }),
    [
      desktop,
      draggingFile,
      handleCopyPath,
      handleDragEnd,
      handleNativeDragStart,
      handleOpenFile,
      handleRevealInExplorer,
    ],
  );
}
