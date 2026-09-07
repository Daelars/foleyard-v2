import { describe, expect, it } from "vitest";

import {
  createGreeterFixtureDefinition,
  createV2InvocationId,
  ExtensionV2Registry,
  immediateV2Result,
  jobV2Result,
  resolveV2Ownership,
  reviewV2Result,
  V2_PAYLOAD_LIMITS,
} from "./index";

// Area: extension v2 R2 (#166). Canonical invocation/ownership contracts:
// unique invocation IDs, ownership resolved from the registry, typed
// failures that distinguish unknown/unowned owners, and serializable
// immediate/reviewed/job outcomes.

describe("createV2InvocationId", () => {
  it("mints unique vinv_ IDs usable as idempotency keys", () => {
    const ids = new Set(
      Array.from({ length: 200 }, () => createV2InvocationId()),
    );
    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(id.startsWith("vinv_")).toBe(true);
    }
  });
});

describe("resolveV2Ownership", () => {
  function registry() {
    const next = new ExtensionV2Registry();
    next.register(createGreeterFixtureDefinition());
    return next;
  }

  it("resolves a registered extension/command pair without side effects", () => {
    const ownership = resolveV2Ownership(
      registry(),
      "fixture-greeter",
      "fixture-greeter.greet",
    );
    expect(ownership.ok).toBe(true);
    if (ownership.ok) {
      expect(ownership.definition.id).toBe("fixture-greeter");
      expect(ownership.command.id).toBe("fixture-greeter.greet");
    }
  });

  it("reports unknown extensions distinctly from unknown commands", () => {
    const missingExtension = resolveV2Ownership(
      registry(),
      "no-such-extension",
      "fixture-greeter.greet",
    );
    expect(missingExtension.ok).toBe(false);
    if (!missingExtension.ok) {
      expect(missingExtension.failure.code).toBe("extension-unknown");
    }

    const missingCommand = resolveV2Ownership(
      registry(),
      "fixture-greeter",
      "fixture-greeter.missing",
    );
    expect(missingCommand.ok).toBe(false);
    if (!missingCommand.ok) {
      expect(missingCommand.failure.code).toBe("command-unknown");
    }
  });

  it("reports commands owned by another extension as unowned", () => {
    const next = new ExtensionV2Registry();
    next.register(createGreeterFixtureDefinition());
    next.register({
      id: "second-fixture",
      name: "Second",
      version: "0.1.0",
      apiVersion: 2,
      description: "Second conformance fixture.",
      permissions: [],
      commands: [
        {
          id: "second-fixture.other",
          title: "Other",
          description: "Other command.",
          scope: "global",
        },
      ],
    });

    const ownership = resolveV2Ownership(
      next,
      "fixture-greeter",
      "second-fixture.other",
    );
    expect(ownership.ok).toBe(false);
    if (!ownership.ok) {
      expect(ownership.failure.code).toBe("command-unowned");
      expect(ownership.failure.message).toMatch("second-fixture.other");
    }
  });
});

describe("v2 outcomes", () => {
  it("immediate, reviewed, and job results stay serializable", () => {
    const results = [
      immediateV2Result({ message: "hello" }),
      reviewV2Result("plan-1", "Confirm export", "2026-09-07T00:00:00.000Z"),
      jobV2Result("job-1", "queued"),
    ];
    for (const result of results) {
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
    expect(immediateV2Result(1).kind).toBe("immediate");
  });

  it("documents payload limits shared by direct and HTTP paths", () => {
    expect(V2_PAYLOAD_LIMITS.maxBodyBytes).toBeGreaterThan(
      V2_PAYLOAD_LIMITS.maxInputBytes,
    );
    expect(V2_PAYLOAD_LIMITS.maxFileIds).toBe(500);
  });
});
