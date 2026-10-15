import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createV2OperationServices,
  V2GrantStore,
  V2JobCancelledError,
  V2JobManager,
  type IndexedAudioFile,
  type V2FileContentPorts,
  type V2JobReporter,
  type V2OperationServices,
} from "@yard-core";
import { createV2ArchivePorts } from "@/lib/extensions-v2/archive";
import { createV2FileContentPorts } from "@/lib/extensions-v2/filesystem";

// Area: extension v2 output ownership (#267). Real filesystem, the
// production file/archive ports, and the authorized operation services:
// output creation is exclusive (a pre-existing or concurrently claimed
// destination is never truncated or overwritten), and cancellation
// cleanup removes only the entries this job created — a replacement at a
// previously owned path survives.

function record(id: string, dir: string, filename: string): IndexedAudioFile {
  return {
    id,
    path: path.join(dir, filename),
    filename,
    libraryRoot: dir,
    directory: null,
    format: path.extname(filename).slice(1) || null,
    duration: 60,
    sampleRate: 44100,
    bitDepth: 16,
    channels: 2,
    fileSize: 4,
    isFavorite: false,
    removedAt: null,
    lastScannedAt: "2026-09-06T00:00:00.000Z",
    mtimeMs: 1,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

type Sandbox = {
  root: string;
  libDir: string;
  outDir: string;
  grantId: string;
  services: (invocationId: string, jobs?: V2JobReporter) => V2OperationServices;
};

let sandboxes: Sandbox[] = [];

function sandbox(): Sandbox {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-out-")));
  const libDir = path.join(root, "lib");
  const outDir = path.join(root, "out");
  fs.mkdirSync(libDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(libDir, "a.wav"), "aaa");
  const records = [record("a", libDir, "a.wav")];
  const byId = new Map(records.map((file) => [file.id, file]));
  const grants = new V2GrantStore();
  const grant = grants.issue("fixture-output", outDir);
  const files: V2FileContentPorts = createV2FileContentPorts();
  const world: Sandbox = {
    root,
    libDir,
    outDir,
    grantId: grant.grantId,
    services: (invocationId: string, jobs?: V2JobReporter) =>
      createV2OperationServices({
        extensionId: "fixture-output",
        invocationId,
        effectivePermissions: ["library:read", "files:read", "files:copy", "files:write"],
        grants,
        library: {
          getFileById: (id) => byId.get(id) ?? null,
          getFilesByIds: (ids) => ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
          listPage: () => ({ files: records, nextCursor: null }),
        },
        files: { ...files, libraryRoots: () => [libDir] },
        archive: createV2ArchivePorts(),
        settings: { readRaw: () => undefined, writeRaw: () => {} },
        extensionState: { readAll: () => ({}), writeAll: () => {} },
        ...(jobs ? { jobs } : {}),
      }),
  };
  sandboxes.push(world);
  return world;
}

/** Replace the entry at a path with a different file (new identity). */
function replaceFile(candidate: string, text: string): void {
  fs.rmSync(candidate, { force: true });
  fs.writeFileSync(candidate, text);
}

beforeEach(() => {
  sandboxes = [];
});
afterEach(() => {
  for (const world of sandboxes) fs.rmSync(world.root, { recursive: true, force: true });
  sandboxes = [];
});

describe("v2 production output ports are exclusive", () => {
  it("refuses an existing destination instead of truncating it (copy)", async () => {
    const world = sandbox();
    const dest = path.join(world.outDir, "taken.wav");
    fs.writeFileSync(dest, "precious");
    const ports = { ...createV2FileContentPorts(), libraryRoots: () => [world.libDir] };

    await expect(ports.copyFile(path.join(world.libDir, "a.wav"), dest)).rejects.toThrowError(
      /already exists/i,
    );
    expect(fs.readFileSync(dest, "utf8")).toBe("precious");
  });

  it("refuses an existing destination instead of truncating it (text)", async () => {
    const world = sandbox();
    const dest = path.join(world.outDir, "taken.txt");
    fs.writeFileSync(dest, "precious");
    const ports = createV2FileContentPorts();

    await expect(ports.writeFileBytes(dest, new TextEncoder().encode("mine"))).rejects.toThrowError(
      /already exists/i,
    );
    expect(fs.readFileSync(dest, "utf8")).toBe("precious");
  });

  it("refuses an existing destination instead of truncating it (ZIP)", async () => {
    const world = sandbox();
    const dest = path.join(world.outDir, "taken.zip");
    fs.writeFileSync(dest, "precious-archive");
    const ports = createV2ArchivePorts();

    await expect(
      ports.createZipArchive(
        [{ name: "a.wav", sourcePath: path.join(world.libDir, "a.wav") }],
        dest,
      ),
    ).rejects.toThrowError(/already exists/i);
    expect(fs.readFileSync(dest, "utf8")).toBe("precious-archive");
  });
});

describe("v2 output conflicts through the authorized services", () => {
  it("reports a pre-existing destination as the documented conflict outcome", async () => {
    const world = sandbox();
    const services = world.services("vinv_conflict");
    fs.writeFileSync(path.join(world.outDir, "taken.wav"), "precious");

    await expect(services.files.copyToOutput("a", "taken.wav", world.grantId)).rejects.toThrowError(
      /never overwritten/,
    );
    await expect(
      services.files.createOutputText(world.grantId, "taken.wav", "mine"),
    ).rejects.toThrowError(/never overwritten/);
    await expect(services.archive.createZip(world.grantId, "taken.wav", ["a"])).rejects.toThrowError(
      /\.zip/,
    );
    fs.writeFileSync(path.join(world.outDir, "taken.zip"), "precious-archive");
    await expect(services.archive.createZip(world.grantId, "taken.zip", ["a"])).rejects.toThrowError(
      /never overwritten/,
    );
    expect(fs.readFileSync(path.join(world.outDir, "taken.wav"), "utf8")).toBe("precious");
    expect(fs.readFileSync(path.join(world.outDir, "taken.zip"), "utf8")).toBe("precious-archive");
    expect(services.workspace.ownedPaths()).toEqual([]);
  });

  it("lets exactly one of two concurrent jobs claim a destination (copy)", async () => {
    const world = sandbox();
    const first = world.services("vinv_first");
    const second = world.services("vinv_second");

    const settled = await Promise.allSettled([
      first.files.copyToOutput("a", "same.wav", world.grantId),
      second.files.copyToOutput("a", "same.wav", world.grantId),
    ]);

    const fulfilled = settled.filter((entry) => entry.status === "fulfilled");
    const rejected = settled.filter((entry) => entry.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String((rejected[0] as PromiseRejectedResult).reason)).toMatch(/already exists/i);
    expect(fs.readFileSync(path.join(world.outDir, "same.wav"), "utf8")).toBe("aaa");
  });

  it("lets exactly one of two concurrent jobs claim a destination (text)", async () => {
    const world = sandbox();
    const first = world.services("vinv_first");
    const second = world.services("vinv_second");

    const settled = await Promise.allSettled([
      first.files.createOutputText(world.grantId, "same.txt", "first"),
      second.files.createOutputText(world.grantId, "same.txt", "second"),
    ]);

    expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.filter((entry) => entry.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(String((rejected[0] as PromiseRejectedResult).reason)).toMatch(/already exists/i);
  });

  it("lets exactly one of two concurrent jobs claim a destination (ZIP)", async () => {
    const world = sandbox();
    const first = world.services("vinv_first");
    const second = world.services("vinv_second");

    const settled = await Promise.allSettled([
      first.archive.createZip(world.grantId, "same.zip", ["a"]),
      second.archive.createZip(world.grantId, "same.zip", ["a"]),
    ]);

    expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.filter((entry) => entry.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(String((rejected[0] as PromiseRejectedResult).reason)).toMatch(/already exists/i);
  });
});

describe("v2 cleanup ownership", () => {
  it("removes only the paths this job created", async () => {
    const world = sandbox();
    const services = world.services("vinv_cleanup");
    const kept = path.join(world.outDir, "keep.txt");
    fs.writeFileSync(kept, "unrelated");
    const owned = await services.files.copyToOutput("a", "owned.wav", world.grantId);

    const disposed = await services.workspace.dispose();

    expect(disposed.removed).toEqual([owned.path]);
    expect(fs.existsSync(owned.path)).toBe(false);
    expect(fs.readFileSync(kept, "utf8")).toBe("unrelated");
  });

  it("does not delete a replacement at a previously owned path", async () => {
    const world = sandbox();
    const services = world.services("vinv_replaced");
    const owned = await services.files.createOutputText(world.grantId, "owned.txt", "job output");
    replaceFile(owned.path, "third-party replacement");

    const disposed = await services.workspace.dispose();

    expect(disposed.removed).toEqual([]);
    expect(fs.readFileSync(owned.path, "utf8")).toBe("third-party replacement");
  });

  it("keeps a replacement while removing the rest when cancellation races a completed write", async () => {
    const world = sandbox();
    const manager = new V2JobManager();
    const reached = deferred<{ owned: string; replaced: string }>();
    const release = deferred<void>();
    const submitted = manager.submit({
      extensionId: "fixture-output",
      commandId: "fixture-output.run",
      invocationId: "vinv_cancel",
      run: async (job) => {
        const services = world.services("vinv_cancel", job.reporter);
        const owned = await services.files.createOutputText(world.grantId, "owned.txt", "job output");
        const replaced = await services.files.createOutputText(
          world.grantId,
          "replaced.txt",
          "job output",
        );
        reached.resolve({ owned: owned.path, replaced: replaced.path });
        await release.promise;
        await services.workspace.dispose();
        throw new V2JobCancelledError(job.jobId);
      },
    });

    const paths = await reached.promise;
    // The write completed, then a third party replaced one of the two
    // outputs before the cancellation cleanup ran.
    replaceFile(paths.replaced, "third-party replacement");
    manager.requestCancel(submitted.record.jobId);
    release.resolve();

    const settled = await manager.waitFor(submitted.record.jobId);
    expect(settled.state).toBe("cancelled");
    expect(fs.existsSync(paths.owned)).toBe(false);
    expect(fs.readFileSync(paths.replaced, "utf8")).toBe("third-party replacement");
  });
});
