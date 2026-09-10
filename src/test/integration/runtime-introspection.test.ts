import { describe, expect, it, vi } from "vitest";

import {
  YardExtensionHost,
  YardExtensionRegistry,
  describeYardCommand,
  type YardExtensionDefinition,
  type YardExtensionManifest,
} from "@yard-core";

import { projectCatalogEntry } from "@/lib/extensions/catalog";
import { describeCapabilities } from "@/lib/capabilities";
import { listEvents } from "@/lib/events";
import { listExtensionPoints, registerContextMenuCommand, listContextMenuCommands, clearContextMenuCommands } from "@/lib/extensions/ui-contributions";
import { validateTransportEnvelope } from "@/app/api/extensions/execute/transport";

// Local fixture standing in for a retired v1 tool: these tests pin the
// generic host/catalog machinery, not any real extension.
const fixtureManifest: YardExtensionManifest = {
  id: "fixture-shelf",
  name: "Fixture Shelf",
  provider: "Foleyard",
  version: "1.0.0",
  description: "Local fixture for runtime introspection tests.",
  category: "utility",
  permissions: ["library:read"],
  commands: [
    {
      id: "fixture-shelf.add-selected",
      title: "Add to Shelf",
      description: "Add the selection to the fixture shelf.",
      scope: "selection",
      requiresSelection: true,
    },
  ],
};

function makeHost(permissions: string[], enabled = true) {
  const registry = new YardExtensionRegistry();
  const def: YardExtensionDefinition = {
    manifest: { ...fixtureManifest, permissions: permissions as never[] },
    registerCommands: (ctx) => {
      const def0 = fixtureManifest.commands[0]!;
      ctx.services.commands.register({ ...def0, handler: () => ctx.selection.fileIds });
    },
  };
  registry.register(def);
  return new YardExtensionHost({
    registry,
    isEnabled: () => enabled,
    getSettingValue: (_e, _s, d) => d,
    services: {},
  });
}

describe("runtime introspection contracts", () => {
  it("projects serializable command descriptions without functions", () => {
    const entry = projectCatalogEntry(fixtureManifest, { enabled: true });
    expect(entry.commandIds).toContain("fixture-shelf.add-selected");
    const described = entry.commands.find((c) => c.id === "fixture-shelf.add-selected")!;
    expect(described.title).toBe("Add to Shelf");
    expect(described.requiresSelection).toBe(true);
    expect(described.executionOwner).toBe("extension-host");
    // No functions survive serialization.
    const json = JSON.parse(JSON.stringify(entry));
    expect(JSON.stringify(json)).not.toContain("handler");
    expect(describeYardCommand(fixtureManifest.commands[0]).id).toBe("fixture-shelf.add-selected");
  });

  it("declared and registered command IDs agree", async () => {
    const registry = new YardExtensionRegistry();
    registry.register({ manifest: fixtureManifest, registerCommands: () => {} });
    const host = makeHost([...fixtureManifest.permissions]);
    const outcome = await host.execute({
      extensionId: "fixture-shelf",
      commandId: "fixture-shelf.add-selected",
      selection: { fileIds: ["a", "b"] },
    });
    expect(outcome.ok).toBe(true);
  });

  it("reflects disabled extensions without executing", async () => {
    const host = makeHost([...fixtureManifest.permissions], false);
    const outcome = await host.execute({
      extensionId: "fixture-shelf",
      commandId: "fixture-shelf.add-selected",
      selection: { fileIds: ["a"] },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("extension-disabled");
  });

  it("enforces write-capable services without cooperative checks", async () => {
    // The fixture only requests library:read; markRemoved needs library:write.
    const host = makeHost(["library:read" as never]);
    const registry = new YardExtensionRegistry();
    const def: YardExtensionDefinition = {
      manifest: fixtureManifest,
      registerCommands: (ctx) => {
        ctx.services.commands.register({
          ...fixtureManifest.commands[0]!,
          handler: () => {
            ctx.services.files?.markRemoved(["x"]);
            return "done";
          },
        });
      },
    };
    registry.register(def);
    const guarded = new YardExtensionHost({
      registry,
      isEnabled: () => true,
      getSettingValue: (_e, _s, d) => d,
      services: { files: { markRemoved: vi.fn() } },
    });
    const outcome = await guarded.execute({
      extensionId: "fixture-shelf",
      commandId: "fixture-shelf.add-selected",
      selection: { fileIds: ["x"] },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("permission-denied");
    void host;
  });

  it("rejects invalid transport envelopes with controlled errors", () => {
    expect(validateTransportEnvelope(null)).toMatch(/object/);
    expect(validateTransportEnvelope([])).toMatch(/object/);
    expect(validateTransportEnvelope({})).toMatch(/extensionId/);
    expect(validateTransportEnvelope({ extensionId: "a", commandId: 42 })).toMatch(/commandId/);
    expect(validateTransportEnvelope({ extensionId: "a", commandId: "b", selection: { fileIds: "x" } })).toMatch(/fileIds/);
    expect(validateTransportEnvelope({ extensionId: "a", commandId: "b" })).toBeNull();
  });

  it("describes capabilities with availability, not just declarations", () => {
    const caps = describeCapabilities({ hasServerServices: true, desktopAvailable: false });
    const pack = caps.find((c) => c.id === "pack.export")!;
    expect(pack.availability.state).toBe("available");
    const desktop = caps.find((c) => c.owner === "desktop")!;
    expect(desktop.availability.state).toBe("unavailable");
    const renderer = caps.find((c) => c.owner === "renderer")!;
    expect(renderer.availability.state).toBe("unknown");
  });

  it("catalogs only real events and extension points", () => {
    const events = listEvents();
    expect(events.some((e) => e.id === "sound-shelf:changed")).toBe(true);
    expect(events.some((e) => e.id === "library:scan-started")).toBe(false);
    const points = listExtensionPoints();
    expect(points.some((p) => p.id === "palette.command" && p.availability.state === "available")).toBe(true);
    expect(points.some((p) => p.id === "waveform.provider" && p.availability.state === "unavailable")).toBe(true);
  });

  it("registers context-menu contributions with cleanup", () => {
    clearContextMenuCommands();
    const unregister = registerContextMenuCommand({
      id: "demo.hello",
      extensionId: "demo",
      commandId: "demo.hello",
      label: "Say hello",
      requiresSelection: true,
    });
    expect(listContextMenuCommands().map((c) => c.id)).toContain("demo.hello");
    unregister();
    expect(listContextMenuCommands().map((c) => c.id)).not.toContain("demo.hello");
    clearContextMenuCommands();
  });
});
