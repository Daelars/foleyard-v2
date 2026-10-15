import { describe, expect, it } from "vitest";

import type { IndexedAudioFile } from "../domain/audio-file";
import {
  createV2AnalysisOperations,
  denyV2AnalysisOperations,
  type V2AnalysisPorts,
} from "./analysis";
import type { V2LibraryReadPorts, V2ReadableRootsPorts } from "./operations";
import { audioFile, fakePathIo } from "./test-helpers";

// Area: opt-in CLAP (#195, #268). Analysis services gate the model
// lifecycle — status reads behind embeddings:read, downloads behind
// embeddings:write — and audio inference behind embeddings:read *and*
// files:read plus the Library-root read guard, so the backend never
// decodes a raw indexed path the extension was not authorized to read.

function libraryOf(files: IndexedAudioFile[]): V2LibraryReadPorts {
  const byId = new Map(files.map((file) => [file.id, file]));
  return {
    getFileById: (id) => byId.get(id) ?? null,
    getFilesByIds: (ids) => ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    listPage: () => ({ files, nextCursor: null }),
  };
}

function readsOf(roots: string[], existing: string[]): V2ReadableRootsPorts {
  return { libraryRoots: () => roots, pathIo: () => fakePathIo(existing) };
}

type Analyzed = { fileId: string; canonicalPath: string };

function analysisPorts(analyzed: Analyzed[]): V2AnalysisPorts {
  return {
    modelStatus: (modelId) => ({
      modelId,
      state: "ready",
      downloadedBytes: 10,
      totalBytes: 10,
      backendAvailable: false,
    }),
    downloadModel: async () => ({ bytes: 10 }),
    embedAudio: async (source) => {
      analyzed.push(source);
      return { dim: 2, vec: [1, 0] };
    },
    embedTexts: async (texts) => texts.map(() => [1, 0]),
    backendAvailable: () => false,
  };
}

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
      effectivePermissions: ["embeddings:read", "embeddings:write", "files:read"],
      library: libraryOf([audioFile("f")]),
      reads: readsOf(["/library"], ["/library", "/library/f.mp3"]),
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
      effectivePermissions: ["embeddings:read", "files:read"],
      library: libraryOf([audioFile("f")]),
      reads: readsOf(["/library"], ["/library", "/library/f.mp3"]),
      analysis: ports,
    });
    await expect(reader.downloadModel("m")).rejects.toThrowError(/"embeddings:write"/);
    const denied = denyV2AnalysisOperations("ext");
    expect(() => denied.modelStatus("m")).toThrowError(/"embeddings:read"/);
    await expect(denied.embedAudio("f")).rejects.toThrowError(/"embeddings:read"/);
  });

  it("requires both the analysis and file-read permissions for inference", async () => {
    const analyzed: Analyzed[] = [];
    const library = libraryOf([audioFile("f")]);
    const reads = readsOf(["/library"], ["/library", "/library/f.mp3"]);

    const analysisOnly = createV2AnalysisOperations({
      extensionId: "ext",
      effectivePermissions: ["embeddings:read"],
      library,
      reads,
      analysis: analysisPorts(analyzed),
    });
    await expect(analysisOnly.embedAudio("f")).rejects.toThrowError(/"files:read"/);

    const readOnly = createV2AnalysisOperations({
      extensionId: "ext",
      effectivePermissions: ["files:read"],
      library,
      reads,
      analysis: analysisPorts(analyzed),
    });
    await expect(readOnly.embedAudio("f")).rejects.toThrowError(/"embeddings:read"/);

    // Neither partial set reached the backend: the guard runs before decode.
    expect(analyzed).toEqual([]);
  });

  it("hands the backend only the canonical path the read guard approved", async () => {
    const analyzed: Analyzed[] = [];
    // The record is indexed under a link; the guard passes the resolved
    // canonical path, not the raw indexed one.
    const ops = createV2AnalysisOperations({
      extensionId: "ext",
      effectivePermissions: ["embeddings:read", "files:read"],
      library: libraryOf([audioFile("f", { path: "/library/alias.mp3" })]),
      reads: {
        libraryRoots: () => ["/library"],
        pathIo: () =>
          fakePathIo(["/library", "/library/f.mp3"], { "/library/alias.mp3": "/library/f.mp3" }),
      },
      analysis: analysisPorts(analyzed),
    });
    expect(await ops.embedAudio("f")).toEqual({ dim: 2, vec: [1, 0] });
    expect(analyzed).toEqual([{ fileId: "f", canonicalPath: "/library/f.mp3" }]);
  });

  it("rejects missing files, removed files, and outside-root paths before inference", async () => {
    const analyzed: Analyzed[] = [];
    const library = libraryOf([
      audioFile("gone", { path: "/library/gone.mp3", removedAt: "2026-09-06T00:00:00.000Z" }),
      audioFile("outside", { path: "/outside/evil.mp3" }),
      audioFile("escapes", { path: "/library/link.mp3" }),
    ]);
    const ops = createV2AnalysisOperations({
      extensionId: "ext",
      effectivePermissions: ["embeddings:read", "files:read"],
      library,
      reads: {
        libraryRoots: () => ["/library"],
        // `escapes` is a link inside the root that resolves outside it.
        pathIo: () =>
          fakePathIo(
            ["/library", "/library/missing-target-not-present", "/outside", "/outside/evil.mp3"],
            { "/library/link.mp3": "/outside/evil.mp3" },
          ),
      },
      analysis: analysisPorts(analyzed),
    });

    await expect(ops.embedAudio("unknown")).rejects.toThrowError(/not in the Library index/);
    await expect(ops.embedAudio("gone")).rejects.toThrowError(/not in the Library index/);
    await expect(ops.embedAudio("outside")).rejects.toThrowError(/outside the readable Library roots/);
    await expect(ops.embedAudio("escapes")).rejects.toThrowError(/outside the readable Library roots/);
    // A removed or out-of-root sound is never decoded.
    expect(analyzed).toEqual([]);
  });

  it("rejects when the injected index returns null instead of falling back to a raw path", async () => {
    const analyzed: Analyzed[] = [];
    const ops = createV2AnalysisOperations({
      extensionId: "ext",
      effectivePermissions: ["embeddings:read", "files:read"],
      // Injected read returns null for a file the raw path would have found.
      library: { ...libraryOf([]), getFileById: () => null },
      reads: readsOf(["/library"], ["/library", "/library/f.mp3"]),
      analysis: analysisPorts(analyzed),
    });
    await expect(ops.embedAudio("f")).rejects.toThrowError(/not in the Library index/);
    expect(analyzed).toEqual([]);
  });
});
