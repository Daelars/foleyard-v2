import type { ExtensionV2ValueSchema } from "./definition";
import type { V2FailureCode } from "./invocation";
import type { V2JobReporter } from "./operations";
import {
  projectV2JobResultValue,
  redactV2JobDiagnosticMessage,
  terminalV2JobDiagnostic,
  type V2JobTerminalResult,
} from "./terminal-results";

/**
 * Host-owned v2 job lifecycle (Yard Core context, R4).
 *
 * Jobs are owned by the execution host, never by an HTTP request: a
 * record lives in `V2JobManager` from submit to bounded-history
 * eviction, so an ordinary request ending (or a renderer reload)
 * cannot leave ownership undefined. Status travels over stateless
 * polling (`GET` list/status, `POST` cancel in `transport.ts`); the
 * client keeps the job ID and re-polls after reconnect or reload.
 *
 * States: `queued`, `running`, and `cancellation-requested` are live;
 * `succeeded`, `failed`, `cancelled`, and `interrupted` are terminal.
 * Partial work is explicit on every terminal record (`partial` counts
 * plus the first few per-item reasons, and an `incomplete` flag when
 * the runner stopped early on purpose).
 *
 * Cancellation is cooperative. Extension code observes it through the
 * reporter (`throwIfCancelled` between operations and per chunk of a
 * long stream); the host records `cancellationRequestedAt` separately
 * from `stoppedAt`. A timeout cannot preempt in-process JavaScript, so
 * a runner that ignores the signal keeps running until it settles and
 * its outcome then stands (with the request time kept for audit). A
 * job is never marked terminal while its runner is still executing,
 * which means never stopped while still writing.
 *
 * Bounds: at most `MAX_CONCURRENT_V2_JOBS` runners execute at once
 * (extra submits queue FIFO); history keeps at most
 * `MAX_V2_JOB_HISTORY` records with live jobs never evicted.
 *
 * Restart: `snapshot`/`restoreSnapshot` carry serializable records
 * only (ownership metadata and owned output paths; never grant tokens,
 * which live in the application's in-memory grant storage and expire
 * on restart). Restore marks every live job `interrupted` with known
 * outputs and a recovery note. Filesystem effects are never replayed.
 *
 * Terminal results (R4 #279): a succeeded job's handler value is
 * projected onto the command's declared `result` schema, bounded, and
 * exposed as `job.result.value`; failed, cancelled, and interrupted
 * jobs expose a bounded, redacted `job.result.diagnostic`. The raw
 * handler value and the projection are memory-only — the persisted
 * snapshot never carries a value, a grant, a stack, or a private host
 * path.
 *
 * Idempotency: a submit carrying an `idempotencyKey` returns the
 * existing record for the same extension, command, and key instead of
 * starting duplicate work. The key is bound to a digest of the payload
 * it first created (input + selection): reusing the key with a changed
 * payload rejects with `V2JobIdempotencyConflictError` rather than
 * silently running the earlier job. A genuinely new attempt uses a fresh key;
 * it re-authorizes grants through the operation services (expired
 * grants deny), never overwrites completed outputs (the services
 * refuse conflicting names), and never routes through v1 (this module
 * has no v1 dependency; see `boundaries.test.ts`).
 *
 * Disable: submits check the host gate at submit and again when a
 * queued job reaches the front; `cancelExtensionJobs` moves queued
 * work straight to `cancelled` and requests cancellation of running
 * work. Service disposal belongs to the runner: after its owned work
 * settles it disposes job-owned incomplete output through
 * `workspace.dispose`, which removes only tracked paths.
 */

export const MAX_CONCURRENT_V2_JOBS = 2;
export const MAX_V2_JOB_HISTORY = 100;
/**
 * Retention for the persisted snapshot (R7): the newest
 * `MAX_V2_JOB_SNAPSHOT_RETAINED` records survive a restart; older
 * in-memory history is diagnostic only and ages out. Live jobs always
 * restore as `interrupted`, never replay.
 */
