import { describe, expect, it, vi } from "vitest";

import { createV2JobTransitionHandler } from "./jobs";

// Area: #258. Progress ticks are high-frequency and memory-only; persistence
// is coalesced to state changes, terminals and one snapshot per interval.

describe("createV2JobTransitionHandler", () => {
  function world(intervalMs = 2000) {
    let nowMs = 0;
    const persist = vi.fn();
    const emitTransition = vi.fn();
    const handle = createV2JobTransitionHandler({
      persist,
      emitTransition,
      now: () => nowMs,
      intervalMs,
    });
    return {
      persist,
      emitTransition,
      handle,
      advance: (ms: number) => {
        nowMs += ms;
      },
    };
  }

  it("persists on state changes but coalesces progress ticks", () => {
    const w = world();
    w.handle({ jobId: "job-1", extensionId: "ext", state: "running" });
    expect(w.persist).toHaveBeenCalledTimes(1);
    expect(w.emitTransition).toHaveBeenCalledTimes(1);

    // Progress ticks keep the state: no event, and no write within the window.
    for (let i = 0; i < 50; i += 1) {
      w.handle({ jobId: "job-1", extensionId: "ext", state: "running" });
    }
    expect(w.persist).toHaveBeenCalledTimes(1);
    expect(w.emitTransition).toHaveBeenCalledTimes(1);

    // After the interval one snapshot lands.
    w.advance(2000);
    w.handle({ jobId: "job-1", extensionId: "ext", state: "running" });
    expect(w.persist).toHaveBeenCalledTimes(2);
    expect(w.emitTransition).toHaveBeenCalledTimes(1);
  });

  it("always persists the terminal record and emits the transition", () => {
    const w = world();
    w.handle({ jobId: "job-2", extensionId: "ext", state: "running" });
    w.persist.mockClear();
    w.emitTransition.mockClear();

    w.handle({ jobId: "job-2", extensionId: "ext", state: "succeeded" });
    expect(w.persist).toHaveBeenCalledTimes(1);
    expect(w.emitTransition).toHaveBeenCalledWith({
      jobId: "job-2",
      extensionId: "ext",
      state: "succeeded",
    });
  });
});
