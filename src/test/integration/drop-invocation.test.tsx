// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  DROP_RULES_V2_APPLY,
  DROP_RULES_V2_ID,
  createDropRulesV2Definition,
} from "@foleyard/drop-rules-v2";
import { toCatalogEntry, V2_EXTENSION_API_VERSION } from "@yard-core";
import { useV2DropInvocation } from "@/components/extensions-v2/use-v2-drop-invocation";
import { createScratchLibrary, type ScratchLibrary } from "@/test/fixtures";
import { POST as desktopGrantsPOST } from "@/app/api/desktop/grants/route";
import { POST as grantsPOST } from "@/app/api/extensions-v2/grants/route";

// Area: #283. A drop offer must invoke the real command with the context its
// schema declares: the dropped files resolved to Library IDs and a
// destination grant obtained through the shared picker-to-grant flow. A
// review-required outcome is then reviewed and applied with that same drop
// context preserved. The picker and grant routes are real; the execute and
// plan responses are captured and canned so the assertion is about the exact
// payload the drop zone sends.

vi.mock("@/lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db")>();
  return { ...original, getLibraryRoots: () => [] };
});

const SECRET = "drop-invoke-secret";
const PLAN_ID = "vplan_drop_test";

const catalog = {
  apiVersion: V2_EXTENSION_API_VERSION,
  entries: [toCatalogEntry(createDropRulesV2Definition())],
};

let scratch: ScratchLibrary;
let executePayloads: Array<Record<string, unknown>>;
let applyPayloads: Array<Record<string, unknown>>;

const review = {
  planId: PLAN_ID,
  extensionId: DROP_RULES_V2_ID,
  commandId: DROP_RULES_V2_APPLY,
  summary: "Drop 1 sound with Drop Rules",
  tables: [{ id: "drops", columns: ["Sound", "Drop name", "Status"], rows: [["kick.wav", "001-kick.wav", "ready"]] }],
  notices: [],
  details: { conflicts: [], missing: [], names: ["001-kick.wav"] },
  targets: { fileIds: ["a"] },
  options: {
    fileIds: ["a"],
    destGrantId: "ignored-by-canned-response",
    copyOnDrop: true,
    renameOnDrop: true,
    renamePattern: "{index}-{name}{ext}",
    markUsed: true,
  },
  destructive: false,
  reversibility: "irreversible-files",
  reversibilityNote: "note",
  createdAt: "2026-10-15T00:00:00.000Z",
  expiresAt: "2026-10-15T01:00:00.000Z",
  reviewedAt: "2026-10-15T00:00:00.000Z",
};

function routeRequest(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  scratch = createScratchLibrary("foleyard-drop-invoke-");
  executePayloads = [];
  applyPayloads = [];
  vi.stubEnv("FOLEYARD_GRANT_SECRET", SECRET);
  // The picker endpoint authenticates the native process; add the secret header
  // by wrapping the bridge call in the fetch stub below.
  (window as unknown as { desktopBridge: unknown }).desktopBridge = {
    isDesktop: true,
    pickFolder: async (purpose: { extensionId: string; grantKind: "source" | "destination" }) => {
      const response = await desktopGrantsPOST(
        new NextRequest("http://localhost/api/desktop/grants", {
          method: "POST",
          headers: { "x-foleyard-grant-secret": SECRET },
          body: JSON.stringify({ path: scratch.directory("out"), ...purpose }),
        }),
      );
      return (await response.json()) as { ok: boolean; path: string; proof: string };
    },
  };

  vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url === "/api/extensions-v2/grants") {
      return grantsPOST(routeRequest(url, body));
    }
    if (url === "/api/extensions-v2/execute") {
      executePayloads.push(body as Record<string, unknown>);
      return new Response(
        JSON.stringify({ ok: true, outcome: { kind: "review-required", planId: PLAN_ID } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url === `/api/extensions-v2/plans/${PLAN_ID}`) {
      return new Response(JSON.stringify({ ok: true, review }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === `/api/extensions-v2/plans/${PLAN_ID}/apply`) {
      applyPayloads.push(body as Record<string, unknown>);
      return new Response(
        JSON.stringify({ ok: true, outcome: { kind: "immediate", value: { copied: 1 } } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete (window as unknown as { desktopBridge?: unknown }).desktopBridge;
  scratch.dispose();
});

describe("drop offer invocation supplies the command's context", () => {
  it("resolves dropped files, picks a destination grant, and applies the reviewed plan", async () => {
    const resolved = vi.fn(async () => ({ fileIds: ["a"], missing: [] }));
    const { result } = renderHook(() =>
      useV2DropInvocation({ catalog, resolveDropFiles: resolved }),
    );

    let outcome: Awaited<ReturnType<typeof result.current.invoke>> | undefined;
    await act(async () => {
      outcome = await result.current.invoke({
        extensionId: DROP_RULES_V2_ID,
        commandId: DROP_RULES_V2_APPLY,
        names: ["kick.wav"],
      });
    });

    expect(resolved).toHaveBeenCalledWith(["kick.wav"]);
    expect(outcome).toMatchObject({ ok: true, kind: "applied", value: { copied: 1 } });

    expect(executePayloads).toHaveLength(1);
    const sent = executePayloads[0] as {
      input: Record<string, unknown>;
      selection: Record<string, unknown>;
    };
    // The file context: dropped names resolved to Library IDs.
    expect(sent.input.fileIds).toEqual(["a"]);
    expect(sent.selection.fileIds).toEqual(["a"]);
    expect(sent.selection.dropFileCount).toBe(1);
    // The grant context: a real destination grant from the picker flow.
    expect(typeof sent.input.destGrantId).toBe("string");
    expect((sent.input.destGrantId as string).length).toBeGreaterThan(0);

    // The reviewed plan is applied with its original context echoed back.
    expect(applyPayloads).toHaveLength(1);
    expect(applyPayloads[0]).toEqual({ targets: review.targets, options: review.options });
  });

  it("fails loudly when the picker is unavailable instead of sending a half-command", async () => {
    delete (window as unknown as { desktopBridge?: unknown }).desktopBridge;
    const { result } = renderHook(() =>
      useV2DropInvocation({
        catalog,
        resolveDropFiles: async () => ({ fileIds: ["a"], missing: [] }),
      }),
    );

    let outcome: Awaited<ReturnType<typeof result.current.invoke>> | undefined;
    await act(async () => {
      outcome = await result.current.invoke({
        extensionId: DROP_RULES_V2_ID,
        commandId: DROP_RULES_V2_APPLY,
        names: ["kick.wav"],
      });
    });

    expect(outcome).toMatchObject({ ok: false });
    expect(executePayloads).toHaveLength(0);
  });
});
