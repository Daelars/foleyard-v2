"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearSelection,
  rangeSelect,
  toggleInSelection,
} from "@/components/FileTable/selection";
import type { SelectModifiers } from "@/components/FileTable/types";
import type { FileRecord } from "./types";

export type SelectionPlayIds = (ids: string[], id: string) => void;

/** Keep only ids still present in the visible list. */
export function pruneSelection(
  current: string[],
  visibleIds: Set<string>,
): string[] {
  return current.filter((id) => visibleIds.has(id));
}

export type SelectTransition =
  | { action: "range"; selectedIds: string[]; anchor: string }
  | { action: "toggle"; selectedIds: string[]; anchor: string }
  | { action: "toggle-play" }
  | { action: "play-new" };

/**
 * Pure select transition: shift extends from the anchor, ctrl/meta toggles
 * one id, otherwise the row plays (or toggles playback when already current).
 */
export function computeSelectTransition(args: {
  orderedIds: string[];
  anchor: string | null;
  fileId: string;
  modifiers: SelectModifiers;
  selectedFileId: string | null;
  selectedIds?: string[];
}): SelectTransition {
  if (args.modifiers.shiftKey) {
    return {
      action: "range",
      selectedIds: rangeSelect(args.orderedIds, args.anchor, args.fileId),
      anchor: args.anchor ?? args.fileId,
    };
  }
  if (args.modifiers.ctrlKey || args.modifiers.metaKey) {
    return {
      action: "toggle",
      selectedIds: toggleInSelection(args.selectedIds ?? [], args.fileId),
      anchor: args.fileId,
    };
  }
  if (args.selectedFileId === args.fileId) {
    return { action: "toggle-play" };
  }
  return { action: "play-new" };
}

/** Next file for keyboard moves, wrapping around the visible list. */
export function resolveMoveTarget(
  visible: FileRecord[],
  currentId: string | null | undefined,
  direction: 1 | -1,
): FileRecord | null {
  if (visible.length === 0) {
    return null;
  }
  const index = visible.findIndex((file) => file.id === currentId);
  return visible[(index + direction + visible.length) % visible.length] ?? null;
}

export interface SelectionInput {
  orderedFiles: FileRecord[];
  playIds: SelectionPlayIds;
  /** Toggles playback for the currently selected file. */
  togglePlayback: () => void;
}

/**
 * Library selection: selected file, multi-select ids, and the range anchor.
 * Playback and transport stay with the caller through explicit callbacks;
 * this hook never fetches or writes another hook's state. The files data
 * layer syncs the selected file through `syncSelectedFile`.
 */
export function useSelection(input: SelectionInput) {
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectionAnchorRef = useRef<string | null>(null);
  const selectedIdsRef = useRef<string[]>([]);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  });

  const handleClearSelection = useCallback(() => {
    setSelectedIds(clearSelection());
    selectionAnchorRef.current = null;
  }, []);

  const syncSelectedFile = useCallback(
    (updater: (prev: FileRecord | null) => FileRecord | null) => {
      setSelectedFile(updater);
    },
    [],
  );

  // Prune selection when the visible list changes. Adjusts state during
  // render against the previously seen list rather than in an effect, so no
  // cascading render is scheduled after commit.
  const [prevOrderedFiles, setPrevOrderedFiles] = useState(input.orderedFiles);
  if (prevOrderedFiles !== input.orderedFiles) {
    setPrevOrderedFiles(input.orderedFiles);
    const visibleIds = new Set(input.orderedFiles.map((file) => file.id));
    setSelectedIds((current) => pruneSelection(current, visibleIds));
    setSelectedFile((current) => {
      if (!current) return null;
      return (
        input.orderedFiles.find((file) => file.id === current.id) ?? current
      );
    });
  }
  useEffect(() => {
    const visibleIds = new Set(
      inputRef.current.orderedFiles.map((file) => file.id),
    );
    if (
      selectionAnchorRef.current &&
      !visibleIds.has(selectionAnchorRef.current)
    ) {
      selectionAnchorRef.current = null;
    }
  }, [input.orderedFiles]);

  const handleSelectFile = useCallback(
    (file: FileRecord, _index: number, modifiers: SelectModifiers = {}) => {
      const { orderedFiles, playIds, togglePlayback } = inputRef.current;
      const orderedIds = orderedFiles.map((listed) => listed.id);
      if (modifiers.shiftKey) {
        setSelectedIds(
          rangeSelect(orderedIds, selectionAnchorRef.current, file.id),
        );
        return;
      }
      if (modifiers.ctrlKey || modifiers.metaKey) {
        setSelectedIds((prev) => toggleInSelection(prev, file.id));
        selectionAnchorRef.current = file.id;
        return;
      }
      setSelectedFile((current) => {
        if (current?.id === file.id) {
          togglePlayback();
          return current;
        }
        playIds(orderedIds, file.id);
        return file;
      });
      setSelectedIds([file.id]);
      selectionAnchorRef.current = file.id;
    },
    [],
  );

  const selectedFileRef = useRef(selectedFile);
  useEffect(() => {
    selectedFileRef.current = selectedFile;
  }, [selectedFile]);

  const moveTo = useCallback(
    (direction: 1 | -1) => {
      const { orderedFiles, playIds } = inputRef.current;
      const visible = orderedFiles;
      if (visible.length === 0) {
        return;
      }
      const currentId =
        selectedFileRef.current?.id ??
        selectedIdsRef.current[selectedIdsRef.current.length - 1];
      const next = resolveMoveTarget(visible, currentId, direction);
      if (!next) {
        return;
      }
      playIds(
        visible.map((listed) => listed.id),
        next.id,
      );
      setSelectedFile(next);
      setSelectedIds([next.id]);
      selectionAnchorRef.current = next.id;
      if (typeof document !== "undefined") {
        const row = document.querySelector(
          `[data-file-id="${CSS.escape(next.id)}"]`,
        );
        if (row instanceof HTMLElement) {
          row.scrollIntoView({ block: "nearest" });
          row.focus({ preventScroll: true });
        }
      }
    },
    [],
  );

  const handleMoveSelection = useCallback(
    (direction: 1 | -1) => {
      moveTo(direction);
    },
    [moveTo],
  );

  const focusFile = useCallback((file: FileRecord) => {
    setSelectedFile(file);
    setSelectedIds([file.id]);
    selectionAnchorRef.current = file.id;
  }, []);

  const removeFromSelection = useCallback((removedIds: Set<string>) => {
    setSelectedIds((current) =>
      current.filter((id) => !removedIds.has(id)),
    );
  }, []);

  const getSelectedFile = useCallback(() => selectedFileRef.current, []);

  return {
    selectedFile,
    setSelectedFile,
    selectedIds,
    setSelectedIds,
    selectedIdsRef,
    selectionAnchorRef,
    handleClearSelection,
    handleSelectFile,
    handleMoveSelection,
    focusFile,
    removeFromSelection,
    getSelectedFile,
    syncSelectedFile,
  };
}
