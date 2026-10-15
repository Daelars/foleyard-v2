import { describe, expect, it } from "vitest";

import type { ExtensionV2CatalogEntry } from "@yard-core";

import { buildV2SettingsCatalog, type V2SettingsReadSource } from "./settings-read";

// Area: #295. The batched settings read builds one entry per registered
// extension. A per-extension read failure or a corrupt stored row must
// stay in the list as a visible `degraded` entry, never be filtered out
// into a silently empty panel.

function catalogEntry(overrides: Partial<ExtensionV2CatalogEntry> = {}): ExtensionV2CatalogEntry {
  return {
    id: "make-pack-v2",
    name: "Make Pack v2",
    version: "1.0.0",
    description: "Export packs.",
    permissions: ["files:write"],
    declaredPermissions: ["files:write", "library:read"],
    commands: [],
    settings: [
      {
        id: "copy-on-drop",
        label: "Copy on drop",
        type: "boolean",
        defaultValue: false,
      },
    ],
    contributions: [],
    docsRefs: [],
    ...overrides,
  };
}

function source(
  overrides: Partial<V2SettingsReadSource> = {},
): V2SettingsReadSource {
  return {
    entries: [catalogEntry()],
    isEnabled: () => true,
    readSettings: (_extensionId, declarations) => ({
      rows: declarations.map((declaration) => ({
        declaration,
        value: declaration.defaultValue,
      })),
      degradedReason: null,
    }),
    ...overrides,
  };
}

describe("buildV2SettingsCatalog", () => {
  it("projects the declared/effective permission split and settings rows", () => {
    const [entry] = buildV2SettingsCatalog(source());

    expect(entry).toMatchObject({
      id: "make-pack-v2",
      enabled: true,
      status: "ready",
      error: null,
      declaredPermissions: ["files:write", "library:read"],
      effectivePermissions: ["files:write"],
    });
    expect(entry!.settings).toEqual([
      {
        declaration: expect.objectContaining({ id: "copy-on-drop" }),
        value: false,
      },
    ]);
  });

  it("keeps a failed extension as a degraded entry instead of dropping it", () => {
    const [entry] = buildV2SettingsCatalog(
      source({
        readSettings: () => {
          throw new Error("database is locked");
        },
      }),
    );

    expect(entry).toMatchObject({
      id: "make-pack-v2",
      name: "Make Pack v2",
      status: "degraded",
    });
    expect(entry!.error).toContain("database is locked");
    expect(entry!.settings).toEqual([]);
  });

  it("flags a corrupt stored row as degraded while still reading the row", () => {
    const [entry] = buildV2SettingsCatalog(
      source({
        readSettings: (_extensionId, declarations) => ({
          rows: declarations.map((declaration) => ({
            declaration,
            value: declaration.defaultValue,
          })),
          degradedReason:
            'Stored value for "copy-on-drop" failed validation; reads fall back to the default.',
        }),
      }),
    );

    expect(entry!.status).toBe("degraded");
    expect(entry!.error).toContain("failed validation");
    expect(entry!.settings).toHaveLength(1);
  });

  it("isolates a failure so sibling extensions still read ready", () => {
    const entries = buildV2SettingsCatalog(
      source({
        entries: [
          catalogEntry(),
          catalogEntry({ id: "sound-shelf-v2", name: "Sound Shelf v2" }),
        ],
        readSettings: (extensionId, declarations) => {
          if (extensionId === "make-pack-v2") throw new Error("boom");
          return {
            rows: declarations.map((declaration) => ({
              declaration,
              value: declaration.defaultValue,
            })),
            degradedReason: null,
          };
        },
      }),
    );

    expect(entries.map((entry) => [entry.id, entry.status])).toEqual([
      ["make-pack-v2", "degraded"],
      ["sound-shelf-v2", "ready"],
    ]);
  });
});
