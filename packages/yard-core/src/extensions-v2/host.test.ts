import { describe, expect, it, vi } from "vitest";

import {
  createGreeterFixtureDefinition,
  ExtensionV2Host,
  ExtensionV2Registry,
  immediateV2Result,
  jobV2Result,
  reviewV2Result,
  type V2HostServices,
} from "./index";
import { audioFile, libraryPorts } from "./test-helpers";

// Area: extension v2 R2 (#166). One execution path: ownership resolves
// before expensive hydration, the shared evaluator is rechecked at
// execution start, and handlers run constrained with typed outcomes.

function services(overrides?: Partial<V2HostServices>): V2HostServices {
  const registry = new ExtensionV2Registry();
  registry.register(createGreeterFixtureDefinition());
  return {
    registry,
    isEnabled: () => true,
    capabilities: new Set<string>(),
    grantedPermissions: () => ["library:read"],
    ports: libraryPorts([audioFile("a"), audioFile("b")]),
    ...overrides,
  };
}

function greetHost(next: V2HostServices) {
  const host = new ExtensionV2Host(next);
  host.registerHandler("fixture-greeter", "fixture-greeter.greet", (context) => {
    const name = (context.invocation.input as { name: string }).name;
    return immediateV2Result({ message: `hello ${name}` });
  });
  return host;
}

describe("ExtensionV2Host.execute", () => {
  it("runs the fixture greet command end to end with authorized records", async () => {
    const host = greetHost(services());
    const result = await host.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada", greeting: "hello" },
      selection: { fileIds: ["a", "b"] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome.kind).toBe("immediate");
      expect(result.outcome.invocationId.startsWith("vinv_")).toBe(true);
      if (result.outcome.kind === "immediate") {
        expect(result.outcome.value).toEqual({ message: "hello Ada" });
      }
    }
  });

  it("resolves ownership before expensive hydration", async () => {
    const ports = libraryPorts([audioFile("a")]);
    const getFilesByIds = vi.spyOn(ports, "getFilesByIds");
    const host = new ExtensionV2Host(services({ ports }));

    const unknownCommand = await host.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.missing",
      selection: { fileIds: ["a"] },
    });
    expect(unknownCommand.ok).toBe(false);
    if (!unknownCommand.ok) expect(unknownCommand.code).toBe("command-unknown");
    expect(getFilesByIds).not.toHaveBeenCalled();

    const unknownExtension = await host.execute({
      extensionId: "nope",
      commandId: "nope.cmd",
      selection: { fileIds: ["a"] },
    });
    expect(unknownExtension.ok).toBe(false);
    if (!unknownExtension.ok) expect(unknownExtension.code).toBe("extension-unknown");
    expect(getFilesByIds).not.toHaveBeenCalled();
  });

  it("rechecks availability at execution start", async () => {
    const next = services({ capabilities: new Set<string>() });
    const host = greetHost(next);
    const result = await host.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: [] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("selection-empty");

    const disabled = new ExtensionV2Host(services({ isEnabled: () => false }));
    const denied = await disabled.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("extension-disabled");
  });

  it("fails invalid input, unresolvable selections, and denied permissions", async () => {
    const host = greetHost(services());
    const invalid = await host.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada", greeting: "yo" },
      selection: { fileIds: ["a"] },
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.code).toBe("input-invalid");

    const unresolvable = await host.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["missing"] },
    });
    expect(unresolvable.ok).toBe(false);
    if (!unresolvable.ok) expect(unresolvable.code).toBe("selection-unresolvable");

    const ungranted = greetHost(services({ grantedPermissions: () => [] }));
    const denied = await ungranted.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("permission-denied");
  });

  it("reports missing handlers, handler failures, and invalid results", async () => {
    const bare = new ExtensionV2Host(services());
    const missing = await bare.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("handler-missing");

    const failing = new ExtensionV2Host(services());
    failing.registerHandler("fixture-greeter", "fixture-greeter.greet", () => {
      throw new Error("boom");
    });
    const failed = await failing.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
    });
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.code).toBe("handler-failed");
      expect(failed.message).toMatch("boom");
    }

    const wrong = new ExtensionV2Host(services());
    wrong.registerHandler("fixture-greeter", "fixture-greeter.greet", () =>
      immediateV2Result({ unexpected: 1 }),
    );
    const invalid = await wrong.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.code).toBe("result-invalid");
  });

  it("passes reviewed and job outcomes through with the invocation ID", async () => {
    const reviewed = new ExtensionV2Host(services());
    reviewed.registerHandler("fixture-greeter", "fixture-greeter.greet", (context) => {
      // Only host-bound plans pass execute: the ID comes from
      // operations.plans.prepare, never from a handler string.
      const prepared = context.operations.plans.prepare({
        targets: { fileIds: ["a"] },
        options: { name: "Ada" },
        preview: {
          summary: "Greet Ada",
          tables: [],
          notices: [],
          reversibility: "reversible-app-change",
          reversibilityNote: "No effects.",
        },
      });
      return reviewV2Result(prepared.planId, "stale summary", "2000-01-01T00:00:00.000Z");
    });
    const review = await reviewed.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
    });
    expect(review.ok).toBe(true);
    if (review.ok) {
      expect(review.outcome.kind).toBe("review-required");
      if (review.outcome.kind === "review-required") {
        expect(review.outcome.planId.startsWith("vplan_")).toBe(true);
        // Stored record values win over handler-supplied strings.
        expect(review.outcome.summary).toBe("Greet Ada");
        expect(review.outcome.expiresAt).not.toBe("2000-01-01T00:00:00.000Z");
      }
    }

    const forging = new ExtensionV2Host(services());
    forging.registerHandler("fixture-greeter", "fixture-greeter.greet", () =>
      reviewV2Result("vplan_forged", "Forged", "2026-09-07T00:00:00.000Z"),
    );
    const forged = await forging.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
    });
    expect(forged.ok).toBe(false);
    if (!forged.ok) expect(forged.code).toBe("result-invalid");

    const jobs = new ExtensionV2Host(services());
    jobs.registerHandler("fixture-greeter", "fixture-greeter.greet", () =>
      jobV2Result("job-1", "queued"),
    );
    const job = await jobs.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
    });
    expect(job.ok).toBe(true);
    if (job.ok) expect(job.outcome.kind).toBe("job");
  });

  it("refuses handler registration without registry ownership", () => {
    const host = new ExtensionV2Host(services());
    expect(() =>
      host.registerHandler("fixture-greeter", "someone-else.cmd", async () => immediateV2Result(null)),
    ).toThrow();
  });

  it("tells handlers how they were reached (direct vs job run mode)", async () => {
    const seen: string[] = [];
    const host = new ExtensionV2Host(services());
    host.registerHandler("fixture-greeter", "fixture-greeter.greet", (context) => {
      seen.push(context.runMode);
      return immediateV2Result({ message: "hi" });
    });
    await host.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
    });
    const submitted = await host.submitJob({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
    });
    expect(submitted.ok).toBe(true);
    if (submitted.ok && submitted.outcome.kind === "job") {
      await host.jobs.waitFor(submitted.outcome.jobId);
    }
    expect(seen).toEqual(["direct", "job"]);
  });
});
