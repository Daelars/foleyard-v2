import type { IndexedAudioFile } from "../domain/audio-file";

import {
  availabilityFailureCode,
  evaluateV2SnapshotAvailability,
  type V2AvailabilityState,
} from "./availability";
import {
  validateV2Value,
  type ExtensionV2Command,
  type ExtensionV2CommandScope,
  type ExtensionV2Definition,
} from "./definition";
import {
  createV2InvocationId,
  resolveV2Ownership,
  V2_PAYLOAD_LIMITS,
  type V2ExecuteRequest,
  type V2ExecutionResult,
  type V2Failure,
  type V2FailureCode,
  type V2HandlerResult,
  type V2Invocation,
  type V2SelectionSnapshot,
} from "./invocation";
import {
  denyAllV2Operations,
  V2OperationError,
  type V2JobReporter,
  type V2OperationServices,
} from "./operations";
import {
  V2PlanManager,
  type V2AppliedPlan,
  type V2PlanReview,
} from "./plans";
import {
  sanitizeV2IdempotencyKey,
  V2JobManager,
  type V2JobCompletion,
  type V2JobRecord,
} from "./jobs";
import { computeEffectiveV2Permissions } from "./permissions";
import {
  parseV2SelectionSnapshot,
  resolveV2Selection,
  type V2LibraryPorts,
  type V2SelectionResolver,
} from "./selection";
import type { ExtensionV2Registry } from "./registry";

/**
 * Single v2 execution path (Yard Core context, R2).
 *
 * Direct invocation and the HTTP codec both run `execute`: ownership is
 * resolved before expensive hydration, the shared availability evaluator
 * is rechecked at execution start, and handlers run with a constrained
 * context (validated input, authorized records, effective permissions).
 *
 * Handler lookup is an ownership-keyed table populated through
 * `registerHandler`, which verifies registry ownership up front. There
 * are no per-command branches: the table key is derived from the
 * definition, never from handwritten command-name cases.
 */

/** Constrained handler context: validated input, authorized records, effective set, narrow services. */
export type V2HandlerContext = {
  invocation: V2Invocation;
  files: IndexedAudioFile[];
  folderPath?: string;
  collectionId?: string;
  /**
   * How this handler run was reached (R8): `direct` previews without
   * side effects, `apply` runs after a reviewed plan, `job` runs in
   * the background with progress and cancellation. Handlers that
   * preview through review plans and export through jobs need this
   * to tell confirmation from execution — input flags are never a
   * substitute, since apply carries the stored record, not client input.
   */
  runMode: V2RunMode;
  /** Capability IDs present at execution start. */
  capabilities: string[];
  /** Effective permissions: declared by the definition and granted by the application. */
  permissions: string[];
  /**
   * Narrow semantic services bound to this invocation. Every method
   * re-checks the effective set, so a handler that omits its own check
   * still cannot read or write beyond its grants.
   */
  operations: V2OperationServices;
  /**
   * Present only on apply: the host-validated plan (targets/options from
   * the stored record, never client input). Handlers branch on its
   * presence — preview on first call, effect on apply — with no
   * per-command host branches.
   */
  plan?: V2AppliedPlan;
};

export type V2CommandHandler = (
  context: V2HandlerContext,
) => V2HandlerResult | Promise<V2HandlerResult>;

/** How a handler run was reached: preview, reviewed apply, or background job. */
export type V2RunMode = "direct" | "apply" | "job";

