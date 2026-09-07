import {
  KNOWN_V2_COMMAND_SCOPES,
  KNOWN_V2_CONTRIBUTION_TYPES,
  KNOWN_V2_PERMISSIONS,
  KNOWN_V2_SETTING_TYPES,
  checkV2SchemaShape,
  isKnownV2Permission,
  type ExtensionV2Command,
  type ExtensionV2Contribution,
  type ExtensionV2Definition,
  type ExtensionV2Setting,
} from "./definition";
import {
  ExtensionV2RegistrationError,
  type ExtensionV2Diagnostic,
  type ExtensionV2DiagnosticCode,
} from "./diagnostics";
import { SUPPORTED_V2_API_VERSIONS } from "./version";
import {
  toCatalogEntry,
  type ExtensionV2Catalog,
} from "./catalog";

const EXTENSION_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const PACKAGE_VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function blank(value: unknown): value is "" | null | undefined {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && !value.trim())
  );
}

function padded(value: string): boolean {
  return value.trim() !== value;
}

class Collector {
  readonly diagnostics: ExtensionV2Diagnostic[] = [];

  add(
    code: ExtensionV2DiagnosticCode,
    message: string,
    extensionId?: string,
    entryId?: string,
  ): void {
    this.diagnostics.push({ code, message, extensionId, entryId });
  }

  throwIfAny(): void {
    if (this.diagnostics.length > 0) {
      throw new ExtensionV2RegistrationError(this.diagnostics);
    }
  }
}

function checkRequiredString(
  collector: Collector,
  extensionId: string | undefined,
  field: string,
  value: unknown,
  entryId?: string,
): value is string {
  if (typeof value !== "string" || blank(value)) {
    collector.add(
      "malformed-extension-field",
      `Extension ${JSON.stringify(extensionId ?? "?")} has an empty ${field}; provide a non-empty value.`,
      extensionId,
      entryId,
    );
    return false;
  }
  if (padded(value)) {
    collector.add(
      "malformed-extension-field",
      `Extension ${JSON.stringify(extensionId ?? "?")} field ${field} has surrounding whitespace; trim it to ${JSON.stringify(value.trim())}.`,
      extensionId,
      entryId,
    );
    return false;
  }
  return true;
}

function defaultMatchesType(setting: ExtensionV2Setting): string | null {
  const { type, defaultValue } = setting;
  switch (type) {
    case "boolean":
      return typeof defaultValue === "boolean"
        ? null
        : `expects a boolean default but got ${typeof defaultValue}.`;
    case "string":
    case "path":
      return typeof defaultValue === "string"
        ? null
        : `expects a string default but got ${typeof defaultValue}.`;
    case "number":
      return typeof defaultValue === "number" &&
        Number.isFinite(defaultValue)
        ? null
        : `expects a finite number default but got ${String(defaultValue)}.`;
    case "enum":
      return typeof defaultValue === "string"
        ? null
        : `expects a string default (one of its options) but got ${typeof defaultValue}.`;
  }
}

