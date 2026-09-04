"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  EMPTY_QUEUE,
  advanceQueue,
  clearQueue,
  currentQueueId,
  enqueueIds,
  removeQueueId,
  retreatQueue,
  seedQueue,
  type TransportQueueState,
} from "./transport-queue";

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

  const playIds = useCallback((visibleIds: string[], startId: string) => {
    setQueueState(seedQueue(visibleIds, startId));
  }, []);

  const enqueue = useCallback((ids: string[]) => {
    setQueueState((state) => enqueueIds(state, ids));
  }, []);

  const dequeue = useCallback((id: string) => {
    setQueueState((state) => removeQueueId(state, id));
  }, []);

  const clear = useCallback(() => {
    setQueueState(clearQueue());
  }, []);

  const stepNext = useCallback(() => {
    const next = advanceQueue(stateRef.current);
    setQueueState(next);
    return currentQueueId(next);
  }, []);

  const stepPrev = useCallback(() => {
    const next = retreatQueue(stateRef.current);
    setQueueState(next);
    return currentQueueId(next);
  }, []);

  const advanceIfEnabled = useCallback(() => {
    if (!autoplayRef.current) {
      return null;
    }

    const next = advanceQueue(stateRef.current);
    setQueueState(next);
    return currentQueueId(next);
  }, []);

  return {
    advanceIfEnabled,
    autoplay,
    clear,
    dequeue,
    enqueue,
    playIds,
    queueState,
    setAutoplay,
    stepNext,
    stepPrev,
  };
}

export type TransportQueueApi = ReturnType<typeof useTransportQueue>;
