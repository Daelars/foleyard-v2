import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import {
  createMakePackV2Definition,
  MAKE_PACK_V2_ID,
  MAKE_PACK_V2_SOURCE_RECENT,
  MAKE_PACK_V2_SOURCE_SELECTION,
  MAKE_PACK_V2_SOURCE_SHELF,
  registerMakePackV2Handlers,
  type MakePackV2Result,
} from "@foleyard/make-pack-v2";
import {
  createV2OperationServices,
  ExtensionV2Host,
  ExtensionV2Registry,
  V2GrantStore,
  V2JobCancelledError,
  type IndexedAudioFile,
  type V2FileContentPorts,
  type V2HostServices,
  type V2LibraryReadPorts,
  type V2PathIo,
} from "@yard-core";
import { createV2ArchivePorts } from "@/lib/extensions-v2/archive";
import {
  getV2Registry,
  isV2ExtensionEnabled,
  setV2ExtensionEnabled,
} from "@/lib/extensions-v2/host";
import { getV2GrantedPermissions } from "@/lib/extensions-v2/policy";
import {
  createRecentSelectionSource,
  createShelfSelectionSource,
} from "@/lib/extensions-v2/sources";
import { POST as postGrant } from "@/app/api/extensions-v2/grants/route";
import { GET as getCatalog } from "@/app/api/extensions-v2/route";
import { PATCH as patchExtension } from "@/app/api/extensions-v2/extensions/[extensionId]/route";
import {
  DELETE as deleteApprovals,
  POST as postApprovals,
} from "@/app/api/extensions-v2/extensions/[extensionId]/approvals/route";
import { GET as getSettings } from "@/app/api/extensions-v2/settings/[extensionId]/route";

// Area: extension v2 R8 (#171). Real-filesystem evidence for Make Pack
// v2: temp Library + destination on real disk, the production ZIP
// codec, handlers through the real host preflight. ZIP integrity is
// verified with an independent reader below (EOCD/central-directory
// parse, stored-entry extraction, CRC32 check) — never the writer's
// own bookkeeping.

const FULL_PERMISSIONS = [
  "library:read",
  "files:read",
  "files:copy",
  "files:write",
  "settings:read",
  "settings:write",
  "desktop:reveal",
  "desktop:open",
];

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

const crcTable = Array.from({ length: 256 }, (_, tableIndex) => {
  let value = tableIndex;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Independent stored-ZIP reader: EOCD + central directory + CRC check. */
function readZipEntries(zipPath: string): Map<string, Buffer> {
  const data = fs.readFileSync(zipPath);
  const eocdAt = data.length - 22;
  if (eocdAt < 0 || data.readUInt32LE(eocdAt) !== 0x06054b50) {
    throw new Error("not a stored ZIP (EOCD missing)");
  }
  const count = data.readUInt16LE(eocdAt + 10);
  let cursor = data.readUInt32LE(eocdAt + 16);
  const out = new Map<string, Buffer>();
  for (let index = 0; index < count; index += 1) {
    if (data.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`central directory entry ${index} is corrupt`);
    }
    const crc = data.readUInt32LE(cursor + 16);
    const compressed = data.readUInt32LE(cursor + 20);
    const uncompressed = data.readUInt32LE(cursor + 24);
    const nameLength = data.readUInt16LE(cursor + 28);
    const extraLength = data.readUInt16LE(cursor + 30);
    const commentLength = data.readUInt16LE(cursor + 32);
    const localOffset = data.readUInt32LE(cursor + 42);
    const name = data.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    cursor += 46 + nameLength + extraLength + commentLength;
    if (data.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`local header for ${name} is corrupt`);
    }
    const localNameLength = data.readUInt16LE(localOffset + 26);
    const localExtraLength = data.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const bytes = Buffer.from(data.subarray(dataStart, dataStart + compressed));
    if (bytes.length !== uncompressed) {
      throw new Error(`length mismatch for ${name}`);
    }
    if (crc32(bytes) !== crc) {
      throw new Error(`CRC mismatch for ${name}`);
    }
    out.set(name, bytes);
  }
  return out;
}

type RealWorld = {
  root: string;
  libDir: string;
  outDir: string;
  host: ExtensionV2Host;
  grantId: string;
  shelf: string[];
  recent: string[];
  failAfter: number | null;
  progressCalls: number;
};

