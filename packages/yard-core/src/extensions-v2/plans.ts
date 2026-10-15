import {
  validateV2Value,
  type ExtensionV2Command,
  type ExtensionV2Definition,
} from "./definition";
import type { V2FailureCode } from "./invocation";
import { V2OperationError } from "./operations";
import type { ExtensionV2Registry } from "./registry";

/**
 * Host-validated prepare/review/apply contract for operations that
 * require review (Yard Core context, R5).
 *
 * Typed interaction model: input collection (command input schema) →
 * preview (generic renderer tables/notices below) → review (host-stamped)
 * → execution (apply) → results (validated immediate value). Renderer
 * components stay generic: they render `V2PlanPreview` tables and
 * notices without extension-specific branches; the Make Pack preview
 * channel is this payload (sources, names, format, destination,
 * conflicts, missing sources, manifest choice travel in `tables`,
 * `notices`, and serializable `details` — ticket #171 consumes them, it
 * does not extend this contract).
 *
 * Binding: `prepare` runs inside a handler invocation, so every plan is
 * bound to its extension, command, validated targets/options,
 * authorization context (required permissions + grant IDs + capability
 * snapshot), expiry, and invocation ID. `apply` revalidates all of it:
 * changed targets are re-resolved against the Library index, grants are
 * re-authorized, and effective permissions are recomputed. A client
 * boolean such as `confirmed: true` is never sufficient — apply requires
 * the stored plan record plus a byte-identical echo of its
 * targets/options.
 *
 * Rejection policy (typed `V2FailureCode`s, statuses in transport.ts):
 * - `plan-unknown`: no plan with that ID (never existed, belonged to a
 *   restarted process — plans are memory-only — or was evicted).
 * - `plan-consumed`: the plan already ran. A retry is a fresh `prepare`
 *   (fresh invocation, fresh authorization); consumed plans never run twice.
 * - `plan-expired`: past `expiresAt`. Re-prepare; grants may need renewal too.
 * - `plan-altered`: echoed targets/options differ from the record, or the
 *   stored targets no longer resolve. Refresh the preview and re-prepare.
 * - `review-required`: a destructive plan was applied before `review`
 *   stamped it. Review is a host-recorded read, not a client flag.
 * - `permission-denied`: required permissions or grants lapsed since prepare.
 *
 * Retry rule: pre-execution rejections (unknown/consumed/expired/
 * altered/review-gate/auth) leave a pending plan pending, so the client
 * may fix the cause (renew a grant, refresh targets) and apply again
 * until expiry. Once handler execution starts, the plan is consumed
 * whether the handler succeeds or fails — effects are not transactional,
 * so a blind re-apply could duplicate them.
 *
 * No generic undo is promised. Every plan declares reversibility:
 * `reversible-app-change` (the application can reverse it, e.g. retag),
 * `job-temp-cleanup` (only job-owned temporary output; disposed by
 * ownership, never guessed filenames), or `irreversible-files` (bytes
 * already left the job's ownership: copies, archives, overwrites of
 * grant-authorized destinations). The review payload surfaces the kind
 * and a human-readable note before anything runs.
 *
 * Destructive plans (command `destructive` or prepare-declared) additionally
 * require the host-recorded review stamp. Fixture coverage exercises this
 * over in-memory/file-fake targets; no destructive end-user extension ships
 * here.
 *
 * Bounds (#299): pending plans are bounded before a new record is
 * created. An identical pending plan (same extension, command, targets,
 * options, destructive flag, grants, and required permissions) is
 * coalesced, so the second prepare returns the existing plan. Stale
 * records are expired by TTL and reported, never vanished. Only then is
 * a genuinely new plan refused past `MAX_V2_PENDING_PLANS_PER_EXTENSION`
 * or `MAX_V2_PENDING_PLANS_TOTAL` with `plan-limit` naming the limit;
 * pending plans are never silently evicted to make room. The stored
 * preview payload is bounded by `MAX_V2_PLAN_PREVIEW_BYTES`.
 *
 * Framework-free: no React, routes, database handles, or v1 imports.
 */

