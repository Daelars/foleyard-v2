// @vitest-environment node
import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  DROP_RULES_V2_APPLY,
  DROP_RULES_V2_ID,
  DROP_RULES_V2_PREVIEW,
} from "@foleyard/drop-rules-v2";
import { createScratchLibrary, type ScratchLibrary } from "@/test/fixtures";

// Area: #283. An incoming OS drop must run the REAL Drop Rules workflow end
// to end: the drop context (Library IDs + destination grant) is supplied,
// `apply` prepares a review plan whose conflicts and missing sources are
// visible, and applying that reviewed plan copies the planned names into the
// destination grant, writes the used-sounds report, and reports partial
// results. The routes, the process-wide host, the shared runtime, the shipped
// file ports and the real destination-grant flow all run; only the Library
// index reads are substituted (the same substitution the tool's own suite
// makes).

const settingsRows = new Map<string, unknown>();
const libraryRoots: string[] = [];

vi.mock("@/lib/extensions-v2/settings-state", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/extensions-v2/settings-state")>();
  return {
    ...original,
    readV2SettingsRow: (key: string) => settingsRows.get(key),
    writeV2SettingsRow: (key: string, value: unknown) => {
      settingsRows.set(key, value);
    },
    deleteV2SettingsRow: (key: string) => {
      settingsRows.delete(key);
    },
    listV2SettingsKeys: (prefix: string) =>
      [...settingsRows.keys()].filter((key) => key.startsWith(prefix)),
  };
});

type FileRow = {
  id: string;
  path: string;
  filename: string;
  libraryRoot: string;
  directory: string | null;
  format: string | null;
  duration: number;
  sampleRate: number;
  bitDepth: number;
  channels: number;
  fileSize: number;
  isFavorite: boolean;
  removedAt: string | null;
  lastScannedAt: string;
  mtimeMs: number;
};

let records: FileRow[] = [];
let byId = new Map<string, FileRow>();

vi.mock("@/lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...original,
    getOwnedFileById: (id: string) => byId.get(id) ?? null,
    getOwnedFilesByIds: (ids: string[]) =>
      ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
    getFileById: (id: string) => byId.get(id) ?? null,
    getFilesByIds: (ids: string[]) =>
      ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
    getFiles: () => records,
    getLibraryRoots: () => libraryRoots,
    collectionExists: () => true,
  };
});

import { callRoute } from "@/test/fixtures";
import { POST as executePOST } from "@/app/api/extensions-v2/execute/route";
import { GET as planGET } from "@/app/api/extensions-v2/plans/[planId]/route";
import { POST as planApplyPOST } from "@/app/api/extensions-v2/plans/[planId]/apply/route";
import { POST as grantsPOST } from "@/app/api/extensions-v2/grants/route";
import { POST as desktopGrantsPOST } from "@/app/api/desktop/grants/route";
import {
  getV2Registry,
  setV2ExtensionEnabled,
} from "@/lib/extensions-v2/host";
import { revokeV2Approval, setV2Approval } from "@/lib/extensions-v2/policy";

const DROP_PERMISSIONS = [
  "library:read",
  "files:read",
  "files:copy",
  "files:write",
  "drop:read",
  "drop:modify",
  "settings:read",
] as const;

const SECRET = "drop-rules-e2e-secret";

type ExecuteOutcome =
  | {
      ok: true;
      outcome:
        | { kind: "immediate"; value: Record<string, unknown> }
        | { kind: "review-required"; planId: string; summary: string; expiresAt: string };
    }
  | { ok: false; error: { code: string; message: string } };

type ReviewBody = {
  ok: boolean;
  review: {
    planId: string;
    summary: string;
    tables: Array<{ id: string; title?: string; columns: string[]; rows: string[][] }>;
    notices: Array<{ tone: string; message: string }>;
    details?: { conflicts?: string[]; missing?: string[]; names?: string[] };
    targets: { fileIds: string[] };
    options: unknown;
    reversibility: string;
  };
};

let scratch: ScratchLibrary;

function record(id: string, dir: string, filename: string): FileRow {
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
    lastScannedAt: "2026-10-15T00:00:00.000Z",
    mtimeMs: 1,
  };
}

function read(relative: string): string {
  return fs.readFileSync(path.join(scratch.root, relative), "utf8");
}