function realWorld(input: {
  files: Array<{ id: string; filename: string; contents: string; dir?: string }>;
  shelf?: string[];
  recent?: string[];
  extraOutFiles?: Array<{ name: string; contents: string }>;
}): RealWorld {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-mpv2-")));
  const libDir = path.join(root, "lib");
  const outDir = path.join(root, "out");
  fs.mkdirSync(libDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const file of input.files) {
    const dir = file.dir ? path.join(libDir, file.dir) : libDir;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file.filename), file.contents);
  }
  for (const extra of input.extraOutFiles ?? []) {
    fs.writeFileSync(path.join(outDir, extra.name), extra.contents);
  }
  const records = input.files.map((file) =>
    record(file.id, file.dir ? path.join(libDir, file.dir) : libDir, file.filename),
  );
  const byId = new Map(records.map((file) => [file.id, file]));
  const world: RealWorld = {
    root,
    libDir,
    outDir,
    host: undefined as unknown as ExtensionV2Host,
    grantId: "",
    shelf: input.shelf ?? [],
    recent: input.recent ?? [],
    failAfter: null,
    progressCalls: 0,
  };

  const nodeIo: V2PathIo = {
    realpath: (candidate) => fs.promises.realpath(candidate),
    lstat: async (candidate) => {
      try {
        const entry = await fs.promises.lstat(candidate);
        return { exists: true, isLink: entry.isSymbolicLink() };
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          return { exists: false, isLink: false };
        }
        throw error;
      }
    },
  };
  const filePorts: V2FileContentPorts = {
    readFileBytes: async (candidate) => new Uint8Array(await fs.promises.readFile(candidate)),
    copyFile: (source, dest) => fs.promises.copyFile(source, dest),
    writeFileBytes: (dest, bytes) => fs.promises.writeFile(dest, bytes),
    deleteFile: (candidate) => fs.promises.rm(candidate, { force: true }),
    exists: async (candidate) => {
      try {
        await fs.promises.lstat(candidate);
        return true;
      } catch {
        return false;
      }
    },
    libraryRoots: () => [libDir],
    pathIo: () => nodeIo,
  };
  const library: V2LibraryReadPorts = {
    getFileById: (id) => byId.get(id) ?? null,
    getFilesByIds: (ids) => ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    listPage: (cursor, limit) => {
      void cursor;
      void limit;
      return { files: records, nextCursor: null };
    },
  };
  const grants = new V2GrantStore();
  const grant = grants.issue(MAKE_PACK_V2_ID, outDir);
  world.grantId = grant.grantId;
  const settingsRows = new Map<string, unknown>();
  const registry = new ExtensionV2Registry();
  registry.register(createMakePackV2Definition());
  const services: V2HostServices = {
    registry,
    isEnabled: () => true,
    capabilities: {},
    grantedPermissions: () => [...FULL_PERMISSIONS],
    ports: library,
    authorizeGrant: (grantId, extensionId) => {
      const authorized = grants.authorize(grantId, extensionId);
      return authorized.ok ? { ok: true } : { ok: false, message: authorized.message };
    },
    createOperations: (binding) =>
      createV2OperationServices({
        ...binding,
        grants,
        library,
        files: filePorts,
        archive: createV2ArchivePorts(),
        settings: {
          readRaw: (key) => settingsRows.get(key),
          writeRaw: (key, value) => {
            settingsRows.set(key, value);
          },
        },
        extensionState: {
          readAll: () => ({}),
          writeAll: () => {},
        },
        selectionSources: [
          { name: "shelf", requiredPermission: "library:read", listIds: () => [...world.shelf] },
          { name: "recent", requiredPermission: "library:read", listIds: () => [...world.recent] },
        ],
        ...(binding.reporter
          ? {
              jobs: {
                reportProgress: (completed: number, total: number) => {
                  world.progressCalls += 1;
                  if (world.failAfter !== null && world.progressCalls > world.failAfter) {
                    throw new V2JobCancelledError("cancelled for the test");
                  }
                  binding.reporter!.reportProgress(completed, total);
                },
                throwIfCancelled: () => binding.reporter!.throwIfCancelled(),
              },
            }
          : {}),
      }),
  };
  const host = new ExtensionV2Host(services);
  registerMakePackV2Handlers(host);
  world.host = host;
  return world;
}

