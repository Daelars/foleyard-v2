"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { FileRecord } from "./types";

export interface ExtensionUiCallbacks {
  openSettings: () => void;
  getSelectedFile: () => FileRecord | null;
  addToCollection: (collectionId: string, fileId: string) => Promise<unknown>;
  addToShelf: (fileIds: string[]) => Promise<unknown>;
  saveSearch: (name: string) => Promise<boolean>;
  renameCollection: (id: string, name: string) => Promise<unknown>;
}

/**
 * Extension dialog state: the v2 janitor and gather dialogs, save-search
 * and rename dialogs, and selection-based shelf/collection helpers.
 * Navigation and domain mutations arrive through explicit callbacks;
 * this hook owns only its dialog state. The v1 host and UI intents are
 * retired: v2 commands execute through the v2 host path.
 */
export function useExtensionUi(callbacks: ExtensionUiCallbacks) {
  const [folderJanitorOpen, setFolderJanitorOpen] = useState(false);
  const [folderJanitorTarget, setFolderJanitorTarget] = useState<
    "library" | "folder"
  >("library");
  const [folderJanitorFolderPath, setFolderJanitorFolderPath] = useState("");
  const [gatherOpen, setGatherOpen] = useState(false);
  const [showSaveSearch, setShowSaveSearch] = useState(false);
  const [renamingCollection, setRenamingCollection] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  const handleScanFolder = useCallback((folderPath: string) => {
    setFolderJanitorTarget("folder");
    setFolderJanitorFolderPath(folderPath);
    setFolderJanitorOpen(true);
  }, []);

  // v2 dialog openers (renderer-owned, mirroring the Make Pack v2 run
  // path): v2 scan/gather commands return values and plans, never
  // UI intents, so palette/row/menu invocations open the dialogs that
  // orchestrate them instead of invoking headless.
  const openJanitorLibrary = useCallback(() => {
    setFolderJanitorTarget("library");
    setFolderJanitorFolderPath("");
    setFolderJanitorOpen(true);
  }, []);

  const openGatherDialog = useCallback(() => {
    setGatherOpen(true);
  }, []);

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

  const handleCloseGather = useCallback((open: boolean) => {
    if (!open) setGatherOpen(false);
  }, []);

  return {
    folderJanitorOpen,
    setFolderJanitorOpen,
    folderJanitorTarget,
    folderJanitorFolderPath,
    gatherOpen,
    showSaveSearch,
    setShowSaveSearch,
    renamingCollection,
    setRenamingCollection,
    openRenameCollection,
    handleScanFolder,
    openJanitorLibrary,
    openGatherDialog,
    handleAddToCollection,
    handleAddCurrentToShelf,
    submitSaveSearch,
    submitRenameCollection,
    handleCloseGather,
  };
}
