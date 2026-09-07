// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  buildPaletteEntries,
  type PaletteEntry,
} from "@/components/CommandPalette/command-palette";
import { CommandPalette } from "@/components/CommandPalette/CommandPalette";
import { SelectionBulkBar } from "@/components/FileTable/bulk-bar";
import { FileRowMenu } from "@/components/FileTable/file-row-menu";
import type { FileTableFileRecord } from "@/components/FileTable/types";
import { ExtensionsTab } from "@/components/settings/extensions-tab";
import { Tabs } from "@/components/ui/tabs";
import { ContextMenu } from "@/components/ui/context-menu";
import {
  V2ExtensionSettings,
  type V2ExtensionSettingsEntry,
} from "@/components/extensions-v2/settings";
import { V2SelectionActions } from "@/components/extensions-v2/menus";
import {
  V2AuthoredSettingsStore,
  resolveV2PointContributions,
  toCatalogEntry,
  type ExtensionV2Catalog,
} from "@yard-core";

// Area: extension v2 R6 (#170). Real application integration: the v2
// adapters drive the actual FileRowMenu, CommandPalette,
// ExtensionsTab, and SelectionBulkBar (not a fixture page), and the
// enablement/settings routes persist through validated stores.
// Heavy persistence leaves are mocked in-memory; validation,
// resolution, and event emission stay real.

vi.mock("@/lib/db", () => ({
  getLibraryRoots: () => [],
  getFileById: () => null,
  getFilesByIds: () => [],
  getFiles: () => ({ files: [], nextCursor: null }),
  getAllCollections: () => [],
}));

vi.mock("@/lib/extensions-v2/jobs", () => ({
  getV2JobManager: () => ({ cancelExtensionJobs: vi.fn() }),
}));

vi.mock("@/lib/extensions-v2/settings-state", () => {
  const rows = new Map<string, unknown>();
  return {
    readV2SettingsRow: (key: string) => rows.get(key),
    writeV2SettingsRow: (key: string, value: unknown) => {
      rows.set(key, value);
    },
    createV2SettingsPorts: () => ({
      readRaw: (key: string) => rows.get(key),
      writeRaw: (key: string, value: unknown) => {
        rows.set(key, value);
      },
    }),
    createV2ExtensionStatePorts: () => ({
      readAll: () => ({}),
      writeAll: () => {},
    }),
    createV2AuthoredSettings: (extensionId: string, declarations: never[]) =>
      new V2AuthoredSettingsStore(extensionId, declarations, {
        readRaw: (key: string) => rows.get(key),
        writeRaw: (key: string, value: unknown) => {
          rows.set(key, value);
        },
      }),
  };
});

import { createSurfaceFixtureDefinition } from "@/lib/extensions-v2/fixtures";
import { getV2Events } from "@/lib/extensions-v2/events";
import {
  getV2Registry,
  isV2ExtensionEnabled,
  setV2ExtensionEnabled,
  unregisterV2Extension,
} from "@/lib/extensions-v2/host";
import { setV2Approval } from "@/lib/extensions-v2/policy";
import { PATCH as patchExtension } from "@/app/api/extensions-v2/extensions/[extensionId]/route";
import { GET as listExtensions } from "@/app/api/extensions-v2/extensions/route";
import { GET as getSettings } from "@/app/api/extensions-v2/settings/[extensionId]/route";
import {
  POST as resetSetting,
  PUT as putSetting,
} from "@/app/api/extensions-v2/settings/[extensionId]/[settingId]/route";

const SURFACE_ID = "fixture-surface";

function catalog(): ExtensionV2Catalog {
  return {
    apiVersion: 2,
    entries: [toCatalogEntry(createSurfaceFixtureDefinition())],
  };
}

function paletteItems() {
  return resolveV2PointContributions(catalog().entries, "palette", { fileIds: ["f1"] }, {
    isEnabled: (id) => isV2ExtensionEnabled(id),
    capabilities: {},
    grantedPermissions: () => ["library:read", "files:read", "drop:read"],
  });
}

beforeAll(() => {
  if (!getV2Registry().get(SURFACE_ID)) {
    getV2Registry().register(createSurfaceFixtureDefinition());
  }
  setV2Approval(SURFACE_ID, ["library:read", "files:read", "drop:read"]);
  setV2ExtensionEnabled(SURFACE_ID, true);
});

afterAll(() => {
  unregisterV2Extension(SURFACE_ID);
});

const demoFile: FileTableFileRecord = {
  id: "file-1",
  filename: "kick.wav",
  path: "/lib/kick.wav",
  directory: "/lib",
  format: "wav",
  duration: 1.2,
  fileSize: 44000,
  isFavorite: false,
  tags: [],
};

