import { describe, expect, it } from "vitest";

import { V2SourceGrantStore } from "./index";

// Area: extension v2 E1 (#176). Readable source grants cover external
// source folders outside the Library roots: explicit, expiring, and
// extension-scoped. Missing, expired, foreign, or revoked grants deny,
// exactly like destination grants. A source grant never authorizes a
// write; that separation is enforced by the folder services, not the
// store.

describe("V2SourceGrantStore", () => {
  it("authorizes a grant issued to the calling extension", () => {
    const store = new V2SourceGrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = store.issue("library-gatherer-v2", "/media/inbox");
    const authorized = store.authorize(grant.grantId, "library-gatherer-v2");
    expect(authorized.ok).toBe(true);
    if (authorized.ok) expect(authorized.grant.rootPath).toBe("/media/inbox");
  });

  it("denies missing or revoked grants", () => {
    const store = new V2SourceGrantStore(() => "2026-09-06T00:00:00.000Z");
    const missing = store.authorize(undefined, "library-gatherer-v2");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("grant-missing");

    const grant = store.issue("library-gatherer-v2", "/media/inbox");
    store.revoke(grant.grantId);
    const revoked = store.authorize(grant.grantId, "library-gatherer-v2");
    expect(revoked.ok).toBe(false);
    if (!revoked.ok) expect(revoked.reason).toBe("grant-missing");
  });

  it("denies foreign grants issued to another extension", () => {
    const store = new V2SourceGrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = store.issue("library-gatherer-v2", "/media/inbox");
    const foreign = store.authorize(grant.grantId, "folder-janitor-v2");
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.reason).toBe("grant-foreign");
  });

  it("denies expired grants and prunes them", () => {
    let now = "2026-09-06T00:00:00.000Z";
    const store = new V2SourceGrantStore(() => now);
    const grant = store.issue("library-gatherer-v2", "/media/inbox", {
      expiresAt: "2026-09-06T01:00:00.000Z",
    });
    expect(store.authorize(grant.grantId, "library-gatherer-v2").ok).toBe(true);

    now = "2026-09-06T02:00:00.000Z";
    const expired = store.authorize(grant.grantId, "library-gatherer-v2");
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reason).toBe("grant-expired");
    expect(store.pruneExpired()).toBe(1);
    const pruned = store.authorize(grant.grantId, "library-gatherer-v2");
    expect(pruned.ok).toBe(false);
    if (!pruned.ok) expect(pruned.reason).toBe("grant-missing");
  });

  it("carries no token material in persisted grant records", () => {
    const store = new V2SourceGrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = store.issue("library-gatherer-v2", "/media/inbox");
    const serialized = JSON.parse(JSON.stringify(grant)) as Record<string, unknown>;
    const text = JSON.stringify(serialized).toLowerCase();
    expect(text).not.toContain("token");
    expect(text).not.toContain("secret");
    expect(Object.keys(serialized).sort()).toEqual(
      ["extensionId", "grantId", "grantedAt", "rootPath"],
    );
  });
});
