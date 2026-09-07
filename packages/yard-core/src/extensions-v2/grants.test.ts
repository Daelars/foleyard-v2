import { describe, expect, it } from "vitest";

import { V2GrantStore } from "./index";

// Area: extension v2 R3 (#167). Destination grants are explicit,
// expiring, and extension-scoped: missing, expired, foreign, or
// revoked grants deny.

describe("V2GrantStore", () => {
  it("authorizes a grant issued to the calling extension", () => {
    const store = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = store.issue("make-pack-v2", "/grants/out");
    const authorized = store.authorize(grant.grantId, "make-pack-v2");
    expect(authorized.ok).toBe(true);
    if (authorized.ok) expect(authorized.grant.rootPath).toBe("/grants/out");
  });

  it("denies missing or revoked grants", () => {
    const store = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const missing = store.authorize(undefined, "make-pack-v2");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("grant-missing");

    const grant = store.issue("make-pack-v2", "/grants/out");
    store.revoke(grant.grantId);
    const revoked = store.authorize(grant.grantId, "make-pack-v2");
    expect(revoked.ok).toBe(false);
    if (!revoked.ok) expect(revoked.reason).toBe("grant-missing");
  });

  it("denies foreign grants issued to another extension", () => {
    const store = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = store.issue("make-pack-v2", "/grants/out");
    const foreign = store.authorize(grant.grantId, "fixture-greeter");
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.reason).toBe("grant-foreign");
  });

  it("denies expired grants and prunes them", () => {
    let now = "2026-09-06T00:00:00.000Z";
    const store = new V2GrantStore(() => now);
    const grant = store.issue("make-pack-v2", "/grants/out", {
      expiresAt: "2026-09-06T01:00:00.000Z",
    });
    expect(store.authorize(grant.grantId, "make-pack-v2").ok).toBe(true);

    now = "2026-09-06T02:00:00.000Z";
    const expired = store.authorize(grant.grantId, "make-pack-v2");
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reason).toBe("grant-expired");
    expect(store.pruneExpired()).toBe(1);
    const pruned = store.authorize(grant.grantId, "make-pack-v2");
    expect(pruned.ok).toBe(false);
    if (!pruned.ok) expect(pruned.reason).toBe("grant-missing");
  });

  it("carries no token material in persisted grant records", () => {
    const store = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = store.issue("make-pack-v2", "/grants/out");
    const serialized = JSON.parse(JSON.stringify(grant)) as Record<string, unknown>;
    for (const key of Object.keys(serialized)) {
      expect(key.toLowerCase()).not.toContain("token");
      expect(key.toLowerCase()).not.toContain("secret");
    }
  });
});
