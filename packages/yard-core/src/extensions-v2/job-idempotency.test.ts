import { describe, expect, it } from "vitest";

import type { IndexedAudioFile } from "../domain/audio-file";
import {
  createGreeterFixtureDefinition,
  exposedV2JobRecord,
  ExtensionV2Host,
  ExtensionV2Registry,
  fingerprintV2JobRequest,
  handleV2HttpJobSubmit,
  immediateV2Result,
  isV2JobIdempotencyConflict,
  V2JobIdempotencyConflictError,
  V2JobManager,
  type V2HostServices,
  type V2LibraryPorts,
} from "./index";

// Area: #314. Idempotent submission is only durable if a reused key is
// bound to the payload it was first used with. A resubmission with the
// same key and the same payload returns the existing job (a lost
// response is recoverable); a reused key with a changed payload is
// rejected instead of silently running the earlier job. The payload
// digest persists with the record and is never exposed over the API.

const EXTENSION_ID = "fixture-greeter";
const COMMAND_ID = "fixture-greeter.greet";

function record(): IndexedAudioFile {
  return {
    id: "a",
    path: "/lib/a.mp3",
    filename: "a.mp3",
    libraryRoot: "/lib",
    directory: null,
    format: "mp3",
    duration: 60,
    sampleRate: 44100,
    bitDepth: 16,
    channels: 2,
    fileSize: 1,
    isFavorite: false,
    removedAt: null,
    lastScannedAt: "2026-09-06T00:00:00.000Z",
    mtimeMs: 1,
  };
}

const library: V2LibraryPorts = {
  getFileById: (id) => (id === "a" ? record() : null),
  getFilesByIds: (ids) => ids.filter((id) => id === "a").map(() => record()),
  collectionExists: () => true,
};

function fixtureHost(manager: V2JobManager): ExtensionV2Host {
  const registry = new ExtensionV2Registry();
  registry.register(createGreeterFixtureDefinition());
  const services: V2HostServices = {
    registry,
    isEnabled: () => true,
    capabilities: new Set<string>(),
    grantedPermissions: () => ["library:read"],
    ports: library,
    jobManager: manager,
  };
  const host = new ExtensionV2Host(services);
  host.registerHandler(EXTENSION_ID, COMMAND_ID, () => immediateV2Result({ message: "ok" }));
  return host;
}

describe("v2 job idempotency fingerprints", () => {
  it("fingerprints identical payloads identically and different ones apart", () => {
    const one = fingerprintV2JobRequest({ name: "Ada", greeting: "hello" }, { fileIds: ["a"] });
    const reordered = fingerprintV2JobRequest(
      { greeting: "hello", name: "Ada" },
      { fileIds: ["a"] },
    );
    const changed = fingerprintV2JobRequest({ name: "Grace" }, { fileIds: ["a"] });
    const changedSelection = fingerprintV2JobRequest({ name: "Ada" }, { fileIds: ["b"] });

    expect(reordered).toBe(one);
    expect(changed).not.toBe(one);
    expect(changedSelection).not.toBe(one);
  });

  it("rejects a reused key when the payload changed", async () => {
    const manager = new V2JobManager();
    const spec = {
      extensionId: "ext",
      commandId: "cmd",
      invocationId: "vinv_1",
      idempotencyKey: "export-1",
      requestFingerprint: "fp-a",
      run: async () => ({}),
    };
    const first = manager.submit(spec);

    expect(() =>
      manager.submit({ ...spec, invocationId: "vinv_2", requestFingerprint: "fp-b" }),
    ).toThrow(V2JobIdempotencyConflictError);
    try {
      manager.submit({ ...spec, invocationId: "vinv_2", requestFingerprint: "fp-b" });
    } catch (error) {
      expect(isV2JobIdempotencyConflict(error)).toBe(true);
    }

    const same = manager.submit({ ...spec, invocationId: "vinv_3", requestFingerprint: "fp-a" });
    expect(same.duplicate).toBe(true);
    expect(same.record.jobId).toBe(first.record.jobId);
    await manager.waitFor(first.record.jobId);
  });

  it("persists the fingerprint, restores it, and never exposes it", async () => {
    const manager = new V2JobManager();
    const submitted = manager.submit({
      extensionId: "ext",
      commandId: "cmd",
      invocationId: "vinv_1",
      idempotencyKey: "k",
      requestFingerprint: "fp-a",
      run: async () => ({}),
    });
    await manager.waitFor(submitted.record.jobId);

    const snapshot = manager.snapshot();
    expect(snapshot.jobs[0]?.requestFingerprint).toBe("fp-a");
    expect(exposedV2JobRecord(submitted.record).requestFingerprint).toBeUndefined();

    const restarted = new V2JobManager();
    restarted.restoreSnapshot(snapshot);
    const duplicate = restarted.submit({
      extensionId: "ext",
      commandId: "cmd",
      invocationId: "vinv_2",
      idempotencyKey: "k",
      requestFingerprint: "fp-a",
      run: async () => ({}),
    });
    expect(duplicate.duplicate).toBe(true);
    expect(() =>
      restarted.submit({
        extensionId: "ext",
        commandId: "cmd",
        invocationId: "vinv_3",
        idempotencyKey: "k",
        requestFingerprint: "fp-b",
        run: async () => ({}),
      }),
    ).toThrow(V2JobIdempotencyConflictError);
  });

  it("conflicts over HTTP with 409 when the payload changed", async () => {
    const host = fixtureHost(new V2JobManager());
    const base = {
      extensionId: EXTENSION_ID,
      commandId: COMMAND_ID,
      selection: { fileIds: ["a"] },
      idempotencyKey: "http-export",
    };
    const first = await handleV2HttpJobSubmit(host, { ...base, input: { name: "Ada" } });
    expect(first.status).toBe(202);

    const conflict = await handleV2HttpJobSubmit(host, { ...base, input: { name: "Grace" } });
    expect(conflict.status).toBe(409);
    expect((conflict.body as { error: { code: string } }).error.code).toBe("idempotency-conflict");

    const same = await handleV2HttpJobSubmit(host, { ...base, input: { name: "Ada" } });
    expect(same.status).toBe(202);
    expect((same.body as { outcome: { duplicate?: boolean } }).outcome.duplicate).toBe(true);
  });
});
