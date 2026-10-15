import { describe, expect, it, vi } from "vitest";

import {
  createV2JobTransitionHandler,
  lastEmittedJobState,
  MAX_TRACKED_JOB_STATES,
} from "./jobs";

// Area: #258. Progress ticks are high-frequency and memory-only; persistence
// is coalesced to state changes, terminals and one snapshot per interval.
// Area: #316. Both per-job state memos are bounded, because job IDs are
// unique forever: without a bound each memo keeps one entry per job the
// process has ever run.

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

  it("bounds the emitted-state memo and re-emits an evicted job", () => {
    const w = world();
    w.handle({ jobId: "job-first", extensionId: "ext", state: "running" });
    expect(w.emitTransition).toHaveBeenCalledTimes(1);

    for (let index = 0; index < MAX_TRACKED_JOB_STATES; index += 1) {
      w.handle({ jobId: `job-${index}`, extensionId: "ext", state: "running" });
    }
    const before = w.emitTransition.mock.calls.length;

    // The newest job is still remembered, so a repeated report stays quiet.
    w.handle({
      jobId: `job-${MAX_TRACKED_JOB_STATES - 1}`,
      extensionId: "ext",
      state: "running",
    });
    expect(w.emitTransition.mock.calls.length).toBe(before);

    // The first job aged out of the bound, so its state is no longer known.
    w.handle({ jobId: "job-first", extensionId: "ext", state: "running" });
    expect(w.emitTransition.mock.calls.length).toBe(before + 1);
  });
});

describe("lastEmittedJobState", () => {
  it("holds its bound under sustained insertion", () => {
    lastEmittedJobState.clear();
    for (let index = 0; index < MAX_TRACKED_JOB_STATES + 50; index += 1) {
      lastEmittedJobState.set(`job-${index}`, "succeeded");
    }
    expect(lastEmittedJobState.size).toBe(MAX_TRACKED_JOB_STATES);
    expect(lastEmittedJobState.has("job-0")).toBe(false);
    expect(lastEmittedJobState.get(`job-${MAX_TRACKED_JOB_STATES + 49}`)).toBe("succeeded");
    lastEmittedJobState.clear();
  });
});
