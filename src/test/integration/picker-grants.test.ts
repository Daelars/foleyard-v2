// @vitest-environment node
import fs from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createScratchLibrary, type ScratchLibrary } from "@/test/fixtures";
import { pickV2Grant } from "@/lib/extensions-v2/picker-grant-client";
import { getV2Runtime } from "@/lib/extensions-v2/runtime";
import { POST as desktopGrantsPOST } from "@/app/api/desktop/grants/route";
import { POST as grantsPOST } from "@/app/api/extensions-v2/grants/route";
import { POST as sourceGrantsPOST } from "@/app/api/extensions-v2/source-grants/route";

// Area: #263. Every extension source and destination grant depends on a
// single-use proof the native folder picker minted; a caller-supplied path
// is never consent. The proof store rides the process-wide v2 runtime
// (#264), so the desktop-grants bundle that mints a proof and the grant
// bundle that spends it share one store.

vi.mock("@/lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db")>();
  return { ...original, getLibraryRoots: () => [] };
});

const SECRET = "test-desktop-secret";
const MAKE_PACK = "make-pack-v2";
const GATHERER = "library-gatherer-v2";

type PickedFolder = { ok: boolean; path: string; proof?: string };

function pickerRequest(body: unknown, secret: string | null = SECRET) {
  return new NextRequest("http://localhost/api/desktop/grants", {
    method: "POST",
    headers: secret ? { "x-foleyard-grant-secret": secret } : {},
    body: JSON.stringify(body),
  });
}

