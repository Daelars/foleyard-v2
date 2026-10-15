import { validateV2Value, type ExtensionV2ValueSchema } from "./definition";
import type { V2FailureCode } from "./invocation";

/**
 * Bounded, schema-shaped terminal results for v2 jobs (Yard Core, R4 #279).
 *
 * A terminal summary crosses a process boundary that the renderer, the
 * job centre (#281), and the review surfaces (#280/#282/#283) consume, so
 * it is a contract with hard limits:
 *
 * - The declared command `result` schema is the allowlist. Anything the
 *   schema does not name is dropped, so a handler cannot widen the
 *   surface by returning extra fields.
 * - Sizes are bounded even when the schema states no limit: strings,
 *   array lengths, and the whole projection have hard caps, and a
 *   projection that still exceeds the byte cap is omitted rather than
 *   sent unbounded.
 * - Diagnostics are redacted: stack frames are removed, absolute paths
 *   are replaced, and messages are length-capped, so a failure never
 *   leaks a private host path or a stack into transport or persistence.
 *
 * Framework-free: schemas in, bounded JSON out.
 */

/** Largest accepted serialized projection for one terminal value, in bytes. */
export const V2_JOB_RESULT_MAX_BYTES = 16_384;
/** Hard cap for one projected string, in characters. */
export const V2_JOB_RESULT_MAX_STRING = 1_024;
/** Hard cap for one projected array's length. */
export const V2_JOB_RESULT_MAX_ITEMS = 200;
/** Hard cap for one redacted diagnostic message, in characters. */
export const V2_JOB_DIAGNOSTIC_MAX_CHARS = 400;

/** Terminal diagnostic codes: declared failures plus the job lifecycle. */
export type V2JobDiagnosticCode = V2FailureCode | "job-cancelled" | "job-interrupted";

export type V2JobDiagnostic = {
  code: V2JobDiagnosticCode;
  /** Bounded and redacted: no stacks, no absolute host paths. */
  message: string;
};

/**
 * The bounded terminal summary that travels over the job API. `diagnostic`
 * is attached at transport time from the record's terminal state; the
 * `value` projection is computed once when the job completes.
 */
export type V2JobTerminalResult = {
  diagnostic?: V2JobDiagnostic;
  /** Bounded, schema-shaped projection of the declared result. */
  value?: unknown;
  /** True when a declared result existed but was dropped as oversized. */
  valueOmitted?: boolean;
};

export type V2JobResultProjection =
  | { ok: true; value: unknown }
  | { ok: false; reason: "no-schema" | "invalid" | "oversized" };

