import {
  evaluateV2Availability,
  type V2AvailabilityContext,
} from "./availability";
import {
  resolveV2Ownership,
  V2_PAYLOAD_LIMITS,
  type V2ExecuteRequest,
  type V2ExecutionResult,
  type V2Failure,
  type V2FailureCode,
} from "./invocation";
import {
  persistedV2JobRecord,
  sanitizeV2IdempotencyKey,
  type V2JobRecord,
  type V2JobStatusReader,
} from "./jobs";
import { parseV2SelectionSnapshot } from "./selection";
import type { ExtensionV2Registry } from "./registry";
import type { ExtensionV2Host } from "./host";

export { V2_PAYLOAD_LIMITS };

/**
 * Single-path v2 transport contract (Yard Core context, R2).
 *
 * v1 endpoints under `src/app/api/extensions/*` stay compatible and are
 * never routed through here. v2 uses its own route names below; the
 * framework-free codec in this module maps requests to outcomes and
 * outcomes to statuses, so direct invocation and HTTP agree by
 * construction. Thin Next route wrappers (a later ticket) only forward
 * to `handleV2HttpExecute` / `handleV2HttpAvailability`.
 *
 * Route names:
 * - `GET /api/extensions-v2` — serializable catalog (`buildCatalog`).
 * - `GET /api/extensions-v2/availability` — availability with reasons.
 * - `POST /api/extensions-v2/execute` — invoke a command.
 * - `GET /api/extensions-v2/plans/{planId}` — review a prepared plan (R5).
 * - `POST /api/extensions-v2/plans/{planId}/apply` — apply a reviewed plan (R5).
 * - `POST /api/extensions-v2/jobs` — start host-owned job work (R4).
 * - `GET /api/extensions-v2/jobs` — poll job history (newest first).
 * - `GET /api/extensions-v2/jobs/{jobId}` — poll one job's status.
 * - `POST /api/extensions-v2/jobs/{jobId}/cancel` — request cancellation.
 *
 * Job status travels over stateless polling: the record lives in the
 * host's job manager, never in request scope, so a request ending, a
 * reconnect, or a renderer reload only means polling again with the
 * same job ID.
 *
 * Status mappings:
 * - 200 immediate results and reviewed interaction; 202 accepted jobs.
 * - 400 invalid input/selection/context/capability payloads.
 * - 403 disabled extensions and denied permissions.
 * - 404 unknown extensions/commands, unresolvable selections, unknown jobs.
 * - 413 envelopes or inputs over the payload limits.
 * - 500 missing handlers, handler failures, invalid handler results.
 *
 * Error envelope: `{ ok: false, error: { code, message,
 * invocationId?, extensionId?, commandId? } }`. Detailed internals
 * (stacks, paths, tokens) never leave the host; messages stay actionable.
 */

export const V2_ROUTES = {
  catalog: "/api/extensions-v2",
  availability: "/api/extensions-v2/availability",
  execute: "/api/extensions-v2/execute",
  plans: "/api/extensions-v2/plans",
  jobs: "/api/extensions-v2/jobs",
} as const;

/** Review route for one plan. */
export function v2PlanRoute(planId: string): string {
  return `${V2_ROUTES.plans}/${planId}`;
}

/** Apply route for one plan. */
export function v2PlanApplyRoute(planId: string): string {
  return `${V2_ROUTES.plans}/${planId}/apply`;
}

/** Job polling routes derived from a job ID. */
export function v2JobStatusRoute(jobId: string): string {
  return `${V2_ROUTES.jobs}/${jobId}`;
}

export function v2JobCancelRoute(jobId: string): string {
  return `${V2_ROUTES.jobs}/${jobId}/cancel`;
}

