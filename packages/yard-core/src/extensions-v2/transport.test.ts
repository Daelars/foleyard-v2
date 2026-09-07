import { describe, expect, it } from "vitest";

import {
  createGreeterFixtureDefinition,
  decodeV2ExecuteBody,
  encodeV2Result,
  ExtensionV2Host,
  ExtensionV2Registry,
  handleV2HttpAvailability,
  handleV2HttpExecute,
  immediateV2Result,
  jobV2Result,
  V2_FAILURE_STATUS,
  V2_PAYLOAD_LIMITS,
  V2_ROUTES,
  type V2ExecuteRequest,
  type V2ExecutionResult,
  type V2HostServices,
} from "./index";
import { audioFile, libraryPorts } from "./test-helpers";

// Area: extension v2 R2 (#166). Single-path transport: direct-host and
// HTTP behavior agree on every scenario, invalid contexts and unknown
// capabilities fail with documented statuses, and payload limits and
// error envelopes hold on both paths.

function services(overrides?: Partial<V2HostServices>): V2HostServices {
  const registry = new ExtensionV2Registry();
  registry.register(createGreeterFixtureDefinition());
  return {
    registry,
    isEnabled: () => true,
    capabilities: new Set<string>(),
    grantedPermissions: () => ["library:read"],
    ports: libraryPorts([audioFile("a")]),
    ...overrides,
  };
}

function hostWithGreeter(next: V2HostServices) {
  const host = new ExtensionV2Host(next);
  host.registerHandler("fixture-greeter", "fixture-greeter.greet", (context) => {
    const name = (context.invocation.input as { name: string }).name;
    return immediateV2Result({ message: `hello ${name}` });
  });
  return host;
}

function granted(next: V2HostServices) {
  return {
    isEnabled: (id: string) => next.isEnabled(id),
    capabilities: next.capabilities,
    grantedPermissions: (id: string) => next.grantedPermissions(id),
  };
}

describe("v2 route names and status map", () => {
  it("documents distinct v2 routes beside compatible v1 endpoints", () => {
    expect(V2_ROUTES.execute).toBe("/api/extensions-v2/execute");
    expect(V2_ROUTES.availability).toBe("/api/extensions-v2/availability");
    expect(V2_ROUTES.catalog).toBe("/api/extensions-v2");
    for (const route of Object.values(V2_ROUTES)) {
      expect(route.startsWith("/api/extensions-v2")).toBe(true);
    }
  });

  it("documents a status for every failure code", () => {
    expect(V2_FAILURE_STATUS["extension-unknown"]).toBe(404);
    expect(V2_FAILURE_STATUS["command-unknown"]).toBe(404);
    expect(V2_FAILURE_STATUS["selection-unresolvable"]).toBe(404);
    expect(V2_FAILURE_STATUS["extension-disabled"]).toBe(403);
    expect(V2_FAILURE_STATUS["permission-denied"]).toBe(403);
    expect(V2_FAILURE_STATUS["input-invalid"]).toBe(400);
    expect(V2_FAILURE_STATUS["selection-invalid"]).toBe(400);
    expect(V2_FAILURE_STATUS["context-unsupported"]).toBe(400);
    expect(V2_FAILURE_STATUS["capability-unavailable"]).toBe(400);
    expect(V2_FAILURE_STATUS["payload-too-large"]).toBe(413);
    expect(V2_FAILURE_STATUS["handler-failed"]).toBe(500);
    expect(V2_FAILURE_STATUS["result-invalid"]).toBe(500);
  });

  it("encodes jobs as 202 and immediate outcomes as 200", () => {
    const immediate: V2ExecutionResult = {
      ok: true,
      outcome: { kind: "immediate", invocationId: "vinv_1", value: 1 },
    };
    expect(encodeV2Result(immediate).status).toBe(200);
    const job: V2ExecutionResult = {
      ok: true,
      outcome: { kind: "job", invocationId: "vinv_1", jobId: "job-1", state: "queued" },
    };
    expect(encodeV2Result(job).status).toBe(202);
    expect(encodeV2Result(job).body).toEqual({ ok: true, outcome: job.outcome });
  });

  it("wraps failures in the documented error envelope", () => {
    const failure: V2ExecutionResult = {
      ok: false,
      code: "command-unknown",
      message: "Nope.",
      invocationId: "vinv_9",
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.missing",
    };
    const encoded = encodeV2Result(failure);
    expect(encoded.status).toBe(404);
    expect(encoded.body).toEqual({
      ok: false,
      error: {
        code: "command-unknown",
        message: "Nope.",
        invocationId: "vinv_9",
        extensionId: "fixture-greeter",
        commandId: "fixture-greeter.missing",
      },
    });
  });
});