let worlds: RealWorld[] = [];
beforeEach(() => {
  worlds = [];
});
afterEach(() => {
  for (const world of worlds) {
    fs.rmSync(world.root, { recursive: true, force: true });
  }
  worlds = [];
});

function make(overrides: Parameters<typeof realWorld>[0]): RealWorld {
  const world = realWorld(overrides);
  worlds.push(world);
  return world;
}

async function exportViaJob(
  world: RealWorld,
  commandId: string,
  commandInput: Record<string, unknown>,
  selection: { fileIds: string[] },
): Promise<{ state: string; value: MakePackV2Result }> {
  const submitted = await world.host.submitJob({
    extensionId: MAKE_PACK_V2_ID,
    commandId,
    input: commandInput,
    selection,
  });
  expect(submitted.ok).toBe(true);
  if (!submitted.ok || submitted.outcome.kind !== "job") {
    throw new Error("expected a job outcome");
  }
  const settled = await world.host.jobs.waitFor(submitted.outcome.jobId);
  return { state: settled.state, value: settled.value as MakePackV2Result };
}

describe("make-pack-v2 real folder exports", () => {
  it("packs selection sources with exact bytes and a manifest", async () => {
    const world = make({
      files: [
        { id: "a", filename: "kick.wav", contents: "kick-bytes" },
        { id: "b", filename: "snare.wav", contents: "snare-bytes" },
      ],
    });
    const { state, value } = await exportViaJob(
      world,
      MAKE_PACK_V2_SOURCE_SELECTION,
      { grantId: world.grantId, packName: "Real Pack" },
      { fileIds: ["a", "b"] },
    );
    expect(state).toBe("succeeded");
    expect(value).toMatchObject({ copied: 2, outputPath: world.outDir, manifestIncluded: true });
    expect(fs.readFileSync(path.join(world.outDir, "kick.wav"), "utf8")).toBe("kick-bytes");
    expect(fs.readFileSync(path.join(world.outDir, "snare.wav"), "utf8")).toBe("snare-bytes");
    const manifest = JSON.parse(fs.readFileSync(path.join(world.outDir, "manifest.json"), "utf8")) as {
      name: string;
      source: string;
      files: Array<{ outputName: string; fileSize: number | null }>;
      skipped: string[];
      missing: string[];
    };
    expect(manifest.name).toBe("Real Pack");
    expect(manifest.source).toBe("selection");
    expect(manifest.files.map((file) => file.outputName)).toEqual(["kick.wav", "snare.wav"]);
    expect(manifest.skipped).toEqual([]);
  });

  it("packs shelf and recent sources without a manifest when disabled", async () => {
    const world = make({
      files: [
        { id: "s1", filename: "s1.wav", contents: "one" },
        { id: "s2", filename: "s2.wav", contents: "two" },
        { id: "r1", filename: "r1.wav", contents: "three" },
      ],
      shelf: ["s1", "s2"],
      recent: ["r1"],
    });
    const shelf = await exportViaJob(
      world,
      MAKE_PACK_V2_SOURCE_SHELF,
      { grantId: world.grantId, packName: "Shelf", includeManifest: false },
      { fileIds: [] },
    );
    expect(shelf.state).toBe("succeeded");
    expect(shelf.value.copied).toBe(2);
    expect(fs.existsSync(path.join(world.outDir, "manifest.json"))).toBe(false);
    const recent = await exportViaJob(
      world,
      MAKE_PACK_V2_SOURCE_RECENT,
      { grantId: world.grantId, packName: "Recent", includeManifest: false },
      { fileIds: [] },
    );
    expect(recent.value.copied).toBe(1);
    expect(fs.readFileSync(path.join(world.outDir, "r1.wav"), "utf8")).toBe("three");
  });

  it("dedupes colliding names on disk and preserves sidecars", async () => {
    // Case-only collisions cannot coexist on case-insensitive filesystems,
    // so the colliding sources live in sibling Library directories.
    const world = make({
      files: [
        { id: "a", filename: "Hit.wav", contents: "one", dir: "one" },
        { id: "b", filename: "hit.wav", contents: "two", dir: "two" },
      ],
      extraOutFiles: [
        { name: ".Pack-manifest.tmp.json", contents: '{"mine":true}' },
        { name: "keep.txt", contents: "unrelated" },
      ],
    });
    const { state, value } = await exportViaJob(
      world,
      MAKE_PACK_V2_SOURCE_SELECTION,
      { grantId: world.grantId, packName: "Pack" },
      { fileIds: ["a", "b"] },
    );
    expect(state).toBe("succeeded");
    expect(value.copied).toBe(2);
    expect(fs.readFileSync(path.join(world.outDir, "Hit.wav"), "utf8")).toBe("one");
    expect(fs.readFileSync(path.join(world.outDir, "hit 2.wav"), "utf8")).toBe("two");
    expect(fs.readFileSync(path.join(world.outDir, ".Pack-manifest.tmp.json"), "utf8")).toBe(
      '{"mine":true}',
    );
    expect(fs.readFileSync(path.join(world.outDir, "keep.txt"), "utf8")).toBe("unrelated");
  });

  it("reports a deleted source as skipped and keeps the rest", async () => {
    const world = make({
      files: [
        { id: "a", filename: "a.wav", contents: "aaa" },
        { id: "b", filename: "b.wav", contents: "bbb" },
      ],
    });
    fs.rmSync(path.join(world.libDir, "b.wav"));
    const { value } = await exportViaJob(
      world,
      MAKE_PACK_V2_SOURCE_SELECTION,
      { grantId: world.grantId, packName: "Pack" },
      { fileIds: ["a", "b"] },
    );
    expect(value.copied).toBe(1);
    expect(value.skipped).toEqual(["b.wav"]);
    expect(fs.existsSync(path.join(world.outDir, "a.wav"))).toBe(true);
    expect(fs.existsSync(path.join(world.outDir, "b.wav"))).toBe(false);
  });

  it("fails existing destination files instead of overwriting them", async () => {
    const world = make({
      files: [{ id: "a", filename: "a.wav", contents: "NEW" }],
      extraOutFiles: [
        { name: "a.wav", contents: "ORIGINAL AUDIO" },
        { name: "keep.txt", contents: "unrelated" },
      ],
    });
    const { value } = await exportViaJob(
      world,
      MAKE_PACK_V2_SOURCE_SELECTION,
      { grantId: world.grantId, packName: "Pack" },
      { fileIds: ["a"] },
    );
    expect(value.copied).toBe(0);
    expect(value.failedFiles).toEqual(["a.wav"]);
    expect(value.failedReasons[0]).toMatch(/already exists/);
    expect(fs.readFileSync(path.join(world.outDir, "a.wav"), "utf8")).toBe("ORIGINAL AUDIO");
    expect(fs.readFileSync(path.join(world.outDir, "keep.txt"), "utf8")).toBe("unrelated");
  });

  it("removes interrupted output while unrelated files survive", async () => {
    const world = make({
      files: [
        { id: "a", filename: "a.wav", contents: "aaa" },
        { id: "b", filename: "b.wav", contents: "bbb" },
      ],
      extraOutFiles: [{ name: "keep.txt", contents: "unrelated" }],
    });
    world.failAfter = 0;
    const submitted = await world.host.submitJob({
      extensionId: MAKE_PACK_V2_ID,
      commandId: MAKE_PACK_V2_SOURCE_SELECTION,
      input: { grantId: world.grantId, packName: "Interrupted" },
      selection: { fileIds: ["a", "b"] },
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok || submitted.outcome.kind !== "job") {
      throw new Error("expected a job outcome");
    }
    const settled = await world.host.jobs.waitFor(submitted.outcome.jobId);
    expect(settled.state).toBe("cancelled");
    expect(fs.existsSync(path.join(world.outDir, "a.wav"))).toBe(false);
    expect(fs.existsSync(path.join(world.outDir, "b.wav"))).toBe(false);
    expect(fs.existsSync(path.join(world.outDir, "manifest.json"))).toBe(false);
    expect(fs.readFileSync(path.join(world.outDir, "keep.txt"), "utf8")).toBe("unrelated");
  });
});

describe("make-pack-v2 real ZIP exports with independent verification", () => {
  it("archives all three sources with verified bytes, names, and manifest", async () => {
    for (const source of [MAKE_PACK_V2_SOURCE_SELECTION, MAKE_PACK_V2_SOURCE_SHELF, MAKE_PACK_V2_SOURCE_RECENT] as const) {
      const world = make({
        files: [
          { id: "a", filename: "kick.wav", contents: "kick-bytes" },
          { id: "b", filename: "snare.wav", contents: "snare-bytes" },
        ],
        shelf: ["a", "b"],
        recent: ["a", "b"],
      });
      const { state, value } = await exportViaJob(
        world,
        source,
        { grantId: world.grantId, packName: "Zip", outputFormat: "zip" },
        { fileIds: source === MAKE_PACK_V2_SOURCE_SELECTION ? ["a", "b"] : [] },
      );
      expect(state).toBe("succeeded");
      expect(value.copied).toBe(2);
      expect(value.outputPath).toBe(path.join(world.outDir, "Zip.zip"));
      const entries = readZipEntries(value.outputPath);
      expect([...entries.keys()].sort()).toEqual(["kick.wav", "manifest.json", "snare.wav"]);
      expect(entries.get("kick.wav")?.toString("utf8")).toBe("kick-bytes");
      expect(entries.get("snare.wav")?.toString("utf8")).toBe("snare-bytes");
      const manifest = JSON.parse(entries.get("manifest.json")!.toString("utf8")) as {
        name: string;
        files: Array<{ outputName: string }>;
        missing: string[];
      };
      expect(manifest.name).toBe("Zip");
      expect(manifest.files.map((file) => file.outputName).sort()).toEqual(["kick.wav", "snare.wav"]);
      expect(manifest.missing).toEqual([]);
    }
  });

  it("fails a ZIP with a deleted source and leaves no partial archive", async () => {
    const world = make({
      files: [
        { id: "a", filename: "a.wav", contents: "aaa" },
        { id: "b", filename: "b.wav", contents: "bbb" },
      ],
    });
    fs.rmSync(path.join(world.libDir, "b.wav"));
    const { state, value } = await exportViaJob(
      world,
      MAKE_PACK_V2_SOURCE_SELECTION,
      { grantId: world.grantId, packName: "Zip", outputFormat: "zip" },
      { fileIds: ["a", "b"] },
    );
    expect(state).toBe("succeeded");
    expect(value.copied).toBe(0);
    expect(value.failedReasons.join(" ")).toMatch(/b\.wav/);
    expect(fs.existsSync(path.join(world.outDir, "Zip.zip"))).toBe(false);
  });

  it("rejects a second same-name ZIP instead of overwriting it", async () => {
    const world = make({
      files: [{ id: "a", filename: "a.wav", contents: "aaa" }],
    });
    const first = await exportViaJob(
      world,
      MAKE_PACK_V2_SOURCE_SELECTION,
      { grantId: world.grantId, packName: "Zip", outputFormat: "zip" },
      { fileIds: ["a"] },
    );
    expect(first.value.copied).toBe(1);
    const before = fs.readFileSync(path.join(world.outDir, "Zip.zip"));
    const second = await exportViaJob(
      world,
      MAKE_PACK_V2_SOURCE_SELECTION,
      { grantId: world.grantId, packName: "Zip", outputFormat: "zip" },
      { fileIds: ["a"] },
    );
    expect(second.value.copied).toBe(0);
    expect(second.value.failedReasons.join(" ")).toMatch(/already exists/);
    expect(fs.readFileSync(path.join(world.outDir, "Zip.zip")).equals(before)).toBe(true);
  });

  it("rejects oversized packs and overlong entry names before writing", async () => {
    // The 500-entry archive bound is reachable through named sources
    // (the transport caps raw selection lists at the same bound).
    const many = Array.from({ length: 501 }, (_, index) => ({
      id: `f-${index}`,
      filename: `f-${index}.wav`,
      contents: "x",
    }));
    const world = make({
      files: [{ id: "a", filename: "a.wav", contents: "aaa" }, ...many],
      shelf: many.map((file) => file.id),
    });
    const submitted = await world.host.submitJob({
      extensionId: MAKE_PACK_V2_ID,
      commandId: MAKE_PACK_V2_SOURCE_SHELF,
      input: { grantId: world.grantId, packName: "Zip", outputFormat: "zip" },
      selection: { fileIds: [] },
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok || submitted.outcome.kind !== "job") {
      throw new Error("expected a job outcome");
    }
    const settled = await world.host.jobs.waitFor(submitted.outcome.jobId);
    expect(settled.state).toBe("failed");
    expect(settled.error?.code).toBe("input-invalid");
    expect(fs.existsSync(path.join(world.outDir, "Zip.zip"))).toBe(false);

    const ports = createV2ArchivePorts();
    await expect(
      ports.createZipArchive(
        [{ name: `${"n".repeat(70000)}.wav`, sourcePath: path.join(world.libDir, "a.wav") }],
        path.join(world.outDir, "long.zip"),
      ),
    ).rejects.toThrowError(/too long/);
    expect(fs.existsSync(path.join(world.outDir, "long.zip"))).toBe(false);
  });
});

describe("make-pack-v2 application sources", () => {
  it("reads shelf and recent IDs without executing v1 commands", () => {
    expect(createShelfSelectionSource(() => ["a", "b"]).listIds()).toEqual(["a", "b"]);
    expect(createRecentSelectionSource(() => ["x", 42, "", null] as unknown as string[]).listIds()).toEqual(["x"]);
    expect(createShelfSelectionSource(() => []).listIds()).toEqual([]);
    expect(createShelfSelectionSource().name).toBe("shelf");
    expect(createRecentSelectionSource().name).toBe("recent");
  });

  it("reports store failures instead of silently returning empty", () => {
    expect(() =>
      createShelfSelectionSource(() => {
        throw new Error("db locked");
      }).listIds(),
    ).toThrowError(/Sound Shelf.*unavailable.*db locked/);
    expect(() =>
      createRecentSelectionSource(() => {
        throw new Error("db locked");
      }).listIds(),
    ).toThrowError(/recent sounds.*unavailable.*db locked/);
  });
});

describe("make-pack-v2 production registration and routes", () => {
  it("registers as a disabled-by-default bundled example with its own settings", async () => {
    const definition = getV2Registry().get(MAKE_PACK_V2_ID);
    expect(definition?.name).toBe("Make Pack v2");
    const wasEnabled = isV2ExtensionEnabled(MAKE_PACK_V2_ID);
    try {
      // Registration never enables: the extension stays opt-in.
      setV2ExtensionEnabled(MAKE_PACK_V2_ID, false);
      expect(isV2ExtensionEnabled(MAKE_PACK_V2_ID)).toBe(false);

      const catalog = (await (await getCatalog()).json()) as {
        catalog: { entries: Array<{ id: string; name: string }> };
      };
      expect(catalog.catalog.entries.some((entry) => entry.id === MAKE_PACK_V2_ID)).toBe(true);

      const settings = (await (
        await getSettings(new NextRequest("http://localhost/x"), {
          params: Promise.resolve({ extensionId: MAKE_PACK_V2_ID }),
        })
      ).json()) as {
        declaredPermissions: string[];
        effectivePermissions: string[];
        settings: Array<{ declaration: { id: string }; value: unknown }>;
      };
      expect(settings.declaredPermissions).toContain("files:copy");
      expect(
        settings.settings.find((row) => row.declaration.id === "make-pack-v2.default-format")?.value,
      ).toBe("folder");
    } finally {
      setV2ExtensionEnabled(MAKE_PACK_V2_ID, wasEnabled);
    }
  });

  it("toggles explicit enable/disable through the generic route", async () => {
    const wasEnabled = isV2ExtensionEnabled(MAKE_PACK_V2_ID);
    try {
      const enable = await patchExtension(
        new NextRequest(`http://localhost/api/extensions-v2/extensions/${MAKE_PACK_V2_ID}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: true }),
        }),
        { params: Promise.resolve({ extensionId: MAKE_PACK_V2_ID }) },
      );
      expect(enable.status).toBe(200);
      expect(isV2ExtensionEnabled(MAKE_PACK_V2_ID)).toBe(true);
      const disable = await patchExtension(
        new NextRequest(`http://localhost/api/extensions-v2/extensions/${MAKE_PACK_V2_ID}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: false }),
        }),
        { params: Promise.resolve({ extensionId: MAKE_PACK_V2_ID }) },
      );
      expect(disable.status).toBe(200);
      expect(isV2ExtensionEnabled(MAKE_PACK_V2_ID)).toBe(false);
    } finally {
      setV2ExtensionEnabled(MAKE_PACK_V2_ID, wasEnabled);
    }
  });

  it("approves only declared permissions and revokes back to deny-by-default", async () => {
    const params = { params: Promise.resolve({ extensionId: MAKE_PACK_V2_ID }) };
    try {
      const foreign = await postApprovals(
        new NextRequest("http://localhost/x", {
          method: "POST",
          body: JSON.stringify({ permissions: ["library:write"] }),
        }),
        params,
      );
      expect(foreign.status).toBe(400);

      const approve = await postApprovals(
        new NextRequest("http://localhost/x", {
          method: "POST",
          body: JSON.stringify({
            permissions: ["library:read", "files:read", "files:copy", "files:write"],
          }),
        }),
        params,
      );
      expect(approve.status).toBe(200);
      expect(getV2GrantedPermissions(MAKE_PACK_V2_ID)).toEqual(
        expect.arrayContaining(["files:copy"]),
      );

      const read = (await (
        await getSettings(new NextRequest("http://localhost/x"), {
          params: Promise.resolve({ extensionId: MAKE_PACK_V2_ID }),
        })
      ).json()) as { effectivePermissions: string[] };
      expect(read.effectivePermissions).toContain("files:copy");
    } finally {
      await deleteApprovals(
        new NextRequest("http://localhost/x", { method: "DELETE" }),
        params,
      );
    }
    expect(getV2GrantedPermissions(MAKE_PACK_V2_ID)).toEqual([]);
  });

  it("issues destination grants for picked directories", async () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-mpv2-grant-")));
    try {
      const response = await postGrant(
        new NextRequest("http://localhost/api/extensions-v2/grants", {
          method: "POST",
          body: JSON.stringify({ extensionId: MAKE_PACK_V2_ID, directoryPath: dir }),
        }),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: boolean; grantId: string; path: string };
      expect(body.ok).toBe(true);
      expect(body.grantId.length).toBeGreaterThan(0);
      expect(body.path).toBe(dir);

      const unknown = await postGrant(
        new NextRequest("http://localhost/api/extensions-v2/grants", {
          method: "POST",
          body: JSON.stringify({ extensionId: "nope", directoryPath: dir }),
        }),
      );
      expect(unknown.status).toBe(404);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps v2 glue free of v1 extension modules and the v1 ZIP service", () => {
    const { readFileSync } = fs;
    const files = [
      "../../lib/extensions-v2/archive.ts",
      "../../lib/extensions-v2/sources.ts",
      "../../lib/extensions-v2/make-pack-v2.ts",
      "../../app/api/extensions-v2/grants/route.ts",
      "../../app/api/extensions-v2/extensions/[extensionId]/approvals/route.ts",
    ];
    for (const relative of files) {
      const text = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
      // Forbidden: the v1 extension engine (registry, commands, UI
      // intents, v1 transport/client) and the v1 ZIP/service modules.
      // Allowed: persisted-record storage contracts
      // (`sound-shelf-store`, `make-pack-recent-store`), which the
      // named source adapters read directly per the R8 contract.
      expect(text, relative).not.toMatch(/@foleyard\/make-pack"/);
      expect(text, relative).not.toMatch(/extensions\/registry/);
      expect(text, relative).not.toMatch(/extensions\/ui-intent/);
      expect(text, relative).not.toMatch(/extension-client/);
      expect(text, relative).not.toMatch(/api\/extensions\//);
      expect(text, relative).not.toMatch(/extension-host/);
      expect(text, relative).not.toMatch(/writeStoredZip/);
      expect(text, relative).not.toMatch(/MakePackService/);
      expect(text, relative).not.toMatch(/registerCommands/);
      expect(text, relative).not.toMatch(/YardExtensionContext/);
      expect(text, relative).not.toMatch(/createYardUiIntent/);
    }
  });
});
