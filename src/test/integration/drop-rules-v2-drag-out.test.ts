// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { callRoute, createScratchLibrary, type ScratchLibrary } from "@/test/fixtures";

// The process-wide v2 host captures the capability set when it is first built
// (during module import), so desktop mode must be in the environment before
// the imports below evaluate.
vi.hoisted(() => {
  process.env.FOLEYARD_DESKTOP = "1";
  process.env.FOLEYARD_GRANT_SECRET = "drag-out-secret";
});

// Area: #284. The server side of governed drag-out, exercised through the real
// routes and the real host over a temp Library and staging grant. The desktop
// bridge (desktop-drag-out.test.ts) drives this same sequence, so these two
// files together cover the whole path: availability -> staging grant ->
// prepare-drag -> a real staged copy -> the readable containment check.

const DROP_RULES = "drop-rules-v2";
const PREPARE_DRAG = "drop-rules-v2.prepare-drag";
const DECLARED_PERMISSIONS = [
  "library:read",
  "files:read",
  "files:copy",
  "files:write",
  "drop:read",
  "drop:modify",
  "settings:read",
] as const;

const stateRows = new Map<string, unknown>();
const libraryRoots: string[] = [];
const filesById = new Map<string, Record<string, unknown>>();

vi.mock("@/lib/extensions-v2/settings-state", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/extensions-v2/settings-state")>();
  return {
    ...original,
    readV2SettingsRow: (key: string) => stateRows.get(key),
    writeV2SettingsRow: (key: string, value: unknown) => {
      stateRows.set(key, value);
    },
    deleteV2SettingsRow: (key: string) => {
      stateRows.delete(key);
    },
    listV2SettingsKeys: (prefix: string) =>
      [...stateRows.keys()].filter((key) => key.startsWith(prefix)),
  };
});

vi.mock("@/lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...original,
    getFiles: () => [],
    getFileById: (id: string) => filesById.get(id),
    getOwnedFileById: (id: string) => {
      const file = filesById.get(id);
      return file && file.removedAt === null ? file : undefined;
    },
    getFilesByIds: (ids: string[]) => ids.flatMap((id) => (filesById.get(id) ? [filesById.get(id)] : [])),
    getOwnedFilesByIds: (ids: string[]) =>
      ids.flatMap((id) => {
        const file = filesById.get(id);
        return file && file.removedAt === null ? [file] : [];
      }),
    getLibraryRoots: () => libraryRoots,
    collectionExists: () => true,
  };
});

import { POST as executePOST } from "@/app/api/extensions-v2/execute/route";
import { POST as grantsPOST } from "@/app/api/extensions-v2/grants/route";
import { POST as desktopGrantsPOST } from "@/app/api/desktop/grants/route";
import { POST as desktopPathPOST } from "@/app/api/desktop/path/route";
import { GET as availabilityGET } from "@/app/api/extensions-v2/availability/route";
import { setV2ExtensionEnabled } from "@/lib/extensions-v2/host";
import { revokeV2Approval, setV2Approval } from "@/lib/extensions-v2/policy";

let scratch: ScratchLibrary;
let sourceFile: string;

function indexedRecord(id: string, filePath: string, filename: string) {
  return {
    id,
    path: filePath,
    filename,
    libraryRoot: path.dirname(filePath),
    directory: null,
    format: "wav",
    duration: 1,
    sampleRate: 44100,
    bitDepth: 16,
    channels: 2,
    fileSize: 5,
    isFavorite: false,
    removedAt: null,
    lastScannedAt: "2026-10-15T00:00:00.000Z",
    mtimeMs: 1,
  };
}

async function availability(fileId: string) {
  const url = `http://localhost/api/extensions-v2/availability?extensionId=${DROP_RULES}&commandId=${PREPARE_DRAG}&fileIds=${fileId}&dropFileCount=1`;
  const response = await availabilityGET(new NextRequest(url));
  return (await response.json()) as {
    available: boolean;
    code?: string;
    reason?: string;
  };
}

async function executePrepareDrag(input: Record<string, unknown>) {
  return callRoute<{
    ok?: boolean;
    outcome?: { kind: string; value: { dragPath: string; staged: boolean; outputName: string } };
    error?: { code: string; message: string };
  }>(executePOST, {
    url: "http://localhost/api/extensions-v2/execute",
    body: {
      extensionId: DROP_RULES,
      commandId: PREPARE_DRAG,
      input,
      selection: { fileIds: ["a"], dropFileCount: 1 },
    },
  });
}

