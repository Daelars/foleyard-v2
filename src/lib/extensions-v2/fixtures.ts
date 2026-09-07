import {
  createGreeterFixtureDefinition,
  V2_EXTENSION_API_VERSION,
  type ExtensionV2Definition,
} from "@yard-core";

import { getV2Events } from "./events";
import { getV2Registry, isV2ExtensionEnabled, setV2ExtensionEnabled } from "./host";
import { setV2Approval } from "./policy";

/**
 * Development-only v2 conformance fixtures (Application context, R6).
 *
 * Unused contribution points are proved through the SAME production
 * adapters — never a fixture-only imitation: these definitions
 * register through the production registry, resolve through the
 * production `resolveV2PointContributions`, and render through the
 * production components under `src/components/extensions-v2/`. No
 * fixture ID appears in production code paths.
 *
 * - `fixture-surface`: exercises palette, file/folder context menus,
 *   selection actions, toolbar, sidebar, settings, and drop menu with
 *   one command per scope, so every point has a real adapter entry.
 * - `fixture-worker`: covers jobs, permissions, and isolated state
 *   with a long-running cancellable job command.
 *
 * Registration is explicit and dev-only: `registerV2DevFixtures()`
 * throws in production builds and registers each fixture at most once
 * (no duplicate registrations across dev reloads). Production catalogs
 * never include them; the catalog route only calls this helper when
 * `FOLEYARD_V2_DEV_FIXTURES=1` in a non-production runtime.
 */

export function createSurfaceFixtureDefinition(): ExtensionV2Definition {
  return {
    id: "fixture-surface",
    name: "Fixture Surface",
    version: "0.1.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description:
      "Conformance fixture covering every v2 UI contribution point through the production adapters.",
    permissions: ["library:read", "files:read", "drop:read"],
    commands: [
      {
        id: "fixture-surface.inspect-selection",
        title: "Inspect selection",
        description: "Describe the current Library selection.",
        scope: "selection",
        requiresSelection: true,
        result: { kind: "string" },
      },
      {
        id: "fixture-surface.inspect-file",
        title: "Inspect file",
        description: "Describe one audio file.",
        scope: "file",
        result: { kind: "string" },
      },
      {
        id: "fixture-surface.inspect-folder",
        title: "Inspect folder",
        description: "Describe one Library folder.",
        scope: "folder",
        result: { kind: "string" },
      },
      {
        id: "fixture-surface.inspect-collection",
        title: "Inspect collection",
        description: "Describe one Collection.",
        scope: "collection",
        result: { kind: "string" },
      },
      {
        id: "fixture-surface.inspect-drop",
        title: "Inspect drop",
        description: "Describe dropped files.",
        scope: "drop",
        requiredCapabilities: ["desktop.native"],
        result: { kind: "string" },
      },
      {
        id: "fixture-surface.ping",
        title: "Ping",
        description: "Global no-op proving toolbar and sidebar entries.",
        scope: "global",
        input: {
          kind: "object",
          properties: { note: { kind: "string", default: "" } },
        },
        result: { kind: "string" },
      },
    ],
    settings: [
      {
        id: "fixture-surface.note-prefix",
        label: "Note prefix",
        description: "Prefix shown before fixture notes.",
        type: "string",
        defaultValue: "fixture",
      },
      {
        id: "fixture-surface.verbose",
        label: "Verbose",
        description: "Emit extra detail in results.",
        type: "boolean",
        defaultValue: false,
      },
    ],
    contributions: [
      { id: "fixture-surface.palette-inspect", type: "command-palette", commandId: "fixture-surface.inspect-selection", order: 10 },
      { id: "fixture-surface.file-inspect", type: "file-context-menu", commandId: "fixture-surface.inspect-file", order: 10 },
      { id: "fixture-surface.folder-inspect", type: "folder-context-menu", commandId: "fixture-surface.inspect-folder", order: 10 },
      { id: "fixture-surface.selection-inspect", type: "selection-actions", commandId: "fixture-surface.inspect-selection", order: 10 },
      { id: "fixture-surface.toolbar-ping", type: "toolbar", commandId: "fixture-surface.ping", title: "Ping", order: 10 },
      { id: "fixture-surface.sidebar-recent", type: "sidebar", commandId: "fixture-surface.ping", title: "Recent pings", order: 10 },
      { id: "fixture-surface.settings-entry", type: "settings", commandId: "fixture-surface.ping", title: "Surface settings", order: 10 },
      { id: "fixture-surface.drop-inspect", type: "drop-menu", commandId: "fixture-surface.inspect-drop", order: 10 },
    ],
    docsRefs: [{ id: "commands", title: "Command authoring" }],
  };
}

export function createWorkerFixtureDefinition(): ExtensionV2Definition {
  return {
    id: "fixture-worker",
    name: "Fixture Worker",
    version: "0.1.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description:
      "Conformance fixture for jobs, permissions, and isolated workflow state.",
    permissions: ["library:read", "settings:read", "settings:write"],
    commands: [
      {
        id: "fixture-worker.count-library",
        title: "Count Library",
        description: "Count Library records through a cancellable job.",
        scope: "global",
        result: { kind: "string" },
      },
    ],
    settings: [
      {
        id: "fixture-worker.batch-size",
        label: "Batch size",
        description: "Records per progress step.",
        type: "number",
        defaultValue: 100,
      },
    ],
    contributions: [
      { id: "fixture-worker.palette-count", type: "command-palette", commandId: "fixture-worker.count-library", order: 20 },
      { id: "fixture-worker.toolbar-count", type: "toolbar", commandId: "fixture-worker.count-library", title: "Count", order: 20 },
    ],
    docsRefs: [{ id: "commands", title: "Command authoring" }],
  };
}

export function devFixturesEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.FOLEYARD_V2_DEV_FIXTURES === "1"
  );
}

function approveAll(definition: ExtensionV2Definition): void {
  setV2Approval(definition.id, definition.permissions);
}

/**
 * Register both fixtures plus the greeter through the production
 * registry, approve their declared permissions explicitly (never
 * auto-granted elsewhere — this helper IS the explicit policy call),
 * and enable them. Throws in production; registers each ID at most
 * once so dev reloads never duplicate entries.
 */
export function registerV2DevFixtures(): string[] {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Dev fixtures must never register in production builds.");
  }
  const registry = getV2Registry();
  const registered: string[] = [];
  for (const definition of [
    createGreeterFixtureDefinition(),
    createSurfaceFixtureDefinition(),
    createWorkerFixtureDefinition(),
  ]) {
    if (!registry.get(definition.id)) {
      registry.register(definition);
      approveAll(definition);
      setV2ExtensionEnabled(definition.id, true);
      registered.push(definition.id);
    } else if (!isV2ExtensionEnabled(definition.id)) {
      setV2ExtensionEnabled(definition.id, true);
    }
  }
  if (registered.length > 0) {
    getV2Events().emit("contributions-changed", "*");
  }
  return registered;
}