export const V2_PLAN_TTL_MS = 15 * 60_000;
export const V2_PLAN_MAX_TTL_MS = 60 * 60_000;
/**
 * Waiting-work bounds (#299). A pending plan is prepared, reviewed, and
 * applied; past the per-extension or process-wide cap a genuinely new
 * plan is refused (`plan-limit`) rather than silently evicted. An
 * identical pending plan is coalesced first, so duplicate previews never
 * consume capacity. Stale records are swept by TTL and the count is
 * reported (`sweep()` / `lastSweep()`), never vanished silently.
 */
export const MAX_V2_PENDING_PLANS_PER_EXTENSION = 32;
export const MAX_V2_PENDING_PLANS_TOTAL = 64;
/** Hard cap on stored plan records (pending + retained terminal records). */
export const MAX_V2_PLAN_RECORDS = 256;
/**
 * Stale-record TTL: the longest a plan record is kept after it stops
 * being pending, so a replay can still report `plan-consumed`. Pending
 * plans expire earlier at their own `expiresAt`.
 */
export const V2_PLAN_STALE_TTL_MS = 24 * 60 * 60_000;
/** Largest accepted serialized preview payload, in bytes, checked before storing. */
export const MAX_V2_PLAN_PREVIEW_BYTES = 65_536;

export type V2PlanState = "pending" | "consumed";

export type V2ReversibilityKind =
  | "reversible-app-change"
  | "job-temp-cleanup"
  | "irreversible-files";

export type V2PreviewTable = {
  id: string;
  title?: string;
  columns: string[];
  rows: string[][];
};

export type V2PreviewNotice = {
  tone: "info" | "warning" | "error";
  message: string;
};

/**
 * Generic preview payload. Tables carry row data (source files, names,
 * destination, conflicts), notices carry conflicts/missing-source
 * warnings, and `details` carries structured, serializable data the
 * generic tables cannot show (format choice, manifest choice, counts).
 */
export type V2PlanPreview = {
  summary: string;
  tables: V2PreviewTable[];
  notices: V2PreviewNotice[];
  /** Serializable structured data (e.g. Make Pack format/manifest choice). */
  details?: Record<string, unknown>;
  reversibility: V2ReversibilityKind;
  reversibilityNote: string;
};

export type V2PlanTargets = {
  fileIds: string[];
};

export type V2PlanPrepareSpec = {
  targets: V2PlanTargets;
  /** Validated against the command input schema at prepare time. */
  options?: unknown;
  /** Grant IDs the plan depends on; re-authorized at apply. */
  grantIds?: string[];
  /** Permissions that must still be effective at apply. Defaults to the invocation's effective set. */
  requiredPermissions?: string[];
  preview: V2PlanPreview;
  /** True when the effect cannot be previewed safely twice or deletes data. OR-ed with the command's `destructive`. */
  destructive?: boolean;
  /** Milliseconds until expiry; clamped to `[1, V2_PLAN_MAX_TTL_MS]`, defaults to `V2_PLAN_TTL_MS`. */
  ttlMs?: number;
};

export type V2PlanRecord = {
  planId: string;
  extensionId: string;
  commandId: string;
  invocationId: string;
  targets: V2PlanTargets;
  /** Canonical hash of `{ targets, options }`; apply must echo both byte-identically. */
  bindingHash: string;
  options: unknown;
  grantIds: string[];
  requiredPermissions: string[];
  capabilities: string[];
  preview: V2PlanPreview;
  destructive: boolean;
  createdAt: string;
  expiresAt: string;
  reviewedAt?: string;
  state: V2PlanState;
};

/** Review payload returned to generic renderer components. */
export type V2PlanReview = {
  planId: string;
  extensionId: string;
  commandId: string;
  summary: string;
  tables: V2PreviewTable[];
  notices: V2PreviewNotice[];
  details?: Record<string, unknown>;
  /** Echoed back verbatim on apply; any difference rejects with `plan-altered`. */
  targets: V2PlanTargets;
  options: unknown;
  destructive: boolean;
  reversibility: V2ReversibilityKind;
  reversibilityNote: string;
  createdAt: string;
  expiresAt: string;
  reviewedAt: string;
};

/** What the host hands the handler on apply: the validated plan, not client input. */
export type V2AppliedPlan = {
  planId: string;
  targets: V2PlanTargets;
  options: unknown;
  reviewedAt?: string;
};

export type V2PlanManagerOptions = {
  clock?: () => string;
  nowMs?: () => number;
};

let planCounter = 0;

