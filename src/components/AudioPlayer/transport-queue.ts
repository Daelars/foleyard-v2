export type TransportQueueState = {
  cursor: number;
  queue: string[];
};

export const EMPTY_QUEUE: TransportQueueState = { cursor: -1, queue: [] };

export function currentQueueId(state: TransportQueueState): string | null {
  return state.queue[state.cursor] ?? null;
}

export function seedQueue(
  visibleIds: string[],
  startId: string,
): TransportQueueState {
  const cursor = visibleIds.indexOf(startId);

  if (cursor === -1) {
    return { cursor: 0, queue: [startId] };
  }

  return { cursor, queue: [...visibleIds] };
}

export function enqueueIds(
  state: TransportQueueState,
  ids: string[],
): TransportQueueState {
  const fresh = ids.filter((id) => !state.queue.includes(id));

  if (fresh.length === 0) {
    return state;
  }

  return { cursor: state.cursor, queue: [...state.queue, ...fresh] };
}

export function advanceQueue(state: TransportQueueState): TransportQueueState {
  if (state.queue.length === 0) {
    return state;
  }

  return {
    cursor: (state.cursor + 1) % state.queue.length,
    queue: state.queue,
  };
}

export function retreatQueue(state: TransportQueueState): TransportQueueState {
  if (state.queue.length === 0) {
    return state;
  }

  return {
    cursor:
      (state.cursor - 1 + state.queue.length) % state.queue.length,
    queue: state.queue,
  };
}

export function removeQueueId(
  state: TransportQueueState,
  id: string,
): TransportQueueState {
  const index = state.queue.indexOf(id);

  if (index === -1) {
    return state;
  }

  const queue = state.queue.filter((queuedId) => queuedId !== id);

  if (queue.length === 0) {
    return { ...EMPTY_QUEUE };
  }

  const cursor =
    index < state.cursor
      ? state.cursor - 1
      : Math.min(state.cursor, queue.length - 1);

  return { cursor, queue };
}

export function clearQueue(): TransportQueueState {
  return { ...EMPTY_QUEUE };
}
