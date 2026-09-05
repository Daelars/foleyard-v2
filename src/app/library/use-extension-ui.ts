"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { interpretExtensionUiIntent } from "@/lib/extensions/ui-intent";
import { isDesktopApp } from "@/lib/desktop";
import type { ExtensionGridItem } from "@/lib/extensions/types";
import type { YardExtensionHostOutcome } from "@yard-core";
import type { FileRecord } from "./types";

/** Pack dialog default format from the make-pack extension settings. */
export function resolveMakePackDefaultFormat(
  extensions: ExtensionGridItem[],
): "zip" | "folder" {
  const value = extensions
    .find((e) => e.id === "make-pack")
    ?.settings?.find((s) => s.id === "default-format")?.value;
  return value === "zip" || value === "folder" ? value : "zip";
}

export type PackSource = "selection" | "shelf" | "recent";

export interface ExtensionUiCallbacks {
  showShelf: () => void;
  enterLibraryView: () => void;
  openSettings: () => void;
  requestClearShelf: () => void;
  getSelectedFile: () => FileRecord | null;
  addToCollection: (collectionId: string, fileId: string) => Promise<unknown>;
  addToShelf: (fileIds: string[]) => Promise<unknown>;
  saveSearch: (name: string) => Promise<boolean>;
  renameCollection: (id: string, name: string) => Promise<unknown>;
  /** Read-only catalog data for pack defaults. */
  extensions: ExtensionGridItem[];
}

/**
 * Extension UI state: tool dialogs, pack intents, save-search and rename
 * dialogs, and hosted-command dispatch with UI-intent handling. Navigation
 * and domain mutations arrive through explicit callbacks; this hook owns only
 * its dialog state.
 */
export function useExtensionUi(callbacks: ExtensionUiCallbacks) {
  const [selectedExtension, setSelectedExtension] =
    useState<ExtensionGridItem | null>(null);
  const [folderJanitorOpen, setFolderJanitorOpen] = useState(false);
  const [folderJanitorTarget, setFolderJanitorTarget] = useState<
    "library" | "folder"
  >("library");
  const [folderJanitorFolderPath, setFolderJanitorFolderPath] = useState("");
  const [gatherOpen, setGatherOpen] = useState(false);
  const [packSource, setPackSource] = useState<PackSource | null>(null);
  const [packFileIds, setPackFileIds] = useState<string[]>([]);
  const [showSaveSearch, setShowSaveSearch] = useState(false);
  const [renamingCollection, setRenamingCollection] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  const executeHostedCommand = useCallback(
    async (
      extensionId: string,
      commandId: string,
      target?: { fileIds?: string[]; folderPath?: string },
      input?: unknown,
    ) => {
      try {
        const response = await fetch("/api/extensions/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extensionId, commandId, selection: target, input }),
        });
        const outcome = (await response.json()) as YardExtensionHostOutcome;

        if (!response.ok || !outcome.ok) {
          throw new Error(
            outcome.ok ? "Extension command failed" : outcome.message,
          );
        }

        if (outcome.type === "ui-intent") {
          const actions = callbacksRef.current;
          const handled = interpretExtensionUiIntent(outcome.intent, {
            openFolderJanitor: (payload) => {
              setFolderJanitorTarget(payload.target);
              setFolderJanitorFolderPath(
                payload.target === "folder" ? payload.folderPath : "",
              );
              setFolderJanitorOpen(true);
            },
            openLibraryGatherer: () => setGatherOpen(true),
            openMakePack: ({ source, fileIds }) => {
              if (source === "shelf" && !isDesktopApp()) {
                toast.error(
                  "Make Pack needs the desktop app to choose an output folder",
                );
                return;
              }
              actions.enterLibraryView();
              setPackSource(source);
              setPackFileIds(fileIds);
            },
            openSettings: () => actions.openSettings(),
          });

          if (!handled) {
            toast.info(`No UI handles intent "${outcome.intent.type}" yet`);
          }
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to run extension command",
        );
      }
    },
    [],
  );

  const handleScanFolder = useCallback(
    (folderPath: string) => {
      void executeHostedCommand(
        "folder-janitor",
        "folder-janitor.scan-folder",
        { folderPath },
      );
    },
    [executeHostedCommand],
  );

  const handleRunCommand = useCallback(
    (extensionId: string, commandId: string) => {
      if (extensionId === "sound-shelf" && commandId === "sound-shelf.clear") {
        callbacksRef.current.showShelf();
        callbacksRef.current.requestClearShelf();
        return;
      }
      void executeHostedCommand(extensionId, commandId);
    },
    [executeHostedCommand],
  );

  const handleMakePackFile = useCallback(
    (file: FileRecord) =>
      executeHostedCommand(
        "make-pack",
        "make-pack.from-selection",
        { fileIds: [file.id] },
      ),
    [executeHostedCommand],
  );

  const handleMakePackShelf = useCallback(
    () => executeHostedCommand("make-pack", "make-pack.from-shelf"),
    [executeHostedCommand],
  );

  const handleAddToCollection = useCallback(async (collectionId: string) => {
    const selectedFile = callbacksRef.current.getSelectedFile();
    if (!selectedFile) {
      return;
    }
    await callbacksRef.current.addToCollection(collectionId, selectedFile.id);
  }, []);

  const handleAddCurrentToShelf = useCallback(async () => {
    const selectedFile = callbacksRef.current.getSelectedFile();
    if (!selectedFile) {
      return;
    }
    await callbacksRef.current.addToShelf([selectedFile.id]);
  }, []);

  const submitSaveSearch = useCallback(async (name: string) => {
    const saved = await callbacksRef.current.saveSearch(name);
    if (saved) {
      setShowSaveSearch(false);
    }
  }, []);

  const submitRenameCollection = useCallback(
    async (name: string) => {
      if (name.trim() && renamingCollection) {
        await callbacksRef.current.renameCollection(
          renamingCollection.id,
          name.trim(),
        );
        setRenamingCollection(null);
      }
    },
    [renamingCollection],
  );

  const openRenameCollection = useCallback((id: string, name: string) => {
    setRenamingCollection({ id, name });
  }, []);

  const handleCloseExtensionDetails = useCallback((open: boolean) => {
    if (!open) setSelectedExtension(null);
  }, []);

  const handleCloseGather = useCallback((open: boolean) => {
    if (!open) setGatherOpen(false);
  }, []);

  const handleClosePack = useCallback((open: boolean) => {
    if (!open) setPackSource(null);
  }, []);

  const makePackDefaultFormat = useMemo(
    () => resolveMakePackDefaultFormat(callbacks.extensions),
    [callbacks.extensions],
  );

  return {
    selectedExtension,
    setSelectedExtension,
    folderJanitorOpen,
    setFolderJanitorOpen,
    folderJanitorTarget,
    folderJanitorFolderPath,
    gatherOpen,
    packSource,
    packFileIds,
    showSaveSearch,
    setShowSaveSearch,
    renamingCollection,
    setRenamingCollection,
    openRenameCollection,
    makePackDefaultFormat,
    executeHostedCommand,
    handleScanFolder,
    handleRunCommand,
    handleMakePackFile,
    handleMakePackShelf,
    handleAddToCollection,
    handleAddCurrentToShelf,
    submitSaveSearch,
    submitRenameCollection,
    handleCloseExtensionDetails,
    handleCloseGather,
    handleClosePack,
  };
}