export const V2_FAILURE_STATUS: Record<V2FailureCode, number> = {
  "extension-unknown": 404,
  "command-unknown": 404,
  "command-unowned": 400,
  "extension-disabled": 403,
  "input-invalid": 400,
  "selection-invalid": 400,
  "selection-empty": 400,
  "selection-unresolvable": 404,
  "context-unsupported": 400,
  "capability-unavailable": 400,
  "permission-denied": 403,
  "payload-too-large": 413,
  "handler-missing": 500,
  "handler-failed": 500,
  "result-invalid": 500,
  "job-unknown": 404,
  "plan-unknown": 404,
  "plan-expired": 400,
  "plan-altered": 400,
  "plan-consumed": 400,
  "review-required": 400,
};

export type V2ErrorBody = {
  ok: false;
  error: {
    code: V2FailureCode;
    message: string;
    invocationId?: string;
    extensionId?: string;
    commandId?: string;
  };
};

export type V2HttpResponse = {
  status: number;
  body: unknown;
};

export function encodeV2Failure(failure: V2Failure): V2HttpResponse {
  const error: V2ErrorBody["error"] = {
    code: failure.code,
    message: failure.message,
  };
  if (failure.invocationId !== undefined) error.invocationId = failure.invocationId;
  if (failure.extensionId !== undefined) error.extensionId = failure.extensionId;
  if (failure.commandId !== undefined) error.commandId = failure.commandId;
  return { status: V2_FAILURE_STATUS[failure.code], body: { ok: false, error } };
}

export function encodeV2Result(result: V2ExecutionResult): V2HttpResponse {
  if (!result.ok) return encodeV2Failure(result);
  if (result.outcome.kind === "job") {
    return { status: 202, body: { ok: true, outcome: result.outcome } };
  }
  return { status: 200, body: { ok: true, outcome: result.outcome } };
}

function envelopeFailure(code: V2FailureCode, message: string): V2HttpResponse {
  return encodeV2Failure({ ok: false, code, message });
}

/**
 * Validate an untrusted HTTP execute envelope without touching the
 * registry: shape, envelope size, selection shape. Ownership and deeper
 * checks stay on the single execution path.
 */
export function decodeV2ExecuteBody(raw: unknown): (
  | { ok: true; request: V2ExecuteRequest }
  | { ok: false; response: V2HttpResponse }
) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, response: envelopeFailure("input-invalid", "Request body must be a JSON object.") };
  }
  let size = 0;
  try {
    size = JSON.stringify(raw)?.length ?? 0;
  } catch {
    return { ok: false, response: envelopeFailure("input-invalid", "Request body must be serializable JSON.") };
  }
  if (size > V2_PAYLOAD_LIMITS.maxBodyBytes) {
    return {
      ok: false,
      response: envelopeFailure(
        "payload-too-large",
        `Request body is ${size} bytes; the limit is ${V2_PAYLOAD_LIMITS.maxBodyBytes}. Send a smaller payload.`,
      ),
    };
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.extensionId !== "string" || !record.extensionId.trim()) {
    return { ok: false, response: envelopeFailure("input-invalid", "extensionId must be a non-empty string.") };
  }
  if (typeof record.commandId !== "string" || !record.commandId.trim()) {
    return { ok: false, response: envelopeFailure("input-invalid", "commandId must be a non-empty string.") };
  }
  if (record.selection !== undefined) {
    const parsed = parseV2SelectionSnapshot(record.selection);
    if (!parsed.ok) {
      return { ok: false, response: encodeV2Failure(parsed.failure) };
    }
  }
  if (record.input !== undefined) {
    let inputSize = 0;
    try {
      inputSize = JSON.stringify(record.input)?.length ?? 0;
    } catch {
      return { ok: false, response: envelopeFailure("input-invalid", "Input must be serializable JSON.") };
    }
    if (inputSize > V2_PAYLOAD_LIMITS.maxInputBytes) {
      return {
        ok: false,
        response: envelopeFailure(
          "payload-too-large",
          `Input payload is ${inputSize} bytes; the limit is ${V2_PAYLOAD_LIMITS.maxInputBytes}. Send a smaller payload.`,
        ),
      };
    }
  }
  if (record.idempotencyKey !== undefined) {
    try {
      sanitizeV2IdempotencyKey(record.idempotencyKey);
    } catch (error) {
      return {
        ok: false,
        response: envelopeFailure(
          "input-invalid",
          error instanceof Error ? error.message : String(error),
        ),
      };
    }
  }
  return {
    ok: true,
    request: {
      extensionId: record.extensionId,
      commandId: record.commandId,
      ...(record.input !== undefined ? { input: record.input } : {}),
      ...(record.selection !== undefined ? { selection: record.selection } : {}),
      ...(record.idempotencyKey !== undefined ? { idempotencyKey: record.idempotencyKey } : {}),
    },
  };
}

