import {
  validateV2SettingValue,
  type ExtensionV2Setting,
} from "./definition";
import { V2OperationError, type V2ExtensionStatePorts, type V2SettingsPorts } from "./operations";
import type { V2EventBus } from "./events";

/**
 * Extension-scoped settings and persistent workflow state (Yard Core
 * context, R7).
 *
 * The host supplies the namespace; extension code never selects one.
 * Operation services (operations.ts) key settings rows per extension and
 * state blobs per extension ID, so cross-extension access is impossible
 * by construction — the stores in this module add the R7 semantics on
 * top of those same ports:
 *
 * - Author-declared settings (`V2AuthoredSettingsStore`): every read and
 *   write is validated against the extension definition's `settings`
 *   list. Unknown setting IDs reject; wrong-typed values reject; loaded
 *   persisted values that fail validation fall back to the declared
 *   default and surface a diagnosis instead of crashing or leaking a bad
 *   value. `reset(id?)` restores declared defaults. Settings are author
 *   configuration, not workflow memory.
 * - Workflow state (`V2WorkflowStateStore`): namespaced key/value memory
 *   for in-progress work, stored as a versioned envelope with bounded
 *   keys and bytes. `migrateTo` runs transactional migrations on a copy:
 *   success commits atomically, failure preserves the prior data and
 *   disables the store with an actionable diagnosis until reset or a
 *   successful migration. Legacy unversioned blobs (written before this
 *   ticket) read as version 0.
 * - Host-owned job records stay separate (jobs.ts) and are never
 *   reachable through these stores.
 *
 * Bounds and retention: at most `MAX_V2_STATE_KEYS` keys and
 * `MAX_V2_STATE_BYTES` serialized bytes per extension; settings are
 * bounded by their declarations (one row per declared setting plus
 * diagnosis rows). State persists until `reset()` or a migration
 * replaces it; there is no cross-extension listing.
 *
 * Persist-before-notify: every mutating method writes through its ports
 * first and emits its event afterwards, so subscribers that re-read on
 * receipt always observe the triggering change.
 *
 * Framework-free: no React, routes, database handles, or v1 imports.
 */

export const MAX_V2_STATE_KEYS = 128;
export const MAX_V2_STATE_BYTES = 65_536;

const STATE_ENVELOPE_MARKER = "__v2envelope";

export type V2DataDiagnosis = {
  scope: "settings" | "state";
  extensionId: string;
  reason: string;
};

/** Validate one setting value against its declaration. Null when valid. */
export type V2SettingValueCheck = string | null;

function shortSettingId(extensionId: string, settingId: string): string {
  return settingId.startsWith(`${extensionId}.`)
    ? settingId.slice(extensionId.length + 1)
    : settingId;
}

function settingKey(extensionId: string, settingId: string): string {
  return `extension:${extensionId}:setting:${extensionId}.${shortSettingId(extensionId, settingId)}`;
}

export type V2AuthoredSettingsOptions = {
  events?: V2EventBus;
};

/**
 * Validated author-declared settings over raw namespaced ports. Unknown
 * IDs and mistyped values throw `V2OperationError("input-invalid")`;
 * corrupt persisted rows read back as the declared default and appear in
 * `diagnose()`.
 */
export class V2AuthoredSettingsStore {
  constructor(
    private readonly extensionId: string,
    private readonly declarations: readonly ExtensionV2Setting[],
    private readonly ports: V2SettingsPorts,
    private readonly options?: V2AuthoredSettingsOptions,
  ) {}

  private declaration(settingId: string): ExtensionV2Setting {
    const short = shortSettingId(this.extensionId, settingId);
    const found = this.declarations.find((entry) => entry.id === short || entry.id === settingId);
    if (!found) {
      throw new V2OperationError(
        "input-invalid",
        `Setting "${settingId}" is not declared by extension "${this.extensionId}"; declared settings: ${this.declarations.map((entry) => `"${entry.id}"`).join(", ") || "none"}.`,
      );
    }
    return found;
  }

  get(settingId: string): unknown {
    const setting = this.declaration(settingId);
    const stored = this.ports.readRaw(settingKey(this.extensionId, settingId));
    if (stored === undefined) return setting.defaultValue;
    const invalid = validateV2SettingValue(setting, stored);
    return invalid ? setting.defaultValue : stored;
  }