export const MAX_V2_JOB_SNAPSHOT_RETAINED = 50;
export const V2_JOB_MAX_TRACKED_ERRORS = 50;
export const V2_JOB_SNAPSHOT_VERSION = 1;

export type V2JobState =
  | "queued"
  | "running"
  | "cancellation-requested"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export type V2JobProgress = {
  completed: number;
  /** Null when the total is not knowable up front. */
  total: number | null;
  updatedAt: string;
};

export type V2JobPartialFailure = {
  id: string;
  reason: string;
};

export type V2JobPartial = {
  succeeded: number;
  failed: V2JobPartialFailure[];
  /** True when the runner stopped early on purpose (cap, budget). */
  incomplete: boolean;
  incompleteReason?: string;
};

/**
 * Ownership metadata kept for safe cleanup or review. The grant ID
 * names which destination grant authorized the outputs; the token
 * material that unlocked it is never stored here.
 */
export type V2JobDestination = {
  grantId: string;
  rootPath: string;
};

export type V2JobRecord = {
  jobId: string;
  invocationId: string;
  idempotencyKey?: string;
  extensionId: string;
  commandId: string;
  state: V2JobState;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  cancellationRequestedAt?: string;
  stoppedAt?: string;
  progress: V2JobProgress;
  partial: V2JobPartial;
  /** Canonical paths the job created; safe-cleanup/review surface. */
  outputs: string[];
  destination?: V2JobDestination;
  /**
   * Digest of the submission payload (input + selection) captured when an
   * idempotency key was first used. Memory and persisted, never exposed:
   * a resubmission with the same key but a different digest rejects as
   * `idempotency-conflict` instead of silently returning the earlier job.
   */
  requestFingerprint?: string;
  /** Full handler value is memory-only; snapshots keep counts/outputs. */
  value?: unknown;
  /**
   * Bounded, schema-shaped terminal summary exposed over the job API: a
   * projection of the declared result plus redacted diagnostics. Memory
   * only — it is never persisted, because the projection may carry the
   * user's own output paths. Transport attaches the diagnostic; the value
   * is projected once at completion.
   */
  result?: V2JobTerminalResult;
  error?: { code: V2FailureCode; message: string };
  recovery?: {
    status: string;
    knownOutputs: string[];
    cleanup: string;
  };
};

export type V2JobCompletion = {
  value?: unknown;
  outputs?: string[];
  succeeded?: number;
  failed?: V2JobPartialFailure[];
  incomplete?: boolean;
  incompleteReason?: string;
  error?: { code: V2FailureCode; message: string };
};

export type V2JobRunContext = {
  jobId: string;
  invocationId: string;
  extensionId: string;
  reporter: V2JobReporter;
};

export type V2JobSubmit = {
  extensionId: string;
  commandId: string;
  invocationId: string;
  idempotencyKey?: string;
  /**
   * Digest of the input/selection this key is first submitted with. A
   * later submit reusing the key compares its digest and rejects with
   * `idempotency-conflict` when the payload changed.
   */
  requestFingerprint?: string;
  destination?: V2JobDestination;
  /**
   * The command's declared result schema. When present, a succeeded job's
   * handler value is projected onto it and bounded before transport; an
   * undeclared schema exposes no result.
   */
  resultSchema?: ExtensionV2ValueSchema;
  /** Denial reason, or null when the submit may proceed. Checked at submit and at start. */
  gate?: () => string | null;
  run: (context: V2JobRunContext) => Promise<V2JobCompletion>;
};

export type V2JobSnapshot = {
  version: number;
  exportedAt: string;
  jobs: V2JobRecord[];
};

/** Control-flow error thrown by a job-bound reporter once cancellation is requested. */
export class V2JobCancelledError extends Error {
  constructor(readonly jobId: string) {
    super(`Job "${jobId}" was cancelled; stop writing and unwind.`);
    this.name = "V2JobCancelledError";
  }
}

export function isV2JobCancellation(error: unknown): error is V2JobCancelledError {
  return error instanceof V2JobCancelledError;
}