async function issueDestinationGrant(extensionId: string): Promise<string> {
  const picked = await callRoute<{ ok: boolean; proof: string; path: string }>(
    desktopGrantsPOST,
    {
      url: "http://localhost/api/desktop/grants",
      headers: { "x-foleyard-grant-secret": SECRET },
      body: { path: scratch.directory("out"), extensionId, grantKind: "destination" },
    },
  );
  expect(picked.status, JSON.stringify(picked.body)).toBe(200);
  const issued = await callRoute<{ ok: boolean; grantId: string }>(grantsPOST, {
    url: "http://localhost/api/extensions-v2/grants",
    body: { extensionId, proof: picked.body.proof },
  });
  expect(issued.status, JSON.stringify(issued.body)).toBe(200);
  return issued.body.grantId;
}

async function runDropCommand(
  commandId: string,
  fileIds: string[],
  input: Record<string, unknown>,
): Promise<ExecuteOutcome> {
  const response = await callRoute<ExecuteOutcome>(executePOST, {
    url: "http://localhost/api/extensions-v2/execute",
    body: {
      extensionId: DROP_RULES_V2_ID,
      commandId,
      selection: { fileIds, dropFileCount: fileIds.length },
      input,
    },
  });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body;
}

async function reviewPlan(planId: string): Promise<ReviewBody["review"]> {
  const response = await planGET(
    new NextRequest(`http://localhost/api/extensions-v2/plans/${planId}`),
    { params: Promise.resolve({ planId }) },
  );
  const body = (await response.json()) as ReviewBody;
  expect(response.status, JSON.stringify(body)).toBe(200);
  expect(body.ok).toBe(true);
  return body.review;
}

async function applyReviewedPlan(
  planId: string,
  review: ReviewBody["review"],
): Promise<Record<string, unknown>> {
  const response = await planApplyPOST(
    new NextRequest(`http://localhost/api/extensions-v2/plans/${planId}/apply`, {
      method: "POST",
      body: JSON.stringify({ targets: review.targets, options: review.options }),
    }),
    { params: Promise.resolve({ planId }) },
  );
  const body = (await response.json()) as ExecuteOutcome;
  expect(response.status, JSON.stringify(body)).toBe(200);
  if (!body.ok || body.outcome.kind !== "immediate") {
    throw new Error(`apply did not settle immediate: ${JSON.stringify(body)}`);
  }
  return body.outcome.value;
}

beforeEach(async () => {
  settingsRows.clear();
  libraryRoots.length = 0;
  scratch = createScratchLibrary("foleyard-drop-rules-");
  const libDir = scratch.directory("lib");
  libraryRoots.push(libDir);
  scratch.writeFile("lib/kick.wav", "kick-bytes");
  scratch.writeFile("lib/snare.wav", "snare-bytes");
  scratch.writeFile("lib/hat.wav", "hat-bytes");
  records = [
    record("a", libDir, "kick.wav"),
    record("b", libDir, "snare.wav"),
    record("c", libDir, "hat.wav"),
  ];
  byId = new Map(records.map((row) => [row.id, row]));
  vi.stubEnv("FOLEYARD_GRANT_SECRET", SECRET);

  // The bundled ports register on import; enable and approve Drop Rules
  // exactly as the settings surface would.
  expect(getV2Registry().get(DROP_RULES_V2_ID)).toBeDefined();
  await setV2ExtensionEnabled(DROP_RULES_V2_ID, true);
  setV2Approval(DROP_RULES_V2_ID, [...DROP_PERMISSIONS]);
});

afterEach(async () => {
  revokeV2Approval(DROP_RULES_V2_ID);
  await setV2ExtensionEnabled(DROP_RULES_V2_ID, false);
  vi.unstubAllEnvs();
  settingsRows.clear();
  scratch.dispose();
});

