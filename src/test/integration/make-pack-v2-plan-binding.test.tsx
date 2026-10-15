// @vitest-environment jsdom
import fs from "node:fs";

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { useMakePackV2 } from "@/components/extensions/make-pack-v2/use-make-pack-v2";
import { createScratchLibrary, type ScratchLibrary } from "@/test/fixtures";
import { POST as desktopGrantsPOST } from "@/app/api/desktop/grants/route";
import { POST as grantsPOST } from "@/app/api/extensions-v2/grants/route";

// Area: #280. The Make Pack dialog, the review plan, and the background
// job are one bound operation. This drives the hook as the dialog does:
// after a preview, editing any reviewed field (source, pack name,
// format, manifest choice, or destination) invalidates the review and
// returns to the form; the job is started from the reviewed plan route
// with the reviewed echo, and the terminal result is read from the
// bounded projection.

vi.mock("@/lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db")>();
  return { ...original, getLibraryRoots: () => [] };
});

const SECRET = "plan-binding-secret";

const REVIEW = {
  planId: "vplan_bound",
  extensionId: "make-pack-v2",
  commandId: "make-pack-v2.from-selection",
  summary: "Pack 1 sound as folder",
  tables: [],
  notices: [],
  targets: { fileIds: ["a"] },
  options: {
    packName: "Reviewed",
    outputFormat: "folder",
    includeManifest: true,
    grantId: "grant-bound",
  },
  destructive: false,
  reversibility: "irreversible-files",
  reversibilityNote: "Finished packs stay in the destination.",
  createdAt: "2026-09-06T00:00:00.000Z",
  expiresAt: "2026-09-06T00:15:00.000Z",
  reviewedAt: "2026-09-06T00:00:01.000Z",
};

let scratch: ScratchLibrary;
let fetchCalls: Array<{ url: string; method: string; body: unknown }>;