/**
 * Rejection thrown when an idempotency key is reused with a different
 * payload than the job it first created. The caller must use a fresh key
 * for changed inputs; silently returning the earlier job would run the
 * wrong work.
 */
export class V2JobIdempotencyConflictError extends Error {
  constructor(
    readonly idempotencyKey: string,
    readonly jobId: string,
  ) {
    super(
      `Idempotency key "${idempotencyKey}" was already used for a different payload (job "${jobId}"); use a fresh key for changed inputs.`,
    );
    this.name = "V2JobIdempotencyConflictError";
  }
}

export function isV2JobIdempotencyConflict(
  error: unknown,
): error is V2JobIdempotencyConflictError {
  return error instanceof V2JobIdempotencyConflictError;
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_SECOND_SEED = 0x9e3779b9;
const FNV_PRIME = 0x01000193;

function fnv1a32(text: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** Stable serialization: object keys are sorted, undefined members dropped. */
function canonicalizeFingerprint(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalizeFingerprint).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeFingerprint(record[key])}`).join(",")}}`;
}

/**
 * Bounded digest of a job submission's payload (input + selection). It is
 * deterministic, key-order independent, and short enough to persist with
 * every record; identical payloads fingerprint identically so a lost
 * response is recoverable, and any change is detected. This is a
 * comparison aid, not a security hash.
 */
export function fingerprintV2JobRequest(input: unknown, selection: unknown): string {
  const canonical = canonicalizeFingerprint({ input: input ?? null, selection: selection ?? null });
  const primary = fnv1a32(canonical, FNV_OFFSET_BASIS);
  const secondary = fnv1a32(canonical, FNV_SECOND_SEED);
  return `fnv1a32:${primary.toString(16).padStart(8, "0")}${secondary.toString(16).padStart(8, "0")}`;
}

/**
 * Projection persisted in the settings-table snapshot. Keeps counts,
 * outputs, ownership metadata, partial outcomes, and the idempotency
 * payload digest; drops the memory-only handler value and the terminal
 * result entirely (a projected value may carry the user's own private
 * paths); and redacts diagnostic messages so a failure's stack or host
 * path never reaches the database. A restored record therefore carries no
 * value, and `parseSnapshotRecord` refuses one even if a snapshot is
 * hand-edited to include it.
 */
export function persistedV2JobRecord(record: V2JobRecord): V2JobRecord {
  const copy: V2JobRecord = {
    ...record,
    progress: { ...record.progress },
    partial: {
      ...record.partial,
      failed: record.partial.failed.map((failure) => ({
        id: failure.id,
        reason: redactV2JobDiagnosticMessage(failure.reason),
      })),
    },
    outputs: [...record.outputs],
  };
  delete copy.value;
  delete copy.result;
  if (copy.error) {
    copy.error = {
      code: copy.error.code,
      message: redactV2JobDiagnosticMessage(copy.error.message),
    };
  }
  if (copy.recovery) {
    copy.recovery = { ...copy.recovery, cleanup: redactV2JobDiagnosticMessage(copy.recovery.cleanup) };
  }
  return copy;
}

/**
 * Projection sent over the job API. The raw handler value and the redacted
 * diagnostic baseline come from `persistedV2JobRecord`; the bounded,
 * schema-shaped terminal value and the state-derived diagnostic are added
 * back so a succeeded job exposes its declared result and a failed or
 * cancelled job exposes bounded, redacted diagnostics.
 */
export function exposedV2JobRecord(record: V2JobRecord): V2JobRecord {
  const copy = persistedV2JobRecord(record);
  const result: V2JobTerminalResult = { ...(record.result ?? {}) };
  const diagnostic = terminalV2JobDiagnostic(record);
  if (diagnostic) result.diagnostic = diagnostic;
  if (result.value !== undefined || result.valueOmitted || result.diagnostic) {
    copy.result = result;
  }
  // The payload digest is a server-side comparison aid, never part of the
  // job API surface.
  delete copy.requestFingerprint;
  return copy;
}

