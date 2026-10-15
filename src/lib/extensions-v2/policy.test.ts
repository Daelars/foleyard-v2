import { describe, expect, it, vi } from "vitest";

// Area: #266. Approval policy is durable and live. A failed write is
// reported instead of surfacing as success, a failed hydration is
// retryable instead of freezing the policy as loaded, and a revocation
// fails closed even when persistence fails.

const rows = new Map<string, unknown>();
let readShouldFail = false;
let writeShouldFail = false;

vi.mock("./settings-state", () => ({
  readV2SettingsRow: (key: string) => {
    if (readShouldFail) throw new Error("approvals read failed");
    return rows.get(key);
  },
  writeV2SettingsRow: (key: string, value: unknown) => {
    if (writeShouldFail) throw new Error("approvals write failed");
    rows.set(key, value);
  },
}));

import {
  getV2GrantedPermissions,
  revokeV2Approval,
  setV2Approval,
} from "./policy";
import { getV2PolicyHealth } from "./runtime";

describe("v2 approval durability", () => {
  it("retries hydration after a failed load instead of freezing policy as loaded", () => {
    rows.set("v2:approvals", {
      approvals: [
        {
          extensionId: "policy-retry",
          permissions: ["library:read"],
          grantedAt: "2026-10-15T00:00:00.000Z",
        },
      ],
    });
    readShouldFail = true;
    // Deny by default while the load fails.
    expect(getV2GrantedPermissions("policy-retry")).toEqual([]);
    // Storage recovers: the next call must retry, not stay permanently empty.
    readShouldFail = false;
    expect(getV2GrantedPermissions("policy-retry")).toEqual(["library:read"]);
  });

  it("reports a failed approval grant and leaves nothing granted", () => {
    writeShouldFail = true;
    expect(() => setV2Approval("policy-grant-fail", ["library:read"])).toThrow(
      /approvals write failed/,
    );
    writeShouldFail = false;
    expect(getV2GrantedPermissions("policy-grant-fail")).toEqual([]);
    expect(getV2PolicyHealth().degraded).toBe(true);
  });

  it("reports a failed revocation but still fails closed in memory", () => {
    setV2Approval("policy-revoke-fail", ["library:read"]);
    expect(getV2GrantedPermissions("policy-revoke-fail")).toEqual(["library:read"]);

    writeShouldFail = true;
    expect(() => revokeV2Approval("policy-revoke-fail")).toThrow(/approvals write failed/);
    writeShouldFail = false;
    // Even though the write failed, the revocation is not reported as
    // success and the effective set is empty (fail closed).
    expect(getV2GrantedPermissions("policy-revoke-fail")).toEqual([]);
  });
});
