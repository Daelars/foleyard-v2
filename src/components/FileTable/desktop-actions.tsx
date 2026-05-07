"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { getDesktopBridge, isDesktopApp } from "@/lib/desktop";

import type { FileTableFileRecord } from "./types";

export function useFileTableDesktopActions(
  onSelect: (file: FileTableFileRecord, index: number) => void,
) {
  const [draggingFile, setDraggingFile] = useState<string | null>(null);
  const desktop = isDesktopApp();

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

  const handleCopyPath = async (file: FileTableFileRecord) => {
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
  };

  const handleRevealInExplorer = async (file: FileTableFileRecord) => {
    const result = await getDesktopBridge()?.revealInExplorer(file.id);
    if (!result?.ok) {
      toast.error(result?.error ?? "Failed to reveal file in Explorer");
    }
  };

  const handleOpenFile = async (file: FileTableFileRecord) => {
    const result = await getDesktopBridge()?.openFileExternally(file.id);
    if (!result?.ok) {
      toast.error(result?.error ?? "Failed to open file");
    }
  };

  const handleNativeDragStart = (
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
    onSelect(file, index);
    setDraggingFile(file.id);
    getDesktopBridge()?.startDragFile(file.id, file.path);
  };

  return {
    desktop,
    draggingFile,
    handleCopyPath,
    handleDragEnd: () => setDraggingFile(null),
    handleNativeDragStart,
    handleOpenFile,
    handleRevealInExplorer,
  };
}
