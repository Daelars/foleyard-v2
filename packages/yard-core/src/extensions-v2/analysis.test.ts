import { describe, expect, it } from "vitest";

import {
  createV2AnalysisOperations,
  denyV2AnalysisOperations,
  type V2AnalysisPorts,
} from "./analysis";

// Area: opt-in CLAP (#195). Analysis services gate the model lifecycle:
// status reads behind embeddings:read, downloads behind
// embeddings:write, and hosts without ports fail closed.
describe("createV2AnalysisOperations", () => {
  const ports: V2AnalysisPorts = {
    modelStatus: (modelId) => ({
      modelId,
      state: "ready",
      downloadedBytes: 10,
      totalBytes: 10,
      backendAvailable: false,
    }),
    downloadModel: async () => ({ bytes: 10 }),
    embedAudio: async () => ({ dim: 2, vec: [1, 0] }),
    embedTexts: async (texts) => texts.map(() => [1, 0]),
    backendAvailable: () => false,
  };

  it("passes status and embeddings through with permission checks", async () => {
    const ops = createV2AnalysisOperations({
      extensionId: "ext",
      effectivePermissions: ["embeddings:read", "embeddings:write"],
      analysis: ports,
    });
    expect(ops.modelStatus("m").state).toBe("ready");
    expect(await ops.downloadModel("m")).toEqual({ bytes: 10 });
    expect(await ops.embedAudio("f")).toEqual({ dim: 2, vec: [1, 0] });
    expect(ops.backendAvailable()).toBe(false);
  });

  it("denies downloads outside the effective set and everything without ports", async () => {
    const reader = createV2AnalysisOperations({
      extensionId: "ext",
      effectivePermissions: ["embeddings:read"],
      analysis: ports,
    });
    await expect(reader.downloadModel("m")).rejects.toThrowError(/"embeddings:write"/);
    const denied = denyV2AnalysisOperations("ext");
    expect(() => denied.modelStatus("m")).toThrowError(/"embeddings:read"/);
    await expect(denied.embedAudio("f")).rejects.toThrowError(/"embeddings:read"/);
  });
});