export type V2HostServices = {
  registry: ExtensionV2Registry;
  isEnabled(extensionId: string): boolean;
  /** Runtime capabilities present; unknown IDs simply never appear here. */
  capabilities: ReadonlySet<string> | readonly string[] | Record<string, boolean>;
  /** Approved permissions for an extension; #167 owns the approval policy. */
  grantedPermissions(extensionId: string): ReadonlySet<string> | readonly string[];
  ports: V2LibraryPorts;
  /** Scope-contract resolver overrides (fixtures, drop adapters); keyed by scope. */
  selectionResolvers?: Partial<Record<ExtensionV2CommandScope, V2SelectionResolver>>;
  /**
   * Build narrow operation services for an invocation. The application
   * supplies a factory closing over its ports and grant storage; the
   * host passes the binding (owner, invocation, effective set) so the
   * same effective set drives preflight, context, and services. Hosts
   * without a factory get deny-all services.
   *
   * Job submits additionally pass the job-bound reporter, so per-call
   * cancellation checks inside file/archive operations observe the
   * same signal as `operations.jobs.throwIfCancelled`.
   */
  createOperations?: (binding: {
    extensionId: string;
    invocationId: string;
    effectivePermissions: string[];
    reporter?: V2JobReporter;
  }) => V2OperationServices;
  /**
   * Re-authorize a destination grant at apply time (R5). The application
   * supplies its grant storage here; hosts without it skip the grant
   * re-check (operation services still enforce grants per call).
   */
  authorizeGrant?: (
    grantId: string,
    extensionId: string,
  ) => { ok: true } | { ok: false; message: string };
  /**
   * Shared job lifecycle owner. Injected so the application can hold
   * one manager across host instances; defaults to a private manager.
   */
  jobManager?: V2JobManager;
  /**
   * Shared plan lifecycle owner (R5). Injected so the application can
   * hold one manager across host instances; defaults to a private
   * manager bound to this registry.
   */
  planManager?: V2PlanManager;
};

function fail(
  code: V2FailureCode,
  message: string,
  request: V2ExecuteRequest,
  invocationId?: string,
): V2ExecutionResult {
  const failure: V2Failure = {
    ok: false,
    code,
    message,
    extensionId: request.extensionId,
    commandId: request.commandId,
  };
  if (invocationId) failure.invocationId = invocationId;
  return failure;
}

function capabilityList(
  capabilities: V2HostServices["capabilities"],
): string[] {
  if (capabilities instanceof Set) return Array.from(capabilities);
  if (Array.isArray(capabilities)) return [...capabilities];
  return Object.entries(capabilities)
    .filter(([, present]) => present === true)
    .map(([id]) => id);
}

function grantedList(
  granted: ReadonlySet<string> | readonly string[],
): string[] {
  return granted instanceof Set ? Array.from(granted) : [...granted];
}

type V2Preflight =
  | {
      ok: true;
      invocation: V2Invocation;
      definition: ExtensionV2Definition;
      command: ExtensionV2Command;
      selection: V2SelectionSnapshot;
      files: IndexedAudioFile[];
      folderPath?: string;
      collectionId?: string;
      effective: string[];
    }
  | { ok: false; result: V2ExecutionResult };