describe("v2 file context menu in the real FileRowMenu", () => {
  it("invokes by stable key and disappears on disable", () => {
    const onV2Command = vi.fn();
    const items = resolveV2PointContributions(
      catalog().entries,
      "context-menu",
      { fileIds: [demoFile.id] },
      {
        isEnabled: () => true,
        capabilities: {},
        grantedPermissions: () => ["library:read", "files:read", "drop:read"],
      },
    ).filter((item) => item.contributionType === "file-context-menu");
    expect(items).toHaveLength(1);
    const menuProps = {
      file: demoFile,
      menuFilename: demoFile.filename,
      handleCopyPath: async () => {},
      onToggleFavorite: async () => {},
      makePackEnabled: false,
      soundShelfEnabled: false,
      inShelf: false,
      onToggleShelf: () => {},
      allTags: [],
      onV2Command,
    };
    const { unmount } = render(
      <ContextMenu defaultOpen>
        <FileRowMenu {...menuProps} v2Items={items} />
      </ContextMenu>,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: /Inspect file/ }));
    expect(onV2Command).toHaveBeenCalledWith(
      expect.objectContaining({ key: "v2:fixture-surface:fixture-surface.file-inspect" }),
    );

    // Disable cleanup through the real path: no items, no v1 impact.
    unmount();
    render(
      <ContextMenu defaultOpen>
        <FileRowMenu {...menuProps} v2Items={[]} />
      </ContextMenu>,
    );
    expect(screen.queryByRole("menuitem", { name: /Inspect file/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Copy path/ })).toBeTruthy();
  });
});

describe("v2 palette entries in the real CommandPalette", () => {
  it("dispatches v2tool ids without touching v1 entries", () => {
    const selected: PaletteEntry[] = [];
    const onSelectEntry = (entry: PaletteEntry) => {
      selected.push(entry);
    };
    const entries = buildPaletteEntries({
      query: "",
      isPlaying: false,
      autoplay: false,
      hasCurrentFile: true,
      canStepQueue: false,
      isFavorite: false,
      shelfEnabled: false,
      toolCommands: [
        {
          extensionId: "make-pack",
          extensionName: "Make Pack",
          commandId: "make-pack.pack",
          title: "Make Pack",
        },
      ],
      v2ToolCommands: paletteItems().map((item) => ({
        extensionId: item.extensionId,
        extensionName: item.extensionName,
        commandId: item.commandId,
        title: item.title,
      })),
      sounds: [],
    });
    expect(entries.some((entry) => entry.id.startsWith("tool:make-pack:"))).toBe(true);
    const v2Entry = entries.find((entry) => entry.id.startsWith("v2tool:"));
    expect(v2Entry).toBeTruthy();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    render(
      <CommandPalette
        open
        query=""
        entries={entries}
        activeIndex={0}
        inputRef={{ current: null }}
        onQueryChange={() => {}}
        onHoverEntry={() => {}}
        onSelectEntry={onSelectEntry}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("option", { name: /Inspect selection/ }));
    expect(selected[0]!.id.startsWith("v2tool:fixture-surface:")).toBe(true);
  });
});

describe("v2 selection actions in the real SelectionBulkBar slot", () => {
  it("renders the generic adapter beside v1 bulk actions", () => {
    const onInvoke = vi.fn();
    const items = resolveV2PointContributions(
      catalog().entries,
      "selection-actions",
      { fileIds: ["a", "b"] },
      {
        isEnabled: () => true,
        capabilities: {},
        grantedPermissions: () => ["library:read", "files:read", "drop:read"],
      },
    );
    render(
      <SelectionBulkBar
        count={2}
        tags={[]}
        soundShelfEnabled={false}
        onSaveAll={() => {}}
        onAddToQueue={() => {}}
        onAddToShelf={() => {}}
        onTag={() => {}}
        onRemove={() => {}}
        bulkRemove={null}
        removeDefault="library"
        onChooseRemove={() => {}}
        onConfirmRemove={() => {}}
        onCancelRemove={() => {}}
        onClear={() => {}}
        v2Actions={<V2SelectionActions items={items} selectionCount={2} onInvoke={onInvoke} />}
      />,
    );
    expect(screen.getByRole("toolbar", { name: "Extension selection actions" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Inspect selection/ }));
    expect(onInvoke).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Save all/ })).toBeTruthy();
  });
});

