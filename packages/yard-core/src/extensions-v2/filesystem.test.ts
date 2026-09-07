import { describe, expect, it } from "vitest";

import {
  authorizeV2ReadablePath,
  authorizeV2WritablePath,
  screenV2CandidatePath,
} from "./index";
import { fakePathIo } from "./test-helpers";

// Area: extension v2 R3 (#167). Filesystem ADR protections over an
// injected path layer: canonical paths, traversal, junction/symlink
// escapes, existing-ancestor resolution, and root containment.

describe("screenV2CandidatePath", () => {
  it("rejects blank paths and null bytes", () => {
    expect(screenV2CandidatePath("  ")!.reason).toBe("missing");
    expect(screenV2CandidatePath("/lib/a\0.mp3")!.reason).toBe("traversal");
  });

  it("rejects lexical escapes above the start", () => {
    expect(screenV2CandidatePath("../evil.mp3")!.reason).toBe("traversal");
    expect(screenV2CandidatePath("/lib/../../evil.mp3")!.reason).toBe("traversal");
  });

  it("accepts ordinary nested paths", () => {
    expect(screenV2CandidatePath("/lib/sub/song.mp3")).toBeNull();
  });
});

describe("authorizeV2ReadablePath", () => {
  it("returns the canonical path inside a Library root", async () => {
    const io = fakePathIo(["/lib", "/lib/song.mp3"]);
    const authorized = await authorizeV2ReadablePath("/lib/song.mp3", ["/lib"], io);
    expect(authorized).toEqual({ ok: true, canonicalPath: "/lib/song.mp3" });
  });

  it("denies paths outside the readable roots", async () => {
    const io = fakePathIo(["/lib", "/lib/song.mp3", "/outside/evil.mp3"]);
    const denied = await authorizeV2ReadablePath("/outside/evil.mp3", ["/lib"], io);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe("outside-root");
  });

  it("denies symlink escapes that resolve outside the roots", async () => {
    const io = fakePathIo(["/lib", "/outside/secret.mp3"], {
      "/lib/evil.mp3": "/outside/secret.mp3",
    });
    const denied = await authorizeV2ReadablePath("/lib/evil.mp3", ["/lib"], io);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe("outside-root");
  });

  it("denies dangling links and missing entries distinctly", async () => {
    const io = fakePathIo(["/lib"], { "/lib/dangling.mp3": "/gone.mp3" });
    const dangling = await authorizeV2ReadablePath("/lib/dangling.mp3", ["/lib"], io);
    expect(dangling.ok).toBe(false);
    if (!dangling.ok) expect(dangling.reason).toBe("dangling-link");

    const missing = await authorizeV2ReadablePath("/lib/absent.mp3", ["/lib"], io);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("missing");
  });
});

describe("authorizeV2WritablePath", () => {
  it("resolves new output through existing ancestors inside the grant", async () => {
    const io = fakePathIo(["/grant", "/grant/sub"]);
    const authorized = await authorizeV2WritablePath("/grant/sub/new/out.zip", "/grant", io);
    expect(authorized).toEqual({ ok: true, canonicalPath: "/grant/sub/new/out.zip" });
  });

  it("denies junction ancestors that redirect outside the grant", async () => {
    const io = fakePathIo(["/grant", "/outside"], { "/grant/link": "/outside" });
    const denied = await authorizeV2WritablePath("/grant/link/evil.zip", "/grant", io);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe("outside-root");
  });

  it("denies traversal and escapes outside the grant", async () => {
    const io = fakePathIo(["/grant", "/outside"]);
    expect((await authorizeV2WritablePath("/grant/../../evil.zip", "/grant", io)).ok).toBe(false);
    const outside = await authorizeV2WritablePath("/outside/out.zip", "/grant", io);
    expect(outside.ok).toBe(false);
    if (!outside.ok) expect(outside.reason).toBe("outside-root");
  });

  it("denies dangling links on the output path", async () => {
    const io = fakePathIo(["/grant"], { "/grant/stage": "/gone" });
    const denied = await authorizeV2WritablePath("/grant/stage/out.zip", "/grant", io);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe("dangling-link");
  });
});
