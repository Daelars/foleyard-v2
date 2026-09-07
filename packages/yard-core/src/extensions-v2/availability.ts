import {
  validateV2Value,
  type ExtensionV2Command,
  type ExtensionV2Definition,
} from "./definition";
import type {
  V2SelectionSnapshot,
} from "./invocation";

/**
 * Shared v2 availability evaluator (Yard Core context, R2).
 *
 * One pure function used by BOTH the renderer (to enable/disable entries
 * with a user-readable reason) and execution preflight (rechecked when
 * execution actually starts). Renderer output never becomes permission
 * enforcement: the execution path re-evaluates before running anything.
 */

export type V2AvailabilityCode =
  | "disabled"
  | "context-mismatch"
  | "selection-required"
  | "selection-empty"
  | "input-invalid"
  | "capability-unavailable"
  | "permission-denied";

export type V2Availability =
  | { available: true }
  | { available: false; code: V2AvailabilityCode; reason: string };

/** Context the caller offers a command: selection, folder, Collection, drop, or none (global). */
export type V2AvailabilityContext = {
  fileIds?: string[];
  folderPath?: string;
  collectionId?: string;
  dropFileCount?: number;
  /** Provided input, checked against the command schema when present. */
  input?: unknown;
};

export type V2AvailabilityState = {
  enabled: boolean;
  /** Runtime capabilities present. Anything required but unknown counts as unavailable. */
  capabilities: ReadonlySet<string> | readonly string[] | Record<string, boolean>;
  /** Effective (approved) permissions for the extension. */
  grantedPermissions: ReadonlySet<string> | readonly string[];
};

function isReadonlySet(value: unknown): value is ReadonlySet<string> {
  return value instanceof Set;
}

function hasCapability(
  capabilities: V2AvailabilityState["capabilities"],
  id: string,
): boolean {
  if (isReadonlySet(capabilities)) return capabilities.has(id);
  if (Array.isArray(capabilities)) return capabilities.includes(id);
  return (capabilities as Record<string, boolean>)[id] === true;
}

function hasPermission(
  granted: V2AvailabilityState["grantedPermissions"],
  permission: string,
): boolean {
  if (isReadonlySet(granted)) return granted.has(permission);
  if (Array.isArray(granted)) return granted.includes(permission);
  return false;
}

function deny(code: V2AvailabilityCode, reason: string): V2Availability {
  return { available: false, code, reason };
}

/**
 * Evaluate whether `command` can run in `context` under `state`.
 * Deterministic and side-effect free; safe to call from renderers.
 */
export function evaluateV2Availability(
  definition: ExtensionV2Definition,
  command: ExtensionV2Command,
  context: V2AvailabilityContext,
  state: V2AvailabilityState,
): V2Availability {
  if (!state.enabled) {
    return deny(
      "disabled",
      `“${command.title}” is unavailable because extension “${definition.name}” is disabled. Enable it to use this command.`,
    );
  }

  const fileIds = context.fileIds ?? [];
  switch (command.scope) {
    case "global":
      break;
    case "selection":
      if (command.requiresSelection === true && fileIds.length === 0) {
        return deny(
          "selection-required",
          `“${command.title}” needs at least one selected sound; select Library items first.`,
        );
      }
      break;
    case "file":
      if (fileIds.length !== 1) {
        return deny(
          "context-mismatch",
          `“${command.title}” works on exactly one sound; select a single Library item (currently ${fileIds.length}).`,
        );
      }
      break;
    case "folder":
      if (!context.folderPath) {
        return deny(
          "context-mismatch",
          `“${command.title}” works on a folder; open it from a folder context.`,
        );
      }
      break;
    case "collection":
      if (!context.collectionId) {
        return deny(
          "context-mismatch",
          `“${command.title}” works on a Collection; open it from a Collection.`,
        );
      }
      break;
    case "drop":
      if (!context.dropFileCount || context.dropFileCount < 1) {
        return deny(
          "selection-empty",
          `“${command.title}” needs at least one dropped file; drop sounds onto the target first.`,
        );
      }
      break;
    default:
      return deny(
        "context-mismatch",
        `“${command.title}” declares an unsupported scope; the extension needs an update.`,
      );
  }

  if (context.input !== undefined && command.input !== undefined) {
    const invalid = validateV2Value(command.input, context.input);
    if (invalid) {
      return deny(
        "input-invalid",
        `“${command.title}” cannot run with the current input: ${invalid}`,
      );
    }
  }

  for (const capability of command.requiredCapabilities ?? []) {
    if (!hasCapability(state.capabilities, capability)) {
      return deny(
        "capability-unavailable",
        `“${command.title}” needs the “${capability}” capability, which is not available in this runtime.`,
      );
    }
  }

  for (const permission of definition.permissions) {
    if (!hasPermission(state.grantedPermissions, permission)) {
      return deny(
        "permission-denied",
        `“${command.title}” needs the “${permission}” permission, which is not granted to extension “${definition.name}”.`,
      );
    }
  }

  return { available: true };
}

/** Availability over a validated snapshot (execution preflight shape). */
export function evaluateV2SnapshotAvailability(
  definition: ExtensionV2Definition,
  command: ExtensionV2Command,
  snapshot: V2SelectionSnapshot,
  input: unknown,
  state: V2AvailabilityState,
): V2Availability {
  return evaluateV2Availability(
    definition,
    command,
    {
      fileIds: snapshot.fileIds,
      folderPath: snapshot.folderPath,
      collectionId: snapshot.collectionId,
      dropFileCount: snapshot.dropFileCount,
      input,
    },
    state,
  );
}

/** Map an availability denial to the typed execution failure code. */
export function availabilityFailureCode(code: V2AvailabilityCode): string {
  switch (code) {
    case "disabled":
      return "extension-disabled";
    case "context-mismatch":
      return "context-unsupported";
    case "selection-required":
    case "selection-empty":
      return "selection-empty";
    case "input-invalid":
      return "input-invalid";
    case "capability-unavailable":
      return "capability-unavailable";
    case "permission-denied":
      return "permission-denied";
  }
}