function isTerminal(state: V2JobState): boolean {
  return (
    state === "succeeded" ||
    state === "failed" ||
    state === "cancelled" ||
    state === "interrupted"
  );
}

let jobCounter = 0;

function createJobId(): string {
  const cryptoRef = (
    globalThis as { crypto?: { randomUUID?: () => string } }
  ).crypto;
  if (cryptoRef?.randomUUID) return `vjob_${cryptoRef.randomUUID()}`;
  jobCounter += 1;
  return `vjob_fallback-${Date.now().toString(36)}-${jobCounter.toString(36)}-${Math.floor(
    Math.random() * 0xffffffff,
  ).toString(36)}`;
}

function emptyPartial(): V2JobPartial {
  return { succeeded: 0, failed: [], incomplete: false };
}

export type V2JobManagerOptions = {
  maxConcurrent?: number;
  maxHistory?: number;
  clock?: () => string;
  onTransition?: (record: V2JobRecord) => void;
};

type JobEntry = {
  record: V2JobRecord;
  gate?: () => string | null;
  run?: (context: V2JobRunContext) => Promise<V2JobCompletion>;
  /** Declared result schema; drives the bounded terminal projection. */
  resultSchema?: ExtensionV2ValueSchema;
  cancelRequested: boolean;
  waiters: Array<(record: V2JobRecord) => void>;
};

/**
 * Minimal status surface the polling transport reads. The manager
 * implements it; the codec never touches runners or waiters.
 */
export type V2JobStatusReader = {
  getJob(jobId: string): V2JobRecord | null;
  listJobs(cursor?: string | null, limit?: number): { jobs: V2JobRecord[]; nextCursor: string | null };
  requestCancel(jobId: string): V2JobRecord | null;
};

export class V2JobManager implements V2JobStatusReader {
  private readonly entries = new Map<string, JobEntry>();
  /** Oldest-first creation order; drives FIFO start and history eviction. */
  private readonly order: string[] = [];
  private readonly idempotency = new Map<string, string>();
  private readonly clock: () => string;
  private readonly maxConcurrent: number;
  private readonly maxHistory: number;
  private readonly onTransition?: (record: V2JobRecord) => void;

  constructor(options?: V2JobManagerOptions) {
    this.clock = options?.clock ?? (() => new Date().toISOString());
    this.maxConcurrent = Math.max(1, Math.floor(options?.maxConcurrent ?? MAX_CONCURRENT_V2_JOBS));
    this.maxHistory = Math.max(1, Math.floor(options?.maxHistory ?? MAX_V2_JOB_HISTORY));
    this.onTransition = options?.onTransition;
  }

  /** Live snapshot of a record; callers must not mutate it. */
  getJob(jobId: string): V2JobRecord | null {
    const entry = this.entries.get(jobId);
    return entry ? { ...entry.record } : null;
  }

  listJobs(
    cursor?: string | null,
    limit?: number,
  ): { jobs: V2JobRecord[]; nextCursor: string | null } {
    const bounded = Math.max(1, Math.min(50, Math.floor(limit ?? 20)));
    const newestFirst = [...this.order].reverse();
    const start = cursor ? Number.parseInt(cursor, 10) : 0;
    const offset = Number.isFinite(start) && start > 0 ? Math.floor(start) : 0;
    const page = newestFirst.slice(offset, offset + bounded);
    const next = offset + page.length;
    return {
      jobs: page.flatMap((id) => {
        const entry = this.entries.get(id);
        return entry ? [{ ...entry.record }] : [];
      }),
      nextCursor: next < newestFirst.length ? String(next) : null,
    };
  }