/** Windows drive/UNC paths, and POSIX paths of at least two segments. */
const ABSOLUTE_PATH_PATTERN =
  /(?:[A-Za-z]:[\\/]|\\\\)[^\s"'`()[\]{},;]*|\/(?:[^\s"'`()[\]{},;/]+\/)+[^\s"'`()[\]{},;/]*/g;
const STACK_FRAME_PATTERN = /^\s*at\s+.*$/gm;

/**
 * Redact a diagnostic to what the renderer may see: drop stack frames,
 * replace absolute paths, collapse whitespace, and cap the length. The
 * failure code is never redacted; it is the machine-readable part.
 */
export function redactV2JobDiagnosticMessage(raw: string): string {
  const text = typeof raw === "string" ? raw : String(raw ?? "");
  const redacted = text
    .replace(STACK_FRAME_PATTERN, "")
    .replace(ABSOLUTE_PATH_PATTERN, "[path]")
    .replace(/\s+/g, " ")
    .trim();
  if (redacted.length <= V2_JOB_DIAGNOSTIC_MAX_CHARS) return redacted;
  return `${redacted.slice(0, V2_JOB_DIAGNOSTIC_MAX_CHARS - 1)}…`;
}

const DROPPED = Symbol("v2-job-result-dropped");

function boundedString(value: unknown, maxLength?: number): string | typeof DROPPED {
  if (typeof value !== "string") return DROPPED;
  const cap = Math.min(maxLength ?? V2_JOB_RESULT_MAX_STRING, V2_JOB_RESULT_MAX_STRING);
  return value.length > cap ? value.slice(0, cap) : value;
}

/** Project one value onto the schema's shape, dropping anything undeclared. */
function boundV2JobValue(
  schema: ExtensionV2ValueSchema,
  value: unknown,
): unknown | typeof DROPPED {
  switch (schema.kind) {
    case "none":
      return DROPPED;
    case "string":
      return boundedString(value, schema.maxLength);
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? value : DROPPED;
    case "boolean":
      return typeof value === "boolean" ? value : DROPPED;
    case "enum":
      return typeof value === "string" && schema.values.includes(value) ? value : DROPPED;
    case "string-array": {
      if (!Array.isArray(value)) return DROPPED;
      const cap = Math.min(schema.maxItems ?? V2_JOB_RESULT_MAX_ITEMS, V2_JOB_RESULT_MAX_ITEMS);
      const items: string[] = [];
      for (const item of value.slice(0, cap)) {
        const bounded = boundedString(item);
        if (bounded === DROPPED) return DROPPED;
        items.push(bounded);
      }
      return items;
    }
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return DROPPED;
      const record = value as Record<string, unknown>;
      const projected: Record<string, unknown> = {};
      for (const [name, nested] of Object.entries(schema.properties)) {
        if (!(name in record)) continue;
        const bounded = boundV2JobValue(nested, record[name]);
        // Undeclared properties never appear; an ill-typed declared
        // property drops and, when required, fails validation below.
        if (bounded === DROPPED) continue;
        projected[name] = bounded;
      }
      return projected;
    }
  }
}

/**
 * Project a handler value through the command's declared result schema.
 *
 * Returns the bounded projection, or a reason it cannot be exposed:
 * `no-schema` (nothing declared), `invalid` (the shape no longer
 * validates), or `oversized` (even bracket-bounded, it exceeds the byte
 * cap and is therefore omitted rather than sent unbounded).
 */
export function projectV2JobResultValue(
  schema: ExtensionV2ValueSchema | undefined,
  value: unknown,
): V2JobResultProjection {
  if (!schema || schema.kind === "none" || value === undefined) {
    return { ok: false, reason: "no-schema" };
  }
  const bounded = boundV2JobValue(schema, value);
  if (bounded === DROPPED) return { ok: false, reason: "invalid" };
  const invalid = validateV2Value(schema, bounded, "result");
  if (invalid) return { ok: false, reason: "invalid" };
  let size: number;
  try {
    size = JSON.stringify(bounded)?.length ?? Number.POSITIVE_INFINITY;
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (size > V2_JOB_RESULT_MAX_BYTES) return { ok: false, reason: "oversized" };
  return { ok: true, value: bounded };
}

/**
 * Derive the transport diagnostic from a terminal record. Succeeded and
 * live jobs have none; failed, cancelled, and interrupted jobs get a
 * bounded, redacted message that never carries a stack or a host path.
 */
export function terminalV2JobDiagnostic(record: {
  state: string;
  error?: { code: string; message: string } | undefined;
  recovery?: { cleanup?: string } | undefined;
}): V2JobDiagnostic | undefined {
  if (record.state === "failed") {
    return record.error
      ? {
          code: record.error.code as V2JobDiagnosticCode,
          message: redactV2JobDiagnosticMessage(record.error.message),
        }
      : {
          code: "handler-failed",
          message: "The job failed without a reported reason; check its inputs and retry.",
        };
  }
  if (record.state === "cancelled") {
    return record.error
      ? {
          code: record.error.code as V2JobDiagnosticCode,
          message: redactV2JobDiagnosticMessage(record.error.message),
        }
      : {
          code: "job-cancelled",
          message:
            "Cancellation was requested; unfinished job-owned output was removed and the job stopped.",
        };
  }
  if (record.state === "interrupted") {
    return {
      code: "job-interrupted",
      message: redactV2JobDiagnosticMessage(
        record.recovery?.cleanup ??
          "The app restarted while this job was live; its work did not resume and known outputs were kept.",
      ),
    };
  }
  return undefined;
}