function estimatedBytes(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export class ExtensionV2Host {
  private readonly handlers = new Map<string, V2CommandHandler>();
  /** Host-owned job lifecycle: one manager per host, shareable across instances. */
  readonly jobs: V2JobManager;
  /** Host-owned review plans: one manager per host, shareable across instances. */
  readonly plans: V2PlanManager;

  constructor(private readonly services: V2HostServices) {
    this.jobs = services.jobManager ?? new V2JobManager();
    this.plans = services.planManager ?? new V2PlanManager(services.registry);
  }

  /**
   * Register a command handler. Ownership is verified against the
   * registry now, so execution never consults a command-name table:
   * the key is derived from validated ownership.
   */
  registerHandler(
    extensionId: string,
    commandId: string,
    handler: V2CommandHandler,
  ): void {
    const ownership = resolveV2Ownership(
      this.services.registry,
      extensionId,
      commandId,
    );
    if (!ownership.ok) {
      throw new Error(ownership.failure.message);
    }
    this.handlers.set(`${extensionId} ${commandId}`, handler);
  }

  hasHandler(extensionId: string, commandId: string): boolean {
    return this.handlers.has(`${extensionId} ${commandId}`);
  }

  /**
   * Shared preflight for direct, HTTP, immediate, and job invocation.
   *
   * Order: ownership → enabled → snapshot parse → availability preflight
   * (rechecked here even when the renderer already evaluated it) → input
   * validation → authorized selection resolution (the first expensive
   * step). Neither `execute` nor `submitJob` runs a handler without it.
   */
  private async preflight(request: V2ExecuteRequest): Promise<V2Preflight> {
    const invocationId = createV2InvocationId();

    const ownership = resolveV2Ownership(
      this.services.registry,
      request.extensionId,
      request.commandId,
    );
    if (!ownership.ok) {
      return { ok: false, result: { ...ownership.failure, invocationId } };
    }
    const { definition, command } = ownership;

    if (!this.services.isEnabled(request.extensionId)) {
      return {
        ok: false,
        result: fail(
          "extension-disabled",
          `Extension "${definition.name}" is disabled; enable it to run "${command.title}".`,
          request,
          invocationId,
        ),
      };
    }

    const parsed = parseV2SelectionSnapshot(request.selection);
    if (!parsed.ok) {
      return {
        ok: false,
        result: {
          ...parsed.failure,
          invocationId,
          extensionId: request.extensionId,
          commandId: request.commandId,
        },
      };
    }

    const granted = grantedList(this.services.grantedPermissions(request.extensionId));
    const availability = evaluateV2SnapshotAvailability(
      definition,
      command,
      parsed.snapshot,
      request.input,
      {
        enabled: true,
        capabilities: this.services.capabilities,
        grantedPermissions: granted,
      } satisfies V2AvailabilityState,
    );
    if (!availability.available) {
      return {
        ok: false,
        result: fail(
          availabilityFailureCode(availability.code) as V2FailureCode,
          availability.reason,
          request,
          invocationId,
        ),
      };
    }

    if (request.input !== undefined && command.input !== undefined) {
      if (estimatedBytes(request.input) > V2_PAYLOAD_LIMITS.maxInputBytes) {
        return {
          ok: false,
          result: fail(
            "payload-too-large",
            `Input payload exceeds the ${V2_PAYLOAD_LIMITS.maxInputBytes}-byte limit; send a smaller payload.`,
            request,
            invocationId,
          ),
        };
      }
      const invalid = validateV2Value(command.input, request.input);
      if (invalid) {
        return {
          ok: false,
          result: fail(
            "input-invalid",
            `Input for "${command.title}" is invalid: ${invalid}`,
            request,
            invocationId,
          ),
        };
      }
    }

    const resolved = await resolveV2Selection(
      parsed.snapshot,
      command,
      request.extensionId,
      this.services.ports,
      this.services.selectionResolvers,
    );
    if (!resolved.ok) {
      return { ok: false, result: { ...resolved.failure, invocationId } };
    }

    const handler = this.handlers.get(`${request.extensionId} ${request.commandId}`);
    if (!handler) {
      return {
        ok: false,
        result: fail(
          "handler-missing",
          `Command "${request.commandId}" has no registered handler; the extension needs an update.`,
          request,
          invocationId,
        ),
      };
    }

    const invocation: V2Invocation = {
      invocationId,
      extensionId: request.extensionId,
      commandId: request.commandId,
      input: request.input ?? null,
      selection: parsed.snapshot,
      requestedAt: new Date().toISOString(),
    };
    return {
      ok: true,
      invocation,
      definition,
      command,
      selection: parsed.snapshot,
      files: resolved.selection.files,
      ...(resolved.selection.folderPath !== undefined
        ? { folderPath: resolved.selection.folderPath }
        : {}),
      ...(resolved.selection.collectionId !== undefined
        ? { collectionId: resolved.selection.collectionId }
        : {}),
      effective: computeEffectiveV2Permissions(definition.permissions, granted),
    };
  }

  private operationsFor(
    checked: Extract<V2Preflight, { ok: true }>,
    reporter?: V2JobReporter,
  ): V2OperationServices {
    const { invocation, effective } = checked;
    const base = this.services.createOperations
      ? this.services.createOperations({
          extensionId: invocation.extensionId,
          invocationId: invocation.invocationId,
          effectivePermissions: effective,
          ...(reporter ? { reporter } : {}),
        })
      : (() => {
          const denyAll = denyAllV2Operations(invocation.extensionId);
          const activeReporter = reporter;
          if (!activeReporter) return denyAll;
          return {
            ...denyAll,
            jobs: {
              reportProgress: (completed: number, total: number) =>
                activeReporter.reportProgress(completed, total),
              throwIfCancelled: () => activeReporter.throwIfCancelled(),
            },
          };
        })();
    // The host always binds the plans service to its own plan manager:
    // preparation, review, and apply share one lifecycle per host, so a
    // factory-supplied manager could never satisfy the execute-time
    // binding check below.
    const plans = {
      prepare: (spec: Parameters<V2OperationServices["plans"]["prepare"]>[0]) => {
        const record = this.plans.prepare(
          {
            extensionId: invocation.extensionId,
            invocationId: invocation.invocationId,
            commandId: checked.command.id,
            effectivePermissions: effective,
            capabilities: capabilityList(this.services.capabilities),
          },
          spec,
        );
        return { planId: record.planId, expiresAt: record.expiresAt };
      },
    };
    return { ...base, plans };
  }

  private handlerContext(
    checked: Extract<V2Preflight, { ok: true }>,
    operations: V2OperationServices,
    plan?: V2AppliedPlan,
    runMode: V2RunMode = "direct",
  ): V2HandlerContext {
    return {
      invocation: checked.invocation,
      files: checked.files,
      ...(checked.folderPath !== undefined ? { folderPath: checked.folderPath } : {}),
      ...(checked.collectionId !== undefined ? { collectionId: checked.collectionId } : {}),
      runMode,
      capabilities: capabilityList(this.services.capabilities),
      permissions: checked.effective,
      operations,
      ...(plan ? { plan } : {}),
    };
  }

  /**
   * One execution path for direct and HTTP invocation.
   *
   * Runs the shared preflight, then the registered handler with a
   * constrained context (validated input, authorized records,
   * effective permissions).
   */
  async execute(request: V2ExecuteRequest): Promise<V2ExecutionResult> {
    const checked = await this.preflight(request);
    if (!checked.ok) return checked.result;
    const { command } = checked;

    const operations = this.operationsFor(checked);
    let produced: V2HandlerResult;
    try {
      produced = await this.handlers.get(
        `${checked.invocation.extensionId} ${checked.invocation.commandId}`,
      )!(this.handlerContext(checked, operations, undefined, "direct"));
    } catch (error) {
      if (error instanceof V2OperationError) {
        return fail(error.failureCode, error.message, request, checked.invocation.invocationId);
      }
      return fail(
        "handler-failed",
        `Command "${command.title}" failed: ${error instanceof Error ? error.message : String(error)}`,
        request,
        checked.invocation.invocationId,
      );
    }

    const invocationId = checked.invocation.invocationId;
    if (produced.kind === "review-required") {
      // Host-validated binding: the plan must exist, belong to this
      // extension, and be bound to this invocation. Handlers cannot mint
      // plan IDs by hand — only `operations.plans.prepare` creates them.
      // The outcome carries the stored record's summary/expiry, never the
      // handler's strings.
      const record = this.plans.peek(produced.planId);
      if (
        !record ||
        record.extensionId !== checked.invocation.extensionId ||
        record.invocationId !== invocationId
      ) {
        return fail(
          "result-invalid",
          `Command "${command.title}" returned an unknown plan; prepare it with operations.plans.prepare first.`,
          request,
          invocationId,
        );
      }
      return {
        ok: true,
        outcome: {
          kind: "review-required",
          invocationId,
          planId: record.planId,
          summary: record.preview.summary,
          expiresAt: record.expiresAt,
        },
      };
    }
    if (produced.kind === "job") {
      return {
        ok: true,
        outcome: {
          kind: "job",
          invocationId,
          jobId: produced.jobId,
          state: produced.state,
        },
      };
    }
    if (command.result !== undefined) {
      const invalid = validateV2Value(command.result, produced.value, "result");
      if (invalid) {
        return fail(
          "result-invalid",
          `Command "${command.title}" produced an invalid result: ${invalid}`,
          request,
          invocationId,
        );
      }
    }
    return { ok: true, outcome: { kind: "immediate", invocationId, value: produced.value } };
  }

  /**
   * Start host-owned job work for a command (R4).
   *
   * Runs the same preflight as `execute`, then creates a `vjob_` record
   * and runs the registered handler inside the job lifecycle with a
   * job-bound reporter: progress lands on the record, cancellation is
   * observed cooperatively, and the terminal state is recorded only
   * after the handler settles. In job mode the handler's immediate
   * return becomes the completion value (validated against the command
   * result schema); `review-required`/`job` returns are rejected as
   * invalid because review belongs to the R5 plan flow, not to a job.
   *
   * Duplicate `idempotencyKey` values for the same extension and
   * command return the existing job; no duplicate work starts. The
   * enabled gate is checked at submit and again when queued work
   * reaches the front.
   */
  async submitJob(request: V2ExecuteRequest): Promise<V2ExecutionResult> {
    let idempotencyKey: string | undefined;
    try {
      idempotencyKey = sanitizeV2IdempotencyKey(request.idempotencyKey);
    } catch (error) {
      return {
        ok: false,
        code: "input-invalid",
        message: error instanceof Error ? error.message : String(error),
        extensionId: request.extensionId,
        commandId: request.commandId,
      };
    }
    const checked = await this.preflight(request);
    if (!checked.ok) return checked.result;
    const { command } = checked;
    const invocationId = checked.invocation.invocationId;
    const extensionId = checked.invocation.extensionId;

    const handler = this.handlers.get(`${extensionId} ${checked.invocation.commandId}`)!;
    const gate = (): string | null =>
      this.services.isEnabled(extensionId)
        ? null
        : `Extension "${checked.definition.name}" is disabled; enable it to run "${command.title}".`;
    let submitted: { record: V2JobRecord; duplicate: boolean };
    try {
      submitted = this.jobs.submit({
        extensionId,
        commandId: checked.invocation.commandId,
        invocationId,
        ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
        gate,
        run: async (context) => {
          const operations = this.operationsFor(checked, context.reporter);
          let produced: V2HandlerResult;
          try {
            produced = await handler(this.handlerContext(checked, operations, undefined, "job"));
          } catch (error) {
            if (error instanceof V2OperationError) {
              const completion: V2JobCompletion = {
                error: { code: error.failureCode, message: error.message },
              };
              return completion;
            }
            throw error;
          }
          if (produced.kind === "review-required" || produced.kind === "job") {
            const completion: V2JobCompletion = {
              error: {
                code: "result-invalid",
                message: `Command "${command.title}" returned "${produced.kind}" inside a job; jobs complete with immediate values.`,
              },
            };
            return completion;
          }
          if (command.result !== undefined) {
            const invalid = validateV2Value(command.result, produced.value, "result");
            if (invalid) {
              const completion: V2JobCompletion = {
                error: {
                  code: "result-invalid",
                  message: `Command "${command.title}" produced an invalid result: ${invalid}`,
                },
              };
              return completion;
            }
          }
          return { value: produced.value, outputs: operations.workspace.ownedPaths() };
        },
      });
    } catch (error) {
      return {
        ok: false,
        code: "extension-disabled",
        message: error instanceof Error ? error.message : String(error),
        invocationId,
        extensionId,
        commandId: checked.invocation.commandId,
      };
    }
    const state = submitted.record.state === "running" ? "running" : "queued";
    return {
      ok: true,
      outcome: {
        kind: "job",
        invocationId: submitted.record.invocationId,
        jobId: submitted.record.jobId,
        state,
        ...(submitted.duplicate ? { duplicate: true as const } : {}),
      },
    };
  }

  /**
   * Host-recorded review read (R5). Stamps `reviewedAt`, which is the
   * only thing that unlocks a destructive apply — a client
   * `confirmed: true` flag is never consulted.
   */
  reviewPlan(planId: string): { ok: true; review: V2PlanReview } | V2Failure {
    const peeked = this.plans.peek(planId);
    if (!peeked) {
      return {
        ok: false,
        code: "plan-unknown",
        message: `Plan "${planId}" is unknown; it may have expired, been evicted, or belonged to a restarted process. Prepare a new plan.`,
      };
    }
    try {
      return { ok: true, review: this.plans.review(planId, peeked.extensionId) };
    } catch (error) {
      if (error instanceof V2OperationError) {
        return {
          ok: false,
          code: error.failureCode,
          message: error.message,
          extensionId: peeked.extensionId,
          commandId: peeked.commandId,
        };
      }
      throw error;
    }
  }

  /**
   * Apply a reviewed plan (R5).
   *
   * Revalidates everything prepare bound: unknown/consumed/expired
   * state, byte-identical echo of targets/options (`plan-altered`
   * otherwise), the destructive review stamp, enablement, command
   * ownership, effective permissions, destination grants, Library
   * targets, and availability. Pre-execution rejections leave a pending
   * plan pending; once the handler starts, the plan is consumed whether
   * it succeeds or fails, and a retry prepares a new plan.
   */
  async applyPlan(
    planId: string,
    echoed: { targets?: unknown; options?: unknown },
  ): Promise<V2ExecutionResult> {
    const peeked = this.plans.peek(planId);
    if (!peeked) {
      return {
        ok: false,
        code: "plan-unknown",
        message: `Plan "${planId}" is unknown; it may have expired, been evicted, or belonged to a restarted process. Prepare a new plan.`,
      };
    }
    const request: V2ExecuteRequest = {
      extensionId: peeked.extensionId,
      commandId: peeked.commandId,
    };
    let record;
    try {
      record = this.plans.checkForApply(planId, peeked.extensionId, echoed);
    } catch (error) {
      if (error instanceof V2OperationError) {
        return {
          ok: false,
          code: error.failureCode,
          message: error.message,
          invocationId: peeked.invocationId,
          extensionId: peeked.extensionId,
          commandId: peeked.commandId,
        };
      }
      throw error;
    }

    const ownership = resolveV2Ownership(this.services.registry, record.extensionId, record.commandId);
    if (!ownership.ok) return ownership.failure;
    const { definition, command } = ownership;

    if (!this.services.isEnabled(record.extensionId)) {
      return fail(
        "extension-disabled",
        `Extension "${definition.name}" is disabled; enable it to apply this plan.`,
        request,
      );
    }

    const granted = grantedList(this.services.grantedPermissions(record.extensionId));
    const effective = computeEffectiveV2Permissions(definition.permissions, granted);
    const effectiveSet = new Set<string>(effective);
    const lapsed = record.requiredPermissions.filter((permission) => !effectiveSet.has(permission));
    if (lapsed.length > 0) {
      return fail(
        "permission-denied",
        `Plan "${planId}" needs ${lapsed.map((permission) => `"${permission}"`).join(", ")} but approval lapsed since review; re-approve and prepare a new plan.`,
        request,
      );
    }

    if (this.services.authorizeGrant) {
      for (const grantId of record.grantIds) {
        const authorized = this.services.authorizeGrant(grantId, record.extensionId);
        if (!authorized.ok) {
          return fail(
            "permission-denied",
            `Plan "${planId}" needs destination grant "${grantId}" again: ${authorized.message}`,
            request,
          );
        }
      }
    }

    const resolved = this.services.ports.getFilesByIds(record.targets.fileIds);
    const byId = new Map(resolved.map((file) => [file.id, file]));
    const changed = record.targets.fileIds.filter((id) => {
      const file = byId.get(id);
      return !file || file.removedAt !== null;
    });
    if (changed.length > 0) {
      return fail(
        "plan-altered",
        `Plan "${planId}" targets changed since review (${changed.length} sound(s) left the Library index); refresh the preview and prepare a new plan.`,
        request,
      );
    }

    const availability = evaluateV2SnapshotAvailability(
      definition,
      command,
      { fileIds: record.targets.fileIds },
      record.options,
      {
        enabled: true,
        capabilities: this.services.capabilities,
        grantedPermissions: granted,
      } satisfies V2AvailabilityState,
    );
    if (!availability.available) {
      return fail(
        availabilityFailureCode(availability.code) as V2FailureCode,
        availability.reason,
        request,
      );
    }

    const handler = this.handlers.get(`${record.extensionId} ${record.commandId}`);
    if (!handler) {
      return fail(
        "handler-missing",
        `Command "${record.commandId}" has no registered handler; the extension needs an update.`,
        request,
      );
    }

    // Execution starts here: consume first so a duplicate apply reports
    // `plan-consumed` instead of running twice.
    this.plans.markConsumed(planId);
    const invocation: V2Invocation = {
      invocationId: createV2InvocationId(),
      extensionId: record.extensionId,
      commandId: record.commandId,
      input: record.options,
      selection: { fileIds: record.targets.fileIds },
      requestedAt: new Date().toISOString(),
    };
    const checked: Extract<V2Preflight, { ok: true }> = {
      ok: true,
      invocation,
      definition,
      command,
      selection: { fileIds: record.targets.fileIds },
      files: resolved.filter((file) => record.targets.fileIds.includes(file.id)),
      effective,
    };
    const operations = this.operationsFor(checked);
    const plan: V2AppliedPlan = {
      planId: record.planId,
      targets: { fileIds: [...record.targets.fileIds] },
      options: record.options,
      ...(record.reviewedAt ? { reviewedAt: record.reviewedAt } : {}),
    };
    let produced: V2HandlerResult;
    try {
      produced = await handler(this.handlerContext(checked, operations, plan, "apply"));
    } catch (error) {
      if (error instanceof V2OperationError) {
        return fail(error.failureCode, error.message, request, invocation.invocationId);
      }
      return fail(
        "handler-failed",
        `Command "${command.title}" failed: ${error instanceof Error ? error.message : String(error)}`,
        request,
        invocation.invocationId,
      );
    }
    if (produced.kind !== "immediate") {
      return fail(
        "result-invalid",
        `Command "${command.title}" returned "${produced.kind}" on apply; apply completes with an immediate value.`,
        request,
        invocation.invocationId,
      );
    }
    if (command.result !== undefined) {
      const invalid = validateV2Value(command.result, produced.value, "result");
      if (invalid) {
        return fail(
          "result-invalid",
          `Command "${command.title}" produced an invalid result: ${invalid}`,
          request,
          invocation.invocationId,
        );
      }
    }
    return { ok: true, outcome: { kind: "immediate", invocationId: invocation.invocationId, value: produced.value } };
  }

  getJob(jobId: string): V2JobRecord | null {
    return this.jobs.getJob(jobId);
  }
  cancelJob(jobId: string): V2JobRecord | null {
    return this.jobs.requestCancel(jobId);
  }

  /** Disable path: reject queued starts via the gate and request cancellation of live work. */
  cancelExtensionJobs(extensionId: string, reason: string): { queued: number; running: number } {
    return this.jobs.cancelExtensionJobs(extensionId, reason);
  }
}