describe("incoming Drop Rules execution end to end", () => {
  it("previews the planned rename policy for the dropped Library ids", async () => {
    const grantId = await issueDestinationGrant(DROP_RULES_V2_ID);
    const outcome = await runDropCommand(DROP_RULES_V2_PREVIEW, ["a", "b"], {
      fileIds: ["a", "b"],
      destGrantId: grantId,
    });
    if (!outcome.ok || outcome.outcome.kind !== "immediate") {
      throw new Error(`expected immediate preview: ${JSON.stringify(outcome)}`);
    }
    expect(outcome.outcome.value).toMatchObject({
      fileIds: ["a", "b"],
      outputNames: ["001-kick.wav", "002-snare.wav"],
      missing: [],
      warnings: [],
    });
  });

  it("reviews conflicts and missing sources, then applies the planned names", async () => {
    const grantId = await issueDestinationGrant(DROP_RULES_V2_ID);
    // An existing destination file the plan must not overwrite.
    scratch.writeFile("out/001-kick.wav", "ORIGINAL");
    scratch.writeFile("out/keep.txt", "unrelated");

    // Drop one live sound, one that left the index.
    const prepared = await runDropCommand(DROP_RULES_V2_APPLY, ["a", "b", "gone"], {
      fileIds: ["a", "b", "gone"],
      destGrantId: grantId,
    });
    if (!prepared.ok || prepared.outcome.kind !== "review-required") {
      throw new Error(`expected a review plan: ${JSON.stringify(prepared)}`);
    }

    const review = await reviewPlan(prepared.outcome.planId);
    // The review exposes the destination conflict and the missing source.
    expect(review.details?.conflicts).toEqual(["001-kick.wav"]);
    expect(review.details?.missing).toEqual(["gone"]);
    expect(review.details?.names).toEqual(["001-kick.wav", "002-snare.wav"]);
    expect(
      review.notices.some(
        (notice) =>
          notice.tone === "warning" && notice.message.includes("001-kick.wav"),
      ),
    ).toBe(true);
    expect(
      review.notices.some(
        (notice) => notice.tone === "warning" && notice.message.includes("gone"),
      ),
    ).toBe(true);
    const drops = review.tables.find((table) => table.id === "drops");
    expect(drops?.rows).toEqual([
      ["kick.wav", "001-kick.wav", "conflict"],
      ["snare.wav", "002-snare.wav", "ready"],
    ]);

    // Apply the reviewed plan with its original drop context preserved.
    const value = await applyReviewedPlan(prepared.outcome.planId, review);
    expect(value).toMatchObject({
      copied: 1,
      skipped: [],
      missing: ["gone"],
      failedFiles: ["kick.wav"],
      usedReportWritten: true,
    });
    expect(value.failedReasons).toHaveLength(1);
    expect((value.failedReasons as string[])[0]).toMatch(/already exists/i);

    // Only the planned, conflict-free name landed; the original survived.
    expect(read("out/001-kick.wav")).toBe("ORIGINAL");
    expect(read("out/002-snare.wav")).toBe("snare-bytes");
    expect(read("out/keep.txt")).toBe("unrelated");

    const report = JSON.parse(read("out/foleyard-used.json")) as {
      files: Array<{ fileId: string; outputPath: string }>;
    };
    expect(report.files.map((file) => file.fileId)).toEqual(["b"]);
    expect(path.basename(report.files[0].outputPath)).toBe("002-snare.wav");
  });

  it("honors an overridden rename pattern and mark-used policy through review and apply", async () => {
    const grantId = await issueDestinationGrant(DROP_RULES_V2_ID);

    const prepared = await runDropCommand(DROP_RULES_V2_APPLY, ["a"], {
      fileIds: ["a"],
      destGrantId: grantId,
      renamePattern: "{name}-{format}{ext}",
      markUsed: false,
    });
    if (!prepared.ok || prepared.outcome.kind !== "review-required") {
      throw new Error(`expected a review plan: ${JSON.stringify(prepared)}`);
    }
    const review = await reviewPlan(prepared.outcome.planId);
    // The review echoes the original drop context (options) byte-identically.
    expect(review.options).toMatchObject({
      fileIds: ["a"],
      destGrantId: grantId,
      renamePattern: "{name}-{format}{ext}",
      markUsed: false,
    });
    expect(review.details?.names).toEqual(["kick-wav.wav"]);

    const value = await applyReviewedPlan(prepared.outcome.planId, review);
    expect(value).toMatchObject({ copied: 1, usedReportWritten: false });
    expect(read("out/kick-wav.wav")).toBe("kick-bytes");
    expect(fs.existsSync(path.join(scratch.root, "out/foleyard-used.json"))).toBe(false);
  });
});
