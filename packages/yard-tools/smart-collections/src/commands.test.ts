import { describe, expect, it, vi } from "vitest";
import type { CollectionService } from "yard-core";
import { YardExtensionHost, YardExtensionRegistry } from "yard-core";

import { registerCommands } from "./commands";
import { manifest } from "./manifest";

function createCollections(
  createSmartCollection: CollectionService["createSmartCollection"],
): CollectionService {
  return {
    getAllCollections: () => [],
    createCollection: () => "regular",
    createSmartCollection,
    renameCollection: () => undefined,
    updateCollectionFilter: () => undefined,
    deleteCollection: () => undefined,
    attachFileToCollection: () => undefined,
    detachFileFromCollection: () => undefined,
    convertToRegularCollection: () => undefined,
  };
}

function createHost(options?: {
  enabled?: boolean;
  collections?: CollectionService;
}) {
  const registry = new YardExtensionRegistry();
  registry.register({ manifest, registerCommands });

  return new YardExtensionHost({
    registry,
    isEnabled: () => options?.enabled ?? true,
    getSettingValue: (_extensionId, _settingId, defaultValue) => defaultValue,
    services: options?.collections
      ? { collections: options.collections }
      : undefined,
  });
}

describe("Smart Collections commands", () => {
  it("saves search criteria through the supported Collection capability", async () => {
    const createSmartCollection = vi.fn(() => "smart-id");

    await expect(
      createHost({
        collections: createCollections(createSmartCollection),
      }).execute({
        extensionId: "smart-collections",
        commandId: "smart-collections.save-search",
        input: { name: "Impacts", filter: { q: "impact" } },
      }),
    ).resolves.toEqual({ ok: true, type: "value", value: "smart-id" });
    expect(createSmartCollection).toHaveBeenCalledWith(
      "Impacts",
      JSON.stringify({ q: "impact" }),
    );
  });

  it("reports a missing Collection capability", async () => {
    await expect(
      createHost().execute({
        extensionId: "smart-collections",
        commandId: "smart-collections.save-search",
        input: { name: "Impacts", filter: { q: "impact" } },
      }),
    ).resolves.toMatchObject({ ok: false, reason: "execution-failed" });
  });

  it("does not save when the Extension is disabled", async () => {
    await expect(
      createHost({ enabled: false }).execute({
        extensionId: "smart-collections",
        commandId: "smart-collections.save-search",
        input: { name: "Impacts", filter: { q: "impact" } },
      }),
    ).resolves.toMatchObject({ ok: false, reason: "extension-disabled" });
  });

  it("reports repository failures", async () => {
    await expect(
      createHost({
        collections: createCollections(() => {
          throw new Error("database unavailable");
        }),
      }).execute({
        extensionId: "smart-collections",
        commandId: "smart-collections.save-search",
        input: { name: "Impacts", filter: { q: "impact" } },
      }),
    ).resolves.toMatchObject({ ok: false, reason: "execution-failed" });
  });
});
