import { describe, expect, it } from "vitest";

import { CLAP_MODEL_ID } from "@/lib/audio-analysis/clap";
import { createV2AnalysisPorts } from "./analysis";

describe("production CLAP composition", () => {
  it("registers the concrete backend factory without starting inference", () => {
    const status = createV2AnalysisPorts().modelStatus(CLAP_MODEL_ID);
    expect(status.modelId).toBe(CLAP_MODEL_ID);
    expect(status.backendAvailable).toBe(true);
    expect(["ready", "not-downloaded", "downloading"]).toContain(status.state);
  });
});