function createPlanId(): string {
  const cryptoRef = (
    globalThis as { crypto?: { randomUUID?: () => string } }
  ).crypto;
  if (cryptoRef?.randomUUID) return `vplan_${cryptoRef.randomUUID()}`;
  planCounter += 1;
  return `vplan_fallback-${Date.now().toString(36)}-${planCounter.toString(36)}-${Math.floor(
    Math.random() * 0xffffffff,
  ).toString(36)}`;
}

/** Canonical JSON: sorted keys, no whitespace. Byte-identical echo required at apply. */
export function canonicalV2PlanJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalV2PlanJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalV2PlanJson(entry)}`);
    return `{${entries.join(",")}}`;
  }
  const text = JSON.stringify(value);
  if (text === undefined) throw new Error("unserializable plan value");
  return text;
}

function bindingHashFor(targets: V2PlanTargets, options: unknown): string {
  const text = canonicalV2PlanJson({ targets, options: options ?? null });
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function checkPreview(preview: V2PlanPreview): void {
  if (typeof preview.summary !== "string" || !preview.summary.trim()) {
    throw new V2OperationError("input-invalid", "Plan preview needs a non-empty summary.");
  }
  if (!Array.isArray(preview.tables)) {
    throw new V2OperationError("input-invalid", "Plan preview tables must be an array.");
  }
  for (const table of preview.tables) {
    if (typeof table.id !== "string" || !table.id.trim()) {
      throw new V2OperationError("input-invalid", "Every preview table needs a non-empty id.");
    }
    if (!Array.isArray(table.columns) || table.columns.some((column) => typeof column !== "string")) {
      throw new V2OperationError("input-invalid", `Preview table ${JSON.stringify(table.id)} needs string columns.`);
    }
    if (
      !Array.isArray(table.rows) ||
      table.rows.some(
        (row) => !Array.isArray(row) || row.some((cell) => typeof cell !== "string"),
      )
    ) {
      throw new V2OperationError("input-invalid", `Preview table ${JSON.stringify(table.id)} needs rows of strings.`);
    }
  }
  if (
    !Array.isArray(preview.notices) ||
    preview.notices.some(
      (notice) =>
        typeof notice !== "object" ||
        notice === null ||
        !["info", "warning", "error"].includes((notice as V2PreviewNotice).tone) ||
        typeof (notice as V2PreviewNotice).message !== "string",
    )
  ) {
    throw new V2OperationError("input-invalid", "Plan preview notices must carry a tone and a message.");
  }
  if (
    preview.reversibility !== "reversible-app-change" &&
    preview.reversibility !== "job-temp-cleanup" &&
    preview.reversibility !== "irreversible-files"
  ) {
    throw new V2OperationError(
      "input-invalid",
      "Plan preview must declare reversibility: reversible-app-change, job-temp-cleanup, or irreversible-files. Generic undo is never promised.",
    );
  }
  if (typeof preview.reversibilityNote !== "string" || !preview.reversibilityNote.trim()) {
    throw new V2OperationError("input-invalid", "Plan preview needs a reversibility note for the review screen.");
  }
  if (preview.details !== undefined) {
    try {
      const text = JSON.stringify(preview.details);
      if (text === undefined) throw new Error("unserializable");
    } catch {
      throw new V2OperationError("input-invalid", "Plan preview details must be JSON-serializable.");
    }
  }
  let previewBytes: number;
  try {
    previewBytes = new TextEncoder().encode(JSON.stringify(preview) ?? "").length;
  } catch {
    throw new V2OperationError("input-invalid", "Plan preview must be JSON-serializable.");
  }
  if (previewBytes > MAX_V2_PLAN_PREVIEW_BYTES) {
    throw new V2OperationError(
      "input-invalid",
      `Plan preview is ${previewBytes} bytes; the limit is ${MAX_V2_PLAN_PREVIEW_BYTES}. Trim the preview tables, notices, or details before preparing.`,
    );
  }
}

function lookupCommand(
  registry: ExtensionV2Registry,
  extensionId: string,
  commandId: string,
): { definition: ExtensionV2Definition; command: ExtensionV2Command } {
  const definition = registry.get(extensionId);
  const command = definition?.commands.find((entry) => entry.id === commandId);
  if (!definition || !command) {
    throw new V2OperationError(
      "command-unknown",
      `Command "${commandId}" is not declared by extension "${extensionId}".`,
    );
  }
  return { definition, command };
}

function planFailure(code: V2FailureCode, message: string): V2OperationError {
  return new V2OperationError(code, message);
}

export class V2PlanManager {
  private readonly plans = new Map<string, V2PlanRecord>();
  private readonly clock: () => string;
  private readonly nowMs: () => number;
  /** Counts from the most recent `sweep`, reported rather than discarded. */
  private sweepCounts: { expired: number; dropped: number } = { expired: 0, dropped: 0 };

  constructor(
    private readonly registry: ExtensionV2Registry,
    options?: V2PlanManagerOptions,
  ) {
    this.clock = options?.clock ?? (() => new Date().toISOString());
    this.nowMs = options?.nowMs ?? (() => Date.now());
  }

  pendingCount(): number {
    return this.countPending();
  }

  /** Counts from the most recent `sweep` (`{ expired, dropped }`). */
  lastSweep(): { expired: number; dropped: number } {
    return { ...this.sweepCounts };
  }

  /**
   * Expire stale records and report the count instead of vanishing them:
   * a pending plan past its `expiresAt` is expired, and any record past
   * `V2_PLAN_STALE_TTL_MS` since creation is dropped. Runs before capacity
   * is judged, so expiry frees slots before a new plan is refused.
   */
  sweep(): { expired: number; dropped: number } {
    const now = this.clock();
    // Staleness is measured on the same clock that stamped `createdAt`,
    // so a test that overrides only `clock` stays self-consistent.
    const parsedNow = Date.parse(now);
    const nowMs = Number.isFinite(parsedNow) ? parsedNow : this.nowMs();
    let expired = 0;
    let dropped = 0;
    for (const [id, record] of [...this.plans]) {
      if (record.state === "pending" && record.expiresAt <= now) {
        this.plans.delete(id);
        expired += 1;
        continue;
      }
      const createdMs = Date.parse(record.createdAt);
      if (Number.isFinite(createdMs) && nowMs - createdMs >= V2_PLAN_STALE_TTL_MS) {
        this.plans.delete(id);
        dropped += 1;
      }
    }
    if (this.plans.size > MAX_V2_PLAN_RECORDS) {
      for (const [id, record] of [...this.plans]) {
        if (this.plans.size <= MAX_V2_PLAN_RECORDS) break;
        if (record.state === "consumed") {
          this.plans.delete(id);
          dropped += 1;
        }
      }
    }
    this.sweepCounts = { expired, dropped };
    return { ...this.sweepCounts };
  }

  private countPending(extensionId?: string): number {
    let count = 0;
    for (const record of this.plans.values()) {
      if (record.state !== "pending") continue;
      if (extensionId !== undefined && record.extensionId !== extensionId) continue;
      count += 1;
    }
    return count;
  }

  /**
   * Refuse a genuinely new plan past the named cap. Pending plans are
   * never evicted to make room; expiry (`sweep`) is the only pressure
   * valve, and it reports what it removed.
   */
  private checkCapacity(extensionId: string): void {
    const perExtension = this.countPending(extensionId);
    if (perExtension >= MAX_V2_PENDING_PLANS_PER_EXTENSION) {
      throw planFailure(
        "plan-limit",
        `Extension "${extensionId}" already holds ${perExtension} pending plans; the per-extension limit is ${MAX_V2_PENDING_PLANS_PER_EXTENSION}. Apply or let existing plans expire before preparing another.`,
      );
    }
    const total = this.countPending();
    if (total >= MAX_V2_PENDING_PLANS_TOTAL) {
      throw planFailure(
        "plan-limit",
        `The host already holds ${total} pending plans; the process-wide limit is ${MAX_V2_PENDING_PLANS_TOTAL}. Apply or let existing plans expire before preparing another.`,
      );
    }
  }

  /**
   * Find an identical pending plan so the caller can reuse it. Identity
   * is the full binding: same extension, command, targets/options hash,
   * destructive flag, grants, and required permissions.
   */
  private findPending(record: {
    extensionId: string;
    commandId: string;
    bindingHash: string;
    destructive: boolean;
    grantIds: readonly string[];
    requiredPermissions: readonly string[];
  }): V2PlanRecord | null {
    const now = this.clock();
    const grants = [...record.grantIds].sort().join("\u0000");
    const permissions = [...record.requiredPermissions].sort().join("\u0000");
    for (const candidate of this.plans.values()) {
      if (candidate.state !== "pending") continue;
      if (candidate.expiresAt <= now) continue;
      if (candidate.extensionId !== record.extensionId) continue;
      if (candidate.commandId !== record.commandId) continue;
      if (candidate.bindingHash !== record.bindingHash) continue;
      if (candidate.destructive !== record.destructive) continue;
      if ([...candidate.grantIds].sort().join("\u0000") !== grants) continue;
      if ([...candidate.requiredPermissions].sort().join("\u0000") !== permissions) continue;
      return candidate;
    }
    return null;
  }

  /**
   * Bind a plan to its extension, command, validated targets/options,
   * authorization context, expiry, and invocation. Only callable with the
   * invocation's own ownership — the operations service supplies the
   * binding, handlers cannot pick another extension's namespace.
   */
  prepare(
    binding: {
      extensionId: string;
      invocationId: string;
      commandId: string;
      effectivePermissions: readonly string[];
      capabilities: readonly string[];
    },
    spec: V2PlanPrepareSpec,
  ): V2PlanRecord {
    // Bound waiting work before any expensive validation or preview work:
    // stale records expire (and are counted) before capacity is judged.
    this.sweep();
    const { command } = lookupCommand(this.registry, binding.extensionId, binding.commandId);
    if (!spec || typeof spec !== "object") {
      throw planFailure("input-invalid", "Plan spec must be an object.");
    }
    const fileIds = spec.targets?.fileIds;
    if (!Array.isArray(fileIds) || fileIds.some((id) => typeof id !== "string" || !id.trim())) {
      throw planFailure("input-invalid", "Plan targets need a fileIds array of non-empty strings.");
    }
    if (spec.options !== undefined && command.input !== undefined) {
      const invalid = validateV2Value(command.input, spec.options);
      if (invalid) {
        throw planFailure("input-invalid", `Plan options are invalid: ${invalid}`);
      }
    }
    try {
      canonicalV2PlanJson({ targets: spec.targets, options: spec.options ?? null });
    } catch {
      throw planFailure("input-invalid", "Plan targets/options must be JSON-serializable.");
    }
    checkPreview(spec.preview);
    const grantIds = spec.grantIds ?? [];
    if (grantIds.some((id) => typeof id !== "string" || !id.trim())) {
      throw planFailure("input-invalid", "Plan grant IDs must be non-empty strings.");
    }
    const destructive = command.destructive === true || spec.destructive === true;
    const requiredPermissions = [...(spec.requiredPermissions ?? binding.effectivePermissions)];
    const bindingHash = bindingHashFor({ fileIds: [...fileIds] }, spec.options ?? null);

    // Coalesce first: an identical pending plan is deduplicated, so the
    // same work never queues twice. The stored record keeps its plan ID
    // and expiry; only the invocation binding is refreshed so the
    // execute-time ownership check accepts this caller.
    const existing = this.findPending({
      extensionId: binding.extensionId,
      commandId: binding.commandId,
      bindingHash,
      destructive,
      grantIds,
      requiredPermissions,
    });
    if (existing) {
      existing.invocationId = binding.invocationId;
      existing.capabilities = [...binding.capabilities];
      return { ...existing };
    }

    // Reject past the hard cap, naming the limit; never evict pending work.
    this.checkCapacity(binding.extensionId);

    const ttlMs = Math.max(1, Math.min(V2_PLAN_MAX_TTL_MS, Math.floor(spec.ttlMs ?? V2_PLAN_TTL_MS)));
    const createdAt = this.clock();
    const record: V2PlanRecord = {
      planId: createPlanId(),
      extensionId: binding.extensionId,
      commandId: binding.commandId,
      invocationId: binding.invocationId,
      targets: { fileIds: [...fileIds] },
      bindingHash,
      options: spec.options ?? null,
      grantIds: [...grantIds],
      requiredPermissions,
      capabilities: [...binding.capabilities],
      preview: {
        summary: spec.preview.summary,
        tables: spec.preview.tables.map((table) => ({
          ...table,
          columns: [...table.columns],
          rows: table.rows.map((row) => [...row]),
        })),
        notices: spec.preview.notices.map((notice) => ({ ...notice })),
        ...(spec.preview.details !== undefined
          ? { details: JSON.parse(JSON.stringify(spec.preview.details)) as Record<string, unknown> }
          : {}),
        reversibility: spec.preview.reversibility,
        reversibilityNote: spec.preview.reversibilityNote,
      },
      destructive,
      createdAt,
      expiresAt: new Date(this.nowMs() + ttlMs).toISOString(),
      state: "pending",
    };
    this.plans.set(record.planId, record);
    return { ...record };
  }

  /** Host-recorded review stamp. Returns the renderer-facing review payload. */
  review(planId: string, extensionId: string): V2PlanReview {
    const record = this.requireLive(planId, extensionId);
    record.reviewedAt = this.clock();
    return this.toReview(record);
  }

  /**
   * Pre-execution gate for apply: unknown/consumed/expired/altered
   * checks plus the destructive review gate. Returns the stored record;
   * the host runs target/grant/permission revalidation and the handler
   * afterwards. Pre-execution rejections leave pending plans pending.
   */
  checkForApply(
    planId: string,
    extensionId: string,
    echoed: { targets?: unknown; options?: unknown },
  ): V2PlanRecord {
    const record = this.requireLive(planId, extensionId);
    if (echoed.targets === undefined || echoed.options === undefined) {
      throw planFailure(
        "plan-altered",
        `Plan "${planId}" needs its targets and options echoed back exactly; refresh the preview and retry.`,
      );
    }
    let echoedHash: string;
    try {
      const targets = echoed.targets as V2PlanTargets;
      if (!targets || !Array.isArray(targets.fileIds)) {
        throw new Error("malformed");
      }
      echoedHash = bindingHashFor({ fileIds: [...targets.fileIds] }, echoed.options ?? null);
    } catch (error) {
      if (error instanceof V2OperationError) throw error;
      throw planFailure(
        "plan-altered",
        `Plan "${planId}" echo is malformed; refresh the preview and retry.`,
      );
    }
    if (echoedHash !== record.bindingHash) {
      throw planFailure(
        "plan-altered",
        `Plan "${planId}" changed since review (targets or options differ); refresh the preview and prepare a new plan.`,
      );
    }
    if (record.destructive && !record.reviewedAt) {
      throw planFailure(
        "review-required",
        `Plan "${planId}" is destructive; review it before applying. A client confirmed flag is not sufficient.`,
      );
    }
    return { ...record };
  }

  /** Single-use consumption once handler execution starts. */
  markConsumed(planId: string): void {
    const record = this.plans.get(planId);
    if (record) record.state = "consumed";
  }

  /** Read-only lookup for the execute path's plan-binding check. */
  peek(planId: string): V2PlanRecord | null {
    const record = this.plans.get(planId);
    return record ? { ...record } : null;
  }

  private requireLive(planId: string, extensionId: string): V2PlanRecord {
    const record = this.plans.get(planId);
    if (!record || record.extensionId !== extensionId) {
      throw planFailure(
        "plan-unknown",
        `Plan "${planId}" is unknown; it may have expired, been evicted, or belonged to a restarted process. Prepare a new plan.`,
      );
    }
    if (record.state === "consumed") {
      throw planFailure(
        "plan-consumed",
        `Plan "${planId}" already ran; a retry prepares a new plan with fresh authorization. Consumed plans never run twice.`,
      );
    }
    if (record.expiresAt <= this.clock()) {
      throw planFailure(
        "plan-expired",
        `Plan "${planId}" expired at ${record.expiresAt}; prepare a new plan and renew any grants it needs.`,
      );
    }
    return record;
  }

  private toReview(record: V2PlanRecord): V2PlanReview {
    return {
      planId: record.planId,
      extensionId: record.extensionId,
      commandId: record.commandId,
      summary: record.preview.summary,
      tables: record.preview.tables,
      notices: record.preview.notices,
      ...(record.preview.details !== undefined ? { details: record.preview.details } : {}),
      targets: { fileIds: [...record.targets.fileIds] },
      options: record.options === null ? null : JSON.parse(JSON.stringify(record.options)) as unknown,
      destructive: record.destructive,
      reversibility: record.preview.reversibility,
      reversibilityNote: record.preview.reversibilityNote,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      reviewedAt: record.reviewedAt ?? this.clock(),
    };
  }
}
