import { YardCoreError } from "../errors/yard-core-error";

import type { ExtensionV2Command, ExtensionV2Definition } from "./definition";
import type { ExtensionV2Registry } from "./registry";

/**
 * Canonical v2 invocation and outcome contracts (Yard Core context, R2).
 *
 * One invocation carries everything the execution path needs: a unique
 * invocation ID, extension/command ownership, validated input, and a
 * validated selection snapshot. Outcomes are immediate values, reviewed
 * interaction, or jobs; subscription events are a separate concern owned
 * by later tickets and never appear in this union.
 *
 * Framework-free: no React, routes, database handles, or v1 imports.
 */

/**
 * Payload limits shared by direct and HTTP entry paths. Documented in
 * transport.ts alongside route names and status mappings.
 */
export const V2_PAYLOAD_LIMITS = {
  /** Largest accepted request envelope (direct or HTTP), in bytes. */
  maxBodyBytes: 262_144,
  /** Largest accepted command input payload, in serialized bytes. */
  maxInputBytes: 65_536,
  /** Largest accepted selection ID list. */
  maxFileIds: 500,
} as const;

export type V2FailureCode =
  | "extension-unknown"
  | "command-unknown"
  | "command-unowned"
  | "extension-disabled"
  | "input-invalid"
  | "selection-invalid"
  | "selection-empty"
  | "selection-unresolvable"
  | "context-unsupported"
  | "capability-unavailable"
  | "permission-denied"
  | "payload-too-large"
  | "handler-missing"
  | "handler-failed"
  | "result-invalid"
  | "job-unknown"
  | "plan-unknown"
  | "plan-expired"
  | "plan-altered"
  | "plan-consumed"
  | "review-required";

export type V2Failure = {
  ok: false;
  code: V2FailureCode;
  /** User-readable: what failed and how to fix it. */
  message: string;
  invocationId?: string;
  extensionId?: string;
  commandId?: string;
};

/**
 * Validated selection snapshot. IDs only: a client-supplied file path is
 * never authorization, so paths are rejected at the boundary (see
 * selection.ts) and IDs resolve through authorized Library operations.
 */
export type V2SelectionSnapshot = {
  fileIds: string[];
  folderPath?: string;
  collectionId?: string;
  dropFileCount?: number;
};

export function emptyV2Selection(): V2SelectionSnapshot {
  return { fileIds: [] };
}

/** Untrusted entry shape shared by direct calls and the HTTP codec. */
export type V2ExecuteRequest = {
  extensionId: string;
  commandId: string;
  input?: unknown;
  /** Untrusted snapshot; validated before use. */
  selection?: unknown;
  /**
   * Client-supplied idempotency key for job submits (R4). Validated by
   * `sanitizeV2IdempotencyKey`; duplicate keys for the same extension
   * and command return the existing job instead of starting new work.
   */
  idempotencyKey?: unknown;
};

/** Validated invocation: safe for the execution path to consume. */
export type V2Invocation = {
  invocationId: string;
  extensionId: string;
  commandId: string;
  /** Input already checked against the command schema. */
  input: unknown;
  selection: V2SelectionSnapshot;
  requestedAt: string;
};

export type V2ImmediateOutcome = {
  kind: "immediate";
  invocationId: string;
  value: unknown;
};

export type V2ReviewOutcome = {
  kind: "review-required";
  invocationId: string;
  planId: string;
  summary: string;
  expiresAt: string;
};

export type V2JobOutcome = {
  kind: "job";
  invocationId: string;
  jobId: string;
  state: "queued" | "running";
  /** True when an idempotency key matched an existing job; no new work started. */
  duplicate?: boolean;
};

export type V2SuccessOutcome =
  | V2ImmediateOutcome
  | V2ReviewOutcome
  | V2JobOutcome;

export type V2ExecutionResult =
  | { ok: true; outcome: V2SuccessOutcome }
  | V2Failure;

/**
 * What a command handler returns. The execution path stamps the
 * invocation ID; handlers never mint outcome envelopes themselves.
 */
export type V2HandlerResult =
  | { kind?: "immediate"; value: unknown }
  | { kind: "review-required"; planId: string; summary: string; expiresAt: string }
  | { kind: "job"; jobId: string; state: "queued" | "running" };

export function immediateV2Result(value: unknown): V2HandlerResult {
  return { kind: "immediate", value };
}

export function reviewV2Result(
  planId: string,
  summary: string,
  expiresAt: string,
): V2HandlerResult {
  return { kind: "review-required", planId, summary, expiresAt };
}

export function jobV2Result(
  jobId: string,
  state: "queued" | "running" = "queued",
): V2HandlerResult {
  return { kind: "job", jobId, state };
}

export class V2InvocationError extends YardCoreError {
  constructor(
    message: string,
    readonly failure: V2Failure,
  ) {
    super(message, "EXTENSION_V2_INVOCATION_INVALID");
    this.name = "V2InvocationError";
    this.failure = failure;
  }
}

let fallbackCounter = 0;

/** Unique invocation ID (`vinv_<uuid>`), usable as an idempotency key. */
export function createV2InvocationId(): string {
  const cryptoRef = (
    globalThis as { crypto?: { randomUUID?: () => string } }
  ).crypto;
  if (cryptoRef?.randomUUID) {
    return `vinv_${cryptoRef.randomUUID()}`;
  }
  fallbackCounter += 1;
  return `vinv_fallback-${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${Math.floor(
    Math.random() * 0xffffffff,
  ).toString(36)}`;
}

export type V2Ownership =
  | { ok: true; definition: ExtensionV2Definition; command: ExtensionV2Command }
  | { ok: false; failure: V2Failure };

/**
 * Resolve extension/command ownership from the registry. Pure lookup: no
 * selection hydration, no handler execution. The execution path calls this
 * first so unknown owners fail before any expensive work.
 */
export function resolveV2Ownership(
  registry: ExtensionV2Registry,
  extensionId: string,
  commandId: string,
): V2Ownership {
  const definition = registry.get(extensionId);
  if (!definition) {
    return {
      ok: false,
      failure: {
        ok: false,
        code: "extension-unknown",
        message: `Extension "${extensionId}" is not registered.`,
        extensionId,
        commandId,
      },
    };
  }
  const command = definition.commands.find((entry) => entry.id === commandId);
  if (!command) {
    const ownedElsewhere =
      commandId.includes(".") &&
      registry
        .list()
        .some(
          (other) =>
            other.id !== extensionId &&
            other.commands.some((entry) => entry.id === commandId),
        );
    if (ownedElsewhere) {
      return {
        ok: false,
        failure: {
          ok: false,
          code: "command-unowned",
          message: `Command "${commandId}" is not owned by extension "${extensionId}"; invoke it through its owning extension.`,
          extensionId,
          commandId,
        },
      };
    }
    return {
      ok: false,
      failure: {
        ok: false,
        code: "command-unknown",
        message: `Command "${commandId}" is not declared by extension "${extensionId}".`,
        extensionId,
        commandId,
      },
    };
  }
  return { ok: true, definition, command };
}
