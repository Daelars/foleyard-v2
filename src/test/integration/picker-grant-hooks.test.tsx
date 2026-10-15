// @vitest-environment jsdom
import fs from "node:fs";

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { useLibraryGathererV2 } from "@/components/extensions/library-gatherer-v2/use-library-gatherer-v2";
import { useMakePackV2 } from "@/components/extensions/make-pack-v2/use-make-pack-v2";
import { createScratchLibrary, type ScratchLibrary } from "@/test/fixtures";
import { POST as desktopGrantsPOST } from "@/app/api/desktop/grants/route";
import { POST as grantsPOST } from "@/app/api/extensions-v2/grants/route";
import { POST as sourceGrantsPOST } from "@/app/api/extensions-v2/source-grants/route";

// Area: #263. The Make Pack and Library Gatherer dialogs must run the real
// picker-to-grant flow: the native picker (here the desktop-grants route,
// authenticated with the startup secret) mints a proof, and the hook spends
// it at the grant route. Rendering the hooks as the dialogs do is the
// strongest proof the renderer never sends a directory path as consent.

vi.mock("@/lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db")>();
  return { ...original, getLibraryRoots: () => [] };
});

const SECRET = "hook-test-secret";

let scratch: ScratchLibrary;

function routeRequest(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Stand in for the Electron main process: open the picker, return the proof. */
function desktopBridgeFor(paths: { source: string; destination: string }) {
  return {
    isDesktop: true,
    pickFolder: async (purpose: { extensionId: string; grantKind: "source" | "destination" }) => {
      const chosen = purpose.grantKind === "source" ? paths.source : paths.destination;
      const response = await desktopGrantsPOST(
        new NextRequest("http://localhost/api/desktop/grants", {
          method: "POST",
          headers: { "x-foleyard-grant-secret": SECRET },
          body: JSON.stringify({ path: chosen, ...purpose }),
        }),
      );
      return (await response.json()) as { ok: boolean; path: string; proof: string };
    },
  };
}

beforeEach(() => {
  scratch = createScratchLibrary("foleyard-picker-hook-");
  vi.stubEnv("FOLEYARD_GRANT_SECRET", SECRET);
  (window as unknown as { desktopBridge: unknown }).desktopBridge = desktopBridgeFor({
    source: scratch.directory("incoming"),
    destination: scratch.directory("out"),
  });

  vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body));
    if (url === "/api/extensions-v2/grants") return grantsPOST(routeRequest(url, body));
    if (url === "/api/extensions-v2/source-grants") return sourceGrantsPOST(routeRequest(url, body));
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete (window as unknown as { desktopBridge?: unknown }).desktopBridge;
  scratch.dispose();
});

describe("extension dialogs run the picker-to-grant flow", () => {
  it("gives Make Pack a destination grant from the picker", async () => {
    const { result } = renderHook(() => useMakePackV2({ open: true }));

    await act(async () => {
      await result.current.handlePickDest();
    });

    // Sync and async realpath disagree on Windows 8.3 short names
    // (`RUNNER~1` vs `runneradmin` on CI), so compare via the same async
    // canonicalization the implementation uses.
    expect(await fs.promises.realpath(result.current.destPath)).toBe(
      await fs.promises.realpath(scratch.directory("out")),
    );
    expect(result.current.grantId).toEqual(expect.any(String));
    expect(result.current.grantId.length).toBeGreaterThan(0);
  });

  it("gives Library Gatherer source and destination grants from the picker", async () => {
    const { result } = renderHook(() => useLibraryGathererV2({ open: true }));

    await act(async () => {
      await result.current.handlePickFolder();
    });
    expect(result.current.sources).toEqual([
      {
        path: await fs.promises.realpath(scratch.directory("incoming")),
        grantId: expect.any(String),
      },
    ]);

    await act(async () => {
      await result.current.handlePickDest();
    });
    expect(await fs.promises.realpath(result.current.destPath)).toBe(
      await fs.promises.realpath(scratch.directory("out")),
    );
    expect(result.current.grantId).toEqual(expect.any(String));
  });
});
