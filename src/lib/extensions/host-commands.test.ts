import { registerGrant, resolveWritablePath, resolveReadablePath } from "@/lib/filesystem-boundary";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { YardExtensionHost, YardExtensionRegistry } from "yard-core";

import {
  manifest as dropRulesManifest,
  registerCommands as registerDropRulesCommands,
} from "@foleyard/drop-rules";
import {
  manifest as folderJanitorManifest,
  registerCommands as registerFolderJanitorCommands,
} from "@foleyard/folder-janitor";
import {
  manifest as libraryGathererManifest,
  registerCommands as registerLibraryGathererCommands,
} from "@foleyard/library-gatherer";
import {
  manifest as makePackManifest,
  registerCommands as registerMakePackCommands,
} from "@foleyard/make-pack";
import {
  manifest as smartCollectionsManifest,
  registerCommands as registerSmartCollectionsCommands,
} from "@foleyard/smart-collections";
import {
  InMemorySoundShelfStore,
  manifest as soundShelfManifest,
  registerCommands as registerSoundShelfCommands,
} from "@foleyard/sound-shelf";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createTempFile(root: string, filename = "Hit.wav") {
  const filePath = path.join(root, filename);
  fs.writeFileSync(filePath, "sound");
  return { id: "one", filename, path: filePath };
}

function createHost() {
  const registry = new YardExtensionRegistry();
  const shelfStore = new InMemorySoundShelfStore();
  shelfStore.setFileIds(["kick.wav"]);

  registry.register({
    manifest: soundShelfManifest,
    registerCommands: (context) =>
      registerSoundShelfCommands(context, shelfStore),
  });
  registry.register({
    manifest: makePackManifest,
    registerCommands: registerMakePackCommands,
  });
  registry.register({
    manifest: dropRulesManifest,
    registerCommands: registerDropRulesCommands,
  });
  registry.register({
    manifest: folderJanitorManifest,
    registerCommands: registerFolderJanitorCommands,
  });
  registry.register({
    manifest: libraryGathererManifest,
    registerCommands: registerLibraryGathererCommands,
  });
  registry.register({
    manifest: smartCollectionsManifest,
    registerCommands: registerSmartCollectionsCommands,
  });

  return new YardExtensionHost({
    registry,
    isEnabled: () => true,
    getSettingValue: (_extensionId, _settingId, defaultValue) => defaultValue,
    services: {
      filesystem: { resolveReadablePath: (candidate, allowRoot = true) => resolveReadablePath(candidate, tempDirectories, { allowRoot }), resolveWritablePath: async (candidate) => { for (const directory of tempDirectories) { const grant = await registerGrant(directory); const resolved = await resolveWritablePath(candidate, grant.grantToken); if (resolved) return resolved; } return null; } },
      files: { markRemoved: vi.fn() },
      collections: {
        getAllCollections: () => [],
        createCollection: () => "regular",
        createSmartCollection: () => "smart-id",
        renameCollection: () => undefined,
        updateCollectionFilter: () => undefined,
        deleteCollection: () => undefined,
        attachFileToCollection: () => undefined,
        detachFileFromCollection: () => undefined,
        convertToRegularCollection: () => undefined,
      },
    },
  });
}

const allManifests = [
  soundShelfManifest,
  makePackManifest,
  dropRulesManifest,
  folderJanitorManifest,
  libraryGathererManifest,
  smartCollectionsManifest,
];

