import { describe, expect, it } from "vitest";

import type { AudioPlayerFileRecord } from "./types";
import {
  EMPTY_QUEUE,
  advanceQueue,
  currentQueueId,
  currentQueueTrack,
  enqueueIds,
  removeQueueId,
  resolveQueueTrack,
  retreatQueue,
  seedQueue,
} from "./transport-queue";

// Area: #291. The playback queue is snapshotted at play time and from then on
// is an independent object: it carries its own records and source label, so a
// view change cannot re-scope it or blank the "next" title.

function track(
  id: string,
  overrides: Partial<AudioPlayerFileRecord> = {},
): AudioPlayerFileRecord {
  return {
    id,
    filename: `${id}.wav`,
    path: `/lib/${id}.wav`,
    format: "wav",
    duration: null,
    fileSize: null,
    isFavorite: false,
    tags: [],
    ...overrides,
  };
}

const files = [track("a"), track("b"), track("c")];

describe("transport queue snapshot", () => {
  it("snapshots every record and labels where playback started", () => {
    const state = seedQueue(files, files[1]!, "Favorites");

    expect(state.cursor).toBe(1);
    expect(state.queue.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(state.source).toBe("Favorites");
    expect(currentQueueTrack(state)?.id).toBe("b");
    expect(currentQueueId(state)).toBe("b");
  });

  it("falls back to just the chosen record when it is not in the list", () => {
    const lone = track("lone");
    const state = seedQueue(files, lone, "Library");

    expect(state.queue.map((entry) => entry.id)).toEqual(["lone"]);
    expect(state.cursor).toBe(0);
    expect(state.source).toBe("Library");
  });

  it("advances and retreats within the snapshot with no view input", () => {
    const state = seedQueue(files, files[0]!, "Library");

    expect(currentQueueId(advanceQueue(state))).toBe("b");
    expect(currentQueueId(retreatQueue(state))).toBe("c");
    expect(currentQueueId(advanceQueue(retreatQueue(state)))).toBe("a");
  });

  it("resolves a queued record even when the current view no longer has it", () => {
    const state = seedQueue(files, files[0]!, "Library");
    const otherView = [track("z")];
    const advanced = advanceQueue(state);

    expect(resolveQueueTrack(currentQueueTrack(advanced), otherView)?.id).toBe("b");
  });

  it("prefers a freshly loaded record for a late-arriving track", () => {
    const state = seedQueue(files, files[0]!, "Library");
    const refreshed = [
      track("a"),
      track("b", { duration: 42, isFavorite: true }),
      track("c"),
    ];

    const resolved = resolveQueueTrack(state.queue[1]!, refreshed);
    expect(resolved).toMatchObject({ id: "b", duration: 42, isFavorite: true });
  });

  it("keeps the queue snapshot when the caller mutates the source list", () => {
    const source = [track("a"), track("b")];
    const state = seedQueue(source, source[0]!, "Library");
    source.push(track("c"));

    expect(state.queue.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("enqueues unseen ids once and preserves the source", () => {
    const state = seedQueue([files[0]!], files[0]!, "Library");
    const extended = enqueueIds(state, files, ["b", "b", "c"]);

    expect(extended.queue.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(extended.source).toBe("Library");
    expect(enqueueIds(extended, files, ["a"]).queue.map((entry) => entry.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("keeps the cursor on the following track when the current one is removed", () => {
    const state = seedQueue(files, files[1]!, "Library");
    const removed = removeQueueId(state, "b");

    expect(removed.queue.map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(currentQueueId(removed)).toBe("c");
  });

  it("returns to EMPTY when the last track is removed", () => {
    const state = seedQueue([files[0]!], files[0]!, "Library");

    expect(removeQueueId(state, "a")).toEqual(EMPTY_QUEUE);
  });
});
