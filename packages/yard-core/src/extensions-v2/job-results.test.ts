import { describe, expect, it } from "vitest";

import {
  assertNoV2Secrets,
  ExtensionV2Host,
  ExtensionV2Registry,
  handleV2HttpJobGet,
  handleV2HttpJobList,
  handleV2HttpJobSubmit,
  immediateV2Result,
  V2_EXTENSION_API_VERSION,
  V2_JOB_DIAGNOSTIC_MAX_CHARS,
  V2_JOB_RESULT_MAX_ITEMS,
  V2_JOB_RESULT_MAX_STRING,
  type ExtensionV2Definition,
  type ExtensionV2ValueSchema,
  type V2CommandHandler,
  type V2HostServices,
  type V2JobRecord,
} from "./index";
import { libraryPorts } from "./test-helpers";

// Area: extension v2 R4 (#279). The terminal summary is a contract: a
// succeeded job returns its declared result through the polling route,
// bounded by the declared schema and capped even when the schema is not;
// failed and cancelled jobs return bounded, redacted diagnostics; and the
// persisted snapshot never carries the handler value, grants, secrets, or
// private host paths. The raw handler value stays memory-only.

const EXTENSION_ID = "fixture-results";
const RUN = "fixture-results.run";
const CANCEL = "fixture-results.cancel";

function summarySchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      summary: { kind: "string" },
      copied: { kind: "number", integer: true, min: 0 },
      names: { kind: "string-array" },
    },
    required: ["summary", "copied", "names"],
  };
}

function blobSchema(): ExtensionV2ValueSchema {
  return { kind: "object", properties: { blob: { kind: "string-array" } }, required: ["blob"] };
}

function messageSchema(): ExtensionV2ValueSchema {
  return { kind: "object", properties: { message: { kind: "string" } }, required: ["message"] };
}

function definition(result: ExtensionV2ValueSchema): ExtensionV2Definition {
  return {
    id: EXTENSION_ID,
    name: "Results Fixture",
    version: "1.0.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description: "Exercise bounded, schema-shaped terminal job results.",
    permissions: ["library:read"],
    commands: [
      { id: RUN, title: "Run", description: "Run work.", scope: "global", result },
      { id: CANCEL, title: "Cancel", description: "Cancel work.", scope: "global", result },
    ],
  };
}

function services(registry: ExtensionV2Registry): V2HostServices {
  return {
    registry,
    isEnabled: () => true,
    capabilities: {},
    grantedPermissions: () => ["library:read"],
    ports: libraryPorts([]),
  };
}

function makeHost(
  result: ExtensionV2ValueSchema,
  handler: V2CommandHandler,
): ExtensionV2Host {
  const registry = new ExtensionV2Registry();
  registry.register(definition(result));
  const host = new ExtensionV2Host(services(registry));
  host.registerHandler(EXTENSION_ID, RUN, handler);
  host.registerHandler(EXTENSION_ID, CANCEL, handler);
  return host;
}

async function submit(host: ExtensionV2Host, commandId = RUN): Promise<string> {
  const response = await handleV2HttpJobSubmit(host, {
    extensionId: EXTENSION_ID,
    commandId,
    selection: { fileIds: [] },
  });
  expect(response.status).toBe(202);
  const jobId = (response.body as { outcome: { jobId: string } }).outcome.jobId;
  await host.jobs.waitFor(jobId);
  return jobId;
}

function polledJob(host: ExtensionV2Host, jobId: string): V2JobRecord {
  const response = handleV2HttpJobGet(host.jobs, jobId);
  expect(response.status).toBe(200);
  return (response.body as { job: V2JobRecord }).job;
}

