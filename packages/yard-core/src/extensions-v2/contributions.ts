import {
  evaluateV2Availability,
  type V2Availability,
  type V2AvailabilityContext,
  type V2AvailabilityState,
} from "./availability";
import type {
  ExtensionV2CatalogEntry,
  ExtensionV2CatalogCommand,
} from "./catalog";
import type {
  ExtensionV2Command,
  ExtensionV2Contribution,
  ExtensionV2ContributionType,
  ExtensionV2Definition,
  ExtensionV2ValueSchema,
} from "./definition";

/**
 * Generic UI contribution resolution (Yard Core context, R6).
 *
 * The eight R6 contribution points are data-driven: every renderer
 * adapter below consumes `V2ResolvedContribution` records (data only —
 * never HTML, React, or executable renderer code) produced from the
 * serializable catalog plus the shared availability evaluator. The
 * renderer and execution preflight therefore agree on exactly what is
 * enabled and why: each resolved item carries its `V2Availability`
 * (with a user-readable reason when unavailable).
 *
 * Point vocabulary: the seven registered contribution types map onto
 * points, with file/folder context menus sharing one adapter over a
 * validated selection/context. Forms, previews, and results are not a
 * registered contribution type — they are driven by the command input
 * schema (`inputFieldsForSchema`), the #169 plan review payload
 * (`V2PlanPreview` tables/notices/details), and job status — so the
 * eighth adapter is schema/review/job data rendered generically.
 *
 * Stable IDs: `v2:{extensionId}:{contributionId}`. Contribution IDs are
 * already namespace-owned (the registry rejects unowned IDs), so keys
 * are unique across extensions and stable across reloads. Selection and
 * context updates never change keys: they only re-attach availability.
 *
 * Ordering: `order ?? 100` ascending; ties break by extension ID, then
 * contribution ID. Deterministic across processes and reloads.
 *
 * Collisions: two contributions never share a key (registration
 * rejects duplicate contribution IDs within an extension, and keys
 * carry the extension namespace). The same command contributed twice
 * to one point under different contribution IDs renders twice in
 * `order` sequence — each entry is independently invokable and
 * removable, so no silent dedup hides an author's entry.
 *
 * Disposal: `registry.unregister(extensionId)` plus the enabled filter
 * here removes every item; renderer adapters additionally unsubscribe
 * their `contributions-changed` listener (dispose is idempotent, per
 * the event bus) and must drop cached resolutions on receipt.
 *
 * Framework-free: no React, routes, database handles, or v1 imports.
 */

export type V2ContributionPoint =
  | "palette"
  | "context-menu"
  | "selection-actions"
  | "toolbar"
  | "sidebar"
  | "settings"
  | "drop-menu"
  | "interaction";

export const V2_CONTRIBUTION_POINTS: readonly V2ContributionPoint[] = [
  "palette",
  "context-menu",
  "selection-actions",
  "toolbar",
  "sidebar",
  "settings",
  "drop-menu",
  "interaction",
];

/** Map a registered contribution type onto its renderer point. */
export function contributionPointForType(
  type: ExtensionV2ContributionType,
): Exclude<V2ContributionPoint, "interaction"> {
  switch (type) {
    case "command-palette":
      return "palette";
    case "file-context-menu":
    case "folder-context-menu":
      return "context-menu";
    case "selection-actions":
      return "selection-actions";
    case "toolbar":
      return "toolbar";
    case "sidebar":
      return "sidebar";
    case "settings":
      return "settings";
    case "drop-menu":
      return "drop-menu";
  }
}

/** Default order when a contribution declares none. */
export const DEFAULT_V2_CONTRIBUTION_ORDER = 100;

/** Largest accepted selection/context ID list (matches transport limits). */
export const MAX_V2_CONTRIBUTION_IDS = 500;

export type V2ResolvedContribution = {
  /** Stable key: `v2:{extensionId}:{contributionId}`. */
  key: string;
  extensionId: string;
  extensionName: string;
  contributionId: string;
  contributionType: ExtensionV2ContributionType;
  point: V2ContributionPoint;
  commandId: string;
  /** Contribution title override, else the command title. */
  title: string;
  order: number;
  /** Attached by resolution; renderers show `reason` when unavailable. */
  availability: V2Availability;
};

export type V2ContributionResolutionState = {
  isEnabled: (extensionId: string) => boolean;
  capabilities: V2AvailabilityState["capabilities"];
  grantedPermissions: (extensionId: string) => readonly string[];
};

function toCommand(catalogCommand: ExtensionV2CatalogCommand): ExtensionV2Command {
  return {
    id: catalogCommand.id,
    title: catalogCommand.title,
    description: catalogCommand.description,
    scope: catalogCommand.scope,
    ...(catalogCommand.destructive ? { destructive: true } : {}),
    ...(catalogCommand.requiresSelection
      ? { requiresSelection: true as const }
      : {}),
    ...(catalogCommand.input !== undefined ? { input: catalogCommand.input } : {}),
    ...(catalogCommand.result !== undefined
      ? { result: catalogCommand.result }
      : {}),
    ...(catalogCommand.requiredCapabilities.length > 0
      ? { requiredCapabilities: [...catalogCommand.requiredCapabilities] }
      : {}),
    ...(catalogCommand.docsId ? { docsId: catalogCommand.docsId } : {}),
  };
}