describe("direct and HTTP agreement", () => {
  const scenarios: Array<{
    name: string;
    body: Record<string, unknown>;
    tweak?: (next: V2HostServices) => V2HostServices;
    expectCode?: string;
    expectKind?: string;
  }> = [
    {
      name: "success",
      body: {
        extensionId: "fixture-greeter",
        commandId: "fixture-greeter.greet",
        input: { name: "Ada" },
        selection: { fileIds: ["a"] },
      },
      expectKind: "immediate",
    },
    {
      name: "unknown extension",
      body: { extensionId: "nope", commandId: "nope.cmd" },
      expectCode: "extension-unknown",
    },
    {
      name: "unknown command",
      body: { extensionId: "fixture-greeter", commandId: "fixture-greeter.missing" },
      expectCode: "command-unknown",
    },
    {
      name: "unowned command",
      body: { extensionId: "fixture-greeter", commandId: "second-fixture.other" },
      expectCode: "command-unknown",
    },
    {
      name: "disabled extension",
      body: {
        extensionId: "fixture-greeter",
        commandId: "fixture-greeter.greet",
        input: { name: "Ada" },
        selection: { fileIds: ["a"] },
      },
      tweak: (next) => ({ ...next, isEnabled: () => false }),
      expectCode: "extension-disabled",
    },
    {
      name: "invalid input",
      body: {
        extensionId: "fixture-greeter",
        commandId: "fixture-greeter.greet",
        input: { name: "Ada", greeting: "yo" },
        selection: { fileIds: ["a"] },
      },
      expectCode: "input-invalid",
    },
    {
      name: "empty required selection",
      body: {
        extensionId: "fixture-greeter",
        commandId: "fixture-greeter.greet",
        input: { name: "Ada" },
        selection: { fileIds: [] },
      },
      expectCode: "selection-empty",
    },
    {
      name: "unresolvable selection",
      body: {
        extensionId: "fixture-greeter",
        commandId: "fixture-greeter.greet",
        input: { name: "Ada" },
        selection: { fileIds: ["missing"] },
      },
      expectCode: "selection-unresolvable",
    },
    {
      name: "client file path rejected",
      body: {
        extensionId: "fixture-greeter",
        commandId: "fixture-greeter.greet",
        input: { name: "Ada" },
        selection: { paths: ["/library/a.mp3"] },
      },
      expectCode: "selection-invalid",
    },
    {
      name: "denied permission",
      body: {
        extensionId: "fixture-greeter",
        commandId: "fixture-greeter.greet",
        input: { name: "Ada" },
        selection: { fileIds: ["a"] },
      },
      tweak: (next) => ({ ...next, grantedPermissions: () => [] as string[] }),
      expectCode: "permission-denied",
    },
  ];

  for (const scenario of scenarios) {
    it(`agrees on ${scenario.name}`, async () => {
      const next = scenario.tweak ? scenario.tweak(services()) : services();
      const host = hostWithGreeter(next);

      const decoded = decodeV2ExecuteBody(scenario.body);
      if (!decoded.ok) {
        // Boundary rejections (e.g. client file paths) fail identically on
        // the direct path: decode first, then compare the same failure.
        const direct = await host.execute(scenario.body as unknown as V2ExecuteRequest);
        expect(direct.ok).toBe(false);
        if (!direct.ok) {
          expect(direct.code).toBe(scenario.expectCode);
          expect(decoded.response.status).toBe(V2_FAILURE_STATUS[direct.code]);
          expect(decoded.response.body).toEqual({
            ok: false,
            error: expect.objectContaining({ code: scenario.expectCode }),
          });
        }
        return;
      }
      const direct = await host.execute(decoded.request as V2ExecuteRequest);
      const http = await handleV2HttpExecute(host, scenario.body);

      if (scenario.expectKind) {
        expect(direct.ok).toBe(true);
        if (direct.ok && http.body !== null && typeof http.body === "object") {
          const outcome = (http.body as { outcome: { kind: string } }).outcome;
          expect(outcome.kind).toBe(scenario.expectKind);
          expect(http.status).toBe(200);
        } else {
          throw new Error(`Expected success for ${scenario.name}`);
        }
        return;
      }

      expect(direct.ok).toBe(false);
      if (!direct.ok) {
        expect(direct.code).toBe(scenario.expectCode);
        expect(http.status).toBe(V2_FAILURE_STATUS[direct.code]);
        expect(http.body).toEqual({
          ok: false,
          error: expect.objectContaining({ code: scenario.expectCode }),
        });
      }
    });
  }

  it("agrees on unknown capabilities with the documented status", async () => {
    const registry = new ExtensionV2Registry();
    registry.register({
      ...createGreeterFixtureDefinition(),
      commands: [
        {
          ...createGreeterFixtureDefinition().commands[0]!,
          requiredCapabilities: ["desktop:reveal-native"],
        },
      ],
    });
    const next: V2HostServices = {
      ...services(),
      registry,
      capabilities: new Set<string>(),
    };
    const host = hostWithGreeter(next);
    const body = {
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
    };
    const direct = await host.execute(body);
    expect(direct.ok).toBe(false);
    if (!direct.ok) {
      expect(direct.code).toBe("capability-unavailable");
      expect(direct.message).toMatch("desktop:reveal-native");
    }
    const http = await handleV2HttpExecute(host, body);
    expect(http.status).toBe(400);
    expect(http.body).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "capability-unavailable" }),
    });
  });
});

