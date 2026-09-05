"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useTransportQueue } from "@/components/AudioPlayer/use-transport-queue";
import type { FileRecord } from "./types";

export interface TransportSelection {
  focusFile: (file: FileRecord) => void;
}

export interface TransportCloseSelection {
  clearSelectedFile: () => void;
  setPlaying: (playing: boolean) => void;
}

export interface TransportFiles {
  orderedFiles: FileRecord[];
  files: FileRecord[];
}

/**
 * Next-up title from the queue cursor, skipping the currently selected file.
 * Pure so the queue-to-label contract is unit-testable without a DOM.
 */
export function resolveNextTitle(args: {
  files: FileRecord[];
  queue: string[];
  cursor: number;
  selectedFileId: string | null | undefined;
}): string | null {
  const { files, queue, cursor, selectedFileId } = args;
  if (queue.length <= 1) {
    return null;
  }
  const nextIndex = (cursor + 1) % queue.length;
  const nextId = queue[nextIndex];
  const titleOf = (id: string | undefined) => {
    if (!id) {
      return null;
    }
    const match = files.find((file) => file.id === id);
    return (
      match?.filename.replace(/\.[^.]+$/, "") ?? match?.filename ?? null
    );
  };
  if (!nextId || nextId === selectedFileId) {
    const following = queue.find((id) => id !== selectedFileId);
    return titleOf(following);
  }
  return titleOf(nextId);
}

/**
 * Transport wiring: the playback queue plus every queue side effect with
 * explicit selection arguments. The route passes the selection slice at call
 * time; this hook never owns selection state.
 */
export function useTransport() {
  const queue = useTransportQueue();
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(false);

  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  });

  const nextTitleFor = useCallback(
    (files: FileRecord[], selectedFileId: string | null | undefined) =>
      resolveNextTitle({
        files,
        queue: queue.queueState.queue,
        cursor: queue.queueState.cursor,
        selectedFileId,
      }),
    [queue.queueState],
  );

  const playFile = useCallback(
    (orderedFiles: FileRecord[], file: FileRecord) => {
      queueRef.current.playIds(
        orderedFiles.map((listed) => listed.id),
        file.id,
      );
    },
    [],
  );

  const trackEnded = useCallback(
    (args: TransportFiles & { focusFile: (file: FileRecord) => void }) => {
      const nextId = queueRef.current.advanceIfEnabled();
      if (!nextId) {
        return;
      }
      const match = args.orderedFiles.find((file) => file.id === nextId);
      if (match) {
        args.focusFile(match);
      }
    },
    [],
  );

  const stepTo = useCallback(
    (
      direction: "next" | "prev",
      args: TransportFiles & { focusFile: (file: FileRecord) => void },
    ) => {
      const nextId =
        direction === "next"
          ? queueRef.current.stepNext()
          : queueRef.current.stepPrev();
      if (!nextId) {
        return;
      }
      const match = args.orderedFiles.find((file) => file.id === nextId);
      if (match) {
        args.focusFile(match);
      }
    },
    [],
  );

  const closePlayer = useCallback((selection: TransportCloseSelection) => {
    queueRef.current.clear();
    selection.clearSelectedFile();
    selection.setPlaying(false);
  }, []);

  return {
    ...queue,
    isPlayerPlaying,
    setIsPlayerPlaying,
    nextTitleFor,
    playFile,
    trackEnded,
    stepTo,
    closePlayer,
  };
}