  getAll(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const setting of this.declarations) out[setting.id] = this.get(setting.id);
    return out;
  }

  set(settingId: string, value: unknown): void {
    const setting = this.declaration(settingId);
    const invalid = validateV2SettingValue(setting, value);
    if (invalid) {
      throw new V2OperationError("input-invalid", invalid);
    }
    // Persist first; only notify after the write lands.
    this.ports.writeRaw(settingKey(this.extensionId, settingId), value);
    this.options?.events?.emit("settings-changed", this.extensionId, { keys: [settingId] });
  }

  /** Restore one setting (or every declared setting) to its declared default. */
  reset(settingId?: string): void {
    const ids =
      settingId !== undefined ? [this.declaration(settingId).id] : this.declarations.map((entry) => entry.id);
    for (const id of ids) {
      const setting = this.declaration(id);
      this.ports.writeRaw(settingKey(this.extensionId, id), setting.defaultValue);
    }
    this.options?.events?.emit("settings-changed", this.extensionId, { keys: ids });
  }

  /** Corrupt persisted rows that read back as defaults instead of their stored value. */
  diagnose(): V2DataDiagnosis[] {
    const found: V2DataDiagnosis[] = [];
    for (const setting of this.declarations) {
      const stored = this.ports.readRaw(settingKey(this.extensionId, setting.id));
      if (stored === undefined) continue;
      const invalid = validateV2SettingValue(setting, stored);
      if (invalid) {
        found.push({
          scope: "settings",
          extensionId: this.extensionId,
          reason: `Stored value for "${setting.id}" failed validation (${invalid}); reads fall back to the declared default until the setting is written again.`,
        });
      }
    }
    return found;
  }
}

export type V2WorkflowStateEnvelope = {
  [STATE_ENVELOPE_MARKER]: true;
  schemaVersion: number;
  updatedAt: string;
  data: Record<string, unknown>;
};

function isEnvelope(value: unknown): value is V2WorkflowStateEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>)[STATE_ENVELOPE_MARKER] === true
  );
}

function checkStateValue(key: string, value: unknown): void {
  try {
    const text = JSON.stringify(value);
    if (text === undefined) throw new Error("unserializable");
  } catch {
    throw new V2OperationError(
      "input-invalid",
      `State ${JSON.stringify(key)} must be JSON-serializable; functions and symbols are rejected.`,
    );
  }
}

function checkStateBounds(data: Record<string, unknown>): void {
  const keys = Object.keys(data);
  if (keys.length > MAX_V2_STATE_KEYS) {
    throw new V2OperationError(
      "input-invalid",
      `State holds ${keys.length} keys; the per-extension limit is ${MAX_V2_STATE_KEYS}. Remove unused keys.`,
    );
  }
  const bytes = JSON.stringify(data)?.length ?? Number.POSITIVE_INFINITY;
  if (bytes > MAX_V2_STATE_BYTES) {
    throw new V2OperationError(
      "input-invalid",
      `State is ${bytes} bytes; the per-extension limit is ${MAX_V2_STATE_BYTES}. Remove unused keys.`,
    );
  }
}

export type V2WorkflowStateOptions = {
  events?: V2EventBus;
  clock?: () => string;
};

/**
 * Versioned workflow state with transactional migrations. A failed
 * migration preserves the prior envelope byte-for-byte and disables the
 * store with an actionable diagnosis; writes stay disabled until
 * `reset()` or a successful `migrateTo`.
 */
export class V2WorkflowStateStore {
  private disabledDiagnosis: string | null = null;
  private readonly clock: () => string;

  constructor(
    private readonly extensionId: string,
    private readonly ports: V2ExtensionStatePorts,
    private readonly options?: V2WorkflowStateOptions,
  ) {
    this.clock = options?.clock ?? (() => new Date().toISOString());
  }

  /** Usable schema version (0 for legacy unversioned blobs), disabled flag, and diagnosis. */
  status(): { schemaVersion: number; disabled: boolean; diagnosis: string | null } {
    return {
      schemaVersion: this.loaded().schemaVersion,
      disabled: this.disabledDiagnosis !== null,
      diagnosis: this.disabledDiagnosis,
    };
  }

  read(key: string): unknown {
    if (!key.trim()) {
      throw new V2OperationError("input-invalid", "State key must be a non-empty string.");
    }
    return this.loaded().data[key];
  }