  submit(spec: V2JobSubmit): { record: V2JobRecord; duplicate: boolean } {
    const denied = spec.gate?.() ?? null;
    if (denied) {
      throw new Error(denied);
    }
    if (spec.idempotencyKey !== undefined) {
      const key = idempotencyKeyFor(spec.extensionId, spec.commandId, spec.idempotencyKey);
      const existingId = this.idempotency.get(key);
      const existing = existingId ? this.entries.get(existingId) : undefined;
      if (existing) {
        if (
          spec.requestFingerprint !== undefined &&
          existing.record.requestFingerprint !== undefined &&
          existing.record.requestFingerprint !== spec.requestFingerprint
        ) {
          throw new V2JobIdempotencyConflictError(
            spec.idempotencyKey,
            existing.record.jobId,
          );
        }
        return { record: { ...existing.record }, duplicate: true };
      }
    }
    const now = this.clock();
    const record: V2JobRecord = {
      jobId: createJobId(),
      invocationId: spec.invocationId,
      ...(spec.idempotencyKey !== undefined ? { idempotencyKey: spec.idempotencyKey } : {}),
      ...(spec.requestFingerprint !== undefined
        ? { requestFingerprint: spec.requestFingerprint }
        : {}),
      extensionId: spec.extensionId,
      commandId: spec.commandId,
      state: "queued",
      createdAt: now,
      progress: { completed: 0, total: null, updatedAt: now },
      partial: emptyPartial(),
      outputs: [],
      ...(spec.destination ? { destination: { ...spec.destination } } : {}),
    };
    this.entries.set(record.jobId, {
      record,
      gate: spec.gate,
      run: spec.run,
      ...(spec.resultSchema ? { resultSchema: spec.resultSchema } : {}),
      cancelRequested: false,
      waiters: [],
    });
    this.order.push(record.jobId);
    if (spec.idempotencyKey !== undefined) {
      this.idempotency.set(
        idempotencyKeyFor(spec.extensionId, spec.commandId, spec.idempotencyKey),
        record.jobId,
      );
    }
    this.evictHistory();
    this.emit(record);
    this.pump();
    const entry = this.entries.get(record.jobId);
    return { record: { ...(entry ? entry.record : record) }, duplicate: false };
  }

  requestCancel(jobId: string): V2JobRecord | null {
    const entry = this.entries.get(jobId);
    if (!entry) return null;
    if (isTerminal(entry.record.state)) return { ...entry.record };
    const now = this.clock();
    if (entry.record.state === "queued") {
      entry.record = {
        ...entry.record,
        state: "cancelled",
        cancellationRequestedAt: now,
        stoppedAt: now,
        finishedAt: now,
      };
      this.settleEntry(entry);
      return { ...entry.record };
    }
    entry.cancelRequested = true;
    entry.record = { ...entry.record, state: "cancellation-requested", cancellationRequestedAt: now };
    this.emit(entry.record);
    return { ...entry.record };
  }

  /**
   * Disable path: queued work for the extension is cancelled outright
   * (it never started), running work gets a cancellation request its
   * runner observes cooperatively.
   */
  cancelExtensionJobs(extensionId: string, reason: string): { queued: number; running: number } {
    let queued = 0;
    let running = 0;
    for (const entry of this.entries.values()) {
      if (entry.record.extensionId !== extensionId || isTerminal(entry.record.state)) continue;
      if (entry.record.state === "queued") {
        const now = this.clock();
        entry.record = {
          ...entry.record,
          state: "cancelled",
          cancellationRequestedAt: now,
          stoppedAt: now,
          finishedAt: now,
          error: { code: "extension-disabled", message: reason },
        };
        queued += 1;
        this.settleEntry(entry);
      } else {
        this.requestCancel(entry.record.jobId);
        running += 1;
      }
    }
    this.pump();
    return { queued, running };
  }

  /** Reporter bound to one job: progress lands on the record, cancel throws. */
  reporterFor(jobId: string): V2JobReporter {
    return {
      reportProgress: (completed, total) => {
        const entry = this.entries.get(jobId);
        if (!entry || isTerminal(entry.record.state)) return;
        entry.record = {
          ...entry.record,
          progress: { completed, total, updatedAt: this.clock() },
        };
        this.emit(entry.record);
      },
      throwIfCancelled: () => {
        const entry = this.entries.get(jobId);
        if (entry?.cancelRequested) throw new V2JobCancelledError(jobId);
      },
    };
  }