function validateCommand(
  collector: Collector,
  extensionId: string,
  command: ExtensionV2Command,
  seenCommandIds: Set<string>,
): void {
  const entryId = typeof command?.id === "string" ? command.id : undefined;
  if (
    !checkRequiredString(collector, extensionId, "command.id", command?.id)
  ) {
    return;
  }
  const id = command.id;
  if (seenCommandIds.has(id)) {
    collector.add(
      "duplicate-command-id",
      `Extension "${extensionId}" declares command ID "${id}" more than once; rename or remove the duplicate.`,
      extensionId,
      id,
    );
  } else {
    seenCommandIds.add(id);
  }
  if (!id.startsWith(`${extensionId}.`)) {
    collector.add(
      "unowned-command-id",
      `Command "${id}" is not owned by extension "${extensionId}"; prefix it with "${extensionId}." (e.g. "${extensionId}.${id.replace(/^.*\./, "")}").`,
      extensionId,
      id,
    );
  }
  checkRequiredString(collector, extensionId, "command.title", command.title, id);
  checkRequiredString(
    collector,
    extensionId,
    "command.description",
    command.description,
    id,
  );
  if (
    !(KNOWN_V2_COMMAND_SCOPES as readonly string[]).includes(command.scope)
  ) {
    collector.add(
      "unsupported-command-scope",
      `Command "${id}" uses unsupported scope ${JSON.stringify(command.scope)}; use one of: ${KNOWN_V2_COMMAND_SCOPES.join(", ")}.`,
      extensionId,
      id,
    );
  }
  for (const capability of command.requiredCapabilities ?? []) {
    if (blank(capability)) {
      collector.add(
        "malformed-command",
        `Command "${id}" lists an empty required capability; remove it or name a capability ID.`,
        extensionId,
        id,
      );
    }
  }
  if (command.input !== undefined) {
    const shapeError = checkV2SchemaShape(
      command.input,
      `command "${id}" input schema`,
    );
    if (shapeError) {
      collector.add("malformed-schema", shapeError, extensionId, id);
    }
  }
  if (command.result !== undefined) {
    const shapeError = checkV2SchemaShape(
      command.result,
      `command "${id}" result schema`,
    );
    if (shapeError) {
      collector.add("malformed-schema", shapeError, extensionId, id);
    }
  }
}

function validateSetting(
  collector: Collector,
  extensionId: string,
  setting: ExtensionV2Setting,
  seenSettingIds: Set<string>,
): void {
  const entryId =
    typeof setting?.id === "string" ? setting.id : undefined;
  if (
    !checkRequiredString(collector, extensionId, "setting.id", setting?.id)
  ) {
    return;
  }
  const id = setting.id;
  if (seenSettingIds.has(id)) {
    collector.add(
      "duplicate-setting-id",
      `Extension "${extensionId}" declares setting ID "${id}" more than once; rename or remove the duplicate.`,
      extensionId,
      id,
    );
  } else {
    seenSettingIds.add(id);
  }
  if (!id.startsWith(`${extensionId}.`)) {
    collector.add(
      "unowned-setting-id",
      `Setting "${id}" is not owned by extension "${extensionId}"; prefix it with "${extensionId}." so the host can namespace persisted values.`,
      extensionId,
      id,
    );
  }
  checkRequiredString(collector, extensionId, "setting.label", setting.label, id);
  if (!(KNOWN_V2_SETTING_TYPES as readonly string[]).includes(setting.type)) {
    collector.add(
      "malformed-setting-options",
      `Setting "${id}" uses unsupported type ${JSON.stringify(setting.type)}; use one of: ${KNOWN_V2_SETTING_TYPES.join(", ")}.`,
      extensionId,
      id,
    );
    return;
  }
  if (setting.type === "enum") {
    const options = setting.options ?? [];
    if (
      options.length === 0 ||
      options.some(
        (option) =>
          typeof option?.label !== "string" ||
          !option.label.trim() ||
          typeof option?.value !== "string" ||
          !option.value.trim(),
      )
    ) {
      collector.add(
        "malformed-setting-options",
        `Setting "${id}" is an enum with no usable options; declare at least one option with a non-empty label and value.`,
        extensionId,
        id,
      );
    } else if (
      typeof setting.defaultValue === "string" &&
      !options.some((option) => option.value === setting.defaultValue)
    ) {
      collector.add(
        "malformed-setting-default",
        `Setting "${id}" defaults to ${JSON.stringify(setting.defaultValue)} which is not one of its options (${options.map((option) => JSON.stringify(option.value)).join(", ")}).`,
        extensionId,
        id,
      );
      return;
    }
  } else if (setting.options !== undefined) {
    collector.add(
      "malformed-setting-options",
      `Setting "${id}" of type "${setting.type}" must not declare options; options are only valid for enum settings.`,
      extensionId,
      id,
    );
  }
  const mismatch = defaultMatchesType(setting);
  if (mismatch) {
    collector.add(
      "malformed-setting-default",
      `Setting "${id}" ${mismatch}`,
      extensionId,
      id,
    );
  }
}

