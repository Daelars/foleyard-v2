import { describe, expect, it } from "vitest";

import { V2GrantStore, V2SourceGrantStore } from "./index";

// Area: extension v2 R3 (#167) / E1 (#176). Destination and source
// grants are explicit, expiring, and extension-scoped: missing,
// expired, foreign, or revoked grants deny. Both stores share the
// contract, so every case runs against each.

const GRANT_STORES = [
  {
    name: "V2GrantStore",
    create: (clock: () => string) => new V2GrantStore(clock),
    issuer: "make-pack-v2",
    rootPath: "/grants/out",
  },
  {
    name: "V2SourceGrantStore",
    create: (clock: () => string) => new V2SourceGrantStore(clock),
    issuer: "library-gatherer-v2",
    rootPath: "/media/inbox",
  },
];

for (const { name, create, issuer, rootPath } of GRANT_STORES) {
  describe(name, () => {
    it("authorizes a grant issued to the calling extension", () => {
      const store = create(() => "2026-09-06T00:00:00.000Z");
      const grant = store.issue(issuer, rootPath);
      const authorized = store.authorize(grant.grantId, issuer);
      expect(authorized.ok).toBe(true);
      if (authorized.ok) expect(authorized.grant.rootPath).toBe(rootPath);
    });

    it("denies missing or revoked grants", () => {
      const store = create(() => "2026-09-06T00:00:00.000Z");
      const missing = store.authorize(undefined, issuer);
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.reason).toBe("grant-missing");

      const grant = store.issue(issuer, rootPath);
      store.revoke(grant.grantId);
      const revoked = store.authorize(grant.grantId, issuer);
      expect(revoked.ok).toBe(false);
      if (!revoked.ok) expect(revoked.reason).toBe("grant-missing");
    });

    it("denies foreign grants issued to another extension", () => {
      const store = create(() => "2026-09-06T00:00:00.000Z");
      const grant = store.issue(issuer, rootPath);
      const foreign = store.authorize(grant.grantId, "other-extension");
      expect(foreign.ok).toBe(false);
      if (!foreign.ok) expect(foreign.reason).toBe("grant-foreign");
    });

    it("denies expired grants and prunes them", () => {
      let now = "2026-09-06T00:00:00.000Z";
      const store = create(() => now);
      const grant = store.issue(issuer, rootPath, {
        expiresAt: "2026-09-06T01:00:00.000Z",
      });
      expect(store.authorize(grant.grantId, issuer).ok).toBe(true);

      now = "2026-09-06T02:00:00.000Z";
      const expired = store.authorize(grant.grantId, issuer);
      expect(expired.ok).toBe(false);
      if (!expired.ok) expect(expired.reason).toBe("grant-expired");
      expect(store.pruneExpired()).toBe(1);
      const pruned = store.authorize(grant.grantId, issuer);
      expect(pruned.ok).toBe(false);
      if (!pruned.ok) expect(pruned.reason).toBe("grant-missing");
    });

    it("carries no token material in persisted grant records", () => {
      const store = create(() => "2026-09-06T00:00:00.000Z");
      const grant = store.issue(issuer, rootPath);
      const serialized = JSON.parse(JSON.stringify(grant)) as Record<string, unknown>;
      const text = JSON.stringify(serialized).toLowerCase();
      expect(text).not.toContain("token");
      expect(text).not.toContain("secret");
      expect(Object.keys(serialized).sort()).toEqual([
        "extensionId",
        "grantId",
        "grantedAt",
        "rootPath",
      ]);
    });
  });
}