async function mintStagingGrant(directory: string): Promise<string> {
  const picked = await callRoute<{ proof: string }>(desktopGrantsPOST, {
    url: "http://localhost/api/desktop/grants",
    headers: { "x-foleyard-grant-secret": "drag-out-secret" },
    body: { path: directory, extensionId: DROP_RULES, grantKind: "destination" },
  });
  expect(picked.status).toBe(200);
  const issued = await callRoute<{ grantId: string }>(grantsPOST, {
    url: "http://localhost/api/extensions-v2/grants",
    body: { extensionId: DROP_RULES, proof: picked.body.proof },
  });
  expect(issued.status).toBe(200);
  return issued.body.grantId;
}

beforeEach(() => {
  stateRows.clear();
  filesById.clear();
  libraryRoots.length = 0;
  scratch = createScratchLibrary("foleyard-dragout-e2e-");
  sourceFile = scratch.writeFile("hit.wav", "audio");
  libraryRoots.push(scratch.root);
  filesById.set("a", indexedRecord("a", sourceFile, "hit.wav"));
  vi.stubEnv("FOLEYARD_DESKTOP", "1");
  vi.stubEnv("FOLEYARD_GRANT_SECRET", "drag-out-secret");
  setV2ExtensionEnabled(DROP_RULES, true);
  setV2Approval(DROP_RULES, [...DECLARED_PERMISSIONS]);
});

afterEach(() => {
  revokeV2Approval(DROP_RULES);
  setV2ExtensionEnabled(DROP_RULES, false);
  vi.unstubAllEnvs();
  stateRows.clear();
  filesById.clear();
  scratch.dispose();
});

describe("Drop Rules drag-out through the real routes", () => {
  it("stages a renamed copy in the grant and returns a contained, real drag path", async () => {
    const staging = scratch.directory("staging");
    const grantId = await mintStagingGrant(staging);

    const prepared = await executePrepareDrag({ fileId: "a", stagingGrantId: grantId });
    expect(prepared.status, JSON.stringify(prepared.body)).toBe(200);
    const value = prepared.body.outcome!.value;
    expect(value.staged).toBe(true);
    expect(value.outputName).toBe("001-hit.wav");
    // Same canonicalization call the implementation uses: sync and async
    // realpath disagree on short-name tmpdirs on some Windows runners.
    expect(await fs.promises.realpath(path.dirname(value.dragPath))).toBe(
      await fs.promises.realpath(staging),
    );

    // The extension's copy really landed on disk, byte for byte.
    expect(fs.readFileSync(value.dragPath, "utf8")).toBe("audio");
    expect(await fs.promises.realpath(value.dragPath)).toBe(
      await fs.promises.realpath(path.join(staging, "001-hit.wav")),
    );

    // Every returned drag path passes the same readable containment check.
    const verified = await callRoute<{ path: string }>(desktopPathPOST, {
      url: "http://localhost/api/desktop/path",
      body: { path: value.dragPath },
    });
    expect(verified.status).toBe(200);
    expect(verified.body.path).toBe(fs.realpathSync(value.dragPath));

    // A path outside the Library and outside every grant is refused.
    const outside = await callRoute(desktopPathPOST, {
      url: "http://localhost/api/desktop/path",
      body: { path: path.join(os.tmpdir(), "foleyard-not-granted", "evil.wav") },
    });
    expect(outside.status).toBe(404);
  });

  it("hands back the Library path unstaged when policy needs no copy or rename", async () => {
    const staging = scratch.directory("staging");
    const grantId = await mintStagingGrant(staging);

    const prepared = await executePrepareDrag({
      fileId: "a",
      stagingGrantId: grantId,
      copyOnDrop: false,
      renameOnDrop: false,
    });
    expect(prepared.status).toBe(200);
    const value = prepared.body.outcome!.value;
    expect(value.staged).toBe(false);
    // Same canonicalization call the implementation uses: sync and async
    // realpath disagree on short-name tmpdirs on some Windows runners.
    expect(await fs.promises.realpath(value.dragPath)).toBe(
      await fs.promises.realpath(sourceFile),
    );
    expect(fs.readdirSync(staging)).toEqual([]);
  });

  it("reports the disabled extension as a typed denial the bridge can act on", async () => {
    setV2ExtensionEnabled(DROP_RULES, false);
    revokeV2Approval(DROP_RULES);

    const state = await availability("a");
    expect(state.available).toBe(false);
    expect(state.code).toBe("disabled");

    const denied = await executePrepareDrag({ fileId: "a" });
    expect(denied.status).toBe(403);
    expect(denied.body.error?.code).toBe("extension-disabled");
  });

  it("reports the enabled, approved extension as available", async () => {
    const state = await availability("a");
    expect(state.available).toBe(true);
  });
});
