import { describe, expect, it } from "vitest";

import {
  assertNoV2Secrets,
  buildEffectiveV2Catalog,
  computeEffectiveV2Permissions,
  createGreeterFixtureDefinition,
  ExtensionV2Registry,
  findV2SecretKeys,
  isV2ApprovalExpired,
  serializeCatalog,
  V2PermissionApprovals,
} from "./index";

// Area: extension v2 R3 (#167). Deny-by-default permissions: the
// effective set is declared ∩ approved, shared by the handler context
// and the catalog. Nothing is inferred or auto-granted.

describe("computeEffectiveV2Permissions", () => {
  it("intersects declared and approved in declaration order", () => {
    expect(
      computeEffectiveV2Permissions(
        ["files:write", "library:read", "files:read"],
        ["library:read", "files:read"],
      ),
    ).toEqual(["library:read", "files:read"]);
  });

  it("denies everything when nothing was approved", () => {
    expect(computeEffectiveV2Permissions(["library:read"], [])).toEqual([]);
    expect(
      computeEffectiveV2Permissions(["library:read"], new Set<string>()),
    ).toEqual([]);
  });

  it("never auto-grants requested permissions and drops unknown ones", () => {
    expect(
      computeEffectiveV2Permissions(["library:read"], ["library:read", "library:write"]),
    ).toEqual(["library:read"]);
    expect(
      computeEffectiveV2Permissions(["library:read", "library:read"], ["library:read"]),
    ).toEqual(["library:read"]);
  });
});

describe("V2PermissionApprovals", () => {
  it("starts empty and revokes explicitly", () => {
    const approvals = new V2PermissionApprovals(() => "2026-09-06T00:00:00.000Z");
    expect(approvals.grantedPermissions("fixture-greeter")).toEqual([]);

    approvals.setApproval("fixture-greeter", ["library:read"]);
    expect(approvals.grantedPermissions("fixture-greeter")).toEqual(["library:read"]);

    approvals.revoke("fixture-greeter");
    expect(approvals.grantedPermissions("fixture-greeter")).toEqual([]);
  });

  it("denies expired approvals", () => {
    const approvals = new V2PermissionApprovals(() => "2026-09-07T00:00:00.000Z");
    approvals.setApproval("fixture-greeter", ["library:read"], {
      expiresAt: "2026-09-06T00:00:00.000Z",
    });
    expect(approvals.grantedPermissions("fixture-greeter")).toEqual([]);
    expect(
      isV2ApprovalExpired({ expiresAt: "2026-09-06T00:00:00.000Z" }, "2026-09-07T00:00:00.000Z"),
    ).toBe(true);
    expect(
      isV2ApprovalExpired({ expiresAt: "2026-09-08T00:00:00.000Z" }, "2026-09-07T00:00:00.000Z"),
    ).toBe(false);
    expect(isV2ApprovalExpired({}, "2026-09-07T00:00:00.000Z")).toBe(false);
  });

  it("derives the same effective set the host context uses", () => {
    const approvals = new V2PermissionApprovals(() => "2026-09-06T00:00:00.000Z");
    approvals.setApproval("fixture-greeter", ["library:read", "files:write"]);
    const definition = createGreeterFixtureDefinition();
    expect(approvals.effectivePermissions(definition, "fixture-greeter")).toEqual([
      "library:read",
    ]);
  });
});

describe("buildEffectiveV2Catalog", () => {
  function registry() {
    const next = new ExtensionV2Registry();
    next.register(createGreeterFixtureDefinition());
    return next;
  }

  it("projects effective permissions, not declared ones", () => {
    const unapproved = buildEffectiveV2Catalog(registry(), () => []);
    expect(unapproved.entries[0]!.permissions).toEqual([]);

    const approved = buildEffectiveV2Catalog(registry(), () => ["library:read"]);
    expect(approved.entries[0]!.permissions).toEqual(["library:read"]);

    // Declared catalog still shows the declaration; the effective
    // projection is what renderers enforce against.
    expect(registry().buildCatalog().entries[0]!.permissions).toEqual(["library:read"]);
  });

  it("matches computeEffectiveV2Permissions for every entry", () => {
    const next = registry();
    const granted = ["library:read", "files:write"];
    const effective = buildEffectiveV2Catalog(next, () => granted);
    for (const entry of effective.entries) {
      const definition = next.get(entry.id)!;
      expect(entry.permissions).toEqual(
        computeEffectiveV2Permissions(definition.permissions, granted),
      );
    }
  });
});

describe("grant tokens and secrets", () => {
  it("finds no secret keys in the fixture definition or catalog", () => {
    const definition = createGreeterFixtureDefinition();
    expect(findV2SecretKeys(definition)).toEqual([]);

    const next = new ExtensionV2Registry();
    next.register(definition);
    const catalog = next.buildCatalog();
    expect(findV2SecretKeys(catalog)).toEqual([]);
    expect(findV2SecretKeys(JSON.parse(serializeCatalog(catalog)))).toEqual([]);
    expect(() => assertNoV2Secrets(catalog, "v2 catalog")).not.toThrow();
  });

  it("flags grant tokens and secrets wherever they hide", () => {
    expect(findV2SecretKeys({ grantToken: "abc" })).toEqual(["grantToken"]);
    expect(
      findV2SecretKeys({ nested: { desktopSecret: "s", ok: 1 } }),
    ).toEqual(["nested.desktopSecret"]);
    expect(() =>
      assertNoV2Secrets({ grantToken: "abc" }, "v2 export"),
    ).toThrow(/grant tokens or secrets/);
  });
});

describe("approval snapshot persistence (R7)", () => {
  it("round-trips approvals and ignores malformed entries", () => {
    const approvals = new V2PermissionApprovals(() => "2026-09-06T00:00:00.000Z");
    approvals.setApproval("ext-a", ["library:read", "files:write"], {
      expiresAt: "2026-10-06T00:00:00.000Z",
    });
    const snapshot = { approvals: approvals.snapshot() };
    expect(() => JSON.stringify(snapshot)).not.toThrow();
    expect(findV2SecretKeys(snapshot)).toEqual([]);

    const restarted = new V2PermissionApprovals(() => "2026-09-06T00:00:00.000Z");
    expect(restarted.grantedPermissions("ext-a")).toEqual([]);
    const loaded = restarted.restore(snapshot);
    expect(loaded).toEqual({ restored: 1, ignored: 0 });
    expect(restarted.grantedPermissions("ext-a")).toEqual(["library:read", "files:write"]);

    const dirty = new V2PermissionApprovals();
    const result = dirty.restore({
      approvals: [
        { extensionId: "ext-b", permissions: ["library:read", "bogus:perm"], grantedAt: "2026-09-06T00:00:00.000Z" },
        { extensionId: "", permissions: [] },
        null,
      ],
    });
    expect(result).toEqual({ restored: 1, ignored: 2 });
    expect(dirty.grantedPermissions("ext-b")).toEqual(["library:read"]);
    expect(dirty.restore(null)).toEqual({ restored: 0, ignored: 0 });
  });
});