function validateContribution(
  collector: Collector,
  extensionId: string,
  contribution: ExtensionV2Contribution,
  seenContributionIds: Set<string>,
  commandIds: Set<string>,
): void {
  const entryId =
    typeof contribution?.id === "string" ? contribution.id : undefined;
  if (
    !checkRequiredString(
      collector,
      extensionId,
      "contribution.id",
      contribution?.id,
    )
  ) {
    return;
  }
  const id = contribution.id;
  if (seenContributionIds.has(id)) {
    collector.add(
      "duplicate-contribution-id",
      `Extension "${extensionId}" declares contribution ID "${id}" more than once; rename or remove the duplicate.`,
      extensionId,
      id,
    );
  } else {
    seenContributionIds.add(id);
  }
  if (!id.startsWith(`${extensionId}.`)) {
    collector.add(
      "unowned-contribution-id",
      `Contribution "${id}" is not owned by extension "${extensionId}"; prefix it with "${extensionId}." so disable/unregister removes exactly this extension's UI.`,
      extensionId,
      id,
    );
  }
  if (
    !(KNOWN_V2_CONTRIBUTION_TYPES as readonly string[]).includes(
      contribution.type,
    )
  ) {
    collector.add(
      "unsupported-contribution-type",
      `Contribution "${id}" uses unsupported type ${JSON.stringify(contribution.type)}; use one of: ${KNOWN_V2_CONTRIBUTION_TYPES.join(", ")}.`,
      extensionId,
      id,
    );
  }
  if (
    typeof contribution.commandId !== "string" ||
    !commandIds.has(contribution.commandId)
  ) {
    collector.add(
      "unresolved-command-ref",
      `Contribution "${id}" references unknown command ${JSON.stringify(contribution.commandId)}; declare that command in the same definition.`,
      extensionId,
      id,
    );
  }
}