describe("v2 job terminal results", () => {
  it("returns the declared safe result through the polling route", async () => {
    const host = makeHost(summarySchema(), () =>
      immediateV2Result({
        summary: "x".repeat(5000),
        copied: 3,
        names: Array.from({ length: 300 }, (_, index) => `name-${index}`),
        // Undeclared, handler-internal fields must never cross the boundary.
        grantToken: "token-should-not-leak",
        internalPath: "D:\\private\\client-project\\secret.wav",
      }),
    );
    const jobId = await submit(host);

    const job = polledJob(host, jobId);
    expect(job.state).toBe("succeeded");
    // The raw handler value is memory-only; only the bounded projection travels.
    expect(job.value).toBeUndefined();
    expect(job.result?.diagnostic).toBeUndefined();
    expect(job.result?.value).toEqual({
      summary: "x".repeat(V2_JOB_RESULT_MAX_STRING),
      copied: 3,
      names: Array.from({ length: V2_JOB_RESULT_MAX_ITEMS }, (_, index) => `name-${index}`),
    });
    const serialized = JSON.stringify(job);
    expect(serialized).not.toContain("token-should-not-leak");
    expect(serialized).not.toContain("grantToken");
    expect(serialized).not.toContain("client-project");
    expect(serialized).not.toContain("internalPath");
  });

  it("caps a declared value even when the schema states no bounds", async () => {
    const host = makeHost(summarySchema(), () =>
      immediateV2Result({
        summary: "s".repeat(100_000),
        copied: 0,
        names: Array.from({ length: 9_000 }, (_, index) => `n${index}`),
      }),
    );
    const job = polledJob(host, await submit(host));
    const value = job.result?.value as { summary: string; names: string[] };
    expect(value.summary).toHaveLength(V2_JOB_RESULT_MAX_STRING);
    expect(value.names).toHaveLength(V2_JOB_RESULT_MAX_ITEMS);
    expect(JSON.stringify(job).length).toBeLessThanOrEqual(64 * 1024);
  });

  it("omits a declared value whose bounded projection is still oversized", async () => {
    const host = makeHost(blobSchema(), () =>
      immediateV2Result({ blob: Array.from({ length: 200 }, () => "y".repeat(1024)) }),
    );
    const job = polledJob(host, await submit(host));
    expect(job.state).toBe("succeeded");
    expect(job.result).toMatchObject({ valueOmitted: true });
    expect(job.result?.value).toBeUndefined();
  });

  it("fails an invalid handler result before it reaches transport", async () => {
    const host = makeHost(messageSchema(), () => immediateV2Result({ message: 42 }));
    const job = polledJob(host, await submit(host));
    expect(job.state).toBe("failed");
    expect(job.error?.code).toBe("result-invalid");
    expect(job.result?.value).toBeUndefined();
    expect(job.result?.diagnostic?.code).toBe("result-invalid");
  });

  it("returns bounded, redacted diagnostics for a failed job", async () => {
    const host = makeHost(messageSchema(), () => {
      throw new Error(
        `Cannot copy C:\\Users\\someone\\private-client\\secret.wav: ENOENT ${"detail ".repeat(400)}`,
      );
    });
    const job = polledJob(host, await submit(host));
    expect(job.state).toBe("failed");
    const diagnostic = job.result?.diagnostic;
    expect(diagnostic?.code).toBe("handler-failed");
    expect(diagnostic!.message.length).toBeLessThanOrEqual(V2_JOB_DIAGNOSTIC_MAX_CHARS);
    expect(diagnostic!.message).not.toContain("private-client");
    expect(diagnostic!.message).not.toContain("C:\\Users");
    expect(job.error!.message.length).toBeLessThanOrEqual(V2_JOB_DIAGNOSTIC_MAX_CHARS);
    expect(JSON.stringify(job)).not.toContain("private-client");
    // No stack frames cross the boundary.
    expect(JSON.stringify(job)).not.toMatch(/\\n\s+at /);
  });

  it("returns bounded, redacted diagnostics for a cancelled job", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const host = makeHost(messageSchema(), async (context) => {
      await gate;
      context.operations.jobs.throwIfCancelled();
      return immediateV2Result({ message: "unreachable" });
    });
    const submitted = await handleV2HttpJobSubmit(host, {
      extensionId: EXTENSION_ID,
      commandId: RUN,
      selection: { fileIds: [] },
    });
    const jobId = (submitted.body as { outcome: { jobId: string } }).outcome.jobId;
    await new Promise((resolve) => setTimeout(resolve, 0));
    host.jobs.requestCancel(jobId);
    release();
    await host.jobs.waitFor(jobId);

    const job = polledJob(host, jobId);
    expect(job.state).toBe("cancelled");
    expect(job.result?.diagnostic?.code).toBe("job-cancelled");
    expect(job.result!.diagnostic!.message.length).toBeLessThanOrEqual(
      V2_JOB_DIAGNOSTIC_MAX_CHARS,
    );
  });

  it("includes the terminal result in the bounded history list", async () => {
    const host = makeHost(messageSchema(), () => immediateV2Result({ message: "done" }));
    const jobId = await submit(host);
    const response = handleV2HttpJobList(host.jobs, { limit: 10 });
    expect(response.status).toBe(200);
    const listed = (response.body as { jobs: V2JobRecord[] }).jobs.find(
      (job) => job.jobId === jobId,
    );
    expect(listed?.result?.value).toEqual({ message: "done" });
    expect(listed?.value).toBeUndefined();
  });

  it("snapshots carry no handler value, grants, secrets, or private paths", async () => {
    const host = makeHost(summarySchema(), () =>
      immediateV2Result({
        summary: "D:\\clients\\private-client\\secret-project\\kick.wav",
        copied: 1,
        names: ["/private/source/library/kick.wav"],
        grantToken: "snapshot-token-should-not-leak",
      }),
    );
    const jobId = await submit(host);
    const snapshot = host.jobs.snapshot();
    assertNoV2Secrets(snapshot, "job snapshot");

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("snapshot-token-should-not-leak");
    expect(serialized).not.toContain("private-client");
    expect(serialized).not.toContain("/private/source");
    const entry = snapshot.jobs.find((job) => job.jobId === jobId)!;
    expect(entry.value).toBeUndefined();
    expect(entry.result).toBeUndefined();
  });

  it("persists only redacted failure diagnostics", async () => {
    const host = makeHost(messageSchema(), () => {
      throw new Error("Write failed at /home/private-client/sounds/secret.wav: EACCES");
    });
    const jobId = await submit(host);
    const snapshot = host.jobs.snapshot();
    const entry = snapshot.jobs.find((job) => job.jobId === jobId)!;
    expect(JSON.stringify(entry)).not.toContain("/home/private-client");
    expect(entry.error?.message.length).toBeLessThanOrEqual(V2_JOB_DIAGNOSTIC_MAX_CHARS);
    // The job still restores with its terminal state intact.
    const restarted = new ExtensionV2Host(services(new ExtensionV2Registry()));
    restarted.jobs.restoreSnapshot(snapshot);
    expect(restarted.jobs.getJob(jobId)?.state).toBe("failed");
  });
});