describe("payload limits and envelopes", () => {
  it("rejects oversized envelopes and inputs with 413 on the HTTP path", async () => {
    const host = hostWithGreeter(services());
    const bigInput = "x".repeat(V2_PAYLOAD_LIMITS.maxInputBytes + 1);
    const input = await handleV2HttpExecute(host, {
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: bigInput },
      selection: { fileIds: ["a"] },
    });
    expect(input.status).toBe(413);

    const tooMany = await handleV2HttpExecute(host, {
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: {
        fileIds: Array.from({ length: V2_PAYLOAD_LIMITS.maxFileIds + 1 }, (_, index) => `id-${index}`),
      },
    });
    expect(tooMany.status).toBe(413);
  });

  it("rejects malformed envelopes with 400", async () => {
    const host = hostWithGreeter(services());
    for (const raw of ["nope", 7, [], {}, { extensionId: " ", commandId: "x" }]) {
      const response = await handleV2HttpExecute(host, raw);
      expect(response.status).toBe(400);
    }
  });
});

describe("handleV2HttpAvailability", () => {
  it("reports availability without executing commands", () => {
    const next = services();
    const ok = handleV2HttpAvailability(next.registry, granted(next), {
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      fileIds: ["a"],
      input: { name: "Ada" },
    });
    expect(ok).toEqual({
      status: 200,
      body: {
        ok: true,
        available: true,
        extensionId: "fixture-greeter",
        commandId: "fixture-greeter.greet",
      },
    });

    const denied = handleV2HttpAvailability(next.registry, granted(next), {
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      fileIds: [],
      input: { name: "Ada" },
    });
    expect(denied.status).toBe(200);
    expect(denied.body).toEqual(
      expect.objectContaining({ ok: true, available: false, code: "selection-required" }),
    );

    const unknown = handleV2HttpAvailability(next.registry, granted(next), {
      extensionId: "nope",
      commandId: "nope.cmd",
    });
    expect(unknown.status).toBe(404);
  });

  it("surfaces unknown capabilities to renderers with reasons", () => {
    const registry = new ExtensionV2Registry();
    registry.register({
      ...createGreeterFixtureDefinition(),
      commands: [
        {
          ...createGreeterFixtureDefinition().commands[0]!,
          requiredCapabilities: ["mystery-cap"],
        },
      ],
    });
    const next = services({ registry });
    const response = handleV2HttpAvailability(next.registry, granted(next), {
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      fileIds: ["a"],
    });
    expect(response.body).toEqual(
      expect.objectContaining({
        available: false,
        code: "capability-unavailable",
        reason: expect.stringContaining("mystery-cap"),
      }),
    );
  });
});

describe("job outcomes over HTTP", () => {
  it("returns 202 with the job outcome", async () => {
    const next = services();
    const host = new ExtensionV2Host(next);
    host.registerHandler("fixture-greeter", "fixture-greeter.greet", () =>
      jobV2Result("job-1", "queued"),
    );
    const response = await handleV2HttpExecute(host, {
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
    });
    expect(response.status).toBe(202);
  });
});
