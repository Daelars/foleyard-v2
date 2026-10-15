import type { AudioPlayerFileRecord } from "./types";

/**
 * Playback queue snapshot (#291).
 *
 * The queue is built once from the view/selection current at play time and
 * from then on is an independent object: it carries its own record copies and
 * a source label, so navigating to another view neither stops it nor re-scopes
 * it. View state is never consulted here.
 */
export interface TransportQueueState {
  cursor: number;
  queue: AudioPlayerFileRecord[];
  /** Where the queue started, e.g. "Library" or "Favorites". */
  source: string | null;
}

export const EMPTY_QUEUE: TransportQueueState = {
  cursor: -1,
  queue: [],
  source: null,
};

export function currentQueueTrack(
  state: TransportQueueState,
): AudioPlayerFileRecord | null {
  return state.queue[state.cursor] ?? null;
}

export function currentQueueId(state: TransportQueueState): string | null {
  return currentQueueTrack(state)?.id ?? null;
}

/**
 * Snapshot a view's ordered records starting at `startFile`. When the start
 * record is not part of the list (it was removed or filtered mid-flight), the
 * queue holds just that record rather than silently starting a different list.
 */
export function seedQueue(
  files: AudioPlayerFileRecord[],
  startFile: AudioPlayerFileRecord,
  source: string | null,
): TransportQueueState {
  const cursor = files.findIndex((file) => file.id === startFile.id);

  if (cursor === -1) {
    return { cursor: 0, queue: [startFile], source };
  }

  return { cursor, queue: [...files], source };
}

export function enqueueIds(
  state: TransportQueueState,
  files: AudioPlayerFileRecord[],
  ids: string[],
): TransportQueueState {
  const known = new Set(state.queue.map((track) => track.id));
  const additions: AudioPlayerFileRecord[] = [];

  for (const id of ids) {
    if (known.has(id)) {
      continue;
    }
    const match = files.find((file) => file.id === id);
    if (!match) {
      continue;
    }
    known.add(id);
    additions.push(match);
  }

  if (additions.length === 0) {
    return state;
  }

  return { ...state, queue: [...state.queue, ...additions] };
}

export function advanceQueue(state: TransportQueueState): TransportQueueState {
  if (state.queue.length === 0) {
    return state;
  }

  return { ...state, cursor: (state.cursor + 1) % state.queue.length };
}

export function retreatQueue(state: TransportQueueState): TransportQueueState {
  if (state.queue.length === 0) {
    return state;
  }

  return {
    ...state,
    cursor: (state.cursor - 1 + state.queue.length) % state.queue.length,
  };
}

export function removeQueueId(
  state: TransportQueueState,
  id: string,
): TransportQueueState {
  const index = state.queue.findIndex((track) => track.id === id);

  if (index === -1) {
    return state;
  }

  const queue = state.queue.filter((track) => track.id !== id);

  if (queue.length === 0) {
    return { ...EMPTY_QUEUE };
  }

  const cursor =
    index < state.cursor
      ? state.cursor - 1
      : Math.min(state.cursor, queue.length - 1);

  return { ...state, cursor, queue };
}

export function clearQueue(): TransportQueueState {
  return { ...EMPTY_QUEUE };
}

/**
 * Resolve a queued record: prefer the freshly loaded copy of the same id (its
 * metadata, favorite flag and tags may have arrived later), otherwise fall back
 * to the snapshot taken at play time.
 */
export function resolveQueueTrack(
  queued: AudioPlayerFileRecord | null,
  files: AudioPlayerFileRecord[],
): AudioPlayerFileRecord | null {
  if (!queued) {
    return null;
  }

  return files.find((file) => file.id === queued.id) ?? queued;
}
