"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type BulkRemoveChoice = "library" | "disk";

export type BulkRemoveConfirm =
  | { stage: "choose" }
  | { stage: "confirm"; choice: BulkRemoveChoice }
  | null;

/**
 * Pure bulk-remove decision: the confirm dialog resolves to an explicit
 * choice only at the confirm stage with a non-empty id list, otherwise null.
 */
export function resolveBulkRemove(
  confirm: BulkRemoveConfirm,
  ids: string[],
): BulkRemoveChoice | null {
  if (confirm?.stage !== "confirm" || ids.length === 0) {
    return null;
  }
  return confirm.choice;
}

export interface BulkActionsInput {
  getSelectedIds: () => string[];
  bulkFavorite: (ids: string[]) => Promise<unknown>;
  bulkTag: (ids: string[], tagId: string) => Promise<unknown>;
  bulkRemove: (ids: string[], choice: BulkRemoveChoice) => Promise<unknown>;
  addToShelf: (ids: string[]) => Promise<unknown>;
  enqueue: (ids: string[]) => void;
  removeFile: (id: string, filename: string) => Promise<unknown>;
  reloadShelfCount: () => void;
}

/**
 * Bulk actions over the multi-select: favourite, queue, shelf, tag, and
 * remove run as single-request batches with explicit target state. Every
 * handler takes its ids explicitly at call time; selection clearing after a
 * bulk remove happens in the files data layer, never here. This hook owns
 * only the remove-confirm dialog state.
 */
export function useBulkActions(input: BulkActionsInput) {
  const [confirmBulkRemove, setConfirmBulkRemove] =
    useState<BulkRemoveConfirm>(null);

  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  });

  const handleBulkSaveAll = useCallback(async () => {
    await inputRef.current.bulkFavorite(inputRef.current.getSelectedIds());
  }, []);

  const handleBulkAddToQueue = useCallback(() => {
    inputRef.current.enqueue(inputRef.current.getSelectedIds());
  }, []);

  const handleBulkAddToShelf = useCallback(async () => {
    await inputRef.current.addToShelf(inputRef.current.getSelectedIds());
  }, []);

  const handleBulkTag = useCallback(async (tagId: string) => {
    await inputRef.current.bulkTag(inputRef.current.getSelectedIds(), tagId);
  }, []);

  const confirmBulkRemoveRef = useRef(confirmBulkRemove);
  useEffect(() => {
    confirmBulkRemoveRef.current = confirmBulkRemove;
  }, [confirmBulkRemove]);

  const handleRemoveFile = useCallback(
    async (file: { id: string; filename: string }) => {
      await inputRef.current.removeFile(file.id, file.filename);
      inputRef.current.reloadShelfCount();
    },
    [],
  );

  const executeBulkRemove = useCallback(async () => {
    const ids = inputRef.current.getSelectedIds();
    const choice = resolveBulkRemove(confirmBulkRemoveRef.current, ids);
    setConfirmBulkRemove(null);
    if (!choice) {
      return;
    }
    await inputRef.current.bulkRemove(ids, choice);
  }, []);

  return {
    confirmBulkRemove,
    setConfirmBulkRemove,
    handleBulkSaveAll,
    handleBulkAddToQueue,
    handleBulkAddToShelf,
    handleBulkTag,
    executeBulkRemove,
    handleRemoveFile,
  };
}
