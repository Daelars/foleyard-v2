// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { callRoute } from "@/test/fixtures";

// Area: #295. The batched settings route returns every extension in one
// response. A per-extension read failure is a 200 with a `degraded`
// entry (so the panel stays visible); a failure building the whole
// catalog is a 500 the client renders as recoverable.
const state = vi.hoisted(() => ({
  catalogThrows: false,
  failingExtension: null as string | null,
  catalogEntry: {
    id: "make-pack-v2",
    name: "Make Pack v2",
    version: "1.0.0",
    description: "Export packs.",
    permissions: ["files:write"],
    declaredPermissions: ["files:write"],
    commands: [],
    settings: [
      { id: "copy-on-drop", label: "Copy on drop", type: "boolean", defaultValue: false },
    ],
    contributions: [],
    docsRefs: [],
  },
}));

vi.mock("@/lib/extensions-v2/host", () => ({
  buildAppV2Catalog: () => {
    if (state.catalogThrows) throw new Error("registry exploded");
    return { apiVersion: 2, entries: [state.catalogEntry] };
  },
  isV2ExtensionEnabled: () => true,
}));

vi.mock("@/lib/extensions-v2/runtime", () => ({
  getV2PolicyHealth: () => ({ degraded: false, reason: null }),
}));

vi.mock("@/lib/extensions-v2/settings-state", () => ({
  createV2AuthoredSettings: (
    extensionId: string,
    declarations: ReadonlyArray<{ id: string; defaultValue: unknown }>,
  ) => ({
    get: (settingId: string) => {
      if (extensionId === state.failingExtension) {
        throw new Error("database is locked");
      }
      return declarations.find((declaration) => declaration.id === settingId)?.defaultValue;
    },
    diagnose: () => [],
  }),
}));

import { GET } from "@/app/api/extensions-v2/settings/route";

async function readCatalog() {
  return callRoute(GET, { method: "GET", url: "http://localhost/api/extensions-v2/settings" });
}

describe("GET /api/extensions-v2/settings", () => {
  it("serves every extension with its settings in one response", async () => {
    state.catalogThrows = false;
    state.failingExtension = null;

    const { status, body } = await readCatalog();

    expect(status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      policyHealth: { degraded: false, reason: null },
      extensions: [
        {
          id: "make-pack-v2",
          status: "ready",
          enabled: true,
          declaredPermissions: ["files:write"],
          effectivePermissions: ["files:write"],
          settings: [{ declaration: { id: "copy-on-drop" }, value: false }],
        },
      ],
    });
  });

  it("keeps a failed extension as a degraded entry with a 200", async () => {
    state.catalogThrows = false;
    state.failingExtension = "make-pack-v2";

    const { status, body } = await readCatalog();

    expect(status).toBe(200);
    const extensions = (body as { extensions: Array<{ id: string; status: string; error: string | null }> })
      .extensions;
    expect(extensions).toHaveLength(1);
    expect(extensions[0]).toMatchObject({ id: "make-pack-v2", status: "degraded" });
    expect(extensions[0]!.error).toContain("database is locked");
  });

  it("reports a total catalog failure as a 500", async () => {
    state.catalogThrows = true;
    state.failingExtension = null;

    const { status, body } = await readCatalog();

    expect(status).toBe(500);
    expect(body).toMatchObject({ ok: false, error: { code: "settings-unavailable" } });
  });
});