async function pick(extensionId: string, grantKind: "source" | "destination", directoryPath: string) {
  const response = await desktopGrantsPOST(
    pickerRequest({ path: directoryPath, extensionId, grantKind }),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as PickedFolder;
}

function grantRequest(route: "grants" | "source-grants", body: unknown) {
  const request = new NextRequest(`http://localhost/api/extensions-v2/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return route === "grants" ? grantsPOST(request) : sourceGrantsPOST(request);
}

let scratch: ScratchLibrary;

beforeEach(() => {
  scratch = createScratchLibrary("foleyard-picker-");
  vi.stubEnv("FOLEYARD_GRANT_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  scratch.dispose();
});

describe("desktop-picker proofs gate extension grants", () => {
  it("returns a single-use opaque proof only to the authenticated picker", async () => {
    const destination = scratch.directory("out");
    // Sync and async realpath disagree on Windows 8.3 short names
    // (`RUNNER~1` vs `runneradmin` on CI), so compare via the same async
    // canonicalization the implementation uses.
    const canonicalDestination = await fs.promises.realpath(destination);

    // Only the desktop process may mint; no secret and a wrong secret deny.
    expect((await desktopGrantsPOST(pickerRequest({ path: destination }, null))).status).toBe(403);
    expect((await desktopGrantsPOST(pickerRequest({ path: destination }, "wrong"))).status).toBe(403);

    const picked = await pick(MAKE_PACK, "destination", destination);
    expect(await fs.promises.realpath(picked.path)).toBe(canonicalDestination);
    expect(picked.proof).toEqual(expect.any(String));
    // The proof must not leak the chosen folder, in the canonical spelling the
    // implementation would have used.
    expect(picked.proof).not.toContain(canonicalDestination);

    // Library-root browsing still gets the canonical path and no proof.
    const browsed = (await (
      await desktopGrantsPOST(pickerRequest({ path: destination }))
    ).json()) as PickedFolder;
    expect(browsed.path).toBe(picked.path);
    expect(browsed.proof).toBeUndefined();

    // A purpose that names only half of itself is malformed.
    expect(
      (await desktopGrantsPOST(pickerRequest({ path: destination, extensionId: MAKE_PACK }))).status,
    ).toBe(400);
    expect(
      (
        await desktopGrantsPOST(
          pickerRequest({ path: destination, extensionId: MAKE_PACK, grantKind: "write" }),
        )
      ).status,
    ).toBe(400);
  });

  it("issues destination and source grants from proofs, never from a path", async () => {
    const destination = scratch.directory("out");
    const source = scratch.directory("incoming");

    const viaPath = await grantRequest("grants", {
      extensionId: MAKE_PACK,
      directoryPath: destination,
    });
    expect(viaPath.status).toBe(400);
    expect(await viaPath.json()).toMatchObject({ ok: false, error: { code: "input-invalid" } });

    const sourceViaPath = await grantRequest("source-grants", {
      extensionId: GATHERER,
      directoryPath: source,
    });
    expect(sourceViaPath.status).toBe(400);

    // The proof the picker minted issues the grant the handler consumes.
    const destinationProof = await pick(MAKE_PACK, "destination", destination);
    const destinationGrant = await grantRequest("grants", {
      extensionId: MAKE_PACK,
      proof: destinationProof.proof,
    });
    expect(destinationGrant.status).toBe(200);
    expect(await destinationGrant.json()).toMatchObject({
      ok: true,
      path: destinationProof.path,
      grantId: expect.any(String),
    });

    const sourceProof = await pick(GATHERER, "source", source);
    const sourceGrant = await grantRequest("source-grants", {
      extensionId: GATHERER,
      proof: sourceProof.proof,
    });
    expect(sourceGrant.status).toBe(200);
    expect(await sourceGrant.json()).toMatchObject({ ok: true, path: sourceProof.path });
  });

  it("refuses replayed, foreign, expired, and arbitrary proofs", async () => {
    const destination = scratch.directory("out");

    // Replayed: a proof is spent once.
    const replayable = await pick(MAKE_PACK, "destination", destination);
    expect(
      (await grantRequest("grants", { extensionId: MAKE_PACK, proof: replayable.proof })).status,
    ).toBe(200);
    const replay = await grantRequest("grants", { extensionId: MAKE_PACK, proof: replayable.proof });
    expect(replay.status).toBe(403);
    expect(await replay.json()).toMatchObject({ ok: false, error: { code: "grant-denied" } });

    // Foreign: minted for one extension, presented by another.
    const foreignExtension = await pick(MAKE_PACK, "destination", destination);
    const foreignResponse = await grantRequest("grants", {
      extensionId: GATHERER,
      proof: foreignExtension.proof,
    });
    expect(foreignResponse.status).toBe(403);

    // Foreign kind: a destination proof cannot become a source grant.
    const foreignKind = await pick(MAKE_PACK, "destination", destination);
    const kindResponse = await grantRequest("source-grants", {
      extensionId: MAKE_PACK,
      proof: foreignKind.proof,
    });
    expect(kindResponse.status).toBe(403);

    // Arbitrary: a proof id the picker never minted.
    const arbitrary = await grantRequest("grants", {
      extensionId: MAKE_PACK,
      proof: "vpick_forged-by-the-caller",
    });
    expect(arbitrary.status).toBe(403);

    // Missing proof entirely.
    const missing = await grantRequest("grants", { extensionId: MAKE_PACK });
    expect(missing.status).toBe(400);

    // Expired: minted, then past its expiry.
    const expired = getV2Runtime().pickerProofs.issue(MAKE_PACK, "destination", destination, {
      ttlMs: -1_000,
    });
    const expiredResponse = await grantRequest("grants", {
      extensionId: MAKE_PACK,
      proof: expired.proof,
    });
    expect(expiredResponse.status).toBe(403);
    expect(await expiredResponse.json()).toMatchObject({ ok: false, error: { code: "grant-denied" } });
  });

  it("checks the extension before spending the proof", async () => {
    const destination = scratch.directory("out");
    const proof = await pick(MAKE_PACK, "destination", destination);

    const unknown = await grantRequest("grants", { extensionId: "nope", proof: proof.proof });
    expect(unknown.status).toBe(404);

    // The proof survived the unknown-extension request and still issues.
    const issued = await grantRequest("grants", { extensionId: MAKE_PACK, proof: proof.proof });
    expect(issued.status).toBe(200);
  });

  it("completes the picker-to-grant flow Make Pack and Library Gatherer run", async () => {
    const destination = scratch.directory("out");
    const source = scratch.directory("incoming");
    // Sync and async realpath disagree on Windows 8.3 short names
    // (`RUNNER~1` vs `runneradmin` on CI), so match the async canonicalization
    // the implementation uses.
    const canonicalDestination = await fs.promises.realpath(destination);
    const canonicalSource = await fs.promises.realpath(source);

    // The bridge stands in for the Electron main process: it opens the native
    // picker (here, the real desktop-grants route) and returns the proof.
    const bridge = {
      pickFolder: async ({ extensionId, grantKind }: { extensionId: string; grantKind: "source" | "destination" }) =>
        (await (await desktopGrantsPOST(pickerRequest({ path: grantKind === "source" ? source : destination, extensionId, grantKind }))).json()) as {
          ok: boolean;
          path?: string;
          proof?: string;
        },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const route = url === "/api/extensions-v2/source-grants" ? "source-grants" : "grants";
      if (url !== "/api/extensions-v2/grants" && url !== "/api/extensions-v2/source-grants") {
        throw new Error(`unexpected fetch ${url}`);
      }
      return grantRequest(route, JSON.parse(String(init?.body)));
    }) as typeof fetch;

    try {
      const pack = await pickV2Grant(bridge, MAKE_PACK, "destination");
      expect(pack).toMatchObject({ ok: true, path: canonicalDestination });

      const gatherSource = await pickV2Grant(bridge, GATHERER, "source");
      expect(gatherSource).toMatchObject({ ok: true, path: canonicalSource });

      const gatherDestination = await pickV2Grant(bridge, GATHERER, "destination");
      expect(gatherDestination).toMatchObject({ ok: true, path: canonicalDestination });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
