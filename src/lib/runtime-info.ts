import {
  computeEffectiveV2Permissions,
  V2_EXTENSION_API_STANDING,
  V2PermissionApprovals,
} from "@yard-core";
import { describeCapabilities } from "@/lib/capabilities";
import { listEvents } from "@/lib/events";
import { getV2Registry, isV2ExtensionEnabled } from "@/lib/extensions-v2/host";
import { getSettingsSchemaRefs } from "@/lib/settings-schema";
import { getDatabaseVersionInfo } from "@/lib/database/migrations";
import { getDatabasePath } from "@/lib/database-path";
import { getDocumentationLocation } from "@/lib/documentation";

import packageJson from "../../package.json";
import corePackageJson from "../../packages/yard-core/package.json";

/**
 * Read-only server runtime inspection.
 * Feature status: shipped. Contract: internal (DTO schemaVersion 1).
 * Never executes extension handlers and never initializes or migrates
 * the database to answer identity questions: v2 approvals are read
 * through a short-lived read-only SQLite handle only when the database
 * file already exists, and degrade to unknown otherwise. Never includes
 * secrets, grant tokens, env, raw DB objects, settings values, private
 * library paths or stack traces. Version 1 extensions are retired; the
 * snapshot reports the version 2 system only.
 */

export type RuntimeSnapshot = {
  schemaVersion: 1;
  observedAt: string;
  identity: {
    product: "Foleyard";
    version: string;
    coreVersion: string;
    buildId?: string;
    sourceRevision?: string;
    sourceDirty?: boolean;
    environment: "development" | "production";
    mode: "web" | "desktop";
    packaged?: boolean;
    platform?: string;
  };
  providers: Array<{ owner: "server" | "renderer" | "desktop"; status: "present" | "absent" | "failed"; observedAt?: string }>;
  database: { state: "ready" | "not-initialized" | "unavailable"; migration: "unversioned" | "versioned"; appliedVersion?: number };
  capabilities: ReturnType<typeof describeCapabilities>;
  events: ReturnType<typeof listEvents>;
  settingsSchemaRefs: string[];
  documentation?: ReturnType<typeof getDocumentationLocation>;
  extensionsV2: Array<{
    id: string;
    name: string;
    version: string;
    source: "bundled";
    registered: boolean;
    enabled: boolean;
    apiVersion: number;
    standing: "internal";
    declaredPermissions: string[];
    effectivePermissions: string[];
    approvalsKnown: boolean;
    commandIds: string[];
    commands: Array<{
      id: string;
      title: string;
      scope: string;
      requiresSelection: boolean;
      requiredCapabilities: string[];
    }>;
    contributions: Array<{ id: string; type: string; commandId: string }>;
    settings: Array<{ id: string; type: string; defaultValue: unknown }>;
    docsRefs: Array<{ id: string; title: string }>;
  }>;
  eventsV2: Array<{ type: string; owner: "host"; docsId: string }>;
  limitations: string[];
};

function readBuildId(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    const candidate = path.join(process.cwd(), ".next", "BUILD_ID");
    if (fs.existsSync(candidate)) {
      const raw = fs.readFileSync(candidate, "utf8").trim();
      return raw || undefined;
    }
  } catch {
    // absence is explicit, not fatal
  }
  return undefined;
}

/**
 * Read-only settings-flag read for introspection.
 *
 * Opens the existing database file with a short-lived read-only
 * handle and closes it before returning. Never creates, migrates, or
 * writes: a missing or unreadable file degrades to unknown (null
 * approvals) instead of throwing. `databasePath` is overridable so
 * tests can point at a disposable file.
 */
export function readRuntimeDatabaseFlags(databasePath: string = getDatabasePath()): {
  filePresent: boolean;
  approvals: V2PermissionApprovals | null;
} {
  const empty = {
    filePresent: false,
    approvals: null as V2PermissionApprovals | null,
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    if (!fs.existsSync(databasePath)) return empty;
  } catch {
    return empty;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require("better-sqlite3") as new (
      path: string,
      options?: { readonly?: boolean },
    ) => {
      prepare: (sql: string) => {
        get: (...params: unknown[]) => { key: string; value: string } | undefined;
      };
      close: () => void;
    };
    const handle = new BetterSqlite3(databasePath, { readonly: true });
    try {
      let approvals: V2PermissionApprovals | null = null;
      const approvalsRow = handle
        .prepare("SELECT key, value FROM settings WHERE key = ?")
        .get("v2:approvals");
      if (approvalsRow?.value) {
        try {
          const candidate = new V2PermissionApprovals();
          candidate.restore(JSON.parse(approvalsRow.value) as unknown);
          approvals = candidate;
        } catch {
          approvals = null;
        }
      } else {
        approvals = new V2PermissionApprovals();
      }
      return { filePresent: true, approvals };
    } finally {
      handle.close();
    }
  } catch {
    return { ...empty, filePresent: true };
  }
}