  /** Resolves with the terminal record; rejects only for unknown IDs. */
  waitFor(jobId: string): Promise<V2JobRecord> {
    const entry = this.entries.get(jobId);
    if (!entry) return Promise.reject(new Error(`Job "${jobId}" is unknown.`));
    if (isTerminal(entry.record.state)) return Promise.resolve({ ...entry.record });
    return new Promise((resolve) => {
      entry.waiters.push(resolve);
    });
  }

  /**
   * Serializable history for persistence. Retains the newest
   * `MAX_V2_JOB_SNAPSHOT_RETAINED` records (pass an explicit limit to
   * override, e.g. in tests); memory-only handler values never persist.
   */
  snapshot(limit: number = MAX_V2_JOB_SNAPSHOT_RETAINED): V2JobSnapshot {
    const bounded = Math.max(1, Math.floor(limit));
    return {
      version: V2_JOB_SNAPSHOT_VERSION,
      exportedAt: this.clock(),
      jobs: this.order
        .slice(-bounded)
        .flatMap((id) => {
          const entry = this.entries.get(id);
          return entry ? [persistedV2JobRecord(entry.record)] : [];
        }),
    };
  }

  /**
   * Load persisted history. Live jobs cannot resume (their runners are
   * gone and filesystem effects never replay), so they become
   * `interrupted` with known outputs and a recovery note.
   */
  restoreSnapshot(snapshot: unknown): { restored: number; interrupted: number; ignored: number } {
    let restored = 0;
    let interrupted = 0;
    let ignored = 0;
    if (typeof snapshot !== "object" || snapshot === null) return { restored, interrupted, ignored };
    const jobs = (snapshot as { jobs?: unknown }).jobs;
    if (!Array.isArray(jobs)) return { restored, interrupted, ignored };
    const now = this.clock();
    for (const raw of jobs) {
      const parsed = parseSnapshotRecord(raw);
      if (!parsed) {
        ignored += 1;
        continue;
      }
      if (this.entries.has(parsed.jobId)) continue;
      if (!isTerminal(parsed.state)) {
        parsed.state = "interrupted";
        parsed.stoppedAt = now;
        parsed.finishedAt = now;
        parsed.recovery = {
          status: "interrupted-by-restart",
          knownOutputs: [...parsed.outputs],
          cleanup: "Review owned outputs before retrying; rerun with a fresh invocation key and fresh authorization.",
        };
        interrupted += 1;
      }
      this.entries.set(parsed.jobId, { record: parsed, cancelRequested: false, waiters: [] });
      this.order.push(parsed.jobId);
      if (parsed.idempotencyKey !== undefined) {
        this.idempotency.set(
          idempotencyKeyFor(parsed.extensionId, parsed.commandId, parsed.idempotencyKey),
          parsed.jobId,
        );
      }
      restored += 1;
    }
    this.evictHistory();
    return { restored, interrupted, ignored };
  }

