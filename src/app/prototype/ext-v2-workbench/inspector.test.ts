import { describe, expect, it } from "vitest";

import { exportV2InspectorLog, type V2InspectorEntry } from "./inspector";

// Area: extension v2 R9 (#172). Inspector exports follow the privacy
// rules even when the local detail view kept user-operation context:
// paths, tokens, and stacks redact; correlation IDs and runMode survive.

function entry(overrides?: Partial<V2InspectorEntry>): V2InspectorEntry {
  return {
    seq: 1,
    at: "2026-09-06T00:00:00.000Z",
    kind: "error",
    extensionId: "fixture-worker",
    commandId: "fixture-worker.count-library",
    invocationId: "vinv_1",
    jobId: "vjob_2",
    runMode: "job",
    code: "handler-failed",
    detail: 'read C:\\tmp\\a.mp3 failed with token="tok_secretvalue"',
    transitions: ["queued", "running", "failed"],
    ...overrides,
  };
}

describe("exportV2InspectorLog", () => {
  it("redacts detail text while preserving IDs, runMode, and transitions", () => {
    const exported = exportV2InspectorLog([entry()]) as Array<Record<string, unknown>>;
    expect(exported).toHaveLength(1);
    const record = exported[0]!;
    expect(record.invocationId).toBe("vinv_1");
    expect(record.jobId).toBe("vjob_2");
    expect(record.runMode).toBe("job");
    expect(record.code).toBe("handler-failed");
    expect(record.transitions).toEqual(["queued", "running", "failed"]);
    expect(String(record.message)).not.toContain("C:\\tmp");
    expect(String(record.message)).not.toContain("tok_secretvalue");
  });

  it("caps exported transition lists", () => {
    const exported = exportV2InspectorLog([
      entry({ transitions: Array.from({ length: 40 }, (_, index) => `t${index}`) }),
    ]) as Array<Record<string, unknown>>;
    expect((exported[0]!.transitions as unknown[]).length).toBe(20);
  });
});
