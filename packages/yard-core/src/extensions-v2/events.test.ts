import { describe, expect, it } from "vitest";

import { V2EventBus } from "./index";

// Area: extension v2 R7 (#169). Typed events for settings/state/jobs/
// contribution refresh: payloads, ownership, disposal, gap detection.
// Recovery is always a reread of the owning store.

describe("V2EventBus", () => {
  it("delivers typed payloads with sequence numbers to matching subscribers", () => {
    const bus = new V2EventBus({ clock: () => "2026-09-06T00:00:00.000Z" });
    const seen: string[] = [];
    bus.subscribe("settings-changed", (payload) => {
      seen.push(`${payload.extensionId}:${(payload.keys ?? []).join(",")}`);
    });
    const first = bus.emit("settings-changed", "make-pack-v2", { keys: ["make-pack-v2.format"] });
    const second = bus.emit("state-changed", "make-pack-v2", { keys: ["draft"] });
    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
    expect(first.at).toBe("2026-09-06T00:00:00.000Z");
    expect(seen).toEqual(["make-pack-v2:make-pack-v2.format"]);
  });

  it("supports wildcard subscribers and disposal", () => {
    const bus = new V2EventBus();
    const types: string[] = [];
    const dispose = bus.subscribe("*", (payload) => {
      types.push(payload.type);
    });
    bus.emit("job-transition", "ext-a", { jobId: "vjob_1", jobState: "succeeded" });
    dispose();
    dispose();
    bus.emit("job-transition", "ext-a", { jobId: "vjob_2", jobState: "failed" });
    expect(types).toEqual(["job-transition"]);
    expect(bus.listenerCount()).toBe(0);
  });

  it("tracks listeners per type for leak checks on disable", () => {
    const bus = new V2EventBus();
    const disposeState = bus.subscribe("state-changed", () => {});
    bus.subscribe("settings-changed", () => {});
    expect(bus.listenerCount("state-changed")).toBe(1);
    expect(bus.listenerCount()).toBe(2);
    disposeState();
    expect(bus.listenerCount("state-changed")).toBe(0);
    expect(bus.currentSequence()).toBe(0);
  });

  it("exposes the sequence for gap detection after reload", () => {
    const bus = new V2EventBus();
    bus.emit("contributions-changed", "*");
    bus.emit("approvals-changed", "ext-a");
    expect(bus.currentSequence()).toBe(2);
  });
});