  private runningCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.record.state === "running" || entry.record.state === "cancellation-requested") {
        count += 1;
      }
    }
    return count;
  }

  private pump(): void {
    while (this.runningCount() < this.maxConcurrent) {
      const next = this.order
        .map((id) => this.entries.get(id))
        .find((entry) => entry?.record.state === "queued");
      if (!next || !next.run) return;
      const denied = next.gate?.() ?? null;
      if (denied) {
        const now = this.clock();
        next.record = {
          ...next.record,
          state: "cancelled",
          cancellationRequestedAt: now,
          stoppedAt: now,
          finishedAt: now,
          error: { code: "extension-disabled", message: denied },
        };
        this.settleEntry(next);
        continue;
      }
      const now = this.clock();
      next.record = { ...next.record, state: "running", startedAt: now };
      this.emit(next.record);
      const run = next.run;
      const context: V2JobRunContext = {
        jobId: next.record.jobId,
        invocationId: next.record.invocationId,
        extensionId: next.record.extensionId,
        reporter: this.reporterFor(next.record.jobId),
      };
      void Promise.resolve()
        .then(() => run(context))
        .then(
          (completion) => this.completeJob(next.record.jobId, completion),
          (error: unknown) => this.failJob(next.record.jobId, error),
        );
    }
  }

  private completeJob(jobId: string, completion: V2JobCompletion): void {
    const entry = this.entries.get(jobId);
    if (!entry || isTerminal(entry.record.state)) return;
    const now = this.clock();
    const failed = (completion.failed ?? []).slice(0, V2_JOB_MAX_TRACKED_ERRORS);
    const partial: V2JobPartial = {
      succeeded: Math.max(0, Math.floor(completion.succeeded ?? entry.record.partial.succeeded)),
      failed,
      incomplete: completion.incomplete ?? false,
      ...(completion.incompleteReason !== undefined
        ? { incompleteReason: completion.incompleteReason }
        : {}),
    };
    if (completion.error) {
      entry.record = {
        ...entry.record,
        state: "failed",
        partial,
        outputs: completion.outputs ?? entry.record.outputs,
        error: { ...completion.error },
        stoppedAt: now,
        finishedAt: now,
      };
    } else {
      const projected =
        completion.value !== undefined &&
        entry.resultSchema !== undefined &&
        entry.resultSchema.kind !== "none"
          ? projectV2JobResultValue(entry.resultSchema, completion.value)
          : null;
      entry.record = {
        ...entry.record,
        state: "succeeded",
        partial,
        outputs: completion.outputs ?? entry.record.outputs,
        ...(completion.value !== undefined ? { value: completion.value } : {}),
        ...(projected
          ? { result: projected.ok ? { value: projected.value } : { valueOmitted: true } }
          : {}),
        stoppedAt: now,
        finishedAt: now,
      };
    }
    this.settleEntry(entry);
    this.pump();
  }

  private failJob(jobId: string, error: unknown): void {
    const entry = this.entries.get(jobId);
    if (!entry || isTerminal(entry.record.state)) return;
    const now = this.clock();
    if (isV2JobCancellation(error) || entry.cancelRequested) {
      entry.record = {
        ...entry.record,
        state: "cancelled",
        stoppedAt: now,
        finishedAt: now,
      };
      this.settleEntry(entry);
      this.pump();
      return;
    }
    const code = isV2OperationFailure(error) ? error.failureCode : "handler-failed";
    entry.record = {
      ...entry.record,
      state: "failed",
      error: { code, message: error instanceof Error ? error.message : String(error) },
      stoppedAt: now,
      finishedAt: now,
    };
    this.settleEntry(entry);
    this.pump();
  }

  private settleEntry(entry: JobEntry): void {
    this.emit(entry.record);
    const waiters = entry.waiters.splice(0);
    const record = { ...entry.record };
    for (const waiter of waiters) waiter({ ...record });
    entry.run = undefined;
    this.evictHistory();
  }

  private evictHistory(): void {
    while (this.order.length > this.maxHistory) {
      const oldestId = this.order[0];
      const oldest = oldestId ? this.entries.get(oldestId) : undefined;
      if (!oldest || !isTerminal(oldest.record.state)) return;
      this.order.shift();
      this.entries.delete(oldestId as string);
      if (oldest.record.idempotencyKey !== undefined) {
        const key = idempotencyKeyFor(
          oldest.record.extensionId,
          oldest.record.commandId,
          oldest.record.idempotencyKey,
        );
        if (this.idempotency.get(key) === oldestId) this.idempotency.delete(key);
      }
    }
  }

  private emit(record: V2JobRecord): void {
    this.onTransition?.({ ...record });
  }
}

function isV2OperationFailure(error: unknown): error is { failureCode: V2FailureCode } {
  return (
    typeof error === "object" &&
    error !== null &&
    "failureCode" in error &&
    typeof (error as { failureCode: unknown }).failureCode === "string"
  );
}

