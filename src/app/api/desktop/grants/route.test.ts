import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

let directory: string;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), "foleyard-grants-")); vi.stubEnv("FOLEYARD_GRANT_SECRET", "test-desktop-secret"); });
afterEach(async () => { vi.unstubAllEnvs(); await fs.rm(directory, { recursive: true, force: true }); });
function request(secret?: string) { return new NextRequest("http://localhost/api/desktop/grants", { method: "POST", headers: secret ? { "x-foleyard-grant-secret": secret } : {}, body: JSON.stringify({ path: directory }) }); }
describe("desktop grants", () => {
  it("rejects renderer requests without desktop authentication", async () => { expect((await POST(request())).status).toBe(403); });
  it("rejects incorrect desktop authentication", async () => { expect((await POST(request("wrong"))).status).toBe(403); });
  it("issues an opaque token for a chosen directory", async () => { const response = await POST(request("test-desktop-secret")); expect(response.status).toBe(200); const result=await response.json(); expect(result.path).toBe(await fs.realpath(directory)); expect(result.grantToken).toEqual(expect.any(String)); expect(result.grantToken).not.toContain(directory); });
});
