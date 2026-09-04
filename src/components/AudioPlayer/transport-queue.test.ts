import { describe, expect, it } from "vitest";

import {
  advanceQueue,
  clearQueue,
  currentQueueId,
  enqueueIds,
  removeQueueId,
  retreatQueue,
  seedQueue,
  type TransportQueueState,
} from "./transport-queue";

const EMPTY: TransportQueueState = { cursor: -1, queue: [] };

describe("transport queue transitions", () => {
  it("seeds from visible order with the cursor on the played file", () => {
    const state = seedQueue(["a", "b", "c"], "b");

    expect(state).toEqual({ cursor: 1, queue: ["a", "b", "c"] });
    expect(currentQueueId(state)).toBe("b");
  });

  it("seeds a lone queue when the played file is not in the visible list", () => {
    const state = seedQueue(["a", "b"], "z");

    expect(state).toEqual({ cursor: 0, queue: ["z"] });
  });

  it("appends explicit adds without duplicating queued ids", () => {
    const seeded = seedQueue(["a", "b", "c"], "a");
    const state = enqueueIds(seeded, ["b", "d"]);

    expect(state.queue).toEqual(["a", "b", "c", "d"]);
    expect(state.cursor).toBe(0);
  });

  it("advances with wrap-around and retreats with wrap-around", () => {
    const seeded = seedQueue(["a", "b", "c"], "c");

    expect(currentQueueId(advanceQueue(seeded))).toBe("a");
    expect(currentQueueId(retreatQueue(seeded))).toBe("b");
  });

  it("advance and retreat on an empty queue stay empty", () => {
    expect(advanceQueue(EMPTY)).toEqual(EMPTY);
    expect(retreatQueue(EMPTY)).toEqual(EMPTY);
    expect(currentQueueId(EMPTY)).toBeNull();
  });

  it("removes an id and keeps the cursor on the same sound", () => {
    const seeded = seedQueue(["a", "b", "c"], "b");
    const state = removeQueueId(seeded, "a");

    expect(state.queue).toEqual(["b", "c"]);
    expect(currentQueueId(state)).toBe("b");
  });

  it("removing the current sound moves to the next one", () => {
    const seeded = seedQueue(["a", "b", "c"], "b");
    const state = removeQueueId(seeded, "b");

    expect(state.queue).toEqual(["a", "c"]);
    expect(currentQueueId(state)).toBe("c");
  });

  it("removing the last sound empties the queue", () => {
    const state = removeQueueId(seedQueue(["a"], "a"), "a");

    expect(state).toEqual(EMPTY);
  });

  it("clear empties the queue", () => {
    expect(clearQueue()).toEqual(EMPTY);
  });
});