function idempotencyKeyFor(extensionId: string, commandId: string, key: string): string {
  return `${extensionId} ${commandId} ${key}`;
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Validate a client-supplied idempotency key. Returns the key, or
 * undefined when absent. Anything else is rejected so duplicate
 * detection keys stay comparable and bounded.
 */
export function sanitizeV2IdempotencyKey(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(raw)) {
    throw new Error(
      "idempotencyKey must be 1-128 characters of letters, digits, dot, underscore, colon, or hyphen.",
    );
  }
  return raw;
}

function parseSnapshotRecord(raw: unknown): V2JobRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.jobId !== "string" || typeof candidate.invocationId !== "string") return null;
  if (typeof candidate.extensionId !== "string" || typeof candidate.commandId !== "string") return null;
  if (!isJobState(candidate.state)) return null;
  if (typeof candidate.createdAt !== "string") return null;
  const progress = candidate.progress;
  const partial = candidate.partial;
  if (
    typeof progress !== "object" ||
    progress === null ||
    typeof (progress as { completed?: unknown }).completed !== "number"
  ) {
    return null;
  }
  if (typeof partial !== "object" || partial === null) return null;
  return {
    jobId: candidate.jobId,
    invocationId: candidate.invocationId,
    ...(typeof candidate.idempotencyKey === "string" ? { idempotencyKey: candidate.idempotencyKey } : {}),
    ...(typeof candidate.requestFingerprint === "string"
      ? { requestFingerprint: candidate.requestFingerprint }
      : {}),
    extensionId: candidate.extensionId,
    commandId: candidate.commandId,
    state: candidate.state,
    createdAt: candidate.createdAt,
    ...(typeof candidate.startedAt === "string" ? { startedAt: candidate.startedAt } : {}),
    ...(typeof candidate.finishedAt === "string" ? { finishedAt: candidate.finishedAt } : {}),
    ...(typeof candidate.cancellationRequestedAt === "string"
      ? { cancellationRequestedAt: candidate.cancellationRequestedAt }
      : {}),
    ...(typeof candidate.stoppedAt === "string" ? { stoppedAt: candidate.stoppedAt } : {}),
    progress: {
      completed: (progress as V2JobProgress).completed,
      total: typeof (progress as V2JobProgress).total === "number"
        ? (progress as V2JobProgress).total
        : null,
      updatedAt:
        typeof (progress as V2JobProgress).updatedAt === "string"
          ? (progress as V2JobProgress).updatedAt
          : candidate.createdAt,
    },
    partial: {
      succeeded: typeof (partial as V2JobPartial).succeeded === "number"
        ? (partial as V2JobPartial).succeeded
        : 0,
      failed: Array.isArray((partial as V2JobPartial).failed)
        ? (partial as V2JobPartial).failed.filter(
            (item): item is V2JobPartialFailure =>
              typeof item === "object" &&
              item !== null &&
              typeof (item as V2JobPartialFailure).id === "string" &&
              typeof (item as V2JobPartialFailure).reason === "string",
          )
        : [],
      incomplete: (partial as V2JobPartial).incomplete === true,
      ...(typeof (partial as V2JobPartial).incompleteReason === "string"
        ? { incompleteReason: (partial as V2JobPartial).incompleteReason }
        : {}),
    },
    outputs: Array.isArray(candidate.outputs)
      ? candidate.outputs.filter((item): item is string => typeof item === "string")
      : [],
    ...(isDestination(candidate.destination) ? { destination: candidate.destination } : {}),
    ...(typeof candidate.error === "object" && candidate.error !== null
      ? { error: candidate.error as V2JobRecord["error"] }
      : {}),
    ...(typeof candidate.recovery === "object" && candidate.recovery !== null
      ? { recovery: candidate.recovery as V2JobRecord["recovery"] }
      : {}),
  };
}

function isJobState(value: unknown): value is V2JobState {
  return (
    value === "queued" ||
    value === "running" ||
    value === "cancellation-requested" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "interrupted"
  );
}

function isDestination(value: unknown): value is V2JobDestination {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as V2JobDestination).grantId === "string" &&
    typeof (value as V2JobDestination).rootPath === "string"
  );
}
