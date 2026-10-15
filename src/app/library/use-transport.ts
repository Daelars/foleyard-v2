"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useTransportQueue } from "@/components/AudioPlayer/use-transport-queue";
import {
  currentQueueTrack,
  resolveQueueTrack,
} from "@/components/AudioPlayer/transport-queue";
import type { AudioPlayerFileRecord } from "@/components/AudioPlayer/types";

export interface TransportFocus {
  /** Current view records, used only to prefer a fresher copy of a queued id. */
  files: AudioPlayerFileRecord[];
  focusFile: (file: AudioPlayerFileRecord) => void;
}

export interface TransportAdvanceResult {
  ok: boolean;
  track: AudioPlayerFileRecord | null;
  /** Human explanation when the move could not happen; null when expected. */
  reason: string | null;
}

export interface TransportCloseSelection {
  clearSelectedFile: () => void;
  setPlaying: (playing: boolean) => void;
}

/**
 * Next-up title from the queue snapshot, skipping the currently selected
 * track. Pure so the queue-to-label contract is unit-testable without a DOM.
 */
export function resolveNextTitle(args: {
  queue: AudioPlayerFileRecord[];
  cursor: number;
  selectedFileId: string | null | undefined;
}): string | null {
  const { queue, cursor, selectedFileId } = args;
  if (queue.length <= 1) {
    return null;
  }
  const titleOf = (track: AudioPlayerFileRecord | undefined) =>
    track ? track.filename.replace(/\.[^.]+$/, "") : null;
  const next = queue[(cursor + 1) % queue.length];
  if (!next || next.id === selectedFileId) {
    return titleOf(queue.find((track) => track.id !== selectedFileId));
  }
  return titleOf(next);
}

/**
 * Transport wiring (#291): playback starts a queue snapshot and every later
 * move resolves from that snapshot, never from the current view. The route
 * passes the selection slice at call time; this hook owns only queue state,
 * the playing flag and the source label.
 */
export function useTransport() {
  const queue = useTransportQueue();
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(false);

  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  });

  const nextTitleFor = useCallback(
    (selectedFileId: string | null | undefined) =>
      resolveNextTitle({
        queue: queue.queueState.queue,
        cursor: queue.queueState.cursor,
        selectedFileId,
      }),
    [queue.queueState],
  );

  const playFile = useCallback(
    (
      files: AudioPlayerFileRecord[],
      startFile: AudioPlayerFileRecord,
      source: string | null,
    ) => {
      queueRef.current.playTracks(files, startFile, source);
    },
    [],
  );

  const trackEnded = useCallback(
    (args: TransportFocus): TransportAdvanceResult => {
      const next = queueRef.current.advanceIfEnabled();
      if (!next || next.queue.length <= 1) {
        return { ok: false, track: null, reason: null };
      }
      const track = resolveQueueTrack(currentQueueTrack(next), args.files);
      if (!track) {
        return {
          ok: false,
          track: null,
          reason: "The next track is no longer available.",
        };
      }
      args.focusFile(track);
      return { ok: true, track, reason: null };
    },
    [],
  );

  const stepTo = useCallback(
    (
      direction: "next" | "prev",
      args: TransportFocus,
    ): TransportAdvanceResult => {
      const current = queueRef.current.getState();
      if (current.queue.length === 0) {
        return { ok: false, track: null, reason: "The queue is empty." };
      }
      if (current.queue.length <= 1) {
        return { ok: false, track: null, reason: "Nothing else is queued." };
      }
      const next =
        direction === "next"
          ? queueRef.current.advance()
          : queueRef.current.retreat();
      const track = resolveQueueTrack(currentQueueTrack(next), args.files);
      if (!track) {
        return {
          ok: false,
          track: null,
          reason: "That track is no longer available.",
        };
      }
      args.focusFile(track);
      return { ok: true, track, reason: null };
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
    playingFrom: queue.queueState.source,
    nextTitleFor,
    playFile,
    trackEnded,
    stepTo,
    closePlayer,
  };
}