  readAll(): Record<string, unknown> {
    return { ...this.loaded().data };
  }

  write(key: string, value: unknown): void {
    this.throwIfDisabled("write");
    if (!key.trim()) {
      throw new V2OperationError("input-invalid", "State key must be a non-empty string.");
    }
    checkStateValue(key, value);
    const current = this.loaded();
    const next = { ...current.data, [key]: value };
    checkStateBounds(next);
    // Persist first; only notify after the write lands.
    this.commit(current.schemaVersion, next);
    this.options?.events?.emit("state-changed", this.extensionId, { keys: [key] });
  }

  remove(key: string): void {
    this.throwIfDisabled("remove");
    if (!key.trim()) {
      throw new V2OperationError("input-invalid", "State key must be a non-empty string.");
    }
    const current = this.loaded();
    if (!(key in current.data)) return;
    const next = { ...current.data };
    delete next[key];
    this.commit(current.schemaVersion, next);
    this.options?.events?.emit("state-changed", this.extensionId, { keys: [key] });
  }

  /**
   * Transactional migration: `migrate` runs against a copy of the
   * current data. Success commits the new version atomically; a throw
   * (or an unserializable/over-bounds result) preserves the prior
   * envelope and disables the store with the error as diagnosis.
   */
  migrateTo(
    targetVersion: number,
    migrate: (data: Record<string, unknown>) => Record<string, unknown>,
  ): { from: number; to: number } {
    const current = this.loaded();
    if (targetVersion <= current.schemaVersion) {
      throw new V2OperationError(
        "input-invalid",
        `Migration target ${targetVersion} must be newer than the stored schema version ${current.schemaVersion}.`,
      );
    }
    let next: Record<string, unknown>;
    try {
      next = migrate({ ...current.data });
      if (typeof next !== "object" || next === null || Array.isArray(next)) {
        throw new Error("migration must return a data record");
      }
      for (const [key, value] of Object.entries(next)) checkStateValue(key, value);
      checkStateBounds(next);
    } catch (error) {
      this.disabledDiagnosis =
        `Migration of "${this.extensionId}" state to version ${targetVersion} failed (${error instanceof Error ? error.message : String(error)}); ` +
        `prior version-${current.schemaVersion} data is preserved. Fix the migration and retry, or reset state explicitly.`;
      throw new V2OperationError("handler-failed", this.disabledDiagnosis);
    }
    this.commit(targetVersion, next);
    this.disabledDiagnosis = null;
    this.options?.events?.emit("state-changed", this.extensionId);
    return { from: current.schemaVersion, to: targetVersion };
  }

  /** Clear all data, reset the version to 0, and clear any disabled diagnosis. */
  reset(): void {
    this.commit(0, {});
    this.disabledDiagnosis = null;
    this.options?.events?.emit("state-changed", this.extensionId);
  }

  private throwIfDisabled(action: string): void {
    if (this.disabledDiagnosis) {
      throw new V2OperationError("handler-failed", `Cannot ${action} state: ${this.disabledDiagnosis}`);
    }
  }

  private loaded(): { schemaVersion: number; data: Record<string, unknown> } {
    const stored = this.ports.readAll(this.extensionId);
    if (isEnvelope(stored)) {
      const version = Math.max(0, Math.floor(stored.schemaVersion));
      const data = typeof stored.data === "object" && stored.data !== null && !Array.isArray(stored.data)
        ? (stored.data as Record<string, unknown>)
        : {};
      return { schemaVersion: version, data };
    }
    // Legacy unversioned blob: the whole record is version-0 data.
    // A corrupt (non-record) row reads as empty rather than throwing.
    if (typeof stored === "object" && stored !== null && !Array.isArray(stored)) {
      return { schemaVersion: 0, data: { ...(stored as Record<string, unknown>) } };
    }
    return { schemaVersion: 0, data: {} };
  }

  private commit(schemaVersion: number, data: Record<string, unknown>): void {
    const envelope: V2WorkflowStateEnvelope = {
      [STATE_ENVELOPE_MARKER]: true,
      schemaVersion,
      updatedAt: this.clock(),
      data,
    };
    this.ports.writeAll(this.extensionId, envelope as unknown as Record<string, unknown>);
  }
}