describe("v2 settings section in the real ExtensionsTab", () => {
  const v2Entry: V2ExtensionSettingsEntry = {
    id: SURFACE_ID,
    name: "Fixture Surface",
    version: "0.1.0",
    description: "Surface fixture.",
    enabled: true,
    declaredPermissions: ["library:read", "files:read", "drop:read"],
    effectivePermissions: ["library:read", "files:read", "drop:read"],
    rows: [
      { declaration: createSurfaceFixtureDefinition().settings![0]!, value: "fixture" },
      { declaration: createSurfaceFixtureDefinition().settings![1]!, value: true },
    ],
  };

  it("mounts the generic adapter below v1 extensions with working controls", () => {
    const onToggle = vi.fn();
    const onUpdate = vi.fn();
    const onReset = vi.fn();
    render(
      <Tabs defaultValue="extensions" value="extensions">
        <ExtensionsTab
          extensions={[]}
          v2Settings={
            <V2ExtensionSettings
              entries={[v2Entry]}
              onToggle={onToggle}
              onUpdateSetting={onUpdate}
              onReset={onReset}
            />
          }
        />
      </Tabs>,
    );
    expect(screen.getByText("No extensions installed")).toBeTruthy();
    expect(screen.getByLabelText("Fixture Surface settings")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Disable Fixture Surface" }));
    expect(onToggle).toHaveBeenCalledWith(SURFACE_ID, false);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledWith(SURFACE_ID);
  });
});

describe("v2 enablement and settings routes", () => {
  it("PATCH disables (emitting contributions-changed) and removes resolved UI", async () => {
    const seen: string[] = [];
    const dispose = getV2Events().subscribe("contributions-changed", (payload) => {
      seen.push(`${payload.type}:${payload.extensionId}`);
    });
    const disable = await patchExtension(
      new NextRequest("http://localhost/api/extensions-v2/extensions/fixture-surface", {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      }),
      { params: Promise.resolve({ extensionId: SURFACE_ID }) },
    );
    expect(disable.status).toBe(200);
    expect(isV2ExtensionEnabled(SURFACE_ID)).toBe(false);
    expect(seen).toContain("contributions-changed:*");
    expect(paletteItems()).toEqual([]);

    const listed = (await (await listExtensions()).json()) as {
      extensions: Array<{ id: string; enabled: boolean }>;
    };
    expect(listed.extensions.find((entry) => entry.id === SURFACE_ID)?.enabled).toBe(false);

    const enable = await patchExtension(
      new NextRequest("http://localhost/api/extensions-v2/extensions/fixture-surface", {
        method: "PATCH",
        body: JSON.stringify({ enabled: true }),
      }),
      { params: Promise.resolve({ extensionId: SURFACE_ID }) },
    );
    expect(enable.status).toBe(200);
    expect(paletteItems().length > 0).toBe(true);
    dispose();
  });

  it("rejects unknown extensions and malformed bodies", async () => {
    const missing = await patchExtension(
      new NextRequest("http://localhost/api/extensions-v2/extensions/nope", {
        method: "PATCH",
        body: JSON.stringify({ enabled: true }),
      }),
      { params: Promise.resolve({ extensionId: "nope" }) },
    );
    expect(missing.status).toBe(404);
    const malformed = await patchExtension(
      new NextRequest("http://localhost/api/extensions-v2/extensions/fixture-surface", {
        method: "PATCH",
        body: JSON.stringify({ enabled: "yes" }),
      }),
      { params: Promise.resolve({ extensionId: SURFACE_ID }) },
    );
    expect(malformed.status).toBe(400);
  });

  it("reads, validates, and resets settings through declarations", async () => {
    const read = (await (
      await getSettings(new NextRequest("http://localhost/x"), {
        params: Promise.resolve({ extensionId: SURFACE_ID }),
      })
    ).json()) as {
      settings: Array<{ declaration: { id: string }; value: unknown }>;
      effectivePermissions: string[];
    };
    expect(read.effectivePermissions).toContain("library:read");
    expect(
      read.settings.find((row) => row.declaration.id === "fixture-surface.verbose")?.value,
    ).toBe(false);

    const invalid = await putSetting(
      new NextRequest("http://localhost/x", {
        method: "PUT",
        body: JSON.stringify({ value: 42 }),
      }),
      { params: Promise.resolve({ extensionId: SURFACE_ID, settingId: "fixture-surface.verbose" }) },
    );
    expect(invalid.status).toBe(400);

    const valid = await putSetting(
      new NextRequest("http://localhost/x", {
        method: "PUT",
        body: JSON.stringify({ value: true }),
      }),
      { params: Promise.resolve({ extensionId: SURFACE_ID, settingId: "fixture-surface.verbose" }) },
    );
    expect(valid.status).toBe(200);

    const reset = await resetSetting(
      new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify({}) }),
      { params: Promise.resolve({ extensionId: SURFACE_ID, settingId: "unused" }) },
    );
    expect(reset.status).toBe(200);
    const reread = (await (
      await getSettings(new NextRequest("http://localhost/x"), {
        params: Promise.resolve({ extensionId: SURFACE_ID }),
      })
    ).json()) as {
      settings: Array<{ declaration: { id: string }; value: unknown }>;
    };
    expect(
      reread.settings.find((row) => row.declaration.id === "fixture-surface.verbose")?.value,
    ).toBe(false);
  });
});