describe("registered Extension command set", () => {
  it("covers every registered command through the host", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "host-commands-"));
    tempDirectories.push(root);
    const dropFile = createTempFile(root);
    const targetDirectory = path.join(root, "drop-target");
    const stagingDirectory = path.join(root, "staging");
    const gatherDestination = path.join(root, "gathered");
    const packFile = {
      ...dropFile,
      duration: null,
      format: "wav",
      fileSize: 5,
    };
    const emptyFolder = path.join(root, "empty-folder");
    fs.mkdirSync(emptyFolder, { recursive: true });

    const host = createHost();
    const covered = new Set<string>();

    async function check(
      extensionId: string,
      commandId: string,
      options?: Omit<Parameters<typeof host.execute>[0], "extensionId" | "commandId">,
    ) {
      const outcome = await host.execute({
        extensionId,
        commandId,
        ...options,
      } as Parameters<typeof host.execute>[0]);
      expect(
        outcome,
        `${commandId} should resolve through the host`,
      ).not.toMatchObject({ reason: "command-not-found" });
      expect(outcome).not.toMatchObject({ reason: "extension-not-found" });
      covered.add(commandId);
      return outcome;
    }

    await expect(
      check("sound-shelf", "sound-shelf.add-selected", {
        selection: { fileIds: ["snare.wav"] },
      }),
    ).resolves.toMatchObject({ ok: true, type: "value" });
    await expect(
      check("sound-shelf", "sound-shelf.remove-selected", {
        selection: { fileIds: ["kick.wav"] },
      }),
    ).resolves.toMatchObject({ ok: true, type: "value" });
    await expect(
      check("sound-shelf", "sound-shelf.clear"),
    ).resolves.toMatchObject({ ok: true, type: "value" });
    await expect(
      check("sound-shelf", "sound-shelf.list"),
    ).resolves.toMatchObject({ ok: true, type: "value" });

    await expect(
      check("make-pack", "make-pack.from-selection", {
        selection: { fileIds: ["one"] },
      }),
    ).resolves.toMatchObject({
      ok: true,
      type: "ui-intent",
      intent: { type: "make-pack.open" },
    });
    await expect(
      check("make-pack", "make-pack.from-shelf"),
    ).resolves.toMatchObject({
      ok: true,
      type: "ui-intent",
      intent: { type: "make-pack.open" },
    });
    await expect(
      check("make-pack", "make-pack.from-recent"),
    ).resolves.toMatchObject({
      ok: true,
      type: "ui-intent",
      intent: { type: "make-pack.open" },
    });
    await expect(
      host.execute({
        extensionId: "make-pack",
        commandId: "make-pack.from-shelf",
        input: {
          files: [packFile],
          destinationDirectory: path.join(root, "packs"),
          packName: "host-pack",
          outputFormat: "folder",
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      type: "value",
      value: { ok: true, fileCount: 1 },
    });

    await expect(
      check("drop-rules", "drop-rules.open-settings"),
    ).resolves.toMatchObject({ ok: true, type: "ui-intent" });
    await expect(
      check("drop-rules", "drop-rules.preview", {
        selection: { fileIds: ["one"] },
        input: { targetDirectory, files: [dropFile] },
      }),
    ).resolves.toMatchObject({ ok: true, type: "value" });
    await expect(
      check("drop-rules", "drop-rules.apply", {
        selection: { fileIds: ["one"] },
        input: { targetDirectory, files: [dropFile] },
      }),
    ).resolves.toMatchObject({ ok: true, type: "value" });
    await expect(
      check("drop-rules", "drop-rules.prepare-drag", {
        selection: { fileIds: ["one"] },
        input: { file: dropFile, stagingDirectory },
      }),
    ).resolves.toMatchObject({ ok: true, type: "value" });

    await expect(
      check("folder-janitor", "folder-janitor.scan-library"),
    ).resolves.toMatchObject({ ok: true, type: "ui-intent" });
    await expect(
      check("folder-janitor", "folder-janitor.scan-folder", {
        selection: { folderPath: root },
      }),
    ).resolves.toMatchObject({ ok: true, type: "ui-intent" });
    await expect(
      check("folder-janitor", "folder-janitor.remove-files", {
        selection: { fileIds: ["one"] },
      }),
    ).resolves.toMatchObject({ ok: true, type: "value" });
    await expect(
      check("folder-janitor", "folder-janitor.delete-folders", {
        input: { paths: [emptyFolder], libraryRoots: [root] },
      }),
    ).resolves.toMatchObject({ ok: true, type: "value" });

    await expect(
      check("library-gatherer", "library-gatherer.preview-gather", {
        input: {
          sourceDirectories: ["missing-source"],
          destinationDirectory: gatherDestination,
        },
      }),
    ).resolves.toMatchObject({ ok: true, type: "value" });
    await expect(
      check("library-gatherer", "library-gatherer.gather", {
        input: {
          sourceDirectories: ["missing-source"],
          destinationDirectory: gatherDestination,
        },
      }),
    ).resolves.toMatchObject({ ok: true, type: "value" });

    await expect(
      check("smart-collections", "smart-collections.save-search", {
        input: { name: "Impacts", filter: { q: "impact" } },
      }),
    ).resolves.toMatchObject({
      ok: true,
      type: "value",
      value: "smart-id",
    });

    const registered = new Set(
      allManifests.flatMap((manifest) =>
        manifest.commands.map((command) => command.id),
      ),
    );
    expect(covered).toEqual(registered);
  });
});