function routeRequest(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function desktopBridgeFor(path: string) {
  return {
    isDesktop: true,
    pickFolder: async (purpose: { extensionId: string; grantKind: "source" | "destination" }) => {
      const response = await desktopGrantsPOST(
        new NextRequest("http://localhost/api/desktop/grants", {
          method: "POST",
          headers: { "x-foleyard-grant-secret": SECRET },
          body: JSON.stringify({ path, ...purpose }),
        }),
      );
      return (await response.json()) as { ok: boolean; path: string; proof: string };
    },
  };
}

beforeEach(() => {
  scratch = createScratchLibrary("foleyard-plan-binding-");
  fetchCalls = [];
  vi.stubEnv("FOLEYARD_GRANT_SECRET", SECRET);
  (window as unknown as { desktopBridge: unknown }).desktopBridge = desktopBridgeFor(
    scratch.directory("out"),
  );

  vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    fetchCalls.push({ url, method, body });

    if (url === "/api/extensions-v2/grants") return grantsPOST(routeRequest(url, body));
    if (url === "/api/extensions-v2/execute") {
      return new Response(
        JSON.stringify({
          ok: true,
          outcome: { kind: "review-required", planId: REVIEW.planId, invocationId: "vinv_1" },
        }),
        { status: 200 },
      );
    }
    if (url === `/api/extensions-v2/plans/${REVIEW.planId}` && method === "GET") {
      return new Response(JSON.stringify({ ok: true, review: REVIEW }), { status: 200 });
    }
    if (url === `/api/extensions-v2/plans/${REVIEW.planId}/job` && method === "POST") {
      return new Response(
        JSON.stringify({ ok: true, outcome: { kind: "job", jobId: "vjob_1", state: "queued" } }),
        { status: 202 },
      );
    }
    if (url === "/api/extensions-v2/jobs/vjob_1") {
      return new Response(
        JSON.stringify({
          ok: true,
          job: {
            jobId: "vjob_1",
            state: "succeeded",
            progress: { completed: 2, total: 2, updatedAt: "2026-09-06T00:00:05.000Z" },
            partial: { succeeded: 1, failed: [], incomplete: false },
            outputs: [],
            result: {
              value: {
                packName: "Reviewed",
                outputFormat: "folder",
                outputPath: scratch.directory("out"),
                copied: 1,
                skipped: [],
                missing: [],
                failedFiles: [],
                failedReasons: [],
                manifestIncluded: true,
                revealCapability: "desktop:reveal",
              },
            },
          },
        }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  }) as typeof fetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete (window as unknown as { desktopBridge?: unknown }).desktopBridge;
  scratch.dispose();
});

async function previewWithDestination(result: { current: ReturnType<typeof useMakePackV2> }) {
  await act(async () => {
    await result.current.handlePickDest();
  });
  await act(async () => {
    await result.current.handlePreview();
  });
  expect(result.current.phase).toBe("preview");
  expect(result.current.preview?.planId).toBe(REVIEW.planId);
}

describe("Make Pack plan binding in the dialog", () => {
  it("invalidates the reviewed preview when any reviewed field changes", async () => {
    const { result } = renderHook(() =>
      useMakePackV2({ open: true, initialSource: "selection", initialFileIds: ["a"] }),
    );
    await previewWithDestination(result);

    await act(async () => {
      result.current.setPackName("Renamed");
    });
    expect(result.current.phase).toBe("form");
    expect(result.current.preview).toBeNull();
  });

  it("invalidates the reviewed preview when the destination changes", async () => {
    const { result } = renderHook(() =>
      useMakePackV2({ open: true, initialSource: "selection", initialFileIds: ["a"] }),
    );
    await previewWithDestination(result);

    (window as unknown as { desktopBridge: unknown }).desktopBridge = desktopBridgeFor(
      scratch.directory("other-out"),
    );
    await act(async () => {
      await result.current.handlePickDest();
    });
    // Sync and async realpath disagree on Windows 8.3 short names
    // (`RUNNER~1` vs `runneradmin` on CI), so compare via the same async
    // canonicalization the implementation uses.
    expect(await fs.promises.realpath(result.current.destPath)).toBe(
      await fs.promises.realpath(scratch.directory("other-out")),
    );
    expect(result.current.phase).toBe("form");
    expect(result.current.preview).toBeNull();
  });

  it("invalidates the reviewed preview when the source or format changes", async () => {
    const { result } = renderHook(() =>
      useMakePackV2({ open: true, initialSource: "selection", initialFileIds: ["a"] }),
    );
    await previewWithDestination(result);
    await act(async () => {
      result.current.setOutputFormat("zip");
    });
    expect(result.current.phase).toBe("form");

    await act(async () => {
      await result.current.handlePreview();
    });
    expect(result.current.phase).toBe("preview");
    await act(async () => {
      result.current.setIncludeManifest(false);
    });
    expect(result.current.phase).toBe("form");

    await act(async () => {
      await result.current.handlePreview();
    });
    await act(async () => {
      result.current.setSource("shelf");
    });
    expect(result.current.phase).toBe("form");
    expect(result.current.preview).toBeNull();
  });

  it("starts the job from the reviewed plan route and reads the bounded result", async () => {
    const { result } = renderHook(() =>
      useMakePackV2({ open: true, initialSource: "selection", initialFileIds: ["a"] }),
    );
    await previewWithDestination(result);

    await act(async () => {
      await result.current.handleStartJob();
    });

    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(result.current.result?.copied).toBe(1);

    const jobSubmit = fetchCalls.find(
      (call) => call.url === `/api/extensions-v2/plans/${REVIEW.planId}/job` && call.method === "POST",
    );
    expect(jobSubmit).toBeDefined();
    expect(jobSubmit?.body).toEqual({ targets: REVIEW.targets, options: REVIEW.options });

    // The reviewed echo carried the destination grant; no separate job
    // route re-derivation happened.
    expect(fetchCalls.some((call) => call.url === "/api/extensions-v2/jobs")).toBe(false);
  });
});