function validateDefinition(definition: ExtensionV2Definition): void {
  const collector = new Collector();
  const extensionId =
    typeof definition?.id === "string" ? definition.id : undefined;

  if (
    !checkRequiredString(collector, extensionId, "id", definition?.id)
  ) {
    collector.throwIfAny();
  }
  const id = definition.id;
  if (!EXTENSION_ID_PATTERN.test(id)) {
    collector.add(
      "malformed-extension-id",
      `Extension ID ${JSON.stringify(id)} is not a valid namespace; use lowercase letters, digits, and hyphens (e.g. "make-pack-v2").`,
      id,
    );
  }
  checkRequiredString(collector, id, "name", definition.name);
  if (checkRequiredString(collector, id, "version", definition.version)) {
    if (!PACKAGE_VERSION_PATTERN.test(definition.version)) {
      collector.add(
        "malformed-extension-version",
        `Extension "${id}" version ${JSON.stringify(definition.version)} is not a package version; use major.minor.patch (e.g. "0.1.0"). The package version never substitutes for apiVersion.`,
        id,
      );
    }
  }
  checkRequiredString(collector, id, "description", definition.description);

  if (
    typeof definition.apiVersion !== "number" ||
    !(SUPPORTED_V2_API_VERSIONS as readonly number[]).includes(
      definition.apiVersion,
    )
  ) {
    const received =
      definition.apiVersion === 1
        ? '1, which is the v1 extension contract — v1 definitions stay on the v1 host and are never registered here'
        : JSON.stringify(definition.apiVersion);
    collector.add(
      "unsupported-api-version",
      `Extension "${id}" targets unsupported API version ${received}; supported v2 versions: ${SUPPORTED_V2_API_VERSIONS.join(", ")}. See version.ts for the API/product/runtime version rules.`,
      id,
    );
  }

  for (const permission of definition.permissions ?? []) {
    if (!isKnownV2Permission(permission)) {
      collector.add(
        "unknown-permission",
        `Extension "${id}" requests unknown permission ${JSON.stringify(permission)}; known v2 permissions: ${KNOWN_V2_PERMISSIONS.join(", ")}.`,
        id,
      );
    }
  }

  if (!Array.isArray(definition.commands) || definition.commands.length === 0) {
    collector.add(
      "no-commands",
      `Extension "${id}" declares no commands; declare at least one command so registration has observable behavior.`,
      id,
    );
  }

  const seenCommandIds = new Set<string>();
  for (const command of definition.commands ?? []) {
    validateCommand(collector, id, command, seenCommandIds);
  }

  const seenSettingIds = new Set<string>();
  for (const setting of definition.settings ?? []) {
    validateSetting(collector, id, setting, seenSettingIds);
  }

  const seenContributionIds = new Set<string>();
  for (const contribution of definition.contributions ?? []) {
    validateContribution(
      collector,
      id,
      contribution,
      seenContributionIds,
      seenCommandIds,
    );
  }

  const seenDocsRefIds = new Set<string>();
  for (const docsRef of definition.docsRefs ?? []) {
    if (
      !checkRequiredString(collector, id, "docsRef.id", docsRef?.id)
    ) {
      continue;
    }
    if (
      !checkRequiredString(
        collector,
        id,
        "docsRef.title",
        docsRef?.title,
        docsRef.id,
      )
    ) {
      continue;
    }
    if (seenDocsRefIds.has(docsRef.id)) {
      collector.add(
        "duplicate-docs-ref-id",
        `Extension "${id}" declares docs reference ID "${docsRef.id}" more than once; rename or remove the duplicate.`,
        id,
        docsRef.id,
      );
    } else {
      seenDocsRefIds.add(docsRef.id);
    }
  }

  for (const [hook, ref] of Object.entries(definition.lifecycle ?? {}) as Array<
    [string, { commandId?: unknown } | undefined]
  >) {
    if (
      typeof ref?.commandId !== "string" ||
      !seenCommandIds.has(ref.commandId)
    ) {
      collector.add(
        "unresolved-command-ref",
        `Lifecycle hook "${hook}" references unknown command ${JSON.stringify(ref?.commandId)}; point it at a command declared in the same definition or remove the hook.`,
        id,
      );
    }
  }

  collector.throwIfAny();
}

function cloneDefinition(
  definition: ExtensionV2Definition,
): ExtensionV2Definition {
  return JSON.parse(JSON.stringify(definition)) as ExtensionV2Definition;
}

/**
 * Registry for v2 extension definitions. One explicit `register` entry per
 * extension package; no host branches, no fixture-ID special cases. All
 * definitions pass `validateDefinition` before they are stored, and every
 * rejection carries actionable diagnostics.
 */
export class ExtensionV2Registry {
  private readonly definitions = new Map<string, ExtensionV2Definition>();

  register(definition: ExtensionV2Definition): void {
    validateDefinition(definition);
    if (this.definitions.has(definition.id)) {
      throw new ExtensionV2RegistrationError([
        {
          code: "duplicate-extension-id",
          message: `Extension "${definition.id}" is already registered; unregister it first or choose a different namespace.`,
          extensionId: definition.id,
        },
      ]);
    }
    this.definitions.set(definition.id, cloneDefinition(definition));
  }

  has(extensionId: string): boolean {
    return this.definitions.has(extensionId);
  }

  unregister(extensionId: string): void {
    this.definitions.delete(extensionId);
  }

  get(extensionId: string): ExtensionV2Definition | undefined {
    const definition = this.definitions.get(extensionId);
    return definition ? cloneDefinition(definition) : undefined;
  }

  ids(): string[] {
    return Array.from(this.definitions.keys());
  }

  list(): ExtensionV2Definition[] {
    return Array.from(this.definitions.values(), cloneDefinition);
  }

  /** Serializable projection of every registered definition. */
  buildCatalog(): ExtensionV2Catalog {
    return {
      apiVersion: SUPPORTED_V2_API_VERSIONS[0]!,
      entries: Array.from(this.definitions.values(), toCatalogEntry),
    };
  }
}