function compareResolved(
  left: V2ResolvedContribution,
  right: V2ResolvedContribution,
): number {
  if (left.order !== right.order) return left.order - right.order;
  if (left.extensionId !== right.extensionId) {
    return left.extensionId < right.extensionId ? -1 : 1;
  }
  if (left.contributionId !== right.contributionId) {
    return left.contributionId < right.contributionId ? -1 : 1;
  }
  return 0;
}

/**
 * Resolve one render point from catalog entries. Disabled extensions
 * contribute nothing; every kept item carries fresh availability for
 * the supplied context. Pure and side-effect free: safe to call on
 * every selection/context change.
 */
export function resolveV2PointContributions(
  entries: readonly ExtensionV2CatalogEntry[],
  point: V2ContributionPoint,
  context: V2AvailabilityContext,
  state: V2ContributionResolutionState,
): V2ResolvedContribution[] {
  if (point === "interaction") return [];
  const resolved: V2ResolvedContribution[] = [];
  for (const entry of entries) {
    if (!state.isEnabled(entry.id)) continue;
    const definition: ExtensionV2Definition = {
      id: entry.id,
      name: entry.name,
      version: entry.version,
      apiVersion: 2,
      description: entry.description,
      permissions: [...entry.permissions],
      commands: entry.commands.map(toCommand),
    };
    for (const contribution of entry.contributions) {
      if (contributionPointForType(contribution.type) !== point) continue;
      const command = definition.commands.find(
        (candidate) => candidate.id === contribution.commandId,
      );
      if (!command) continue;
      const availability = evaluateV2Availability(
        definition,
        command,
        context,
        {
          enabled: true,
          capabilities: state.capabilities,
          grantedPermissions: state.grantedPermissions(entry.id),
        },
      );
      resolved.push({
        key: `v2:${entry.id}:${contribution.id}`,
        extensionId: entry.id,
        extensionName: entry.name,
        contributionId: contribution.id,
        contributionType: contribution.type,
        point,
        commandId: command.id,
        title: contribution.title ?? command.title,
        order: contribution.order ?? DEFAULT_V2_CONTRIBUTION_ORDER,
        availability,
      });
    }
  }
  resolved.sort(compareResolved);
  return resolved;
}

/**
 * Sanitize a client-supplied selection into the context shape the
 * availability evaluator consumes: non-empty string IDs, bounded to
 * the transport limit. Anything else is dropped, never trusted.
 */
export function sanitizeV2SelectionIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const cleaned = ids.filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );
  return cleaned.slice(0, MAX_V2_CONTRIBUTION_IDS);
}

/** Display title for a contribution: override, else command title. */
export function titleForV2Contribution(
  contribution: ExtensionV2Contribution,
  commandTitle: string,
): string {
  return contribution.title ?? commandTitle;
}

// --- Generic form fields (interaction point) ---

export type V2InputField = {
  name: string;
  schema: ExtensionV2ValueSchema;
  required: boolean;
  defaultValue: unknown;
};

function defaultForSchema(schema: ExtensionV2ValueSchema): unknown {
  switch (schema.kind) {
    case "none":
      return null;
    case "string":
      return schema.default ?? "";
    case "number":
      return schema.default ?? 0;
    case "boolean":
      return schema.default ?? false;
    case "enum":
      return schema.default ?? schema.values[0] ?? "";
    case "string-array":
      return schema.default ?? [];
    case "object": {
      const record: Record<string, unknown> = {};
      for (const [name, nested] of Object.entries(schema.properties)) {
        record[name] = defaultForSchema(nested);
      }
      return record;
    }
  }
}

/**
 * Derive generic field descriptors from a command input schema (data
 * only). Object schemas yield one field per property; a scalar schema
 * yields a single `value` field; `none`/absent yields no fields. The
 * generic form renderer consumes these without extension branches.
 */
export function inputFieldsForSchema(
  schema: ExtensionV2ValueSchema | undefined,
): V2InputField[] {
  if (!schema || schema.kind === "none") return [];
  if (schema.kind === "object") {
    const required = new Set(schema.required ?? []);
    return Object.entries(schema.properties).map(([name, nested]) => ({
      name,
      schema: nested,
      required: required.has(name),
      defaultValue: defaultForSchema(nested),
    }));
  }
  return [
    { name: "value", schema, required: true, defaultValue: defaultForSchema(schema) },
  ];
}

// --- Drop context (drop-menu point) ---

export type V2DropCandidate = {
  name: string;
  size?: number;
};

export type V2DropValidation =
  | { ok: true; fileCount: number }
  | { ok: false; reason: string };

/**
 * Validate a renderer-observed drop into the `dropFileCount` context
 * the availability evaluator consumes. Pure: checks presence, a
 * non-empty file name per entry, and the ID-list bound. Capability
 * checks stay in `evaluateV2Availability` (unknown capabilities deny),
 * and the app adapter additionally screens audio extensions before
 * offering drop-scope commands.
 */
export function validateV2DropCandidates(
  candidates: readonly V2DropCandidate[],
  options?: { maxFiles?: number },
): V2DropValidation {
  const maxFiles = options?.maxFiles ?? MAX_V2_CONTRIBUTION_IDS;
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "No files were dropped; drop sounds onto the target first.",
    };
  }
  if (candidates.length > maxFiles) {
    return {
      ok: false,
      reason: `Too many dropped files (${candidates.length}); at most ${maxFiles} are accepted.`,
    };
  }
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.name !== "string" || !candidate.name.trim()) {
      return {
        ok: false,
        reason: "A dropped entry has no file name; only files can be offered to extensions.",
      };
    }
  }
  return { ok: true, fileCount: candidates.length };
}
