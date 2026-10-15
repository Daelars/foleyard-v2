"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  EMPTY_QUEUE,
  advanceQueue,
  clearQueue,
  enqueueIds,
  removeQueueId,
  retreatQueue,
  seedQueue,
  type TransportQueueState,
} from "./transport-queue";
import type { AudioPlayerFileRecord } from "./types";

/**
 * Owns the playback queue snapshot (#291). Views never reach into it: playback
 * seeds it once from explicit records, and every later move reads only the
 * snapshot, so navigating views cannot re-scope the queue.
 */
export function useTransportQueue() {
  const [queueState, setQueueState] = useState<TransportQueueState>(() => ({
    ...EMPTY_QUEUE,
  }));
  const [autoplay, setAutoplay] = useState(false);
  const stateRef = useRef(queueState);
  const autoplayRef = useRef(autoplay);

  useEffect(() => {
    stateRef.current = queueState;
    autoplayRef.current = autoplay;
  });

  const playTracks = useCallback(
    (
      files: AudioPlayerFileRecord[],
      startFile: AudioPlayerFileRecord,
      source: string | null,
    ) => {
      setQueueState(seedQueue(files, startFile, source));
    },
    [],
  );

  const enqueueTracks = useCallback(
    (files: AudioPlayerFileRecord[], ids: string[]) => {
      setQueueState((state) => enqueueIds(state, files, ids));
    },
    [],
  );

  const remove = useCallback((ids: Iterable<string>) => {
    setQueueState((state) => {
      let next = state;
      for (const id of ids) next = removeQueueId(next, id);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setQueueState(clearQueue());
  }, []);

  const advance = useCallback((): TransportQueueState => {
    const next = advanceQueue(stateRef.current);
    setQueueState(next);
    return next;
  }, []);

  const retreat = useCallback((): TransportQueueState => {
    const next = retreatQueue(stateRef.current);
    setQueueState(next);
    return next;
  }, []);

  const advanceIfEnabled = useCallback((): TransportQueueState | null => {
    if (!autoplayRef.current) {
      return null;
    }

    const next = advanceQueue(stateRef.current);
    setQueueState(next);
    return next;
  }, []);

  const getState = useCallback((): TransportQueueState => stateRef.current, []);

  return {
    advance,
    advanceIfEnabled,
    autoplay,
    clear,
    enqueueTracks,
    getState,
    playTracks,
    queueState,
    remove,
    retreat,
    setAutoplay,
  };
}