/**
 * HTTP entry: decode the envelope, then run the single execution path.
 * Direct callers run `host.execute` with the same request and receive the
 * same outcome; only the envelope/status mapping differs.
 */
export async function handleV2HttpExecute(
  host: ExtensionV2Host,
  rawBody: unknown,
): Promise<V2HttpResponse> {
  const decoded = decodeV2ExecuteBody(rawBody);
  if (!decoded.ok) return decoded.response;
  return encodeV2Result(await host.execute(decoded.request));
}

export type V2AvailabilityQuery = V2AvailabilityContext & {
  extensionId: string;
  commandId: string;
};

/**
 * HTTP availability read: ownership first, then the shared evaluator.
 * Never executes commands; never hydrates selections. Denials return
 * 200 with `available: false` plus the machine code and user-readable
 * reason, so renderers can disable entries directly; only ownership
 * failures (unknown extension/command) use error statuses.
 */
export function handleV2HttpAvailability(
  registry: ExtensionV2Registry,
  services: {
    isEnabled(extensionId: string): boolean;
    capabilities: ReadonlySet<string> | readonly string[] | Record<string, boolean>;
    grantedPermissions(extensionId: string): ReadonlySet<string> | readonly string[];
  },
  query: V2AvailabilityQuery,
): V2HttpResponse {
  const ownership = resolveV2Ownership(registry, query.extensionId, query.commandId);
  if (!ownership.ok) return encodeV2Failure(ownership.failure);
  const availability = evaluateV2Availability(
    ownership.definition,
    ownership.command,
    {
      fileIds: query.fileIds,
      folderPath: query.folderPath,
      collectionId: query.collectionId,
      dropFileCount: query.dropFileCount,
      input: query.input,
    },
    {
      enabled: services.isEnabled(query.extensionId),
      capabilities: services.capabilities,
      grantedPermissions: services.grantedPermissions(query.extensionId),
    },
  );
  if (availability.available) {
    return {
      status: 200,
      body: {
        ok: true,
        available: true,
        extensionId: query.extensionId,
        commandId: query.commandId,
      },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      available: false,
      code: availability.code,
      reason: availability.reason,
      extensionId: query.extensionId,
      commandId: query.commandId,
    },
  };
}

/**
 * Plan review/apply entries (R5). Review stamps the host-recorded read
 * that unlocks destructive plans; apply echoes the review's targets and
 * options back byte-identically (any difference rejects with
 * `plan-altered`). A client `confirmed` flag is never read.
 */

/** Poll one plan's review payload. Unknown IDs report `plan-unknown`. */
export function handleV2HttpPlanGet(
  host: ExtensionV2Host,
  planId: string,
): V2HttpResponse {
  if (!planId.trim()) {
    return encodeV2Failure({
      ok: false,
      code: "plan-unknown",
      message: "Plan ID must be a non-empty string.",
    });
  }
  const reviewed = host.reviewPlan(planId);
  if (!reviewed.ok) return encodeV2Failure(reviewed);
  return { status: 200, body: { ok: true, review: reviewed.review } };
}

/**
 * Apply a reviewed plan. The body must echo `{ targets, options }`
 * exactly as review returned them; missing or differing echoes reject
 * with `plan-altered`.
 */
