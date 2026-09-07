import { describe, expect, it } from "vitest";

import type { IndexedAudioFile } from "../domain/audio-file";
import type { ScanFileRecord } from "../services/library/scan-types";
import {
  createV2LibraryMutationOperations,
  denyV2LibraryMutationOperations,
  V2_LIBRARY_MUTATION_LIMIT,
  V2OperationError,
  type V2LibraryMutationFactoryArgs,
  type V2LibraryMutationPorts,
} from "./index";
import { audioFile, libraryPorts } from "./test-helpers";

// Area: extension v2 E1 (#176). Library index mutations sit behind
// `library:write`: mark-removed resolves index IDs to paths (unknown
// IDs report, never fail the batch), gathered inserts validate shape
// and stay bounded. Mutations persist before notifying.

function record(id: string, path = `/lib/${id}.mp3`): IndexedAudioFile {
  return audioFile(id, { path, filename: `${id}.mp3` });
}

function gathered(path: string): ScanFileRecord {
  return {
    path,
    filename: path.split("/").pop()!,
    libraryRoot: "/lib",
    directory: null,
    format: "mp3",
    codec: null,
    duration: 60,
    sampleRate: 44100,
    bitDepth: 16,
    channels: 2,
    fileSize: 1024,
    mtimeMs: 1,
    removedAt: null,
    lastScannedAt: "2026-09-06T00:00:00.000Z",
  };
}

function setup(
  files: IndexedAudioFile[] = [record("a"), record("b")],
  overrides?: Partial<V2LibraryMutationFactoryArgs>,
) {
  const calls: Array<{ kind: string; at: number }> = [];
  let tick = 0;
  const markedPaths: string[] = [];
  const inserted: ScanFileRecord[] = [];
  const notified: string[] = [];
  const ports: V2LibraryMutationPorts = {
    markRemovedByPaths: (paths) => {
      calls.push({ kind: "persist", at: tick++ });
      markedPaths.push(...paths);
    },
    insertRecords: (records) => {
      calls.push({ kind: "persist", at: tick++ });
      inserted.push(...records);
    },
  };
  const operations = createV2LibraryMutationOperations({
    extensionId: "folder-janitor-v2",
    effectivePermissions: ["library:write"],
    mutations: ports,
    resolveByIds: (ids) =>
      libraryPorts(files)
        .getFilesByIds(ids)
        .map((file) => ({ id: file.id, path: file.path })),
    notify: (scope) => {
      calls.push({ kind: `notify:${scope}`, at: tick++ });
      notified.push(scope);
    },
    now: "2026-09-06T00:00:00.000Z",
    ...overrides,
  });
  return { operations, markedPaths, inserted, notified, calls };
}

describe("v2 library mutations permission confinement", () => {
  it("denies every mutation when library:write is missing", () => {
    const { operations } = setup([record("a")], { effectivePermissions: ["library:read"] });
    expect(() => operations.markRemoved(["a"])).toThrowError(V2OperationError);
    expect(() => operations.markRemoved(["a"])).toThrowError(/"library:write"/);
    expect(() => operations.insertGathered([gathered("/lib/new.mp3")])).toThrowError(
      /"library:write"/,
    );
  });

  it("denies closed hosts without mutation ports", () => {
    const denied = denyV2LibraryMutationOperations("folder-janitor-v2");
    expect(() => denied.markRemoved(["a"])).toThrowError(/"library:write"/);
    expect(() => denied.insertGathered([gathered("/lib/new.mp3")])).toThrowError(
      /"library:write"/,
    );
  });

  it("reports unsupported bindings instead of mutating silently", () => {
    const { operations } = setup([record("a")], { mutations: undefined });
    expect(() => operations.markRemoved(["a"])).toThrowError(/not supported by this host binding/);
    expect(() => operations.insertGathered([gathered("/lib/new.mp3")])).toThrowError(
      /not supported by this host binding/,
    );
  });
});

describe("v2 markRemoved", () => {
  it("marks known IDs and reports unknown IDs without failing", () => {
    const { operations, markedPaths } = setup();
    const result = operations.markRemoved(["a", "gone", "a"]);
    expect(result).toEqual({ marked: ["a"], unknownIds: ["gone"] });
    expect(markedPaths).toEqual(["/lib/a.mp3"]);
  });

  it("persists before notifying", () => {
    const { operations, calls, notified } = setup();
    operations.markRemoved(["a"]);
    expect(calls.map((call) => call.kind)).toEqual(["persist", "notify:library"]);
    expect(notified).toEqual(["library"]);
  });

  it("rejects blank IDs and over-limit batches", () => {
    const { operations } = setup();
    expect(() => operations.markRemoved(["  "])).toThrowError(/non-empty string/);
    const tooMany = Array.from({ length: V2_LIBRARY_MUTATION_LIMIT + 1 }, (_, index) => `id-${index}`);
    expect(() => operations.markRemoved(tooMany)).toThrowError(/per-call limit/);
  });
});

describe("v2 insertGathered", () => {
  it("inserts validated records and persists before notifying", () => {
    const { operations, inserted, calls } = setup();
    const result = operations.insertGathered([gathered("/lib/new.mp3")]);
    expect(result).toEqual({ inserted: 1 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.path).toBe("/lib/new.mp3");
    expect(calls.map((call) => call.kind)).toEqual(["persist", "notify:library"]);
  });

  it("rejects malformed records, traversal paths, and over-limit batches", () => {
    const { operations, inserted } = setup();
    expect(() => operations.insertGathered([])).toThrowError(/non-empty array/);
    expect(() => operations.insertGathered([{ ...gathered("/lib/ok.mp3"), path: "  " }])).toThrowError(
      /non-empty path/,
    );
    expect(() =>
      operations.insertGathered([{ ...gathered("/evil.mp3"), path: "/lib/../../evil.mp3" }]),
    ).toThrowError(/rejected path/);
    expect(() =>
      operations.insertGathered([{ ...gathered("/lib/ok.mp3"), mtimeMs: Number.NaN }]),
    ).toThrowError(/finite mtimeMs/);
    const tooMany = Array.from({ length: V2_LIBRARY_MUTATION_LIMIT + 1 }, (_, index) =>
      gathered(`/lib/f-${index}.mp3`),
    );
    expect(() => operations.insertGathered(tooMany)).toThrowError(/per-call limit/);
    expect(inserted).toEqual([]);
  });
});
