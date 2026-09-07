/**
 * Privacy redaction for v2 execution diagnostics (prototype workbench,
 * dev-only, R9).
 *
 * Local detail views may show what the user needs to diagnose their own
 * operation; anything exported (copied JSON, downloaded files, job
 * history responses) must follow the privacy rules: redact filesystem
 * paths, settings values, grant/token material, secrets, and raw stack
 * traces. Invocation and job IDs are stable correlation handles and are
 * always preserved. Storage is bounded: per-string and per-payload caps
 * truncate with an explicit marker instead of growing without limit.
 *
 * Pure module: no React, no routes, no database, no v1 imports. Shared
 * by the workbench client log and the dev-only history route.
 */

/** Longest stored string before truncation. */
export const V2_DIAGNOSTIC_MAX_STRING = 2000;
/** Most records kept in one inspector/history payload. */
export const V2_DIAGNOSTIC_MAX_RECORDS = 100;

const TRUNCATED = "…[truncated]";

export function boundV2Text(value: string, max = V2_DIAGNOSTIC_MAX_STRING): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}${TRUNCATED}`;
}

function redactStackFrames(value: string): string {
  return value
    .split("\n")
    .filter((line) => !/^\s*at\s+\S/.test(line))
    .join("\n")
    .replace(/\s*\((?:[A-Za-z]:)?[^()\s]*:\d+:\d+\)/g, " ([location redacted])");
}

/**
 * Redact one free-text diagnostic. Preserves v2 correlation IDs
 * (`vinv_*`, `vjob_*`, `vplan_*`); redacts Windows/Unix paths, keyed
 * secrets and tokens, bearer credentials, setting assignments, and
 * stack frames. Idempotent: already-redacted markers survive a second
 * pass unchanged.
 */
export function redactV2Text(input: unknown, max = V2_DIAGNOSTIC_MAX_STRING): string {
  const raw = typeof input === "string" ? input : JSON.stringify(input ?? null);
  const noStacks = redactStackFrames(raw);
  const redacted = noStacks
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*?/g, "Bearer [redacted]")
    .replace(
      /((?:grant[_-]?token|token|secret|password|api[_-]?key)\s*["':=]+\s*)(["']?)[A-Za-z0-9._~+/-]{4,}\2/gi,
      "$1[redacted]",
    )
    .replace(
      /((?:setting|key)\s+["']?[\w:.-]+["']?\s*[:=]\s*)("[^"]{1,200}"|'[^']{1,200}'|[^\s"'`,;]{1,200})/gi,
      "$1[redacted]",
    )
    .replace(/[A-Za-z]:\\[^\s"'`,;]*|\\\\[^\s"'`,;]*/g, "[path]")
    .replace(
      /(^|[\s"'`(])(?:\/(?:Users|home|tmp|var|etc|library|data|root)\/|\/(?:[a-z0-9_.-]+\/)+[a-z0-9_.-]+)[^\s"'`,;)]*/g,
      "$1[path]",
    );
  return boundV2Text(redacted, max);
}

/** Redact every string in a JSON-shaped value (depth-bounded, cycle-safe). */
export function redactV2Json(value: unknown, max = V2_DIAGNOSTIC_MAX_STRING): unknown {
  const seen = new Set<object>();
  const walk = (node: unknown, depth: number): unknown => {
    if (typeof node === "string") return redactV2Text(node, max);
    if (node === null || node === undefined) return node;
    if (typeof node !== "object") return node;
    if (seen.has(node)) return "[cycle]";
    if (depth > 6) return "[depth]";
    seen.add(node);
    if (Array.isArray(node)) return node.slice(0, 50).map((entry) => walk(entry, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(node).slice(0, 100)) {
      out[key] = /token|secret|password|api[_-]?key/i.test(key)
        ? "[redacted]"
        : walk(entry, depth + 1);
    }
    return out;
  };
  return walk(value, 0);
}