export function getServerRuntimeSnapshot(): RuntimeSnapshot {
  const db = getDatabaseVersionInfo();

  // v2 identity comes from the production registry only. Reading a
  // definition never runs its handler; effective permissions are the
  // declared set intersected with the read-only approvals restore.
  const flags = readRuntimeDatabaseFlags();
  const v2Definitions = getV2Registry().list();
  const extensionsV2 = v2Definitions.map((definition) => {
    const granted = flags.approvals
      ? flags.approvals.grantedPermissions(definition.id)
      : [];
    return {
      id: definition.id,
      name: definition.name,
      version: definition.version,
      source: "bundled" as const,
      registered: true,
      enabled: isV2ExtensionEnabled(definition.id),
      apiVersion: definition.apiVersion,
      standing: V2_EXTENSION_API_STANDING,
      declaredPermissions: [...definition.permissions],
      effectivePermissions: computeEffectiveV2Permissions(definition.permissions, granted),
      approvalsKnown: flags.approvals !== null,
      commandIds: definition.commands.map((command) => command.id),
      commands: definition.commands.map((command) => ({
        id: command.id,
        title: command.title,
        scope: command.scope,
        requiresSelection: command.requiresSelection ?? false,
        requiredCapabilities: [...(command.requiredCapabilities ?? [])],
      })),
      contributions: (definition.contributions ?? []).map((contribution) => ({
        id: contribution.id,
        type: contribution.type,
        commandId: contribution.commandId,
      })),
      settings: (definition.settings ?? []).map((setting) => ({
        id: setting.id,
        type: setting.type,
        defaultValue: setting.defaultValue,
      })),
      docsRefs: (definition.docsRefs ?? []).map((ref) => ({ id: ref.id, title: ref.title })),
    };
  });

  return {
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    identity: {
      product: "Foleyard",
      version: (packageJson as { version: string }).version,
      coreVersion: (corePackageJson as { version: string }).version,
      buildId: readBuildId(),
      sourceRevision: process.env.FOLEYARD_SOURCE_REVISION,
      sourceDirty: process.env.FOLEYARD_SOURCE_DIRTY === "true" ? true : undefined,
      environment: process.env.NODE_ENV === "production" ? "production" : "development",
      mode: process.env.FOLEYARD_DESKTOP === "1" ? "desktop" : "web",
      packaged: process.env.FOLEYARD_DESKTOP === "1" ? undefined : false,
      platform: process.platform,
    },
    providers: [
      { owner: "server", status: "present", observedAt: new Date().toISOString() },
      { owner: "renderer", status: "absent" },
      { owner: "desktop", status: process.env.FOLEYARD_DESKTOP === "1" ? "present" : "absent" },
    ],
    database: db,
    capabilities: describeCapabilities({ hasServerServices: true, desktopAvailable: process.env.FOLEYARD_DESKTOP === "1" }),
    events: listEvents(),
    settingsSchemaRefs: getSettingsSchemaRefs(),
    documentation: getDocumentationLocation(),
    extensionsV2,
    eventsV2: [
      { type: "settings-changed", owner: "host" as const, docsId: "events" },
      { type: "state-changed", owner: "host" as const, docsId: "events" },
      { type: "approvals-changed", owner: "host" as const, docsId: "events" },
      { type: "job-transition", owner: "host" as const, docsId: "events" },
      { type: "contributions-changed", owner: "host" as const, docsId: "events" },
    ],
    limitations: [
      "Bundled Node extensions are trusted code; service wrappers do not sandbox direct Node imports.",
      "No external extension loading, marketplace, or third-party code loader.",
      "Renderer session state (shortcuts, selection, media) is unknown server-side.",
      "Extension v2 is internal and bundled-only: no marketplace, external code loader, or public stability promise.",
      "v2 operation services do not sandbox direct Node imports; import rules are enforced at build time, not at runtime.",
      "v2 job cancellation is cooperative: the host records the request, work stops between operations.",
      "v2 per-command availability needs a live selection; the snapshot reports declared capabilities, not live verdicts.",
      "v2 approvals read unknown when the database file is absent; the snapshot never creates it.",
    ],
  };
}