export async function handleV2HttpPlanApply(
  host: ExtensionV2Host,
  planId: string,
  rawBody: unknown,
): Promise<V2HttpResponse> {
  if (!planId.trim()) {
    return encodeV2Failure({
      ok: false,
      code: "plan-unknown",
      message: "Plan ID must be a non-empty string.",
    });
  }
  if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
    return encodeV2Failure({
      ok: false,
      code: "plan-altered",
      message: "Apply body must be a JSON object echoing the review's targets and options.",
    });
  }
  const body = rawBody as Record<string, unknown>;
  return encodeV2Result(
    await host.applyPlan(planId, {
      ...(body.targets !== undefined ? { targets: body.targets } : {}),
      ...(body.options !== undefined ? { options: body.options } : {}),
    }),
  );
}

/**
 * Job polling entries (R4). The reader is the host's job manager (or
 * any `V2JobStatusReader`); records are already serializable and carry
 * ownership metadata without grant tokens.
 */

function encodeV2JobRecord(record: V2JobRecord): V2HttpResponse {
  return { status: 200, body: { ok: true, job: persistedV2JobRecord(record) } };
}

function jobUnknownResponse(jobId: string): V2HttpResponse {
  return encodeV2Failure({
    ok: false,
    code: "job-unknown",
    message: `Job "${jobId}" is unknown; it may have aged out of bounded history. Resubmit with a fresh invocation key.`,
  });
}

/**
 * HTTP job submit: decode the envelope, then run the single execution
 * path's job entry (`host.submitJob`). Duplicate idempotency keys
 * return the existing job with `duplicate: true` and no new work.
 */
export async function handleV2HttpJobSubmit(
  host: ExtensionV2Host,
  rawBody: unknown,
): Promise<V2HttpResponse> {
  const decoded = decodeV2ExecuteBody(rawBody);
  if (!decoded.ok) return decoded.response;
  const result = await host.submitJob(decoded.request);
  if (!result.ok) return encodeV2Failure(result);
  return { status: 202, body: { ok: true, outcome: result.outcome } };
}

/** Poll one job's status. Reconnect/reload safe: pass the same job ID again. */
export function handleV2HttpJobGet(
  reader: V2JobStatusReader,
  jobId: string,
): V2HttpResponse {
  if (!jobId.trim()) {
    return encodeV2Failure({ ok: false, code: "job-unknown", message: "Job ID must be a non-empty string." });
  }
  const record = reader.getJob(jobId);
  if (!record) return jobUnknownResponse(jobId);
  return encodeV2JobRecord(record);
}

/** Poll job history, newest first, bounded pages. */
export function handleV2HttpJobList(
  reader: V2JobStatusReader,
  query?: { cursor?: unknown; limit?: unknown },
): V2HttpResponse {
  const cursor = typeof query?.cursor === "string" ? query.cursor : null;
  const limit =
    typeof query?.limit === "number" || typeof query?.limit === "string"
      ? Number(query.limit)
      : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
    return encodeV2Failure({
      ok: false,
      code: "input-invalid",
      message: "Job list limit must be a positive number.",
    });
  }
  const page = reader.listJobs(cursor, limit);
  return {
    status: 200,
    body: {
      ok: true,
      jobs: page.jobs.map((record) => persistedV2JobRecord(record)),
      nextCursor: page.nextCursor,
    },
  };
}

/**
 * Request cancellation. Idempotent: cancelling a terminal job returns
 * its current record; only live jobs move.
 */
export function handleV2HttpJobCancel(
  reader: V2JobStatusReader,
  jobId: string,
): V2HttpResponse {
  if (!jobId.trim()) {
    return encodeV2Failure({ ok: false, code: "job-unknown", message: "Job ID must be a non-empty string." });
  }
  const record = reader.requestCancel(jobId);
  if (!record) return jobUnknownResponse(jobId);
  return encodeV2JobRecord(record);
}
